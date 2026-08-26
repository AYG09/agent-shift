# Wave 0 Foundation HANDOFF

## 1. baseline commit / branch / worktree

- baseline: `b789b28` (엔지니어링 문서·작업지시서 baseline commit)
- Foundation handoff commit: `a59c7d1`
- branch: `wave0/sop-foundation`
- worktree: `C:\Users\USER\Desktop\NOCODE\agent-shift` (단일 writer, 단일 worktree)
- Wave 1 여섯 worktree는 모두 `a59c7d1`에서 분기했다.

## 2. changed files

신규:

```text
src/lib/sop-member-intake.ts
src/lib/sop-work-map-draft.ts
src/lib/sop-node-authoring-contract.ts
src/lib/sop-node-markdown.ts
src/components/sop/SopMemberRouteGuard.tsx
src/server/sop/sop-standard-draft-prompt.ts
tests/sop-member-intake-domain.test.ts
tests/sop-work-map-domain.test.ts
tests/sop-node-authoring-domain.test.ts
```

수정:

```text
src/lib/sop-types.ts                      # additive: executionSpec / agentInstruction / instructionContractVersion
src/lib/sop-step-common-schema.ts         # additive: executionSpec (엄격)
src/lib/sop-schemas.ts                    # wire 관대 버전 + 게이트 Mission + terminal 정규화
src/lib/sop-document-schema.ts            # 저장 스키마 additive + terminal 금지 필드 확장
src/lib/sop-prototype-store.ts            # intake·추천·Work Map 상태와 persist v6
src/lib/sop-task-library.ts               # findTaskLibraryTaskById 추가
src/server/sop/sop-prompt.ts              # 표준안 prompt 추출(무동작변경)
src/server/sop/sop-standard-draft-runner.ts  # import 경로만 변경
src/app/api/sop/standard-drafts/route.ts  # import 경로만 변경 (아래 §8 참고)
package.json                              # test:sop에 Foundation 도메인 테스트 3개 등록
```

## 3. 충족한 SPEC requirement · test ID

- `REQ-CTX-004`, `REQ-WM-001`~`REQ-WM-006`, `INT-WM-001`~`INT-WM-003`
- `REQ-NODE-001`~`REQ-NODE-005`, `REQ-AOP-001`~`REQ-AOP-004`
- `TST-STATE-001`~`TST-STATE-006` (도메인·Store 수준. 화면 전이는 Wave 1A/1B가 완성)
- `TST-REC-001`, `TST-REC-003`~`TST-REC-005` (도메인 수준)
- `TST-WM-001`~`TST-WM-008`
- `TST-NODE-001`~`TST-NODE-008`, `TST-AOP-001`~`TST-AOP-006`

## 4. Wave 1이 사용할 public API

### 4.1 구성원 intake — `@/lib/sop-member-intake`

```ts
validateMemberIdentity(input: Partial<SopMember>): MemberIdentityValidation
authenticateMemberSession(member, now): PrototypeMemberSession
isAuthenticated(session) / isSameMember(a, b)
normalizeWorkContext(text) / isSubmittableContext(text) / computeContextKey(text)
selectAuthoritativeWorkContext(context): string      // 추천·생성이 함께 읽는 원문
hasUnconfirmedContextChange(context)
describeContextConfirmationImpact({ context, recommendation, hasWorkMapDraft })
confirmMemberContext({ context, recommendation, hasWorkMapDraft, now })
isStaleRecommendationResponse(current, responseContextKey)
migrateMemberIntakeState({ taskRecommendationInput, context })
resolveIntakeRouteAccess(route, guardState): IntakeRouteDecision
resolvePostLoginRoute(guardState): SopIntakeRoute
SOP_INTAKE_ROUTES / LEGACY_SAMPLE_CONTEXT_SENTENCE / REQUIRED_MEMBER_IDENTITY_FIELDS
```

Session A 호출 예:

```ts
const result = useSopPrototypeStore.getState().submitMemberIdentity(formValues);
if (!result.ok) return setFieldErrors(result.fieldErrors);   // 첫 키로 focus 이동
navigate(SOP_INTAKE_ROUTES.context);
```

```ts
const submitted = useSopPrototypeStore.getState().submitMemberContext();
if (!submitted) return setError('업무맥락을 입력하세요.');
navigate(SOP_INTAKE_ROUTES.recommendation);   // API 호출은 Session B의 책임
```

### 4.2 추천 상태 — Store actions

```ts
beginTaskRecommendationRequest(contextKey): boolean   // false면 이미 보낸 요청이다 (중복 방지)
applyTaskRecommendations(contextKey, candidates): boolean  // false면 stale 응답
failTaskRecommendation(contextKey, error): boolean
cancelTaskRecommendation(): void
confirmRecommendedTask(taskId): boolean               // 명시적 확정만 Work Map을 만든다
```

Session B 호출 예:

```ts
const { contextKey } = state.taskRecommendation;
if (!contextKey || !store.beginTaskRecommendationRequest(contextKey)) return;  // 중복 호출 차단
const response = await recommendTasksViaApi(...);
if (!store.applyTaskRecommendations(contextKey, response.candidates)) return;  // stale이면 폐기
```

후보 catalog는 `getTaskLibraryJobByRole(member.jobRole)`로 만든다. `confidence`/확률
필드는 request·response·UI 어디에도 추가하지 않는다.

### 4.3 Work Map 공용 controller — `@/lib/sop-work-map-draft`

selector: `selectWorkMapActivities`, `selectWorkMapActivity`, `selectWorkMapRelationCount`,
`selectSimpleWorkMapRows`, `selectDetailedWorkMapActivity`

mutation(순수): `updateWorkMapTask`, `updateWorkMapActivity`, `addWorkMapActivity`,
`deleteWorkMapActivity`, `moveWorkMapActivity`, `updateWorkMapSkill`, `addWorkMapSkill`,
`deleteWorkMapSkill`

검증·확정: `validateWorkMapDraft`, `confirmWorkMapDraft`

생성 연결: `toWorkLibrarySelection(draft)` → 기존 `runSopSetupGeneration` 입력

Store에는 같은 이름의 action이 있다. **Session C/D는 Store action만 호출한다** —
순수 함수를 직접 호출해 자체 상태에 담지 않는다.

```ts
const rows = selectSimpleWorkMapRows(useSopPrototypeStore((s) => s.workMapDraft)!);
useSopPrototypeStore.getState().updateWorkMapActivity(activityId, { description });
const result = useSopPrototypeStore.getState().confirmWorkMap();
if (!result?.ok) focusField(result!.errors[0]);
```

주의: 모든 mutation은 `confirmed`를 해제한다. 뷰 전환은 어떤 상태도 바꾸지 않는다.
Activity 순서의 원본은 **배열 위치**이며 `order`는 그로부터 재계산된다.

### 4.4 node 작성 계약 — `@/lib/sop-node-authoring-contract`, `@/lib/sop-node-markdown`

```ts
SOP_NODE_INSTRUCTION_CONTRACT_VERSION = 'node-authoring-v1'
SOP_DECISION_SOURCE_TYPES / SOP_DATA_ACCESS_SCOPES        // 값 집합 SSOT
SopAgentInstructionSpec / SopNodeExecutionSpec            // 타입
SopAgentInstructionSpecSchema / SopNodeExecutionSpecSchema        // 게이트·저장용(엄격)
SopAgentInstructionSpecWireSchema / SopNodeExecutionSpecWireSchema // 와이어용(관대)
createToolRegistry(entries) / EMPTY_TOOL_REGISTRY
validateSopNodeAuthoring(input): SopNodeQualityReport
formatSopNodeQualityIssues(issues): string[]
renderSopNodeMarkdown(input): string                      // 단방향 투영, parser 없음
```

Session E/F 호출 예:

```ts
const report = validateSopNodeAuthoring({
    agentInstruction: normalized.agentInstruction,
    steps: normalized.steps,
    groundingTexts: [taskDefinition, ...activityDescriptions, memberContext],
    toolRegistry,               // 미정이면 EMPTY_TOOL_REGISTRY (모든 tool ID가 미등록 처리)
    requireExecutionSpec: true,
});
if (!report.ok) { /* repair 1회 → 그래도 남으면 오류/human-review로 표면화 */ }
```

blocking 코드: `missing-execution-spec`, `missing-actor-role`, `missing-action`,
`terminal-has-execution-spec`, `decision-missing-criteria`,
`unobservable-decision-condition`, `ungrounded-threshold`, `unknown-tool-id`,
`data-access-scope-not-allowed`, `high-impact-tool-without-approval`,
`forbidden-action-allowed`

warning 코드: `missing-mission`, `ambiguous-expression`, `passive-voice`,
`compound-action`, `undefined-abbreviation`, `definition-repeats-title`,
`unobservable-completion-criteria`, `missing-escalation-evidence`,
`unresolved-escalation-role`

수치 근거 판정은 **모델이 붙인 `sourceType` 라벨이 아니라 `groundingTexts`에 그 표현이
실제로 등장하는지**로 한다. 라벨은 자기 증명이 되지 못하기 때문이다.

### 4.5 route guard — `@/components/sop/SopMemberRouteGuard`

```tsx
<SopMemberRouteGuard route={SOP_INTAKE_ROUTES.context} navigate={router.replace}>
    <SopMemberContextForm />
</SopMemberRouteGuard>
```

`navigate`는 prop으로 주입한다(기존 SOP 컴포넌트 규칙). 복원(hydration) 완료 전에는
어떤 이동도 하지 않으므로 새로고침 시 로그인 화면으로 튕기지 않는다.

## 5. persistence version과 migration truth table

persist key `sop-prototype-storage`, **version 5 → 6**.

| legacy `taskRecommendationInput` | legacy `context` | v6 `memberContext.draft` | `legacyCandidates` | `confirmedText` |
|---|---|---|---|---|
| 비어 있음 | 비어 있음 | `''` | 없음 | 없음 |
| 비어 있음 | fixture 샘플 문장 | `''` | 없음 | 없음 |
| 비어 있음 | 사용자 작성 문장 | 사용자 작성 문장 | 없음 | 없음 |
| 사용자 작성 | 비어 있음 | 추천 입력 | 없음 | 없음 |
| 사용자 작성 | fixture 샘플 문장 | 추천 입력 | 없음 | 없음 |
| 사용자 작성 | 다른 사용자 문장 | 추천 입력 | `[context 원문]` | 없음 |

그 외 v6 규칙:

- `memberSession`은 **항상** `anonymous`로 마이그레이션된다. 저장된 `memberInfo`
  샘플은 로그인 폼 빠른 입력값일 뿐 인증 근거가 아니다.
- `taskRecommendation`은 `idle`, `workMapDraft`는 `null`로 시작한다.
- `context` / `taskRecommendationInput`은 남지만 **`memberContext.draft`의 미러**다.
  두 값이 서로 달라지는 상태는 만들어지지 않는다.
- 기존 `document`, `workLibrary`, `setupConfig`, `customerReviewMode`,
  `lastSavedTimestamp`, `memberInfo`는 v5 규칙 그대로 보존된다.
- `structureVersion`과 마찬가지로 `instructionContractVersion`도 마이그레이션이
  legacy 문서에 소급해 찍지 않는다.

## 6. 실행한 명령과 결과

| 명령 | 결과 |
|---|---|
| `npx tsx tests/sop-member-intake-domain.test.ts` | PASS |
| `npx tsx tests/sop-work-map-domain.test.ts` | PASS |
| `npx tsx tests/sop-node-authoring-domain.test.ts` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS (오류·경고 0) |
| `npm run verify:quality` | PASS (7개 규칙 · 170개 파일) |
| `npm run verify:sop-customer` | PASS (`src/app/api/ai/route.ts` 기존 WARN 유지) |
| `npm run test:sop` | PASS |
| `npm run test:sop-demo` | PASS |
| `npm run build` | PASS |
| `git diff --check` | 이상 없음 |

## 7. 실패 명령의 원문 오류

없음.

## 8. 통합 요청 / 주의 사항

1. `src/app/api/sop/standard-drafts/route.ts`의 **import 경로 한 줄**이 바뀌었다
   (`@/server/sop/sop-prompt` → `@/server/sop/sop-standard-draft-prompt`). 이 파일은
   Session F 소유이므로, F는 이 한 줄이 이미 반영된 상태에서 시작한다. 동작 변경은 없다.
2. `package.json`의 `test:sop`에 Foundation 도메인 테스트 3개가 추가됐다.
3. Store의 `context` / `taskRecommendationInput` 미러는 **Wave 2가 정리할 호환 계층**이다.
   Wave 1 세션은 새 API(`memberContext`, `submitMemberContext`)만 사용한다.

## 9. Claude 디자인 기능 사용 여부

**사용하지 않았다.** Wave 0은 도메인·스키마·컨트롤러 계층이며 화면을 만들지 않는다
(01_WAVE0_FOUNDATION.md의 "수정 금지: 모든 page와 최종 UI 컴포넌트"). 디자인 검토
의무는 UI 세션 A~D와 Wave 3에 있다.

## 10. 미완료·보류

- 실제 tool registry 내용은 보류 범위다. 현재 `EMPTY_TOOL_REGISTRY`는 "등록된 tool이
  없다"는 뜻이며 모든 tool ID를 미등록으로 취급한다. 조직 registry가 정해지기 전까지
  생성 측이 `allowedToolIds`를 비워 두는 것이 정상 상태다.
- semantic lint는 정규식 기반 후보 탐색이다. 그래서 문장 규칙은 대부분 warning이며,
  repair 후에도 남으면 사람 검토로 표면화해야 한다 (Session E/F 책임).
- 화면 전이(`TST-STATE-001`/`002`의 브라우저 수준), 로딩 도움말, 추천 API 호출,
  두 Work Map 화면은 Wave 1 범위다.
- `/sop/setup` 연결과 legacy 미러 제거는 Wave 2 범위다.

## 11. 건드리지 않은 보호 파일

`src/app/flow/**`, `src/components/flow/**`, `src/app/api/ai/route.ts`,
`src/components/sop/SopSetupGate.tsx`, `src/components/sop/SopMemberHome.tsx`,
`src/components/sop/WorkLibrarySelector.tsx`, `src/components/sop/SopTaskRecommendationPanel.tsx`,
`src/app/api/sop/task-recommendations/route.ts`, `src/server/sop/sop-generation-runner.ts`,
`src/lib/sop-standard-draft-schemas.ts` — 모두 변경 0건.

## 12. commit / push

- commit: `a59c7d1` (사용자가 현재 요청에서 local commit을 명시적으로 승인함)
- push: **하지 않음** (별도 승인 필요)
