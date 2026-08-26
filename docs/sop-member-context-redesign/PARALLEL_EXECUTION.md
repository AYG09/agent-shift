# Claude Opus 병렬 실행 경계

## 1. 목적과 안전 원칙

이 문서는 후속 구현 작업지시서를 여러 Claude Code 세션에 나눌 때의 코드 소유권과 통합 순서를 정의한다. 같은 dirty worktree에서 여러 writer를 동시에 실행하지 않는다.

진정한 병렬 구현은 다음 조건을 모두 만족할 때만 허용한다.

1. 모든 세션이 동일한 검증 완료 baseline commit에서 시작한다.
2. 세션마다 별도 Git worktree와 별도 branch를 사용한다.
3. 한 파일의 active owner는 동시에 한 세션뿐이다.
4. 공용 type과 controller는 병렬 wave 전에 단일 foundation 세션이 확정한다.
5. 통합은 한 명의 integration owner가 순차 수행한다.
6. 각 세션은 변경 파일, 테스트 결과, 미완료, 설계 판단을 명시적으로 인계한다.

로컬 commit/worktree 사용 권한이 없으면 병렬 세션은 읽기 전용 조사·디자인 비평만 수행하고, 실제 코드 쓰기는 한 세션씩 순차 실행한다.

## 2. 의존성 그래프

```text
Wave 0 — Foundation (단일 writer)
  session/domain-foundation
        │
        ├──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
Wave 1A            Wave 1B         Wave 1C         Wave 1D
login/context      recommendation   simple view     detailed view

Wave 1E                              Wave 1F
member SOP node generation           standard-draft node generation

        └────────── six isolated branches converge ──────────┘
                               │
                               ▼
Wave 2 — Integration (단일 writer)
routes + existing Gate/Home connection + E2E + regression
                               │
                               ▼
Wave 3 — Review (코드 writer 없음 또는 integration owner만 수정)
Claude design audit + browser evidence + final guards
```

Wave 1의 여섯 세션은 Foundation handoff를 받은 뒤에만 시작한다. 서로의 branch를 직접 merge하거나 서로 소유한 파일을 수정하지 않는다.

## 3. Foundation 세션

### 책임

- 단일 업무맥락 SSOT와 기존 persisted state migration
- prototype member session 상태와 route-guard 계약
- 추천 상태와 Work Map draft 논리 모델
- Task Library 원본과 member-owned Work Map snapshot 분리
- simple/detailed가 공유할 pure selector, mutation, validation controller
- node instruction contract version, Mission/execution spec의 additive type·wire·persist schema
- 개인 SOP와 대표 표준안이 공유할 pure node quality validator와 quality-report type
- 개인/표준 prompt가 병렬 수정될 수 있도록 표준안 prompt를 별도 module로 기계적으로 분리
- 공용 test fixture와 domain tests

### 단독 소유 파일

기존 파일은 실제 조사 후 최소 범위로 조정하되 아래 파일은 Foundation만 수정한다.

```text
src/lib/sop-types.ts
src/lib/sop-document-schema.ts
src/lib/sop-step-common-schema.ts
src/lib/sop-schemas.ts
src/lib/sop-prototype-store.ts
src/lib/sop-task-library.ts
src/lib/sop-member-intake.ts                 # 신규 권장
src/lib/sop-work-map-draft.ts                # 신규 권장
src/lib/sop-node-authoring-contract.ts        # 신규 권장: pure validation/quality report
src/lib/sop-node-markdown.ts                  # 신규 권장: schema → Markdown 단방향 투영
src/components/sop/SopMemberRouteGuard.tsx   # 신규 권장
src/server/sop/sop-prompt.ts                  # 표준안 prompt 추출까지만
src/server/sop/sop-standard-draft-prompt.ts   # 신규: 기존 함수의 무동작변경 이동
src/server/sop/sop-standard-draft-runner.ts   # 추출된 import 연결까지만
tests/sop-member-intake-domain.test.ts        # 신규 권장
tests/sop-work-map-domain.test.ts             # 신규 권장
tests/sop-node-authoring-domain.test.ts        # 신규 권장
```

### 금지

- 최종 화면 스타일링
- 추천 API prompt 변경
- 개인/표준 생성 prompt의 작성 규칙 변경
- simple/detailed 페이지 구현
- 기존 `SopSetupGate` 대규모 수정

### 완료 handoff

- export된 type/controller API 목록
- persist version과 migration 규칙
- changed-file 목록
- domain test 실행 결과
- 병렬 세션이 사용할 fixture와 호출 예제

Foundation 계약이 바뀌면 Wave 1 세션을 동시에 고치지 않는다. Foundation owner가 새 commit을 만들고 각 worktree가 그 commit으로 다시 정렬된 뒤 재개한다.

## 4. Wave 1 병렬 소유권

### Session A — 로그인·업무맥락

단독 책임:

```text
src/app/sop/login/page.tsx
src/app/sop/context/page.tsx
src/components/sop/SopMemberLoginGate.tsx
src/components/sop/SopMemberContextForm.tsx
tests/sop-member-login-context.test.tsx
```

수용 범위:

- 구성원 필드 검증
- 프로토타입 로그인 표시
- context 단일 과업 화면
- 입력 완료 transition
- 라우트 가드 사용
- 키보드/field error

수정 금지: Store, 공용 type, 추천 API, Work Map 컴포넌트, 기존 Home/Gate.

### Session B — 추천·로딩 경험

단독 책임:

```text
src/lib/sop-task-recommendation.ts
src/lib/sop-task-recommendation-meta.ts       # 신규 권장
src/app/sop/recommendation/page.tsx
src/app/api/sop/task-recommendations/route.ts
src/components/sop/SopTaskRecommendationFlow.tsx
src/components/sop/SopRecommendationLoading.tsx
tests/sop-task-recommendation-flow.test.tsx
```

수용 범위:

- confirmed context 기반 추천 request
- unique/rank/catalog validation
- top recommendation + explicit confirmation
- 도움말 순환, reduced motion, 접근 가능한 status
- 재시도·수정·수동 선택
- no confidence/no fake progress

수정 금지: Store/type, login/context 페이지, Work Map 뷰, 기존 Gate/Home.

### Session C — 간소화 Work Map

단독 책임:

```text
src/app/sop/work-map/simple/page.tsx
src/components/sop/SopWorkMapSimpleView.tsx
src/components/sop/SopWorkMapSimpleEditDrawer.tsx
tests/sop-work-map-simple.test.tsx
```

수용 범위:

- Activity 14개 핵심 scan
- one-line 원문 projection
- Skill 이름 compact 표시
- 공용 controller를 통한 전체 편집 drawer
- detailed route 전환 link

수정 금지: Foundation controller, detailed view, 기존 WorkLibrarySelector. Detailed 세션이 이 세션의 신규 컴포넌트를 import하도록 요구하지 않는다.

### Session D — 상세 Work Map

단독 책임:

```text
src/app/sop/work-map/detailed/page.tsx
src/components/sop/SopWorkMapDetailedView.tsx
src/components/sop/SopWorkMapActivityDetail.tsx
tests/sop-work-map-detailed.test.tsx
```

수용 범위:

- Task 정의 전체 표시
- Activity master–detail
- 선택 Activity와 Skill 설명 전체 편집
- simple route 전환 link
- 독립 스크롤과 focus 보존

수정 금지: Foundation controller, simple view/drawer, 기존 WorkLibrarySelector. Simple 세션의 branch에만 존재하는 파일을 import하지 않는다.

### Session E — 개인 SOP node 생성 품질

단독 책임:

```text
src/server/sop/sop-prompt.ts
src/server/sop/sop-generation-runner.ts
tests/sop-node-authoring-generation.test.ts
tests/sop-subaction-agentization.test.ts
```

수용 범위:

- 5대 node 작성 규칙의 개인 SOP prompt 적용
- Mission/glossary와 node execution spec 생성
- 구조 검증 → semantic lint → 1회 repair → 재검증
- 출처 없는 threshold·unknown tool·금지 권한 차단
- 기존 Activity coverage/origin/Agent화 분리 보존

수정 금지: 공용 schema/validator, 표준안 prompt/runner/route, UI 파일, `/flow` AI prompt.

### Session F — 대표 표준안 node 생성 품질

단독 책임:

```text
src/server/sop/sop-standard-draft-prompt.ts
src/server/sop/sop-standard-draft-runner.ts
src/lib/sop-standard-draft-schemas.ts
src/app/api/sop/standard-drafts/route.ts
tests/sop-standard-draft-node-contract.test.ts
tests/sop-hr-analytics.test.ts
```

수용 범위:

- PII 제거 후 역할·입출력·조건·도구·execution spec 의미 보존
- 개인 SOP와 동일한 node authoring validator 적용
- 원본 충돌을 `standardizationIssues`로 반환
- quality report response 검증
- preview-only, approved same-Task, no auto-save/confirm/execute 보존

수정 금지: 공용 schema/validator, 개인 SOP prompt/runner, HR 화면, `/flow`.

## 5. 공용 파일 요청 규칙

Wave 1 세션이 공용 계약 부족을 발견하면 다음 순서로 처리한다.

1. 필요한 API, 이유, 호출 예를 handoff 메모에 기록한다.
2. 자신이 Foundation 파일을 직접 수정하지 않는다.
3. Foundation owner가 최소 공용 변경과 domain test를 추가한다.
4. 변경된 foundation baseline을 각 세션이 받아 다시 검증한다.

UI·backend 세션 편의를 위해 Store selector, node type, quality validator를 각 컴포넌트나 runner 안에서 중복 정의하는 것은 금지한다.

## 6. Wave 2 통합 세션

### 단독 소유 파일

```text
src/app/sop/page.tsx
src/components/sop/SopMemberHome.tsx
src/components/sop/SopSetupGate.tsx
src/components/sop/SopTaskRecommendationPanel.tsx
src/components/sop/WorkLibrarySelector.tsx
src/lib/sop-setup-actions.ts
src/app/api/ai/route.ts                        # 필요한 SOP 연결 변경만; /flow 회귀 필수
tests/sop-member-home.test.ts
tests/sop-task-library.test.ts
tests/sop-customer-scenario.test.ts
```

실제 diff에 따라 파일 수를 줄일 수 있지만 다른 세션이 이 목록을 동시에 수정할 수 없다.

### 통합 책임

1. Wave 1 branch를 changed-file 단위로 검토하고 의존성 순서대로 통합한다.
2. 기존 `/sop` Home을 로그인 후 접근 가능한 구조로 보존한다.
3. 기존 `/sop/setup`의 혼합 화면을 새 순차 흐름에 연결하거나 compatibility redirect로 축소한다.
4. 기존 추천 패널과 WorkLibrarySelector를 중복 구현으로 남기지 않는다.
5. Work Map 완료를 기존 `runSopSetupGeneration`과 Workspace에 연결한다.
6. 개인 SOP와 대표 표준안 branch가 같은 node contract version과 quality report를 사용하는지 검증한다.
7. 기존 동료·own-prior·승인·HR 흐름을 회귀 검증한다.
8. dead code를 마지막 단계에서만 제거한다.

통합 세션은 각 branch의 narrative 완료 주장보다 diff와 테스트를 우선한다.

## 7. Wave 3 디자인·검증

Claude 디자인 기능을 사용한 검토는 다음 입력을 고정한다.

```text
- 데스크톱 1440×900, 1920×1080, zoom 100%
- 대표 데이터: Task 1개, Activity 14개, Activity당 Skill 5개
- 흐름: login → context → loading → recommendation → simple/detailed
- 정책: Simple is the best, 한 화면 한 primary action
- 제약: 같은 Work Map 데이터, Task Library 원본 불변, fixed footer 비가림
- 접근성: keyboard, focus, aria-live, reduced motion, dialog/drawer
```

검토 결과는 다음을 구분해 보고한다.

- 수용한 시각·상호작용 개선
- 계약과 충돌해 수용하지 않은 제안
- 아직 검증하지 못한 viewport/상태

Claude 디자인 기능이 호출 불가능하거나 인증되지 않았으면 정확히 그 사실을 기록하고, 사용했다고 주장하지 않는다.

## 8. 세션 handoff 형식

모든 세션은 아래 형식을 사용한다.

```text
1. baseline commit / branch / worktree
2. 변경 파일
3. 충족한 SPEC requirement ID
4. 새로 도입한 구현 해석
5. 실행한 테스트와 결과
6. 실패 명령과 원문 오류
7. 공용 계약 변경 요청
8. Claude 디자인 기능 사용 여부
9. 미완료·보류
10. 다음 세션이 건드리면 안 되는 파일
```

handoff 없이 다음 writer가 같은 파일을 이어서 수정하지 않는다.

## 9. 통합 게이트

### Wave 0 완료

- typecheck
- domain tests
- migration test
- `npm run verify:quality`
- `npm run verify:sop-customer`

### 각 Wave 1 세션 완료

- 소유 테스트
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`
- 소유 파일 외 변경 0건

### Wave 2/3 최종

```text
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

브라우저에서 로그인 → 업무맥락 → 추천 → simple → detailed → Work Map 완료 → SOP 생성 → Workspace를 실행한다. 1440×900과 1920×1080에서 각각 캡처하고 footer, 독립 스크롤, drawer/dialog, 오류/로딩 상태를 확인한다.

## 10. 병렬 작업에서 금지할 것

- 같은 dirty worktree에 concurrent writer 실행
- 둘 이상의 세션이 `sop-prototype-store.ts` 또는 `sop-types.ts` 수정
- simple/detailed가 별도 Store나 별도 mutation 구현
- API 세션이 UI 편의를 위해 Work Map 데이터를 자동 확정
- UI 세션이 추천 품질 threshold나 confidence 필드 추가
- 기존 `/flow` 수정
- 사용자 승인 없는 commit·push
- 검증 없이 integration branch에서 대량 충돌 해결
