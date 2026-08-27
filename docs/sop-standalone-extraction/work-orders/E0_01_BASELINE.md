# 작업지시서 E0-01 — 기준 고정 (P0, agent-shift, 단독)

## 임무

이관을 시작하기 전에 **원본의 상태를 실측으로 못 박는다.** 이후 모든 세션은 여기서 기록한
값과 자기가 만든 결과를 비교한다. 이 세션은 **코드를 한 줄도 바꾸지 않는다.**

## 저장소와 baseline

```text
저장소       agent-shift
worktree     C:\Users\USER\Desktop\NOCODE\agent-shift
branch       wave0/sop-foundation
코드 baseline  52b8377  feat(sop): complete member entry integration
```

문서 commit이 그 위에 더 얹혀 있어도 정상이다. 판정은 내용으로 한다.

## 시작 조건

`E0_00_MASTER.md` §2의 필독 목록을 전부 읽는다. 그 다음:

```bash
git status --short --branch
git log -1 --oneline
git diff --stat 52b8377 -- src tests   # 출력이 비어야 한다
npm run verify:sop-customer
```

`src`/`tests`에 차이가 있으면 **중단하고 보고한다.** baseline이 움직인 상태에서 실측한 값은
이후 세션의 대조 기준이 될 수 없다.

## 배타적 소유 파일

```text
docs/sop-standalone-extraction/work-orders/E0_BASELINE_EVIDENCE.md   (신규)
```

**그 외 어떤 파일도 수정하지 않는다.** `src/**`, `tests/**`, `package.json`, 설정 파일 전부
읽기 전용이다. 이 세션의 완료 조건에는 `git status --short`가 위 한 파일만 보여주는 것이
포함된다.

## 구현 지시

### 1. 인벤토리를 실측한다

아래를 실행하고 **출력값을 그대로** `E0_BASELINE_EVIDENCE.md`에 적는다. 요약하지 않는다.

```bash
# SOP 전용 모듈
ls src/lib/sop-*.ts | wc -l
ls src/components/sop/*.tsx | wc -l
find src/components/sop-demo -type f | wc -l
find src/server/sop -type f | wc -l

# SOP 전용 라우트
find src/app/sop -type f | wc -l
find src/app/api/sop -type f | wc -l

# SOP 전용 테스트
ls tests/sop* | wc -l

# /flow 전용 테스트 (P4의 회귀 기준)
ls tests/flow-*.test.ts tests/terminal-node.test.tsx
```

2026-08-27 실측값은 다음과 같다. **같은 값이 나오는지 확인**하고, 다르면 차이를 기록한다.

| 항목 | 실측 (2026-08-27, `52b8377`) |
|---|---|
| `src/lib/sop-*.ts` | 52 |
| `src/components/sop/*.tsx` | 38 |
| `src/components/sop-demo/**` | 3 |
| `src/server/sop/**` | 8 |
| 소계 (도메인) | **101** (`CONTEXT.md` §2.1의 98 + sop-demo 3) |
| `src/app/sop/**` | 12 |
| `src/app/api/sop/**` | 12 |
| 소계 (라우트) | **24** |
| `tests/sop*` | **21** (`test:sop` 20개 + `test:sop-demo` 1개) |
| `/flow` 테스트 | `flow-branches.test.ts`, `flow-shapes.test.ts`, `terminal-node.test.tsx` |

`INT-E0-101`: `CONTEXT.md` §2.1이 "98개"·"20개"로 적힌 것은 2026-08-26 기준이다. W4 라운드가
`tests/sop-clone-work-map-entry.test.tsx`를 추가했고, `src/components/sop-demo/**`는 원래
집계에서 빠져 있었다(격차 **G1**). 문서를 고치는 것은 P2-D의 일이다 — 이 세션은 **차이를
기록만** 한다.

### 2. 결합도 방향을 재확인한다

```bash
# /flow → SOP 참조 (0건이어야 한다)
grep -rn "sop" src/app/flow src/components/flow src/lib/store.ts \
  src/app/strategy src/app/room src/app/export \
  src/components/collaboration src/components/strategy 2>/dev/null

# SOP → 비-SOP 모듈
grep -rhoE "from '@/(lib|components|hooks|server)/[^']+'" \
  src/lib/sop-*.ts src/components/sop/ src/components/sop-demo/ \
  src/server/sop/ src/app/sop/ src/app/api/sop/ \
  | sed "s/from '//;s/'//" | grep -vE "sop" | sort | uniq -c | sort -rn
```

2026-08-27 실측 결과 (이 8개가 `CONTEXT.md` §2.2의 목록과 정확히 일치한다):

```text
5 @/lib/graph-validation
4 @/hooks/useSopAiSettings
3 @/server/ai/model-factory
2 @/lib/ai-shape-guide
1 @/lib/gemini-models
1 @/lib/flow-shapes
1 @/components/settings/ApiKeySettings
1 @/components/flow/FlowShapeRenderer
```

`/flow` → SOP 참조는 **0건**이다. `src/app/page.tsx`가 `/sop`로 라우팅하지만 이것은 랜딩이지
`/flow` 코드가 아니다 — P4가 다룬다.

### 3. 전이 의존을 실측한다 — 직접 import만 보면 안 된다

`REQ-E0-101`: 공유 모듈 8개에서 **한 단계 더** 들어간다. 이것이 격차 **G2·G3**의 출처다.

```bash
for f in src/lib/graph-validation.ts src/lib/flow-shapes.ts \
         src/components/flow/FlowShapeRenderer.tsx src/server/ai/model-factory.ts \
         src/lib/gemini-models.ts src/lib/ai-shape-guide.ts \
         src/hooks/useSopAiSettings.ts src/components/settings/ApiKeySettings.tsx; do
  echo "--- $f"
  grep -ohE "from '@/[^']+'" "$f" | sed "s/from '//;s/'//" | sort -u
done

grep -rn "api/models" src/ --include=*.ts --include=*.tsx
grep -ohE "from '[^']+'" src/components/ui/{button,card,dialog,input,label,select}.tsx \
  | sed "s/from '//;s/'//" | sort -u
```

2026-08-27 실측으로 확정된 것:

- `ApiKeySettings.tsx` → `@/components/ui/{button,card,dialog,input,label,select}` 6개
  → `@/lib/utils`(clsx + tailwind-merge) + `@radix-ui/react-{slot,label,select,dialog}` + `class-variance-authority`
- `ApiKeySettings.tsx` → `fetch('/api/models')` → `src/app/api/models/route.ts`
  → `resolveGenerationApiKey`(model-factory) + `gemini-models`
- `FlowShapeRenderer.tsx` → `@/lib/flow-shapes` (이관 대상 안에서 닫힌다)
- `model-factory.ts`, `useSopAiSettings.ts` → `@/lib/gemini-models` (닫힌다)
- `graph-validation.ts`, `flow-shapes.ts`, `ai-shape-guide.ts`, `gemini-models.ts`
  → `@/` import **0건** (완전히 닫혀 있다)

`INT-E0-102`: 즉 `EXTRACTION_SPEC.md` `REQ-EXT-006`의 제거 대상 목록 중
`@radix-ui/*`, `class-variance-authority`, `tailwind-merge`는 **직접 import 기준으로만** 0건이며
전이 기준으로는 SOP가 사용한다. 실제로 제거 가능한 것은
`@liveblocks/client`, `@liveblocks/zustand`, `framer-motion`, `cmdk`, `docx`, `exceljs`,
`@radix-ui/react-popover`다. 이 판정을 `E0_BASELINE_EVIDENCE.md`에 근거와 함께 남긴다.

### 4. 루트 layout과 전역 자산을 확인한다

```bash
cat src/app/layout.tsx
grep -rnE "https?://" src/app/globals.css src/components/sop/ src/app/sop/
ls public/ public/images
```

확인할 것:

- `next/font/google`(Geist, Geist_Mono) 사용 여부 → **격차 G4**
- `FloatingDock` mount 여부와 `pathname.startsWith('/sop')` 조기 반환 존재 여부
- SOP 화면·전역 CSS의 원격 URL 참조 (2026-08-27 실측: **0건**, `REQ-RUN-011/012` 성립)

### 5. 게이트 baseline을 기록한다

각 명령을 실행하고 **PASS/FAIL과 테스트 수**를 그대로 적는다. 이것이 `TST-EXT-004`
("PASS/FAIL 조합이 분리 전과 동일")의 대조 기준이다.

```bash
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run test:flow-branches
npm run test:shapes
npm run build
npx next build --webpack
npm run verify:quality
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
```

`REQ-E0-102`: 실패한 명령이 있으면 **고치지 않는다.** 원문 오류를 그대로 기록한다.
분리 전에 이미 실패하던 것을 분리 후 실패로 오판하지 않기 위한 기록이다.

### 6. 고객 fixture 불변식을 실측한다

`TST-EXT-005`의 대조값이다. `src/data/sop-task-library-sample.json` 기준으로 확인한다.

```text
Job 2개 · Task 10개 · Activity 138개 · Activity-Skill 관계 690개 · 대표 Task의 Activity 14개
```

`npm run verify:sop-customer -- --final`이 이 값을 검사한다. 실제 출력 수치를 기록한다.

### 7. 접근성 기준선의 위치를 확인한다

```bash
ls docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md
```

E3가 이 파일의 실측값을 대조 기준으로 쓴다. 존재와 경로를 확인하고, P2-D가 이 파일을
새 저장소로 옮겨야 한다는 사실을 handoff에 명시한다.

## 금지

- `src/**`, `tests/**`, `package.json`, 설정 파일의 **어떤 수정도**
- 발견한 결함을 "겸사겸사" 고치는 것 — 기록만 한다
- `CONTEXT.md`·`EXTRACTION_SPEC.md`의 수치를 이 세션에서 갱신하는 것 (P2-D 소유)
- 새 저장소 폴더 생성 (P1 소유)

## 수용 검증

```bash
git status --short
# docs/sop-standalone-extraction/work-orders/E0_BASELINE_EVIDENCE.md 한 줄만 나와야 한다
git diff --stat 52b8377 -- src tests
# 비어 있어야 한다
```

`E0_BASELINE_EVIDENCE.md`가 담아야 할 것:

1. baseline commit과 `git diff --stat 52b8377 -- src tests`가 비었다는 확인
2. §1 인벤토리 실측표 (문서값과의 차이 포함)
3. §2 결합도 실측 출력 원문
4. §3 전이 의존 실측 결과와 제거 가능 패키지 확정 목록
5. §4 루트 layout·전역 자산 확인 결과
6. §5 게이트 baseline — 명령별 PASS/FAIL과 테스트 수, 실패 시 원문 오류
7. §6 fixture 불변식 실측 수치
8. 격차 G1~G4의 재확인 결과 (확인됨 / 다름 / 새 격차 G5…)

## 인계

`E0_00_MASTER.md` §12 형식에 더해 다음을 기록한다.

1. P1이 이관해야 할 **최종 파일 목록** — G1(`src/components/sop-demo/**`)과
   G2(`src/app/api/models/route.ts`)를 포함한 형태로
2. P1이 `package.json`에 **남겨야 할 의존성**과 **제거할 의존성**의 확정 목록 (§3 근거 포함)
3. 게이트 baseline 표 — P3가 `TST-EXT-004`로 대조할 값
4. `52b8377`에서 이미 실패하는 명령이 있다면 그 목록 (분리 후 오판 방지)
