# 작업지시서 06 — Wave 1E 개인 SOP node 생성

## 임무

구성원의 확정 Work Map과 동일 업무맥락으로 생성하는 개인 SOP에 5대 node 작성 규칙과 agent-ready 구조 계약을 적용한다. 기존 Activity–Sub Action coverage, origin, terminal node, Agent화 제안 분리 계약은 보존한다.

## 시작 조건

검증 완료된 Wave 0 Foundation commit에서 분기한 전용 worktree에서 시작한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 완료하고 Foundation의 node schema, validator, quality report 계약을 실제 코드로 확인한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## 배타적 소유 파일

```text
src/server/sop/sop-prompt.ts
src/server/sop/sop-generation-runner.ts
tests/sop-node-authoring-generation.test.ts
tests/sop-subaction-agentization.test.ts
```

## 수정 금지

- Foundation schema·validator·Store 파일
- `src/app/api/ai/route.ts`
- 대표 표준안 prompt·runner·schema·route
- UI 파일
- `/flow` prompt·schema·route 동작

공통 schema나 route 변경이 정말 필요하면 직접 수정하지 말고 정확한 diff 제안과 회귀 위험을 `FOUNDATION_CHANGE_REQUEST` 또는 integration request로 넘긴다.

## 충족할 계약

- `REQ-NODE-001`~`REQ-NODE-005`
- `REQ-AOP-001`~`REQ-AOP-004`
- `TST-GEN-001`~`TST-GEN-003`
- `TST-NODE-001`~`TST-NODE-008`
- `TST-AOP-001`~`TST-AOP-006`
- 기존 final scenario의 Task-wide Activity coverage, 2~3 Sub Action/Activity, sourceActivityId·origin, terminal rule, Agent화 suggestion completeness

## 구현 지시

### prompt를 강화한다

- 문서 수준 Mission을 Task 정의와 확정 업무맥락에서 작성하게 한다.
- business node는 한국어 `대상 + 구체적 행동 동사` 형태의 action-centered title과 최소 유효 단일 행동을 갖게 한다.
- responsible role과 능동태 실행 의미를 요구한다.
- completion criteria와 decision rule은 관찰 가능하고 입력 근거를 가져야 한다.
- `필요 시`, `적절히`, `고액`, `신속히` 같은 표현만으로 조건을 확정하지 못하게 한다.
- 입력에 없는 80%, SLA, 금액, confidence threshold를 발명하지 못하게 한다.
- 정의되지 않은 약어는 glossary 또는 unresolved issue로 다루게 한다.
- descriptive tool과 tool permission을 분리하고 unknown tool 또는 금지 권한을 허용하지 않는다.
- escalation/HITL은 입력에 근거가 있을 때 target role, trigger, pre-approval 실행 제한을 구조화한다.
- terminal과 pure control node에는 business execution spec을 강제하지 않는다.

### 생성 후 검증을 연결한다

- Foundation의 공용 node validator를 generation runner에 적용한다.
- 기존 wire normalization, Activity coverage, suggestion patch, deterministic fallback 순서를 먼저 이해하고 하나의 일관된 pipeline으로 결합한다.
- semantic issue가 repair 가능한 경우 기존 repair budget 안에서 최대 한 번의 의미 repair를 수행한다. 별도 무한 retry나 중복 전체 생성 호출을 추가하지 않는다.
- repair 후 blocking issue가 남으면 정상 문서처럼 반환하지 않는다. 기존 API가 표현 가능한 오류 또는 명시적 human-review issue로 표면화한다.
- warning과 blocking을 구분한다.
- 구조화 객체가 권위 원본이고 Markdown은 projection이라는 계약을 유지한다.

### 기존 불변식을 보존한다

- 모든 확정 Activity를 원본·편집 순서대로 포함한다.
- Activity별 기본 2~3 Sub Action 분해와 max node capacity 보정을 보존한다.
- sourceActivityId·origin·coverage와 Activity별 Skill 관계를 보존한다.
- terminal node를 business step, Agent화 제안, 실행 instruction 대상으로 오인하지 않는다.
- Agent화 AI suggestion이 구성원 decision 또는 tool permission을 자동 변경하지 않는다.

## 수용 검증

새 테스트는 실제 prompt string 존재 확인에 그치지 않고 runner의 wire → normalize → validate → document 결과를 실행한다.

- good fixture는 action, role, completion criteria, tool/HITL 의미를 보존한다.
- 피동·책임 불명, 복합 행동, 모호 조건은 repair 또는 review issue가 된다.
- 입력에 없는 threshold, unknown tool, 금지 권한은 blocking이다.
- terminal/pure control은 execution spec 대상에서 제외된다.
- Activity coverage·origin·Agent화 제안 기존 테스트가 계속 통과한다.

```bash
npx tsx tests/sop-node-authoring-generation.test.ts
npx tsx tests/sop-subaction-agentization.test.ts
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식을 따른다. generation pipeline 순서, repair 횟수, blocking/warning 정책, 기존 불변식 회귀 결과를 추가한다. `src/app/api/ai/route.ts`와 `/flow`를 변경하지 않았음을 명시한다.

명시적 권한 없이는 commit·push하지 않는다.
