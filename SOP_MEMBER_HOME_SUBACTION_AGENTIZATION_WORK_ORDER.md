# Terra / Sonnet 5 작업지시서 — 구성원 Home, Task–Activity–Sub Action, Agent화

현재 SOP 프로토타입을 전면 재작성하지 말고, 고객사가 추가로 확정한 구성원 첫 화면과 Task 기반 SOP 구조를 기존 SOP 전용 구조에 맞춰 구현하십시오. `/flow` 기능과 UI는 변경하지 마십시오.

## 0. 작업 환경과 필수 선행 조치

- 저장소: `C:\Users\USER\Desktop\NOCODE\agent-shift`
- 현재 브랜치: `agent/workflow-shape-support`
- 기준 HEAD 확인값: `0c11e07 chore: add SOP customer implementation guardrails`
- 현재 Worktree에는 이전 고객 Task Library 구현이 미커밋 상태로 존재할 수 있습니다. 모든 기존 변경을 유지하고 이어서 작업하십시오.
- `git reset`, `git checkout --`, 대량 revert를 금지합니다.
- 완료 후 커밋·푸시하지 마십시오.

작업 전 다음 파일을 반드시 전부 읽으십시오.

1. `AGENTS.md`
2. `.agents/skills/implement-sop-customer-requirements/SKILL.md`
3. 위 SKILL이 필수로 지정한 reference 3개
4. 현재 SOP Home/Gate/Workspace, Store, schema, generation, repository, Agentization 구현

작업 전 실행:

```text
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

현재 변경 파일을 먼저 기록하고, 이번 작업으로 추가한 변경과 구분하십시오.

## 1. 고객이 확정한 요구사항

다음은 설계 제안이 아니라 고객이 추가로 전달한 요구사항입니다.

### 구성원 첫 화면

- 기본 정보: 이름, 사번, 조직, 직급, 주요 직무 표시
- 내 SOP 현황: 작성 중 / 승인 요청 중 / 승인 완료 / 반려 건수 표시
- SOP 생성 경로 3개 표시
  1. Task 기반 생성: 나의 업무를 직접 선택하여 SOP 생성
  2. 동료 SOP 기반 생성: 유사 직무 동료의 SOP를 템플릿으로 활용
  3. 실무 자료 기반 생성: 파일 업로드 또는 영상 캡처 기반 생성 — `TBD`, 향후 단계

### Task 기반 생성

- 구성원이 “내가 하는 일”을 자연어 약 5문장으로 입력
- 입력 내용과 구성원의 소속/직무 정보를 이용해 Task Library에서 AI가 최적 Task 추천
- 구성원은 추천 Task를 선택하거나 직접 검색·수정
- 선정된 Task 전체를 기준으로 SOP 초안 생성
- 생성 SOP는 `Activity → Sub Action` 구조이며, 각 Sub Action의 AI Agent화 가능 여부를 포함

최신 요구에 따라 선택 Activity 단독 생성은 기본 구성원 경로가 아닙니다. 기존 Activity 범위 문서는 마이그레이션 호환용으로 읽을 수 있어야 하지만, Task 기반 생성 UI에서는 노출하지 마십시오.

## 2. 구현 해석 — 고객 확정 사실과 구분할 것

다음은 현재 프로토타입에서 요구사항을 실제로 동작시키기 위한 최소 해석입니다.

1. `/sop`를 구성원 Home으로 사용하고, 기존 `/sop/setup`은 Task 기반 생성 Gate로 유지합니다.
2. 구성원 정보는 자유 입력 폼이 아니라 프로토타입 로그인 정보로 읽기 전용 표시합니다. 실제 SSO/HR Master 연동은 구현하지 않습니다.
3. 승인 라이프사이클은 편집 검토 상태인 `SopDocument.reviewStatus`와 분리합니다.
4. 새 Task SOP의 비종료 업무 노드는 Sub Action을 의미합니다. Activity는 그룹/섹션/탐색 계층으로 표현합니다.
5. AI의 Agent화 제안과 구성원의 최종 판단은 분리합니다. AI가 `confirmedAt`을 생성하거나 구성원의 판단을 자동 확정하면 안 됩니다.
6. 동료 SOP는 원본을 수정하거나 합치는 기능이 아니라, 승인·템플릿 허용된 SOP를 개인정보 없이 복제해 새 독립 초안을 만드는 기능입니다.
7. 실무 자료 기반 생성은 비활성 `향후 제공 (TBD)` 카드만 구현합니다.

이 해석을 바꿔야 할 경우 임의로 바꾸지 말고 결과 보고의 `엔지니어 확인 필요`에 기록하십시오.

## 3. 작업 A — 구성원 Home과 라우팅

### 3.1 Member Home

`/sop`에 구성원 첫 화면을 추가하십시오.

- 이름, 사번, 조직, 직급, 주요 직무를 읽기 전용으로 표시
- 기존 `SopMember`를 backward-compatible하게 확장
- 로그인 연동처럼 가장하지 말고 `프로토타입 사용자 정보`임을 짧게 명시
- Home에서 기존 Gate와 Workspace로 이동 가능한 명확한 경로 제공
- 기존 `/sop/setup`, `/sop/workspace`, `/sop/demo` 직접 URL은 유지

### 3.2 SOP 현황 위젯

별도의 record 라이프사이클 타입을 도입하십시오.

```text
draft
approval-requested
approved
rejected
```

- 화면 라벨은 각각 작성 중 / 승인 요청 중 / 승인 완료 / 반려
- `SopDocument.reviewStatus`를 승인 상태로 해석하지 마십시오.
- 구성원 범위 record와 현재 브라우저 임시 초안을 SOP ID로 중복 제거한 뒤 집계하십시오.
- 서버/저장소에 데이터가 없으면 0으로 표시하십시오. 디자인을 위해 가짜 건수를 만들지 마십시오.
- 현재 저장소가 in-memory reference adapter임을 기존 프로토타입 문맥과 일관되게 표시하십시오.
- 구성원은 자신의 확정된 SOP를 `approval-requested`로 전환할 수 있습니다.
- 구성원 API가 `approved` 또는 `rejected`를 직접 기록하지 못하도록 서버 경계와 repository/domain 경계에서 모두 차단하십시오.
- 리더 승인/반려 UI는 구현하지 마십시오.

### 3.3 생성 경로 카드

- `Task 기반 생성`: 활성, `/sop/setup`으로 이동
- `동료 SOP 기반 생성`: 활성, 템플릿 선택 화면 또는 Home 내 선택 surface로 이동
- `실무 자료 기반 생성`: disabled, `향후 제공 (TBD)` 표시
- disabled 카드에는 파일 input, 권한 요청, 네트워크 호출을 두지 마십시오.
- 키보드 포커스, disabled 설명, 명확한 CTA를 포함하십시오.

## 4. 작업 B — Task 기반 생성 Gate 정렬

기존 Task Library와 AI Task 추천 구현을 재사용하십시오.

- 자연어 업무 기술 입력은 추천보다 먼저 보이며 약 5문장 안내를 제공합니다.
- 추천 요청은 구성원 조직·주요 직무·입력 문장과 현재 Job의 Task 후보만 전달합니다.
- 추천은 최대 3개, catalog-backed ID, 순위와 근거만 반환합니다.
- confidence/probability를 추가하지 마십시오.
- 추천 결과는 자동 선택·자동 확정하지 않습니다.
- 추천 실패 또는 API Key 미등록 시 수동 검색·선택·편집을 계속 사용할 수 있어야 합니다.
- Task 명/정의, Activity 순서·명·설명, Activity별 SKILL 명·설명 편집을 유지합니다.
- Task 기반 생성에서는 `sourceType='task'`를 강제합니다.
- `선택 Activity` 생성 토글은 이 경로에서 제거합니다. 타입·마이그레이션 호환성은 유지합니다.
- Task 전체 Activity와 각 Activity의 SKILL을 원본 순서대로 생성 요청에 전달합니다.
- 기존 6–8단계 설정으로 12–15개 Activity가 잘리지 않도록 구조 설정을 재검토하십시오. 조용한 truncation을 금지합니다.

## 5. 작업 C — Activity–Sub Action 생성 계약

### 5.1 backward-compatible 문서 구조

- 새 문서가 Activity–Sub Action 구조임을 식별하는 discriminator/version을 추가하십시오.
- 기존 문서는 기존 graph 의미를 유지한 채 로드되어야 합니다.
- 기존 `sourceActivityIds`를 유지해 중복 원본 필드가 생기지 않게 하십시오.
- 새 구조의 비종료 업무 노드는 `sourceActivityIds.length === 1`이어야 합니다.
- Sub Action은 Activity 내부 순서를 나타내는 양의 정수 order를 가집니다.
- 한 Activity 안에서 Sub Action order는 중복되면 안 됩니다.
- terminal start/end에는 Activity/Sub Action 매핑이나 Agent화 제안을 두지 않습니다.

### 5.2 생성 요청·응답·검증

- Prompt와 응답 schema에 Activity별 Sub Action 생성을 명시하십시오.
- 선택 Task의 모든 Activity가 적어도 하나의 Sub Action으로 반영되어야 합니다.
- Activity ID는 선택 Task catalog에 실제 존재해야 합니다.
- unknown/cross-Task ID를 거부하십시오.
- Activity 이름 비교가 아니라 ID로 검증하십시오.
- 고객은 Activity당 Sub Action 개수를 확정하지 않았습니다. 정확히 N개를 강제하지 마십시오.
- repair는 기존 정책대로 제한적으로 수행하고, repair 후에도 위 조건이 깨지면 400으로 실패시켜 Store에 적용하지 마십시오.
- 생성 실패 시 기존 문서와 Workspace 이동 상태를 유지하십시오.

### 5.3 Workspace 표현

- Activity를 그룹/섹션/레인 또는 명확한 탐색 계층으로 표현하십시오.
- Sub Action을 실제 흐름 노드로 표현하십시오.
- Activity 선택 시 해당 Sub Action 노드를 강조합니다.
- Inspector에서 현재 Activity와 Sub Action order를 확인·수정할 수 있게 합니다.
- Sub Action을 다른 Activity로 이동하면 Activity coverage, 문서 검토, Agent화 확정을 다시 검증·무효화합니다.
- 노드 내부는 단계명 중심을 유지하고 긴 설명·SKILL 목록을 넣지 마십시오.

## 6. 작업 D — Sub Action별 AI Agent화 제안과 구성원 판단

기존 `sop-agentization.ts`, `SopAgentizationPanel`, 노드 badge, Store action을 재사용·확장하십시오. `/flow`의 Agent 기능을 가져오거나 수정하지 마십시오.

### 6.1 AI 제안 데이터

새 Task SOP의 모든 비종료 Sub Action에 다음 정보를 생성하십시오.

- 제안 유형: `AI Agent 후보` / `AI 지원` / `권장 안 함`
- 짧고 구체적인 근거

규칙:

- confidence/probability 금지
- 제안은 생성 결과이며 구성원 판단이 아님
- 제안이 `agentizationReview.stepModes`나 `confirmedAt`을 자동 설정하면 안 됨
- `권장 안 함`은 AI 제안 표현에서만 명시값으로 허용할 수 있음
- 구성원의 기존 `SopAiApplicationMode`는 `automation | assist`; 미지정은 사람 수행이라는 기존 규칙 유지

### 6.2 구성원 검토

- 구성원은 각 Sub Action별로 제안을 수락하거나 다른 적용 방식으로 변경하거나 미지정으로 둘 수 있어야 합니다.
- 서로 다른 Sub Action은 서로 다른 mode를 유지해야 합니다.
- 전체/선택 단계 일괄 지정은 유지하되 개별 override를 덮어쓰는지 명확히 확인받는 UI를 사용하십시오.
- terminal은 대상에서 제외하십시오.
- AI 제안 badge와 구성원 확정 badge를 색상·라벨로 구분하십시오.
- 제안만 존재할 때 `확정됨`으로 표시하지 마십시오.
- `Agent화 검토 확정`은 명시적으로 선택된 대상의 member mode가 모두 지정됐을 때만 성공합니다.
- 고객 검토 모드에서는 열람만 가능하고 모든 관련 mutation을 Store에서도 차단하십시오.
- Sub Action/Activity/SKILL/업무 내용 변경은 기존 중앙 mutation 경로로 content review와 Agentization confirmation을 무효화합니다.

이 기능은 Agent 개발 승인이나 실제 실행 기능이 아니라, 구성원이 기록하는 Agent 후보 판단입니다. UI 문구가 실제 Agent가 자동 생성·실행되는 것처럼 보이지 않게 하십시오.

## 7. 작업 E — 동료 SOP 템플릿 경로

### 7.1 목록

- 승인 완료이고 명시적으로 template-eligible인 record만 후보로 사용하십시오.
- 유사 주요 직무/Task 기준으로 검색 또는 필터할 수 있게 합니다.
- 카드에는 Task, SOP 제목, 조직 범주 또는 익명화된 유사 직무 정보만 표시하십시오.
- 구성원 이름, 사번, 원본 memberId, 승인 코멘트 등 개인정보를 표시하거나 client payload에 포함하지 마십시오.
- 현재 실제 공유 데이터가 없으면 synthetic sample임을 명시한 최소 fixture를 사용하거나 정확한 빈 상태를 제공하십시오. 실제 동료 데이터처럼 가장하지 마십시오.

### 7.2 독립 초안 복제

템플릿 선택은 다음 불변식을 지켜야 합니다.

- 새 document ID
- 현재 구성원 identity
- 새 createdAt/updatedAt
- content `reviewStatus='ai-draft'`
- lifecycle `draft`
- 원본 review decision/comment 제거
- 원본 구성원 Agentization `stepModes`, note, `confirmedAt` 제거
- AI suggestion은 구조 콘텐츠로 유지 가능
- 원본 SOP를 수정하지 않음
- 다른 구성원의 SOP와 merge하지 않음
- 선택 전 명시적인 미리보기/복제 확인
- source template ID 같은 최소 provenance만 저장 가능

## 8. 작업 F — Schema, Store, API, migration

- 타입을 수기 interface와 Zod에 중복 관리하지 말고 기존 infer 패턴을 따르십시오.
- Home/lifecycle/template/Sub Action/AI suggestion 필드는 공용 schema로 client/server가 공유합니다.
- persist version을 한 번만 올리고 명시적인 migration을 추가합니다.
- migration은 기존 document ID, 사용자 편집, graph 좌표, edge handle, review, legacy Activity mapping을 보존합니다.
- 과거 문서를 새 Activity–Sub Action 문서라고 위장하지 마십시오.
- 새 mutation은 고객 검토 가드와 중앙 invalidation helper를 통과합니다.
- raw body cast, 빈 문자열 cast, `as unknown as`로 schema를 우회하지 마십시오.
- 실제 DB/SSO/감사 로그를 추가하지 마십시오. 기존 in-memory reference repository 경계를 유지합니다.

## 9. 필수 실행 테스트

소스 문자열 검색이 아니라 domain/component/orchestration/API 호출부를 실행하는 테스트를 추가하십시오. 최소 파일:

- `tests/sop-member-home.test.ts`
- `tests/sop-subaction-agentization.test.ts`

두 파일을 `npm run test:sop`에 포함하십시오.

### Home/lifecycle

1. 기본 정보 5개가 읽기 전용으로 표시됨
2. 네 상태 bucket이 정확히 집계됨
3. 동일 SOP ID의 local/server record가 중복 집계되지 않음
4. record가 없으면 0 표시
5. `reviewStatus='confirmed'`만으로 `approved`가 되지 않음
6. member가 approved/rejected를 위조한 POST/PUT/transition 요청은 거부되고 저장소 불변
7. 세 생성 경로 카드가 표시되고 TBD 카드는 API 호출/파일 input 없이 disabled
8. Task 카드가 Setup Gate로 이동

### Task Gate

9. 자연어+조직+직무가 추천 요청에 포함됨
10. 추천은 member가 클릭하기 전 Store Task를 바꾸지 않음
11. 추천 실패 후 수동 검색/선택 가능
12. Task 경로 요청은 항상 task scope이며 모든 Activity/SKILL을 순서대로 포함
13. Task 경로 UI에 선택 Activity 생성 토글이 없음
14. legacy Activity-scoped document는 계속 로드됨

### Activity–Sub Action

15. 새 문서의 모든 business node가 Sub Action 의미와 order를 가짐
16. 새 Sub Action은 source Activity ID 정확히 1개
17. 선택 Task의 모든 Activity가 적어도 1회 포함됨
18. unknown/cross-Task/missing Activity ID 거부
19. 한 Activity 내부 duplicate Sub Action order 거부
20. terminal에는 Activity mapping/Agentization suggestion 없음
21. 불완전 AI 결과는 1회 repair 후에도 잘못되면 Store 미적용·이동 없음
22. Activity 선택이 해당 Sub Action 노드만 강조

### Agentization

23. AI suggestion이 있어도 member `stepModes`와 `confirmedAt`은 비어 있음
24. Sub Action별 suggestion 유형과 rationale schema 검증
25. confidence/probability 필드가 계약에 없음
26. 서로 다른 Sub Action에 automation/assist를 독립 지정 가능
27. 미지정은 사람 수행으로 유지되고 별도 human-only member mode가 없음
28. AI 제안과 구성원 판단이 canvas/Inspector에서 구별됨
29. terminal 제외, customer review mode 차단, 의미 변경 후 confirmation 무효화

### 동료 템플릿

30. 미승인 또는 template 미허용 record는 목록에 없음
31. 목록 payload/화면에 colleague PII와 review comment가 없음
32. clone은 새 ID/current member/draft 상태를 가짐
33. clone에서 원본 구성원 judgement와 confirmedAt 제거
34. clone 후 원본 record 불변

기존 SOP, Demo, 연결선 라우팅, 수동 handle, undo/redo, confirmation, repository ownership/version 충돌 테스트를 삭제하거나 약화하지 마십시오.

## 10. UI 검증

Home/Gate/Workspace를 모두 다음 환경에서 browser로 확인하십시오.

- 1440×900, 100% zoom
- 1920×1080, 100% zoom

확인 항목:

- 첫 화면 identity/status/path가 한눈에 구분됨
- 12–15개 Activity와 다수 Sub Action을 독립 scroll로 탐색 가능
- fixed footer가 내용·버튼·Inspector를 가리지 않음
- Activity group과 Sub Action 흐름이 시각적으로 구분됨
- AI 제안과 구성원 확정 badge가 혼동되지 않음
- disabled TBD 카드가 활성 기능처럼 보이지 않음

Material UI 변경 전 Stitch MCP가 callable하면 실제 density 조건을 넣어 디자인 검토를 받으십시오. Stitch가 인증되지 않았거나 실패하면 정확한 오류를 보고하고 사용했다고 주장하지 마십시오.

## 11. 금지사항

- SOP 전면 재작성
- `/flow` 코드·UI·테스트 변경
- 기존 미커밋 Task Library 구현 reset/revert
- Activity를 무시하고 AI가 임의의 Sub Action만 생성
- Activity/Task 이름 기반 coverage 판정
- selected Activity 단독 생성을 최신 기본 경로로 유지
- `reviewStatus`와 승인 lifecycle 통합
- member의 self-approval/self-rejection
- AI suggestion을 member 확정으로 저장
- 구성원별로 다른 Agentization mode를 하나의 전역 mode로 덮어쓰기
- 동료 개인정보·승인 코멘트 노출
- 동료 SOP 원본 수정 또는 교차 구성원 merge
- TBD 파일/영상 기능 선구현
- 실제 인증·DB·감사이력 구현처럼 가장하기
- confidence 수치 임의 생성
- 테스트 삭제 또는 assertion 약화
- 작업 완료 후 임의 commit/push

## 12. 완료 검증

반드시 순서대로 실행하십시오.

```text
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:sop-customer -- --final
git diff --check
git status --short
```

`src/app/flow/**`, `src/components/flow/**` 변경 파일이 0개인지 확인하십시오. 공유 `src/app/api/ai/route.ts`를 수정했다면 SOP action 분기만 변경됐는지 diff를 수동 검토하고 보고하십시오.

## 13. 결과 보고 형식

다음을 분리해 보고하십시오.

1. 변경 파일
2. 고객 확정 요구사항 반영 내용
3. 구현을 위해 추가한 해석
4. Home/lifecycle 데이터 계약
5. Activity–Sub Action 생성·coverage 계약
6. AI suggestion과 member Agentization 판단 분리 방식
7. 동료 템플릿 개인정보 제거·독립 clone 방식
8. migration 방식
9. 추가 테스트와 전체 검증 결과
10. Stitch 사용 결과 또는 정확한 사용 불가 사유
11. 엔지니어 확인 필요 사항
12. 명시적으로 보류한 항목

완료를 schema/helper 수준으로만 판단하지 마십시오. Home → Task 생성 → Activity/Sub Action Workspace → Agent화 검토와 동료 템플릿 clone의 실제 사용자 흐름이 실행 테스트로 증명돼야 합니다.
