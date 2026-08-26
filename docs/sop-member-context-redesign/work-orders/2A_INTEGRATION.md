# 보완 지시서 2A — Wave 2 통합 (미완료분)

이 문서는 **Wave 2 integration owner 세션 전용** 보완 지시서다. `08_WAVE2_INTEGRATION.md`를
대체하지 않고, 이미 끝난 부분을 확정하고 **남은 부분만** 지시한다.

작업 worktree: `C:\Users\USER\Desktop\NOCODE\agent-shift` (branch `wave0/sop-foundation`)

## 판정: 부분 통합

08의 통합 순서는 `Foundation → E → F → A → B → C → D → Home/Gate`다. 현재 **B·C·D만**
반영되어 있고 **E·F·A와 Home/Gate 연결이 통째로 빠져 있다.**

### 이미 끝난 것 (그대로 유지, 다시 손대지 말 것)

- Wave 1B: `src/app/sop/recommendation/`, `SopTaskRecommendationFlow.tsx`,
  `SopRecommendationLoading.tsx`, `src/lib/sop-task-recommendation-meta.ts`,
  `src/lib/sop-task-recommendation.ts`(signal/fetchImpl 추가), `tests/sop-task-recommendation-flow.test.tsx`
- Wave 1C/1D: `src/app/sop/work-map/{simple,detailed}/`, 네 개 뷰·drawer 컴포넌트,
  `tests/sop-work-map-{simple,detailed}.test.tsx`
- `src/lib/sop-setup-actions.ts`의 `confirmWorkMapAndProceed` — simple/detailed가 각자 갖고
  있던 `confirm → toWorkLibrarySelection → navigate('/sop/setup')` 3중 로직을 한 곳으로 모은
  것. 지시했던 중복 seam 정리가 정확히 이 형태로 처리됐다.
- `package.json`의 1B·1C·1D 테스트 등록

### 빠진 것

| 항목 | 현재 상태 |
|---|---|
| Wave 1E 개인 SOP node 생성 | 통합 0건 (`sop-normalizer.ts`·`sop-generation-runner.ts`에 `executionSpec` 문자열 0회, `tests/sop-node-authoring-generation.test.ts` 없음) |
| Wave 1F 대표 표준안 | 통합 0건 (`sanitizeStandardDraftSource`/`standardizationIssues` 0회, `tests/sop-standard-draft-node-contract.test.ts` 없음) |
| Wave 1A 로그인·업무맥락 | 통합 0건 (`src/app/sop/login/`, `src/app/sop/context/`, 두 컴포넌트, 테스트 전부 없음) |
| Home/Gate/legacy 연결 (08 §통합 지시 1·3·4) | 미착수 (`src/app/sop/page.tsx`, `SopMemberHome.tsx`, `SopSetupGate.tsx`, `SopTaskRecommendationPanel.tsx`, `WorkLibrarySelector.tsx` 변경 0건) |
| 수용 시나리오 12개 (08 §실행 가능한 수용 시나리오) | 미작성 (`tests/sop-customer-scenario.test.ts` 변경 0건) |
| 최종 게이트 `npm run build`, `verify:sop-customer -- --final`, `-- --scenario-final` | 미실행 |

### 지금 게이트가 통과하는 이유를 완료 근거로 삼지 말 것

`npm run test:sop`, `tsc --noEmit`, `lint`, `verify:quality`, `verify:sop-customer`는 현재 전부
통과한다. **통합되지 않은 세션의 테스트 파일이 저장소에 없기 때문**이다. 초록불이 남은 작업이
없다는 뜻이 아니다.

실제 사용자 흐름은 지금 **진입 자체가 불가능하다**: `/sop/recommendation`의 route guard는
미인증 사용자를 `SOP_INTAKE_ROUTES.login`(`/sop/login`)으로 보내는데 그 route가 존재하지
않는다. 로그인·업무맥락 화면이 없으니 `authenticated + submitted context` 상태를 만들 방법도
없고, 결과적으로 새 Work Map 화면에도 도달할 수 없다.

---

## 남은 통합 작업

Wave 1 세 세션의 결과물은 각 worktree에 **커밋되지 않은 상태로 그대로 살아 있다.** 아래 경로에서
파일을 가져오고, 각 단계 직후 소유 테스트와 `npx tsc --noEmit`을 통과시킨 뒤 다음 단계로 간다.

### 단계 1 — Wave 1E 개인 SOP node 생성

원본: `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1e-member-node-generation`

```text
src/server/sop/sop-prompt.ts                  (수정)
src/server/sop/sop-generation-runner.ts       (수정)
src/lib/sop-normalizer.ts                     (수정)
tests/sop-node-authoring-generation.test.ts   (신규)
tests/sop-subaction-agentization.test.ts      (수정)
```

검증: `npx tsx tests/sop-node-authoring-generation.test.ts`,
`npx tsx tests/sop-subaction-agentization.test.ts`, `npx tsc --noEmit`

### 단계 2 — Wave 1F 대표 표준안

원본: `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1f-standard-draft-generation`

```text
src/server/sop/sop-standard-draft-prompt.ts     (수정)
src/server/sop/sop-standard-draft-runner.ts     (수정)
src/lib/sop-standard-draft-schemas.ts           (수정)
src/app/api/sop/standard-drafts/route.ts        (수정)
tests/sop-standard-draft-node-contract.test.ts  (신규)
```

**`src/lib/sop-normalizer.ts`는 1E와 1F의 diff가 바이트 단위로 동일하다** (1E-1 보완으로 정렬
완료). 단계 1에서 이미 적용했으므로 여기서 다시 적용하지 말고, 두 worktree의 해당 파일이
서로 같은지 `diff`로 확인만 하라. 내용이 다르면 그것은 회귀이므로 중단하고 보고하라.

검증: `npx tsx tests/sop-standard-draft-node-contract.test.ts`,
`npx tsx tests/sop-hr-analytics.test.ts`, `npx tsc --noEmit`

### 단계 3 — Wave 1A 로그인·업무맥락

원본: `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1a-login-context`

```text
src/app/sop/login/page.tsx                   (신규)
src/app/sop/context/page.tsx                 (신규)
src/components/sop/SopMemberLoginGate.tsx    (신규)
src/components/sop/SopMemberContextForm.tsx  (신규)
tests/sop-member-login-context.test.tsx      (신규)
```

검증: `npx tsx tests/sop-member-login-context.test.tsx`, `npx tsc --noEmit`

### 단계 4 — `package.json` 테스트 등록

`test:sop`에 다음 세 개를 추가한다(1B·1C·1D는 이미 등록되어 있고,
`sop-subaction-agentization`은 기존 등록을 그대로 쓴다).

```text
tests/sop-member-login-context.test.tsx
tests/sop-node-authoring-generation.test.ts
tests/sop-standard-draft-node-contract.test.ts
```

### 단계 5 — Home/Gate/legacy 연결 (08 §통합 지시 1·3·4)

이 단계가 이번 보완의 실제 목적이다. 소유 파일은 `src/app/sop/page.tsx`,
`SopMemberHome.tsx`, `SopSetupGate.tsx`, `SopTaskRecommendationPanel.tsx`,
`WorkLibrarySelector.tsx`, `src/lib/sop-setup-actions.ts`다.

1. **진입 연결**: 비로그인 사용자의 첫 Task 생성 진입은 `/sop/login`이다. 로그인한 사용자의
   `/sop` Home은 기존 현황·다른 생성 경로(동료/과거 문서)·승인 추적을 그대로 보존한다.
   `/sop` 진입 시 `memberSession.status`로 분기하되, hydration 완료 전에는 이동하지 않는다
   (`SopMemberRouteGuard`/`useSopStoreHydrated`가 이미 그 규칙을 갖고 있다).
2. **Task 기반 생성 경로 재배선**: Home의 `Task 기반 생성` 카드는 이제 `/sop/setup`의 혼합
   화면이 아니라 새 순차 흐름(`/sop/context` 또는 진행 상태에 맞는 지점)으로 들어가야 한다.
   `resolvePostLoginRoute`(sop-member-intake.ts)가 이미 그 판단을 제공한다.
3. **Setup Gate 축소**: `/sop/setup`이 로그인·추천·T/A/S 편집·업무맥락을 다시 한 화면에
   중복시키지 않게 한다. Work Map이 확정된 상태에서 진입하면 기존
   `runSopSetupGeneration`과 Task-wide 생성 설정을 재사용하는 생성 단계로 동작해야 한다.
   고급 설정은 기본값 유지 + 접힘. 이번 요구에 없는 설정 제거는 하지 않는다.
   old deep link에는 안전한 compatibility redirect 또는 명확한 resume 경로를 제공한다.
4. **legacy 중복 정리**: `SopTaskRecommendationPanel`과 `WorkLibrarySelector`가 새 흐름과
   이중 source of truth가 되지 않게 한다. 다른 생성 경로(동료/과거 문서)가 이들을 쓰고
   있으면 삭제하지 말고 adapter/compatibility mode로 보존한다.
5. **단일 업무맥락 종단 연결**: Store의 `context` / `taskRecommendationInput` 미러를
   authoritative 입력처럼 쓰는 UI가 남아 있지 않게 한다. 추천 request와 SOP 생성 request가
   같은 원문을 쓴다는 것을 assertion으로 증명한다(아래 시나리오 9).
6. dead code 제거는 모든 caller와 테스트를 확인한 뒤 **마지막 단계에서만** 한다.

### 단계 6 — 실행 가능한 수용 시나리오

`tests/sop-customer-scenario.test.ts`(또는 목적에 맞는 실행 테스트)에 08의 12개 시나리오를
구현한다. 소스 문자열 검색으로 대체하지 않는다.

1. anonymous → login validation → context
2. context submit → recommendation request 정확히 1회
3. loading → validated recommendations
4. 추천 성공만으로 Task 미확정
5. 명시적 confirm → member-owned Work Map snapshot
6. simple 편집 → detailed 반영, detailed 편집 → simple drawer 반영
7. Task Library 원본 불변
8. Work Map confirm → 모든 Activity를 포함한 generation request
9. 동일 context 문자열이 recommendation과 generation에 사용됨
10. generation success → Workspace
11. recommendation/generation failure 후 입력 보존·재시도
12. 기존 colleague/own-prior/approval/HR 시나리오 회귀 없음

---

## 최종 검증

```bash
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:quality
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
git diff --check
git status --short
```

`npm run build` 이후 `npx tsc --noEmit`이 `.next/types/app/api/ai/route.ts`에서
`getAsIsPrompt` 관련 오류를 내면 그것은 `src/app/api/ai/route.ts`가 route 파일에서 비-route
심볼을 export하는 **baseline 구조** 때문이다. 이 파일은 Wave 2 소유이므로 이번에 처리해도
되지만, 고칠 경우 `/flow`의 모든 action 회귀 테스트(`npm run test:shapes`,
`npm run test:flow-branches`)를 함께 실행해 증명하라. 고치지 않을 경우 알려진 한계로 보고하라.

## 하지 말 것

- 이미 통합된 1B·1C·1D 결과물과 `confirmWorkMapAndProceed` 재설계
- `src/app/flow/**`, `src/components/flow/**`, `/flow`의 prompt·schema·응답 동작 변경
- 생산 인증·DB·vector DB·audit log·agent executor 신설
- 고객 요구와 무관한 대규모 refactor
- `src/app/api/ai/route.ts`를 SOP 연결에 꼭 필요하지 않은데 수정하는 것

## handoff에 포함할 것

08의 HANDOFF 형식에 더해 다음을 명시한다.

1. 이번에 추가로 통합한 세션과 각 단계의 테스트 결과
2. `src/lib/sop-normalizer.ts`가 1E/1F 양쪽과 동일함을 확인한 근거
3. Home/Gate/legacy 연결에서 내린 결정과 old deep link 호환 방식
4. 12개 수용 시나리오의 PASS/FAIL과 미구현 항목
5. 최종 명령 전체의 PASS/FAIL, 실패 시 원문 오류
6. `/flow` 변경 0건 또는 공용 route 변경 시 회귀 증거
7. Wave 3가 검증할 URL·fixture·dev command·알려진 한계

명시적 권한 없이는 commit·push하지 않는다.
