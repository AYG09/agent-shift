# 작업지시서 08 — Wave 2 순차 통합

## 임무

Wave 0와 Wave 1 여섯 세션의 검증된 결과를 하나의 흐름으로 순차 통합한다. 이 단계는 단일 writer만 수행한다. 기존 Home, 승인, 복제, Activity–Sub Action, Workspace, Agent화 추적, HR 분석을 보존하면서 새 구성원 진입 흐름을 실제 Task-wide SOP 생성에 연결한다.

## 시작 조건

다음 자료가 모두 있어야 시작한다.

- Foundation 검증 완료 handoff와 baseline commit
- Session A~F 각각의 HANDOFF, changed-file 목록, test 결과
- 모든 Wave 1 writer가 중지됐다는 확인
- 통합 branch·worktree의 단독 소유권
- local merge/commit이 필요한 경우 사용자의 명시적 권한

`00_MASTER_ORCHESTRATION.md`의 필수 읽기를 모두 수행하고 아래를 실행한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## 기본 소유 파일

```text
src/app/sop/page.tsx
src/components/sop/SopMemberHome.tsx
src/components/sop/SopSetupGate.tsx
src/components/sop/SopTaskRecommendationPanel.tsx
src/components/sop/WorkLibrarySelector.tsx
src/lib/sop-setup-actions.ts
src/app/api/ai/route.ts
tests/sop-member-home.test.ts
tests/sop-task-library.test.ts
tests/sop-customer-scenario.test.ts
```

Wave 1 writer 종료 후에는 handoff에 포함된 파일의 conflict resolution과 최소 glue 수정 권한도 이 통합 세션으로 이전한다. 그러나 임의 재설계는 금지한다. 공용 AI route는 SOP 연결에 필요한 최소 변경만 허용하며 `/flow` action의 prompt, schema, response 동작을 바꾸지 않는다.

## 수정 금지

- `/flow` page, component, prompt, schema
- unrelated product 영역
- 생산 인증, 생산 DB, vector DB, audit log, agent executor 신설
- 고객 요구와 무관한 대규모 refactor

## 통합 순서

각 단계에서 diff를 읽고 소유 테스트와 `npx tsc --noEmit`을 통과시킨 뒤 다음 단계로 이동한다.

1. Foundation
2. 개인 SOP node generation
3. 대표 표준안 generation
4. 로그인·context
5. 추천·loading
6. simple Work Map
7. detailed Work Map
8. Home/Gate/legacy component 연결과 dead-code 정리

branch 전체를 무비판적으로 merge하지 않는다. handoff의 baseline과 changed files가 실제 diff와 일치하는지 확인한다. conflict는 최신 SPEC와 기존 customer invariant를 기준으로 해소하고, 어느 쪽도 근거 없이 버리지 않는다.

## 통합 지시

### 1. route와 진입을 연결한다

- anonymous 사용자의 첫 Task 생성 진입은 `/sop/login`이다.
- authenticated 사용자의 `/sop` Home은 기존 현황·다른 생성 경로·승인 추적을 보존한다.
- `/sop/context`, `/sop/recommendation`, Work Map 두 route는 Foundation domain guard를 사용한다.
- 직접 URL, 새로고침, 뒤로가기, hydration 중 상태를 테스트한다.

### 2. 단일 업무맥락을 끝까지 연결한다

- context submit 원문 하나가 recommendation request와 SOP generation request에 동일하게 들어가는지 assertion으로 검증한다.
- 기존 `taskRecommendationInput` UI와 별도 context textarea를 중복 authoritative input으로 남기지 않는다.
- persisted migration 후 old user state가 깨지지 않는다.
- context 변경 시 stale recommendation과 미확정 Work Map이 무효화된다.

### 3. 기존 Setup Gate를 축소·연결한다

- 기존 `/sop/setup`이 로그인, 추천, T/A/S 편집, context, 모델 설정을 한 화면에 다시 중복시키지 않게 한다.
- Work Map이 확정된 경우 기존 `runSopSetupGeneration`과 Task-wide 생성 설정을 재사용한다.
- 고급 설정은 기본값을 보존하고 progressive disclosure로 둔다. 이번 요구에 없는 설정 제거는 하지 않는다.
- old deep link에는 안전한 compatibility redirect 또는 명확한 resume 경로를 제공한다.

### 4. legacy UI 중복을 정리한다

- `SopTaskRecommendationPanel`과 `WorkLibrarySelector`가 새 흐름과 이중 source of truth가 되지 않게 한다.
- 기존 다른 생성 경로가 해당 컴포넌트를 사용하면 삭제하지 말고 adapter 또는 compatibility mode로 보존한다.
- dead code는 모든 caller와 테스트를 확인한 뒤 마지막에만 제거한다.

### 5. Work Map을 생성·Workspace에 연결한다

- simple/detailed가 같은 snapshot을 사용하고 양방향 편집이 즉시 보인다.
- 확정 generation request는 모든 Activity를 편집 순서대로 포함하고 Activity별 Skill 관계를 보존한다.
- 생성 성공 시 기존 Workspace document·review·Agentization 추적 계약을 사용한다.
- 생성 실패 시 Work Map과 context를 잃지 않고 재시도할 수 있다.

### 6. node 품질 pipeline을 통합한다

- 개인 SOP와 대표 표준안이 동일한 node contract version과 validator를 사용한다.
- 개인 SOP의 Activity coverage/origin/terminal/Agent화 invariants를 재검증한다.
- 대표 표준안의 PII, approved same-Task, standardization issue, preview-only invariants를 재검증한다.
- `src/app/api/ai/route.ts` 수정이 불필요하면 건드리지 않는다. 필요하면 `generateSop` case와 post-processing 연결만 최소 수정하고 모든 `/flow` action 회귀 테스트를 실행한다.

## 실행 가능한 수용 시나리오

최소 다음을 `tests/sop-customer-scenario.test.ts` 또는 목적에 맞는 실행 테스트로 증명한다.

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

## 검증 명령

통합 중 각 세션 test를 먼저 실행한 뒤 최종적으로 모두 실행한다.

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

AI route를 수정했다면 SOP test 외에 `/flow`의 기존 graph·branch·shape 관련 tests도 실행한다.

## 인계

마스터 HANDOFF 형식에 다음을 추가한다.

- 통합한 각 handoff와 실제 commit hash
- merge/conflict resolution 목록과 근거
- old route·persisted state compatibility matrix
- 새 전체 흐름의 실행 테스트 결과
- `/flow` 변경 0건 또는 공용 route 변경 시 회귀 증거
- Wave 3가 검증할 URL, fixture, dev command, known limitation

명시적 권한 없이는 commit·push하지 않는다.
