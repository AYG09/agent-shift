# W4 세션 전달 프롬프트 (값 채움본)

각 코드 블록을 해당 세션의 **첫 메시지**로 전달한다. 한 세션이 두 블록을 맡지 않는다.

## 공통 사실

- 코드 baseline commit: `ae1297b` (구성원 진입 재설계 1차가 프로덕션에 반영된 commit)
- 작업지시서 commit: `f2cbca1` 이상 (이후 문서 전용 commit이 더 얹힐 수 있다 — 코드 변경은 없다)
- 네 worktree는 모두 `node_modules` junction이 걸려 있어 `npm run ...`이 바로 동작한다.
- 어떤 세션도 push하지 않는다. commit은 사용자가 그 세션에서 명시적으로 승인했을 때만 한다.

## 전달 순서

1. **지금 동시에**: Prompt W4-01, Prompt W4-02A
2. **W4-01 handoff 이후 동시에**: Prompt W4-03B, Prompt W4-04C
3. 네 handoff를 모두 받은 뒤: Prompt W4-05

---

## Prompt W4-01 — Foundation (선행, 단독)

```text
당신은 agent-shift SOP 구성원 진입 IA 2차 재설계의 W4-01 Foundation 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/W4_01_FOUNDATION.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4-foundation
필수 기준: branch w4/w4-foundation / 코드 baseline ae1297b
(worktree HEAD에는 문서 전용 commit이 얹혀 있을 수 있다. 코드 diff가 ae1297b와 동일하면 정상이다.)

AGENTS.md, CLAUDE.md, .agents/skills/implement-sop-customer-requirements/SKILL.md와 그 skill이 요구하는 reference 5개, docs/QUALITY_CONVENTIONS.md, docs/sop-member-context-redesign/{README,CONTEXT,SPEC,NODE_AUTHORING_AND_AGENT_CONTROL,PARALLEL_EXECUTION}.md, work-orders/WAVE0_FOUNDATION_HANDOFF.md, work-orders/W4_00_MASTER_PARALLEL.md, 그리고 본 작업지시서를 모두 끝까지 읽어라.

git status --short --branch, git log -1 --oneline, npm run verify:sop-customer를 먼저 실행하라. baseline이 다르거나 소유 파일에 다른 writer의 변경이 있으면 수정하지 말고 중단하고 보고하라.

이 세션은 화면을 만들지 않는다. W4_01_FOUNDATION.md의 배타적 소유 파일만 수정하라. 컴포넌트·페이지·picker·Setup Gate·Work Map 뷰·생성 backend·src/app/api/ai/route.ts·/flow는 건드리지 마라.

코드보다 문서가 먼저다. SPEC.md의 라우트 가드·무효화 규칙과 CONTEXT.md의 목표 사용자 여정을 먼저 갱신하고 새 requirement ID를 부여한 뒤 도메인을 구현하라. 문서가 확정하지 않은 값을 코드가 먼저 정하지 마라.

복제 경로가 Work Map 라우트 가드를 충족하는 방식은 "가드 완화"가 아니라 "복제 문서의 context 원문으로 확정 맥락을 채우는 것"이다. resolveIntakeRouteAccess의 조건 자체를 느슨하게 만들지 마라.

작업지시서의 수용 검증과 검증 명령을 모두 실행하라. 완료 후 W4_00_MASTER_PARALLEL.md의 HANDOFF 형식으로 보고하되, 갱신한 SPEC/CONTEXT 절과 새 requirement ID, 추가한 export의 시그니처와 호출 예시, origin의 legacy 읽기 규칙, 가드를 완화하지 않았다는 확인을 반드시 포함하라. W4-03B와 W4-04C가 추측으로 공용 API를 다시 정의하게 만들지 마라.

명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt W4-02A — 랜딩 입구 (완전 독립, 즉시 시작)

```text
당신은 agent-shift SOP 구성원 진입 IA 2차 재설계의 W4-02A 랜딩 입구 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/W4_02A_LANDING_ENTRY.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4a-landing-entry
필수 기준: branch w4/w4a-landing-entry / 코드 baseline ae1297b

AGENTS.md, CLAUDE.md, work-orders/W4_00_MASTER_PARALLEL.md, 본 작업지시서를 끝까지 읽어라. 이 작업은 SOP 도메인 계약을 바꾸지 않지만 수정 대상이 /flow 제품 홈이므로 범위 규칙을 반드시 지켜야 한다.

git status --short --branch, git log -1 --oneline, npm run verify:sop-customer를 먼저 실행하라.

src/app/page.tsx 한 파일만 수정하라. SOP Prototype 버튼의 목적지를 '/sop/setup'에서 '/sop'로 바꾸고, 왜 /sop인지(Home이 세션 상태로 착지점을 판정하므로 여기서 다시 하드코딩하면 같은 결함을 재생산한다) 짧은 주석을 남겨라. 버튼 라벨·아이콘·스타일은 바꾸지 마라. '/sop/login'이나 특정 단계로 직접 연결하지 마라. 랜딩 페이지의 다른 UI는 개선하지 마라. /flow 관련 동작(프로젝트 생성·열기·삭제·이름 변경)은 일절 건드리지 마라.

이 파일은 navigate를 prop으로 받지 않고 useRouter()를 직접 쓰므로 컴포넌트 테스트를 새로 만들 수 없다. 없는 테스트를 억지로 만들지 말고 npx tsc --noEmit, npm run lint, npm run verify:sop-customer, git diff --check로 검증하라. npm run build는 이 worktree에서 실행하지 마라 — node_modules junction 때문에 Turbopack이 거부하며 코드와 무관한 인프라 문제다. 빌드 검증과 실제 클릭 동작 확인은 W4-05 통합 세션이 메인 worktree에서 수행한다.

W4_00_MASTER_PARALLEL.md의 HANDOFF 형식으로 보고하고 git diff 전문을 그대로 첨부하라. /flow 관련 코드 변경 0건임을 명시하라.

명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt W4-03B — Home 착지 판정과 시작점 IA

```text
당신은 agent-shift SOP 구성원 진입 IA 2차 재설계의 W4-03B Home 착지·시작점 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/W4_03B_HOME_LANDING_AND_START_POINTS.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4b-home-landing
필수 기준: branch w4/w4b-home-landing / 코드 baseline ae1297b + W4-01 Foundation handoff

AGENTS.md, CLAUDE.md, SOP repository skill과 필수 reference 5개(특히 final-system-scenario-contract.md 2.1과 2.5), docs/QUALITY_CONVENTIONS.md, docs/DESIGN_CONVENTIONS.md, W4-01이 갱신한 SPEC.md·CONTEXT.md, WAVE0_FOUNDATION_HANDOFF.md, W4-01 handoff, W4_00_MASTER_PARALLEL.md, 본 작업지시서를 끝까지 읽어라.

git status --short --branch, git log -1 --oneline, npm run verify:sop-customer를 먼저 실행하라. W4-01 Foundation이 반영되지 않은 baseline이면 시작하지 말고 중단하라.

구현 전에 Claude 환경에서 실제 제공되는 디자인 검토 기능 또는 design skill을 호출해 Home의 정보 위계와 시작점 카드 밀도를 검토하라. 사용할 수 없으면 DESIGN_CAPABILITY_BLOCKED로 정확히 보고하고 사용했다고 주장하지 마라.

본 작업지시서의 배타적 소유 파일만 수정하라. picker 내부 파일, sop-setup-actions.ts, Work Map 뷰, Setup Gate, Foundation 도메인·Store, src/app/page.tsx는 건드리지 마라. 공용 API가 부족하면 복제 구현 대신 FOUNDATION_CHANGE_REQUEST를 작성하라.

착지 판정 로직을 컴포넌트 안에서 다시 만들지 말고 W4-01의 resolveMemberLandingRoute만 호출하라. hydration이 끝나기 전에는 어떤 이동도 하지 마라. Home 자체를 삭제하거나 조건부 렌더로 만들지 말고, 무한 리다이렉트가 생기지 않게 이동은 명시적 진입 시점에만 수행하라. 신원 5개 항목, 상태별 건수, T/A/S 수, 승인 요청·반려 피드백·수정하기는 모두 보존하라. 두 picker는 고정 인터페이스 계약대로 계속 마운트하라.

작업지시서의 수용 검증을 모두 실행하고 HANDOFF 형식으로 보고하되, 착지 판정 진리표(인증×record×진행 상태 → 목적지), 시작점 그룹의 시각 구조 결정과 근거, 실제 사용한 Claude 디자인 기능을 포함하라. 소유 파일 밖 변경은 0건이어야 한다.

명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt W4-04C — 복제 경로 Work Map 합류

```text
당신은 agent-shift SOP 구성원 진입 IA 2차 재설계의 W4-04C 복제 경로 단독 writer다.

작업지시서:
docs/sop-member-context-redesign/work-orders/W4_04C_CLONE_WORKMAP_ENTRY.md

현재 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4c-clone-workmap
필수 기준: branch w4/w4c-clone-workmap / 코드 baseline ae1297b + W4-01 Foundation handoff

AGENTS.md, CLAUDE.md, SOP repository skill과 필수 reference 5개(특히 final-system-scenario-contract.md 2.3과 2.4, member-home-subaction-contract.md 2.3), W4-01이 갱신한 SPEC.md, WAVE0_FOUNDATION_HANDOFF.md, W4-01 handoff, W4_00_MASTER_PARALLEL.md, 본 작업지시서를 끝까지 읽어라.

git status --short --branch, git log -1 --oneline, npm run verify:sop-customer를 먼저 실행하라. W4-01 Foundation이 반영되지 않은 baseline이면 시작하지 말고 중단하라.

본 작업지시서의 배타적 소유 파일만 수정하라. SopMemberHome.tsx, app/sop/page.tsx, 로그인 게이트는 W4-03B 소유이니 건드리지 마라. Work Map 뷰 두 개와 Setup Gate, Foundation 도메인·Store도 수정 금지다.

두 picker의 props 시그니처를 바꾸지 마라 — W4-03B가 그 계약대로 마운트한다. confirmWorkMapAndProceed의 호출 시그니처도 바꾸지 마라 — Work Map 뷰가 그 형태로 호출하며 그 파일은 수정 금지다. 출처 분기는 confirmWorkMap()이 돌려주는 result.draft의 origin을 읽어 함수 내부에서만 처리하라.

복제본은 이미 완성된 SOP를 갖고 있으므로 재생성하면 원본 내용이 사라진다. 복제 계열 origin은 Work Map 편집 후 /sop/workspace로 보내고 생성 API를 호출하지 마라. workLibrary 스냅샷에서 Task를 찾을 수 없는 legacy 문서는 복제 자체를 실패시키지 말고 기존대로 /sop/workspace로 fallback하라. 동료 복제의 개인정보 제거와 승인·검토·Agent화 초기화 규칙은 절대 완화하지 마라.

tests/sop-member-home.test.ts는 읽기·실행만 하라(W4-03B 소유). 그 테스트가 이번 변경으로 깨지면 고치지 말고 통합 요청으로 보고하라.

작업지시서의 수용 검증을 모두 실행하고 HANDOFF 형식으로 보고하되, 복제 후 흐름 변경 전/후, 출처별 분기 진리표, legacy fallback 근거, 개인정보·상태 초기화 회귀 없음의 테스트 증거를 포함하라. 소유 파일 밖 변경은 0건이어야 한다.

명시적 권한 없이는 commit·push하지 마라.
```

---

## Prompt W4-05 — 통합 (모든 writer 종료 후 단독)

```text
당신은 agent-shift SOP 구성원 진입 IA 2차 재설계의 W4-05 단독 integration owner다. 다른 모든 W4 writer가 중지된 뒤에만 시작하라.

작업지시서:
docs/sop-member-context-redesign/work-orders/W4_05_INTEGRATION.md

통합 worktree: C:\Users\USER\Desktop\NOCODE\agent-shift (branch wave0/sop-foundation)
코드 baseline: ae1297b
W4-01 handoff / worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4-foundation
W4-02A handoff / worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4a-landing-entry
W4-03B handoff / worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4b-home-landing
W4-04C handoff / worktree: C:\Users\USER\Desktop\NOCODE\agent-shift-wt\w4c-clone-workmap

AGENTS.md, CLAUDE.md, SOP repository skill과 필수 reference 5개, 품질·디자인 규칙, W4-01이 갱신한 SPEC.md·CONTEXT.md, W4_00_MASTER_PARALLEL.md, 네 세션의 작업지시서와 handoff, 본 통합 지시서를 모두 끝까지 읽어라.

각 handoff의 narrative를 믿기 전에 실제 diff와 테스트를 확인하라. changed-file 목록이 W4_00_MASTER_PARALLEL.md의 소유권 레지스트리와 일치하는지 대조하고, 목록 밖 변경이 있으면 그 자체를 blocker로 보고하라.

git status --short --branch, git log -1 --oneline, npm run verify:sop-customer를 먼저 실행하라. 네 worktree의 작업은 커밋되지 않은 상태로 각 worktree에 있으므로 git merge가 아니라 파일 단위로 가져와 적용하라.

W4-01 → W4-02A → W4-03B → W4-04C 순서로 통합하고, 각 단계 직후 소유 테스트와 npx tsc --noEmit을 통과시킨 뒤 다음으로 가라. 그 다음 통합 지시서의 교차 지점 5개(picker 마운트 계약, 착지 판정의 단일 원천, 완료 동작 분기, 가드 무결성, 무한 이동 없음)를 실제 실행으로 확인하라.

tests/sop-customer-scenario.test.ts에 통합 지시서의 10개 시나리오를 실행 가능한 형태로 추가하고, 새 테스트 파일을 package.json의 test:sop 체인에 등록하라. 등록하지 않으면 회귀 게이트가 그 파일을 실행하지 않는다.

Work Map 뷰 두 개와 Setup Gate가 변경 0건인지 git status로 증명하라. /flow 디렉터리도 변경 0건이어야 한다.

src/app/api/ai/route.ts는 이번 통합에서 예외적으로 수정한다: 다섯 prompt builder(getAsIsPrompt, getToBePrompt, getDrilldownPromptAsIs, getDrilldownPromptToBe, getNodeSplitPrompt)를 src/server/flow/flow-prompts.ts로 무동작변경 이동하고 route는 handler만 export하게 하라. tests/flow-branches.test.ts의 import 경로를 갱신하고 npm run test:flow-branches와 npm run test:shapes로 /flow 무회귀를 증명하라. prompt 문자열·동작·schema는 한 글자도 바꾸지 마라. 이 정리 뒤 npx next build --webpack도 한 번 통과시켜라.

통합 지시서의 최종 게이트 전체를 실행하고 HANDOFF 형식으로 보고하되, 소유권 레지스트리 대조 결과, 교차 지점 5개의 확인 결과, 10개 시나리오의 PASS/FAIL, 미검증 항목을 포함하라. 브라우저 도구가 없으면 시각 검증을 수행했다고 기록하지 말고 미검증으로 남겨라.

명시적 권한 없이는 commit·push하지 마라.
```
