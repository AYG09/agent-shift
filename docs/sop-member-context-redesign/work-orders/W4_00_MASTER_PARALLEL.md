# 작업지시서 W4-00 — 구성원 진입 IA 2차 재설계 병렬 실행 관리자

## 배경

1차 재설계(Wave 0~3)로 `로그인 → 업무맥락 → 추천 → Work Map → 생성 → Workspace`가 동작한다.
프로덕션에서 실제로 써 본 결과 **진입 구조에 네 가지 결함**이 확인됐다.

1. 앱 랜딩의 SOP 버튼이 `/sop/setup`(구 혼합 화면)을 하드코딩해, 새 흐름을 거치지 않고 옛
   화면이 첫 화면으로 나타난다.
2. SOP가 0건인 신규 구성원에게 빈 Home 대시보드를 먼저 보여준다. 재설계가 없애려던 "지금
   뭘 해야 하는지 모르겠는 화면"을 입구에 다시 만든 셈이다.
3. 세 생성 경로가 각각 다른 경험처럼 배치돼 있다. 실제로는 **Work Map 초안을 만드는 방법만
   다르고 이후는 완전히 동일한 하나의 파이프라인**이다.
4. 동료·과거 복제 경로가 `/sop/workspace`로 직행해 Work Map 편집 단계를 건너뛴다.
   `final-system-scenario-contract.md` §2.3은 복제본에 대해서도 "Activity와 이후 SOP 내용을
   자신의 업무에 맞게 수정"을 요구한다.

## 이 라운드가 바꾸는 것과 바꾸지 않는 것

**바꾼다**: 어디로 진입하는가, Home이 언제 등장하는가, 세 경로가 어떻게 한 파이프라인으로
합류하는가.

**바꾸지 않는다**: Home의 표시 항목(신원 5개·상태별 건수·T/A/S 수·활성 3 + TBD 1), 승인
생애주기, Activity–Sub Action 계약, Agent화 판단 분리, 노드 작성 계약, HR 분석, `/flow`.
1차 재설계의 화면 자체(login/context/recommendation/work-map 두 밀도)도 그대로 둔다.

## 문서 선행 규칙

이번 변경은 통합이 아니라 **UX 계약 변경**이다. `QUALITY_CONVENTIONS.md`의 "규칙과 충돌하는
요구가 생기면 문서를 먼저 갱신한 뒤 코드를 바꾼다"에 따라, `SPEC.md`(§2.2 라우트 가드,
§4.2 무효화 규칙)와 `CONTEXT.md`(§4 목표 사용자 여정)를 **W4-01 Foundation 세션이 코드보다
먼저** 갱신한다. 다른 세션은 그 갱신된 문서를 근거로 구현한다.

## 의존성 그래프

```text
W4-01 Foundation (단독 writer, 선행)          W4-02A 랜딩 입구 (완전 독립, 즉시 시작 가능)
  domain + store + SPEC/CONTEXT                 src/app/page.tsx 한 줄
        │
        ├──────────────┬──────────────┐
        ▼              ▼
   W4-03B          W4-04C
   Home 착지·시작점  복제 경로 Work Map 합류
        │              │
        └──────┬───────┘
               ▼
   W4-05 Integration (단독 writer)
```

W4-02A는 Foundation 산출물을 전혀 쓰지 않으므로 **W4-01과 동시에** 시작한다.
W4-03B와 W4-04C는 Foundation handoff 이후 **서로 병렬로** 진행한다.

## 파일 소유권 레지스트리

한 파일의 active owner는 동시에 한 세션뿐이다.

| 세션 | 배타적 소유 파일 |
|---|---|
| W4-01 | `src/lib/sop-member-intake.ts`, `src/lib/sop-work-map-draft.ts`, `src/lib/sop-prototype-store.ts`, `docs/sop-member-context-redesign/SPEC.md`, `docs/sop-member-context-redesign/CONTEXT.md`, `tests/sop-member-intake-domain.test.ts`, `tests/sop-work-map-domain.test.ts` |
| W4-02A | `src/app/page.tsx` |
| W4-03B | `src/components/sop/SopMemberHome.tsx`, `src/app/sop/page.tsx`, `src/components/sop/SopMemberLoginGate.tsx`, `tests/sop-member-home.test.ts` |
| W4-04C | `src/components/sop/SopColleagueTemplatePicker.tsx`, `src/components/sop/SopOwnPriorPicker.tsx`, `src/lib/sop-setup-actions.ts`, `tests/sop-clone-work-map-entry.test.tsx`(신규) |
| W4-05 | 통합 시 전체 (다른 세션 종료 후) |

**모든 세션 수정 금지**: `src/app/flow/**`, `src/components/flow/**`, `src/app/api/ai/route.ts`,
`src/components/sop/SopWorkMapSimpleView.tsx`, `src/components/sop/SopWorkMapDetailedView.tsx`,
`src/components/sop/SopSetupGate.tsx`, 승인·HR·생성 backend 일체.

Work Map 뷰 두 개를 금지 목록에 둔 것이 이번 설계의 핵심이다 — 복제 경로의 완료 동작 분기는
뷰가 아니라 `confirmWorkMapAndProceed`(W4-04C 소유) 안에서 처리한다. 그래서 1C/1D 산출물을
아무도 건드리지 않는다.

## 세션 간 고정 인터페이스 계약

병렬 세션이 실행 중 서로 협상할 수 없으므로, 아래 경계는 **불변**으로 고정한다. 바꿔야 한다고
판단하면 직접 고치지 말고 `FOUNDATION_CHANGE_REQUEST`로 넘긴다.

1. **Picker props** — W4-04C는 두 picker의 props 시그니처를 바꾸지 않는다.

   ```ts
   SopColleagueTemplatePicker({ onClose, navigate, fetchImpl })
   SopOwnPriorPicker({ records, onClose, navigate, fetchImpl })
   ```

   W4-03B는 카드 배치를 어떻게 바꾸든 이 두 컴포넌트를 **같은 props로 계속 마운트**한다.

2. **`confirmWorkMapAndProceed` 시그니처** — W4-04C는 내부 동작만 바꾸고 호출 시그니처
   `{ confirmWorkMap, setWorkLibrary, navigate }`를 유지한다. Work Map 뷰 두 개가 이 형태로
   호출하고 있으며 그 파일들은 수정 금지다.

3. **Work Map 초안의 출처 필드** — W4-01이 `MemberWorkMapDraft`에 `origin`을 추가한다.
   W4-04C는 그 값을 읽기만 하고 정의하지 않는다.

## 알려진 worktree 제약 — `npm run build`와 `npm run dev` 모두 통합 worktree에서만 가능

병렬 worktree의 `node_modules`는 메인 저장소로의 junction이다. Next 16의 기본 번들러인
Turbopack은 이를 거부한다.

```text
Symlink node_modules is invalid, it points out of the filesystem root
```

W4-02A 세션이 이 실패를 보고했고 실행 관리자가 baseline에서 재현해 **코드와 무관한 인프라
문제**임을 확인했다. 따라서:

- 병렬 세션(W4-01/02A/03B/04C)의 완료 게이트에 `npm run build`를 요구하지 않는다.
  실패해도 그 세션의 결함이 아니다.
- 빌드 검증은 실제 `node_modules`를 가진 **메인 worktree의 W4-05 통합 단계**에서 수행한다.
- worktree에서 굳이 빌드를 확인해야 하면 `npx next build --webpack`으로 우회할 수 있으나,
  그 경로는 아래 별도 항목의 baseline 타입 오류에 부딪힌다.
- **`npm run dev`도 같은 이유로 죽는다** (W4-03B가 보고하고 실행 관리자가 재현). 따라서
  브라우저 렌더 확인은 병렬 worktree에서 아예 불가능하며, 실제 `node_modules`를 가진 메인
  worktree(W4-05) 또는 preview 배포에서만 수행할 수 있다. 병렬 세션이 브라우저 검증을
  못 했다고 보고하는 것은 정상이며 그 세션의 결함이 아니다.
- `.next/dev/lock`이 남아 있으면 "Unable to acquire lock"이라는 **다른** 오류가 먼저 난다.
  진짜 원인을 가리므로 잠금을 지우고 한 번 더 확인한 뒤 판단한다.

## 사용 가능한 디자인·브라우저 능력 (2026-08-26 확인)

이전 wave들이 `DESIGN_CAPABILITY_BLOCKED`로 남겼던 항목이 **실제로 열렸다**. 실행 관리자가
프로덕션에 붙여 동작을 확인했다.

| 능력 | 도구 |
|---|---|
| 브라우저 렌더링·조작·스크린샷 | `playwright` MCP, `chrome-devtools` MCP |
| 접근성 감사 (focus·키보드·ARIA·명암비) | `chrome-devtools-mcp:a11y-debugging` 스킬, `lighthouse_audit` |
| 디자인 탐색·시안 | `frontend-design` 스킬, `claude-design` MCP, `stitch` MCP |

따라서 **`DESIGN_CAPABILITY_BLOCKED`는 더 이상 기본 회피 경로가 아니다.** 도구가 실제로
실패한 경우에만 그 사유와 원문 오류를 함께 보고한다. 호출하지 않고 그 값을 쓰는 것은
허위 보고다.

주의: `browser_run_code_unsafe`는 어떤 세션도 사용하지 않는다. 브라우저 MCP가 저장소에
남기는 `.playwright-mcp/` 산출물은 `.gitignore`에 등록되어 있으므로 커밋하지 않는다.

## 각 세션의 완료 게이트

```bash
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

소유 파일 밖 변경은 0건이어야 한다. 소유 테스트는 반드시 실행한다.

## W4-05가 함께 처리할 baseline 결함 — `api/ai/route.ts`의 비-route export

`npx next build --webpack`을 돌리면 다음에서 실패한다.

```text
.next/types/app/api/ai/route.ts: Type error
Property 'getAsIsPrompt' is incompatible with index signature.
```

원인은 `src/app/api/ai/route.ts`가 route handler가 아닌 심볼
(`getAsIsPrompt`, `getToBePrompt`, `getDrilldownPromptAsIs`, `getDrilldownPromptToBe`,
`getNodeSplitPrompt`)을 export하는 것이다. Next의 생성 route 타입 검증기가 이를 거부한다.
Turbopack 빌드는 통과하지만 webpack 빌드와, `.next/types` 산출물이 남은 상태의
`tsc --noEmit`은 실패한다. 이 저장소에서 실제로 세 번 관측됐다.

W4-05는 이 정리를 함께 수행한다 (다른 W4 세션은 이 파일 수정 금지).

- 다섯 prompt builder를 route가 아닌 모듈(권장: `src/server/flow/flow-prompts.ts`)로
  **무동작변경 이동**한다.
- `src/app/api/ai/route.ts`는 그 모듈에서 import해 쓰고, route handler만 export한다.
- 유일한 외부 사용처인 `tests/flow-branches.test.ts`의 import 경로를 갱신한다.
- `npm run test:flow-branches`와 `npm run test:shapes`로 `/flow` 무회귀를 증명한다.
- prompt 문자열·동작·schema는 한 글자도 바꾸지 않는다.

## W4-05 최종 게이트

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

## HANDOFF 형식

```text
1. baseline commit / branch / worktree
2. 변경 파일 (소유 목록과 대조)
3. 충족한 SPEC requirement·test ID
4. 새로 도입한 구현 해석
5. 실행한 명령과 PASS/FAIL
6. 실패 명령의 원문 오류
7. FOUNDATION_CHANGE_REQUEST 또는 통합 요청
8. Claude 디자인 기능 실제 사용 여부 (없으면 DESIGN_CAPABILITY_BLOCKED)
9. 미완료·보류
10. 다음 세션이 건드리면 안 되는 파일
```

명시적 권한 없이는 commit·push하지 않는다.
