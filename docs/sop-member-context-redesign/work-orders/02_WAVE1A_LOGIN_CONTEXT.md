# 작업지시서 02 — Wave 1A 로그인·업무맥락

## 임무

구성원이 Task를 보기 전에 prototype 로그인 게이트를 통과하고, 로그인 후 하나의 업무맥락을 작성·확정하는 두 화면을 구현한다. 추천 호출과 추천 결과 UI는 이 세션의 책임이 아니다.

## 시작 조건

검증 완료된 Wave 0 Foundation commit에서 분기한 전용 worktree에서만 시작한다. `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 모두 수행하고 Foundation handoff의 member intake API를 확인한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

구현 전에 Claude 환경에서 실제 제공되는 디자인 검토 기능 또는 디자인 skill을 호출해 로그인·업무맥락 화면의 정보 위계와 밀도를 검토한다. 기능명, 핵심 제안, 채택·기각 이유를 handoff에 남긴다. 사용할 수 없으면 `DESIGN_CAPABILITY_BLOCKED`로 보고하고 사용했다고 주장하지 않는다.

## 배타적 소유 파일

```text
src/app/sop/login/page.tsx
src/app/sop/context/page.tsx
src/components/sop/SopMemberLoginGate.tsx
src/components/sop/SopMemberContextForm.tsx
tests/sop-member-login-context.test.tsx
```

## 수정 금지

- Store, schema, domain controller 등 Foundation 소유 파일
- `/sop/recommendation`과 추천 API·컴포넌트
- simple/detailed Work Map
- 기존 Home/Gate/WorkLibrarySelector
- 생성 prompt·runner와 `src/app/api/ai/route.ts`
- `/flow`

공용 API가 부족하면 복제 구현하지 말고 `FOUNDATION_CHANGE_REQUEST`를 작성한다.

## 충족할 계약

- `REQ-AUTH-001`~`REQ-AUTH-003`
- `INT-AUTH-001`, `INT-AUTH-002`
- `REQ-CTX-001`~`REQ-CTX-004`
- `INT-CTX-001`, `INT-CTX-002`
- `TST-STATE-001`, `TST-STATE-002`
- `TST-REC-001`
- `TST-UI-001`, `TST-UI-006` 중 로그인·context 범위

## 구현 지시

### 로그인 화면

- 첫 생성 진입에서 사번, 이름, 조직, 주요 직무를 필수로 받고 직급은 선택으로 둔다.
- primary action은 하나만 두고 `로그인하고 업무 작성 시작`처럼 결과를 명시한다.
- 이 화면이 실제 계정 인증이 아닌 prototype gate임을 평이하게 밝힌다.
- field error는 해당 입력과 연결하고 첫 오류로 focus를 이동한다.
- 유효 제출 시 Foundation의 session action만 호출하고 `/sop/context`로 이동한다.
- 이미 authenticated면 context 또는 기존 Home으로 안전하게 안내한다.

### 업무맥락 화면

- 화면의 유일한 주 과업은 현재 수행 업무와 맥락 작성이다.
- 실제 업무, 순서, 승인·판단, 예외·재작업, 도구, 협업 대상을 작성하도록 placeholder·짧은 도움말을 제공한다.
- 보조 prompt chip은 최대 3개 그룹의 progressive disclosure로 두며 본문 textarea보다 우선하지 않는다.
- 공백만 있는 입력은 거부한다. 고객이 정하지 않은 글자 수 상한은 만들지 않는다.
- primary action은 `입력 완료 · Task 추천 받기`로 둔다.
- 제출 시 Foundation의 단일 context를 확정하고 recommendation-pending 전이를 만든 뒤 `/sop/recommendation`으로 이동한다.
- 추천 API는 이 화면에서 호출하지 않는다. Session B가 recommendation route에서 pending 상태를 소비해 한 번 호출한다.
- 새로고침·뒤로가기 후 작성 중 입력 보존을 기존 prototype Store 정책에 맞춘다.

## 디자인 수용 기준

- 1440×900에서 제목, 필수 입력, primary action이 첫 viewport에 보인다.
- 1920×1080에서 content width가 무한히 늘어나지 않는다.
- 기존 `DESIGN_CONVENTIONS.md` token과 meta 모듈을 사용하고 임의 색상·타이포 상수를 만들지 않는다.
- 키보드 tab 순서, label, error description, focus가 유효하다.
- 로그인과 context에 Task Library editor, AI 모델 설정, 생성 고급 설정을 넣지 않는다.

## 수용 검증

테스트에 최소 다음을 포함한다.

- anonymous direct context 접근은 login으로 보호된다.
- 필수 identity 누락은 session을 만들지 않는다.
- 유효 identity는 context route로 전이한다.
- 공백 context는 recommendation 상태·navigation을 만들지 않는다.
- 유효 context는 단일 authoritative field에 저장되고 recommendation-pending과 navigation을 만든다.
- 이 세션 UI는 추천 API를 직접 호출하지 않는다.

```bash
npx tsx tests/sop-member-login-context.test.tsx
npx tsc --noEmit
npm run lint
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식을 따른다. 두 route의 상태별 스크린샷 또는 실제 브라우저 확인 결과, 사용한 Claude 디자인 기능, Foundation public API 호출 목록을 추가한다. 소유 파일 밖 변경은 0건이어야 한다.

명시적 권한 없이는 commit·push하지 않는다.
