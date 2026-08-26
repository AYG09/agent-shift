# SOP 노드 작성 및 AI 에이전트 통제 계약

## 1. 목적과 적용 범위

이 문서는 다음 두 생성 경로가 공통으로 따라야 할 SOP 노드 품질 계약을 정의한다.

1. 구성원의 확정 Work Map과 업무맥락에서 개인 Task SOP를 생성하는 경로
2. 동일 Task의 승인 SOP들을 종합해 HR용 대표 표준안 AI 초안을 생성하는 경로

노드의 분석 단위는 `Activity`가 아니라 하나의 `Sub Action`이다. 이 계약은 기존 Activity–Sub Action 출처, coverage, Agent화 제안, 승인 상태 계약을 대체하지 않고 그 위에 **작성 품질과 향후 agent-readiness**를 추가한다.

## 2. 근거 수준과 용어 정리

### 2.1 검증된 근거

| 근거 | 확인되는 원칙 | 증거 수준 |
|---|---|---|
| [US EPA, Guidance for Preparing SOPs, QA/G-6](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P1008GTX.TXT) | 간결한 step-by-step 형식, 명확하고 모호하지 않은 문장, 능동태와 현재형, 짧고 단순한 표현 | 정부기관 공식 가이드 |
| [WHO, Handbook for Developing a Public Health Emergency Operations Centre](https://iris.who.int/bitstream/handle/10665/277191/9789241515122-eng.pdf?sequence=1) | action word 사용, 담당 직위·목적·산출물·단계적 절차·안전사항 명시, 명확하고 모호하지 않은 표현 | 국제기구 공식 실무 가이드 |
| [WHO Model Quality Assurance System, Annex 3](https://cdn.who.int/media/docs/default-source/medicines/norms-and-standards/guidelines/quality-control/trs986-annex3-who-model-quality-assurance-system-for-procurement-agencies.pdf) | 모든 단계를 상세하고 명확하게 작성, 특정 책임자가 있으면 행동 단계에 책임자 표시 | 국제기구 품질보증 가이드 |
| [Digital.gov, Writing for understanding](https://digital.gov/guides/plain-language/writing) | 친숙한 용어, 짧은 단위, 능동태, 현재형; 능동태는 책임 주체를 명확히 함 | 정부 공식 Plain Language 가이드 |
| [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) | 인간–AI 역할과 책임, 적용 범위, human oversight 절차를 정의·문서화 | 다기관 합의 기반 자발적 AI 위험관리 프레임워크 |
| [OWASP LLM06:2025 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) | 최소 도구·기능·권한, 사용자 맥락 실행, 고영향 행동의 HITL 승인 | 보안 실무 위험·완화 가이드 |

### 2.2 사실 판단

- 위 자료들은 행동 중심, 능동태, 명료성, 단계적 절차, 책임자, 용어 정의를 일관되게 권고한다.
- 산업과 규제 영역마다 SOP 형식이 다르므로, `행동 동사·능동태·정량 기준·평이한 언어·단일 행동`이 **정확히 다섯 개 조항으로 고정된 단일 국제 공식표준**이라고 표현하지 않는다.
- `AOP(Agent Operating Procedure)`는 agent용 절차를 뜻하는 실무 용어로 사용할 수 있지만, 현재 이 프로젝트가 확인한 범위에서 ISO·NIST의 보편적 공식 문서 표준명은 아니다.
- Markdown이나 프롬프트만으로 AI의 무오류 실행을 보장할 수 없다. agent 실행 안전성은 구조화 출력, schema 검증, 실제 tool 권한, least privilege, HITL, 로그와 실행기 통제를 함께 요구한다.

### 2.3 프로젝트 적용 결정

최신 고객 지시에 따라 아래 규칙을 이 프로젝트의 **필수 SOP 생성 계약**으로 채택한다. 외부 근거의 표현을 그대로 복제한 국제표준이라고 주장하지 않고, 공신력 있는 지침과 정합적인 프로젝트 표준으로 관리한다.

## 3. SOP 노드 작성 5대 규칙

### RULE-NODE-01 — 실행 행동 중심

- 모든 business node는 실제 수행 가능한 하나의 행동을 나타낸다.
- 한국어 제목은 문법상 동사가 끝에 오는 점을 반영해 `대상 + 구체적 행동 동사` 형식을 사용한다.
- 영어 제목은 가능한 경우 imperative action verb로 시작한다.
- `처리`, `진행`, `관리`, `대응`처럼 목적어와 완료 상태가 불명확한 명사형 제목만 사용하지 않는다.
- 입력자료, 선행 결과, 산출물, 목적, 순수 fork/join은 행동 노드로 만들지 않는다.

권장:

```text
지원자 제출서류를 필수항목 목록과 대조한다
면접 평가 결과를 ATS에 기록한다
구매 금액을 승인 한도와 비교한다
```

금지:

```text
서류 검토
적절한 처리
면접 결과
필요 시 대응
```

### RULE-NODE-02 — 능동태와 책임 주체

- terminal과 순수 control을 제외한 모든 node에 `responsibleRole` 의미를 보존한다.
- definition 또는 실행 명세는 `책임 역할이 대상에 행동을 수행한다`는 능동 구조로 작성한다.
- 제목에서 주체를 생략해도 schema의 책임 역할은 생략하지 않는다.
- `검토되어야 한다`, `처리될 수 있다`처럼 행위자가 사라지는 피동 표현은 semantic lint 대상으로 분류한다.
- 사람, AI agent, 정보시스템 중 누가 행동하는지 구분한다. AI가 수행하지 않는 단계를 AI 주체로 쓰지 않는다.

### RULE-NODE-03 — 모호성 제거와 출처 있는 기준

- `필요 시`, `적절히`, `가능한 경우`, `가급적`, `신속히`, `고액`, `이상 징후`만으로 분기 조건을 만들지 않는다.
- 의사결정 node의 조건은 관찰 가능한 값, 상태, 승인 여부 또는 명시된 business rule로 표현한다.
- 수치·시간·등급·임계값은 Work Map, 구성원 맥락, 승인 정책, 입력 SOP 중 하나에 근거가 있을 때만 사용한다.
- 모델이 `신뢰도 80%` 같은 기준을 임의 생성하지 않는다. 현재 프로젝트의 Agent화 제안에는 confidence/probability를 추가하지 않는다.
- 필요한 기준이 입력에 없으면 값을 추정하지 않고 `기준 미확정` 품질 이슈와 HITL 확인 필요 상태를 반환한다.

기준은 최소 다음 provenance를 가진다.

```text
condition
sourceType: work-map | member-context | approved-sop | policy | human-confirmed
sourceRef?: opaque identifier
```

### RULE-NODE-04 — 평이한 언어와 용어 정의

- 신규 구성원이나 인접 부서 담당자가 이해할 수 있는 익숙한 단어와 짧은 문장을 사용한다.
- 전문 용어·사내 약어·시스템 약어는 처음 사용하기 전에 glossary에 정의한다.
- 공식 시스템명과 규제 용어를 임의로 쉬운 말로 바꿔 의미를 훼손하지 않는다. 원어를 유지하고 정의를 추가한다.
- 정의되지 않은 약어는 생성 완료 전 semantic lint 대상이다.
- definition은 title을 반복하지 않고 `행동 + 기준/도구 + 완료 결과`를 1~2문장으로 설명한다.

### RULE-NODE-05 — 최소 유효 단일 행동

- 하나의 node에는 독립적으로 수행·검토·완료 판단·Agent화 판단할 수 있는 하나의 행동만 둔다.
- 서로 다른 동사와 별도 산출물·도구·책임·완료 기준을 가지는 행동은 분리한다.
- 하나의 통합 판단이나 협상으로만 성립하는 목적어를 기계적으로 쪼개지 않는다.
- `A하고 B하고 C한다` 형태는 compound-action lint 대상이다.
- 지나친 미세 분해로 클릭, 읽기, 입력자료 자체를 node로 만들지 않는다.

이 규칙은 기존 `Sub Action은 최소 유효 실행 단위` 계약과 함께 적용한다. `단일 행동`은 단어 하나나 UI 클릭 하나가 아니라 업무적으로 독립적인 완료 상태가 있는 실행 단위다.

## 4. Agent-ready 확장 계약

### 4.1 문서 수준 사명

Mission은 node마다 복제하지 않고 SOP 문서 수준에서 한 번 정의한다.

```text
objective: 이 Task가 달성해야 하는 업무 결과
successCriteria: 완료를 확인할 수 있는 기준 목록
globalConstraints: SOP 전체에 적용되는 금지·준수사항
source: Task 정의와 승인된 정책 근거
```

- 개인 SOP의 Mission은 확정 Task 정의와 구성원 업무맥락에서 만든다.
- 대표 표준안의 Mission은 Task Library 정의와 승인 원본의 공통 목적에서 만든다.
- 입력에 없는 KPI, SLA, 법적 의무를 생성하지 않는다.

### 4.2 Tool policy

기존 `tools: string[]`는 사람이 읽는 사용 도구 설명이며 실행 권한이 아니다. 향후 agent 실행을 위해 별도의 구조화 policy가 필요하다.

```text
allowedToolIds: 등록된 tool registry ID 목록
forbiddenActions: 해당 node에서 금지할 행동 목록
dataAccessScope: read | write | approve | send 등 승인된 최소 범위
requiresHumanApproval: 실제 고영향 tool 호출 전 승인 필요 여부
```

- 모델이 새로운 tool ID나 권한을 발명하지 않는다.
- 허용 목록에 없는 tool은 실행기에 노출하지 않는다.
- 이메일 발송, 외부 게시, 승인, 삭제, 금전·계약·고용 의사결정 등 고영향 행동은 조직 정책이 확정되기 전 자동 실행하지 않는다.
- prompt의 금지 문장만으로 접근통제를 완료했다고 주장하지 않는다. 실제 API credential과 tool executor가 같은 정책을 강제해야 한다.

### 4.3 Escalation과 HITL

각 escalation rule은 다음을 포함한다.

```text
trigger: 관찰 가능한 조건
targetRole: 이관받을 사람 역할
requiredEvidence: 사람이 판단할 때 필요한 입력·로그·산출물
agentMayContinue: 승인 전 다음 행동을 진행할 수 있는지
source: 조건의 근거
```

- trigger는 모델의 자기평가 점수보다 business condition을 우선한다.
- 예외, 기준 미확정, 권한 부족, 금지 tool 필요, 개인정보·고용·계약 등 고영향 판단은 HITL 후보로 표시한다.
- targetRole이 입력에 없으면 임의의 팀장·SME를 발명하지 않고 `담당 역할 미확정`으로 남긴다.
- escalation node 또는 edge는 실제 책임 이관 행동이 있을 때만 business node로 만들고, 순수 route connector는 edge로 표현한다.

### 4.4 논리 schema

정확한 TypeScript 필드명은 Foundation 구현 단계에서 legacy migration과 함께 확정하되 다음 의미는 구조화해 보존한다.

```ts
type SopAgentInstructionSpec = {
  objective: string;
  successCriteria: string[];
  globalConstraints: string[];
  glossary: Array<{ term: string; definition: string; source?: string }>;
};

type SopNodeExecutionSpec = {
  actorRole: string;
  action: { verb: string; object: string };
  completionCriteria: string[];
  decisionCriteria: Array<{
    condition: string;
    outcome: string;
    sourceType: 'work-map' | 'member-context' | 'approved-sop' | 'policy' | 'human-confirmed';
    sourceRef?: string;
  }>;
  toolPolicy: {
    allowedToolIds: string[];
    forbiddenActions: string[];
    dataAccessScope: Array<'read' | 'write' | 'approve' | 'send'>;
    requiresHumanApproval: boolean;
  };
  escalationRules: Array<{
    trigger: string;
    targetRole?: string;
    requiredEvidence: string[];
    agentMayContinue: boolean;
    source?: string;
  }>;
};
```

도입 원칙:

- 기존 `title`, `definition`, `responsibleRole`, `inputs`, `outputs`, `tools`, `cautions`, `decisionRules`는 legacy 문서 호환을 위해 즉시 제거하지 않는다.
- 새로운 구조는 별도 instruction contract version으로 식별하고 legacy 문서 의미를 소급 재작성하지 않는다.
- 실행 명세와 `agentizationSuggestion`/구성원 `stepModes`는 별개다. 작성 품질이 높다고 자동 Agent화 확정하지 않는다.
- terminal과 pure control에는 node execution spec을 요구하지 않는다.

### 4.5 표준 Markdown 투영

검증된 구조화 객체는 사람과 reviewer가 읽을 수 있도록 다음 Markdown 형태로 투영할 수 있다.

```markdown
# Mission
- Objective: ...
- Success criteria: ...
- Global constraints: ...

## Glossary
- ATS: 채용관리 시스템

## Step S-001 — 지원자 제출서류를 필수항목 목록과 대조한다
- Actor: 채용 운영 담당자
- Source Activity: A03
- Inputs: 지원자 제출서류, 필수항목 목록
- Action: 제출서류의 각 항목을 필수항목 목록과 대조한다.
- Completion criteria: 누락 항목과 충족 항목이 구분된 검토 결과가 기록된다.
- Outputs: 서류 검토 결과
- Allowed tools: ats.read_application, ats.write_review
- Forbidden actions: 지원자 원본 서류를 외부 저장소에 복사하지 않는다.
- Decision criteria: 필수항목이 하나라도 누락되면 보완 요청 단계로 이동한다.
- Escalation: 판정 기준이 없으면 채용 운영 책임자에게 근거와 함께 이관한다.
```

- Markdown은 구조화 schema의 사람이 읽는 표현이며 별도의 mutable 원본이 아니다.
- 실행기는 자유형 Markdown을 직접 파싱해 권한을 부여하지 않는다. 검증된 JSON/schema와 tool registry를 사용한다.
- 개인 SOP와 대표 표준안은 같은 template을 사용할 수 있지만, 대표 표준안에는 `AI 초안`, unresolved standardization issue, source provenance를 추가 표시한다.

## 5. 개인 SOP 생성 파이프라인 적용

### 5.1 Prompt 단계

`getSopPrompt`는 기존 Activity–Sub Action 계약에 다음을 추가한다.

1. 문서 Mission과 glossary 생성
2. 한국어 `대상 + 구체적 행동 동사` 제목
3. responsible role과 능동태 definition
4. source-grounded completion/decision criteria
5. 등록된 도구만 사용하는 tool policy
6. 조건·증거·대상 역할이 있는 escalation rule
7. 입력에 없는 임계값·권한·규정을 만들지 않는 negative instruction

### 5.2 생성 후 검증 단계

```text
AI structured output
→ 기계적 정규화
→ 기존 graph/coverage/origin 검증
→ node authoring 구조 검증
→ semantic lint
→ 1회 repair
→ 재검증
→ 품질 이슈가 남으면 사람 검토용 warning 또는 blocking issue
```

#### 구조적 blocking issue

- business node의 책임 역할 또는 실행 행동 구조 누락
- unknown tool ID 또는 허용되지 않은 data access scope
- decision node의 분기 조건/결과 누락
- 입력 근거 없이 생성된 수치 기준
- source Activity mapping, coverage, origin 계약 위반
- 금지 행동을 허용하는 tool policy

#### semantic repair/warning

- 모호한 표현
- 피동태 또는 책임 주체 불명확
- 복합 행동
- 정의되지 않은 약어
- title 반복 definition
- 완료 기준이 관찰 불가능함

자연어 lint를 정규식만으로 `검증 완료` 처리하지 않는다. 정규식은 후보를 찾는 보조 수단이며, repair 이후에도 의미가 불명확하면 구성원/SME 검토 대상으로 표면화한다.

## 6. 대표 표준안 생성 파이프라인 적용

### 6.1 현재 기준선의 결함

현재 `toSanitizedSourceSummary`는 승인 원본의 `title`과 `definition`만 표준안 prompt로 전달한다. 따라서 다음 정보가 종합 과정에서 유실된다.

- 책임 역할
- 입력과 산출물
- 도구와 주의사항
- decision rule
- Activity/Sub Action 출처
- 향후 tool policy와 escalation rule

현재 `getStandardDraftPrompt`도 일반 node 작성 규칙보다 약하며, 원본 간 충돌을 모델이 `더 명확하거나 안전한 대표값`으로 임의 선택하게 한다.

### 6.2 표준안 source summary

PII 제거 후 다음 업무 의미를 보존한다.

```text
opaque source label
step title/definition
responsible role category
inputs/outputs
descriptive tools/cautions/decision rules
agent instruction/execution spec의 비식별 필드
source step/record opaque provenance
```

이름, 사번, 조직, reviewer feedback, 자유서술 개인정보는 계속 제외한다. 역할명에 개인 식별정보가 들어가면 정규화 또는 차단한다.

### 6.3 표준화 규칙

- Task Library의 Task 정의를 Mission의 기준점으로 사용한다.
- 원본에 공통으로 존재하는 행동을 우선하되, 행동·책임·조건·도구 정책을 각각 비교한다.
- 원본 간 기준이나 tool 권한이 충돌하면 모델이 하나를 확정하지 않고 `standardizationIssue`로 반환한다.
- 충돌하는 allowed tool은 사람 검토 전 실행 허용으로 변환하지 않는다.
- 출처 없는 수치·SLA·confidence threshold를 만들지 않는다.
- 표준안도 5대 node 규칙과 agent-ready schema 검증을 통과해야 한다.
- 결과는 계속 `AI 초안`이며 저장·공식 확정·agent 실행을 자동 수행하지 않는다.

권장 응답 확장:

```text
document
sourceRecordIds
taskId
generatedAt
qualityReport
standardizationIssues[]
```

`standardizationIssues`는 최소 issue type, 대상 step, 충돌 값의 비식별 출처, 필요한 human decision을 포함한다.

## 7. 테스트 계약

### 7.1 공통 node 작성

- `TST-NODE-001`: business node title이 실행 대상과 구체적 행동을 표현한다.
- `TST-NODE-002`: 피동 표현으로 책임자가 사라진 fixture가 lint/repair 대상이 된다.
- `TST-NODE-003`: `필요 시`, `적절히`, `고액`만 있는 조건이 확정 rule로 통과하지 않는다.
- `TST-NODE-004`: 입력에 없는 `80%`, SLA, 금액 기준을 모델이 추가하지 않는다.
- `TST-NODE-005`: 정의되지 않은 약어는 glossary issue로 검출된다.
- `TST-NODE-006`: 별도 행동 두 개는 분리되고 입력·산출물·목적은 pseudo-node가 되지 않는다.
- `TST-NODE-007`: responsibleRole, completion criteria, tool policy, escalation rule이 wire → normalize → document에서 보존된다.
- `TST-NODE-008`: terminal/pure control은 execution spec과 Agent화 대상에서 제외된다.

### 7.2 Tool/HITL

- `TST-AOP-001`: registry에 없는 tool ID는 blocking issue다.
- `TST-AOP-002`: read-only node가 write/send/delete 권한을 얻지 않는다.
- `TST-AOP-003`: human approval이 필요한 node는 승인 전 실행 불가 상태다.
- `TST-AOP-004`: target role 또는 기준이 입력에 없으면 값을 발명하지 않고 unresolved issue를 만든다.
- `TST-AOP-005`: Agent화 AI 제안이 tool permission이나 구성원 확정을 자동 변경하지 않는다.
- `TST-AOP-006`: 동일한 검증 객체가 안정적인 Markdown으로 투영되며 Markdown 수정이 실행 권한을 우회하지 못한다.

### 7.3 대표 표준안

- `TST-STD-001`: PII 제거 source summary가 책임·입출력·조건·도구 의미를 보존한다.
- `TST-STD-002`: 서로 충돌하는 threshold/tool policy가 조용히 하나의 값으로 합쳐지지 않는다.
- `TST-STD-003`: 표준안이 node 5대 규칙 검증을 통과한다.
- `TST-STD-004`: approved same-Task source만 사용하고 opaque provenance를 유지한다.
- `TST-STD-005`: qualityReport와 standardizationIssues가 response schema를 통과한다.
- `TST-STD-006`: 표준안 생성은 repository 저장, 공식 확정, agent 실행을 수행하지 않는다.

프롬프트 문자열 포함 여부만으로 완료를 주장하지 않는다. schema/domain/pipeline/API fixture를 실행해 생성 전후 필드 보존과 실패 경로를 검증한다.

## 8. 보류 범위

- 실제 agent executor와 tool registry 구현
- 고영향 행동의 최종 조직 분류표
- 직무별 허용 tool과 API scope
- 생산 HITL 담당자 배정 및 SLA
- 표준안 충돌의 최종 의사결정 권한
- agent 실행 로그, 감사 이력, 재현성 저장소
- 모델 성능 임계값과 confidence calibration
- `AOP`의 대외 제품 명칭 채택 여부

현재 프로토타입은 **agent-ready 작성 구조와 검토 정보**를 만들 수 있지만, 이를 실행 가능한 production code 또는 무오류 자율 agent라고 표현하지 않는다.
