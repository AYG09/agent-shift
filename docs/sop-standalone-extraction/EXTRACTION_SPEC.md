# 분리 명세 (EXTRACTION SPEC)

## 1. 명세 규칙

- `REQ-EXT-*`: 분리가 반드시 충족해야 할 조건
- `INT-EXT-*`: 이 저장소 상태에서의 구현 해석
- `TST-EXT-*`: 실행 가능한 수용 기준

"옮겼다"의 증거는 파일 존재가 아니라 **새 저장소에서 같은 테스트가 통과하는 것**이다.

## 2. 이관 인벤토리

### 2.1 그대로 옮기는 것 (SOP 전용)

```text
src/lib/sop-*.ts                      # 60개 내외 — 도메인·Store·스키마·분석·export
src/components/sop/**                 # SOP 화면 전체
src/server/sop/**                     # prompt·runner·repository·actor context
src/app/sop/**                        # 구성원·승인·HR·workspace·demo 라우트
src/app/api/sop/**                    # SOP 전용 API
src/data/sop-task-library-sample.json # 고객 T-A-S fixture
tests/sop*.test.ts, tests/sop*.test.tsx   # 20개
.agents/skills/implement-sop-customer-requirements/**  # 도메인 계약 + 검증 스크립트
docs/sop-member-context-redesign/**   # 구성원 진입 재설계 계약
docs/sop-standalone-extraction/**     # 이 문서 세트
```

`REQ-EXT-001`: SOP 도메인 계약 문서(skill의 reference 5개)는 코드와 함께 이관한다. 계약이
저장소를 건너지 못하면 이후 세션이 근거 없이 판단하게 된다.

### 2.2 남기는 것 (`/flow` 전용)

```text
src/app/flow/**, src/components/flow/**   (FlowShapeRenderer 제외 — §3 참고)
src/app/strategy/**, src/app/room/**, src/app/export/**
src/components/collaboration/**, src/components/strategy/**
src/lib/store.ts, liveblocks-*.ts, collaboration-store.ts
src/lib/export-service.ts, drilldown-apply.ts, platforms.ts, duration.ts
src/components/ui/**                       # SOP는 0건 사용
tests/flow-*.test.ts, tests/terminal-node.test.tsx
```

### 2.3 원본에서 제거하는 것

`REQ-EXT-002`: 이관 검증이 끝난 뒤 `agent-shift`에서 §2.1의 SOP 전용 파일을 제거한다.
제거 시점은 보류 항목이며(§CONTEXT 7), **검증 전 제거는 금지**한다.

`REQ-EXT-003`: 제거 후 `agent-shift`의 `/flow` 테스트(`test:shapes`, `test:flow-branches`)와
빌드가 통과해야 한다. 통과하지 못하면 그 자체가 "의존 방향이 단방향"이라는 전제를 반증하는
것이므로 제거를 되돌리고 보고한다.

## 3. 공유 모듈 8개 — 각각의 처리 방침

`INT-EXT-001`: 공유 모듈은 **분기 복사(fork-copy)** 한다. 두 저장소는 이후 코드를 공유하지
않는다. 사내망 저장소가 외부 저장소를 의존하면 분리 목적이 무너지기 때문이다.

| 모듈 | 처리 | 근거와 주의 |
|---|---|---|
| `graph-validation.ts` (972줄) | **복사 후 좁히기** | `/flow` 전용 규칙과 SOP 전용 규칙(`validateSopDecisionBranches`, SOP rework cycle)이 한 파일에 있다. SOP 사본에서 `/flow` 전용 분기를 제거하고, 제거 대상이 SOP 테스트에서 참조되지 않음을 먼저 증명한다 |
| `flow-shapes.ts` (581줄) | **복사 후 좁히기** | SOP는 `FlowShape` 타입과 SOP가 실제 쓰는 도형만 필요하다. `/flow` 전용 도형·팔레트 메타는 제거 대상 후보이나, `FLOW_SHAPE_IDS`가 스키마 enum의 원천이므로 **값 집합을 줄이면 기존 문서가 깨진다**. 줄이지 말고 파일만 복사한다 |
| `FlowShapeRenderer.tsx` (549줄) | **복사 후 이름 변경** | `SopStepNode`가 `shape/width/height`만 넘기는 순수 SVG 렌더러다. SOP 저장소에서는 `components/sop/` 아래로 옮기고 이름에서 `Flow`를 뗀다 |
| `model-factory.ts` (65줄) | **복사 후 재작성** | AI provider 교체 지점. 재작성 계약은 `AI_PROVIDER_CONTRACT.md`가 담당한다 |
| `gemini-models.ts` (214줄) | **복사 후 재작성** | 모델 ID 정책이 Gemini에 고정돼 있다. 사내 모델 정책으로 바꿔야 하나 대상이 미정이므로, 우선 복사하고 provider 계약이 요구하는 형태로 좁힌다 |
| `ai-shape-guide.ts` (106줄) | **그대로 복사** | prompt 텍스트. SOP 생성이 직접 사용한다 |
| `useSopAiSettings.ts` (87줄) | **그대로 이관** | 이름부터 SOP 전용이다. `hooks/`에서 SOP 저장소로 옮긴다 |
| `ApiKeySettings.tsx` (423줄) | **이관 후 기본 비활성** | BYOK UI. 사내망 기본은 서버측 키이므로 기본 경로에서 내리되 삭제하지 않는다 (`AI_PROVIDER_CONTRACT.md` §키 관리) |

`TST-EXT-001`: 좁히기를 수행한 모듈은 **좁히기 전후로 SOP 테스트 결과가 동일**해야 한다.
줄었는데 테스트가 그대로 통과한다는 사실이 "그 코드는 SOP가 쓰지 않았다"의 증거다.

`REQ-EXT-004`: 좁히기는 **값 집합(enum)을 줄이는 방향으로 하지 않는다.**
`FLOW_SHAPE_IDS`, `SOP_AGENTIZATION_SUGGESTION_TYPES` 같은 SSOT 배열을 줄이면 스키마·문서·
저장된 문서가 함께 깨진다. 좁히기는 **사용되지 않는 함수·컴포넌트 제거**에 한정한다.

## 4. `src/app/api/ai/route.ts` 분해

`REQ-EXT-005`: SOP 생성 경로를 SOP 전용 라우트로 옮긴다. 새 저장소에는 `/flow` action이
존재하지 않으므로 공유 라우트를 유지할 이유가 없다.

권장 결과:

```text
sop-platform/src/app/api/sop/generate/route.ts
  - 기존 route의 graphKind === 'sop' 분기만 담는다
  - parseSopGenerationRequest → getSopPrompt → generateObject
    → runSopGenerationPostProcessing → 응답
  - /flow의 as-is/to-be/drilldown/node-split action은 옮기지 않는다
```

`INT-EXT-002`: 이 분해는 **동작 변경이 아니다.** prompt 문자열, 스키마, repair 정책, 토큰
예산, 오류 응답 형태를 바꾸지 않는다. 옮기는 것은 라우팅뿐이다.

`INT-EXT-003`: 진행 중인 W4-05가 같은 파일에서 `getAsIsPrompt` 등 비-route export를
`src/server/flow/flow-prompts.ts`로 옮기는 정리를 수행한다. **분리 작업은 W4-05 완료 후의
커밋을 기준으로 시작한다.** 두 작업이 같은 파일을 동시에 만지면 안 된다.

`TST-EXT-002`: 분해 후 SOP 생성 요청이 기존과 **같은 문서**를 만든다. 같은 wire 입력에 대해
`createSopDocumentFromGeneration` 결과의 steps·edges·provenance가 동일해야 한다.

## 5. 새 저장소 구조

`INT-EXT-004`: 기존 경로 구조를 최대한 보존한다. 경로를 재설계하면 이관과 검증이 동시에
어려워진다.

```text
sop-platform/
├─ src/app/            # (sop) 라우트를 루트로 승격할지는 §6 참고
├─ src/components/sop/
├─ src/lib/
├─ src/server/
├─ src/data/
├─ tests/
├─ docs/
├─ .agents/skills/implement-sop-customer-requirements/
├─ scripts/verify-quality.mjs        # 복사 후 SOP 규칙만 남기도록 좁힘
└─ package.json
```

`REQ-EXT-006`: `package.json`의 의존성은 SOP가 실제로 쓰는 것만 남긴다. 실측 기준 필요한 것은
`next`, `react`, `react-dom`, `zustand`, `zod`, `ai`, `@xyflow/react`, `lucide-react`, 그리고
provider 패키지 하나다.

**제거 대상**: `@liveblocks/client`, `@liveblocks/zustand`, `framer-motion`, `cmdk`, `docx`,
`exceljs`, `@radix-ui/*`, `class-variance-authority`, `tailwind-merge`
— SOP 사용 0건으로 확인됐다. 사내망은 외부 패키지 반입이 통제될 수 있으므로 이 축소가
그 자체로 이관 비용을 줄인다.

`TST-EXT-003`: 의존성 제거 후 `npm ci && npm run build`가 통과한다. 하나라도 실제로 쓰이고
있었다면 여기서 드러난다.

## 6. 라우트 경로 결정

`INT-EXT-005`: 독립 앱에서 `/sop` 접두사를 유지할지 루트로 올릴지는 **이관 1차에서 바꾸지
않는다.** 경로를 그대로 두면 모든 route guard·테스트·문서의 URL이 유효한 채로 이관이 끝난다.

루트 승격(`/sop/login` → `/login`)은 이관 검증이 끝난 뒤 별도 작업으로 다룬다. 그때
`SOP_INTAKE_ROUTES`(`sop-member-intake.ts`)가 이미 단일 원천이므로 변경 지점이 좁다.

`agent-shift`의 랜딩(`src/app/page.tsx`)은 이관 대상이 아니다. 새 저장소는 자체 진입점을
갖는다 — 현재 `/sop` Home이 이미 그 역할을 한다.

## 7. 동등성 수용 기준

분리가 끝났다고 말하려면 새 저장소에서 아래가 전부 통과해야 한다.

```bash
npx tsc --noEmit
npm run lint
npm run test:sop            # 20개 파일 전부
npm run test:sop-demo
npm run build
npm run verify:quality      # 좁힌 규칙 기준
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
```

`TST-EXT-004`: 위 명령의 **PASS/FAIL 조합이 분리 전 `agent-shift`와 동일**해야 한다. 테스트
수가 줄었다면 이관 누락이다.

`TST-EXT-005`: 고객 fixture 불변식이 그대로 성립한다 — Job 2개, Task 10개, Activity 138개,
Activity-Skill 관계 690개, 대표 Task의 Activity 14개.

`TST-EXT-006`: 구성원 전체 시나리오가 통과한다 — 로그인 → 업무맥락 → 추천(또는 수동 선택) →
Work Map 두 밀도 → Task-wide 생성 → Workspace → 승인 요청 → 직책자 → SME → HR 집계.

`TST-EXT-007`: `agent-shift`에서 SOP 제거 후 `/flow` 테스트와 빌드가 통과한다.

`REQ-EXT-007`: 브라우저 확인은 두 저장소 모두에서 수행한다. 새 저장소는 구성원 흐름이 실제로
뜨는지, 기존 저장소는 SOP 제거로 `/flow`가 깨지지 않았는지 본다. 접근성 기준선은
`docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md`의 실측값을 그대로
대조 기준으로 쓴다.

## 8. 하지 말 것

- 이관과 동시에 기능·UX를 바꾸는 것. 동등성 증명이 불가능해진다
- 공유 모듈을 npm 패키지로 만들어 두 저장소가 의존하게 만드는 것
- 값 집합(enum) 축소
- 검증 전에 원본에서 SOP 제거
- W4 라운드와 같은 파일을 동시에 수정
- 이관 중 prompt 문자열·스키마·repair 정책 변경
