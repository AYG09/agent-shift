# 작업지시서 W4-04C — 복제 경로를 Work Map 파이프라인에 합류

## 임무

동료 SOP 복제와 과거 문서 복제가 Work Map 편집 단계를 건너뛰고 `/sop/workspace`로 직행하는
것을 고쳐, 세 생성 경로가 하나의 파이프라인으로 합류하게 한다.

## 시작 조건

W4-01 Foundation handoff를 받은 뒤 시작한다. `W4_00_MASTER_PARALLEL.md`,
`W4_01_FOUNDATION.md`, 갱신된 `SPEC.md`, SOP repository skill과 필수 reference 5개
(특히 `final-system-scenario-contract.md` §2.3·§2.4와
`member-home-subaction-contract.md` §2.3)를 읽는다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## 배타적 소유 파일

```text
src/components/sop/SopColleagueTemplatePicker.tsx
src/components/sop/SopOwnPriorPicker.tsx
src/lib/sop-setup-actions.ts
tests/sop-clone-work-map-entry.test.tsx        # 신규
```

## 문제

두 picker가 복제 직후 `navigate('/sop/workspace')`로 직행한다
([SopColleagueTemplatePicker.tsx:82](../../../src/components/sop/SopColleagueTemplatePicker.tsx),
[SopOwnPriorPicker.tsx:70](../../../src/components/sop/SopOwnPriorPicker.tsx)).
따라서 복제본에서는 Activity·Skill을 편집할 방법이 없다. 그런데 확정 고객 요구는 다음과 같다.

- §2.3 동료 SOP 기반: "동료가 작성 완료한 **Work Map과 SOP**를 읽기 전용으로 미리 본다 …
  **Activity와 이후 SOP 내용을** 자신의 업무에 맞게 수정·삭제·추가한다"
- §2.4 기존 작성 기반: 선택 기록을 새 독립 초안으로 불러온 뒤 "공통 편집 흐름"을 사용한다

## 구현 지시

### 1. 복제 직후 Work Map 초안을 채택한다

두 picker 모두 복제 성공 시:

1. 기존대로 독립 문서를 만들고 Store에 넣는다(현재 동작 유지 — 새 ID, 소유권, 승인·검토·
   Agent화 상태 초기화, 동료 개인정보 미복사).
2. W4-01이 제공한 `adoptClonedWorkMap(document)`를 호출한다. `origin`은 동료 경로가
   `'colleague-template'`, 과거 경로가 `'own-prior'`다.
3. 성공하면 `/sop/work-map/simple`로 이동한다.
4. **실패하면(`false`) 기존대로 `/sop/workspace`로 이동한다.** 복제된 문서의 workLibrary
   스냅샷에 선택 Task가 없는 legacy 기록이 있을 수 있고, 그 경우 복제 자체를 실패로 만들면
   안 된다. 이 fallback을 코드 주석으로 남긴다.

문서 생성·정제 로직은 그대로 둔다. 이번 변경은 **복제 이후 어디로 가는가**와 초안 채택뿐이다.

### 2. 완료 동작을 출처에 따라 분기한다

`sop-setup-actions.ts`의 `confirmWorkMapAndProceed`가 지금은 항상 `/sop/setup`(생성 단계)으로
보낸다. 복제본은 **이미 완성된 SOP를 갖고 있으므로 재생성하면 원본 내용이 사라진다.**

- `origin === 'task-recommendation'` → 현재 동작 유지(`setWorkLibrary` 후 `/sop/setup`).
- `origin`이 복제 계열 → `setWorkLibrary`는 그대로 호출하되(이후 생성 범위 일관성 유지)
  `/sop/workspace`로 이동한다. **생성 API를 호출하지 않는다.**
- **호출 시그니처 `{ confirmWorkMap, setWorkLibrary, navigate }`를 바꾸지 마라.** Work Map
  뷰 두 개가 이 형태로 호출하며 그 파일은 수정 금지다. `origin`은
  `confirmWorkMap()`이 돌려주는 `result.draft`에서 읽는다.
- `origin`이 없는 legacy 초안은 W4-01의 규칙대로 `'task-recommendation'`으로 간주한다.

복제본을 일부러 재생성하고 싶은 경우는 이번 범위가 아니다. 기존 `/sop/setup` 경로가 그대로
남아 있으므로 그 요구가 확정되면 그때 다룬다.

## 금지

- picker의 props 시그니처 변경 (W4-03B가 계약대로 마운트한다)
- `SopMemberHome.tsx`, `src/app/sop/page.tsx`, 로그인 게이트 수정 — W4-03B 소유
- Work Map 뷰(`SopWorkMapSimpleView.tsx`, `SopWorkMapDetailedView.tsx`)와 `SopSetupGate.tsx` 수정
- Foundation 도메인·Store 수정 (부족하면 `FOUNDATION_CHANGE_REQUEST`)
- 라우트 가드 완화
- 동료 복제의 개인정보 제거·승인 상태 초기화 규칙 완화
- 복제 결과를 자동 확정하거나 승인 상태를 바꾸는 것

## 수용 검증

`tests/sop-clone-work-map-entry.test.tsx`(신규)에 실행 가능한 단언을 넣는다. 소스 문자열
검색으로 대체하지 않는다.

- 동료 템플릿 복제 성공 → `workMapDraft`가 생기고 `origin === 'colleague-template'`이며
  `/sop/work-map/simple`로 이동한다
- 과거 문서 복제 성공 → `origin === 'own-prior'`, 같은 경로로 이동한다
- 복제 후 Work Map route 가드가 통과한다(W4-01이 확정 context를 채웠기 때문)
- 복제된 초안을 편집해도 **원본 record/문서가 변하지 않는다**
- 동료 복제본에 원본 구성원의 이름·사번·조직·피드백이 없다(기존 계약 회귀 방지)
- 복제본의 승인·검토·Agent화 확정 상태가 초기화되어 있다(기존 계약 회귀 방지)
- workLibrary 스냅샷에서 Task를 찾을 수 없는 문서는 `/sop/workspace`로 fallback 이동한다
- `confirmWorkMapAndProceed`: `origin`이 복제 계열이면 `/sop/workspace`로 가고 생성이
  호출되지 않는다 / `'task-recommendation'`이면 기존대로 `/sop/setup`으로 간다 /
  `origin` 없는 초안은 `'task-recommendation'`으로 취급된다

```bash
npx tsx tests/sop-clone-work-map-entry.test.tsx
npx tsx tests/sop-member-home.test.ts
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

`tests/sop-member-home.test.ts`는 **읽기·실행만** 한다(W4-03B 소유). 그 테스트가 이번 변경으로
깨지면 고치지 말고 통합 요청으로 보고한다.

## 인계

마스터 HANDOFF 형식에 더해 다음을 기록한다.

1. 두 picker의 복제 후 흐름 변경 전/후
2. `confirmWorkMapAndProceed`의 출처별 분기 진리표
3. Task를 찾을 수 없는 legacy 문서의 fallback 동작과 그 근거
4. 개인정보 제거·상태 초기화 계약이 회귀하지 않았다는 테스트 증거
5. `tests/sop-member-home.test.ts` 실행 결과 (수정하지 않았음을 함께 명시)
