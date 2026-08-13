# SOP 최종 고객 시나리오 구현 작업지시서

## Executive Summary

이번 작업의 목표는 현재까지 검증된 구성원용 AI SOP 생성 기능을 `구성원 작성 → 직책자 1차 검토 → SME 2차 검토 → HR 전사 분석`으로 연결해, 고객사가 기대하는 전체 운영 장면을 한 번의 데모에서 재현하는 것이다. 완성된 프로토타입은 화면의 화려함보다 “실제 입력한 Task-Activity-Skill과 SOP가 다음 역할로 전달되고, 승인 결과와 Agent화 판단이 다시 현황·분석에 반영되는가”를 검증할 수 있어야 한다. 이를 통해 고객사는 향후 본사업 전에 사용자 경험, 역할 분담, 데이터 연결, AI 적용 지점을 구체적으로 확인하고 수정할 수 있다.

현재 SOP 구현을 전면 재작성하지 말고, 기존에 완료된 Home, Task Library, AI 추천, Work Map 편집, Task-wide SOP 생성, Activity-Sub Action 연결, Workspace, 노드별 Agent화 판단, 저장 포트를 확장한다. `/flow`는 변경하지 않는다.

## 1. 작업 기준

### 1.1 저장소와 브랜치

- 저장소: `agent-shift`
- 현재 브랜치: `agent/workflow-shape-support`
- 작업 착수 기준 HEAD: 실제 작업 시 `git log -1 --oneline`으로 다시 확인한다.
- 현재 dirty worktree의 SOP 변경은 사용자 작업이다. reset, revert, checkout 덮어쓰기, 대량 포맷으로 제거하지 않는다.

### 1.2 필수 지침

작업 전에 다음을 순서대로 완전히 읽는다.

1. `AGENTS.md`
2. 모델별 어댑터: Sonnet은 `CLAUDE.md`, Gemini는 `GEMINI.md`, Terra는 `AGENTS.md`
3. `.agents/skills/implement-sop-customer-requirements/SKILL.md`
4. 위 Skill이 지정한 네 개 reference
5. 이 작업지시서 전체

작업 전 실행:

```text
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

### 1.3 고객 근거 우선순위

1. `SOP시스템 시나리오.docx`의 기능 시나리오
2. 이후 사용자의 명시적 결정
3. `SOP 작성 및 분석 플랫폼_답변 회신.xlsx`와 T-A-S 샘플
4. 저장소 reference 계약
5. 현재 프로토타입 UI와 fixture

DOCX의 디자인 샘플은 복제 대상이 아니다. 역할, 입력, 선택, 액션, 상태 전이, 조회 결과만 반영한다.

## 2. 사실·해석·보류 구분

### 2.1 확인된 고객 요구

- 구성원 Home은 기본 정보, SOP 상태별 건수, Task/Activity/Skill 수를 보여준다.
- 활성 생성 경로는 Task 기반, 동료 SOP 기반, 기존 내가 작성한 내용 기반이다.
- 실무 자료 기반 생성은 향후 TBD이다.
- Task 기반 흐름은 자연어 업무 설명, AI Task 추천, 사용자 Task 선택, Activity·Skill Work Map 구성, Task-wide SOP 생성으로 이어진다.
- SOP는 Activity와 Sub Action으로 구성되고 Sub Action별 AI Agent화 가능성을 다룬다.
- 구성원은 편집, 임시 저장, 승인 요청, 진행 상태 확인, 반려 피드백 확인, 수정 후 재요청을 수행한다.
- 승인 시나리오는 1차 직책자와 2차 SME를 포함한다.
- 승인자는 inbox, 필터, 선택/전체 승인, 읽기 전용 검토, 승인/반려, 조직 진척도를 사용한다.
- HR은 전사·조직 현황, 상태 분포, 데이터 다운로드, Top Task, Agent화 후보 근거, 표준 SOP 후보를 조회한다.

### 2.2 프로토타입 구현 해석

- “생성 경로 3가지”와 네 개 열거 항목은 `활성 3개 + 비활성 TBD 1개`로 구현한다.
- 승인 흐름은 `draft → leader-review → sme-review → approved`를 기본 데모 경로로 한다.
- 반려는 현재 검토 단계와 피드백을 기록한 `rejected` 상태로 전환하고, 구성원이 수정 시작 시 편집 가능한 상태로 되돌린 뒤 재요청한다.
- 실제 인증 대신 `member / leader / sme / hr` 역할 전환과 고정된 데모 사용자를 사용한다.
- 현재 `SopRepository` 포트와 in-memory 어댑터를 유지하되 비영속임을 표시한다.
- HR Agent화 분석은 승인 문서의 구성원 확정 Sub Action 판단을 Task별로 단순 집계한다. 임계값이나 확률을 만들지 않는다.
- 표준 SOP 후보는 승인 문서를 Task별로 그룹화한다. 선택 그룹에서 개인정보를 제거한 승인 SOP를 입력으로 AI 대표 표준안 초안을 생성·미리 보는 장면까지 제공하되, 실제 운영 군집화·프로세스 마이닝 또는 공식 확정이라고 표현하지 않는다.

### 2.3 이번에 보류할 것

- 생산 인증, DB, 감사 이력, 정교한 조직 권한
- 실제 알림 발송과 실시간 협업
- 승인자 자동 배정, SLA, 우선순위 산식
- 파일·영상 업로드, OCR, 저장, 개인정보 정책
- Agent화 후보 임계값과 효과 점수
- 운영용 표준 SOP 군집화·프로세스 마이닝 알고리즘
- 최종 Excel 컬럼과 연도별 보존 정책
- 모바일, 다국어, on-prem 배포 작업

## 3. 현재 구현을 먼저 확인할 것

다음은 이미 존재하므로 새 기능을 별도 체계로 중복 구현하지 않는다.

- `/sop` 구성원 Home과 프로토타입 기본 정보
- SOP 상태 집계와 서버 저장 레코드 목록
- Task 기반 경로와 `/sop/setup`
- 자연어 업무 설명과 AI Task 추천 경계
- 고객 Task Library fixture와 Work Map T-A-S 편집
- Task-wide 생성, Activity coverage, Activity-Sub Action 구조
- `/sop/workspace` 편집, 캔버스, Inspector, 고객 검토 read-only
- Sub Action별 AI 제안과 구성원 Agent화 판단
- 동료 템플릿 조회·복제·개인정보 제거
- `SopRepository` 포트, Zod 스키마, in-memory reference adapter
- 현재 `draft | approval-requested | approved | rejected` 단일단계 lifecycle

작업자는 코드를 확인한 뒤 기존 기능을 `유지`, `확장`, `마이그레이션`, `신규`로 구분한 계획을 먼저 작성한다.

## 4. 구현 작업

### 작업 A — 데이터 계약과 마이그레이션

1. 생성 출처를 명시적으로 모델링한다.

```text
creationSource: task | colleague-template | own-prior
sourceTemplateId?: string
sourceRecordId?: string
```

- 기존 문서는 `task` 또는 현재 provenance로 안전하게 마이그레이션한다.
- 동료와 과거 문서 복제는 항상 새 document/record ID를 만든다.
- 동료 복제는 원본 구성원 개인정보와 피드백을 제거한다.
- 과거 문서 복제는 같은 구성원 소유권을 유지하지만 승인, reviewStatus, Agent화 확정, 피드백을 초기화한다.

2. lifecycle을 2단계 검토로 확장한다.

```text
draft
leader-review
sme-review
approved
rejected
```

- 기존 `approval-requested` 레코드는 명시적 migration으로 `leader-review`에 대응시킨다.
- `reviewStatus`와 `agentizationReview`는 lifecycle과 합치지 않는다.
- rejected 레코드에는 최소한 `rejectedAtStage`, `reasonCode`, `feedback`, `reviewedByRole`, `reviewedAt`의 최신값을 보관한다.
- 전체 감사 배열을 만들지 않는다.

3. 역할을 확장한다.

- `member | leader | sme | hr`를 API와 repository 경계에서 검증한다.
- member: 소유 초안 편집, 제출, 반려 문서 수정/재요청
- leader: leader-review 조회, 승인/반려
- sme: sme-review 조회, 승인/반려
- hr: 전체 읽기 전용 조회·집계·export
- UI의 disabled 상태만으로 권한을 보호하지 않는다.

4. 상태 전이 공용 함수를 하나만 둔다.

```text
member submit: draft/rejected-confirmed → leader-review
leader approve: leader-review → sme-review
leader reject: leader-review → rejected
sme approve: sme-review → approved
sme reject: sme-review → rejected
```

- 잘못된 role, 소유자, 현재 상태, 빈 반려 피드백은 저장소 변경 없이 거부한다.
- rejected 편집 시작 및 재확정 정책은 별도 공용 함수로 결정적으로 처리한다.

### 작업 B — 구성원 Home과 생성 경로

1. Home에 실제 데이터 기반 Task, Activity, Skill 수를 추가한다.

- 같은 record/document를 중복 집계하지 않는다.
- 반복 Skill 관계를 “보유 Skill 수”로 표시할 때 distinct인지 관계 수인지 라벨을 명확히 한다.
- 값이 없으면 0을 표시한다. 데모를 위해 임의의 양수를 넣지 않는다.

2. 생성 경로를 네 카드로 정리한다.

- Task 기반 생성: 활성
- 동료 SOP 기반 생성: 활성
- 기존 내가 작성한 내용 기반 생성: 활성
- 실무 자료 기반 생성: 비활성 `향후 제공 (TBD)`

3. 기존 작성 내용 기반 picker를 구현한다.

- 현재 구성원의 기존 records만 조회한다.
- Task, SOP 제목, 상태, 수정일, Activity/Sub Action 수를 표시한다.
- 읽기 전용 미리 보기를 제공한다.
- 원본을 보존한 새 독립 draft로 복제하고 공통 Workspace 편집으로 이동한다.
- 원본과 clone의 ID, 승인/검토/Agent화 상태가 분리되는 테스트를 추가한다.

4. 구성원 상태 목록을 상세화한다.

- 요약 위젯의 `승인 요청 중`은 leader-review와 sme-review 합계다.
- 행에는 `직책자 검토 중` 또는 `SME 검토 중`을 구분 표시한다.
- rejected 행은 반려 단계, 사유, 피드백, `수정하기` 액션을 제공한다.
- approved 행은 읽기 전용으로 열고 정상 편집 경로를 차단한다.

### 작업 C — Work Map과 SOP 생성 연결 확인

1. Task 추천은 선택이 아니다. 사용자가 Task를 확정해야 Work Map을 구성한다.
2. Work Map에서 현재 Task의 모든 Activity와 Activity별 Skill을 불러온다.
3. Activity·Skill 선택, 추가, 삭제, 수정, 순서 변경 결과가 Task-wide AI 요청과 생성 문서에 반영되어야 한다.
4. 신규 Task SOP는 모든 선택 Activity를 하나 이상의 Sub Action으로 커버한다.
5. 모든 Sub Action은 정확히 하나의 source Activity ID와 Activity 내부 순서를 갖는다.
6. Sub Action별 AI Agent화 제안과 구성원 판단을 분리하고, 구성원의 판단만 HR 집계 입력으로 사용한다.
7. 기존 Workspace 연결선 라우팅, 노드 위치 편집, 연결점 편집, hover 팝업, 성능 최적화를 훼손하지 않는다.

#### C-1. Sub Action 의미 규칙

`.agents/skills/implement-sop-customer-requirements/references/subaction-semantics-contract.md`를 생성 계약으로 사용한다.

- Sub Action은 독립적으로 수행·검토·Agent화 판단할 수 있는 최소 유효 실행 행동이다.
- Activity 설명을 `실행 행동 / 선행 결과·입력 / 산출물 / 목적·기대효과 / 순수 제어`로 먼저 분류한다.
- 실행 행동만 노드로 만든다. 선행 결과는 `inputs`, 생성 산출물은 `outputs`, 목적은 definition에 반영한다.
- 실제 판단 업무는 decision Sub Action이 될 수 있지만 병렬 fork/join은 edge로 표현하고 Sub Action 수와 Agent화 대상에서 제외한다.
- `activity-subaction-v1`의 의미론적 분해는 필수다. 기존 `복합 실행 단계 자동 분리` 옵션을 끄더라도 Activity 설명을 하나의 노드로 복사해서는 안 된다. 이 옵션은 legacy에만 적용하거나 UI에서 의미를 재정의한다.
- 독립 실행 가능하고 후속 단계가 두 결과를 모두 필요로 할 때만 병렬로 생성한다. 그렇지 않으면 순차 또는 통합 행동으로 둔다.

필수 기준 예문:

1. `수요 예측 및 갭 분석 결과를 바탕으로 중장기 제품 믹스 및 개발 우선순위를 설정하여 포트폴리오 최적화 안을 도출함`
   - 수요 예측 및 갭 분석 결과는 input이다.
   - 기본은 `제품 믹스·개발 우선순위 설정 → 포트폴리오 최적화안 도출` 2단계다.
   - 제품 믹스와 개발 우선순위를 독립적으로 수행할 수 있다는 근거가 있으면 두 병렬 단계가 최적화안 도출로 합류하는 3단계다.
2. `Auto 및 신규 응용처 고객사와 협상하여 샘플 공급 및 초기 물량 확보를 위한 비즈니스 계약을 추진함`
   - 기본은 `고객사와 공급 조건 협상 → 비즈니스 계약 추진` 2단계다.
   - 샘플 공급과 초기 물량 확보는 이 문장에서는 목적·output 조건이며, 실제 공급·배정 실행이 별도로 명시되지 않으면 노드가 아니다.

#### C-2. 직무 맥락 기반 AI 보강

- Activity 설명의 기본 분해는 `subActionOrigin: 'activity-derived'`로 표시한다.
- 구성원 직무 맥락 때문에 기존 Activity 안에 추가한 Sub Action은 `subActionOrigin: 'context-derived'`와 `subActionOriginRationale`을 보존한다.
- 맥락상 필요한 행동이 어떤 확정 Activity에도 속하지 않으면 임의 ID를 생성하거나 가까운 Activity에 강제 매핑하지 않는다.
- 이 경우 Gate의 Work Map에 `AI 제안 Activity`로 이름, 설명, 근거, 제안 Skill을 미수락 상태로 표시한다.
- 구성원이 수락·수정한 뒤에만 정식 Work Map Activity ID를 부여하고 Task-wide 생성 범위에 포함한다.
- Activity 제안의 수락·삭제와 context-derived Sub Action 변경은 review/Agentization 확정을 무효화한다.

### 작업 D — 승인자 Inbox와 읽기 전용 검토

필수 경로:

- `/sop/approvals`: leader/SME 공용 inbox와 조직 현황
- 선택 record는 같은 화면의 상세 패널 또는 `/sop/approvals/[id]`에서 연다.

필수 UI:

- 역할과 프로토타입 사용자 표시
- 요청자, 요청일, Task, 조직, 직무, 우선순위, 현재 상태
- 조직·직무·상태 필터
- 체크박스 선택, 선택 승인, 현재 필터 전체 승인
- Work Map과 SOP의 읽기 전용 미리 보기
- Activity-Sub Action 출처와 구성원 Agent화 판단 확인
- 승인 버튼
- 반려 모달: 선택 사유 + 필수 자유 서술
- 조직 SOP 작성률과 승인 완료율

필수 동작:

- leader inbox에는 leader-review만 결정 가능하게 표시한다.
- SME inbox에는 sme-review만 결정 가능하게 표시한다.
- leader 승인은 최종 승인이 아니라 SME 단계로 넘긴다.
- SME 승인만 approved를 만든다.
- bulk action도 각 row에 단일 action을 적용하는 공용 domain 함수만 호출한다.
- 부분 실패 시 성공/실패 건수를 보여주고 실패 레코드를 숨기지 않는다.
- reviewer 화면에서 문서, Work Map, Agent화 판단을 수정할 수 없다.

프로토타입 priority는 산식이 미정이다. seed에 명시된 `일반/긴급` 값만 표시하거나 전부 `일반`로 두고 `프로토타입 값`이라고 라벨링한다.

### 작업 E — 반려, 수정, 재요청

1. leader와 SME 반려 모두 reasonCode와 non-empty feedback을 요구한다.
2. member Home에서 반려 피드백을 볼 수 있어야 한다.
3. `수정하기`는 고객 검토 read-only를 결정적으로 해제하고 해당 record를 편집 가능한 상태로 연다.
4. 편집은 기존 review/Agentization 무효화 경로를 사용한다.
5. 문서 재확정 후 재요청하면 leader-review부터 시작한다. 이 규칙은 `프로토타입 기준`으로 표시한다.
6. source record를 새 record로 바꾸거나 반려 피드백을 동료 template에 복사하지 않는다.

### 작업 F — HR 대시보드와 분석

필수 경로: `/sop/hr`

필수 UI와 계산:

1. 전사/조직 필터
2. 작성 참여 구성원 수
3. SOP 작성 건수
4. 최종 승인 건수와 승인 완료율
5. lifecycle 분포
6. Top Task: 현재 필터의 record 수 기준 내림차순
7. Agent화 근거: approved record의 member-confirmed Sub Action 판단을 Task별 mode count로 표시
8. 표준 SOP 후보: approved records를 Task ID로 그룹화하고 원본 수, 조직 수, 최근 수정일 표시
9. 대표 표준안 초안: 후보 그룹을 선택해 approved source만으로 AI 초안을 생성하고 source record provenance와 미리보기 표시
10. 상세 row export

가드레일:

- 수치는 repository records에서 계산한다.
- 같은 record를 중복 집계하지 않는다.
- Task명 대신 Task ID를 grouping key로 사용한다.
- percentage 분모와 기간을 화면에 설명한다.
- Agent화 “후보” 여부를 임의 threshold로 확정하지 않는다.
- 표준안 AI 요청에서 구성원 이름, 사번, 조직, reviewer feedback을 제거한다.
- 대표 표준안 생성 결과는 `AI 초안`이며 공식 표준으로 자동 저장·확정하지 않는다.
- 표준 SOP 후보 버튼이나 카드는 실제 운영용 군집화·프로세스 마이닝을 완료한 것처럼 표현하지 않는다.
- CSV export는 필수다. XLSX는 안정적인 기존 의존성과 테스트가 있을 때만 추가한다.
- HR은 현재 프로토타입에서 읽기 전용이다.

### 작업 G — 시나리오 seed와 역할 전환

1. 결정적인 seed를 별도 SOP 모듈에 둔다.
2. 최소한 다음 장면을 재현한다.

- member A: draft 1건, leader-review 1건, rejected 1건
- member B: sme-review 1건
- member C: approved 및 templateEligible 1건
- 여러 조직과 최소 두 Task
- Sub Action별 서로 다른 Agent화 판단

3. 역할 전환은 명확히 `데모 역할 전환`으로 표시한다.
4. seed를 여러 번 실행해도 중복 record가 생기지 않는다.
5. 고객 T-A-S fixture와 scenario record seed를 한 파일로 섞지 않는다.
6. 새로 생성한 member 요청이 같은 실행 중 leader/SME/HR 화면에 실제로 나타나야 한다.

### 작업 H — UI/UX

- DOCX 이미지를 모사하지 않는다.
- 기존 SOP 디자인 토큰과 컴포넌트 패턴을 유지한다.
- material layout 변경 전에 Stitch MCP가 실제 호출 가능하면 검토 의견을 받는다.
- Stitch에는 역할별 정보 구조, 데스크톱 밀도, 읽기 전용 검토, bulk action 안전성, 1440×900/1920×1080 조건을 전달한다.
- Stitch가 없거나 계정 연결이 안 되면 그 사실을 보고하고 기존 디자인 시스템으로 진행한다.
- 1440×900, 1920×1080, zoom 100%에서 핵심 기능이 보이고 footer가 내용을 가리지 않아야 한다.
- 키보드 focus, dialog label, disabled reason, loading/error/empty state를 제공한다.
- 긴 목록은 화면 전체를 무한히 늘리지 말고 독립 스크롤과 고정 action 영역을 사용한다.

## 5. 권장 API와 모듈 경계

이름은 저장소 구조에 맞춰 조정할 수 있지만 책임은 분리한다.

```text
src/lib/sop-lifecycle.ts               상태와 전이 규칙
src/lib/sop-review-assignment.ts       역할/단계 스코핑
src/lib/sop-prior-clone.ts             과거 내 문서 복제
src/lib/sop-analytics.ts               순수 집계 함수
src/lib/sop-export.ts                  필터 결과 export
src/lib/sop-scenario-seed.ts           결정적 데모 레코드
src/app/api/sop/[id]/lifecycle/...      상태 전이 API
src/app/api/sop/approvals/...           역할별 inbox API
src/app/api/sop/analytics/...           HR 읽기 전용 API
src/app/api/sop/standard-drafts/...     PII 제거된 대표 표준안 AI 초안 API
src/app/sop/approvals/...               승인자 화면
src/app/sop/hr/...                      HR 화면
```

- route에서 임의로 상태를 바꾸지 말고 domain/repository 공용 함수를 호출한다.
- analytics와 export는 같은 selector 결과를 사용한다.
- standard-draft request/response를 공용 Zod schema로 검증하고 승인된 동일 Task sourceRecordIds만 허용한다.
- schema와 TypeScript type을 중복 수기 관리하지 않는다.
- 공유 `/api/ai`를 변경해야 하면 SOP 분기만 격리하고 `/flow` 회귀를 확인한다.

## 6. 필수 회귀 테스트

새 테스트 파일 권장:

```text
tests/sop-customer-scenario.test.ts
tests/sop-approval-flow.test.ts
tests/sop-hr-analytics.test.ts
```

반드시 검증한다.

### Home/생성

- 기본 정보 5개, lifecycle 건수, Task/Activity/Skill 수 표시
- 활성 생성 경로 3개와 disabled TBD 1개
- own-prior 목록은 현재 member record만 노출
- own-prior clone은 새 ID와 초기화 상태를 갖고 source는 불변
- 동료 clone은 개인정보와 피드백을 노출하지 않음
- Work Map 편집이 생성 요청과 문서 source에 반영
- AI 제안 Activity는 미수락 상태에서 생성 범위에 포함되지 않고, 수락 후에만 포함
- `subActionOrigin`의 activity-derived/context-derived 구분 및 context-derived의 `subActionOriginRationale` 보존
- 두 필수 예문에서 input·목적·산출물 pseudo-node가 생성되지 않는 reference/orchestration 검증
- 독립성 근거가 있을 때만 병렬 분기·합류하며 pure fork/join은 Sub Action/Agent화 수에서 제외

### Lifecycle/권한

- member submit: draft → leader-review
- leader approve: leader-review → sme-review
- SME approve: sme-review → approved
- leader/SME rejection은 reasonCode와 feedback 필수
- member self-approval, leader의 SME 단계 승인, SME의 leader 단계 승인 거부
- rejected 문서의 피드백 표시, 수정, reconfirm, 재요청
- rejected/approval/approved 상태와 문서 변경 불변식
- bulk approve가 공용 single-record transition을 사용하고 부분 실패를 보고
- reviewer read-only에서 Store mutation 차단

### HR

- organization filter와 lifecycle 분포
- 참여자, 건수, 승인율의 정확한 분모
- Task ID 기반 Top Task 집계
- approved record만 Agent화 근거 집계
- 미지정 member 판단과 terminal node 제외
- 표준 SOP 후보 grouping의 record/organization 수
- 대표 표준안 초안은 동일 Task의 approved records만 사용하고 PII를 제거하며 자동 확정하지 않음
- export row와 현재 filter 결과 일치
- 빈 데이터는 0/empty state이며 임의 수치 없음

### E2E orchestration

- member가 제출한 동일 record가 leader inbox에 나타남
- leader 승인 후 동일 record가 SME inbox에 나타남
- SME 승인 후 member Home과 HR 집계가 갱신됨
- leader 또는 SME 반려 후 member가 feedback을 보고 수정·재요청함
- process restart 시 비영속이라는 안내가 존재함

소스 문자열 검색만으로 통과시키지 않는다. 순수 domain test, API test, component/orchestration test를 조합한다.

## 7. 필수 검증

```text
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
git diff --check
git status --short
```

브라우저로 다음을 확인한다.

1. 1440×900, 100%
2. 1920×1080, 100%
3. member Home → Task 생성 → Workspace → 승인 요청
4. 역할 전환 → leader 승인 → SME 승인
5. member/HR 결과 반영
6. 반려 → feedback → 수정 → 재요청
7. 동료와 과거 내 문서 복제
8. footer, modal, tooltip, canvas, sidebar가 서로 가리지 않음

## 8. 모델 협업 방식

한 모델이 전체를 수행할 수 있다. 분담할 경우에도 동일 dirty worktree에 동시 쓰기하지 않는다.

권장 순서:

1. **Sonnet 5 / Claude Code**: 작업 A, repository/API 전이, own-prior clone, 승인 도메인
2. **Gemini 3.6 Flash / Antigravity**: 작업 B·D·F·H의 화면과 시나리오 연결
3. **GPT-5.6 Terra / Codex**: 작업 G, 테스트, diff 검토, 전체 회귀, 잔여 결함 수정

이는 강제 역할이 아니다. 각 모델은 자신이 맡은 단계의 선행 계약이 실제로 구현됐는지 확인해야 한다.

매 handoff에 반드시 남긴다.

- 변경 파일
- 완료한 checklist 항목
- 남은 항목
- schema/migration 결정
- 테스트 실행 결과와 실패 로그
- Stitch 사용 여부
- 알려진 한계

다음 모델은 narrative 요약만 믿지 말고 diff와 테스트를 다시 확인한다.

## 9. 완료 기준

다음이 모두 충족되어야 완료다.

- 고객 시나리오의 구성원, 직책자, SME, HR 흐름이 실제 같은 record로 연결된다.
- 세 활성 생성 경로와 한 TBD 경로가 의도대로 작동한다.
- Task-Activity-Skill → Activity-Sub Action → Agent화 판단 provenance가 보존된다.
- 2단계 승인, 반려 피드백, 수정·재요청이 API와 UI 모두에서 작동한다.
- HR 지표가 저장된 records에서 계산되고 집계 규칙이 투명하다.
- 기존 `/flow`, SOP 캔버스 편집, read-only, 연결선, 저장·생성 테스트가 유지된다.
- 필수 명령과 브라우저 시나리오가 통과한다.
- 생산 기능이 아닌 항목은 프로토타입·비영속·TBD로 정확히 표시된다.

## 10. 결과 보고

작업 완료 후 다음 형식으로 보고한다.

1. 변경 파일
2. 구현한 고객 확정 요구
3. 도입한 프로토타입 해석
4. data/schema/migration 변경
5. 역할별 화면과 상태 전이
6. 테스트 및 브라우저 검증 결과
7. Stitch 사용 여부
8. 남은 미확정·보류 항목

커밋과 푸시는 사용자가 현재 요청에서 명시적으로 승인한 경우에만 수행한다.
