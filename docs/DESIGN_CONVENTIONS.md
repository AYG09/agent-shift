# 프론트엔드 디자인 컨벤션

`src/**`의 화면·컴포넌트가 따르는 디자인 규격. 새 화면·컴포넌트는 이 표를 따르고,
여기서 벗어나야 하면 이 문서를 먼저 갱신한다. 반복 요소의 실제 클래스 문자열은
코드의 meta/토큰 모듈이 원천이다(이 문서는 "무엇을 어디에 쓰는가", 코드는
"정확한 클래스"를 담당).

## 1. 색상 의미 체계

| 색 | 의미 |
|---|---|
| `indigo` | 주요 액션 · 선택 상태 |
| `emerald` | 승인 · 완료 · 시작(start) |
| `rose` | 삭제 · 반려 · 오류 · 종료(end) |
| `amber` | 주의 · 미완료 · 실패 안내 |
| `violet` | 강조 보조 색 |
| `zinc` | 중립 텍스트 · 테두리 · 배경 |
| `blue` | 정보 · 진행 중 상태 |

같은 의미에 다른 색을 쓰지 않는다 (예: 삭제 버튼에 amber 금지).

## 2. 타이포그래피 스케일

| 용도 | 클래스 |
|---|---|
| 화면 제목(헤더 h1) | `text-base font-semibold` |
| 카드/섹션 제목 | `text-sm font-bold` (큰 카드는 `text-base font-bold`) |
| 본문·입력 | `text-xs` |
| 보조 설명 | `text-[11px] text-zinc-500` |
| 라벨·배지·칩 | `text-[10px]`~`text-[11px] font-semibold/bold` (최소 `text-[9px]`) |

## 3. 컨테이너 규격

| 요소 | 규격 |
|---|---|
| 페이지 배경 | `bg-slate-50` (workspace는 `bg-zinc-50/50`) |
| 상단 헤더 | `sticky top-0 z-30 h-14 bg-white border-b border-zinc-200 shadow-2xs`, 내부 `max-w-[1440px] px-6` |
| 1급 카드 | `rounded-2xl border border-zinc-200 bg-white p-4~5 shadow-sm` |
| 2급 카드·행 | `rounded-xl border p-2.5~3` |
| 배지/칩 | `rounded`/`rounded-md` + `px-1.5 py-0.5` + §1 의미 색, 반드시 `shrink-0 whitespace-nowrap` (글자 세로 꺾임 방지) |
| 긴 텍스트 | `min-w-0` + `truncate` + `title` 속성으로 전체 텍스트 제공 |

## 4. 밀도 원칙 (아코디언)

- **읽기 전용 정보·선택 기능은 기본 접힘**, 핵심 요약은 접힌 헤더에 상시 표시한다.
- 인스펙터류 패널은 제목 + 현재 값 요약 칩 + `aria-expanded`를 갖추고, 접힘
  상태에서도 children은 마운트 유지(CSS `hidden`)한다.
- **조치가 필요한 상태는 자동 펼침 + attention 톤**(amber)으로 숨김을 금지한다.
- 목록이 10행을 넘으면 그룹핑(+접기)을 검토한다.

## 5. 반복 요소는 원천 모듈로만

반복 UI 요소(상태 배지, 칩, 코드/번호 포맷 등)의 클래스 문자열·라벨은 화면마다
다시 조립하지 않고 `src/lib`의 meta/토큰 모듈에서 가져와 쓴다.

## 6. 상호작용 규칙

- 비활성화된 액션에는 이유를 `title`로 제공한다.
- 파괴적 액션(삭제)은 rose 톤 + 보호 조건을 UI에서 설명한다.
- 토글류는 `aria-expanded`/`aria-pressed`/`aria-current`를 제공한다.
