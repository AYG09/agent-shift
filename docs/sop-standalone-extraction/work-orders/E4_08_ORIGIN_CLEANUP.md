# 작업지시서 E4-08 — 원본 정리 (P4, agent-shift, E3 통과 후)

## 임무

`agent-shift`에서 SOP 전용 코드를 제거하고, **`/flow`가 깨지지 않았음을 증명**한다.
이 증명이 `CONTEXT.md` §2.2의 전제("의존 방향은 단방향, `/flow` → SOP 참조 0건")를 사후
검증하는 마지막 단계다.

## 시작 조건 — 이것부터 확인한다

`REQ-E4-001`: **E3-07의 통과 handoff가 없으면 시작하지 않는다** (`REQ-PAR-007`,
`REQ-EXT-002`). 부분 통과·"거의 다 됐다"는 시작 사유가 아니다. 검증되지 않은 이관 상태에서
원본을 지우면 되돌릴 근거가 사라진다.

```bash
# E3 handoff에 다음이 전부 PASS로 적혀 있어야 한다
#   tsc / lint / test:sop(22) / test:sop-demo / build / next build --webpack
#   verify:quality / verify:sop-customer --final / --scenario-final
#   외부망 차단 기동 / 구성원 전체 흐름 / A11Y-1~5 대조
```

## 저장소

```text
C:\Users\USER\Desktop\NOCODE\agent-shift   (branch: wave0/sop-foundation, 기준 52b8377)
```

`REQ-E4-002`: **`sop-platform`을 만지지 않는다** (`REQ-PAR-005`). 이 세션은 원본 저장소
전용이다.

## 시작 조건 (계속)

```bash
cd C:/Users/USER/Desktop/NOCODE/agent-shift
git status --short --branch
git diff --stat 52b8377 -- src tests     # 비어 있어야 한다

# 제거 전 /flow 기준선 — 이 값이 REQ-EXT-003의 대조 기준이다
npm run test:flow-branches
npm run test:shapes
npm run build
npx next build --webpack
```

`REQ-E4-003`: **제거 전에 `/flow` 테스트를 먼저 돌린다.** 제거 후에만 돌리면 무엇과 같은지
말할 수 없다. `E0_BASELINE_EVIDENCE.md`의 값과도 대조한다.

## 배타적 소유 파일

`agent-shift`의 SOP 전용 파일 전부 + 아래 공유 파일.

```text
src/app/api/ai/route.ts          SOP 분기 제거
src/app/page.tsx                 SOP 진입 버튼
package.json                     SOP 스크립트·미사용 의존성
scripts/verify-quality.mjs       SOP 규칙
AGENTS.md, CLAUDE.md, .github/copilot-instructions.md
docs/QUALITY_CONVENTIONS.md, docs/DESIGN_CONVENTIONS.md
```

## 구현 지시

### 1. 제거한다 — SOP 전용

```text
src/lib/sop-*.ts                          52개
src/components/sop/**                     38개
src/components/sop-demo/**                 3개
src/server/sop/**                          8개
src/app/sop/**                            12개
src/app/api/sop/**                        12개
src/data/sop-task-library-sample.json      1개
tests/sop*.test.ts, tests/sop*.test.tsx   21개
src/hooks/useSopAiSettings.ts              1개  ← 제거 후 참조 0건이 된다
.agents/skills/implement-sop-customer-requirements/**
docs/sop-member-context-redesign/**
SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md
SOP_CODE_QUALITY_REVIEW_AND_SONNET5_WORK_ORDER.md
SOP_MEMBER_HOME_SUBACTION_AGENTIZATION_WORK_ORDER.md
```

`REQ-E4-004`: 제거 목록은 **E3 handoff가 넘겨준 "E1이 실제로 이관한 파일 목록"과 대조**해
확정한다. 문서의 glob을 그대로 믿지 않는다 — `src/components/sop-demo/**`가 원래 인벤토리에서
빠져 있었던 것이 격차 G1이다.

`INT-E4-001`: `docs/sop-standalone-extraction/**`는 **원본에 남긴다.** 이 문서 세트가
"SOP가 왜 이 저장소를 떠났는가"의 기록이며, P4 자신이 그것을 근거로 실행 중이다.
`README.md`에 새 저장소의 위치를 한 줄 추가한다. (같은 내용이 `sop-platform`에도 있으므로
이후 두 사본은 갈라진다 — 그것이 분기 복사의 정의다.)

### 2. 남긴다 — `/flow`가 실제로 쓰는 공유 모듈

실측으로 확인된 것이다. **제거하지 마라.**

| 파일 | `/flow`에서의 사용 |
|---|---|
| `src/lib/graph-validation.ts` | `validateFlowGraph`, `validateDrilldownBranching` 등 |
| `src/lib/flow-shapes.ts` | `CustomNodes`, `FlowCanvas`, `NodeEditor`, `ShapePalette`, `store.ts`, `ai-schemas.ts`, `export-service.ts` |
| `src/components/flow/FlowShapeRenderer.tsx` | `CustomNodes.tsx`, `ShapePalette.tsx` |
| `src/lib/ai-shape-guide.ts` | `ai-schemas.ts`, `src/server/flow/flow-prompts.ts` |
| `src/server/ai/model-factory.ts` | `/api/ai`, `/api/models` |
| `src/lib/gemini-models.ts` | `model-factory`, `ApiKeySettings`, `/api/models` |
| `src/components/settings/ApiKeySettings.tsx` | `src/app/flow/page.tsx:1375` |
| `src/components/ui/**`, `src/lib/utils.ts` | `ApiKeySettings`, `/flow` 화면 |
| `src/app/api/models/route.ts` | `ApiKeySettings` |

`REQ-E4-005`: `graph-validation.ts`의 **SOP 전용 함수를 이 세션에서 제거하지 않는다.**
`validateSopGraph`·`validateSopFull`·`classifySopStepType` 등은 `/flow`가 쓰지 않지만,
제거하면 `tests/flow-branches.test.ts`·`tests/sop.test.ts`가 사라진 상태에서 회귀를 증명할
수단이 없다. **원본 쪽 좁히기는 별도 라운드**로 넘긴다. 이 세션의 목표는 SOP **제거**이지
`/flow` 정리가 아니다.

### 3. `src/app/api/ai/route.ts`에서 SOP 분기를 제거한다

제거 대상:

```text
import  SopGenerationWireSchema, SopSuggestionPatchSchema   (@/lib/sop-schemas)
import  getSopPrompt                                        (@/server/sop/sop-prompt)
import  parseSopGenerationRequest                           (@/server/sop/sop-request)
import  type SopGenerationRequest                           (@/lib/sop-ai-request)
import  runSopGenerationPostProcessing                      (@/server/sop/sop-generation-runner)
import  computeSubActionCapacity                            (@/lib/sop-subaction-capacity)

case 'generateSop': { … }                     switch 블록 전체
let sopRequest: SopGenerationRequest | undefined;
graphKind 유니온에서 'sop'
generationMaxOutputTokens의 sop 삼항 → 16384 상수로
1차 생성 실패 시 재시도 블록 (graphKind !== 'sop' throw 경로)  → 원래 /flow 동작으로 환원
if (graphKindType === 'sop') { … } 블록 전체 (generateRepair / generateSuggestionPatch 포함)
```

`REQ-E4-006`: `/flow` 경로의 **동작을 바꾸지 않는다.**

- `maxOutputTokens`는 `/flow`가 원래 쓰던 **16384**로 남는다
- `generateAsIsFlow` / `generateToBeFlow` / `generateDrilldown` / `generateNodeSplit`의
  prompt·스키마·검증·repair 정책 무변경
- `validateFlowGraph`·`validateDrilldownBranching` 분기 무변경
- 1차 생성 재시도는 SOP 전용으로 도입된 것이므로 함께 제거한다 — 제거 후 `/flow`가
  **52b8377 이전의 `/flow` 동작과 같은지** `tests/flow-branches.test.ts`로 확인한다

`REQ-E4-007`: 제거 후 route의 export가 **`POST` 하나뿐**임을 유지한다. 비-route export가
생기면 Next 16 webpack의 route 타입 검증이 실패한다 — 이 저장소에서 실제로 겪은 결함이다.

### 4. `src/app/page.tsx`의 SOP 진입을 처리한다

랜딩에 `router.push('/sop')` 버튼이 있다 (`src/app/page.tsx:105-107`). `/sop`가 사라지면
404로 간다.

`REQ-E4-008`: **버튼을 제거한다.** 새 저장소의 URL을 여기 하드코딩하지 않는다 —
`sop-platform`의 호스팅 주소가 미정이고 (`INT-E0-001`), 사내망 주소를 외부 저장소 코드에
남기는 것은 분리 목적에 어긋난다.

주변 카드 레이아웃이 깨지지 않는지 브라우저로 확인한다.

### 5. `package.json`을 정리한다

제거할 스크립트:

```text
test:sop
test:sop-demo
verify:sop-customer
```

`REQ-E4-009`: 의존성은 **실측 후에만** 제거한다. SOP가 떠난 뒤 `/flow`에서 참조 0건이 되는
패키지가 있는지 확인한다.

```bash
for p in zod ai @ai-sdk/google @xyflow/react lucide-react zustand \
         @radix-ui/react-dialog @radix-ui/react-label @radix-ui/react-select \
         @radix-ui/react-slot @radix-ui/react-popover class-variance-authority \
         tailwind-merge clsx cmdk docx exceljs framer-motion \
         @liveblocks/client @liveblocks/zustand; do
  n=$(grep -rl "$p" src/ tests/ --include=*.ts --include=*.tsx 2>/dev/null | wc -l)
  echo "$p  $n"
done
```

참조 0건인 것만 제거하고, 제거 후 `npm ci && npm run build`로 확인한다 (`TST-EXT-003`).
0건이 아닌 것은 **남긴다** — 실측 없이 문서 목록만 보고 지우지 않는다.

### 6. `scripts/verify-quality.mjs`를 정리한다

SOP 전용 규칙 3개의 allowlist가 사라진 파일을 가리킨다.

```text
suggestion-enum-literal   allow: src/lib/sop-step-common-schema.ts     ← 파일이 사라진다
document-status-label     allow: src/lib/sop-review-status-meta.ts     ← 파일이 사라진다
step-status-label         allow: []
```

`REQ-E4-010`: 세 규칙을 **제거한다.** 검사 대상 도메인이 이 저장소를 떠났으므로 규칙만 남기면
영원히 0건을 검사하는 죽은 규칙이 된다. provider 규칙 3개(`provider-import`,
`provider-env-key`, `provider-options`)는 **유지한다** — `/flow`가 여전히 AI를 쓴다.

`inline-pad-format` 규칙은 대상 범위를 확인한 뒤 판단한다. `/flow` 코드가 걸려 있으면 유지한다.

### 7. 문서를 정리한다

| 파일 | 할 일 |
|---|---|
| `AGENTS.md` | "SOP customer-requirement work" 절 전체 제거. "General change discipline"과 "Code quality conventions"는 유지. `verify:sop-customer` 명령 언급 제거 |
| `CLAUDE.md` | 같은 방식. SOP 스킬 경로 언급 제거 |
| `.github/copilot-instructions.md` | SOP 언급 제거 |
| `docs/QUALITY_CONVENTIONS.md` | SOP SSOT 모듈을 원천으로 지목한 항목 제거. "`/flow` 경로는 제외" 문장은 이제 의미가 없으므로 범위 문장을 다시 쓴다 |
| `docs/DESIGN_CONVENTIONS.md` | SOP 화면을 예시로 든 항목 제거 |
| `README.md` | SOP 언급 제거 + `sop-platform`으로 분리됐다는 한 줄 추가 (`INT-E4-001`) |

`REQ-E4-011`: 커밋·푸시 금지 규칙을 문서에서 빼지 않는다.

### 8. `/flow` 무회귀를 증명한다

`TST-E4-001` (= `REQ-EXT-003`, `TST-EXT-007`): 제거 후 다음이 전부 통과한다.

```bash
npx tsc --noEmit
npm run lint
npm run test:flow-branches
npm run test:shapes
npm run verify:quality
npm run build
npx next build --webpack
git diff --check
```

`REQ-E4-012`: **통과하지 못하면 제거를 되돌리고 보고한다.** 실패는 그 자체로
"의존 방향이 단방향"이라는 전제를 반증하는 것이므로, 억지로 고치지 않는다.
무엇이 SOP를 참조하고 있었는지가 이 라운드의 가장 중요한 발견이 된다.

`TST-E4-002`: `test:flow-branches`·`test:shapes`의 **통과 수가 §시작 조건에서 기록한 값과
같아야 한다.**

`TST-E4-003`: 브라우저에서 `/`, `/flow`, `/strategy`, `/export`, `/room`이 뜨고
FloatingDock 네비게이션이 동작한다. `/sop`는 404다 (의도된 결과).

`TST-E4-004`: SOP 잔존 참조 0건.

```bash
grep -rn "sop\|Sop\|SOP" src/ tests/ --include=*.ts --include=*.tsx | grep -v "^src/lib/graph-validation.ts" | grep -v "^src/lib/flow-shapes.ts"
# graph-validation의 SOP 전용 함수(REQ-E4-005에 따라 남김) 외에는 출력이 없어야 한다
```

## 금지

- E3 통과 handoff 없이 시작하는 것
- `sop-platform` 수정
- `/flow`의 prompt·스키마·검증·repair 정책 변경
- `graph-validation.ts`의 SOP 전용 함수 제거 (`REQ-E4-005`)
- 실측 없이 의존성 제거
- 새 저장소 URL을 `agent-shift` 코드에 하드코딩
- `/flow` 테스트 단언 수정 — 통과시키기 위한 변경 포함
- 실패한 게이트를 남긴 채 완료 보고
- 사용자 승인 없는 commit·push

## 인계

`E0_00_MASTER.md` §12 형식에 더해:

1. **제거 파일 목록**과 E3 handoff의 이관 목록과의 대조 (누락·초과 0건)
2. **`src/app/api/ai/route.ts` diff** — `/flow` 동작이 바뀌지 않았다는 근거
3. **`/flow` 게이트 결과 대조표** — 제거 전 / 제거 후 / `E0_BASELINE_EVIDENCE.md`
4. **의존성 제거 실측 출력**과 최종 제거 목록
5. **남긴 SOP 흔적**과 그 이유 (`graph-validation.ts`의 SOP 함수,
   `docs/sop-standalone-extraction/**`)
6. 브라우저 확인 결과 — `/`, `/flow`, `/strategy`, `/export`, `/room`
7. **후속 라운드로 넘기는 것** — `graph-validation.ts`·`flow-shapes.ts`의 원본 쪽 좁히기
8. 사용자에게 보고할 **커밋 승인 요청** — 두 저장소 각각에 대해
