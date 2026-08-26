# 보완 지시서 3A — Wave 3 검토 결과 반영

이 문서는 **Wave 2 integration owner 세션 전용** 보완 지시서다. `09_WAVE3_DESIGN_VERIFICATION.md`의
writer 정책에 따라 코드 수정은 통합 owner 한 명만 수행한다. Wave 3 reviewer는 이 작업을
수행하지 않는다 — 같은 파일을 동시에 수정하면 안 된다.

작업 worktree: `C:\Users\USER\Desktop\NOCODE\agent-shift` (branch `wave0/sop-foundation`)
검증 baseline: `a54cc1e` 위의 현재 dirty worktree (수정 15 + untracked 20)

## 판정: 커밋 보류

Wave 3 리뷰어가 보고한 접근성 지적 5건을 실행 관리자가 코드로 전부 재확인했다. **5건 모두
실재하며**, 세 건은 이 저장소가 이미 문서로 정한 규칙을 정면으로 위반한다.

- `docs/DESIGN_CONVENTIONS.md` §6: "토글류는 `aria-expanded`/`aria-pressed`/`aria-current`를 제공한다"
- `SPEC.md` §7.3: "모든 입력에 연결된 label과 field-level error를 제공한다",
  "focus indicator", "reduced motion"

또한 `09_WAVE3_DESIGN_VERIFICATION.md`가 **필수로 규정한 두 게이트가 수행되지 않았다**
(Claude 디자인 검토 기능 실제 호출, 1440×900·1920×1080 브라우저 검증). 리뷰어는 이를
`DESIGN_CAPABILITY_BLOCKED`로 정직하게 보고했고 사용했다고 주장하지 않았다 — 보고 자체는
계약대로다. 다만 09의 완료 정의("모든 기능·시각·접근성 게이트를 통과하기 전에는 완료라고
선언하지 않는다")를 아직 충족하지 못한 상태다.

기능·구조 측면은 문제없다. 전 게이트(`tsc`, `lint`, `test:sop`, `test:sop-demo`, `build`,
`verify:quality`, `verify:sop-customer --final`, `--scenario-final`, `git diff --check`)가
통과하고 `/flow`와 `src/app/api/ai/route.ts`는 변경 0건이다. 리뷰어가 코드를 수정하지 않았다는
주장도 확인했다(작업 전후 `git status --short` 35개 동일).

---

## 항목 1 (필수) — 접근성 결함 5건

각 항목은 실행 관리자가 해당 파일·행을 직접 열어 재확인한 것이다.

### A11Y-1 (Medium) — Skill 설명 textarea에 focus 표시가 사라진다

`src/components/sop/SopWorkMapActivityDetail.tsx:173`

```tsx
className="w-full resize-y bg-transparent text-[11px] leading-relaxed text-zinc-600 outline-none"
```

`outline-none`으로 브라우저 기본 표시를 없앤 뒤 대체 표시를 주지 않았다. 같은 파일의 형제
입력들은 이미 대체 표시를 갖고 있어(`:95`, `:105`의 `focus:ring-1 focus:ring-indigo-500`,
`:163`의 `focus:border-indigo-500`) 이 한 곳만 예외 상태다.

**수정**: 형제 입력과 같은 톤의 focus 표시를 추가한다(예: `focus:ring-1 focus:ring-indigo-500`
또는 `:163`과 같은 `focus:border-indigo-500`). 새 색을 만들지 말고 기존 패턴을 재사용한다.

### A11Y-2 (Medium) — 흐름의 주 입력에 accessible name이 없다

`src/components/sop/SopMemberContextForm.tsx:105-116`

업무맥락 textarea에 `aria-invalid`, `aria-describedby`, focus ring은 있지만 `<label>`,
`aria-label`, `aria-labelledby`가 하나도 없다. 위의 `<h1>`은 시각적으로만 제목 역할을 하고
프로그램적으로 연결되어 있지 않다. 이 입력은 재설계 흐름 전체의 **유일한 주 과업**이다.

**수정**: `<h1>`에 id를 부여하고 textarea에 `aria-labelledby`로 연결하거나, 시각적으로 숨긴
`<label htmlFor>`를 추가한다. 기존 `aria-describedby`(오류 연결)는 그대로 둔다.

### A11Y-3 (Low-Medium) — Task 정의 textarea 라벨 미연결, 오류 미연결

`src/components/sop/SopWorkMapDetailedView.tsx:163-170`

- "TASK 정의 (전문)" textarea가 `<label>`로 감싸이지도, `htmlFor`로 연결되지도 않은 순수
  `<span>` 옆에 있다 → accessible name 없음.
- `:159`의 "Task명을 입력하세요." 오류 문구에 `id`가 없어 Task명 입력의 `aria-describedby`로
  연결되지 않는다. (Task명 입력 자체는 `<label>` 안에 있어 이름은 갖고 있다.)

**수정**: 정의 textarea를 `<label>`로 감싸거나 `htmlFor`/`id` 쌍으로 연결하고, 오류 문구에
`id`를 주어 Task명 입력의 `aria-describedby`로 연결한다.

### A11Y-4 (Low) — 로딩 스피너가 reduced-motion을 따르지 않는다

`src/components/sop/SopRecommendationLoading.tsx:59`

`<Loader2 className="h-7 w-7 animate-spin" />`에 reduced-motion 처리가 없다. 같은 파일은
이미 `prefers-reduced-motion`을 구독해(`:17`, `:24`) tip 전환에는 적용하고 있으므로
(`:66-67`) 스피너만 예외다. `NFR-LOAD-003` 위반이다.

**수정**: 이미 계산해 둔 `reducedMotion` 값을 스피너에도 적용하거나
`motion-reduce:animate-none`을 추가한다. 새 훅을 만들지 않는다.

### A11Y-5 (Low) — 토글 버튼에 `aria-expanded`가 없다

`src/components/sop/SopTaskRecommendationFlow.tsx:213`

"Task 직접 찾기" 버튼이 `showManualSearch`를 토글해 아래 섹션을 보였다 숨겼다 하는데
`aria-expanded`가 없다. `DESIGN_CONVENTIONS.md` §6의 명시적 위반이다.

**수정**: `aria-expanded={showManualSearch}`를 추가한다. 제어 대상 섹션에 `id`가 있으면
`aria-controls`도 함께 주는 것이 좋다.

### 검증에 추가할 것

5건이 회귀하지 않도록, 각 소유 테스트 파일에 실행 가능한 단언을 추가한다. 소스 문자열
검색이 아니라 렌더된 요소의 props를 확인한다.

- `tests/sop-work-map-detailed.test.tsx`: Skill 설명 textarea의 className에 focus 표시가
  존재한다 / Task 정의 textarea가 accessible name을 갖는다 / Task명 오류가
  `aria-describedby`로 연결된다
- `tests/sop-member-login-context.test.tsx`: 업무맥락 textarea가 accessible name을 갖는다
- `tests/sop-task-recommendation-flow.test.tsx`: "Task 직접 찾기" 버튼이 상태에 따라
  `aria-expanded` true/false를 갖는다 / reduced-motion에서 스피너 애니메이션이 꺼진다

---

## 항목 2 (필수) — 테스트 커버리지 공백 2건

둘 다 코드 결함이 아니라 **증명되지 않은 계약**이다. 각각 단언 하나씩만 추가하면 된다.

### FUNC-1 — Activity별 Skill 관계가 생성 request에 보존되는지 미검증

`tests/sop-customer-scenario.test.ts:407` 부근이 `activity.skills`를 구성하지만 확정 Work Map의
Activity별 skill 집합과 대조하지 않는다. Activity의 순서·완전성은 이미 증명되어 있다
(TST-WM-008). 누락된 것은 **중첩된 Skill 관계**다 — 이는
`implementation-contract.md` §1의 "반복 Activity-Skill 관계를 전역에서 평탄화하지 않는다"와
직결된다.

**수정**: 생성 request의 Activity별 skill ID 배열이 확정 Work Map draft의 것과 정확히 같은지
비교하는 단언을 추가한다.

### FUNC-2 — 대표 표준안 API의 무부작용이 route 경계에서 미검증

`TST-STD-006`은 runner 수준에서 증명되어 있지만, 성공 경로로
`POST /api/sop/standard-drafts`를 실제로 한 번 통과시켜 저장·확정·실행 부작용이 없음을
확인하는 테스트가 없다. `tests/sop-hr-analytics.test.ts`는 거부 경로만 다룬다.

**수정**: 승인된 same-Task source로 성공 응답을 받고, 그 호출 전후로 repository record 수와
각 record의 lifecycle 상태가 변하지 않음을 단언하는 route 테스트를 추가한다.

---

## 항목 3 (필수) — Wave 2 HANDOFF 문서 작성

`09_WAVE3_DESIGN_VERIFICATION.md`의 시작 조건은 Wave 2 HANDOFF 수령이다. 그 문서가 존재하지
않아 리뷰어가 게이트 실행 결과로 완료를 추정해야 했다. 이번 수정을 마친 뒤
`docs/sop-member-context-redesign/work-orders/WAVE2_INTEGRATION_HANDOFF.md`를
`WAVE0_FOUNDATION_HANDOFF.md`와 같은 형식으로 작성한다. 최소한 다음을 담는다.

1. baseline commit / branch / worktree
2. 통합한 각 Wave 1 세션과 changed files
3. 충족한 SPEC requirement·test ID
4. Home/Gate/legacy 연결에서 내린 결정과 old deep link 호환 방식
5. 12개 수용 시나리오의 PASS 목록
6. 실행한 명령과 PASS/FAIL
7. `/flow`·`src/app/api/ai/route.ts` 변경 0건 증거
8. 알려진 한계 (아래 항목 4 포함)

---

## 항목 4 (코드로 해결 불가) — 미수행 필수 게이트

다음 두 가지는 이번 수정으로 닫히지 않는다. **수행했다고 기록하지 마라.**

- Claude 디자인 검토 기능 / Stitch MCP 실제 호출
- 1440×900·1920×1080, zoom 100% 브라우저 렌더링·스크린샷·키보드 전 구간 이동·실제 focus
  ring 확인·스크린리더 announce·OS 수준 reduced-motion 확인

handoff의 "알려진 한계"에 위 목록을 그대로 옮기고, 어떤 상태가 미검증인지 명시한다. 실제
브라우저 검증은 해당 도구가 있는 세션이나 사람이 수행해야 한다(부록의 체크리스트 참고).

---

## 하지 말 것

- 지적되지 않은 화면의 시각 디자인 변경. 이번 작업은 접근성 결함 5건과 테스트 2건에 한정한다.
- 새 색·타이포·간격 상수 도입. 기존 token/meta 모듈과 형제 요소의 패턴을 재사용한다.
- `src/app/flow/**`, `src/components/flow/**`, `/flow` 동작 변경
- `src/app/api/ai/route.ts` 수정 (현재 변경 0건 상태를 유지한다)
- Wave 3 reviewer 세션과 동시에 같은 파일 수정

## 완료 후 실행할 명령

```bash
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:quality
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
git diff --check
git status --short
```

수정이 한 건이라도 있었으므로 Wave 3 재검증은 **새 baseline에서 전부 다시** 수행한다.

## 부록 — 사람이 수행할 브라우저 검증 체크리스트

`npm run dev` 후 1440×900과 1920×1080(zoom 100%)에서 각각 확인한다.

| 화면 | 확인 |
|---|---|
| `/sop` Home | 로그인 전 `Task 기반 생성` 클릭 → `/sop/login` 이동. 현황·동료/과거 문서·승인 추적 카드 보존 |
| `/sop/login` | 필수 필드 누락 시 field-level 오류와 첫 오류로 focus 이동. 제목·필수 입력·주 버튼이 첫 화면에 보임 |
| `/sop/context` | Tab으로 textarea 도달 시 focus ring 보임. 스크린리더가 이름을 읽음(A11Y-2 수정 확인) |
| `/sop/recommendation` | 로딩 중 퍼센트·ETA 없음. 도움말 순환. reduced-motion에서 스피너 정지(A11Y-4). "Task 직접 찾기" 토글이 상태를 알림(A11Y-5) |
| `/sop/work-map/simple` | Activity 14개를 장문 확장 없이 훑을 수 있음. drawer focus trap·Esc·focus 복귀 |
| `/sop/work-map/detailed` | Skill 설명 편집 시 focus ring 보임(A11Y-1). Task 정의 textarea가 이름을 가짐(A11Y-3). 목록·상세 독립 스크롤 |
| 공통 | fixed footer가 마지막 항목을 가리지 않음. 선택·오류를 색만으로 구분하지 않음 |

## handoff에 포함할 것

1. 수정한 파일과 각 A11Y 항목의 before/after
2. 추가한 접근성 회귀 단언과 실행 결과
3. FUNC-1·FUNC-2 단언 내용과 결과
4. 작성한 `WAVE2_INTEGRATION_HANDOFF.md` 경로
5. 최종 명령 전체의 PASS/FAIL, 실패 시 원문 오류
6. 미검증으로 남긴 항목(항목 4) 목록

명시적 권한 없이는 commit·push하지 않는다.
