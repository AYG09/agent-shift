# 작업지시서 E1-02 — 뼈대 (P1, sop-platform, 단독)

## 임무

빈 이력의 `sop-platform`에 **빌드되고 SOP 테스트 21개가 도는 뼈대**를 세운다. 이 세션이
끝나야 P2-A~D가 병렬로 들어올 수 있다. 이 세션은 **파일을 옮기는 일만** 한다 — 좁히기·재작성·
라우트 분해는 전부 P2의 몫이다.

## 저장소

```text
원본(읽기 전용)  C:\Users\USER\Desktop\NOCODE\agent-shift  @ 52b8377  (wave0/sop-foundation)
작업 대상        C:\Users\USER\Desktop\NOCODE\sop-platform  (branch: main, 빈 이력)
```

`REQ-E1-001`: **`agent-shift`에는 어떤 파일도 쓰지 않는다.** 읽기만 한다. `git status`를
`agent-shift`에서도 확인해 변경 0건임을 증명한다.

`REQ-E1-002`: `git remote add`·`git push`를 하지 않는다. 원격은 미정이다 (`INT-E0-001`).

## 시작 조건

`E0_00_MASTER.md` §2 필독 목록 + `E0_01_BASELINE.md`의 handoff와
`E0_BASELINE_EVIDENCE.md`를 읽는다. baseline evidence의 **파일 목록과 의존성 확정 목록이
이 세션의 입력**이다.

```bash
git -C C:/Users/USER/Desktop/NOCODE/agent-shift diff --stat 52b8377 -- src tests   # 비어야 함
ls C:/Users/USER/Desktop/NOCODE/sop-platform
```

새 폴더에는 부트스트랩 산출물(`README.md`, `AGENTS.md`, `CLAUDE.md`,
`docs/sop-standalone-extraction/**`, `.gitignore`)만 있고 `.git`은 초기화만 된 상태다.
커밋은 하나도 없다.

## 배타적 소유

이 시점의 `sop-platform` **전체**. 유일한 writer다.

## 구현 지시

### 1. 이관한다 — SOP 전용 (경로 그대로)

```text
src/lib/sop-*.ts                          52개
src/components/sop/**                     38개
src/components/sop-demo/**                 3개   ← 격차 G1. 빠뜨리면 /sop/demo가 깨진다
src/server/sop/**                          8개
src/app/sop/**                            12개
src/app/api/sop/**                        12개
src/data/sop-task-library-sample.json      1개
tests/sop*.test.ts, tests/sop*.test.tsx   21개
src/app/favicon.ico
```

`REQ-E1-003`: **내용을 한 글자도 바꾸지 않는다.** docstring을 줄이거나 요약하지 않는다
(`INT-PAR-002`) — 이력 없는 저장소에서 그것이 유일한 설계 근거다.

### 2. 이관한다 — 공유 모듈 (분기 복사)

| 원본 | 새 경로 | 이 세션이 하는 일 |
|---|---|---|
| `src/lib/graph-validation.ts` | 같음 | **복사만.** 좁히기는 P2-A |
| `src/lib/flow-shapes.ts` | 같음 | **복사만.** `REQ-EXT-004`에 따라 값 집합을 줄이지 않는다 |
| `src/components/flow/FlowShapeRenderer.tsx` | `src/components/sop/SopStepShapeRenderer.tsx` | 복사 + 파일명 변경 + 컴포넌트명 `SopStepShapeRenderer` |
| `src/server/ai/model-factory.ts` | 같음 | **복사만.** 재작성은 P2-B |
| `src/lib/gemini-models.ts` | 같음 | **복사만.** 재작성은 P2-B |
| `src/lib/ai-shape-guide.ts` | 같음 | 복사만 |
| `src/hooks/useSopAiSettings.ts` | 같음 | 복사만 |
| `src/components/settings/ApiKeySettings.tsx` | 같음 | 복사만. **삭제하지 않는다** — 기본 비활성은 P2-B의 판단 대상 |
| `src/app/api/models/route.ts` | 같음 | 복사만. **격차 G2** — 빠뜨리면 ApiKeySettings의 모델 목록이 죽는다 |
| `src/components/ui/{button,card,dialog,input,label,select}.tsx` | 같음 | 복사만. **격차 G3** |
| `src/lib/utils.ts` | 같음 | `cn`만 남기고 `throttle` 제거 — §3 참고 |

`REQ-E1-004`: `src/components/ui/`의 나머지 5개(`badge`, `command`, `popover`, `spinner`,
`textarea`)는 이관하지 않는다. `ApiKeySettings`의 전이 폐포에 없다.

### 3. 유일하게 허용되는 코드 수정 — import 경로와 dead export

`REQ-E1-005`: 이 세션은 **다음 두 가지 외에 어떤 코드도 바꾸지 않는다.**

1. **import 경로 문자열** — 파일이 이동했기 때문에 불가피한 변경. 실측상 딱 한 건이다:
   `src/components/sop/SopStepNode.tsx`의
   `@/components/flow/FlowShapeRenderer` → `@/components/sop/SopStepShapeRenderer`
   (컴포넌트 사용처 이름도 함께). 다른 import는 경로가 모두 보존되므로 변경이 없다.
2. **`src/lib/utils.ts`의 `throttle` 제거** — 이관 대상 전체에서 참조 0건이다.
   제거 전에 증명하고 그 명령과 출력을 handoff에 남긴다:

   ```bash
   grep -rn "throttle" src/ tests/    # sop-platform에서 0건이어야 한다
   ```

`REQ-E1-006`: 위 변경을 마친 뒤 **SOP 도메인 파일의 diff가 import 줄 외에는 없음**을
증명한다.

```bash
diff -r C:/Users/USER/Desktop/NOCODE/agent-shift/src/lib \
        C:/Users/USER/Desktop/NOCODE/sop-platform/src/lib 2>/dev/null | grep "^[<>]" | head -50
# sop-* 파일에서 나오는 차이는 0건이어야 한다
```

### 4. 새로 작성한다 — 루트 layout (격차 G4)

`src/app/layout.tsx`를 새로 쓴다. 원본을 복사하지 않는다.

**반드시 보존할 것** (보존하지 않으면 SOP 화면의 배경·글꼴·색이 바뀌어 E3의 동등성 증명이
무너진다):

```tsx
<html lang="ko">
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased pro-canvas text-[#18181B]`}>
        <main>{children}</main>
    </body>
</html>
```

- `next/font/google`의 `Geist`·`Geist_Mono`와 `--font-geist-sans`/`--font-geist-mono` 변수
- `antialiased pro-canvas text-[#18181B]` 클래스 (`pro-canvas`는 `globals.css`가 정의한다)
- `viewport` export 전체 (모바일·노치 대응)

**바꿀 것**:

- `FloatingDock` mount **제거**. 실측상 `pathname.startsWith('/sop')`에서 이미 조기 반환하므로
  SOP 화면의 시각적 변화는 **0**이다 (`INT-E0-002`). `framer-motion` 의존이 여기서 끊긴다.
- `metadata`의 title/description/keywords를 SOP 앱 기준으로 다시 쓴다. `Agent Shift` 문구는
  이 저장소의 제품명이 아니다.

`REQ-E1-007`: `next/font/google`은 **유지한다.** 폰트를 바꾸면 시각 동등성 증명이 불가능해진다
(`REQ-E0-009`). 대신 handoff에 다음을 명시 기록한다 —
**`next/font/google`은 빌드 시점에 네트워크로 폰트를 받으므로 `REQ-RUN-008`(네트워크 없는
재현 가능 빌드)을 아직 충족하지 못한다. 런타임에는 self-host되므로 `TST-RUN-002`(외부망 차단
기동)에는 영향이 없다** (`INT-E0-003`). 로컬 폰트 전환은 사내망 빌드 단계의 후속 작업이다.

### 5. 이관한다 — 전역 스타일과 설정

```text
src/app/globals.css        복사 (511줄, 그대로 — CSS 좁히기는 증명이 불가능하므로 하지 않는다)
next.config.ts             복사
tsconfig.json              복사
postcss.config.mjs         복사
eslint.config.mjs          복사
.prettierrc                복사
next-env.d.ts              복사
components.json            복사
```

`REQ-E1-008`: `public/`은 이관하지 않는다. `bg-main.png`는 랜딩 전용이고 나머지 svg는
Next 기본 자산이다. SOP 화면·전역 CSS의 원격/로컬 이미지 참조는 실측상 0건이다.

### 6. 이관한다 — 문서와 스킬 (원본 그대로, 정리는 P2-D)

```text
.agents/skills/implement-sop-customer-requirements/**
docs/QUALITY_CONVENTIONS.md
docs/DESIGN_CONVENTIONS.md
docs/sop-member-context-redesign/**
scripts/verify-quality.mjs
SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md
AGENTS.md, CLAUDE.md, README.md          ← 부트스트랩 stub을 원본 기반으로 대체
```

`REQ-E1-009`: 이 시점에는 **경로 참조를 고치지 않는다.** `verify-quality.mjs`와
`verify-sop-customer.mjs`가 `/flow` 경로를 검사해 실패하는 것은 정상이며 **P2-D가 고친다.**
E1의 게이트에 `verify:quality`·`verify:sop-customer`를 넣지 않는 이유다.

`docs/sop-standalone-extraction/**`은 이미 부트스트랩으로 들어와 있다. 원본과 내용이 같은지
확인만 하고 덮어쓰지 않는다.

### 7. `package.json`을 확정한다

`name`을 `sop-platform`으로 바꾼다. scripts는 `test:shapes`·`test:flow-branches`를 제외하고
그대로 옮긴다.

**남기는 의존성** (전이 폐포 실측 기준):

```text
@ai-sdk/google  @xyflow/react  ai  class-variance-authority  clsx  lucide-react
next  react  react-dom  tailwind-merge  zod  zustand
@radix-ui/react-dialog  @radix-ui/react-label  @radix-ui/react-select  @radix-ui/react-slot
```

**제거하는 의존성**:

```text
@liveblocks/client  @liveblocks/zustand  framer-motion  cmdk  docx  exceljs
@radix-ui/react-popover
```

`REQ-E1-010`: 격차 **G3** 때문에 `REQ-EXT-006`의 제거 목록을 그대로 쓰지 않는다.
`@radix-ui/*` 전부와 `class-variance-authority`·`tailwind-merge`를 지우면
`ApiKeySettings` → `components/ui/*` 체인이 깨진다. 실제 제거 대상은 위 7개다. 이 판정을
구현 해석으로 handoff에 기록한다.

devDependencies는 그대로 옮긴다(`@types/*`, `eslint*`, `prettier`, `tailwindcss`,
`@tailwindcss/postcss`, `tsx`, `typescript`, `react-test-renderer`,
`@types/react-test-renderer`, `tw-animate-css`, `baseline-browser-mapping`).

```bash
npm install          # lockfile을 새로 만든다 (원본 lockfile을 복사하지 않는다)
```

`REQ-E1-011`: `node_modules`를 junction/symlink로 만들지 않는다 (`REQ-PAR-008`).
`sop-platform`에서 정직하게 설치한다.

### 8. AI 생성 경로의 공백을 명시한다

`REQ-E1-012`: `src/app/api/ai/route.ts`는 **이관하지 않는다.** 그 파일은 `/flow`의
as-is·to-be·drilldown·node-split action을 함께 담고 있고, 새 저장소에 그 action은 존재하지
않는다 (`REQ-EXT-005`).

결과적으로 이 세션이 끝난 시점에 `src/lib/sop-ai-generation.ts`가 호출하는 `/api/ai`는
**404다.** 이것은 결함이 아니라 **예정된 공백**이며 P2-C가 `/api/sop/generate`로 채운다.

`REQ-E1-013`: 이 공백을 handoff에 명시한다. 그리고 **`src/lib/sop-ai-generation.ts`의 URL
문자열을 이 세션에서 바꾸지 않는다** — P2-C 소유다. 테스트 21개는 `fetchFn`을 주입받으므로
공백과 무관하게 통과한다.

### 9. `.gitignore`를 확인한다

```text
/node_modules
/.next/
.env*
/.playwright-mcp/          ← REQ-PAR-010. 없으면 세션 간 소유권 대조가 오염된다
tsconfig.tsbuildinfo
```

### 10. 고정 인터페이스를 게시한다

`E0_00_MASTER.md` §7의 두 계약을 **이 세션의 handoff에 실제 값으로 다시 적는다.**
P2-B와 P2-C는 handoff만 보고 시그니처를 알 수 있어야 한다. 실행 중 협상은 불가능하다.

## 금지

- `agent-shift`의 파일 수정 (읽기 전용)
- SOP 도메인 코드의 내용 변경 — §3의 두 예외 외 전부
- 공유 모듈 좁히기·재작성 (P2-A·P2-B 소유)
- `/api/sop/generate` 생성 (P2-C 소유)
- `verify-quality.mjs`·`verify-sop-customer.mjs`의 경로 규칙 수정 (P2-D 소유)
- `docs/`·`.agents/skills/`의 **내용** 수정 (P2-D 소유) — 복사만 한다
- `/sop` 접두사 제거 등 라우트 재설계 (`INT-EXT-005`)
- 실제 DB 도입 (`REQ-RUN-004`)
- `git remote add` / `git push`
- 사용자 승인 없는 commit

## 수용 검증

```bash
cd C:/Users/USER/Desktop/NOCODE/sop-platform
npx tsc --noEmit
npm run lint
npm run test:sop            # 20개 파일 전부 PASS
npm run test:sop-demo
npm run build
npx next build --webpack    # REQ-RUN-010: 두 번들러 모두
git diff --check

# 원본 무변경 증명
git -C C:/Users/USER/Desktop/NOCODE/agent-shift status --short
```

`TST-E1-001`: `npm run test:sop`의 **통과 파일 수와 단언 수가 `E0_BASELINE_EVIDENCE.md`의
값과 같아야 한다.** 줄었다면 이관 누락이다 (`TST-EXT-004`).

`TST-E1-002`: `npm run build`와 `npx next build --webpack`이 **둘 다** 통과한다.
`REQ-RUN-010` — 이 저장소에서 Turbopack은 통과하고 webpack은 실패하는 결함이 실제로 있었다.

`TST-E1-003`: `npm run dev`로 기동해 `/sop/login`이 렌더되는 것을 확인한다. AI 생성은
§8에 따라 아직 동작하지 않는 것이 정상이다.

## 인계

`E0_00_MASTER.md` §12 형식에 더해 다음을 기록한다.

1. **이관 파일 수 대조표** — 원본 실측값 vs 새 저장소 실측값 (항목별)
2. **§3의 두 코드 변경**의 정확한 diff와 `throttle` 미사용 증명 출력
3. **확정 의존성 목록**과 `REQ-EXT-006`에서 벗어난 이유 (격차 G3)
4. **`next/font/google` 유지 결정**과 `REQ-RUN-008` 미충족 기록 (격차 G4)
5. **`/api/ai` 404 공백**과 P2-C가 채울 지점
6. **고정 인터페이스 계약 실제 값** — provider 어댑터 5개 export, `/api/sop/generate` wire
7. P2-A~D 각각에게: 자기 소유 파일이 새 저장소의 어느 경로에 있는지
8. **`scripts/verify-quality.mjs`·`verify-sop-customer.mjs`가 현재 실패한다는 사실**과
   그것이 P2-D의 작업이라는 확인
