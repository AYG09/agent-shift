# 작업지시서 W4-05A — 통합 독립 검증 및 마감

## 1. 임무

W4-05 통합 결과를 handoff 서술이 아니라 현재 worktree의 실제 diff, 실행 가능한 테스트, 브라우저
동작으로 독립 재검증한다. 남은 검증 공백과 범위 예외를 닫고, 필요하면 현재 W4-05 변경 범위
안에서 발견된 결함을 최소 수정한다.

이 작업의 최종 산출 상태는 **사용자가 검토한 뒤 통합 커밋을 승인할 수 있는 release candidate**다.
이 작업지시서는 commit 또는 push 권한을 부여하지 않는다.

## 2. 현재 기준선 — 착수 시 반드시 다시 확인

W4-05 handoff 작성 당시 확인된 상태는 다음과 같다. 아래 값은 참고 기준선이며 현재 상태를
대체하지 않는다.

- 통합 worktree: `C:\Users\USER\Desktop\NOCODE\agent-shift`
- branch: `wave0/sop-foundation`
- 확인 당시 HEAD: `96395f5`
- remote 대비: `ahead 9`
- W4 코드 baseline: `ae1297b`
- tracked 수정: 17개
- 의도된 신규 파일: 2개
  - `src/server/flow/flow-prompts.ts`
  - `tests/sop-clone-work-map-entry.test.tsx`
- W4-05A 착수 문서: 이 파일 자체
  - `docs/sop-member-context-redesign/work-orders/W4_05A_CLOSEOUT_AUDIT.md`
- 통합 대상이 아닌 미추적 파일: `.claude/launch.json`

착수 직후 다음을 순서대로 실행하고 결과를 보존한다.

```text
git status --short --branch
git log -1 --oneline
git diff --name-status
git ls-files --others --exclude-standard
git diff --check
npm run verify:sop-customer
```

기준선과 다른 변경이 있더라도 reset, revert, checkout 덮어쓰기, clean을 사용하지 않는다. 다른
writer가 여전히 수정 중이거나 같은 파일이 작업 중이라고 판단되면 즉시 편집을 멈추고
`LIVE_FILE_CONFLICT`로 보고한다. 충돌 선택 창이 나오면 `Pause and wait`를 선택한다.

## 3. 필수 선행 문서

계획이나 편집 전에 다음을 모두 끝까지 읽는다.

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.agents/skills/implement-sop-customer-requirements/SKILL.md`
4. 위 skill이 지정한 reference 5개
5. `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`
6. `docs/QUALITY_CONVENTIONS.md`
7. `docs/DESIGN_CONVENTIONS.md`
8. `docs/sop-member-context-redesign/SPEC.md`
9. `docs/sop-member-context-redesign/CONTEXT.md`
10. `docs/sop-member-context-redesign/work-orders/W4_00_MASTER_PARALLEL.md`
11. `docs/sop-member-context-redesign/work-orders/W4_05_INTEGRATION.md`
12. `docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md`
13. 이 작업지시서

읽은 뒤 실제 코드를 기준으로 짧은 실행 계획을 작성한다. 계획에는 `검증된 사실`, `W4-05
구현 해석`, `아직 닫히지 않은 항목`을 구분한다.

## 4. 작업 범위

### 4.1 반드시 수행할 일

1. W4-05 changed-file 전체와 untracked 파일을 분류한다.
2. W4-05 handoff에 기록된 세 브라우저 결함 수정이 실제 코드와 회귀 테스트에 존재하는지
   확인한다.
3. 예외 범위 변경 두 건과 `/api/ai` prompt 이동을 독립 검토한다.
4. 전체 자동 검증 게이트를 새로 실행한다.
5. 브라우저 핵심 흐름과 접근성 기준선을 다시 확인한다.
6. 아직 미완료였던 **처음부터 끝까지 이어지는 키보드 전용 여정**을 실제로 수행한다.
7. 실패가 현재 W4-05 diff에서 발생했고 기존 변경 범위 안에서 고칠 수 있으면 최소 수정하고
   관련 테스트와 전체 게이트를 다시 실행한다.
8. 최종 changed-file manifest와 커밋 포함/제외 제안 목록을 작성한다.

### 4.2 수정 금지

다음은 이번 closeout에서 변경하지 않는다.

- `src/app/flow/**`
- `src/components/flow/**`
- `src/components/sop/SopWorkMapSimpleView.tsx`
- `src/components/sop/SopWorkMapDetailedView.tsx`
- `src/components/sop/SopSetupGate.tsx`
- 승인, HR, Activity–Sub Action, Agent화의 확정 계약
- 고객 fixture와 seed 의미
- 기존 commit history
- `.claude/launch.json`

`src/app/api/ai/route.ts`, `src/server/flow/flow-prompts.ts`, `tests/flow-branches.test.ts`는 W4-05에서
승인된 예외 범위다. 새 동작을 만들지 말고 기존 prompt의 무동작변경 이동과 회귀 검증만 한다.

### 4.3 금지 작업

- `git reset`, `git revert`, `git checkout --`, `git clean`, rebase, amend, history rewrite
- `.claude/` 삭제 또는 커밋 대상 편입
- 테스트를 통과시키기 위한 assertion 삭제·완화·skip
- 보호 경로를 수정해서 SOP 문제를 우회
- production `main` 배포 또는 production 환경 변경
- API key, 비밀값, 사용자 자격증명 출력
- `browser_run_code_unsafe` 사용
- 명시적 승인 없는 `git add`, commit, push
- 동일 dirty worktree에서 다른 모델이나 sub-agent와 동시 편집

## 5. 독립 검토 항목

### 5.1 브라우저 발견 결함 3건

각 결함은 구현과 실행 가능한 회귀 테스트를 함께 확인한다.

1. `submitMemberIdentity`는 이전 샘플 `memberInfo`와 병합하지 않고 로그인 신원을 완전 교체한다.
   `id`가 없는 정상 로그인 입력에서도 샘플 사용자 ID가 남지 않아야 한다.
2. `SopMemberHome`은 Store hydration 완료 전에 record를 조회하거나 착지 경로를 확정하지 않는다.
   record 보유 구성원이 `/sop/context`로 잘못 이동하지 않아야 한다.
3. 동료 템플릿 clone 요청 본문은 `memberId()` fallback으로 `member.id`를 정규화한다. 정상 로그인
   입력처럼 원본에 `id`가 없어도 400이 나지 않아야 하며, actor header와 body member identity가
   일치해야 한다.

소스 문자열 존재만으로 통과 처리하지 않는다. 연결된 domain/component/orchestration 테스트를
실행하고 브라우저에서 관련 흐름을 확인한다.

### 5.2 검증 스크립트 변경

`.agents/skills/implement-sop-customer-requirements/scripts/verify-sop-customer.mjs` diff를 줄 단위로
검토한다.

- `tests/flow-branches.test.ts`는 W4-05가 명시적으로 허용한 `/api/ai` prompt 이동의 유일한 외부
  import 갱신이므로 이번 라운드에서만 경고 대상으로 취급할 수 있다.
- 다른 보호 경로, 금지 파일, 고객 계약 검사를 약화해서는 안 된다.
- allowlist나 경고 조건이 이번 세 파일보다 넓으면 임의로 유지하지 않는다. 기존 변경을 지우지
  말고 blocker로 보고하거나, 의도가 명백하고 현재 범위 안이면 가장 좁은 조건으로 수정한다.
- guard 통과만으로 `/flow` 무회귀를 주장하지 않는다.

### 5.3 `standard-drafts` Next 16 route typing 변경

`src/app/api/sop/standard-drafts/route.ts`와 연결된 테스트 diff를 검토한다.

- 변경은 Next 16 route context 타입 검사를 통과시키기 위한 dependency-injection 시그니처 정리여야
  한다.
- request/response schema, 승인 문서 필터, PII 제거, 동일 Task 제한, 자동 확정 금지 동작이 바뀌면
  안 된다.
- 관련 executable test와 `npx next build --webpack`으로 필요성을 입증한다.
- type-only 정리라는 설명과 실제 diff가 다르면 범위를 확대해 고치지 말고 blocker로 보고한다.

### 5.4 `/api/ai` prompt 이동

- 다섯 prompt builder만 `src/server/flow/flow-prompts.ts`로 이동했는지 확인한다.
- `src/app/api/ai/route.ts`는 route handler export만 남겨야 한다.
- prompt 문자열, schema, 조건 분기, 호출 인자가 baseline과 의미상 동일해야 한다.
- `npm run test:flow-branches`, `npm run test:shapes`, Turbopack build, webpack build를 모두 통과시킨다.
- `src/app/flow/**`와 `src/components/flow/**` 변경이 0건인지 별도로 증명한다.

### 5.5 commit history 불일치

기존 commit `14929ad`의 메시지가 실제 포함 파일을 모두 설명하지 못한다는 W4-05 handoff 기록은
history 메타데이터 이슈다. 이번 작업에서 rewrite, rebase, amend하지 않는다. 코드·테스트에 결함이
없으면 최종 보고의 `known history note`에만 남긴다.

## 6. 자동 검증 게이트

명령은 하나씩 순차 실행한다. 실패한 명령의 원문 오류, exit code, 첫 실패 지점을 기록한다.

```text
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
git diff --check
git status --short --branch
```

`npm run lint`의 `.remember/tmp` 경고처럼 현재 diff 밖의 기존 warning은 원문과 위치를 기록하되
새 오류로 둔갑시키지 않는다. 반대로 exit code 0만 보고 warning을 숨기지 않는다.

검증 과정에서 파일이 예기치 않게 바뀌면 변경 시각과 `git diff --name-status`를 다시 확인하고,
다른 writer의 동시 편집 가능성이 있으면 즉시 중지한다.

## 7. 브라우저 검증

### 7.1 환경

- 로컬 current build를 사용한다. production `main`에 배포하지 않는다.
- 가능하면 `npm run build`가 통과한 뒤 `npm run start`로 검증한다.
- 기존 서버를 재사용할 때는 그 서버가 현재 HEAD와 dirty diff로 빌드됐는지 확인한다.
- viewport는 `1440×900`, `1920×1080`, browser zoom 100%다.
- 프로덕션에 AI API KEY가 없다는 기준선 제약을 존중한다. 키가 없으면 추천 성공을 꾸며내지 않고
  실패 후 수동 Task 선택 복구 경로를 사용한다.
- browser storage를 지워야 한다면 전용 테스트 context/origin만 사용한다. 사용자 브라우저의 다른
  사이트 데이터나 계정 상태는 건드리지 않는다.

### 7.2 핵심 smoke

두 viewport에서 최소한 다음을 확인한다.

1. 랜딩의 SOP 버튼이 `/sop`로 진입한다.
2. 신규 구성원은 Home을 먼저 보지 않고 `/sop/context`로 착지한다.
3. record 보유 구성원은 `/sop` Home에 남고 신원·상태·T/A/S 집계를 본다.
4. Home의 활성 시작점 3개와 disabled TBD 1개가 보인다.
5. 동료 및 과거 문서 clone은 Work Map(simple)로 진입하며 편집 완료 후 기존 SOP를 보존한 채
   Workspace로 이동한다.
6. Task 경로는 Work Map 완료 후 `/sop/setup`을 거쳐 생성·Workspace로 이동한다.
7. Workspace의 실제 business node 수와 Activity coverage가 자동 테스트의 기대와 일치한다.
8. fixed footer, modal/drawer, 독립 scroll panel이 콘텐츠와 마지막 action을 가리지 않는다.
9. `/sop`와 `/sop/context` 사이에 redirect loop가 없다.

AI key 부재 등 외부 환경 때문에 6번의 생성 성공을 재실행할 수 없으면, 그 구간은 기존
executable test 결과와 W4-05 브라우저 증거를 구분해 보고하고 새로 성공한 것처럼 쓰지 않는다.

### 7.3 연속 키보드 전용 여정 — W4-05A 필수 잔여 항목

`1440×900`, zoom 100%의 격리된 테스트 세션에서 다음을 **한 번의 연속된 사용자 여정**으로
수행한다.

```text
SOP 진입
→ 로그인 입력과 제출
→ 업무맥락 입력과 제출
→ 추천 실패 안내 또는 추천 결과 확인
→ “Task 직접 찾기” 열기
→ Task 검색·선택
→ Work Map(simple) 진입
→ Work Map 완료 action에 도달
```

초기 URL 이동과 viewport 설정 이후에는 마우스 click이나 DOM script로 focus를 강제하지 않는다.
`Tab`, `Shift+Tab`, `Enter`, `Space`, 방향키와 일반 텍스트 입력만 사용한다.

반드시 기록한다.

- 실제 focus 순서와 건너뛴 control 유무
- focus 표시가 시각적으로 식별되는지
- 펼침/접힘, 오류 복구, 선택, 제출을 키보드로 실행할 수 있는지
- modal/drawer가 열릴 때 focus 진입·탈출과 닫기 동작
- focus trap 또는 보이지 않는 요소로의 focus 이동 유무
- 완료한 마지막 지점과, 환경 제약으로 중단했다면 정확한 원인

문제가 발견되면 현재 W4-05 변경 파일 안의 결함인지 먼저 판별한다. 현재 diff가 만든 결함이고
보호 경로를 건드리지 않는 최소 수정으로 닫을 수 있을 때만 수정한다. baseline 문제이거나 새로운
UI 재설계가 필요하면 고치지 말고 deferred로 분리한다.

### 7.4 접근성 기준선 재대조

`W4_BASELINE_A11Y_EVIDENCE.md`의 A11Y-1~5를 동일 의미로 다시 확인한다.

- A11Y-1 Skill 설명 focus 표시
- A11Y-2 업무맥락 textarea accessible name
- A11Y-3 Task명 오류의 alert/연결/focus 이동
- A11Y-4 reduced-motion에서 spinner와 tip transition 억제
- A11Y-5 Task 직접 찾기의 `aria-expanded`/`aria-controls`

각 항목은 `PASS`, `REGRESSION`, `NOT VERIFIED` 중 하나로 보고한다. `NOT VERIFIED`를 PASS로
간주하지 않는다.

## 8. 결함 수정 규칙

다음 세 조건을 모두 만족할 때만 코드나 테스트를 수정한다.

1. 실패 원인이 현재 W4-05 diff에서 발생했다.
2. 수정이 이미 변경된 파일 또는 명시된 예외 파일 안에서 끝난다.
3. 고객 계약, `/flow`, Work Map 뷰, Setup Gate, 승인·HR·Agent화 계약을 바꾸지 않는다.

수정했다면 다음 순서로 검증한다.

1. 실패를 재현하는 executable regression test 추가 또는 보강
2. 가장 작은 수정
3. 해당 targeted test
4. 관련 인접 suite
5. §6 전체 게이트 재실행
6. 관련 브라우저 흐름 재확인

보호 파일 수정이나 새로운 제품 판단이 필요하면 `BLOCKED_SCOPE_EXPANSION`으로 보고하고 멈춘다.
테스트 기대를 현재 구현에 맞춰 낮추는 방식으로 닫지 않는다.

## 9. 최종 changed-file 및 커밋 준비 감사

최종적으로 다음을 각각 출력한다.

1. `git status --short --branch`
2. `git diff --name-status`
3. `git ls-files --others --exclude-standard`
4. `git diff --check`
5. 보호 경로 변경 0건 확인:

```text
git status --short -- \
  src/components/sop/SopWorkMapSimpleView.tsx \
  src/components/sop/SopWorkMapDetailedView.tsx \
  src/components/sop/SopSetupGate.tsx \
  src/app/flow \
  src/components/flow
```

커밋 준비 목록은 세 그룹으로 제안한다.

- `INCLUDE`: 이 W4-05A 작업지시서, W4-01/02A/03B/04C/05 구현, 회귀 테스트, 필요한
  W4-05A 최소 수정
- `REVIEW EXCEPTION`: verifier guard 변경, `standard-drafts` route typing처럼 원래 소유 범위를 벗어났지만
  빌드·검증에 필요했던 변경
- `EXCLUDE`: `.claude/launch.json` 및 이번 작업과 무관한 사용자 파일

이 목록은 제안일 뿐이다. staging, commit, push하지 않는다.

## 10. 완료 조건

다음을 모두 충족해야 W4-05A를 완료로 보고한다.

- 다른 writer가 중지됐고 live file conflict가 없다.
- 세 브라우저 결함 수정이 코드, executable test, 브라우저 또는 orchestration 증거로 확인됐다.
- 검증 스크립트 예외가 정확히 좁은 범위인지 확인됐다.
- `standard-drafts` 변경이 동작 변경 없는 build compatibility 수정으로 확인됐다.
- `/api/ai` prompt 이동이 `/flow` 무회귀와 두 build 경로로 확인됐다.
- §6 전체 게이트가 PASS다.
- 1440×900과 1920×1080 핵심 smoke 결과가 기록됐다.
- 연속 키보드 전용 여정이 PASS이거나, 실제 blocker와 마지막 성공 지점이 정확히 기록됐다.
- A11Y-1~5가 각각 분류됐다.
- 보호 경로 변경이 0건이다.
- `.claude/launch.json`이 untouched이고 커밋 제외 목록에 있다.
- 최종 changed-file manifest와 INCLUDE/REVIEW EXCEPTION/EXCLUDE 제안이 있다.
- commit, push, production deploy를 하지 않았다.

연속 키보드 여정이 `NOT VERIFIED`이면 코드 통합 상태와 별개로 W4-05A 전체를 `완료`라고 쓰지
않는다. `코드 게이트 완료 / 접근성 closeout 미완료`로 정확히 보고한다.

## 11. 최종 HANDOFF 형식

최종 응답은 다음 순서로 작성한다.

```text
HANDOFF — W4-05A 통합 독립 검증 및 마감

1. 판정
   - COMPLETE | PARTIAL | BLOCKED
   - 판정 근거 한 문단

2. baseline / branch / worktree

3. 시작·종료 changed-file manifest
   - 기존 변경
   - W4-05A가 추가로 수정한 파일과 이유
   - 예상 밖 변경

4. 검증된 사실
   - 브라우저 결함 3건
   - 예외 범위 2건
   - /api/ai prompt 이동
   - 보호 경로 0건

5. 구현 해석
   - W4-05A가 새로 도입한 해석이 없으면 “없음”

6. 자동 게이트
   - 명령별 PASS/FAIL, exit code, warning

7. 브라우저 검증
   - viewport별 smoke
   - 연속 키보드 여정
   - A11Y-1~5

8. 알려진 한계와 보류
   - AI key 등 환경 제약
   - history note 14929ad

9. 커밋 준비 제안
   - INCLUDE
   - REVIEW EXCEPTION
   - EXCLUDE

10. 금지 작업 준수
   - commit/push/deploy/history rewrite 여부
```

결과가 PARTIAL 또는 BLOCKED면 실패를 숨기지 말고, 사용자가 다음에 결정해야 할 최소 항목 하나를
명확히 제시한다.
