# Wave 1 세션 전달 프롬프트 (값 채움본)

`CLAUDE_SESSION_PROMPTS.md`의 Prompt 02~07에서 `<...>` placeholder를 실제 값으로
바꾼 복사·전달용 원본이다. 각 블록을 **서로 다른** Claude Code 세션의 첫 메시지로
전달한다. 한 세션이 두 블록을 맡지 않는다.

## 공통 사실

- Foundation 코드 baseline commit: `a59c7d1`
- Foundation handoff 문서 commit: `f20b619` (이후 문서 전용 commit이 더 얹힐 수 있다 — 코드 변경은 없다)
- Foundation handoff 문서: `docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md`
- 여섯 worktree는 모두 이 commit에 정렬되어 있고, `node_modules`는 메인 저장소로
  junction 되어 있어 `npm run ...`이 바로 동작한다.
- 어떤 세션도 push하지 않는다. commit은 사용자가 그 세션에서 명시적으로 승인했을 때만 한다.

---

## Prompt 02 — Wave 1A 로그인·업무맥락

```text
당신은 agent-shift SOP 구성원 업무맥락 재설계의 Wave 1A 로그인·업무맥락 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/02_WAVE1A_LOGIN_CONTEXT.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1a-login-context
필수 기준: branch wave1/sop-login-context / Foundation 코드 baseline f20b619
(worktree HEAD에는 이후 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 f20b619와 동일하면 정상이다.)

AGENTS.md, CLAUDE.md, SOP repository skill과 필수 reference 5개, final scenario work order, 품질·디자인 규칙, 재설계 엔지니어링 문서 5개, 00_MASTER_ORCHESTRATION.md, 본 작업지시서를 모두 끝까지 읽어라. docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md의 member intake public API도 확인하라.

git status, HEAD, branch를 확인하고 npm run verify:sop-customer를 실행하라. Foundation commit과 다르거나 소유 파일에 다른 writer 변경이 있으면 수정하지 말고 중단하라.

02_WAVE1A_LOGIN_CONTEXT.md의 배타적 소유 파일만 수정하라. 추천 API/화면, Work Map, Store/schema, 기존 Home/Gate, 생성 backend, src/app/api/ai/route.ts, /flow는 건드리지 마라. 공통 API가 부족하면 복제 구현 대신 FOUNDATION_CHANGE_REQUEST를 작성하라.

시각 구현 전에 Claude 환경에서 실제 제공되는 디자인 검토 기능 또는 design skill을 호출하라. 사용할 수 없으면 DESIGN_CAPABILITY_BLOCKED로 정확히 보고하고 사용했다고 주장하지 마라.

작업지시서의 테스트와 검증 명령을 모두 실행하고 HANDOFF 형식으로 changed files, requirement ID, 실제 디자인 기능, viewport 검증, 실패·보류 항목을 보고하라. 명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt 03 — Wave 1B 추천·로딩

```text
당신은 agent-shift SOP 구성원 업무맥락 재설계의 Wave 1B Task 추천·로딩 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/03_WAVE1B_RECOMMENDATION_LOADING.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1b-recommendation
필수 기준: branch wave1/sop-recommendation / Foundation 코드 baseline f20b619
(worktree HEAD에는 이후 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 f20b619와 동일하면 정상이다.)

AGENTS.md, CLAUDE.md, SOP repository skill과 필수 reference, final scenario work order, 품질·디자인 규칙, 재설계 엔지니어링 문서, 00 master와 본 작업지시서를 끝까지 읽고 docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md의 recommendation/Task clone API를 확인하라.

git status, HEAD, branch를 확인하고 npm run verify:sop-customer를 실행하라. baseline 또는 소유권이 맞지 않으면 중단하라.

03_WAVE1B_RECOMMENDATION_LOADING.md의 배타적 소유 파일만 수정하라. Foundation Store/type, login/context, Work Map, 기존 Home/Gate/SopTaskRecommendationPanel, 개인·표준안 생성, src/app/api/ai/route.ts, /flow는 수정하지 마라. 공용 API 부족은 FOUNDATION_CHANGE_REQUEST로 넘겨라.

구현 전에 Claude의 실제 디자인 검토 기능 또는 design skill로 loading·오류 복구·추천 비교 밀도를 검토하라. fake progress, ETA, confidence를 만들지 마라. 추천 성공은 자동 확정이 아니며 명시적 확인 뒤에만 Work Map snapshot을 생성하라.

작업지시서의 테스트와 검증을 모두 실행하고 request 중복 방지, stale response 처리, invalid recommendation 방어, 디자인 기능 사용 증거를 포함해 HANDOFF하라. 명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt 04 — Wave 1C 간소화 Work Map

```text
당신은 agent-shift SOP 구성원 업무맥락 재설계의 Wave 1C 간소화 Work Map 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/04_WAVE1C_SIMPLE_WORK_MAP.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1c-work-map-simple
필수 기준: branch wave1/sop-work-map-simple / Foundation 코드 baseline f20b619
(worktree HEAD에는 이후 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 f20b619와 동일하면 정상이다.)

필수 repository 지침, SOP skill과 reference, final scenario, 품질·디자인 규칙, 재설계 엔지니어링 문서, 00 master, 본 작업지시서를 끝까지 읽고 docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md의 Work Map API를 확인하라. preflight로 git status, HEAD와 npm run verify:sop-customer를 실행하라.

04_WAVE1C_SIMPLE_WORK_MAP.md의 배타적 소유 파일만 수정하라. detailed 세션 파일, Foundation Store/controller, login/context/recommendation, 기존 WorkLibrarySelector/Home/Gate, 생성 backend, /flow는 수정하지 마라.

구현 전에 Claude의 실제 디자인 검토 기능 또는 design skill로 14개 Activity와 관계 70개를 저밀도로 탐색하는 패턴을 검토하라. simple view는 장문을 기본 확장하지 않되 drawer에서 전체 편집을 제공하고, 모든 mutation은 Foundation controller만 사용하라.

작업지시서의 테스트, 1440×900·1920×1080 검증, keyboard/focus 검증을 수행하고 HANDOFF하라. 명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt 05 — Wave 1D 상세 Work Map

```text
당신은 agent-shift SOP 구성원 업무맥락 재설계의 Wave 1D 상세 Work Map 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/05_WAVE1D_DETAILED_WORK_MAP.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1d-work-map-detailed
필수 기준: branch wave1/sop-work-map-detailed / Foundation 코드 baseline f20b619
(worktree HEAD에는 이후 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 f20b619와 동일하면 정상이다.)

필수 repository 지침, SOP skill과 reference, final scenario, 품질·디자인 규칙, 재설계 엔지니어링 문서, 00 master, 본 작업지시서를 끝까지 읽고 docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md의 Work Map API를 확인하라. preflight로 git status, HEAD와 npm run verify:sop-customer를 실행하라.

05_WAVE1D_DETAILED_WORK_MAP.md의 배타적 소유 파일만 수정하라. simple 세션 파일, Foundation Store/controller, login/context/recommendation, 기존 WorkLibrarySelector/Home/Gate, 생성 backend, /flow는 수정하지 마라.

구현 전에 Claude의 실제 디자인 검토 기능 또는 design skill로 Activity master–detail, 긴 설명, Skill 편집의 인지 부하를 검토하라. simple과 같은 Foundation draft·mutation만 사용하고 별도 상태를 만들지 마라.

작업지시서의 테스트, 두 viewport, keyboard/focus/scroll 검증을 수행하고 HANDOFF하라. 명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt 06 — Wave 1E 개인 SOP node 생성

```text
당신은 agent-shift SOP 구성원 업무맥락 재설계의 Wave 1E 개인 SOP node 생성 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/06_WAVE1E_MEMBER_NODE_GENERATION.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1e-member-node-generation
필수 기준: branch wave1/sop-member-node-generation / Foundation 코드 baseline f20b619
(worktree HEAD에는 이후 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 f20b619와 동일하면 정상이다.)

필수 repository 지침, SOP skill과 reference 5개, final scenario, 품질 규칙, 재설계 SPEC과 NODE_AUTHORING_AND_AGENT_CONTROL, 00 master, 본 작업지시서를 끝까지 읽고 docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md와 src/lib/sop-node-authoring-contract.ts의 node schema·validator를 실제 코드로 검사하라. git status, HEAD와 npm run verify:sop-customer를 먼저 실행하라.

06_WAVE1E_MEMBER_NODE_GENERATION.md의 배타적 소유 파일만 수정하라. Foundation schema/validator, 대표 표준안 파일, UI, src/app/api/ai/route.ts, /flow는 수정하지 마라.

5대 node 규칙과 Mission/tool/HITL 구조를 개인 SOP prompt와 runner에 적용하되 기존 Activity coverage, 2~3 Sub Action 기본 기대, origin, terminal, Agent화 suggestion/member decision 분리를 훼손하지 마라. 입력에 없는 threshold·SLA·권한을 발명하지 마라. source-string 검사만으로 완료를 주장하지 말고 실제 pipeline fixture를 실행하라.

모든 지정 테스트와 검증을 실행하고 pipeline 순서, repair budget, blocking/warning 정책, 회귀 결과를 HANDOFF하라. 명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt 07 — Wave 1F 대표 표준안 node 생성

```text
당신은 agent-shift SOP 구성원 업무맥락 재설계의 Wave 1F 대표 표준안 node 생성 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/07_WAVE1F_STANDARD_DRAFT_GENERATION.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1f-standard-draft-generation
필수 기준: branch wave1/sop-standard-draft-generation / Foundation 코드 baseline f20b619
(worktree HEAD에는 이후 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 f20b619와 동일하면 정상이다.)

필수 repository 지침, SOP skill과 reference, final scenario, 품질 규칙, 재설계 SPEC과 NODE 작성 계약, 00 master, 본 작업지시서를 끝까지 읽고 docs/sop-member-context-redesign/work-orders/WAVE0_FOUNDATION_HANDOFF.md를 확인하라. 표준안 prompt는 이미 src/server/sop/sop-standard-draft-prompt.ts로 무동작변경 분리되어 있고, 공용 validator는 src/lib/sop-node-authoring-contract.ts에 있다. git status, HEAD와 npm run verify:sop-customer를 먼저 실행하라.

07_WAVE1F_STANDARD_DRAFT_GENERATION.md의 배타적 소유 파일만 수정하라. Foundation 공용 schema/validator, 개인 SOP 파일, src/app/api/ai/route.ts, HR UI, persistence·승인 mutation·agent executor, /flow는 수정하지 마라.

PII를 제거하면서 역할·입출력·조건·도구 의미를 보존하라. 승인 원본 간 threshold·책임·tool policy 충돌을 임의로 합치지 말고 standardizationIssues로 반환하라. 결과는 preview-only AI 초안이며 save·approve·execute side effect를 만들지 마라.

지정 테스트와 검증을 실행하고 sanitization field matrix, conflict fixture, side-effect 부재, schema 결과를 HANDOFF하라. 명시적 권한 없이는 commit·push하지 마라.
```
