# E0-01 기준 고정 — 실측 증거

작업지시서: [E0_01_BASELINE.md](E0_01_BASELINE.md) · 실행일 2026-08-27 · 저장소 `agent-shift`

이 문서는 이관 전 원본의 상태를 실측으로 못 박는다. 이후 모든 세션은 여기 값과 자기 결과를
비교한다. **이 세션은 코드를 한 줄도 바꾸지 않았다.**

## 0. baseline 확인

```text
저장소       agent-shift
worktree     C:\Users\USER\Desktop\NOCODE\agent-shift
branch       wave0/sop-foundation  (origin과 동기화, ahead/behind 0)
코드 baseline  52b8377  feat(sop): complete member entry integration
```

```console
$ git diff --stat 52b8377 -- src tests
                                        ← 출력 없음
[EXIT 0]
```

**`src/**`와 `tests/**`가 `52b8377`과 완전히 동일하다.** 작업트리의 미커밋 변경은 전부
`docs/sop-standalone-extraction/work-orders/**`(분리 지시서)와 `.claude/`,
`Task Library Sample.CSV`뿐이며 코드가 아니다.

```console
$ git status --short --branch
## wave0/sop-foundation...origin/wave0/sop-foundation
 M docs/sop-standalone-extraction/work-orders/README.md
?? .claude/
?? "docs/sop-standalone-extraction/Task Library Sample.CSV"
?? docs/sop-standalone-extraction/work-orders/E0_00_MASTER.md
?? docs/sop-standalone-extraction/work-orders/E0_01_BASELINE.md
?? docs/sop-standalone-extraction/work-orders/E1_02_SKELETON.md
?? docs/sop-standalone-extraction/work-orders/E2_03A_SHARED_MODULES.md
?? docs/sop-standalone-extraction/work-orders/E2_04B_AI_PROVIDER.md
?? docs/sop-standalone-extraction/work-orders/E2_05C_GENERATION_ROUTE.md
?? docs/sop-standalone-extraction/work-orders/E2_06D_DOCS_AND_SKILL.md
?? docs/sop-standalone-extraction/work-orders/E3_07_PARITY.md
?? docs/sop-standalone-extraction/work-orders/E4_08_ORIGIN_CLEANUP.md
```

`REQ-E0-001`·`REQ-E0-002` 충족.

## 1. 이관 인벤토리 실측

| 항목 | 실측 | 문서값 (`CONTEXT.md` §2.1) | 차이 |
|---|---|---|---|
| `src/lib/sop-*.ts` | **52** | (합계에만 표기) | — |
| `src/components/sop/*.tsx` | **38** | (합계에만 표기) | — |
| `src/components/sop-demo/**` | **3** | **없음** | **격차 G1** |
| `src/server/sop/**` | **8** | (합계에만 표기) | — |
| 도메인 소계 | **101** | 98 | **+3** (G1) |
| `src/app/sop/**` | **12** | — | — |
| `src/app/api/sop/**` | **12** | — | — |
| 라우트 소계 | **24** | 24 | 일치 |
| `tests/sop*` | **21** | 20 | **+1** (W4가 `sop-clone-work-map-entry.test.tsx` 추가) |
| SOP 전용 fixture | `src/data/sop-task-library-sample.json` 1개 | 1 | 일치 |

`INT-E0-101` 확인됨. 문서 수치 갱신은 **P2-D의 일**이며 이 세션은 차이만 기록한다.

`/flow` 전용 테스트 3개 (P4의 회귀 기준):

```text
tests/flow-branches.test.ts
tests/flow-shapes.test.ts
tests/terminal-node.test.tsx
```

## 2. 결합도 방향 — 단방향 재확인

### 2.1 `/flow` → SOP 참조

```console
$ grep -rn "sop" src/app/flow src/components/flow src/lib/store.ts \
    src/app/strategy src/app/room src/app/export \
    src/components/collaboration src/components/strategy
                                        ← 출력 없음
[EXIT 1]
```

**0건.** `CONTEXT.md` §2.2의 전제가 `52b8377`에서도 성립한다.

`src/app/page.tsx:107`이 `router.push('/sop')`를 호출하지만 이것은 랜딩이지 `/flow` 코드가
아니다 — P4가 다룬다 (`REQ-E4-008`).

### 2.2 SOP → 비-SOP 모듈

```console
$ grep -rhoE "from '@/(lib|components|hooks|server)/[^']+'" \
    src/lib/sop-*.ts src/components/sop/ src/components/sop-demo/ \
    src/server/sop/ src/app/sop/ src/app/api/sop/ \
    | sed "s/from '//;s/'//" | grep -vE "sop" | sort | uniq -c | sort -rn
      5 @/lib/graph-validation
      4 @/hooks/useSopAiSettings
      3 @/server/ai/model-factory
      2 @/lib/ai-shape-guide
      2 @/components/flow/FlowShapeRenderer
      1 @/lib/gemini-models
      1 @/lib/flow-shapes
      1 @/components/settings/ApiKeySettings
```

8개 모듈, 참조 19건.

`INT-E0-103` (신규): `CONTEXT.md` §2.2 표는 `FlowShapeRenderer` 참조를 **1**로 적고 있으나
실측은 **2**다. `src/components/sop-demo/DemoWorkspace.tsx`가 두 번째 참조이며, 원래 집계가
`sop-demo`를 포함하지 않았기 때문이다 — **격차 G1의 직접적 결과**다. 나머지 7개 모듈의
참조 수는 문서와 일치한다.

## 3. 전이 의존 실측 — 직접 import만 보면 안 된다

```console
$ for f in <공유 모듈 8개>; do grep -ohE "from '@/[^']+'" "$f" | sort -u; done
--- src/lib/graph-validation.ts            (없음)
--- src/lib/flow-shapes.ts                 (없음)
--- src/components/flow/FlowShapeRenderer.tsx
@/lib/flow-shapes
--- src/server/ai/model-factory.ts
@/lib/gemini-models
--- src/lib/gemini-models.ts               (없음)
--- src/lib/ai-shape-guide.ts              (없음)
--- src/hooks/useSopAiSettings.ts
@/lib/gemini-models
--- src/components/settings/ApiKeySettings.tsx
@/components/ui/button
@/components/ui/card
@/components/ui/dialog
@/components/ui/input
@/components/ui/label
@/components/ui/select
@/lib/gemini-models
```

```console
$ grep -rn "api/models" src/ --include=*.ts --include=*.tsx
src/components/settings/ApiKeySettings.tsx:165:  const response = await fetch('/api/models', {
```

```console
$ grep -ohE "from ['\"][^'\"]+['\"]" src/components/ui/{button,card,dialog,input,label,select}.tsx | sort -u
@/lib/utils
@radix-ui/react-dialog
@radix-ui/react-label
@radix-ui/react-select
@radix-ui/react-slot
class-variance-authority
lucide-react
react
```

### 3.1 확정된 전이 폐포

```text
SopSetupGate
  └ ApiKeySettings
      ├ @/components/ui/{button,card,dialog,input,label,select}
      │   ├ @/lib/utils           → clsx, tailwind-merge
      │   ├ @radix-ui/react-{slot,label,select,dialog}
      │   ├ class-variance-authority
      │   └ lucide-react
      ├ @/lib/gemini-models
      └ fetch('/api/models')
          └ src/app/api/models/route.ts
              ├ @/server/ai/model-factory  (resolveGenerationApiKey)
              └ @/lib/gemini-models
```

**격차 G2 확인**: `src/app/api/models/route.ts`는 SOP 화면이 실제로 도달하는 **9번째 결합
지점**이며 `CONTEXT.md` §2.2 목록에 없다.

**격차 G3 확인**: `CONTEXT.md` §2.3의 "`@/components/ui/*` 0건"은 **직접 import 기준으로만**
참이다. 전이 기준으로는 6개를 사용한다.

`INT-E0-102` 확인됨.

### 3.2 제거 가능 패키지 확정 목록

이관 대상 집합(SOP 전용 + 공유 모듈 9 + `ui` 6 + `utils`)에서의 참조 파일 수:

| 패키지 | 이관집합 참조 | 판정 |
|---|---|---|
| `next` | 55 | 유지 |
| `react` | 63 | 유지 |
| `react-dom` | 0 (직접 import 없음) | **유지** — Next/React 런타임과 `react-test-renderer`가 요구 |
| `zod` | 21 | 유지 |
| `zustand` | 7 | 유지 |
| `@xyflow/react` | 6 | 유지 |
| `lucide-react` | 39 | 유지 |
| `ai` | 3 (`from 'ai'` 정확 매칭) | 유지 |
| `@ai-sdk/google` | 1 (`model-factory.ts`) | 유지 |
| `clsx` | 1 (`lib/utils.ts`) | **유지 (G3)** |
| `tailwind-merge` | 1 (`lib/utils.ts`) | **유지 (G3)** |
| `class-variance-authority` | 1 (`ui/button.tsx`) | **유지 (G3)** |
| `@radix-ui/react-slot` | 1 (`ui/button.tsx`) | **유지 (G3)** |
| `@radix-ui/react-label` | 1 (`ui/label.tsx`) | **유지 (G3)** |
| `@radix-ui/react-select` | 1 (`ui/select.tsx`) | **유지 (G3)** |
| `@radix-ui/react-dialog` | 1 (`ui/dialog.tsx`) | **유지 (G3)** |
| `@radix-ui/react-popover` | 0 | **제거** (`ui/popover.tsx` 전용, 이관 안 함) |
| `@liveblocks/client` | 0 | **제거** (`lib/liveblocks-client.ts` 전용) |
| `@liveblocks/zustand` | 0 | **제거** |
| `framer-motion` | 0 | **제거** (`/flow`·`strategy`·`FloatingDock` 전용) |
| `cmdk` | 0 | **제거** (`ui/command.tsx` 전용) |
| `docx` | 0 | **제거** (`lib/export-service.ts` 전용) |
| `exceljs` | 0 | **제거** (`lib/export-service.ts` 전용) |

**제거 확정 7개**: `@radix-ui/react-popover`, `@liveblocks/client`, `@liveblocks/zustand`,
`framer-motion`, `cmdk`, `docx`, `exceljs`.

`EXTRACTION_SPEC.md` `REQ-EXT-006`의 제거 목록과 다르다 — 문서는 `@radix-ui/*` 전부와
`class-variance-authority`·`tailwind-merge`를 제거 대상으로 적고 있으나, 전이 기준으로는
SOP가 사용한다. **P1은 위 7개만 제거한다** (`REQ-E1-010`).

## 4. 루트 layout과 전역 자산

```console
$ grep -nE "next/font|FloatingDock|className=" src/app/layout.tsx
2:import { Geist, Geist_Mono } from 'next/font/google';
4:import FloatingDock from '@/components/FloatingDock';
51: className={`${geistSans.variable} ${geistMono.variable} antialiased pro-canvas text-[#18181B]`}
54: <FloatingDock />

$ grep -n "pathname" src/components/FloatingDock.tsx
83:    const pathname = usePathname();
99:    if (pathname === '/' || pathname.startsWith('/sop')) return null;
128:                        isActive={pathname === item.href}
```

**격차 G4 확인**:

- `next/font/google`(Geist, Geist_Mono) 사용 — 빌드 시점에 네트워크로 폰트를 받아
  self-host한다. `REQ-RUN-008`(네트워크 없는 재현 가능 빌드) 미충족.
  **런타임에는 외부 통신이 없으므로 `TST-RUN-002`에는 영향 없다** (`INT-E0-003`).
- `FloatingDock`은 `pathname.startsWith('/sop')`에서 **조기 반환**한다 →
  SOP 화면에 렌더된 적이 없다. **제거해도 시각적 변화 0** (`INT-E0-002` 확인됨).
- `<body>`의 `antialiased pro-canvas text-[#18181B]`와 폰트 변수는 SOP 화면이 상속한다.
  P1이 새 layout에서 **반드시 보존**해야 한다.

```console
$ grep -rnE "https?://" src/app/globals.css src/components/sop/ src/components/sop-demo/ src/app/sop/
                                        ← 출력 없음
[EXIT 1]
```

SOP 화면·전역 CSS의 원격 URL 참조 **0건**. `REQ-RUN-011`·`REQ-RUN-012` 성립.

`public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`, `images/bg-main.png`.
`bg-main.png`는 랜딩(`src/app/page.tsx:75`) 전용이므로 이관 대상이 아니다 (`REQ-E1-008`).

## 5. 게이트 baseline — `TST-EXT-004`의 대조 기준

| # | 명령 | 결과 | 수치 |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** | EXIT 0, 오류 0 |
| 2 | `npm run lint` | **PASS** | EXIT 0, 0 errors / **1 warning** (§5.1) |
| 3 | `npm run test:sop` | **PASS** | EXIT 0, **20개 파일**, **✓ 874건** |
| 4 | `npm run test:sop-demo` | **PASS** | EXIT 0 (`ALL SOP DEMO FIXTURE TESTS PASSED`) |
| 5 | `npm run test:flow-branches` | **PASS** | EXIT 0, **37/37** |
| 6 | `npm run test:shapes` | **PASS** | EXIT 0, `flow-shapes` + `terminal-node` **6/6** |
| 7 | `npm run build` (Turbopack) | **PASS** | EXIT 0 |
| 8 | `npx next build --webpack` | **PASS** | EXIT 0 |
| 9 | `npm run verify:quality` | **PASS** | EXIT 0, **7개 규칙 · 185개 파일** |
| 10 | `npm run verify:sop-customer` | **PASS** | EXIT 0 (WARN 1건, §5.2) |
| 11 | `npm run verify:sop-customer -- --final` | **PASS** | EXIT 0 (WARN 1건) |
| 12 | `npm run verify:sop-customer -- --scenario-final` | **PASS** | EXIT 0 (WARN 1건) |
| 13 | `git diff --check` | **PASS** | EXIT 0 |

**`52b8377`에서 실패하는 명령은 없다.** 분리 후 어떤 실패가 나오면 그것은 전부 이관 결함이다.

### 5.1 lint의 사전 경고 1건

```text
C:\Users\USER\...\.remember\tmp\last-ndc.ts
  1:1  warning  Expected an assignment or function call and instead saw an expression
✖ 1 problem (0 errors, 1 warning)
```

`src/**` 밖(`.remember/tmp/`)의 세션 도구 임시 파일이다. **이관 대상이 아니며
`sop-platform`에는 나타나지 않는다.** P3는 이 경고가 사라진 것을 결함으로 보지 않는다.

### 5.2 `verify:sop-customer`의 WARN 1건 (세 모드 공통)

```text
Changed files inspected: 203
[WARN] 공유 고위험 파일 변경을 수동 검토하십시오: src/app/api/ai/route.ts, tests/flow-branches.test.ts
[PASS] SOP customer scope guard passed.
```

W4-05가 승인받아 수행한 변경(비-route export를 `src/server/flow/flow-prompts.ts`로
무동작변경 이동)이 지시서 기준 커밋 이후의 변경 집합에 남아 있어 나오는 WARN이다.
**FAIL이 아니며 `52b8377`의 정상 상태다.** P3는 이 WARN을 이관 결함으로 보고하지 않는다.

### 5.3 `test:sop` 파일별 결과 (20개)

| 파일 | 종료 배너 |
|---|---|
| `sop-member-intake-domain.test.ts` | ✅ SOP member intake 도메인 테스트 통과 |
| `sop-work-map-domain.test.ts` | ✅ SOP Work Map 초안 도메인 테스트 통과 |
| `sop-node-authoring-domain.test.ts` | ✅ SOP node 작성 계약 도메인 테스트 통과 |
| `sop-member-login-context.test.tsx` | ALL SOP MEMBER LOGIN/CONTEXT TESTS PASSED (23) |
| `sop.test.ts` | 🎉 ALL COMPREHENSIVE REPRODUCTION & REGRESSION TESTS PASSED |
| `sop-readonly-inspectors.test.tsx` | ALL READONLY INSPECTOR TESTS PASSED (34/34) |
| `sop-setup-actions.test.ts` | ALL SOP SETUP ACTION TESTS PASSED (17) |
| `sop-task-library.test.ts` | (§6 fixture 단언 포함) |
| `sop-member-home.test.ts` | ALL SOP MEMBER HOME TESTS PASSED (182) |
| `sop-clone-work-map-entry.test.tsx` | ✅ ALL W4-04C CLONE WORK MAP ENTRY TESTS PASSED (42) |
| `sop-task-recommendation-flow.test.tsx` | SOP Task 추천·로딩 흐름 회귀 테스트 통과 |
| `sop-work-map-simple.test.tsx` | ALL SIMPLE WORK MAP TESTS PASSED (43/43) |
| `sop-work-map-detailed.test.tsx` | ALL WAVE 1D DETAILED WORK MAP TESTS PASSED (48/48) |
| `sop-node-authoring-generation.test.ts` | ALL SOP NODE AUTHORING GENERATION TESTS PASSED (54) |
| `sop-subaction-agentization.test.ts` | ALL SOP ACTIVITY–SUB ACTION / AGENTIZATION / TEMPLATE TESTS PASSED (228) |
| `sop-approval-flow.test.ts` | ALL SOP APPROVAL-LIFECYCLE TESTS PASSED (107) |
| `sop-standard-draft-node-contract.test.ts` | ALL SOP STANDARD-DRAFT NODE CONTRACT TESTS PASSED (44) |
| `sop-hr-analytics.test.ts` | ALL SOP HR ANALYTICS TESTS PASSED (42) |
| `sop-customer-scenario.test.ts` | ALL SOP CUSTOMER SCENARIO E2E TESTS PASSED (25) / 08 §MEMBER INTAKE (58) / W4-05 INTEGRATION (81) |
| `sop-activity-proposal.test.ts` | ALL SOP ACTIVITY PROPOSAL PANEL TESTS PASSED (14) |

**P3 대조 기준**: 파일 20개 + P2-B·P2-C 신규 2개 = **22개**, `✓` 874건 이상.

## 6. 고객 fixture 불변식 — `TST-EXT-005`의 대조 기준

`src/data/sop-task-library-sample.json` 직접 계수:

```console
$ node -e "const fx=require('./src/data/sop-task-library-sample.json'); …"
Job=2 | Task=10 | Activity=138 | Activity-Skill=690
Task별 Activity 수: [14,12,14,15,14,15,12,14,15,13]
```

| 불변식 | 문서값 | 실측 | 일치 |
|---|---|---|---|
| Job | 2 | **2** | ✅ |
| Task | 10 | **10** | ✅ |
| Activity | 138 | **138** | ✅ |
| Activity-Skill 관계 | 690 | **690** | ✅ |
| 대표 Task의 Activity | 14 | **14** (첫 Task "시장 및 기술 동향 분석") | ✅ |

`tests/sop-task-library.test.ts`가 같은 값을 단언한다 (L21·L22·L29·L33·L39).

## 7. 접근성 기준선

```console
$ ls -la docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md
-rw-r--r-- 1 USER 197121 5502 Aug 26 18:05 …
```

존재 확인. A11Y-1~5 실측값 5건 전부 PASS로 기록돼 있다.

**P2-D는 이 파일을 `sop-platform`으로 옮겨야 하며 실측값을 한 글자도 바꾸지 않는다**
(`REQ-E2D-012`). **P3는 이 파일을 대조 기준으로 쓴다** (`TST-E3-007`).

## 8. 격차 재확인

| ID | 재확인 결과 |
|---|---|
| **G1** | **확인됨.** `src/components/sop-demo/**` 3개(`DemoSetup.tsx`, `DemoWorkspace.tsx`, `WorkLibraryEditor.tsx`)가 인벤토리에 없다. `src/app/sop/demo/**` 2개가 import하며 `tests/sop-demo.test.ts`가 이미 이관 목록에 있다. **부수 효과: `FlowShapeRenderer` 참조 수가 문서의 1이 아니라 2다** (`INT-E0-103`) |
| **G2** | **확인됨.** `src/app/api/models/route.ts`가 9번째 결합 지점. `ApiKeySettings.tsx:165`가 `fetch('/api/models')` 호출 |
| **G3** | **확인됨.** `ApiKeySettings` → `ui` 6개 → radix 4종 + cva + clsx + tailwind-merge. `REQ-EXT-006`의 제거 목록이 전이 의존을 놓쳤다. 제거 확정 목록은 §3.2의 **7개** |
| **G4** | **확인됨.** `next/font/google` + `FloatingDock`. `FloatingDock`은 `/sop`에서 조기 반환하므로 제거 시 시각 변화 0 |
| **G5 (신규)** | 없음. 위 4건 외 새 격차는 발견되지 않았다 |

## 9. P1이 이관해야 할 최종 파일 목록

```text
[SOP 전용 — 경로 그대로]
src/lib/sop-*.ts                            52
src/components/sop/**                       38
src/components/sop-demo/**                   3   ← G1
src/server/sop/**                            8
src/app/sop/**                              12
src/app/api/sop/**                          12
src/data/sop-task-library-sample.json        1
tests/sop*.test.ts, tests/sop*.test.tsx     21
src/app/favicon.ico

[공유 모듈 — 분기 복사]
src/lib/graph-validation.ts                 → 같은 경로 (좁히기는 P2-A)
src/lib/flow-shapes.ts                      → 같은 경로 (좁히지 않음)
src/components/flow/FlowShapeRenderer.tsx   → src/components/sop/SopStepShapeRenderer.tsx
src/server/ai/model-factory.ts              → 같은 경로 (재작성은 P2-B)
src/lib/gemini-models.ts                    → 같은 경로
src/lib/ai-shape-guide.ts                   → 같은 경로
src/hooks/useSopAiSettings.ts               → 같은 경로
src/components/settings/ApiKeySettings.tsx  → 같은 경로
src/app/api/models/route.ts                 → 같은 경로   ← G2
src/components/ui/{button,card,dialog,input,label,select}.tsx  ← G3 (나머지 5개는 제외)
src/lib/utils.ts                            → cn만 (throttle은 /flow 전용, 제거 전 증명)

[전역 스타일·설정]
src/app/globals.css, next.config.ts, tsconfig.json, postcss.config.mjs,
eslint.config.mjs, .prettierrc, next-env.d.ts, components.json

[문서·스킬 — 정리는 P2-D]
.agents/skills/implement-sop-customer-requirements/**
docs/QUALITY_CONVENTIONS.md, docs/DESIGN_CONVENTIONS.md
docs/sop-member-context-redesign/**
scripts/verify-quality.mjs
SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md

[새로 작성 — 이관 아님]
src/app/layout.tsx    ← FloatingDock 제거, 폰트·body 클래스 보존 (G4)
package.json          ← name: sop-platform, 의존성 §3.2

[이관하지 않음]
src/app/api/ai/route.ts   ← /flow action 포함. SOP 라우트는 P2-C가 신규 작성
public/**                 ← bg-main.png는 랜딩 전용
src/components/ui/{badge,command,popover,spinner,textarea}.tsx
```

## 10. 인계

### P1에게

1. §9의 파일 목록 그대로 이관한다. G1·G2를 빠뜨리면 `/sop/demo`와 모델 목록이 죽는다.
2. `package.json` 의존성은 §3.2의 판정을 따른다 — **제거는 7개뿐**이다.
   `REQ-EXT-006`의 문서 목록을 그대로 쓰지 마라.
3. 루트 layout에서 `FloatingDock`만 빼고 폰트·`pro-canvas`·`text-[#18181B]`·`viewport`는
   보존한다. `next/font/google`은 유지하고 `REQ-RUN-008` 미충족을 기록한다.
4. `src/lib/utils.ts`의 `throttle`은 `/flow`의 `CollaborativeFlowCanvas.tsx`만 쓴다 —
   제거 전 새 저장소에서 `grep -rn "throttle" src/ tests/`가 0건임을 증명한다.

### P3에게

- §5의 게이트 baseline 표가 `TST-EXT-004`의 대조 기준이다.
- **`52b8377`에서 실패하는 명령은 없다.** 분리 후의 실패는 전부 이관 결함이다.
- §5.1의 lint 경고와 §5.2의 `verify:sop-customer` WARN은 **원본의 정상 상태**이며
  새 저장소에서 사라지는 것이 정상이다. 결함으로 보고하지 마라.
- §6의 fixture 수치, §7의 A11Y 파일이 대조 기준이다.

### P4에게

- `/flow` 회귀 대조 기준: `test:flow-branches` **37/37**, `test:shapes` **6/6**,
  Turbopack·webpack 빌드 **양쪽 EXIT 0**.
- `/flow` → SOP 참조 0건이 `52b8377`에서 확인됐다 (§2.1). 제거 후 테스트가 실패하면
  그 전제가 반증된 것이므로 되돌리고 보고한다.

### 이 세션이 손대지 않은 것

- `src/**`, `tests/**`, `package.json`, 설정 파일 — `git diff --stat 52b8377 -- src tests` 공백
- `CONTEXT.md`·`EXTRACTION_SPEC.md`의 수치 (P2-D 소유)
- 보류 항목 전부 (`CONTEXT.md` §7, `AI_PROVIDER_CONTRACT.md` §7,
  `RUNTIME_AND_DEPLOYMENT.md`의 빈칸)
- 새 저장소 폴더의 코드 (P1 소유)
