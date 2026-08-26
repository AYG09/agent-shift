# W4 통합 전 접근성 기준선 (실측)

이 문서는 **W4 통합 이전** 프로덕션 상태에서 실제 브라우저로 측정한 접근성 기준선이다.
W4-05는 통합 후 같은 항목을 다시 측정해 **회귀가 없는지** 대조한다.

## 측정 조건

| 항목 | 값 |
|---|---|
| 대상 | `https://agent-shift-tau.vercel.app` (프로덕션) |
| 코드 baseline | `ae1297b` (W4 변경 반영 전) |
| 측정 도구 | `playwright` MCP, `chrome-devtools` MCP |
| viewport | 1440×900 |
| 측정자 | 실행 관리자 세션 |
| 측정 시점 | 2026-08-26 |

3A 보완(`3A_DESIGN_VERIFICATION.md`)에서 코드로만 검증하고 브라우저 실증이 미완이던 5건을
모두 닫았다. Wave 3부터 열려 있던 "실제 브라우저 미검증" 공백은 이 측정으로 해소됐다.

## 측정 결과 — 5건 전부 PASS

### A11Y-1 — Work Map 상세의 Skill 설명 focus 표시

`/sop/work-map/detailed`의 Skill 설명 textarea.

```json
{ "placeholder": "Skill 설명", "wrappedInLabel": true,
  "focusClasses": "focus:ring-1 focus:ring-indigo-500" }
```

`outline-none`만 있던 상태가 해소됐다. 추가로 `sr-only` 라벨이 있어 accessible name도 갖는다.
같은 화면의 Task 정의·Activity 설명 textarea는 `focus:border-indigo-500 focus:outline-none
focus:ring-1 focus:ring-indigo-500`로 형제 패턴을 유지한다.

### A11Y-2 — 업무맥락 textarea의 accessible name

`/sop/context`의 접근성 트리:

```yaml
textbox "지금 하고 있는 일과 업무 맥락을 알려주세요"
```

`<h1 id="sop-context-heading">` ← `aria-labelledby`로 연결된 결과다. 이름 없는 textbox가 아니다.

### A11Y-3 — Task 정의 라벨과 Task명 오류 연결

정의 textarea는 `<label>`로 감싸여 있다(`labelText: "TASK 정의 (전문)…"`). Task명을 비우고
`검토 완료`를 눌러 검증 실패를 실제로 유발했을 때:

```json
{ "errorNodeExists": true, "errorText": "Task명을 입력하세요.",
  "errorRole": "alert", "inputWired": true,
  "inputAriaInvalid": "true", "focusedIsTaskName": true }
```

오류 문단이 `role="alert"`이고 `aria-describedby`로 입력에 연결되며, **focus까지 해당 입력으로
이동**한다.

### A11Y-4 — 로딩 스피너의 reduced-motion 대응

`prefers-reduced-motion: reduce`를 문서 생성 시점에 주입하고(`initScript`로 `matchMedia`
스텁), 추천 API 응답을 지연시켜 pending 상태를 유지한 뒤 측정:

```json
{ "reducedMotionActive": true, "loading": true,
  "spinnerClass": "lucide lucide-loader-circle h-7 w-7",
  "tipClasses": ["…", "…", "min-h-[2.5rem] max-w-md text-xs leading-relaxed text-zinc-700 "] }
```

스피너에 `animate-spin`이 **없고**, tip 문단에도 `transition-opacity`가 **없다**. 두 애니메이션
모두 억제된다.

측정 방법 주의: OS 수준 설정이 아니라 `matchMedia` 스텁이다. 컴포넌트가
`useSyncExternalStore`로 media query 결과를 읽으므로 **컴포넌트가 그 결과를 존중하는지**는
증명되지만, OS 설정이 브라우저까지 전파되는 경로 자체는 이 측정 범위 밖이다.

### A11Y-5 — "Task 직접 찾기" 토글의 `aria-expanded`

`/sop/recommendation`의 오류 상태에서 측정:

```json
접기: { "ariaExpanded": "false", "ariaControls": "sop-manual-task-search-section" }
펼침: { "ariaExpanded": "true",  "controlledSectionExists": true,
        "sectionLabel": "Task 직접 검색" }
```

`aria-controls`가 실재하는 `<section id="sop-manual-task-search-section">`을 가리킨다.

## 함께 확인된 흐름 동작 (기준선)

측정 중 전체 경로가 실제로 동작함이 확인됐다. W4 통합 후에도 유지되어야 한다.

- 로그인 → `/sop/context` 전이
- 업무맥락 제출 → `/sop/recommendation` 전이
- **추천 실패 시 입력 보존 + 수동 Task 검색으로 복구** (`TST-REC-005`)
- 수동 선택으로 `채용 프로세스 운영 및 최적화` 확정 → `/sop/work-map/simple` 진입
- 상세 뷰에서 Task/Activity/Skill 편집 가능, 검증 실패 시 첫 오류로 focus 이동

## W4-05가 알아야 할 환경 제약

**프로덕션에 AI API KEY가 등록되어 있지 않다.** 추천 요청은 항상 다음으로 끝난다.

```text
AI Task 추천을 받아오지 못했습니다
AI Task 추천을 위해 API KEY를 등록해 주세요. Task는 직접 검색해 선택할 수 있습니다.
```

오류 처리·복구 경로는 정상이지만 **추천 성공 경로는 이 상태로 검증할 수 없다.** W4-05가
성공 경로까지 봐야 한다면 BYOK 키를 입력하거나 `vercel env`로 키를 설정한 preview 배포에서
확인한다. 프로덕션(`main`)에 올려서 확인하지 않는다.

## 대조 방법

W4-05는 통합 후 같은 5건을 같은 방식으로 측정하고, 위 값과 **다른 결과가 나오면 회귀로
보고**한다. 특히 다음이 이번 라운드에서 깨지기 쉽다.

- W4-03B가 Home의 시작점 카드를 재구성하면서 새 색·타이포 상수를 도입하지 않았는지
- 복제 경로가 Work Map(simple)로 합류하면서 A11Y-1/3의 상세 뷰 접근성이 유지되는지
- 착지 판정 이동이 추가되면서 `/sop/context`의 A11Y-2가 영향받지 않는지

측정에 쓴 도구 호출은 재현 가능하다. `chrome-devtools`의 `navigate_page`에 `initScript`로
`matchMedia`를 스텁하고, 추천 fetch를 지연시켜 pending 상태를 붙잡는 방식이다.
