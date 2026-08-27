# 작업지시서 E2-03A — 공유 모듈 좁히기 (P2-A, sop-platform, 병렬)

## 임무

`graph-validation.ts`(972줄)와 `flow-shapes.ts`(581줄)의 SOP 사본에서 **SOP가 쓰지 않는 것을
제거**하고, `SopStepShapeRenderer`의 이름 변경을 마무리한다. 좁히기의 목적은 줄 수 감소가
아니라 **소유권 확정**이다 — 두 저장소가 같은 함수를 서로 다른 의미로 갖고 있으면 한쪽 수정이
다른 쪽을 조용히 깨뜨린다 (`CONTEXT.md` §3.4).

## 저장소

```text
C:\Users\USER\Desktop\NOCODE\sop-platform   (branch: main)
기준: E1-02 handoff 시점의 작업트리
```

`agent-shift`는 만지지 않는다.

## 시작 조건

`E0_00_MASTER.md` §2 필독 목록, `E0_BASELINE_EVIDENCE.md`, E1-02 handoff를 읽는다.

```bash
cd C:/Users/USER/Desktop/NOCODE/sop-platform
git status --short
npm run test:sop            # 좁히기 전 기준. 결과를 그대로 기록한다
```

## 배타적 소유 파일

```text
src/lib/graph-validation.ts
src/lib/flow-shapes.ts
src/components/sop/SopStepShapeRenderer.tsx
```

`REQ-E2A-001`: 위 3개 밖의 파일을 수정하지 않는다. 좁히기가 다른 파일의 수정을 요구한다면
그것은 **좁히기가 아니라 제거 대상이 실제로 쓰이고 있다는 증거**다. 되돌리고 기록한다.

## 구현 지시

### 1. 먼저 기준을 만든다 — 이 순서를 바꾸지 않는다

`REQ-E2A-002`: **줄이기 전에 테스트를 돌린다.** 이것이 `TST-EXT-001`의 전제다.
"줄였는데 테스트가 그대로 통과한다"가 그 코드를 SOP가 쓰지 않았다는 증거인데, 줄인 뒤에만
돌리면 무엇과 같은지 말할 수 없다.

```bash
npm run test:sop 2>&1 | tail -40    # 통과 파일 수·단언 수를 기록
npm run test:sop-demo
npx tsc --noEmit
```

### 2. 도달 가능한 export를 실측한다

```bash
# graph-validation의 각 export가 이관된 코드에서 참조되는지
grep -rn "graph-validation" src/ tests/ --include=*.ts --include=*.tsx \
  | grep -v "^src/lib/graph-validation.ts"

# flow-shapes도 같은 방식으로
grep -rn "flow-shapes" src/ tests/ --include=*.ts --include=*.tsx \
  | grep -v "^src/lib/flow-shapes.ts"
```

2026-08-27 원본 기준 실측으로 확인된 `graph-validation` 참조 지점 (이관 후에도 같아야 한다):

```text
src/lib/sop-generation-pipeline.ts   validateSopFull, hasBlockingSopIssues, buildRepairInstruction,
                                     applyDeterministicGraphFixes, classifySopStepType,
                                     ValidatableNode, ValidatableEdge, ValidatableSopStep,
                                     GraphValidationIssue, SopStructuralConstraints
src/lib/sop-normalizer.ts            classifySopStepType
src/lib/sop-review.ts                validateSopGraph
src/components/sop/SopCanvas.tsx     classifySopStepType
src/components/sop/SopEdgeInspector.tsx        validateSopDecisionBranches, classifySopStepType
src/components/sop/SopStepCoreEditor.tsx       normalizeStepShapeChange
src/server/sop/sop-generation-runner.ts        SopStructuralConstraints (type)
src/server/sop/sop-standard-draft-runner.ts    SopStructuralConstraints (type)
tests/sop.test.ts                    validateSopGraph, validateSopDecisionBranches,
                                     validateSopStructuralConstraints, findReworkEdges,
                                     normalizeStepShapeChange, validateFlowGraph,
                                     hasBlockingSopIssues, classifySopStepType
tests/sop-subaction-agentization.test.ts       validateSopFull, validateSopGraph, hasBlockingSopIssues
```

`INT-E2A-001`: **`tests/sop.test.ts`가 `validateFlowGraph`를 import한다.** 이름이 `/flow`처럼
보이지만 SOP 테스트의 단언이 이 함수에 걸려 있다. 따라서 `validateFlowGraph`는
**제거 대상이 아니다.** 테스트의 단언을 고쳐서 제거를 정당화하는 것은 금지다
(`E0_00_MASTER.md` §6 "SOP 테스트 21개의 단언 내용" 수정 금지).

`INT-E2A-002`: 위 실측의 결과로 **실제 제거 가능 표면은 작다.** 유력 후보는
`validateDrilldownBranching`과 그 인터페이스 2개(`DrilldownStepLike`, `DrilldownSubEdgeLike`),
그리고 `/flow` 전용 `hasBlockingIssues` 정도다. **이것이 정상이다.** 좁히기의 성과를
줄 수로 평가하지 않는다. 더 크게 자르려고 도달 가능한 코드를 건드리지 마라.

### 3. `graph-validation.ts`를 좁힌다

제거 절차는 항목마다 다음을 반복한다.

1. 제거 후보 export 하나를 정한다
2. `grep -rn "<이름>" src/ tests/`로 참조 0건임을 확인하고 **출력을 기록**한다
3. 제거한다. 그 export만 쓰던 private helper도 함께 제거한다
4. `npx tsc --noEmit && npm run test:sop`을 돌린다
5. §1의 기준과 결과가 **완전히 같은지** 확인한다

`REQ-E2A-003`: 한 번에 여러 개를 제거하지 않는다. 함께 제거하면 어느 것이 실제로 쓰였는지
분리할 수 없다.

`REQ-E2A-004`: **`GraphIssueType` 유니온과 `EdgeBranchType` 유니온의 멤버를 줄이지 않는다**
(`REQ-EXT-004`). 값 집합은 스키마·문서·저장된 문서의 원천이다. 제거는 **함수와 그 전용
helper에 한정**한다.

`REQ-E2A-005`: 파일 상단 docstring과 각 함수의 "왜 이렇게 되어 있는가" 주석을 **줄이거나
요약하지 않는다** (`INT-PAR-002`). 제거된 함수의 주석만 함께 제거한다.

### 4. `flow-shapes.ts`는 좁히지 않는다

`REQ-E2A-006`: **`flow-shapes.ts`는 복사 상태 그대로 둔다.**
`EXTRACTION_SPEC.md` §3이 명시한 이유다 — `FLOW_SHAPE_IDS`가 SOP 스키마 enum의 원천이므로
값 집합을 줄이면 `sop-document-schema.ts`·`sop-schemas.ts`·`sop-types.ts`와 이미 저장된 문서가
함께 깨진다.

이 세션이 `flow-shapes.ts`에 대해 할 일은 **좁히지 않았음을 증명하는 것**뿐이다.

```bash
diff C:/Users/USER/Desktop/NOCODE/agent-shift/src/lib/flow-shapes.ts \
     C:/Users/USER/Desktop/NOCODE/sop-platform/src/lib/flow-shapes.ts
# 출력이 비어야 한다
```

파일명에 `flow`가 남는 것은 문제가 아니다. 이름 변경은 import 경로를 바꾸는 일이고, 그것은
SOP 도메인 파일 6개를 수정한다는 뜻이므로 **이 라운드의 범위 밖**이다(`REQ-PAR-004`).
후속 라운드로 넘긴다는 사실만 handoff에 적는다.

### 5. `SopStepShapeRenderer`를 마무리한다

E1이 파일명과 컴포넌트명을 이미 바꿨다. 이 세션이 확인·정리할 것:

- 파일 내부의 `Flow` 접두 식별자(내부 helper, prop 타입 이름, 주석 문구)가 남아 있으면
  정리한다. **렌더 결과를 바꾸는 변경은 하지 않는다** — SVG 경로·치수·색 계산 로직 무변경.
- `src/components/sop/SopStepNode.tsx`가 유일한 호출부다. 그 파일은 **P2-A 소유가 아니므로
  수정하지 않는다.** E1이 이미 import를 고쳤다. 고쳐지지 않았다면 P2-A는 고치지 말고
  실행 관리자에게 반려한다.

`TST-E2A-001`: 이름 정리 전후로 `tests/sop-work-map-detailed.test.tsx`,
`tests/sop-readonly-inspectors.test.tsx`의 결과가 동일해야 한다.

## 금지

- SOP 테스트의 단언 내용 수정 — 제거를 정당화하기 위한 테스트 변경 포함
- 값 집합(enum·유니온 멤버) 축소
- `flow-shapes.ts` 좁히기
- 도달 가능한 export 제거 (`validateFlowGraph` 포함)
- 소유 3개 파일 밖의 수정 — `SopStepNode.tsx` 포함
- docstring 축약
- 검증 로직의 판정 기준 변경 (blocking/warning 구분, 이슈 타입 부여 규칙)
- `agent-shift` 수정
- 사용자 승인 없는 commit

## 수용 검증

```bash
npx tsc --noEmit
npm run lint
npm run test:sop            # §1 기준과 동일한 결과
npm run test:sop-demo
git diff --check
git status --short          # 소유 3개 파일만
```

`TST-E2A-002`: `npm run test:sop`의 통과 파일 수·단언 수가 **§1에서 기록한 기준과 정확히
같아야 한다.** 하나라도 다르면 제거한 코드가 실제로 쓰이고 있었다는 뜻이다.

`TST-E2A-003`: 제거한 각 항목에 대해 참조 0건 grep 출력이 존재한다. 출력 없이 제거한 항목이
하나라도 있으면 이 세션은 완료가 아니다.

## 인계

`E0_00_MASTER.md` §12 형식에 더해:

1. **제거 목록** — 항목별로 (이름, 줄 수, 참조 0건 증명 grep 명령과 출력)
2. **제거하지 않은 후보와 그 이유** — 특히 `validateFlowGraph`가 SOP 테스트에 걸려 있다는
   사실 (`INT-E2A-001`)
3. **좁히기 전후 테스트 결과 대조표**
4. `flow-shapes.ts`가 원본과 byte 동일하다는 `diff` 출력
5. `flow-shapes.ts`·`graph-validation.ts`의 **파일명 정리를 후속 라운드로 넘긴다**는 기록
6. P3에게: 이 세션이 만진 파일과, 좁히기가 blocking/warning 판정에 영향을 주지 않았다는 확인
