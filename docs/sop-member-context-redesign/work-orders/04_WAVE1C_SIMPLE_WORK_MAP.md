# 작업지시서 04 — Wave 1C 간소화 Work Map

## 임무

확정된 Task의 Task–Activity–Skill 구조를 낮은 화면 밀도로 빠르게 검토하고, 필요할 때 전체 필드를 편집할 수 있는 간소화 페이지를 구현한다. 상세 페이지 코드는 구현하거나 import하지 않는다.

## 시작 조건

검증 완료된 Wave 0 Foundation commit에서 분기한 전용 worktree에서 시작한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 완료하고 Foundation handoff의 Work Map selector·mutation·validation API를 사용한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

구현 전에 Claude의 실제 디자인 검토 기능 또는 디자인 skill로 14개 Activity와 관계 70개를 저밀도로 탐색하는 패턴을 검토한다. 실제 기능명과 반영 결정을 handoff에 남긴다.

## 배타적 소유 파일

```text
src/app/sop/work-map/simple/page.tsx
src/components/sop/SopWorkMapSimpleView.tsx
src/components/sop/SopWorkMapSimpleEditDrawer.tsx
tests/sop-work-map-simple.test.tsx
```

## 수정 금지

- Foundation Store/type/controller
- detailed page와 detailed 컴포넌트
- login/context/recommendation
- 기존 `WorkLibrarySelector`, Home, Gate
- 생성 backend와 `/flow`

## 충족할 계약

- `REQ-WM-001`~`REQ-WM-006`
- `INT-WM-001`~`INT-WM-003`
- `TST-STATE-006`
- `TST-WM-001`~`TST-WM-008` 중 simple projection·mutation 범위
- `TST-UI-002`, `TST-UI-004`, `TST-UI-006`

## 구현 지시

- route guard는 authenticated + confirmed Task + Work Map draft를 요구한다. 미충족이면 Foundation이 정한 앞 단계로 이동한다.
- Task 이름과 한 줄 정의를 상단에 표시한다.
- Activity 14개를 한 화면에 모두 장문 확장하지 않는다. 한 줄 요약, 순서, 연결 Skill 이름을 빠르게 훑을 수 있게 한다.
- 간소화 본문에는 기존 source가 제공하는 정의를 압축 투영할 수 있지만, 존재하지 않는 short/detailed 필드를 발명하지 않는다.
- Activity와 Skill의 전체 설명 편집은 drawer에서 제공한다.
- drawer는 Task 이름·정의, Activity 이름·설명·순서, Skill 이름·설명을 수정할 수 있게 하고 add/delete/reorder도 Foundation mutation으로 수행한다.
- 모든 편집은 Foundation controller만 호출한다. 컴포넌트 내부에 별도 Store나 mutation 복사본을 만들지 않는다.
- 상세 보기 링크는 `/sop/work-map/detailed`로 이동하며 data를 복제·변환·확정하지 않는다.
- `검토 완료`는 Foundation validation과 confirmation을 호출한다. 기존 Task-wide 생성 연결은 `/sop/setup`의 integration seam만 사용하고 생성 로직을 이 세션에 복제하지 않는다.
- destructive delete에는 대상과 영향을 분명히 보여주고 기존 prototype 수준의 확인을 제공한다.

## 디자인 수용 기준

- 한 화면 한 primary action을 유지한다.
- 1440×900에서 Task 개요와 여러 Activity를 실제로 훑을 수 있다.
- 긴 Activity 14개를 모두 열린 accordion으로 만들지 않는다.
- drawer가 열렸을 때 focus trap·initial focus·Escape·focus return이 동작한다.
- fixed action 영역이 있다면 마지막 Activity를 가리지 않는다.
- 1920×1080에서 content width가 과도하게 넓어지지 않는다.

## 수용 검증

- representative fixture에서 Activity 14개와 Skill 관계 70개 ID가 손실 없이 렌더링된다.
- simple projection은 원본 순서를 유지한다.
- drawer에서 Activity명과 Skill 설명을 수정하면 Foundation draft가 즉시 바뀐다.
- add/delete/reorder는 confirmation을 해제한다.
- view 전환 링크는 Store를 변경하지 않는다.
- 원본 Task Library fixture는 변하지 않는다.
- drawer keyboard·focus 동작을 검사한다.

```bash
npx tsx tests/sop-work-map-simple.test.tsx
npx tsc --noEmit
npm run lint
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식을 따른다. 1440×900·1920×1080 시각 증거, drawer 접근성 결과, Foundation API 사용 목록, 실제 Claude 디자인 기능을 추가한다. detailed 세션 파일을 참조하거나 수정하지 않았음을 명시한다.

명시적 권한 없이는 commit·push하지 않는다.
