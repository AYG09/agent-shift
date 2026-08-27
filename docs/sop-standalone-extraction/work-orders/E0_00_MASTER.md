# 작업지시서 E0-00 — SOP 독립 앱 분리 병렬 실행 관리자

## 1. 이 라운드의 임무

`agent-shift` 안의 SOP 프로토타입을 **`sop-platform`이라는 독립 저장소의 독립 배포 단위**로
옮기고, 옮긴 결과가 원본과 **동등함을 증명**한다. 그리고 증명이 끝난 뒤에만 원본에서 SOP를
제거한다.

이 라운드는 **기능을 바꾸지 않는다.** 바뀌는 것은 코드가 어디에 사는가, 어떻게 빌드·배포되는가,
AI와 저장소에 어떻게 연결되는가뿐이다.

## 2. 시작 전 필독

순서대로 전부 읽는다. 요약본을 읽고 시작하지 않는다.

1. `AGENTS.md`, `CLAUDE.md`
2. `.agents/skills/implement-sop-customer-requirements/SKILL.md`와 그 필수 reference 5개
3. `../README.md` — 확정된 방향과 완료 경계
4. `../CONTEXT.md` — 실측 결합도, 보류 항목
5. `../EXTRACTION_SPEC.md` — 이관 인벤토리와 수용 기준
6. `../RUNTIME_AND_DEPLOYMENT.md` — 사내망 런타임 계약
7. `../AI_PROVIDER_CONTRACT.md` — provider 교체 경계
8. `../PARALLEL_EXECUTION.md` — 소유권·파동·게이트
9. 자기 세션의 지시서

## 3. 확정 사실

| 항목 | 값 | 확정일 |
|---|---|---|
| 분리 형태 | 별도 저장소로 완전 분리 | 2026-08-26 |
| 새 저장소 이름 | **`sop-platform`** | 2026-08-27 |
| 새 저장소 로컬 경로 | **`C:\Users\USER\Desktop\NOCODE\sop-platform`** | 2026-08-27 |
| 새 저장소 기본 branch | `main` | 2026-08-27 |
| git 이력 | **빈 이력에서 시작** — 원본 이력을 가져오지 않는다 | 2026-08-27 |
| AI 연결 대상 | 미정 — 교체 경계만 고정 | — |
| 원격(remote) | **미정** — 사내 호스팅 확정 전까지 로컬 전용 | 보류 |

`INT-E0-001`: 원격이 미정이므로 어떤 세션도 `git remote add`·`git push`를 하지 않는다.
사용자가 사내 호스팅을 확정한 뒤 별도로 지시한다.

## 4. baseline 고정

```text
저장소       agent-shift
worktree     C:\Users\USER\Desktop\NOCODE\agent-shift
branch       wave0/sop-foundation
코드 baseline  52b8377  feat(sop): complete member entry integration
```

`REQ-E0-001`: **코드 baseline은 `52b8377`이다.** 이 위에 문서 commit이 더 얹혀 있어도 정상이다.
판정 기준은 해시가 아니라 내용이다 — `src/**`와 `tests/**`가 `52b8377`과 다르면 중단하고
보고한다.

```bash
git -C C:/Users/USER/Desktop/NOCODE/agent-shift diff --stat 52b8377 -- src tests
# 출력이 비어 있어야 한다. 비어 있지 않으면 baseline이 움직인 것이다.
```

`REQ-E0-002`: `52b8377`은 W4 라운드(구성원 진입 IA 2차 재설계)의 통합 완료 커밋이다.
`../PARALLEL_EXECUTION.md` `REQ-PAR-002`(W4 완료 선행)와
`../EXTRACTION_SPEC.md` `INT-EXT-003`(`api/ai/route.ts` 정리 선행)이 이 커밋에서 충족됐다.
실측 확인:

- `src/app/api/ai/route.ts`의 export는 `POST` 하나뿐이다 (비-route export 5개는
  `src/server/flow/flow-prompts.ts`로 이동 완료)
- W4-01/02A/03B/04C/05/05A 산출물이 모두 이 커밋에 포함돼 있고 `origin`과 동기화돼 있다

## 5. 파동과 세션

```text
E0-01 BASELINE (agent-shift, 단독)
   기준 고정 · 인벤토리 실측 재확인 · 격차 확정
        │
        ▼
E1-02 SKELETON (sop-platform, 단독)
   저장소 생성 · 파일 이관 · 의존성 확정 · 빌드·테스트 성립 · 인터페이스 고정
        │
        ├──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
E2-03A          E2-04B          E2-05C          E2-06D
공유 모듈       provider        AI 라우트       문서·스킬
좁히기          어댑터          분해            이관 정리
        │              │              │              │
        └──────┬───────┴──────────────┘              │
               ▼                                      │
E3-07 PARITY (sop-platform, 단독)                      │
   전체 게이트 · 브라우저 · 접근성 기준선 대조           │
               │                                      │
               ▼                                      ▼
E4-08 ORIGIN CLEANUP (agent-shift, E3 통과 후) ◀───────┘
   원본에서 SOP 제거 · /flow 무회귀 증명
```

| 지시서 | 세션 | 저장소 | 병렬 | 선행 |
|---|---|---|---|---|
| `E0_01_BASELINE.md` | P0 | agent-shift | 단독 | — |
| `E1_02_SKELETON.md` | P1 | sop-platform | 단독 | E0-01 handoff |
| `E2_03A_SHARED_MODULES.md` | P2-A | sop-platform | 병렬 | E1-02 handoff |
| `E2_04B_AI_PROVIDER.md` | P2-B | sop-platform | 병렬 | E1-02 handoff |
| `E2_05C_GENERATION_ROUTE.md` | P2-C | sop-platform | 병렬 | E1-02 handoff |
| `E2_06D_DOCS_AND_SKILL.md` | P2-D | sop-platform | 병렬 | E1-02 handoff |
| `E3_07_PARITY.md` | P3 | sop-platform | 단독 | P2-A~D 전원 handoff |
| `E4_08_ORIGIN_CLEANUP.md` | P4 | **agent-shift** | 별도 저장소 | **E3 통과 handoff** |

`REQ-E0-003`: **한 세션은 한 저장소만 만진다** (`REQ-PAR-005`). P0와 P4만 `agent-shift`를
맡고, 나머지는 `sop-platform`만 만진다. 두 저장소를 오가는 세션을 만들지 않는다.

`REQ-E0-004`: P4는 **E3 통과 handoff를 받은 뒤에만** 시작한다 (`REQ-PAR-007`, `REQ-EXT-002`).
검증되지 않은 이관 상태에서 원본을 지우면 되돌릴 근거가 사라진다.

## 6. 파일 소유권 레지스트리

한 파일의 active owner는 동시에 한 세션뿐이다.

| 세션 | 저장소 | 배타적 소유 |
|---|---|---|
| P0 | agent-shift | `docs/sop-standalone-extraction/work-orders/E0_BASELINE_EVIDENCE.md` (신규) — **코드 변경 0건** |
| P1 | sop-platform | 저장소 전체 (이 시점의 유일한 writer) |
| P2-A | sop-platform | `src/lib/graph-validation.ts`, `src/lib/flow-shapes.ts`, `src/components/sop/SopStepShapeRenderer.tsx` |
| P2-B | sop-platform | `src/server/ai/**`, `src/lib/gemini-models.ts`, `src/app/api/models/route.ts`, `scripts/verify-quality.mjs`의 provider 규칙 3개 |
| P2-C | sop-platform | `src/app/api/sop/generate/**`, `src/server/sop/sop-request.ts` |
| P2-D | sop-platform | `docs/**`, `.agents/skills/**`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`, `scripts/verify-quality.mjs`의 나머지 규칙 |
| P3 | sop-platform | 게이트 실행 · `docs/sop-standalone-extraction/work-orders/E3_PARITY_EVIDENCE.md` (신규). **결함 발견 시 직접 고치지 않고 소유 세션에 반려** |
| P4 | agent-shift | SOP 전용 파일 제거, `package.json`, `src/app/page.tsx`, `/flow` 테스트 |

**모든 세션 수정 금지**: SOP 도메인 파일(`src/lib/sop-*`, `src/components/sop/**`,
`src/components/sop-demo/**`, `src/server/sop/**` 중 P2-C 소유 외), SOP 테스트 21개의 단언 내용,
prompt 문자열, zod 스키마, repair 정책.

`REQ-E0-005`: 이관된 SOP 도메인 코드는 **이 라운드의 수정 대상이 아니다** (`REQ-PAR-004`).
수정이 필요하다고 판단되면 그것은 분리가 아니라 기능 변경이므로 별도 라운드로 넘긴다.

`REQ-E0-006`: `scripts/verify-quality.mjs`는 P2-B와 P2-D가 **서로 다른 규칙을** 만진다.
같은 파일이므로 **P2-D가 먼저 끝내고 P2-B가 그 위에 얹는다.** 두 세션이 동시에 이 파일을
열지 않는다. P2-B는 자기 차례가 오기 전까지 다른 소유 파일을 진행한다.

## 7. 세션 간 고정 인터페이스 계약

병렬 세션은 실행 중 협상할 수 없다. 아래 값은 **E1-02가 고정**하고 P2-B·P2-C는 그대로 쓴다.

### 7.1 provider 어댑터가 노출하는 것 (P2-B가 구현, P2-C·`/api/models`가 호출)

```ts
// src/server/ai/model-factory.ts
export type GenerationModel = /* provider별 LanguageModel */;
export type GenerationKeySource = 'byok' | 'env' | 'none';
export function resolveGenerationApiKey(byokApiKey?: unknown): { apiKey?: string; source: GenerationKeySource };
export function resolveGenerationModel(params: { model?: unknown; apiKey?: unknown }): GenerationModel;
export function buildReasoningProviderOptions(reasoning: unknown): unknown;
```

`REQ-E0-007`: `../AI_PROVIDER_CONTRACT.md` `REQ-AI-005`는 두 함수만 적고 있으나, 실측 결과
`resolveGenerationApiKey`가 `src/app/api/models/route.ts`에서 사용되는 **세 번째 공개 함수**다.
이 라운드의 고정 인터페이스는 위 5개(타입 2 + 함수 3)이며, 이름과 시그니처를 바꾸지 않는다.
`REQ-AI-005`의 목적("호출부 변경 0")은 이 확장으로 더 잘 충족된다.

### 7.2 SOP 생성 라우트 (P2-C가 만듦)

```text
POST /api/sop/generate
요청 body   현행 /api/ai 의 graphKind === 'sop' 분기와 동일한 wire 형태
응답        현행과 동일 (steps·edges·provenance·warnings)
```

`REQ-E0-008`: 요청·응답 wire 형태를 바꾸지 않는다. 바뀌는 것은 **경로 하나뿐**이다.
클라이언트 호출부의 URL 문자열 변경은 P2-C 소유이며, 그 외 클라이언트 로직은 손대지 않는다.

## 8. E0 라운드에서 이미 실측된 격차

`../EXTRACTION_SPEC.md`가 2026-08-26 기준으로 작성된 뒤 W4 라운드가 진행됐고, 실측 재확인에서
문서와 실제가 어긋나는 지점 4개가 나왔다. **각 세션은 자기에게 배정된 격차를 반드시 처리한다.**

| ID | 격차 | 근거 | 배정 |
|---|---|---|---|
| **G1** | `src/components/sop-demo/**` 3개 파일이 §2.1 인벤토리에 없다. `src/components/sop/**` glob이 이 디렉터리를 잡지 못한다 | `src/app/sop/demo/**`가 `DemoSetup`·`DemoWorkspace`를 import한다. `tests/sop-demo.test.ts`는 이미 이관 목록에 있다 | P0 확정 → **P1 이관** |
| **G2** | `src/app/api/models/route.ts`가 **9번째 결합 지점**이다. §2.2 공유 모듈 8개 목록에 없다 | `ApiKeySettings.tsx`(SOP `SopSetupGate`가 mount)가 `fetch('/api/models')`를 호출한다. 이 route는 `resolveGenerationApiKey`와 `gemini-models`에 의존한다 | P0 확정 → **P1 이관**, 이후 **P2-B 소유** |
| **G3** | `REQ-EXT-006`의 제거 대상 목록(`@radix-ui/*`, `class-variance-authority`, `tailwind-merge`)이 **전이 의존을 놓쳤다** | `SopSetupGate` → `ApiKeySettings` → `@/components/ui/{button,card,dialog,input,label,select}` → `@/lib/utils`(clsx+tailwind-merge) + radix `slot·label·select·dialog` + cva. "SOP의 `@/components/ui/*` 사용 0건"은 **직접 import 기준으로만** 참이다 | P0 확정 → **P1이 §9 규칙으로 처리** |
| **G4** | 루트 `src/app/layout.tsx`가 `next/font/google`(Geist, Geist_Mono)을 쓰고 `FloatingDock`을 mount한다 | `next/font/google`은 **빌드 시점에 네트워크로 폰트를 받아 self-host**한다 → `REQ-RUN-008`(네트워크 없는 재현 가능 빌드)과 충돌. `FloatingDock`은 `framer-motion` 의존 + `/flow`·`/strategy`·`/export` 링크 | P0 확정 → **P1이 §9 규칙으로 처리** |

`INT-E0-002`: G4의 `FloatingDock`은 **`/sop` 경로에서 이미 렌더되지 않는다**
(`pathname.startsWith('/sop')` 조기 반환). 따라서 제거해도 SOP 화면의 시각적 변화는 0이며,
E3의 접근성 기준선 대조를 흔들지 않는다. 실측으로 확인된 사실이다.

`INT-E0-003`: G4의 `next/font/google`은 **런타임 외부 통신을 만들지 않는다** — 빌드 시점에만
받아 self-host한다. 즉 `TST-RUN-002`(외부망 차단 기동)는 영향받지 않고, `REQ-RUN-008`(빌드
재현성)만 영향받는다. 두 문제를 섞지 않는다.

## 9. 격차 G3·G4 처리 규칙

`REQ-E0-009`: **이관과 기능 변경을 겹치지 않는다** (`../PARALLEL_EXECUTION.md` §10). 따라서:

- **G3**: `@/components/ui/` 6개 파일과 `src/lib/utils.ts`를 **그대로 이관하고**, 그것들이
  요구하는 npm 패키지(`clsx`, `tailwind-merge`, `class-variance-authority`,
  `@radix-ui/react-slot`, `@radix-ui/react-label`, `@radix-ui/react-select`,
  `@radix-ui/react-dialog`)를 `package.json`에 **남긴다.**
  `ApiKeySettings`를 Tailwind로 다시 쓰는 것은 기능 변경이므로 **이 라운드에서 하지 않는다.**
  제거되는 것은 실측상 아무도 쓰지 않는 `@radix-ui/react-popover`와 `@/components/ui/`의
  나머지 5개(`badge`, `command`, `popover`, `spinner`, `textarea`)다.
- **G4**: 새 루트 layout에서 `FloatingDock`을 **mount하지 않는다**(SOP에 렌더된 적 없음).
  `next/font/google`은 **1차 이관에서 유지한다** — 폰트를 바꾸면 시각 동등성 증명이 무너진다.
  대신 P1이 이 사실을 `REQ-RUN-008` 미충족 항목으로 명시 기록하고, 사내망 빌드 단계에서
  로컬 폰트로 전환하는 후속 작업으로 넘긴다.

`REQ-E0-010`: 위 두 처리는 **문서가 확정하지 않은 값을 코드가 먼저 정하는 것이 아니다.**
둘 다 "가장 작은 가역적 선택"(`INT-RUN-001`의 원칙)이며, 각 세션은 HANDOFF에 이 선택을
구현 해석으로 기록한다.

## 10. 모든 세션이 지키는 규칙

1. **소유 밖 변경 0건**이 완료 조건이다. `git status --short`로 매번 확인한다.
2. **커밋 전 `git diff --cached --name-only`를 반드시 확인한다.** 이 저장소에서 실제로
   사고가 났다 — `14929ad`가 문서 커밋에 W4-01 Foundation 통합분을 함께 담았다.
3. **사용자 승인 없이 commit·push하지 않는다** (`AGENTS.md`, `CLAUDE.md`).
4. **`git remote add`·`git push`를 하지 않는다** (§3 `INT-E0-001`).
5. **좁히기는 먼저 기준을 만든다.** 줄이기 전에 테스트를 돌려 결과를 기록하고, 줄인 뒤 같은
   결과가 나오는 것이 "그 코드는 SOP가 쓰지 않았다"의 증거다 (`TST-EXT-001`).
6. **값 집합(enum)을 줄이지 않는다** (`REQ-EXT-004`). `FLOW_SHAPE_IDS`,
   `SOP_AGENTIZATION_SUGGESTION_TYPES` 같은 SSOT 배열은 스키마·문서·저장된 문서의 원천이다.
7. **docstring을 줄이거나 요약하지 않는다** (`INT-PAR-002`). 새 저장소는 이력이 없으므로
   코드 옆 주석이 유일한 설계 근거다.
8. **`node_modules`를 junction/symlink로 연결하지 않는다** (`REQ-PAR-008`). Next 16 Turbopack이
   거부해 `npm run build`와 `npm run dev`가 둘 다 죽는다. 이 저장소에서 세 번 관측됐다.
9. **빌드·dev 실패를 판단하기 전에 `.next/dev/lock`을 지우고 한 번 더 확인한다**
   (`REQ-PAR-009`). 잠금이 남아 있으면 진짜 원인과 다른 오류가 먼저 난다.
10. **브라우저 산출물(`.playwright-mcp/`)을 `.gitignore`에 등록한다** (`REQ-PAR-010`).

## 11. 세션 완료 게이트

E1~E2 각 세션은 자기 저장소에서 아래를 통과시킨다.

```bash
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run test:sop            # 소유 범위와 무관하게 전체
git diff --check
git status --short          # 소유 밖 변경 0건
```

`npm run build`는 `node_modules`가 정직하게 설치된 세션에서만 요구한다(§10-8).

## 12. HANDOFF 형식

`../PARALLEL_EXECUTION.md` §9를 그대로 따른다.

```text
1. 저장소 / worktree 절대 경로 / branch / 기준 commit
2. 변경 파일 (소유 목록과 대조 — 소유 밖 0건 확인)
3. 충족한 REQ·INT·TST ID
4. 새로 도입한 구현 해석
5. 좁히기를 했다면: 제거 대상이 SOP 테스트에서 참조되지 않음을 증명한 방법
6. 실행한 명령과 PASS/FAIL
7. 실패 명령의 원문 오류
8. 다른 세션·다른 저장소로 넘기는 요청
9. 보류 항목에 손대지 않았음의 확인
10. 다음 세션이 건드리면 안 되는 파일
```

## 13. 이 라운드에서 금지

- 한 세션이 두 저장소를 만지는 것
- E3 통과 전에 원본에서 SOP 제거
- 이관과 기능·UX 변경을 같은 세션에서 수행
- 공유 모듈을 npm 패키지로 만들어 두 저장소가 의존하게 만드는 것
- 값 집합(enum) 축소
- prompt 문자열·zod 스키마·repair 정책·토큰 예산 변경
- 승인 생애주기·Activity–Sub Action·Agent화 판단 분리·노드 작성 계약 변경
- 라우트 경로 재설계(`/sop` 접두사 제거) — `INT-EXT-005`에 따라 1차 이관에서 하지 않는다
- 실제 DB 도입 (`REQ-RUN-004`)
- 원격 저장소 연결·push
- 사용자 승인 없는 commit
