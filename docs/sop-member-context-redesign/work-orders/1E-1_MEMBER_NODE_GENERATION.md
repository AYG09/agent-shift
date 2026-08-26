# 보완 지시서 1E-1 — 개인 SOP node 생성

이 문서는 **Wave 1E 세션 전용** 보완 지시서다. 다른 세션(1A~1D, 1F)에는 적용하지 않는다.
`06_WAVE1E_MEMBER_NODE_GENERATION.md`를 대체하지 않고, 그 위에 두 가지 수정을 추가한다.

작업 worktree: `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1e-member-node-generation`
branch: `wave1/sop-member-node-generation`

## 검토 결과 요약

당신이 제출한 작업은 자체 검증을 모두 통과했다: `tests/sop-node-authoring-generation.test.ts`(46),
`tests/sop-subaction-agentization.test.ts`(228), `npm run test:sop`, `lint`, `verify:quality`,
`verify:sop-customer` 전부 PASS. prompt의 tool policy 지시가 `EMPTY_TOOL_REGISTRY`와 정합하게
"allowedToolIds는 항상 빈 배열"로 되어 있는 점, 새 검증을 `structureVersion === 'activity-subaction-v1'`
에만 적용해 legacy Activity-scope 경로를 무회귀로 지킨 점은 계약대로다.

아래 두 항목만 수정하면 된다.

---

## 항목 1 (필수·차단) — `src/lib/sop-normalizer.ts` 소유권 위반과 1F와의 충돌

### 무엇이 문제인가

`src/lib/sop-normalizer.ts`는 `06_WAVE1E_MEMBER_NODE_GENERATION.md`의 배타적 소유 파일 목록에
없다. 당신은 이 파일을 수정했고, **Wave 1F 세션도 같은 파일의 같은 줄을 동시에 수정했다.**
`PARALLEL_EXECUTION.md` §1.3(한 파일의 active owner는 한 세션뿐)과 §5(공용 계약 부족은
`FOUNDATION_CHANGE_REQUEST`로 넘긴다)를 벗어난 상태다.

두 수정은 단순 텍스트 충돌이 아니라 **의미가 상충한다.**

당신의 버전:

```ts
instructionContractVersion: params.structureVersion === 'activity-subaction-v1'
    ? SOP_NODE_INSTRUCTION_CONTRACT_VERSION
    : undefined,
```

1F의 버전:

```ts
/** Set only when this generation was actually produced/validated under the node-authoring contract — never inferred, mirroring structureVersion above. */
instructionContractVersion?: SopDocument['instructionContractVersion'];
...
instructionContractVersion: params.instructionContractVersion,
```

둘 중 하나를 그대로 고르면 반드시 한쪽이 깨진다. 실제로 확인한 결과:

- Wave 2가 **당신의 버전**을 채택하면 → 1F의 runner가
  `createSopDocumentFromGeneration({ ..., instructionContractVersion: SOP_NODE_INSTRUCTION_CONTRACT_VERSION })`
  를 호출하는데 그 파라미터가 존재하지 않아 **타입 오류**가 난다.
- Wave 2가 **1F의 버전**을 채택하면 → 당신의
  `tests/sop-node-authoring-generation.test.ts:177`이 파라미터를 넘기지 않은 채 stamp를
  기대하므로 **테스트가 실패**한다.

### 어느 설계가 맞는가

1F의 명시적 파라미터 방식이 맞다. 근거 두 가지다.

1. Foundation 계약(`src/lib/sop-types.ts`의 `instructionContractVersion` docstring,
   `NODE_AUTHORING_AND_AGENT_CONTROL.md` §4.4)은 이 값을 **실제로 그 계약으로 생성·검증된
   문서에만** 찍고 **추론하지 않는다**고 규정한다. `structureVersion`에서 파생하는 것은
   추론이다 — 구조 버전은 "Activity–Sub Action 형태인가"이고, 계약 버전은 "node 작성 품질
   검증을 실제로 통과했는가"로 서로 다른 사실이다.
2. 대표 표준안 문서는 `structureVersion`이 **없지만** node 작성 검증은 통과한다. 파생 규칙으로는
   이 문서를 영원히 stamp할 수 없다. 즉 파생 규칙은 표현력이 부족하다.

### 무엇을 하라

1. `src/lib/sop-normalizer.ts`에 대한 당신의 수정을 **1F와 바이트 단위로 동일한 형태**로
   바꾼다. 구체적으로:
   - `createSopDocumentFromGeneration`의 params에 optional
     `instructionContractVersion?: SopDocument['instructionContractVersion']`를 추가한다.
   - 반환 객체에서는 `instructionContractVersion: params.instructionContractVersion`로 **그대로
     통과**시킨다. `structureVersion` 기반 파생 로직과 `sop-node-authoring-contract` import를
     제거한다.
   - `executionSpec: s.executionSpec` passthrough와 `agentInstruction: parsedData.agentInstruction`
     passthrough는 그대로 둔다(1F와 동일).
   - 주석은 1F 쪽 문구를 기준으로 맞춘다. 두 worktree의 이 파일 diff가 완전히 같아야 Wave 2가
     충돌 없이 통합한다.

2. `tests/sop-node-authoring-generation.test.ts`의 stamp 검증을 계약에 맞게 고친다.
   - `createSopDocumentFromGeneration` 호출에 `instructionContractVersion: SOP_NODE_INSTRUCTION_CONTRACT_VERSION`
     을 **명시적으로 넘기고**, 그 값이 문서에 보존되는지 확인한다.
   - 넘기지 않았을 때 `document.instructionContractVersion === undefined`인지도 함께 검증한다.
     "추론하지 않는다"가 이 테스트의 실제 주장이 되어야 한다.
   - Mission(`agentInstruction`)과 `executionSpec` 보존 검증은 그대로 유지한다.

3. **미완료 항목으로 명시 인계한다.** 구성원 Task 경로는
   `src/lib/sop-ai-generation.ts`(당신의 소유 파일 아님)가
   `createSopDocumentFromGeneration`을 호출한다. 따라서 이 파라미터를 실제로 넘겨
   구성원 문서에 stamp가 찍히게 하는 배선은 당신이 할 수 없다. handoff에 다음을 그대로 적는다.

   ```text
   INTEGRATION_REQUEST (Wave 2)
   대상 파일: src/lib/sop-ai-generation.ts
   요청: createSopDocumentFromGeneration 호출에 instructionContractVersion을 전달할 것.
   조건: 해당 생성이 structureVersion 'activity-subaction-v1'로 요청되어 runSopGenerationPostProcessing의
         node authoring 검증을 통과한 경우에만 SOP_NODE_INSTRUCTION_CONTRACT_VERSION을 넘긴다.
   이유: 계약 버전은 추론이 아니라 "실제 검증을 통과했다"는 사실의 기록이다 (§4.4).
   ```

4. `FOUNDATION_CHANGE_REQUEST` 형식으로 `src/lib/sop-normalizer.ts` 수정 사실 자체도 handoff에
   남긴다. 이 파일은 당신 소유가 아니며, 1F와 공동 수정 상태라는 점을 Wave 2가 알아야 한다.

---

## 항목 2 (필수) — 의미 repair를 기존 repair round 하나로 합칠 것

### 무엇이 문제인가

`06_WAVE1E_MEMBER_NODE_GENERATION.md`는 "기존 wire normalization, Activity coverage,
suggestion patch, deterministic fallback 순서를 먼저 이해하고 **하나의 일관된 pipeline으로
결합**한다", "기존 repair budget 안에서 **최대 한 번**의 의미 repair를 수행한다. 별도 무한
retry나 **중복 전체 생성 호출을 추가하지 않는다**"고 지시했다.

현재 구현은 `src/server/sop/sop-generation-runner.ts`에 **새로운 독립 repair 단계**를
coverage 검사보다 앞에 추가했다(약 215~240행). 그 결과 한 번의 생성 요청에서 전체 문서
재생성이 다음처럼 쌓일 수 있다.

```text
최초 생성
→ runSopValidationPipeline (내부 repair 최대 1회)
→ [신규] authoring repair 생성 (generateSopRepairWithRetry = 최대 2회 호출)
→ [신규] runSopValidationPipeline 재실행 (내부 repair 최대 1회)
→ 기존 coverage/origin/suggestion repair 생성 (최대 2회 호출)
→ runSopValidationPipeline 재실행 (내부 repair 최대 1회)
```

28~42 노드 문서에서 이 누적은 지연·토큰 비용을 크게 키우고, 예산을 다 쓴 뒤 결국 400으로
끝날 확률을 높인다. `subaction-semantics-contract.md` §8이 경고하는 repair 퇴행 경로와 같은
종류의 위험이다.

### 무엇을 하라

authoring blocking 검사를 **기존 coverage repair round와 하나로 합친다.**

- authoring 검사 자체는 지금처럼 `structureVersion === 'activity-subaction-v1'`에서만 수행한다.
- blocking issue가 있으면 **즉시 별도 repair를 호출하지 말고**, coverage/suggestion/origin/
  under-decomposition 결함과 **같은 repair guidance 문자열에 합쳐** 기존 repair 호출
  한 번으로 처리한다(현재 코드 기준 약 290~300행의 `## Activity 연결 보정` 블록).
- repair 이후 재검증 구간(현재 약 304~306행에서 coverage·suggestion·origin을 다시 확인하는
  곳)에서 authoring 검사도 함께 다시 수행한다.
- 재검증 후에도 authoring blocking이 남으면 지금처럼 400으로 표면화한다. 이 동작은 유지한다.
- warning은 지금처럼 `pipelineResult.warnings`에 합류시킨다. 이 동작도 유지한다.
- 결과적으로 한 요청당 **의미 repair round는 최대 1회**, 전체 재생성 호출은 기존 경로와 같은
  횟수여야 한다.

### 검증에 추가할 것

`tests/sop-node-authoring-generation.test.ts`에 다음을 실행 가능한 형태로 추가한다.

- authoring blocking과 coverage 결함이 **동시에** 있는 fixture에서 repair 생성 함수가
  **정확히 한 번만** 호출된다(호출 횟수를 세는 스텁 사용).
- 그 한 번의 repair prompt에 authoring 이슈와 coverage 이슈가 **모두** 포함된다.
- repair 후에도 authoring blocking이 남으면 400이고, 해소되면 정상 문서가 반환된다.
- legacy Activity-scope 요청에서는 authoring 검사도 repair도 일어나지 않는다(기존 검증 유지).

---

## 하지 말 것

- `src/lib/sop-node-authoring-contract.ts`, `src/lib/sop-node-markdown.ts`,
  `src/lib/sop-prototype-store.ts` 등 Foundation 소유 파일 수정
- 대표 표준안 prompt·runner·schema·route 수정 (1F 소유)
- `src/lib/sop-ai-generation.ts` 수정 (Wave 2 통합 대상 — 위 INTEGRATION_REQUEST로 넘긴다)
- `src/app/api/ai/route.ts`, `/flow` 관련 파일 수정
- prompt의 tool policy 지시를 완화해 `allowedToolIds`를 채우게 만드는 변경
  (등록 registry가 없는 현재 상태에서는 blocking issue만 늘어난다)

## 완료 후 실행할 명령

```bash
npx tsx tests/sop-node-authoring-generation.test.ts
npx tsx tests/sop-subaction-agentization.test.ts
npm run test:sop
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
git status --short
```

`npx tsc --noEmit`이 `.next/types/app/api/ai/route.ts`에서 `getAsIsPrompt` 관련 오류를 낸다면
그것은 이 작업과 무관한 baseline 이슈다(`src/app/api/ai/route.ts`가 route 파일에서 비-route
심볼을 export하는 기존 구조 + 이전 빌드가 남긴 `.next` 산출물). 그 오류만 남는다면 그대로
보고하고 고치려 하지 마라 — 그 파일은 Wave 2 소유다.

## 보완 handoff에 포함할 것

1. `src/lib/sop-normalizer.ts`의 최종 diff (1F와 동일함을 확인한 근거 포함)
2. 변경한 테스트와 새로 추가한 repair 횟수 검증 결과
3. repair round 통합 전후의 최대 전체 재생성 호출 횟수 비교
4. 위 `INTEGRATION_REQUEST` 원문
5. `FOUNDATION_CHANGE_REQUEST` 원문 (공유 파일 수정 사실)
6. 실행한 명령과 PASS/FAIL, 실패 시 원문 오류

명시적 권한 없이는 commit·push하지 않는다.
