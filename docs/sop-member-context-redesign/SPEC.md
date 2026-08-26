# SOP 구성원 업무맥락 흐름 SDD 명세

## 1. 명세 규칙

- `REQ-*`: 확인된 고객 요구를 검증 가능한 형태로 번역한 항목
- `INT-*`: 현재 프로토타입을 위한 구현 해석
- `NFR-*`: 비기능·접근성·품질 조건
- `TST-*`: 실행 가능한 수용 테스트

요구를 충족했다고 판단하려면 화면 존재만이 아니라 상태, API, 데이터 불변식, 실패 경로가 함께 동작해야 한다.

## 2. 상태 모델

### 2.1 구성원 intake 상태

```text
anonymous
  → identity-draft
  → authenticated
  → context-draft
  → recommendation-pending
  → recommendation-ready
  → task-confirmed
  → work-map-editing
  → work-map-confirmed
  → sop-generation-pending
  → workspace
```

오류는 별도 최종 상태가 아니라 해당 단계의 복구 가능한 하위 상태다.

| 현재 상태 | 이벤트 | 다음 상태 | 필수 효과 |
|---|---|---|---|
| anonymous/identity-draft | `SUBMIT_IDENTITY` | authenticated | 유효한 member session 설정 |
| authenticated/context-draft | `SUBMIT_CONTEXT` | recommendation-pending | 단일 업무맥락 snapshot으로 추천 요청 |
| recommendation-pending | `RECOMMENDATION_SUCCEEDED` | recommendation-ready | 검증된 후보 최대 3개 저장 |
| recommendation-pending | `RECOMMENDATION_FAILED` | context-draft | 입력 보존, 오류·재시도·수동 선택 제공 |
| recommendation-ready | `CONFIRM_TASK` | task-confirmed | 선택 Task를 독립 Work Map 초안으로 복제 |
| task-confirmed | `OPEN_DENSITY_VIEW` | work-map-editing | simple/detailed 투영만 변경 |
| work-map-editing | `MUTATE_TAS` | work-map-editing | Work Map 확정 해제 |
| work-map-editing | `CONFIRM_WORK_MAP` | work-map-confirmed | 유효성 검증 후 snapshot 확정 |
| work-map-confirmed | `GENERATE_SOP` | sop-generation-pending | 기존 Task-wide 생성 계약 호출 |
| sop-generation-pending | `GENERATION_SUCCEEDED` | workspace | 생성 문서와 provenance 보존 |

### 2.2 라우트 가드

| 라우트 | 진입 조건 | 조건 미충족 시 |
|---|---|---|
| `/sop/login` | 없음 | 인증 상태면 `/sop/context` 또는 구성원 Home으로 안내 |
| `/sop/context` | authenticated | `/sop/login` |
| `/sop/recommendation` | authenticated + submitted context | `/sop/context` |
| `/sop/work-map/simple` | authenticated + confirmed Task + Work Map draft | 추천 단계 |
| `/sop/work-map/detailed` | 위와 동일 | 추천 단계 |
| `/sop/workspace` | 기존 생성/복제 문서 존재 | 기존 보호 규칙 유지 |

새 라우트 가드는 화면 redirect만 수행하는 장식이 아니라 도메인 상태를 기준으로 결정해야 한다.

## 3. 화면 명세

### 3.1 로그인 게이트

#### 요구

- `REQ-AUTH-001`: 비로그인 구성원의 첫 Task 생성 진입은 구성원 정보 입력 게이트여야 한다.
- `REQ-AUTH-002`: 사번, 이름, 조직, 주요 직무 입력을 제공하고 직급은 선택 입력으로 제공한다.
- `REQ-AUTH-003`: 주 액션은 하나이며 `로그인하고 업무 작성 시작`처럼 결과를 명확히 표현한다.
- `INT-AUTH-001`: 화면에 `프로토타입 로그인`과 실제 인증이 아니라는 설명을 표시한다.
- `INT-AUTH-002`: 입력 완료 후 Task 기반 흐름은 `/sop/context`로 이동한다. 기존 Home은 로그인 후 별도 navigation으로 유지한다.

#### 검증

- 필수 필드 누락 시 어떤 필드가 필요한지 field-level 오류를 제공한다.
- 비밀번호, API key, 주민번호를 요구하지 않는다.
- 로그인 상태를 URL query만으로 위조할 수 없고 Store/session adapter 상태를 확인한다.
- 기존 Store에 `memberInfo` 샘플이 존재한다는 이유만으로 로그인 완료로 간주하지 않는다. 신규·legacy 세션의 기본 상태는 `anonymous`다.
- 로그아웃은 저장된 SOP record를 삭제하지 않고 intake용 세션과 미확정 초안만 정리한다.

### 3.2 업무맥락 입력 페이지

#### 요구

- `REQ-CTX-001`: 페이지의 유일한 주 과업은 현재 수행 업무와 맥락 작성이다.
- `REQ-CTX-002`: textarea는 실제 업무, 순서, 승인·판단, 예외·재작업, 도구, 협업 대상을 안내한다.
- `REQ-CTX-003`: `입력 완료 · Task 추천 받기` 버튼을 제공한다.
- `REQ-CTX-004`: 제출한 동일 원문을 Task 추천과 후속 SOP 생성에 사용한다.
- `INT-CTX-001`: 기존 보조 입력 칩은 3개 이하의 그룹으로 접어 제공하며 본문보다 시각적으로 우선하지 않는다.
- `INT-CTX-002`: 문자 수는 보여줄 수 있으나 고객이 정하지 않은 최대 글자 수를 강제하지 않는다. 공백만 있는 입력은 거부한다.

#### 단일 원본 규칙

- 추천 전용 `taskRecommendationInput`과 생성 전용 `context`를 독립적으로 유지하지 않는다.
- 하나의 `memberWorkContext` 논리 필드가 추천 request, Work Map provenance, SOP generation request의 권위 있는 원본이다.
- 마이그레이션 시 기존 사용자의 직접 작성 `taskRecommendationInput`이 비어 있지 않으면 이를 우선 후보로 제시하되 자동 제출하지 않는다.
- fixture의 일반 안내 문장을 실제 사용자의 확정 업무맥락으로 간주하지 않는다.

### 3.3 AI 추천 처리와 도움말 순환

#### 요구

- `REQ-LOAD-001`: 업무맥락 제출 직후 추천 API가 동작하며 사용자는 처리 중임을 알 수 있어야 한다.
- `REQ-LOAD-002`: 처리 중 프로그램 목적, 추천의 한계, 다음 단계, T/A/S 수정 가능성을 설명하는 도움말이 순환한다.
- `NFR-LOAD-001`: 실제 진행률을 알 수 없으므로 숫자형 퍼센트, 완료 예상 시각, 가짜 단계 완료를 표시하지 않는다.
- `NFR-LOAD-002`: 서버 응답을 기다리기 위해 인위적인 최소 지연을 추가하지 않는다.
- `NFR-LOAD-003`: `prefers-reduced-motion`에서는 자동 전환 애니메이션을 최소화한다.
- `NFR-LOAD-004`: `aria-live`는 시작, 성공, 실패만 알리고 도움말이 바뀔 때마다 스크린리더를 방해하지 않는다.

#### 도움말 콘텐츠 계약

콘텐츠는 코드의 단일 meta 배열에서 관리하고 최소 다음 의미를 포함한다.

1. AI 추천은 Task를 확정하지 않으며 사용자가 다음 단계에서 확인한다.
2. 추천은 현재 Task Library에 저장된 Task 범위에서만 나온다.
3. 다음 화면에서 Task, Activity, Skill을 실제 업무에 맞게 수정할 수 있다.
4. 확정된 Activity는 후속 SOP에서 Sub Action으로 구체화된다.
5. 추천 실패 시에도 Task를 직접 검색해 선택할 수 있다.

도움말은 모델이 실시간 생성하지 않는다. 검토 가능한 정적 제품 콘텐츠로 둔다.

#### 실패·취소

- 오류가 나면 입력 원문을 보존한다.
- `다시 추천`, `업무맥락 수정`, `Task 직접 찾기`를 제공한다.
- 취소 시 네트워크 요청을 가능하면 중단하고 context draft로 돌아간다.
- 중복 제출은 동일한 pending 요청을 여러 번 만들지 않도록 막는다.

### 3.4 Task 추천 결과와 확인

- `REQ-REC-001`: AI는 Task Library 후보 중 의미적 관련성이 높은 순서로 최대 3개 Task를 반환한다.
- `REQ-REC-002`: 1순위를 `가장 관련성 높은 추천`으로 강조한다.
- `REQ-REC-003`: 추천 결과에는 Task명, 원본 정의, 추천 이유를 표시한다.
- `REQ-REC-004`: 구성원이 `이 Task로 계속`을 눌러야 Work Map이 생성된다.
- `REQ-REC-005`: 다른 추천 후보 보기와 수동 Task 검색을 제공한다.
- `NFR-REC-001`: 검증되지 않은 confidence, 확률, 적합도 퍼센트를 만들지 않는다.
- `NFR-REC-002`: API가 반환한 Task ID는 제출한 후보 catalog에 존재하는지 검증한다.
- `NFR-REC-003`: 중복 ID, 비연속 rank, 3개 초과 결과는 적용하지 않는다.

추천 결과를 클릭하는 것과 확정하는 것을 별도 상태로 표현한다. hover나 focus만으로 Store의 선택 Task를 바꾸지 않는다.

### 3.5 Work Map 공통 편집 계약

- `REQ-WM-001`: 추천 Task와 해당 Task의 모든 Activity·Activity별 Skill 관계를 표시한다.
- `REQ-WM-002`: Task명·정의, Activity명·설명·순서, Skill명·설명을 수정할 수 있다.
- `REQ-WM-003`: Activity와 Skill을 추가·삭제할 수 있고 Activity 순서를 변경할 수 있다.
- `REQ-WM-004`: 간소화와 상세 두 페이지가 모두 존재해야 한다.
- `REQ-WM-005`: 두 페이지 사이를 이동해도 입력·편집 내용이 그대로 유지되어야 한다.
- `REQ-WM-006`: 두 페이지는 같은 domain mutation과 validation을 사용해야 한다.
- `INT-WM-001`: Task Library 원본은 읽기 전용 후보 catalog로 취급하고, Task 확정 시 member-owned Work Map snapshot을 생성한다.
- `INT-WM-002`: Work Map mutation은 원본 Task Library DB를 변경하지 않는다.
- `INT-WM-003`: 어느 뷰에서든 mutation이 발생하면 `workMap.confirmed`를 해제한다.

#### 공통 검증

- Task명은 비어 있을 수 없다.
- Activity는 최소 1개이며 모든 Activity명은 비어 있을 수 없다.
- 각 Skill명은 비어 있을 수 없다. Skill 수를 정확히 5개로 강제하지 않는다.
- Activity order는 Task 안에서 양의 정수로 중복 없이 정규화한다.
- imported ID는 보존하고 구성원 추가 항목은 draft 안에서 충돌 없는 ID를 가진다.
- Skill 평탄 목록은 Activity별 관계에서 파생하며 두 번째 mutable 원본을 만들지 않는다.

### 3.6 간소화 페이지

권장 경로: `/sop/work-map/simple`

#### 표시

- 상단: 선택 Task명, 원본 정의 한 줄, Activity 수, Skill 관계 수, 밀도 전환
- 본문: Activity 중심 table/list
- 기본 열: 순서, Activity명, 한 줄 정의, Skill명 요약, 편집 액션
- Skill은 이름만 compact chip/list로 표시하고 설명은 기본 노출하지 않는다.
- 긴 설명은 원문을 변경하지 않고 CSS로 한 줄 제한하며 title 또는 편집 drawer에서 전체를 확인한다.

#### 편집

- 행 선택 또는 `편집`으로 하나의 inspector drawer를 연다.
- drawer에서 Activity 설명과 Skill 설명을 포함한 전체 필드를 수정할 수 있다.
- 추가, 삭제, 순서 변경은 table에서 접근 가능하되 파괴적 삭제는 명확한 대상명을 확인한다.

한 화면에 14개 Activity의 핵심 구조를 빠르게 스캔할 수 있어야 하며, 모든 Skill 설명을 동시에 펼치지 않는다.

### 3.7 상세 페이지

권장 경로: `/sop/work-map/detailed`

#### 표시

- 상단 Task 영역에서 Task 정의 원문을 전체 표시한다.
- Activity 목록과 선택 Activity 상세를 master–detail 또는 단일 확장 행 방식으로 배치한다.
- 선택 Activity의 설명 원문과 Skill 5개 각각의 이름·설명을 표로 표시한다.
- 14개 Activity 전체를 동시에 완전 확장해 페이지 길이를 무제한으로 늘리지 않는다.
- Activity 목록과 상세 영역은 필요 시 독립 스크롤을 사용하고 action footer가 내용을 가리지 않아야 한다.

#### 편집

- 간소화와 같은 공통 controller의 mutation만 호출한다.
- 상세 뷰 전용 필드나 별도 저장 버튼을 만들지 않는다.
- Activity 전환 전에 현재 입력을 안정적으로 반영하며, focus 이동으로 값이 유실되지 않는다.

### 3.8 Work Map 완료와 SOP 생성 연결

- 주 액션: `검토 완료 · SOP 생성으로 계속`
- 완료 시 Work Map 공통 검증을 수행하고 오류가 있는 첫 항목으로 이동한다.
- 고급 생성 설정은 기본 접힘으로 제공하며 기존 `computeSubActionCapacity`와 `validateSopSetupConfig`를 재사용한다.
- 생성 request는 확정 Work Map의 모든 Activity를 순서대로 포함한다.
- 업무맥락은 추천에 사용한 동일 원문을 포함한다.
- 기존 `activity-subaction-v1`, Activity coverage, AI Agent화 제안/구성원 판단 분리 계약을 유지한다.
- 생성된 각 business node와 대표 표준안 node는 [NODE_AUTHORING_AND_AGENT_CONTROL.md](NODE_AUTHORING_AND_AGENT_CONTROL.md)의 작성·agent-ready 계약을 따른다.

## 4. 논리 데이터 계약

이름은 코드베이스에 맞게 조정할 수 있지만 책임과 불변식은 유지해야 한다.

```ts
type PrototypeMemberSession = {
  status: 'anonymous' | 'authenticated';
  member: SopMember | null;
  authenticatedAt?: string;
};

type MemberContextState = {
  draft: string;
  confirmedText?: string;
  confirmedAt?: string;
};

type TaskRecommendationState = {
  status: 'idle' | 'pending' | 'ready' | 'error';
  contextKey?: string;
  candidates: Array<{ taskId: string; rank: 1 | 2 | 3; reason: string }>;
  error?: string;
};

type MemberWorkMapDraft = {
  sourceTaskId: string;
  sourceJobId?: string;
  task: WorkLibraryTask;
  contextText: string;
  confirmed: boolean;
};
```

새 persist version에서 `session.status`가 없는 legacy 데이터는 `anonymous`로 읽는다. 기존 sample persona는 로그인 폼의 선택적 빠른 입력값으로만 사용할 수 있으며 자동 인증 근거가 아니다.

### 4.1 저장 원칙

- API key와 provider secret은 persist 대상이 아니다.
- `simple | detailed`는 표시 모드이며 SOP 문서의 업무 데이터로 저장하지 않는다.
- 추천 결과는 Work Map 확정 권위가 아니다.
- Work Map은 선택한 Task의 편집 snapshot이며 원본 Task Library catalog와 분리한다.
- 저장된 SOP에는 사용한 Task/Activity/Skill snapshot과 업무맥락 provenance를 보존한다.

### 4.2 무효화 규칙

| 변경 | 무효화 대상 | 보존 대상 |
|---|---|---|
| 로그인 구성원 변경 | 미확정 context, 추천, Work Map | 서버에 저장된 기존 SOP records |
| 제출 전 context 편집 | 기존 미완료 추천 상태 | context draft |
| 제출 후 context 재편집 확정 | 추천 후보, Task 확인, 미확정 Work Map | 이전 입력을 취소할 선택권 |
| Task 후보 변경·확정 | 기존 Work Map draft | context confirmed text |
| T/A/S 편집 | Work Map confirmation | 편집 내용과 추천 provenance |
| simple/detailed 전환 | 없음 | 모든 Work Map 데이터와 선택 항목 |

이미 편집한 Work Map을 context 변경으로 초기화할 때는 사전 경고와 명시적 확인이 필요하다. 자동 삭제하지 않는다.

## 5. 추천 API 계약

기존 `POST /api/sop/task-recommendations` 경계를 유지한다.

### 5.1 Request

```text
member: employeeId, name, organization, jobRole
job: prototype candidate scope identity
briefWorkDescription: confirmed memberWorkContext
candidates: taskId, name, description
model settings: existing model/reasoning/API-key boundary
```

### 5.2 Response

```text
candidates[0..3]: taskId, rank, reason
```

### 5.3 서버 규칙

- 입력 공백과 후보 0개는 모델 호출 전에 400으로 거부한다.
- 후보에 없는 Task ID를 반환하지 않는다.
- 최대 3개, 고유 ID, 1부터 연속되는 rank를 요구한다.
- 실패가 Work Map Store를 변경해서는 안 된다.
- 모델·API key 해석은 `src/server/ai/model-factory.ts`를 계속 사용한다.
- 후보 전체를 prompt에 넣기 어려운 규모가 되기 전까지 벡터 검색 인프라를 가정하지 않는다.
- 실제 Task Library DB adapter 도입 시에도 UI는 같은 request/response port를 사용한다.

## 6. SOP 생성 및 대표 표준안 품질 계약

- `REQ-NODE-001`: 모든 business node는 구체적인 실행 대상과 행동 동사를 가진 최소 유효 단일 행동이어야 한다.
- `REQ-NODE-002`: 모든 business node는 책임 역할과 능동태 실행 의미를 보존해야 한다.
- `REQ-NODE-003`: decision 조건과 완료 기준은 관찰 가능하고 입력 근거가 있어야 한다.
- `REQ-NODE-004`: 정의되지 않은 전문 용어·약어는 glossary issue로 처리해야 한다.
- `REQ-NODE-005`: 입력에 없는 수치·SLA·confidence threshold를 생성하지 않아야 한다.
- `REQ-AOP-001`: Mission은 문서 수준, tool policy와 escalation/HITL은 적용 node 수준의 구조화 의미로 보존해야 한다.
- `REQ-AOP-002`: descriptive tool 목록을 실제 실행 권한으로 간주하지 않아야 한다.
- `REQ-AOP-003`: Agent화 제안, 구성원 판단, tool 실행 권한을 서로 분리해야 한다.
- `REQ-AOP-004`: 검증된 구조화 객체를 공통 Markdown template으로 투영하되 Markdown 자체를 실행 권한의 원본으로 사용하지 않아야 한다.
- `REQ-STD-001`: 대표 표준안 source sanitization은 PII를 제거하면서 책임·입출력·조건·도구 의미를 보존해야 한다.
- `REQ-STD-002`: 승인 원본 사이의 threshold·책임·tool policy 충돌을 임의 대표값으로 확정하지 않고 표준화 이슈로 반환해야 한다.
- `REQ-STD-003`: 대표 표준안도 개인 SOP와 같은 node 작성 품질 검증을 통과해야 한다.
- `REQ-STD-004`: 대표 표준안은 AI 초안이며 자동 저장·공식 확정·agent 실행을 수행하지 않아야 한다.

세부 schema, 생성 후 validation/repair 순서, hard issue와 warning, 테스트 fixture는 [NODE_AUTHORING_AND_AGENT_CONTROL.md](NODE_AUTHORING_AND_AGENT_CONTROL.md)를 권위 원본으로 사용한다.

## 7. UI/UX와 디자인 검토 계약

### 7.1 디자인 원칙

- 화면마다 primary action은 하나다.
- 현재 단계, 완료 조건, 다음 결과를 제목과 설명에서 바로 알 수 있어야 한다.
- 읽기 전용 설명보다 입력과 결정 요소를 먼저 배치한다.
- 고급 옵션과 보조 도움은 점진적으로 공개한다.
- 색상은 의미를 가져야 하며 `docs/DESIGN_CONVENTIONS.md`의 token/meta를 재사용한다.
- 1440×900, 1920×1080, zoom 100%를 기준으로 한다.
- 모바일은 설계 대상이 아니다.

### 7.2 Claude 디자인 검토 게이트

구현 담당 Claude Opus는 디자인 기능을 실제 사용하고 다음 결과를 남겨야 한다. 호출하지 않았으면 사용했다고 보고할 수 없다.

1. **IA 검토**: 로그인 → 맥락 → 로딩 → 추천 → 두 Work Map의 단계 수와 각 화면의 단일 과업 비평
2. **밀도 검토**: Activity 14개 × Skill 5개 fixture를 기준으로 simple/detailed wireframe 비교
3. **시각 검토**: 1440×900과 1920×1080 스크린샷에서 hierarchy, whitespace, footer obstruction, 독립 스크롤 확인
4. **상호작용 검토**: loading/error/empty, drawer/dialog, keyboard focus, destructive action 확인

디자인 제안은 고객 요구나 데이터 불변식을 변경할 권위가 없다. 제안이 계약과 충돌하면 계약을 유지하고 충돌을 보고한다.

### 7.3 접근성

- 모든 입력에 연결된 label과 field-level error를 제공한다.
- stepper/navigation은 현재 단계를 `aria-current`로 표시한다.
- loading 시작·성공·실패를 접근 가능한 status로 전달한다.
- dialog/drawer는 focus trap, 닫기, Esc, 제목 연결을 제공한다.
- icon-only button은 accessible name을 가진다.
- 색상만으로 선택·오류·완료를 구분하지 않는다.

## 8. 수용 테스트

### 8.1 도메인·상태

- `TST-STATE-001`: anonymous 사용자가 `/sop/context`에 직접 접근하면 로그인 게이트로 이동한다.
- `TST-STATE-002`: 유효한 구성원 정보 제출 후 context 입력 페이지로 이동한다.
- `TST-STATE-003`: context 제출 한 번에 추천 API 호출은 한 번만 발생한다.
- `TST-STATE-004`: 추천 요청과 SOP 생성 요청의 업무맥락 문자열이 동일하다.
- `TST-STATE-005`: context 변경을 확정하면 오래된 추천과 미확정 Work Map이 무효화된다.
- `TST-STATE-006`: simple/detailed 전환은 Store 데이터와 confirmation을 변경하지 않는다.

### 8.2 추천

- `TST-REC-001`: 공백 입력은 API 호출 0회다.
- `TST-REC-002`: 중복·unknown Task ID·비연속 rank는 적용하지 않는다.
- `TST-REC-003`: 추천 성공만으로 Task가 확정되지 않는다.
- `TST-REC-004`: 명시적 확인 후에만 selected Task snapshot이 생성된다.
- `TST-REC-005`: API 실패 후 입력이 보존되고 수동 Task 선택이 가능하다.
- `TST-REC-006`: 로딩 도움말은 표시되지만 confidence나 가짜 진행률은 없다.

### 8.3 Work Map

- `TST-WM-001`: 대표 Task에서 Activity 14개와 Skill 관계 70개를 손실 없이 읽는다.
- `TST-WM-002`: simple과 detailed가 같은 Task/Activity/Skill ID를 렌더링한다.
- `TST-WM-003`: simple에서 편집한 Activity명이 detailed에 즉시 동일하게 보인다.
- `TST-WM-004`: detailed에서 편집한 Skill 설명이 simple 편집 drawer에 동일하게 보인다.
- `TST-WM-005`: add/delete/reorder가 Work Map confirmation을 해제한다.
- `TST-WM-006`: Skill이 5개가 아니어도 이름이 유효하면 저장 가능하다.
- `TST-WM-007`: 편집이 원본 Task Library fixture를 변경하지 않는다.
- `TST-WM-008`: 확정 후 생성 request가 모든 Activity를 원본/편집 순서대로 포함한다.

### 8.4 생성 node·대표 표준안

- `TST-GEN-001`: 개인 SOP node가 행동·책임·완료기준 계약을 wire에서 document까지 보존한다.
- `TST-GEN-002`: 모호·피동·복합 행동 fixture가 repair 또는 사람 검토 issue로 표면화된다.
- `TST-GEN-003`: unknown tool, 입력에 없는 threshold, 금지 권한이 blocking issue다.
- `TST-GEN-004`: 표준안 source summary가 PII 없이 역할·입출력·조건·도구 의미를 전달한다.
- `TST-GEN-005`: 원본 간 충돌이 `standardizationIssues`로 반환되고 임의 확정되지 않는다.
- `TST-GEN-006`: 표준안 생성이 repository 또는 agent executor를 호출하지 않는다.

### 8.5 UI와 브라우저

- `TST-UI-001`: 1440×900에서 로그인과 context 페이지의 primary action이 첫 viewport에 보인다.
- `TST-UI-002`: simple 페이지에서 14개 Activity를 페이지 전체 무한 확장 없이 탐색한다.
- `TST-UI-003`: detailed 페이지에서 선택 Activity의 5개 Skill 설명을 읽고 편집할 수 있다.
- `TST-UI-004`: fixed footer가 마지막 Activity/Skill과 action을 가리지 않는다.
- `TST-UI-005`: 1920×1080에서도 content width가 과도하게 늘어나지 않는다.
- `TST-UI-006`: 키보드만으로 로그인, context 제출, 추천 확인, 뷰 전환, Work Map 완료가 가능하다.

소스 문자열 assertion만으로 사용자 여정 완료를 주장하지 않는다. 순수 domain, API, component, browser 시나리오를 조합한다.

## 9. 완료 정의

- 로그인 게이트부터 Work Map 완료까지 실제 순서대로 이동한다.
- 단일 업무맥락이 추천과 SOP 생성에 동일하게 사용된다.
- 추천 pending 동안 도움말 순환과 접근 가능한 상태 안내가 작동한다.
- 추천은 최대 3개이고 구성원 확인 전에는 Store를 확정하지 않는다.
- simple/detailed가 별도 페이지로 존재하면서 같은 Work Map을 공유한다.
- 양쪽 페이지에서 T/A/S 전체 편집 기능에 접근할 수 있다.
- 기존 Task-wide Activity–Sub Action 생성과 Workspace로 연결된다.
- 개인 SOP와 대표 표준안이 공통 node 작성 계약을 통과하고, tool/HITL 정보가 Agent화 판단과 분리된다.
- 대표 표준안의 PII 제거·충돌 표면화·비자동확정 경계가 유지된다.
- 기존 Home, 승인, HR, `/flow` 회귀가 없다.
- Claude 디자인 검토 결과와 두 viewport 브라우저 증거가 남아 있다.
- `npx tsc --noEmit`, `npm run lint`, `npm run test:sop`, `npm run test:sop-demo`, `npm run build`, `npm run verify:quality`, `npm run verify:sop-customer -- --final`, `npm run verify:sop-customer -- --scenario-final`, `git diff --check`가 통과한다.
