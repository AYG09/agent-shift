# 작업지시서 W4-02A — 앱 랜딩 입구 교체 (완전 독립)

## 임무

앱 최상단 랜딩의 SOP 진입 버튼이 옛 혼합 화면(`/sop/setup`)을 하드코딩하는 것을 고친다.
이 세션은 Foundation 산출물을 전혀 사용하지 않으므로 **W4-01과 동시에 시작할 수 있다.**

## 시작 조건

`W4_00_MASTER_PARALLEL.md`를 읽는다. `AGENTS.md`, `CLAUDE.md`도 읽는다. 이 작업은 SOP 도메인
계약을 바꾸지 않지만, 수정 대상 파일이 `/flow` 제품 홈이므로 범위 규칙을 반드시 지켜야 한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## 배타적 소유 파일

```text
src/app/page.tsx
```

이 한 파일만 수정한다. 다른 파일은 한 줄도 건드리지 않는다.

## 문제

`src/app/page.tsx`의 `SOP Prototype (독립 SOP 생성 & 검토) →` 버튼이 다음과 같다.

```tsx
onClick={() => router.push('/sop/setup')}
```

`/sop/setup`은 새 흐름을 거치지 않은 세션에게 **legacy 전체 편집기**를 보여주도록 설계된
호환 경로다(Wave 2 통합 결정). 따라서 이 버튼으로 들어온 사용자는 재설계 이전 화면을 첫
화면으로 보게 된다. `08_WAVE2_INTEGRATION.md` §통합 지시 1의 "비로그인 사용자의 첫 Task 생성
진입은 `/sop/login`"을 이 입구가 우회하고 있다.

## 구현 지시

목적지를 `/sop`로 바꾼다.

```tsx
onClick={() => router.push('/sop')}
```

- `/sop/login`으로 직접 보내지 마라. Home(`/sop`)이 세션 상태를 보고 착지점을 판정하는
  구조이며(W4-01/W4-03B), 여기서 목적지를 다시 하드코딩하면 같은 종류의 결함을 재생산한다.
- 버튼 라벨·아이콘·스타일은 바꾸지 않는다. 이번 변경은 목적지 한 줄이다.
- 왜 `/sop/setup`이 아니라 `/sop`인지 짧은 주석을 남긴다 — 다음 사람이 "구 화면으로 가는
  지름길"이라고 오해하고 되돌리지 않도록.
- `/flow` 관련 동작(프로젝트 생성·열기·삭제·이름 변경, `router.push('/flow')`)은 일절
  건드리지 않는다.

## 수용 검증

이 파일은 `navigate`를 prop으로 받지 않고 `useRouter()`를 직접 사용하므로, 라우터를 주입한
컴포넌트 테스트를 새로 만들 수 없다. **없는 테스트를 억지로 만들지 말고** 다음으로 검증한다.

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run verify:sop-customer
git diff --check
git status --short
```

`npm run build` 성공과 `git diff`가 정확히 한 줄(+주석)임을 확인한다. 실제 클릭 동작은
W4-05 통합 세션의 브라우저 확인 항목으로 넘긴다.

## 금지

- `src/app/page.tsx` 외 모든 파일
- `/flow` 동작 변경
- 버튼을 `/sop/login`·`/sop/context` 등 특정 단계로 직접 연결하는 것
- 랜딩 페이지의 다른 UI 개선(범위 밖이며 W4-05 통합을 어렵게 만든다)

## 인계

마스터 HANDOFF 형식을 따른다. `git diff` 전문을 그대로 첨부한다(짧으므로). `/flow` 관련 코드
변경 0건임을 명시한다.
