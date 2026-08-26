# 작업지시서 W4-03B — Home 착지 판정과 시작점 선택 IA

## 임무

Home을 **없애지 않고**, 등장 시점을 상태로 결정하게 만든다. 그리고 세 생성 경로를 서로 다른
경험이 아니라 **하나의 파이프라인에 들어가는 시작점 선택**으로 재구성한다.

## 시작 조건

W4-01 Foundation handoff를 받은 뒤 시작한다. `W4_00_MASTER_PARALLEL.md`,
`W4_01_FOUNDATION.md`, 갱신된 `SPEC.md`·`CONTEXT.md`, `WAVE0_FOUNDATION_HANDOFF.md`,
그리고 SOP repository skill과 필수 reference를 읽는다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

구현 전에 **디자인 능력을 실제로 호출한다**(`W4_00_MASTER_PARALLEL.md`의 "사용 가능한
디자인·브라우저 능력" 참고). 최소한 `frontend-design` 스킬로 시작점 그룹의 정보 위계와 카드
밀도를 검토하고, 필요하면 `claude-design` MCP로 시안을 만들어 비교한다. 호출한 도구 이름,
받은 핵심 권고, 채택·기각 이유를 handoff에 남긴다.

구현 후에는 `playwright` 또는 `chrome-devtools` MCP로 **실제 브라우저에서 확인한다** —
1440×900과 1920×1080에서 Home을 렌더하고, 접근성 트리 스냅샷으로 신원 5개·상태별 건수·
T/A/S 수·시작점 4장이 모두 잡히는지 본다. `chrome-devtools-mcp:a11y-debugging`으로 키보드
이동과 focus 표시도 확인한다.

도구가 실제로 실패한 경우에만 그 사유와 원문 오류를 적는다. 호출하지 않고
`DESIGN_CAPABILITY_BLOCKED`를 쓰지 마라.

## 배타적 소유 파일

```text
src/components/sop/SopMemberHome.tsx
src/app/sop/page.tsx
src/components/sop/SopMemberLoginGate.tsx
tests/sop-member-home.test.ts
```

## 충족할 계약

- `final-system-scenario-contract.md` §2.1 (첫 화면 표시 항목 전부 보존)
- §2.5 (상태 추적·반려 피드백·수정·재요청이 Home에서 가능해야 함)
- W4-01이 부여한 `INT-LAND-001`
- 기존 `TST-STATE-001`, `TST-STATE-002` 회귀 없음

## 구현 지시

### 1. 착지 판정을 Home에 배선한다

- `resolveMemberLandingRoute`(W4-01)를 사용한다. 판정 로직을 컴포넌트 안에서 다시 만들지 마라.
- `hasStoredRecords`는 Home이 이미 조회하는 member record 목록에서 파생한다. 새 API를 만들지
  않는다.
- **hydration이 끝나기 전에는 이동하지 않는다.** 복원 전 `memberSession`은 기본값
  `anonymous`라 신뢰할 수 없다. 기존 `useSopStoreHydrated()`를 쓴다.
- 로그인 게이트의 "계속 진행" 동작도 같은 함수를 쓰게 정렬한다. 두 곳이 서로 다른 판정을
  하면 "로그인 직후 위치"와 "Home 재방문 위치"가 어긋난다.

### 2. 신규 구성원이 빈 대시보드를 먼저 보지 않게 한다

- record 0건 + 진행 중 intake 없음인 인증 구성원이 `/sop`에 도달하면 `/sop/context`로 보낸다.
- **Home 자체를 삭제하거나 조건부로 렌더하지 않는다.** 이동은 판정 결과일 뿐이며, 구성원이
  직접 `/sop`로 돌아오는 경로(네비게이션·뒤로가기)는 계속 살아 있어야 한다. 무한 리다이렉트를
  만들지 않도록 이동은 명시적 진입 시점에만 수행한다.
- record가 생긴 뒤부터는 `/sop`가 정상 착지점이 된다.

### 3. 세 경로를 "시작점 선택"으로 재구성한다

현재 네 장의 카드가 서로 다른 기능처럼 보인다. 실제 차이는 **Work Map 초안을 만드는 방법**
하나뿐이라는 것이 화면에서 드러나야 한다.

- 세 활성 경로를 하나의 그룹으로 묶고, 각 카드가 "무엇을 시작점으로 삼는가"를 한 줄로
  설명하게 한다. 예: Task 기반 = 업무맥락을 쓰고 AI 추천을 받는다 / 동료 SOP 기반 = 승인된
  동료 SOP를 복제한다 / 기존 작성 기반 = 내 과거 기록을 복제한다.
- 세 경로 모두 이후 단계가 동일하다는 사실을 그룹 수준에서 한 번만 안내한다. 카드마다
  반복하지 않는다.
- 실무 자료 기반 카드는 비활성 `향후 제공 (TBD)`로 유지한다. 업로드 input·저장소·OCR을
  만들지 않는다.
- 한 화면 한 primary action 원칙을 지킨다. 세 카드가 동등한 시작점이므로 그중 하나만 시각적
  primary로 두되(Task 기반 권장), 나머지 둘이 부차적 기능처럼 보이지 않게 한다.

### 4. 보존해야 하는 것

- 신원 5개 항목(이름·사번·조직·직급·주요 직무) 표시
- 상태별 건수(작성 중 / 승인 요청 중 / 승인 완료 / 반려)와 T/A/S 수
- 승인 요청 버튼, 상태 행의 단계 구분(직책자/SME 검토 중), 반려 사유·피드백·`수정하기`
- 두 picker를 **고정 인터페이스 계약**대로 계속 마운트한다
  (`{ onClose, navigate, fetchImpl }`, own-prior는 `records` 추가). picker 내부는 W4-04C
  소유이므로 열지 마라.

## 디자인 수용 기준

- 1440×900에서 신원·상태 요약·시작점 그룹이 첫 viewport 안에 들어온다.
- 1920×1080에서 content width가 과도하게 늘어나지 않는다.
- 기존 `DESIGN_CONVENTIONS.md` token/meta 모듈만 사용한다. 새 색·타이포·간격 상수 금지.
- 상태를 색만으로 구분하지 않는다.
- 비활성 TBD 카드에 비활성 이유를 `title`로 제공한다.

## 수용 검증

`tests/sop-member-home.test.ts`에 실행 가능한 단언을 추가한다.

- 미인증 구성원이 Task 시작점을 누르면 `/sop/login`으로 간다
- record 0건 + 진행 없음인 인증 구성원의 `/sop` 진입이 `/sop/context`로 이어진다
- record 1건 이상이면 `/sop`에 머문다(이동 없음)
- 확정 context 또는 Work Map 초안이 있으면 그 진행 지점으로 복귀한다
- hydration 완료 전에는 어떤 이동도 발생하지 않는다
- 활성 시작점 3개와 비활성 TBD 1개가 렌더된다
- 신원 5개 항목·상태별 건수·T/A/S 수가 계속 렌더된다(회귀 방지)
- 두 picker가 계약된 props로 마운트된다

```bash
npx tsx tests/sop-member-home.test.ts
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

## 금지

- picker 내부 파일, `sop-setup-actions.ts`, Work Map 뷰, Setup Gate 수정
- Foundation 도메인 파일·Store 수정 (부족하면 `FOUNDATION_CHANGE_REQUEST`)
- Home 표시 항목 축소, 승인 추적 기능 제거
- 랜딩 페이지(`src/app/page.tsx`) 수정 — W4-02A 소유

## 인계

마스터 HANDOFF 형식에 더해 착지 판정 진리표(인증×record×진행 상태 → 목적지), 시작점 그룹의
시각 구조 결정과 근거, 실제 사용한 Claude 디자인 기능을 기록한다.
