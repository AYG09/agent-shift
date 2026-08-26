# 작업지시서 00 — 병렬 실행 관리자

## 역할과 목표

당신은 SOP 구성원 업무맥락 재설계의 통합 관리자다. 직접 기능을 여러 갈래로 동시에 구현하지 않는다. 동일한 검증 baseline, 배타적 파일 소유권, 순차 통합, 실행 가능한 검증을 보장한다.

목표 사용자 흐름은 다음과 같다.

```text
/sop/login
→ /sop/context
→ /sop/recommendation의 AI 처리·추천 확인
→ /sop/work-map/simple ⇄ /sop/work-map/detailed
→ 기존 Task-wide SOP 생성
→ /sop/workspace
```

기존 Home, 복제, 승인, Activity–Sub Action, Agent화 추적, HR 분석 계약은 보존한다.

## 필수 선행 읽기

아래 파일을 순서대로 끝까지 읽고, 읽지 못한 파일이 있으면 작업을 중단한다.

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.agents/skills/implement-sop-customer-requirements/SKILL.md`
4. 위 skill이 요구하는 reference 5개 전부
5. `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`
6. `docs/QUALITY_CONVENTIONS.md`
7. `docs/DESIGN_CONVENTIONS.md`
8. `docs/sop-member-context-redesign/README.md`
9. `docs/sop-member-context-redesign/CONTEXT.md`
10. `docs/sop-member-context-redesign/SPEC.md`
11. `docs/sop-member-context-redesign/NODE_AUTHORING_AND_AGENT_CONTROL.md`
12. `docs/sop-member-context-redesign/PARALLEL_EXECUTION.md`
13. 이 작업지시서 묶음 전부

우선순위 충돌 시 `README.md`의 source priority를 적용한다. 기능 시나리오는 final-system-scenario contract가 권위 원본이며, 새 문서는 최신 구성원 진입 UX와 node 작성 계약을 구체화한다.

## 실행 전 게이트

다음을 실행하고 결과를 작업 로그에 남긴다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

다음 조건을 모두 충족해야 writer 세션을 시작한다.

- 엔지니어링 문서와 작업지시서가 모든 worktree에서 같은 내용으로 보인다.
- Wave 0는 단일 worktree·단일 writer다.
- Wave 1은 Foundation의 검증 완료 commit 하나에서 분기한다.
- 각 세션은 별도 branch와 별도 worktree를 사용한다.
- 한 파일의 active owner는 한 세션뿐이다.
- local commit이 필요하면 사용자가 현재 실행 요청에서 명시적으로 허가했다.
- push는 별도의 명시적 허가 없이는 금지한다.

권한이 없으면 worktree/commit을 임의로 만들지 말고, 읽기 전용 검토까지만 수행한 뒤 필요한 권한을 보고한다.

## branch와 worktree 권장 이름

```text
wave0/sop-foundation
wave1/sop-login-context
wave1/sop-recommendation
wave1/sop-work-map-simple
wave1/sop-work-map-detailed
wave1/sop-member-node-generation
wave1/sop-standard-draft-generation
wave2/sop-integration
wave3/sop-design-verification
```

실제 경로와 branch 이름은 달라도 되지만 handoff에는 baseline commit, branch, 절대 worktree 경로를 기록한다.

## 파일 소유권 레지스트리

`PARALLEL_EXECUTION.md`와 각 세션 지시서의 소유 목록이 권위 원본이다. 특히 다음 공용 파일은 Wave 1에서 수정하지 않는다.

- `src/app/api/ai/route.ts`: Wave 2 통합 세션만 필요 시 수정한다.
- `src/lib/sop-types.ts`, `src/lib/sop-document-schema.ts`, `src/lib/sop-step-common-schema.ts`, `src/lib/sop-schemas.ts`, `src/lib/sop-prototype-store.ts`: Wave 0만 수정한다.
- `src/components/sop/SopSetupGate.tsx`, `src/components/sop/SopMemberHome.tsx`, `src/components/sop/WorkLibrarySelector.tsx`: Wave 2만 수정한다.
- `/flow` 관련 파일: 모든 세션에서 수정 금지다.

Wave 0가 생성·분리한 `sop-prompt.ts`, `sop-standard-draft-prompt.ts`, `sop-standard-draft-runner.ts`의 소유권은 Foundation handoff가 끝난 뒤 각각 Session E와 F로 이전된다. 이는 순차 소유권 이전이며 동시 소유가 아니다.

공용 계약 변경이 필요하면 Wave 1 세션은 코드를 우회하거나 복제하지 않는다. 필요한 export, 이유, 호출 예시, 영향 테스트를 `FOUNDATION_CHANGE_REQUEST`로 handoff한다.

## 실행 파동

### Wave 0

`01_WAVE0_FOUNDATION.md`만 실행한다. domain·Store migration·node contract·공용 controller가 완료되고 검증된 handoff를 받기 전 Wave 1을 시작하지 않는다.

### Wave 1

Foundation commit에서 여섯 worktree를 만든 뒤 02~07 지시서를 병렬 실행한다. 세션끼리 branch를 merge하거나 상대 세션 소유 파일을 import하는 새 결합을 만들지 않는다. Foundation이 제공한 public API만 사용한다.

### Wave 2

각 Wave 1 handoff의 changed-file 목록과 테스트를 검토하고, 의존성이 낮은 backend부터 순차로 통합한다.

권장 통합 순서:

1. Session E — 개인 SOP node 생성
2. Session F — 대표 표준안 node 생성
3. Session A — 로그인·업무맥락
4. Session B — 추천·로딩
5. Session C — 간소화 Work Map
6. Session D — 상세 Work Map
7. 통합 세션의 Home/Gate/기존 흐름 연결

각 통합 직후 해당 세션 테스트와 `npx tsc --noEmit`을 실행한다. narrative가 아니라 실제 diff와 테스트를 기준으로 수용한다.

### Wave 3

코드 소유권은 원칙적으로 Wave 2 통합 owner에게만 둔다. 설계 검토자가 발견한 수정은 issue 형태로 전달하고, 동시에 같은 파일을 수정하지 않는다.

## 설계 검토 정책

UI 세션 A~D는 구현 전에 Claude 환경에서 실제 제공되는 디자인 검토 기능 또는 디자인 skill을 호출해야 한다. 사용한 기능 이름과 반영한 결정을 handoff에 기록한다. 기능이 없거나 호출에 실패하면 사용했다고 주장하지 말고 `DESIGN_CAPABILITY_BLOCKED`로 보고한다. Stitch MCP 사용 여부도 실제 호출 기록과 일치해야 한다.

설계 원칙은 한 화면 한 primary action, progressive disclosure, 기존 token/meta 모듈 사용, 1440×900 및 1920×1080 검증이다.

## 최종 검증 게이트

Wave 2/3에서 아래 명령을 모두 실행한다.

```bash
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:quality
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
git diff --check
git status --short
```

브라우저에서는 로그인 → 맥락 → 로딩 → 추천 확인 → simple/detailed 양방향 편집 → Work Map 확정 → 생성 → Workspace를 실행한다. 오류·재시도·수동 선택·키보드·reduced-motion도 확인한다.

## 세션 handoff 필수 형식

```text
HANDOFF
1. baseline commit / branch / worktree
2. changed files
3. 충족한 SPEC requirement·test ID
4. 구현 해석과 그 근거
5. migration 또는 compatibility 영향
6. 실행한 명령과 PASS/FAIL
7. 실패 명령의 원문 오류
8. FOUNDATION_CHANGE_REQUEST 또는 통합 요청
9. Claude 디자인 기능의 실제 사용 여부·기능명·반영 결정
10. 미완료·보류·추가 검증 항목
11. 건드리지 않은 보호 파일
12. commit hash(명시적 권한이 있었을 때만) / push 여부
```

완료 주장에는 source-string 검색만 사용하지 않는다. 상태·domain·API·pipeline·브라우저 행동을 실행 가능한 테스트로 입증한다.
