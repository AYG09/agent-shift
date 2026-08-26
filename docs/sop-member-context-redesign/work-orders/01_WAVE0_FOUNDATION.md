# 작업지시서 01 — Wave 0 Foundation

## 임무

구성원 intake, 추천, Work Map 두 뷰, 개인 SOP와 대표 표준안이 공유할 안정적인 domain·Store·node 작성 계약을 구현한다. 이 세션은 유일한 Foundation writer다. 화면 완성이나 AI 프롬프트 품질 변경까지 수행하지 않는다.

## 시작 조건과 필수 읽기

단독 worktree·branch에서 시작한다. 다른 writer가 이 worktree를 사용 중이면 중단한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기 1~13을 모두 수행하고 아래를 실행한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

현재 코드와 테스트를 먼저 읽고 기존 persistence version, hydration, read-only guard, review/Agentization invalidation 규칙을 기록한 뒤 수정한다.

## 배타적 소유 파일

```text
src/lib/sop-types.ts
src/lib/sop-document-schema.ts
src/lib/sop-step-common-schema.ts
src/lib/sop-schemas.ts
src/lib/sop-prototype-store.ts
src/lib/sop-task-library.ts
src/lib/sop-member-intake.ts
src/lib/sop-work-map-draft.ts
src/lib/sop-node-authoring-contract.ts
src/lib/sop-node-markdown.ts
src/components/sop/SopMemberRouteGuard.tsx
src/server/sop/sop-prompt.ts                  # 표준안 prompt의 기계적 추출만
src/server/sop/sop-standard-draft-prompt.ts
src/server/sop/sop-standard-draft-runner.ts   # 추출 후 import 연결만
tests/sop-member-intake-domain.test.ts
tests/sop-work-map-domain.test.ts
tests/sop-node-authoring-domain.test.ts
```

실제 구현상 새 Foundation 전용 test fixture가 필요하면 `tests/`에 `sop-member-*`, `sop-work-map-*`, `sop-node-authoring-*` 접두사로 추가할 수 있다. 기존 파일의 unrelated change와 겹치면 수정하지 말고 보고한다.

## 수정 금지

- 모든 page와 최종 UI 컴포넌트
- 추천 API와 추천 prompt
- 개인 SOP prompt의 작성 규칙
- 대표 표준안 prompt의 내용·동작 변경
- `src/app/api/ai/route.ts`
- `SopSetupGate`, `SopMemberHome`, `WorkLibrarySelector`
- `/flow` 관련 파일

## 충족할 계약

- `REQ-CTX-004`
- `REQ-WM-001`~`REQ-WM-006`, `INT-WM-001`~`INT-WM-003`
- `REQ-NODE-001`~`REQ-NODE-005`
- `REQ-AOP-001`~`REQ-AOP-004`
- `TST-STATE-004`~`TST-STATE-006`
- `TST-WM-001`~`TST-WM-007`
- `TST-NODE-001`~`TST-NODE-008`
- `TST-AOP-001`~`TST-AOP-006`

## 구현 지시

### 1. 구성원 intake와 migration을 구현한다

- prototype member session에 사번, 이름, 조직, 주요 직무, 선택 직급과 authenticated 상태를 둔다.
- 업무맥락은 추천과 SOP 생성이 함께 읽는 단일 authoritative field로 둔다.
- 기존 persisted `taskRecommendationInput`과 `context`가 함께 존재하면 무손실·결정론적 migration 규칙을 적용한다. 새 입력이 확정된 뒤 별도 복제 필드를 다시 만들지 않는다.
- context가 실질적으로 변경되면 오래된 추천, confirmed Task, 미확정 Work Map을 무효화한다.
- hydration 이전 redirect로 잘못 튕기지 않도록 route guard 상태를 명시한다.
- 실제 인증·SSO·생산 세션처럼 표현하지 않는다.

### 2. 추천 상태와 Work Map snapshot 경계를 구현한다

- recommendation의 idle/pending/ready/error와 제출 context snapshot을 구분한다.
- 추천 성공은 Task 확정이 아니다.
- 명시적 `CONFIRM_TASK`에서만 read-only Task Library candidate를 member-owned Work Map draft로 deep clone한다.
- 원본 fixture의 reference를 공유하지 않는다.
- context 변경, Task 재선택, TAS mutation의 invalidation 규칙을 pure domain function으로 제공한다.

### 3. simple/detailed 공용 controller를 구현한다

- 두 뷰가 동일한 draft selector, add/delete/update/reorder mutation, validation을 사용하게 한다.
- Activity–Skill ID 관계를 보존하고 Skill 수를 임의로 5개로 제한하지 않는다.
- view 전환 자체는 data 또는 confirmation을 변경하지 않는다.
- mutation은 Work Map confirmation을 해제한다.
- Task Library 원본 불변성을 테스트한다.

### 4. 공통 node authoring contract를 구현한다

- 기존 wire/document와 하위 호환되는 additive schema를 우선한다.
- document-level Mission과 glossary, business node-level responsible role, completion criteria, tool policy, escalation/HITL, provenance 의미를 구조화한다.
- terminal·pure control node에는 business execution spec을 강제하지 않는다.
- unknown tool, 입력 근거 없는 threshold, 금지 권한은 blocking issue로 분류한다.
- 모호 표현, 피동·책임 불명, 복합 행동, 정의되지 않은 약어는 repair 또는 human-review issue로 분류한다.
- Agent화 제안, 구성원 결정, 실제 tool permission을 별도 필드·별도 전이로 유지한다.
- 검증된 구조 객체를 deterministic Markdown으로 투영한다. Markdown은 실행 권위 원본이 아니다.

### 5. 표준안 prompt를 기계적으로 분리한다

- 기존 `getStandardDraftPrompt`와 관련 helper를 `sop-standard-draft-prompt.ts`로 이동한다.
- 이 Wave에서는 prompt 문구, input shaping, output schema, runtime behavior를 바꾸지 않는다.
- runner import와 기존 테스트가 동일하게 동작함을 증명한다.

## 수용 검증

새 테스트는 최소 다음을 실행한다.

- persisted 이전 상태가 새 상태로 migration되고 기존 사용자 data를 잃지 않는다.
- submitted context 하나가 추천·생성 selector 모두에서 동일하다.
- context 변경이 stale recommendation과 Work Map을 무효화한다.
- 대표 fixture의 Activity 14개와 관계 70개를 clone·편집해도 원본이 변하지 않는다.
- simple/detailed projection이 동일 ID 집합을 반환한다.
- node lint/quality report가 `TST-NODE-*`, `TST-AOP-*` fixture를 구분한다.
- schema → document → Markdown projection에서 의미가 보존된다.

실행 명령:

```bash
npx tsx tests/sop-member-intake-domain.test.ts
npx tsx tests/sop-work-map-domain.test.ts
npx tsx tests/sop-node-authoring-domain.test.ts
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

## 인계

`00_MASTER_ORCHESTRATION.md`의 HANDOFF 형식에 더해 public type, selector, mutation, validator, Markdown renderer의 export 목록과 호출 예시를 기록한다. persistence version과 migration truth table을 명시한다. Wave 1이 추측해서 공용 타입을 재정의하게 만들지 않는다.

명시적 commit 권한이 있을 때만 검증 완료 commit을 만들고 hash를 제공한다. push하지 않는다.
