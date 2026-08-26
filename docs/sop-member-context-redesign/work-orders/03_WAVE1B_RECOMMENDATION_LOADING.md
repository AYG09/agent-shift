# 작업지시서 03 — Wave 1B Task 추천·로딩

## 임무

확정된 업무맥락을 바탕으로 Task Library 후보를 AI에 요청하고, 기다리는 동안 정직한 도움말 경험을 제공하며, 검증된 추천을 사용자가 명시적으로 확정하게 한다. 추천 성공을 자동 선택 또는 자동 확정으로 취급하지 않는다.

## 시작 조건

검증 완료된 Wave 0 Foundation commit에서 분기한 전용 worktree에서 시작한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 완료하고 Foundation handoff의 recommendation state, Task clone, invalidation API를 확인한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

구현 전에 Claude의 실제 디자인 검토 기능 또는 디자인 skill을 호출해 loading, 결과 비교, 오류 복구의 정보 위계를 검토한다. 기능이 없으면 정확히 보고하고 사용했다고 주장하지 않는다.

## 배타적 소유 파일

```text
src/lib/sop-task-recommendation.ts
src/lib/sop-task-recommendation-meta.ts
src/app/sop/recommendation/page.tsx
src/app/api/sop/task-recommendations/route.ts
src/components/sop/SopTaskRecommendationFlow.tsx
src/components/sop/SopRecommendationLoading.tsx
tests/sop-task-recommendation-flow.test.tsx
```

## 수정 금지

- Foundation의 Store/type/domain 파일
- login/context page와 컴포넌트
- Work Map page와 컴포넌트
- 기존 Home/Gate/SopTaskRecommendationPanel
- 개인·표준안 생성 코드와 `src/app/api/ai/route.ts`
- `/flow`

## 충족할 계약

- `REQ-LOAD-001`, `REQ-LOAD-002`
- `NFR-LOAD-001`~`NFR-LOAD-004`
- `REQ-REC-001`~`REQ-REC-005`
- `NFR-REC-001`~`NFR-REC-003`
- `TST-STATE-003`, `TST-STATE-005`
- `TST-REC-002`~`TST-REC-006`
- `TST-UI-006` 중 추천 확인 범위

## 구현 지시

### 요청과 검증

- `/sop/recommendation` 진입은 authenticated + submitted context를 요구한다. 미충족이면 적절한 앞 단계로 보낸다.
- recommendation-pending 상태의 같은 request key에 대해 API를 정확히 한 번 시작한다. React Strict Mode remount 또는 rerender가 중복 요청을 만들지 않게 domain 상태와 idempotent guard를 사용한다.
- request는 확정 context 원문, member role context, Task Library candidate catalog를 사용한다.
- 응답은 최대 3개, unique Task ID, 연속 rank, catalog membership, 비어 있지 않은 reason을 검증한다.
- confidence, 확률, 적합도 퍼센트를 request·response·UI에 추가하지 않는다.
- invalid response는 부분 적용하지 않고 error 상태로 보낸다.

### 로딩 경험

- 시작·성공·실패 상태를 명확히 표시한다.
- static help catalog에서 프로그램 목적, 추천의 한계, 다음 단계, T/A/S 수정 가능성 등을 순환한다.
- 실제 정보가 없는 퍼센트, ETA, 완료된 것처럼 보이는 가짜 단계는 표시하지 않는다.
- 서버 응답을 늦추는 인위적 minimum delay를 만들지 않는다.
- reduced-motion에서는 자동 전환 효과를 최소화한다.
- `aria-live`는 상태 변화만 알리고 tip 회전마다 읽지 않는다.
- 사용자는 요청을 취소하거나 context로 돌아갈 수 있다. 취소 결과가 늦게 도착해 현재 상태를 덮지 않게 한다.

### 추천 확인과 복구

- 1순위를 `가장 관련성 높은 추천`으로 강조하되 자동 확정하지 않는다.
- Task명, 원본 정의, 추천 이유를 표시한다.
- 다른 후보를 비교할 수 있고 각 후보의 `이 Task로 계속`을 명시적으로 눌러야 한다.
- 확정 action은 Foundation clone API를 호출해 Work Map snapshot을 만든 뒤 `/sop/work-map/simple`로 이동한다.
- API 실패 시 context를 보존하고 재시도, context 수정, 수동 Task 검색·선택을 제공한다.
- 수동 선택도 같은 명시적 확정과 snapshot 경계를 사용한다.

## 수용 검증

테스트는 최소 다음을 포함한다.

- submitted context 한 번에 네트워크 요청 한 번만 발생한다.
- pending 동안 도움말은 보이지만 fake progress와 confidence는 없다.
- unknown·duplicate ID, rank gap, 4개 결과는 적용되지 않는다.
- 성공만으로 selected Task 또는 Work Map이 생성되지 않는다.
- 명시적 confirm 뒤에만 deep-cloned Work Map과 navigation이 생긴다.
- 실패·취소 뒤에도 context가 보존되고 수동 선택이 가능하다.
- stale response가 새 context의 recommendation을 덮지 않는다.

```bash
npx tsx tests/sop-task-recommendation-flow.test.tsx
npx tsc --noEmit
npm run lint
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식을 따른다. request/response validator 요약, 중복 호출 방지 방식, stale response 처리, loading/error/result 브라우저 증거, 실제 사용한 Claude 디자인 기능을 추가한다. 소유 파일 밖 변경은 0건이어야 한다.

명시적 권한 없이는 commit·push하지 않는다.
