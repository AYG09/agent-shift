# SOP 코드 품질 리뷰 및 Sonnet 5 작업지시서

## 1. 검토 범위와 판정 기준

- 범위: `src/app/sop`, `src/components/sop`, `src/components/sop-demo`, `src/lib/sop-*`, `/api/ai`의 SOP 생성 분기, `tests/sop*.test.ts`
- 기준: 이해 가능성, 타입·배열 규칙성, 동일 기능 통합관리, Dead code, UI 기능과 서버/저장 계층의 연결성
- 판정 전제: 현재 구성원 UI는 고객 요구 확인과 AI SOP 생성·편집의 실제 동작 검증을 위한 프로토타입이다. 다만 향후 리더·전사 HR UI가 구성원 SOP를 이어받을 수 있도록 공용 영속 저장과 최소 역할 식별은 준비한다. 변경 감사 이력과 정교한 권한 체계는 이번 범위에서 제외한다.

## 2. 요약 판정

| 기준 | 판정 | 핵심 근거 |
|---|---|---|
| 인간·AI 모델 엔지니어가 이해 가능한가 | 부분 충족 | 도메인 주석과 순수 검증 함수는 양호하나, 955줄 Store·727줄 Inspector·1,127줄 통합 API route와 한 줄 JSX가 변경 경계를 흐린다. |
| Type·Code 배열/정렬에 규칙성이 있는가 | 부분 충족 | 핵심 문서 타입은 존재하지만 요청 타입이 `string`으로 넓어지고, 서버는 `body`를 직접 cast하며, 상태 표시·분기 옵션이 여러 파일에 반복된다. |
| 동일 기능을 통합관리하는가 | 미충족 | 실제 SOP와 Demo가 별도 타입·Store·Agent화 분류를 사용하며 현재 서로 다른 용어와 상태 모델을 가진다. 노드 크기·분기 판정도 중복된다. |
| Dead code가 있는가 | 미충족 | 제거된 콘텐츠 표시 수준의 `SopDisplayMode`가 남아 있고, 사용되지 않는 export/action과 외부 요구사항 번호 주석이 존재한다. |
| UI 기능을 뒷받침하는 백엔드가 있는가 | 부분 충족 | AI 생성·입력 설정 검증·응답 스키마·그래프 복구는 서버에 있다. 현재 단일 사용자 프로토타입은 `localStorage`로 동작하지만, 향후 리더·전사 HR UI가 같은 SOP를 조회하려면 공용 영속 저장과 최소 역할 식별이 추가로 필요하다. 감사 이력·세분화 권한은 이번 판정 대상이 아니다. |

## 3. 검증된 주요 결함

### P0 — 즉시 수정

1. `고객 검토 모드`가 읽기 전용을 보장하지 않는다.
   - `SopWorkspace.tsx:178-216`은 일부 상단 버튼만 숨긴다.
   - `SopWorkspace.tsx:294-299`는 모드와 무관하게 편집 가능한 Canvas와 Inspector를 렌더링한다.
   - `SopStepInspector.tsx`와 `SopCanvas.tsx`는 `customerReviewMode`를 읽지 않으며 단계·SKILL·연결선 수정 action을 그대로 호출한다.
   - Store mutation에도 검토 모드 guard가 없어 UI 우회 호출을 막지 못한다.

2. SKILL 변경 후에도 확정된 Agent화 판단이 유효한 것으로 남는다.
   - `sop-prototype-store.ts:712-797`의 `acceptAiSkill`, `rejectAiSkill`, `addSkillToStep`, `removeSkillFromStep`는 SOP 상태를 초안으로 돌리지만 `agentizationReview.confirmedAt`을 초기화하지 않는다.
   - 반면 단계·연결선 변경은 `resetAgentizationConfirmation`을 호출한다. 동일한 의미 변경에 상반된 무효화 규칙이 적용된다.

3. Agent화 미지정 값이 타입 밖의 빈 문자열로 Store에 들어갈 수 있다.
   - `SopAgentizationPanel.tsx:63`은 빈 `<option value="">`을 `SopAiApplicationMode`로 강제 cast한다.
   - `sop-prototype-store.ts:374-385`는 런타임 검증 없이 값을 저장한다.
   - 미지정은 사람 수행이라는 현재 정책에 맞게 action이 `undefined`를 명시적으로 받아 mapping을 삭제해야 한다.

### P1 — 구조 통합 및 계약 보강

4. Demo와 실제 SOP의 Agent화 모델이 분기됐다.
   - 실제: `SopAiApplicationMode = 'automation' | 'assist'`, 노드별 `stepModes`.
   - Demo: `sop-demo-store.ts:12`의 `'automation' | 'collaboration'`, 단일 전역 `agentizationMode`.
   - `DemoWorkspace.tsx:179-184`도 `AI 대체/AI 협업`을 표시한다. 고객 검증용 Demo가 실제 제품과 다른 결정을 학습시키는 상태다.

5. SOP 생성 요청의 단일 스키마가 없다.
   - `sop-ai-request.ts:21,25`는 `detailLevel`, `branchPolicy`를 넓은 `string`으로 선언한다.
   - `route.ts:820-824`는 `request.json()` 결과에서 `apiKey?.trim()`을 바로 호출한다. 숫자·객체 입력은 500을 유발할 수 있다.
   - `route.ts:925-965`는 일부 구조 설정만 검증하고 나머지는 `body`에서 직접 프롬프트로 전달한다.
   - Zod 요청 스키마에서 타입을 infer하고 클라이언트·서버가 같은 계약을 써야 한다.

6. 향후 역할별 UI가 이어받을 공용 SOP 저장 경계가 없다.
   - `sop-prototype-store.ts:819-881`의 `confirmFullSop`과 `saveSnapshot`은 Zustand 문서와 시간만 갱신한다.
   - persist 대상은 `localStorage`이며 SOP 저장/확정/Agent화 판단을 처리하는 서버 endpoint가 없다.
   - 현재 구성원 단독 프로토타입의 기능 결함은 아니지만, 리더·전사 HR UI가 구성원이 만든 SOP를 조회·검토하려면 공용 저장소가 필요하다.
   - 최소 저장 범위는 SOP ID, 구성원·조직 식별자, 문서 본문, 검토 상태, 노드별 Agent화 판단, 현재 버전, 생성·수정 시각이다.
   - 이번 범위에서는 모든 변경의 감사 로그, 세부 조직 계층별 ACL, SSO·IAM 연계 같은 정교한 권한 체계를 구현하지 않는다.

7. 핵심 모듈의 책임이 과도하게 크다.
   - `sop-prototype-store.ts`: 955줄, Gate·Work Library·그래프 편집·검토·Agent화·history·persist를 한 Store에서 처리한다.
   - `SopStepInspector.tsx`: 727줄, edge/step/terminal/SKILL/실행정보 편집을 한 컴포넌트에서 처리한다.
   - `/api/ai/route.ts`: 1,127줄, 일반 Flow와 SOP의 prompt·검증·repair·provider 호출을 모두 포함한다.
   - 기능별 순수 domain 함수와 얇은 Zustand/UI/API adapter로 분리해야 회귀 원인을 좁힐 수 있다.

### P2 — 정리 및 유지보수성

8. 제거된 콘텐츠 표시 수준의 잔재가 있다.
   - `sop-types.ts`의 `SopDisplayMode`, `SopDocument.displayMode`는 남아 있다.
   - `sop-canvas-utils.ts:12`와 `sop-rework-routing.ts:46`은 `void displayMode`로 값을 버린다.
   - `SopStepNode.tsx:15`는 항상 `compact`를 강제한다. 실제 동작이 하나라면 타입·필드·인자를 제거한다.

9. 동일 규칙과 표현이 중복된다.
   - `isSecondaryBranch`가 `sop-layout.ts:6`과 `sop-rework-routing.ts:18`에 중복된다.
   - 노드 크기는 `getSopNodeSize`와 `stepBounds`가 각각 정의한다.
   - review 상태 라벨/색상 조건이 Workspace·Sidebar·Inspector·Node에 반복된다.
   - Inspector의 branch option 배열도 두 갈래에서 반복된다.

10. 명백한 미사용 코드와 문맥 의존 주석이 남아 있다.
    - 미사용: `hasSopSetupErrors`, `SopGenerationResponse`, `setCustomerReviewMode`.
    - `Item 5`, `Item 9 Requirement`, `Item 11` 같은 외부 작업 번호 주석은 코드 자체만 읽는 엔지니어와 AI 모델에 의미가 없다. 실제 invariant 또는 사용자 행위 기준으로 바꾼다.

11. 테스트가 domain/store 중심이며 실제 UI 상호작용을 증명하지 않는다.
    - `tests/sop.test.ts`와 `tests/sop-demo.test.ts`는 그래프·Store·요청 파이프라인을 폭넓게 검증한다.
    - 그러나 고객 검토 모드의 입력 비활성화, Agent화 select의 미지정 전환, 모달/버튼 동작, 화면과 Store 동기화는 컴포넌트 상호작용 테스트가 없다.

## 4. Sonnet 5 작업지시서

아래 작업을 기존 SOP 기능의 전면 재작성 없이 순서대로 수행한다. `/flow` 동작과 기존 그래프 검증 규칙은 변경하지 않는다. 각 단계는 별도 커밋이 가능하도록 작게 유지한다.

### 목표

1. 고객 검토 모드, Agent화 판단, SKILL 수정의 상태 규칙을 일관되게 만든다.
2. Demo와 실제 SOP가 같은 Agent화 용어·타입·선택 규칙을 사용하게 한다.
3. SOP 요청 계약, Store, Inspector, API route의 책임을 분리한다.
4. 제거된 표시 수준 잔재와 명백한 미사용 코드를 제거한다.
5. 구성원 SOP를 향후 리더·전사 HR UI가 같은 데이터로 조회할 수 있는 최소 공용 저장 경계를 만든다.

### 작업 A — 기능 무결성(P0)

1. 고객 검토 모드를 실제 읽기 전용으로 만든다.
   - `SopCanvas`, `SopStepInspector`, `SopSidebar`, `SopAgentizationPanel`에 명시적인 `readOnly` 흐름을 둔다.
   - 편집 control을 숨기기만 하지 말고 disabled 상태와 설명을 제공한다.
   - Store의 문서 mutation action도 `customerReviewMode === true`일 때 변경을 거부한다. navigation/selection은 허용한다.
   - 금지 범위: 단계·연결선·SKILL·문서 제목·Agent화 판단·확정 상태 변경, undo/redo, 단계 추가/삭제/복제.

2. 모든 의미 변경에서 Agent화 확정을 무효화한다.
   - 네 가지 SKILL action에 `resetAgentizationConfirmation`을 적용한다.
   - 공통 `applyDocumentMutation` 또는 동등한 순수 helper로 `history push → review invalidation → agentization invalidation → updatedAt` 규칙을 한 곳에서 실행한다.

3. Agent화 미지정 값을 정상 모델링한다.
   - `setAgentizationStepMode(stepId, mode?: SopAiApplicationMode)`로 바꾸고 `undefined`면 해당 key를 삭제한다.
   - UI에서 빈 option을 선택하면 `undefined`를 전달한다. `as SopAiApplicationMode`로 빈 문자열을 위장하지 않는다.
   - `defaultMode`는 과거 데이터 migration에만 사용하고 현재 판단 조회의 fallback으로 사용하지 않는다. 일괄 지정은 `stepModes`에 명시값을 쓴다.
   - 확인은 선택된 모든 단계에 명시적인 `stepModes[id]`가 있을 때만 성공한다.

### 작업 B — Demo/실제 기능 통합(P1)

1. `SopAiApplicationMode`, `AI_APPLICATION_MODES`, Agent화 normalize/조회 규칙을 Demo에서도 재사용한다.
2. Demo의 전역 `agentizationMode`를 제거하고 실제와 같은 노드별 `stepModes`를 사용한다.
3. 표시 문구를 `AI Agent 후보`, `AI 지원`, `미지정=사람 수행`으로 통일한다.
4. Demo fixture 전용 타입이 실제 SOP 타입과 구조적으로 같은 필드는 공용 타입을 재사용하고, Demo에만 필요한 필드만 별도 확장한다.

### 작업 C — 타입·요청 계약(P1)

1. `SopGenerationRequestSchema`를 추가한다.
   - `action: z.literal('generateSop')`
   - member/task/activity/activities/skills/context
   - `detailLevel`, `branchPolicy`, 단계·분기·재작업 제약
   - 선택적 `apiKey`, `model`, `reasoning`
2. `SopGenerationRequest` 타입은 스키마에서 infer한다.
3. `buildSopGenerationRequestBody` 반환형과 API SOP handler 입력이 이 타입을 공유하게 한다.
4. SOP case 진입 즉시 `safeParse`하고 실패 시 field issue를 포함한 400을 반환한다. 잘못된 `apiKey` 타입이 500을 만들지 않게 한다.
5. `detailLevelGuide`, `branchPolicyGuide`, UI option 순서는 typed readonly metadata를 단일 source of truth로 사용한다.

### 작업 D — 모듈 책임 분리(P1/P2)

전면 rewrite를 금지하고 아래 경계부터 추출한다.

1. Store
   - `sop-document-mutations.ts`: 단계·연결선·SKILL mutation과 invalidation 규칙
   - `sop-review.ts`: 단계 검토·전체 확정 검증
   - `sop-agentization.ts`: Agent화 migration·selection·confirmation 순수 함수
   - Zustand Store는 상태 연결과 persistence adapter 역할만 유지한다.

2. Inspector
   - `SopEdgeInspector`
   - `SopStepCoreEditor`
   - `SopSkillEditor`
   - `SopExecutionEditor`
   - 각 컴포넌트는 필요한 selector/action만 구독하고 whole-store subscription을 제거한다.

3. API
   - `/api/ai/route.ts`의 SOP prompt·request parsing·pipeline 실행을 `src/server/sop/` 아래로 추출한다.
   - 기존 `/flow` action의 동작·응답 형태는 바꾸지 않는다.

### 작업 E — 공용 규칙 및 Dead code(P2)

1. 노드 geometry를 공용 모듈로 이동해 canvas와 rework router가 같은 size/bounds를 사용하게 한다.
2. `isSecondaryBranch`, branch option metadata, review status metadata를 중복 없이 공유한다.
3. 콘텐츠 표시 수준이 실제로 하나뿐이면 `SopDisplayMode`, `SopDocument.displayMode`, 관련 함수 인자와 테스트를 제거한다. `SopSetupConfig.detailLevel`은 업무 분해 수준이므로 유지한다.
4. 사용되지 않는 export/action을 제거하거나 실제 호출 경로를 만든다.
5. `Item N/Requirement` 주석을 invariant 중심 문장으로 교체한다.

### 작업 F — 공용 영속 저장과 최소 역할 연계(P1)

목표는 구성원 UI가 만든 SOP를 향후 리더 UI와 전사 HR UI가 같은 원본으로 조회할 수 있게 하는 것이다. 리더·전사 HR 화면 자체는 이번 작업에서 구현하지 않는다.

1. 기존 인프라를 먼저 확인한다.
   - 저장소, 인증, 사용자·조직 데이터 연결이 이미 구성돼 있으면 그것을 재사용한다.
   - 구성된 영속 저장소가 없다면 특정 DB 공급자를 임의로 채택하지 않는다. 먼저 아래 repository/API 계약과 환경 요구사항을 구현·문서화하고, 실제 adapter 연결이 필요한 상태를 명확히 보고한다.

2. 저장 계층을 interface로 분리한다.
   - `SopRepository` 또는 동등한 port를 정의한다.
   - 최소 operation: `create`, `getById`, `update`, `listByMember`, `listByOrganization`.
   - `localStorage`는 구성원 단독 데모용 adapter로 격리하고 domain Store가 저장 방식을 직접 알지 않게 한다.

3. 최소 공용 데이터 계약을 정의한다.
   - `id`, `memberId`, `organizationId`
   - Work Library의 Task·Activity 식별 정보
   - SOP 문서의 단계·연결선·설정
   - 구성원 검토/확정 상태
   - 노드별 `AI Agent 후보`·`AI 지원` 판단과 판단 근거
   - `version`, `createdAt`, `updatedAt`
   - 리더 기능이 추가될 때 사용할 최신 `reviewDecision`과 `reviewComment` 필드는 선택적으로 둘 수 있으나 변경 이력 배열은 만들지 않는다.

4. 최소 역할 식별 경계를 둔다.
   - 역할은 `member`, `leader`, `hr` 세 수준만 정의한다.
   - 구성원은 자신의 SOP, 리더는 연결된 조직의 SOP, HR은 전체 조직 SOP를 조회하는 계약만 준비한다.
   - 실제 SSO, 복잡한 조직 겸직, 위임 권한, 필드 단위 접근 제어는 구현하지 않는다.
   - 인증 인프라가 없으면 테스트용 actor context를 명시적으로 주입하되, 운영 인증처럼 가장하지 않는다.

5. 서버 API 경계를 추가한다.
   - SOP 생성용 `/api/ai`와 SOP 저장·조회 API를 분리한다.
   - 저장/조회 API는 공용 schema로 요청과 응답을 검증한다.
   - 구성원 UI는 서버 저장 adapter가 연결된 환경에서 서버 응답이 성공한 뒤에만 저장 완료를 표시한다.
   - 서버 adapter가 없는 데모 환경에서는 기존 로컬 저장을 유지하고 `프로토타입 로컬 데이터`임을 화면에서 한 번 명시한다.

6. 이번 범위에서 명시적으로 제외한다.
   - 변경 전후 값을 누적하는 감사 로그
   - 승인 이벤트의 불변 원장
   - SSO·IAM 연동
   - 조직 계층·겸직·위임을 반영한 세부 권한
   - 필드 단위 또는 행 단위의 정교한 접근 제어

## 5. 필수 회귀 테스트

1. 고객 검토 모드에서 모든 mutation action이 문서를 변경하지 않는다.
2. 고객 검토 모드에서도 노드 선택·패널 탐색은 가능하다.
3. SKILL 수락/거절/추가/삭제 후 Agent화 `confirmedAt`이 제거된다.
4. Agent화 mode 지정 → 미지정 → 재지정이 타입 위반 없이 동작한다.
5. 일괄 지정 후 개별 단계가 서로 다른 mode를 유지한다.
6. Demo와 실제 SOP가 동일한 두 mode 및 노드별 mapping을 사용한다.
7. 잘못된 SOP 요청(`apiKey` 숫자, 잘못된 `detailLevel`, 잘못된 `branchPolicy`)이 500이 아닌 400을 반환한다.
8. 실제 Task 전체 생성 요청이 모든 Activity와 Activity별 SKILL을 유지한다.
9. 기존 start/end, decision branch, rework routing, manual edge handle, undo/redo 테스트가 계속 통과한다.
10. repository contract에서 구성원별·조직별 목록 조회가 서로 다른 범위를 반환한다.
11. 서버 저장 성공 전에는 저장 완료 UI가 표시되지 않고, 실패 시 기존 문서를 잃지 않는다.
12. 로컬 adapter와 서버 adapter가 동일한 SOP schema를 사용한다.
13. 타입 검사, lint, `test:sop`, `test:sop-demo`, production build를 통과한다. 외부 폰트 네트워크만 실패하면 코드 실패와 구분해 기록한다.

## 6. 완료 조건

- P0 결함이 재현 테스트와 함께 수정돼 있다.
- Demo와 실제 SOP의 Agent화 분류·저장 구조가 동일하다.
- SOP 요청은 client/server 공용 Zod schema를 통과해야만 모델 호출로 진행된다.
- Store와 Inspector의 책임이 기능 단위로 분리되고 whole-store subscription이 제거돼 있다.
- 표시 수준 잔재와 명백한 Dead code가 제거돼 있다.
- SOP 저장이 repository 경계로 분리되고 구성원·조직 단위 조회 계약이 존재한다.
- 공용 저장 adapter가 연결된 환경에서는 구성원이 저장한 SOP를 다른 역할 UI가 조회할 수 있는 API가 동작한다.
- 공용 저장소가 아직 제공되지 않은 환경에서는 로컬 adapter가 유지되며 화면이 프로토타입 로컬 데이터임을 명시한다.
- 감사 이력과 정교한 권한 체계는 구현돼 있지 않아도 이번 작업의 완료를 막지 않는다.
- `/flow`의 타입, prompt, API response, 테스트 결과에는 변화가 없다.

## 7. 금지사항

- SOP 전체 전면 재작성 금지
- `/flow` 공용 동작을 SOP 편의 때문에 변경 금지
- 기존 인프라 확인 없이 특정 DB 공급자나 인증 제품을 임의 채택하는 것 금지
- 감사 로그·불변 이벤트 원장·정교한 ACL을 이번 범위에 추가하는 것 금지
- 테스트용 actor context를 실제 인증·권한 구현으로 표시하는 것 금지
- UI에서만 편집을 숨기고 Store mutation을 열어 두는 방식 금지
- `as unknown as`, 빈 문자열 cast, raw API body cast로 스키마 오류를 회피하는 방식 금지
- 테스트를 삭제하거나 assertion을 약화해 통과시키는 방식 금지
