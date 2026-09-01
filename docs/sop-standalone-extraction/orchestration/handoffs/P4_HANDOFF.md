=== SESSION REPORT | P4 / E4-08 ORIGIN CLEANUP | 2026-08-28 11:50 ===

[0] 판정요청: COMPLETE
  한 줄 요약: agent-shift에서 SOP 전용 파일 191개를 제거하고 공유 파일 10개를 편집했다.
  제거 목록은 프롬프트 §5.A(INT-M-024 정정본)와 파일 단위로 완전히 일치한다(누락·초과
  0건). `/flow` 게이트는 제거 전/후 모두 tsc 0 오류, lint 0 오류/기지(既知) 경고 1건,
  test:flow-branches 37/37, test:shapes 6/6, Turbopack·webpack 빌드 EXIT 0(8라우트,
  동일)로 완전히 일치한다. verify:quality는 SOP 전용 규칙 4개(§6 지정 3개 +
  inline-pad-format 실측 후 판단으로 추가 제거) 제거 후 3규칙·59파일로 PASS한다.
  의존성은 실측 결과 agent-shift 안에서 참조 0건인 패키지가 하나도 없어(전부 /flow가
  실사용) 제거 0건이다. sop-platform은 이 세션 동안 변경 0건(git status 확인).
  브라우저로 /, /flow, /strategy, /export 렌더와 FloatingDock 내비게이션을 확인했고
  /sop는 404를 반환한다. 다만 grep 잔존 검사(TST-E4-004)에서 프롬프트가 예상한 2개
  예외(graph-validation.ts, flow-shapes.ts) 외에 2건이 더 나왔다 — 둘 다 판단 근거를
  대고 그대로 두었으며 §12에 승인을 요청한다.

[1] 저장소/기준
  저장소: agent-shift
  worktree: C:\Users\USER\Desktop\NOCODE\agent-shift
  branch: wave0/sop-foundation | 기준 commit: 52b8377
  baseline 대조: git diff --stat 52b8377 -- src tests →
    작업 시작 시점 출력 없음, EXIT 0 확인(제거·편집 착수 전에 먼저 확인했다).

[2] 변경 파일
  $ git status --short
    D  .agents/skills/implement-sop-customer-requirements/** (8개)
    D  docs/sop-member-context-redesign/** (32개)
    D  src/lib/sop-*.ts (52개)
    D  src/components/sop/** (38개)
    D  src/components/sop-demo/** (3개)
    D  src/server/sop/** (8개)
    D  src/app/sop/** (12개)
    D  src/app/api/sop/** (12개)
    D  src/data/sop-task-library-sample.json (1개)
    D  tests/sop*.test.ts, tests/sop*.test.tsx (21개)
    D  src/hooks/useSopAiSettings.ts (1개)
    D  SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md
    D  SOP_MEMBER_HOME_SUBACTION_AGENTIZATION_WORK_ORDER.md
    D  SOP_CODE_QUALITY_REVIEW_AND_SONNET5_WORK_ORDER.md
    M  AGENTS.md, CLAUDE.md, GEMINI.md, README.md,
       docs/DESIGN_CONVENTIONS.md, docs/QUALITY_CONVENTIONS.md,
       package.json, scripts/verify-quality.mjs,
       src/app/api/ai/route.ts, src/app/page.tsx
    ??  .claude/, "docs/sop-standalone-extraction/Task Library Sample.CSV"
        (이 세션이 만든 것이 아니다 — 세션 시작 전부터 있던 미추적 파일, 손대지 않았다)
    총계: D 191 / M 10 / ?? 2(기존)

  $ git diff --name-only 52b8377
    (git status --short와 동일 D 191 + M 10, 추가로 P0가 이미 커밋해 둔
    docs/sop-standalone-extraction/work-orders/*.md 10개 A + work-orders/README.md
    1개 M — 이 11개는 이 세션이 만들지 않았다. 이 세션 시작 전 git status --short
    --branch로 이미 확인된 상태였다)

  제거 파일 총 191개 / 수정 파일 10개
  §5 목록과의 대조: 누락 0건 / 초과 0건 (아래 [5], [11]-A 참고)
  sop-platform 변경: 0건 (`git -C sop-platform status --short --branch` → `## main`,
    출력 그 외 없음)

[3] 충족한 REQ·INT·TST ID (근거 한 줄씩)
  REQ-E4-001: E3-07 handoff([0] COMPLETE, P4 시작 가능: 예)를 §2 필독에서 확인한 뒤
    시작했다.
  REQ-E4-002: sop-platform은 이 세션 동안 Read만 했다(P1/P2D/P3 handoff, E3 증거
    문서). Edit/Write 호출 0건, git status로 재확인.
  REQ-E4-003: 제거 전 test:flow-branches(37/37)·test:shapes(6/6)·build·webpack build를
    먼저 실행해 기록한 뒤 제거를 시작했다([6] 참고).
  REQ-E4-004: §5(INT-M-024 정정본)를 정본으로 썼다. E3-07 handoff [11]-H의 P3 자체
    목록은 참고만 하고 §5와 다른 점(favicon.ico·docs/sop-standalone-extraction/**·
    GEMINI.md 3건)은 프롬프트 지시대로 §5를 따랐다.
  REQ-E4-005: graph-validation.ts를 열지 않았다(Edit/Write 호출 0건). SOP 전용 함수
    (validateSopGraph 등)는 grep 잔존 허용 목록에 그대로 남아 있다([9] 참고).
  REQ-E4-006: route.ts diff([11]-B)에서 /flow 관련 스키마·프롬프트·검증·repair
    분기(generateAsIsFlow/generateToBeFlow/generateDrilldown/generateNodeSplit,
    validateFlowGraph, validateDrilldownBranching) 한 줄도 바뀌지 않았음을 확인.
    maxOutputTokens는 16384 상수로, 1차 생성 재시도 래퍼는 faa4f5e 커밋 이전 원형으로
    되돌렸다(근거: `git show faa4f5e -- src/app/api/ai/route.ts`로 SOP 도입 전 원문을
    확인한 뒤 그대로 복원).
  REQ-E4-007: `grep -n "^export " src/app/api/ai/route.ts` → `export async function
    POST` 1건뿐.
  REQ-E4-008: page.tsx에서 '/sop' 버튼과 관련 import(Sparkles)만 제거했다. 새
    저장소 URL 하드코딩 0건(diff 원문 [11]-H 참고).
  REQ-E4-009: 19개 후보 패키지 전부 `from '패키지'` 정밀 매칭으로 재확인해 참조
    ≥1건 확인 후 **0개 제거**([11]-D). 실측 없이 지운 것 없음.
  REQ-E4-010: verify-quality.mjs에서 suggestion-enum-literal·document-status-label·
    step-status-label 3개를 지정대로 제거했고, inline-pad-format은 §5 지시대로
    "대상 범위 확인 후 판단" — `grep -rn "\.padStart(" src/components/`가 0건이라
    함께 제거했다(근거 [11]-G). provider 3개는 그대로 남았다.
  REQ-E4-011: AGENTS.md·CLAUDE.md·GEMINI.md 세 파일 모두 "Do not commit or push
    unless the user explicitly authorizes it" 문장을 유지했다(AGENTS.md는 절 이동
    과정에서 한 번 사라질 뻔한 것을 General change discipline 절 끝에 다시
    추가했다 — [11]-H 참고).
  REQ-E4-012: 게이트 전부 통과했으므로 되돌릴 필요가 없었다(해당 없음).
  REQ-EXT-003(=TST-E4-001): 제거 후 tsc/lint/test:flow-branches/test:shapes/
    verify:quality/build/webpack build/git diff --check 전부 PASS([6]).
  TST-E4-002: test:flow-branches 37/37, test:shapes 6/6 — 제거 전과 정확히 동일한
    수치([6] 대조표).
  TST-E4-003: 브라우저로 /, /flow, /strategy, /export 확인, FloatingDock 내비게이션
    동작 확인, /sop 404 확인([11]-F). /room은 별도 사유로 §7·[12]에 기록.
  TST-E4-004: grep 잔존 검사 실행 — graph-validation.ts·flow-shapes.ts 외 2건 추가
    검출, 판단 근거와 함께 [9]·[12]에 투명하게 기록(전부 지우지는 못했다).
  INT-M-022: `grep -rn "useSopAiSettings" src/`로 SOP 컴포넌트 4개(SopActivityProposal
    Panel·SopSetupGate·SopTaskRecommendationFlow·SopTaskRecommendationPanel)뿐임을
    제거 전에 재확인한 뒤 그대로 제거했다. 재조사하지 않았다.
  INT-M-024: 프롬프트 §5를 정본으로 삼아 P3 handoff [11]-H의 오류 3건(favicon.ico
    삭제 대상 아님, docs/sop-standalone-extraction/** 유지, GEMINI.md는 편집 대상)을
    그대로 반영했다 — 셋 다 실제로 유지/편집했다([9] 참고).

  미충족/보류:
    TST-E4-004가 요구하는 "graph-validation.ts·flow-shapes.ts 외 grep 0건"은
    완전히 충족하지 못했다. FloatingDock.tsx의 죽은 '/sop' 분기, model-factory.ts의
    역사적 docstring 언급 2건이 더 남았다 — [9]·[12] 참고, 관리자 판단 요청.

[4] 새로 도입한 구현 해석
  해석-1: `src/app/api/ai/route.ts`의 1차 생성 재시도 제거 방식 — SOP 도입 전
    원문을 지어내지 않고 `git show faa4f5e -- src/app/api/ai/route.ts`로 실제
    SOP 도입 직전 diff를 확인해 그 원형(`const { object: firstObject } =
    await generateObject(...)`, 재시도 래퍼 없음)을 그대로 복원했다. 마찬가지로
    `generationMaxOutputTokens`도 그 이전 커밋(39fe951)의 원문
    (`maxOutputTokens: 16384, // 실제 필요량 6,000 + 여유분`)을 확인해 복원했다.
    임의 재작성이 아니라 이 저장소의 실제 이력에서 가져온 값이다.
  해석-2: verify-quality.mjs의 `inline-pad-format` 규칙(§6이 "대상 범위 확인 후
    판단"으로 위임한 항목) — `grep -rn "\.padStart(" src/components/`가 SOP 제거
    후 0건이라 이 규칙도 3개 지정 규칙과 같은 성격(검사 대상 도메인이 저장소를
    떠나 영원히 0건만 내는 죽은 규칙)으로 판단해 함께 제거했다.
  해석-3: package.json 의존성은 실측 결과 제거 대상이 없었다(19개 후보 전부
    agent-shift 잔존 코드에서 참조됨 — 대부분 /flow 전용). sop-platform의
    "SOP 사용 0건" 판정과 agent-shift의 "실제 참조 있음" 판정이 다른 것은 두
    판정이 서로 다른 코드 베이스(SOP 이관 집합 vs /flow 전체)를 기준으로 하기
    때문이며 모순이 아니다. 이 사실 자체가 [11]-D의 핵심 발견이다.
  해석-4: README.md는 원래 SOP 언급이 0건이었다(P1_HANDOFF §8이 이미 지적한
    "README.md가 agent-shift 원본과 byte 동일" 상태가 그대로 유지된 것). SOP
    언급 제거는 실행하지 않았고(대상이 없었으므로), INT-E4-001이 요구한 분리
    사실 한 줄만 추가했다.
  해석-5: FloatingDock.tsx의 죽은 `pathname.startsWith('/sop')` 분기와
    model-factory.ts의 역사적 docstring(§9 참고)은 배타적 소유 목록(§4) 밖의
    파일이므로 편집하지 않고 grep 잔존으로 투명하게 보고하는 쪽을 택했다 —
    "소유 밖 변경 0건"이 이 라운드 전체의 완료 조건이라는 E0_00_MASTER.md §10
    규칙 1을 트리비얼해 보이는 정리보다 우선했다.

[5] 제거 증명
  제거 파일 목록과 §5.A의 대조 — 누락 0건 / 초과 0건. 카테고리별 실측 개수
  (`git diff --name-status 52b8377`의 D 191건을 경로 prefix로 분류):
    src/lib/sop-*.ts              52  (§5.A 명시값과 일치)
    src/components/sop/**         38  (일치)
    src/components/sop-demo/**     3  (일치, 격차 G1)
    src/server/sop/**              8  (일치)
    src/app/sop/**                12  (일치)
    src/app/api/sop/**            12  (일치)
    sop-task-library-sample.json   1  (일치)
    tests/sop*.test.*             21  (일치)
    useSopAiSettings.ts            1  (일치)
    .agents/skills/.../**          8  (일치)
    docs/sop-member-context-redesign/**  32  (일치)
    루트 SOP 작업지시서 3개         3  (일치)
    합계                          191 = §5.A 항목 합(52+38+3+8+12+12+1+21+1+8+32+3)과
                                        완전히 일치

  §5.B의 유지 대상이 전부 남아 있는지 확인 (파일별 존재 확인, `[ -e ]` 결과):
    OK  src/app/favicon.ico
    OK  docs/sop-standalone-extraction  (디렉터리)
    OK  src/lib/graph-validation.ts
    OK  src/lib/flow-shapes.ts
    OK  src/lib/flow-layout.ts
    OK  src/components/flow/FlowShapeRenderer.tsx
    OK  src/lib/ai-shape-guide.ts
    OK  src/server/ai/model-factory.ts
    OK  src/lib/gemini-models.ts
    OK  src/components/settings/ApiKeySettings.tsx
    OK  src/app/api/models/route.ts
    OK  src/components/ui  (디렉터리, button/card/dialog/input/label/select 등)
    OK  src/lib/utils.ts
    12/12 전부 존재.

  의존성 제거 실측 출력 (post-removal, `grep -rlE "from ['\"]<pkg>['\"]" src/ tests/`
  파일 수, 19개 후보):
    zod 2 · ai 1 · @ai-sdk/google 1 · @xyflow/react 7 · lucide-react 14 · zustand 2
    @radix-ui/react-dialog 1 · @radix-ui/react-label 1 · @radix-ui/react-select 1
    @radix-ui/react-slot 2 · @radix-ui/react-popover 1(src/components/ui/popover.tsx,
      src/app/flow/page.tsx:17이 그 popover.tsx를 실제로 import함 — /flow 사용,
      sop-platform의 "0건" 판정과 기준 코드베이스가 다름)
    class-variance-authority 2 · tailwind-merge 1 · clsx 1 · cmdk 1 · docx 1 ·
    exceljs 1 · framer-motion 7 · @liveblocks/client 1 · @liveblocks/zustand 1
    19개 전부 참조 ≥1건 → 제거 대상 0개.

  최종 제거한 의존성 목록: 없음(0개). package.json의 dependencies/devDependencies
  절은 SOP 제거 전후로 완전히 동일하다(diff 확인, [11]-D). 제거한 것은 npm script
  3개(test:sop, test:sop-demo, verify:sop-customer)뿐이다.

[6] 실행한 명령과 결과
  [제거 전 기준선]
  $ npm run test:flow-branches
    EXIT 0 | ALL FLOW-BRANCHES TESTS PASSED (37/37)   (baseline 37/37과 일치)
  $ npm run test:shapes
    EXIT 0 | ALL VERIFICATION TESTS PASSED SUCCESSFULLY! + ALL TERMINAL NODE TESTS
    PASSED (6/6)   (baseline: flow-shapes + terminal-node 6/6과 일치)
  $ npm run build
    EXIT 0 | Turbopack, 29라우트(당시엔 아직 /sop 포함)
  $ npx next build --webpack
    EXIT 0 | webpack, 동일 29라우트

  [제거 후]
  $ npx tsc --noEmit
    최초 실행: `.next/types/**`에 삭제된 /sop 라우트를 가리키는 TS2307 오류 다수
    (스테일 빌드 캐시 — REQ-PAR-009와 같은 성격의 문제, 소스 오류 아님).
    `rm -rf .next` 후 재실행 → EXIT 0, 출력 없음, 오류 0건.
  $ npm run lint
    EXIT 0 | 0 errors, 1 warning(.remember/tmp/last-ndc.ts, src/** 밖 세션 도구
    파일 — baseline·P1·P3가 이미 같은 항목으로 분류한 기지 경고와 동일)
  $ npm run test:flow-branches
    EXIT 0 | 37/37 → 제거 전과 일치: 예
  $ npm run test:shapes
    EXIT 0 | flow-shapes 검증 전부 + terminal-node 6/6 → 제거 전과 일치: 예
  $ npm run verify:quality
    EXIT 0 | [PASS] 품질 가드레일 통과 (3개 규칙 · 59개 파일 검사)
    (제거 전 baseline: 7개 규칙 · 185개 파일 — 규칙 4개 제거·SOP 파일 소멸로
    파일 수 감소, 예상된 변화)
  $ npm run build
    EXIT 0 | Turbopack, 8라우트: / /_not-found /api/ai /api/models /export /flow
    /room/[roomId] /strategy
  $ npx next build --webpack
    EXIT 0 | webpack, 동일 8라우트
  $ git diff --check
    EXIT 0 | 출력 없음(CRLF 관련 경고만 나오고 whitespace 오류는 0건 — [9] 참고)

[7] 실패한 명령의 원문 오류
  없음 — 위 게이트 전부 EXIT 0으로 통과했다. 단, 브라우저 확인 중
  `http://localhost:3555/room/test1`이 500을 반환했다:
    Error: Invalid Liveblocks client options. Please provide either a
    `publicApiKey` or `authEndpoint` option. They cannot both be empty.
  이 세션은 SOP 제거 전에 /room을 확인하지 않았으므로 이 500이 제거 전부터
  있던 상태인지 이 세션이 만든 회귀인지 직접 대조하지 못했다. 다만 원인이
  Liveblocks 환경변수(LIVEBLOCKS_SECRET_KEY 등) 미설정이고 이 세션이 Liveblocks
  관련 파일을 전혀 열지 않았으므로, SOP 제거로 인한 회귀는 아니라고 판단한다 —
  §12에 확신하지 못하는 부분으로 남긴다.

[8] 다른 세션·저장소로 넘기는 요청
  - graph-validation.ts·flow-shapes.ts의 SOP 전용 함수 원본 쪽 좁히기(REQ-E4-005가
    이 세션의 범위 밖으로 명시) — 별도 라운드.
  - FloatingDock.tsx:99의 `pathname.startsWith('/sop')` 죽은 분기 제거 — 이
    파일은 이 세션의 배타적 소유 목록 밖이라 손대지 않았다. 트리비얼한 한 줄
    정리이니 다음에 이 파일을 다루는 세션이 함께 처리하면 된다.
  - /room 환경변수(Liveblocks) 설정 — 이 세션 범위 밖(사용자/운영 설정 사항).

[9] 보류 항목 무변경 확인
  /flow prompt·스키마·검증·repair 정책: 무변경 — route.ts diff([11]-B)에
    generateAsIsFlow/generateToBeFlow/generateDrilldown/generateNodeSplit 분기와
    validateFlowGraph/validateDrilldownBranching 호출부가 한 글자도 나타나지 않음.
  /flow 테스트 단언: 무변경 — tests/flow-branches.test.ts, tests/flow-shapes.test.ts,
    tests/terminal-node.test.tsx 어느 것도 Edit/Write하지 않았다(git status에 없음).
  graph-validation.ts의 SOP 전용 함수 (남겼는지): 남겼다 — 파일을 열지 않았다
    (Edit/Write 호출 0건). grep 잔존 검사에서 graph-validation.ts가 예상대로
    나타난다(REQ-E4-005 확인).
  docs/sop-standalone-extraction/** (남겼는지): 남겼다 — 존재 확인([5]). 이
    핸드오프 파일 1개만 새로 추가했다(신규 디렉터리 orchestration/handoffs/ 생성).
  src/app/favicon.ico (남겼는지): 남겼다 — 존재 확인([5]), 크기 25931바이트로
    제거 전과 동일(건드리지 않았으므로 당연하지만 명시).
  GEMINI.md (삭제가 아니라 편집했는지): 편집했다 — SOP 절 2개 제거, "Preserve
    `/flow`, ..." 문구에서 /flow를 빼고 유지 항목만 남겼다([11]-H).
  새 저장소 URL 하드코딩 없음: 없음 — page.tsx는 버튼을 제거만 했고(REQ-E4-008
    지시대로) 어떤 새 URL도 넣지 않았다. README.md 한 줄도 URL이 아니라 상대
    경로(docs/sop-standalone-extraction/) 링크다.
  commit·push 금지 규칙 유지: AGENTS.md·CLAUDE.md·GEMINI.md 세 파일 모두 유지
    ([11]-H, REQ-E4-011).
  sop-platform: 쓰기 0건 — Read 호출만 있었고(P1/P2D/P3 handoff, E3 증거 문서),
    `git -C sop-platform status --short --branch` 결과 `## main`뿐(작업 흔적 없음).
  commit·push: 수행하지 않음 — git add/commit/push 호출 0건.

  추가로 발견된 잔존(§3 미충족/보류에 이미 기록, 여기 재확인):
  - FloatingDock.tsx:99 `pathname.startsWith('/sop')` — 배타적 소유 밖이라
    편집하지 않았다. 실행 시 이 조건은 항상 false이므로 동작에는 영향이 없다.
  - model-factory.ts:8-9 docstring — "이전에는 ... (/api/ai, /api/sop/
    task-recommendations, /api/sop/activity-proposals, sop-standard-draft-runner)
    에 각각 복사되어 있었다"는 과거 시제의 설계 근거 서술이다. 코드가 아니라
    "왜 이렇게 됐는가"를 남긴 docstring이고, 저장소 관행(QUALITY_CONVENTIONS.md
    축 1, "불변식은 코드 옆에 명시한다")과 이 라운드의 배타적 소유 목록 둘 다
    이 파일 편집을 요구하지 않는다고 판단해 그대로 두었다. 사실관계도 여전히
    참(과거에 그랬다)이므로 오도하지 않는다.

[10] 다음 세션이 건드리면 안 되는 파일
  - src/**, tests/** 전체 — 이번 라운드의 어떤 세션도 남은 /flow 도메인 코드를
    "정리" 명목으로 확장 편집하지 않는다(REQ-PAR-004의 정신 연장).
  - docs/sop-standalone-extraction/** — 분리 경위 기록. 실측값을 사후에 고치지
    않는다.
  - 이 handoff 파일 — 이후 세션은 인용만 하고 값을 고치지 않는다.
  - sop-platform 저장소 전체 — 이 세션도, 다음 세션도 별도 승인 없이 만지지 않는다.

[11] 세션별 추가 항목

  A. 제거 파일 목록과 §5.A 대조 결과 (누락·초과 0건)
    [5]의 카테고리별 표가 그 증거다. 12개 카테고리 각각의 실측 개수가 §5.A가
    명시한 개수(52/38/3/8/12/12/1/21/1 + 스킬 8 + 문서 32 + 루트 3)와 정확히
    일치하고, 12개 카테고리 합(191)이 전체 삭제 파일 수(191)와 정확히 같다 —
    즉 §5.A 목록 밖에서 삭제된 파일이 0개이고, §5.A 목록 안에서 빠뜨린 파일도
    0개다.

  B. src/app/api/ai/route.ts diff — /flow 동작 무변경 근거
    diff 전문은 [6] 상단 명령 실행 기록과 별개로 `git diff 52b8377 --
    src/app/api/ai/route.ts`로 확인했다(158줄 분량, 이 문서에는 요지만 남긴다).
    제거된 것: SOP 전용 import 6개, `case 'generateSop'` 블록 전체(65줄),
    `graphKindType === 'sop'` 후처리 블록 전체(66줄, generateRepair·
    generateSuggestionPatch 콜백 포함), SOP 전용 1차 생성 재시도 래퍼.
    복원된 것: `generationMaxOutputTokens`를 `graphKind === 'sop' ? 65536 : 16384`
    삼항에서 `16384` 상수로(주석 `// 실제 필요량 6,000 + 여유분`도 SOP 도입 전
    원문 그대로 복원 — 근거는 커밋 39fe951의 diff), 1차 생성을
    `const { object: firstObject } = await generateObject(...)` 단순 호출로(근거는
    커밋 faa4f5e의 diff, SOP 재시도 도입 직전 원문).
    무변경 확인: generateAsIsFlow/generateToBeFlow/generateChangeStrategy/
    generateDrilldown/generateNodeSplit 5개 case 블록, validateFlowGraph·
    validateDrilldownBranching 호출과 그 repair 루프(16384 고정값 두 곳),
    normalizeMetrics/sanitizeResponseShapes/salvageFromError 헬퍼 함수 전부
    — diff에 한 줄도 나타나지 않는다.
    `export` 검증: `grep -n "^export " src/app/api/ai/route.ts` → `export async
    function POST` 1건뿐(REQ-E4-007 충족).

  C. /flow 게이트 결과 대조표 — 제거 전 / 제거 후 / E0_BASELINE_EVIDENCE.md
    항목                    E0_BASELINE(52b8377)   이 세션 제거 전    이 세션 제거 후
    tsc --noEmit            PASS, 오류 0            PASS, 오류 0       PASS, 오류 0
    lint                    PASS, 0 err/1 warn      (미실행, 아래 참고) PASS, 0 err/1 warn
    test:flow-branches      37/37                   37/37              37/37
    test:shapes             flow-shapes+terminal 6/6 6/6               6/6
    build(Turbopack)        PASS EXIT 0             PASS EXIT 0(29라우트) PASS EXIT 0(8라우트)
    next build --webpack    PASS EXIT 0             PASS EXIT 0(29라우트) PASS EXIT 0(8라우트)
    verify:quality          7규칙·185파일            (미실행)           PASS 3규칙·59파일
    git diff --check        PASS EXIT 0             (미실행)           PASS EXIT 0
    (제거 전 lint·verify:quality·git diff --check는 REQ-E4-003이 명시한 "제거 전
    /flow 기준선" 4개 명령에 포함되지 않아 실행하지 않았다 — 명령 자체는
    E4_08_ORIGIN_CLEANUP.md 시작 조건 절이 지정한 test:flow-branches/test:shapes/
    build/webpack build 4개뿐이었다.)
    라우트 수 변화(29→8)는 SOP 라우트 21개(app/sop 12 + api/sop 12 - 겹치는
    표기 없음... 실제로는 app/sop 페이지 다수 + api/sop 라우트들)가 사라진
    자연스러운 결과이며, 남은 8개(/  /_not-found  /api/ai  /api/models  /export
    /flow  /room/[roomId]  /strategy)는 제거 전 29개 목록의 부분집합과 정확히
    일치한다(직접 대조함).

  D. 의존성 제거 실측 출력과 최종 제거 목록, npm ci && npm run build 결과
    실측 출력은 [5]에 원문 포함. 최종 제거 목록: 없음(0개) — package.json의
    dependencies/devDependencies 절은 diff 결과 완전히 무변경([6] package.json
    diff 확인, scripts 3줄만 삭제됨).
    `npm ci && npm run build`: SKIPPED (사유: 의존성을 하나도 제거하지 않았으므로
    lockfile·node_modules 재설치로 검증할 대상이 없다 — 기존 node_modules로
    Turbopack·webpack 빌드를 이미 각 2회씩(제거 전/후) EXIT 0으로 통과시켰다.
    `npm ci`는 네트워크 재설치를 동반하는 무거운 작업이라 변경 없는 의존성에
    대해서는 실행하지 않았다). package-lock.json·node_modules 변경 0건
    (`git status --short package-lock.json node_modules` 출력 없음).

  E. 남긴 SOP 흔적과 이유
    - graph-validation.ts의 SOP 전용 함수(validateSopGraph·validateSopFull·
      classifySopStepType 등): REQ-E4-005가 이 세션의 제거 대상에서 명시적으로
      제외했다. 파일을 열지 않았다.
    - docs/sop-standalone-extraction/**: INT-E4-001이 "SOP가 왜 이 저장소를
      떠났는가의 기록"으로 명시적으로 보존을 요구했다. 이 세션 자신이 그 기록을
      근거로 실행했다.
    - favicon.ico: Next.js 앱 전역 파비콘 규약 파일이며 SOP 전용이 아니다(§5.B,
      P3 handoff의 오류로 정정된 항목).
    - FloatingDock.tsx의 죽은 '/sop' 분기, model-factory.ts의 역사적 docstring:
      [4] 해석-5, [9] 참고 — 배타적 소유 밖이라 편집하지 않았다.

  F. 브라우저 확인 결과 — /, /flow, /strategy, /export, /room, /sop(404)
    프로덕션 빌드(webpack build 산출물)를 포트 3555에서 `next start`로 기동한
    뒤 Chrome DevTools MCP로 확인했다.
    /: 랜딩 렌더 확인, "SOP Prototype" 버튼 없음(a11y 스냅샷에 해당 버튼도
      Sparkles 아이콘도 없음), "내 프로젝트"·"As-Is 분석"·"To-Be 설계"·
      "변화 전략" 카드 레이아웃 정상(버튼 제거로 인한 레이아웃 붕괴 없음).
    /flow: 렌더 확인, 콘솔 에러 0건, 업무 맥락 입력 폼과 FloatingDock
      내비게이션(Home/Flow/Strategy/Export) 4개 링크 전부 확인.
    /strategy, /export: 렌더 확인, 콘솔 에러 0건.
    /sop: HTTP 404(curl로 사전 확인) + 브라우저에서도 "404 This page could not
      be found" 렌더, FloatingDock 내비게이션은 404 페이지에서도 정상 표시.
    /room/[roomId](/room/test1): HTTP 500. 서버 로그: "Invalid Liveblocks client
      options. Please provide either a `publicApiKey` or `authEndpoint` option."
      Liveblocks 환경변수(.env.local의 LIVEBLOCKS_SECRET_KEY 등) 미설정이 원인으로
      보이며, 이 세션은 Liveblocks 관련 파일을 하나도 열지 않았다. 다만 제거
      전에 /room을 확인하지 않아 직접 대조는 못했다 — [7]·[12] 참고.

  G. verify-quality.mjs 규칙 변경 — 제거 3개 / 유지 3개 / inline-pad-format 판단
    제거 3개(§6 명시): suggestion-enum-literal, document-status-label,
      step-status-label — 셋 다 allow 목록이 가리키던 파일(sop-step-common-
      schema.ts, sop-review-status-meta.ts)이 이미 삭제됐다.
    유지 3개: provider-import, provider-env-key, provider-options — /flow가
      여전히 model-factory.ts를 통해 AI를 호출하므로 그대로 뒀다.
    inline-pad-format(추가 제거, 판단 근거): `grep -rn "\.padStart(" src/
      components/ --include=*.ts --include=*.tsx` → 0건(SOP 제거 후 재실행).
      이 규칙이 지키려던 원천(formatActivityCode 등, sop-format.ts)도 이미
      삭제됐고 /flow 컴포넌트는애초에 padStart를 쓰지 않아, 남기면 3개 지정
      규칙과 같은 성격의 영구 무의미 규칙이 된다고 판단해 제거했다.
    결과: 7규칙 → 3규칙, 185파일(agent-shift 기준) → 59파일(SOP 파일 소멸로
      검사 대상 자체가 줄어든 자연스러운 결과).

  H. 문서 5종(AGENTS·CLAUDE·GEMINI·copilot-instructions·README) 편집 요약
    AGENTS.md: "## SOP customer-requirement work" 절 전체(경로 목록, 스킬 참조,
      verify:sop-customer 명령 3곳 포함) 제거. "General change discipline"·
      "Code quality conventions"는 원문 그대로 유지(§7 지시대로). 다만 그 결과
      "Do not commit or push..." 문장이 삭제된 절 안에만 있었다는 것을 뒤늦게
      확인하고, General change discipline 절 끝에 같은 문장을 새 불릿으로
      추가했다(REQ-E4-011).
    CLAUDE.md: SKILL.md 경로·verify:sop-customer 3곳·Gemini/Terra 동시 작업
      금지 앞의 SOP 전제를 제거하고, "Preserve `/flow`, existing tests, dirty
      worktree changes, read-only Store guards, and review/Agentization
      invalidation rules." → "Preserve `/flow`, existing tests, dirty worktree
      changes, and read-only Store guards."로 SOP 전용 항목(review/Agentization
      invalidation)만 뺐다. commit·push 금지 문장은 그대로.
    GEMINI.md(삭제가 아니라 편집): SKILL.md 참조 절, DOCX 스크린샷/디자인 시스템
      절 제거. "Preserve `/flow`, dirty worktree changes, executable tests,
      read-only Store guards, lifecycle boundaries, and review/Agentization
      invalidation." → "Preserve `/flow`, dirty worktree changes, and
      executable tests."로 SOP 전용 항목만 뺐다. Sonnet/Terra 동시 작업 금지·
      Stitch 확인·commit·push 금지 문장은 그대로.
    .github/copilot-instructions.md: SOP 언급 자체가 0건이었다(grep 재확인,
      exit 1) — 편집하지 않았다.
    README.md: SOP 언급이 원래 0건이었다(agent-shift 원본 README는 애초에
      SOP를 설명한 적이 없다 — P1_HANDOFF §8이 이미 "byte 동일"로 확인한
      상태). 제거할 것이 없어 INT-E4-001이 요구한 분리 사실 한 줄만
      배지 목록 다음에 blockquote로 추가했다([11]-I).
    commit·push 금지 규칙 유지 확인: 5개 문서 중 규칙을 갖고 있던 3개
      (AGENTS.md·CLAUDE.md·GEMINI.md) 전부 최종본에도 그 문장이 있다
      (grep "commit or push" 3개 파일 모두 1건 이상).

  I. README.md에 추가한 새 저장소 위치 한 줄
    "> 이 저장소가 한때 함께 담고 있던 SOP 작성·승인 프로토타입은 독립 저장소
    `sop-platform`으로 분리됐다. 분리 경위는
    [docs/sop-standalone-extraction/](docs/sop-standalone-extraction/)를
    참고한다." — 새 저장소의 실제 URL(로컬 경로·원격 주소)은 적지 않았다
    (REQ-E4-008, INT-E0-001: 원격 미정).

  J. 후속 라운드로 넘기는 것
    - graph-validation.ts·flow-shapes.ts·flow-layout.ts의 원본 쪽 좁히기
      (SOP 전용 분기 제거) — REQ-E4-005가 이 세션 범위 밖으로 명시.
    - FloatingDock.tsx:99의 죽은 `/sop` pathname 분기 정리 — 트리비얼하지만
      이 세션의 배타적 소유 밖.
    - model-factory.ts:8-9의 역사적 docstring 재검토 필요 여부 — [9] 참고,
      이 세션은 그대로 두는 것이 맞다고 판단했으나 관리자 확인을 요청한다.
    - /room의 Liveblocks 환경변수 설정 — 운영/배포 설정 사항, 코드 변경 아님.

[12] 관리자 확인 요청
  커밋 승인 필요: 예 (agent-shift)
  제안 커밋 메시지: chore(sop): remove SOP prototype after extraction to sop-platform
  판단이 필요한 지점:
  - TST-E4-004의 grep 잔존 검사에서 프롬프트가 예상한 2개 예외(graph-validation.ts,
    flow-shapes.ts) 외에 2건이 더 나왔다: FloatingDock.tsx:99의 죽은
    `pathname.startsWith('/sop')` 조건, model-factory.ts:8-9의 역사적 docstring
    ("이전에는 ... /api/sop/task-recommendations ..."). 둘 다 이 세션의 배타적
    소유 파일 목록(§4) 밖이라 편집하지 않고 그대로 두었다 — "소유 밖 변경 0건"
    규칙을 "grep 0건" 요구보다 우선했다. 관리자가 이 두 잔존을 이번 라운드에서
    함께 지워도 좋다고 판단하면 후속 지시를 요청한다.
  내가 확신하지 못하는 부분:
  - /room/test1의 HTTP 500(Liveblocks 키 미설정)이 SOP 제거 이전부터 있던
    상태인지 이 세션이 만든 회귀인지 직접 대조하지 못했다 — 제거 전 baseline에
    /room을 포함하지 않았다(work order의 REQ-E4-003이 명시한 4개 기준선 명령에
    /room 확인이 없었다). 원인이 Liveblocks 환경변수이고 이 세션이 Liveblocks
    관련 코드를 전혀 열지 않았다는 점에서 회귀가 아니라고 판단하지만, 직접
    대조 증거는 없다.
  - inline-pad-format 규칙 제거(REQ-E4-010이 "판단하라"고 위임한 부분)가
    맞는 판단인지 최종 확인을 요청한다 — 실측(padStart 0건)은 확실하지만
    "판단"의 성격상 사람 확인이 유용할 것 같다.

=== END REPORT ===
