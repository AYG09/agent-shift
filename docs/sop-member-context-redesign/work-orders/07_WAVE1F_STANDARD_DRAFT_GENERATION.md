# 작업지시서 07 — Wave 1F 대표 표준안 node 생성

## 임무

승인된 same-Task 개인 SOP를 통합하는 대표 표준안 생성에 개인 SOP와 동일한 node 품질 계약을 적용한다. PII를 제거하면서 책임·입출력·조건·도구·주의 의미를 보존하고, 원본 충돌은 임의로 해소하지 않고 `standardizationIssues`로 반환한다.

## 시작 조건

검증 완료된 Wave 0 Foundation commit에서 분기한 전용 worktree에서 시작한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 완료하고 Foundation에서 기계적으로 분리된 표준안 prompt module과 공용 validator를 확인한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## 배타적 소유 파일

```text
src/server/sop/sop-standard-draft-prompt.ts
src/server/sop/sop-standard-draft-runner.ts
src/lib/sop-standard-draft-schemas.ts
src/app/api/sop/standard-drafts/route.ts
tests/sop-standard-draft-node-contract.test.ts
tests/sop-hr-analytics.test.ts
```

## 수정 금지

- Foundation 공용 schema·validator
- 개인 SOP prompt·runner
- `src/app/api/ai/route.ts`
- HR UI와 다른 SOP UI
- repository persistence·승인 mutation·agent executor
- `/flow`

## 충족할 계약

- `REQ-NODE-001`~`REQ-NODE-005`
- `REQ-AOP-001`~`REQ-AOP-004`
- `REQ-STD-001`~`REQ-STD-004`
- `TST-GEN-004`~`TST-GEN-006`
- `TST-STD-001`~`TST-STD-006`
- 기존 approved same-Task, 최소 source 수, HR-only, preview-only, opaque provenance 계약

## 구현 지시

### source sanitization을 개선한다

- 기존 title·definition만 전달하는 손실을 제거한다.
- 개인 이름, 사번, 조직 식별정보, reviewer feedback, 자유서술 PII는 제거한다.
- opaque source label과 record ID를 사용한다.
- step title·definition, responsible role category, inputs, outputs, descriptive tools, cautions, decision rules, safe execution spec 의미를 보존한다.
- 역할명이나 자유서술에 개인 식별정보가 섞일 수 있음을 고려해 schema validation과 sanitization을 함께 적용한다.
- 승인되지 않았거나 다른 Task인 source는 기존처럼 차단한다.

### 표준화 prompt와 결과를 강화한다

- Task Library Task 정의를 document Mission의 기준으로 사용한다.
- 개인 SOP와 동일한 5대 node 작성 규칙과 공용 validator를 적용한다.
- 공통 행동을 우선하되 행동, 책임, 조건, tool policy를 각각 비교한다.
- threshold, 책임, tool permission이 원본 간 충돌하면 하나를 고르거나 평균 내지 않는다.
- 충돌은 target step, issue type, 비식별 source values, 필요한 human decision을 가진 `standardizationIssues[]`로 반환한다.
- 입력에 없는 threshold·SLA·권한을 발명하지 않는다.
- allowed tool 충돌을 자동 실행 허용으로 승격하지 않는다.
- quality report와 standardization issues를 response schema에서 검증한다.

### preview-only를 보존한다

- 생성 결과는 계속 `AI 초안`이다.
- repository에 저장하거나 공식 대표안으로 확정하지 않는다.
- 승인 상태를 변경하거나 agent/tool executor를 호출하지 않는다.
- 기존 route의 HR authorization, rate limit, safe error boundary를 보존한다.

## 수용 검증

- PII fixture는 식별정보를 제거하지만 역할·입출력·조건·도구 의미를 유지한다.
- threshold/tool policy 충돌은 `standardizationIssues`가 되고 임의 대표값이 문서에 들어가지 않는다.
- 표준안 node가 공용 node 품질 validator를 통과하거나 명시적 issue를 반환한다.
- approved same-Task source만 사용하고 opaque provenance를 유지한다.
- response가 quality report·issue schema를 통과한다.
- route는 save, approve, publish, execute side effect를 호출하지 않는다.
- 기존 HR analytics 테스트를 회귀시킨다.

```bash
npx tsx tests/sop-standard-draft-node-contract.test.ts
npx tsx tests/sop-hr-analytics.test.ts
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식을 따른다. sanitization 전후 field matrix, conflict fixture와 결과, side-effect 부재 증거, schema 변경을 추가한다. 개인 SOP 파일, `src/app/api/ai/route.ts`, HR UI, `/flow`를 변경하지 않았음을 명시한다.

명시적 권한 없이는 commit·push하지 않는다.
