# 작업지시서 05 — Wave 1D 상세 Work Map

## 임무

확정된 Task의 정의와 Activity·Skill 상세 설명을 충분히 읽고 편집할 수 있는 고정보량 페이지를 구현한다. 간소화 페이지 코드는 구현하거나 import하지 않는다.

## 시작 조건

검증 완료된 Wave 0 Foundation commit에서 분기한 전용 worktree에서 시작한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 완료하고 Foundation handoff의 공용 Work Map API를 확인한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

구현 전에 Claude의 실제 디자인 검토 기능 또는 디자인 skill로 master–detail, 긴 설명, 편집 모드의 인지 부하를 검토한다. 기능명과 반영 결정을 handoff에 남긴다.

## 배타적 소유 파일

```text
src/app/sop/work-map/detailed/page.tsx
src/components/sop/SopWorkMapDetailedView.tsx
src/components/sop/SopWorkMapActivityDetail.tsx
tests/sop-work-map-detailed.test.tsx
```

## 수정 금지

- Foundation Store/type/controller
- simple page·drawer·컴포넌트
- login/context/recommendation
- 기존 `WorkLibrarySelector`, Home, Gate
- 생성 backend와 `/flow`

## 충족할 계약

- `REQ-WM-001`~`REQ-WM-006`
- `INT-WM-001`~`INT-WM-003`
- `TST-STATE-006`
- `TST-WM-001`~`TST-WM-008` 중 detailed projection·mutation 범위
- `TST-UI-003`~`TST-UI-006`

## 구현 지시

- route guard는 authenticated + confirmed Task + Work Map draft를 요구한다.
- Task 이름과 정의 전문을 표시하고 편집할 수 있게 한다.
- Activity 목록과 선택 Activity 상세를 master–detail로 분리한다.
- 선택 Activity의 이름·설명과 연결 Skill의 이름·설명을 전문으로 표시하고 편집한다.
- add/delete/reorder와 Skill 관계 편집은 Foundation mutation만 사용한다.
- Activity 14개와 Activity별 Skill 5개인 representative fixture가 정상 동작해야 하지만 5개를 고정 상한으로 만들지 않는다.
- 간소화 보기 링크는 `/sop/work-map/simple`로 이동하며 상태를 변형하지 않는다.
- `검토 완료`는 Foundation validation·confirmation을 사용하고 `/sop/setup` integration seam으로 연결한다. 생성 코드를 복제하지 않는다.
- 선택 Activity 삭제 후 focus와 selection을 결정론적으로 다음 유효 Activity에 둔다.
- 긴 설명은 읽기 가능한 line length와 내부 scroll 경계를 사용하고 nested scroll을 최소화한다.

## 디자인 수용 기준

- 목록에서 Activity를 바꾸면 상세 heading으로 screen-reader 문맥이 갱신된다.
- 선택 상태를 색상만으로 표현하지 않는다.
- keyboard로 Activity 선택, 필드 편집, simple 전환, 완료가 가능하다.
- fixed footer가 마지막 Skill과 action을 가리지 않는다.
- 1440×900과 1920×1080 모두에서 Task/Activity/Skill 위계가 명확하다.

## 수용 검증

- Activity 14개와 관계 70개가 손실 없이 master–detail에 대응한다.
- 선택 Activity의 Skill 5개 설명을 읽고 편집할 수 있다.
- Skill 수가 달라도 유효 이름이면 저장된다.
- detailed에서 바꾼 Skill 설명이 Foundation draft에 반영된다.
- add/delete/reorder가 confirmation을 해제한다.
- simple route 전환은 draft를 변경하지 않는다.
- 마지막 item·긴 설명·선택 item 삭제 시 scroll/focus를 검사한다.

```bash
npx tsx tests/sop-work-map-detailed.test.tsx
npx tsc --noEmit
npm run lint
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식을 따른다. viewport별 시각 증거, focus/scroll 결과, Foundation API 사용 목록, 실제 Claude 디자인 기능을 추가한다. simple 세션 파일을 참조하거나 수정하지 않았음을 명시한다.

명시적 권한 없이는 commit·push하지 않는다.
