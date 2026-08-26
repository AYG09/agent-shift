# 작업지시서 W4-05 — 통합 (단독 writer)

## 임무

W4-01/02A/03B/04C의 검증된 결과를 하나의 흐름으로 순차 통합하고, 세 생성 경로가 실제로 한
파이프라인으로 동작하는지 실행 가능한 시나리오로 증명한다.

## 시작 조건

**`W4_BASELINE_A11Y_EVIDENCE.md`를 먼저 읽는다.** 통합 전 프로덕션에서 실측한 접근성
기준선과 흐름 동작, 그리고 "프로덕션에 AI API KEY가 없어 추천 성공 경로는 검증할 수 없다"는
환경 제약이 그 문서에 있다.

다음이 모두 있어야 시작한다.

- 네 세션의 HANDOFF와 changed-file 목록, 테스트 결과
- 모든 writer 세션이 중지됐다는 확인
- 통합 worktree의 단독 소유권

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

각 handoff의 narrative가 아니라 **실제 diff와 테스트**로 수용한다. changed-file 목록이
`W4_00_MASTER_PARALLEL.md`의 소유권 레지스트리와 일치하는지 대조하고, 목록 밖 변경이 있으면
그 자체를 blocker로 보고한다.

## 통합 순서

각 단계 직후 소유 테스트와 `npx tsc --noEmit`을 통과시킨 뒤 다음으로 간다.

1. W4-01 Foundation (문서 + 도메인 + Store)
2. W4-02A 랜딩 입구
3. W4-03B Home 착지·시작점
4. W4-04C 복제 경로 합류
5. 교차 검증과 시나리오 작성

## 통합 시 확인할 교차 지점

병렬 세션이 서로 못 보는 경계다. 여기가 이번 통합의 실제 위험 구간이다.

1. **picker 마운트 계약** — W4-03B가 카드를 재구성하면서도 두 picker를 계약된 props로 계속
   마운트하는지, W4-04C가 props를 바꾸지 않았는지 양쪽 diff로 대조한다.
2. **착지 판정의 단일 원천** — Home과 로그인 게이트가 같은 `resolveMemberLandingRoute`를
   쓰는지 확인한다. 한쪽이 자체 분기를 갖고 있으면 통합 단계에서 제거한다.
3. **완료 동작 분기** — Work Map 뷰 두 개가 수정되지 않았는지(`git status`로 0건 확인),
   그럼에도 복제본이 `/sop/workspace`로, Task 경로가 `/sop/setup`으로 가는지 실행으로 확인한다.
4. **가드 무결성** — 복제 채택이 확정 context를 채워 가드를 충족하는 방식이지, 가드 조건을
   완화한 것이 아닌지 `resolveIntakeRouteAccess` diff로 확인한다. 완화되어 있으면 되돌린다.
5. **무한 이동 없음** — `/sop` → `/sop/context` 이동이 조건 재평가로 되돌아오는 루프를 만들지
   않는지 확인한다.

## 실행 가능한 수용 시나리오

`tests/sop-customer-scenario.test.ts`에 이번 라운드 시나리오를 추가한다.

1. 신규 구성원(record 0) 로그인 → `/sop/context`로 착지, 빈 Home을 먼저 보지 않는다
2. record 보유 구성원 로그인 → `/sop` Home 착지, 신원·상태 건수·T/A/S가 모두 보인다
3. 진행 중 Work Map 초안 보유 → 해당 지점으로 복귀한다
4. Home의 세 시작점이 모두 활성이고 네 번째는 비활성 TBD다
5. 동료 SOP 복제 → Work Map(simple) 진입 → Activity 편집 → 완료 → Workspace, 재생성 없음
6. 과거 문서 복제 → 동일 경로, 원본 record 불변
7. Task 경로는 종전대로 Work Map 완료 → `/sop/setup` 생성 → Workspace
8. 세 경로가 만든 Work Map 초안이 모두 같은 selector·mutation을 사용한다
9. 복제본의 개인정보 미포함·승인/검토/Agent화 초기화가 유지된다
10. 기존 승인·HR·Activity–Sub Action·Agent화 시나리오 회귀 없음

## 함께 처리할 baseline 결함

`src/app/api/ai/route.ts`의 비-route export 정리를 이번 통합에서 함께 수행한다. 상세 지시와
근거는 `W4_00_MASTER_PARALLEL.md`의 해당 절에 있다. 요지는 다섯 prompt builder를
`src/server/flow/flow-prompts.ts`로 무동작변경 이동하고, route는 handler만 export하며,
`tests/flow-branches.test.ts`의 import 경로를 갱신한 뒤 `/flow` 회귀를 증명하는 것이다.

이 정리를 마친 뒤 `npx next build --webpack`도 한 번 통과시켜, Turbopack 경로에서만 우연히
통과하던 상태가 아님을 확인한다.

## 최종 게이트

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

새 테스트 파일은 `package.json`의 `test:sop` 체인에 등록한다. 등록하지 않으면 회귀 게이트가
그 파일을 실행하지 않는다.

## 브라우저 확인 (필수 게이트)

`playwright` 또는 `chrome-devtools` MCP가 이 환경에 연결되어 있으므로 **선택 항목이 아니다.**
Wave 3 이후 계속 미검증으로 남아 있던 항목을 이번에 닫는다. 1440×900과 1920×1080, zoom
100%에서 각각 확인하고 접근성 트리 스냅샷을 증거로 남긴다.

흐름:

- 랜딩 버튼 → `/sop` → (신규 구성원) 업무맥락 / (복귀 구성원) Home
- Home의 시작점 세 개가 각각 올바른 시작점으로 진입, 네 번째는 비활성
- 동료·과거 복제가 Work Map(simple)을 거쳐 Workspace에 도달, 재생성 없음
- Task 경로는 종전대로 Work Map → `/sop/setup` 생성

접근성 (`chrome-devtools-mcp:a11y-debugging` 사용):

- 키보드만으로 로그인 → context 제출 → 추천 확인 → Work Map 완료까지 이동 가능
- 접근성 5건(A11Y-1~5)은 **통합 전 프로덕션 기준선이 이미 측정되어 있다** —
  `W4_BASELINE_A11Y_EVIDENCE.md`에 각 항목의 실측값(클래스 문자열, ARIA 속성값, focus 이동
  여부)이 그대로 적혀 있다. 통합 후 같은 방식으로 다시 측정해 **그 값과 대조**하고, 다르면
  회귀로 보고한다. 그 문서의 "대조 방법" 절이 이번 라운드에서 깨지기 쉬운 지점을 지목한다.
- fixed footer·drawer가 마지막 콘텐츠를 가리지 않음

로컬 `npm run dev`로 확인해도 되고, `vercel deploy`(preview)로 배포해 확인해도 된다 —
**프로덕션(`main`)에 올려서 확인하지 마라.** Vercel CLI는 설치·로그인·프로젝트 연결이 이미
끝나 있다.

도구가 실제로 실패하면 그 원문 오류를 적고 미검증으로 남긴다. 호출하지 않고 수행했다고
기록하는 것은 허위 보고다.

## 금지

- 지적되지 않은 화면의 시각 재설계
- `/flow`, `src/app/api/ai/route.ts` 변경
- 승인·HR·노드 작성 계약 변경
- 네 세션 결과를 검증 없이 대량 병합

## 인계

마스터 HANDOFF 형식에 더해 다음을 기록한다.

1. 통합한 각 세션과 실제 changed files (소유권 레지스트리 대조 결과)
2. 교차 지점 5개의 확인 결과
3. 10개 시나리오의 PASS/FAIL
4. Work Map 뷰·Setup Gate 변경 0건 증거
5. 최종 게이트 전체 결과와 미검증 항목
