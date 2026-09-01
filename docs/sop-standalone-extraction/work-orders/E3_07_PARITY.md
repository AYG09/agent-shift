# 작업지시서 E3-07 — 동등성 검증 (P3, sop-platform, 단독)

## 임무

**"옮겼다"의 증거는 파일 존재가 아니라 새 저장소에서 같은 테스트가 통과하는 것**이다
(`EXTRACTION_SPEC.md` §1). 이 세션은 그 증거를 만든다. 통과하기 전까지 P4는 시작할 수 없고,
원본에서 SOP를 지울 수 없다.

`REQ-E3-001`: 이 세션은 **검증자이지 구현자가 아니다.** 결함을 발견하면 직접 고치지 않고
소유 세션(P2-A~D)에 반려한다. 예외는 §5의 두 가지뿐이다.

## 저장소

```text
C:\Users\USER\Desktop\NOCODE\sop-platform   (branch: main)
대조 기준: C:\Users\USER\Desktop\NOCODE\agent-shift @ 52b8377  (읽기 전용)
```

## 시작 조건

P2-A·P2-B·P2-C·P2-D **네 세션의 handoff를 전부** 받은 뒤에만 시작한다. 하나라도 미완이면
중단한다 — 미완 상태의 게이트 결과는 대조 기준이 될 수 없다.

```bash
cd C:/Users/USER/Desktop/NOCODE/sop-platform
git status --short
git log --oneline            # 커밋이 없어도 정상 (아직 승인 전)
```

`E0_BASELINE_EVIDENCE.md`의 **게이트 baseline 표**가 이 세션의 대조 기준이다.

## 배타적 소유 파일

```text
docs/sop-standalone-extraction/work-orders/E3_PARITY_EVIDENCE.md   (신규)
package.json      의 test:sop 스크립트 (P2-B·P2-C가 요청한 신규 테스트 2개 반영만)
```

`REQ-E3-002`: `package.json`에 대한 허용 변경은 **`test:sop`에 다음 두 파일을 추가하는 것**
뿐이다. 다른 어떤 필드도 만지지 않는다.

```text
tests/sop-provider-key-resolution.test.ts     (P2-B 요청)
tests/sop-generate-route-parity.test.ts       (P2-C 요청)
```

## 구현 지시

### 1. 전체 게이트를 실행한다

`PARALLEL_EXECUTION.md` §8의 목록 그대로다. 각 명령의 **PASS/FAIL과 수치를 원문으로** 기록한다.

```bash
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npx next build --webpack
npm run verify:quality
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
git diff --check
```

`TST-E3-001` (= `TST-EXT-004`): 위 명령의 **PASS/FAIL 조합이 `E0_BASELINE_EVIDENCE.md`의
값과 동일**해야 한다. `test:shapes`·`test:flow-branches`는 새 저장소에 없으므로 대조에서
제외한다 — 그 외 항목이 하나라도 다르면 이관 결함이다.

`TST-E3-002`: **테스트 수가 줄지 않았다.** `test:sop`이 실행하는 파일은 baseline의 20개 +
신규 2개 = **22개**여야 한다. 줄었다면 이관 누락이다.

`TST-E3-003` (= `REQ-RUN-010`): `npm run build`와 `npx next build --webpack`이 **둘 다**
통과한다. 이 저장소에서 Turbopack만 통과하고 webpack이 실패하는 결함이 실제로 있었다.

### 2. 고객 fixture 불변식을 대조한다

`TST-E3-004` (= `TST-EXT-005`): `verify:sop-customer -- --final`의 출력 수치가
`E0_BASELINE_EVIDENCE.md`와 같아야 한다.

```text
Job 2개 · Task 10개 · Activity 138개 · Activity-Skill 관계 690개 · 대표 Task의 Activity 14개
```

### 3. 외부망 차단 상태 기동을 확인한다

`TST-E3-005` (= `TST-RUN-002`): 외부망을 차단한 상태에서 앱을 기동해 다음을 확인한다.

- 모든 화면이 렌더된다 (AI 기능 제외)
- 로그인 → 업무맥락 → **수동 Task 선택** → Work Map 편집 → 승인 → HR 조회가 동작한다
- **AI 호출만** 명확한 오류로 실패하고, 입력이 보존되며, 수동 경로가 살아 있다

`INT-E3-001`: 이 조건은 원본 프로덕션에서 이미 부분적으로 관측됐다 — API 키가 없는 상태에서
추천이 실패해도 수동 검색으로 Work Map까지 도달했다
(`W4_BASELINE_A11Y_EVIDENCE.md`). 같은 성질이 유지되는지 보는 것이다.

`INT-E3-002`: `next/font/google`은 **빌드 시점에만** 네트워크를 쓰고 런타임에는 self-host된다
(`INT-E0-003`). 따라서 이 검사는 **빌드가 끝난 산출물을 차단 상태에서 기동**하는 방식으로
한다. 빌드 자체의 네트워크 의존은 `REQ-RUN-008` 미충족 항목으로 **별도 기록**하고 이
검사의 실패로 처리하지 않는다.

### 4. 브라우저에서 구성원 전체 흐름을 확인한다

`TST-E3-006` (= `TST-EXT-006`): 다음 순서가 실제로 동작한다.

```text
로그인 → 업무맥락 → 추천(또는 수동 선택) → Work Map 두 밀도(simple/detailed)
      → Task-wide 생성 → Workspace → 승인 요청 → 직책자 → SME → HR 집계
```

`REQ-E3-003`: AI 생성 단계는 **provider 키가 없으면 실패하는 것이 정상**이다
(`INT-RUN-001`의 1차 기본값: AI 비활성). 그 경우 다음을 확인하는 것으로 대체한다.

- 실패 시 **입력이 보존**된다
- **수동 Task 선택 경로**가 살아 있다
- 오류 문구가 **복구 경로를 포함**한다 (`REQ-RUN-013`)
- 가짜 진행률·ETA·confidence를 만들지 않는다 (`REQ-AI-004`)

키가 있는 환경에서 검증할 수 있다면 실제 생성까지 확인하고, 그 결과를 `TST-EXT-002`
(같은 wire 입력 → 같은 문서)의 실측 근거로 기록한다.

`REQ-E3-004`: 세 생성 경로 전부를 확인한다 — Task 추천, **동료 템플릿 복제**, **과거 문서
복제**. W4 라운드가 이 세 경로를 하나의 파이프라인으로 통합했고, 복제 경로는 Work Map(simple)을
거쳐 재생성 없이 Workspace에 도달한다.

`REQ-E3-005`: 비영속 표시가 화면에 남아 있는지 확인한다 (`REQ-RUN-005`) —
"서버는 in-memory reference 저장소 기준이며 재시작 시 초기화될 수 있습니다".

### 5. 접근성 기준선을 대조한다

`TST-E3-007` (= `REQ-EXT-007`): `docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md`
의 **실측값을 그대로 대조 기준**으로 쓴다. 5건 전부 같은 결과가 나와야 한다.

| ID | 대상 |
|---|---|
| A11Y-1 | Work Map 상세의 Skill 설명 focus 표시 |
| A11Y-2 | 업무맥락 textarea의 accessible name |
| A11Y-3 | Task 정의 라벨과 Task명 오류 연결 |
| A11Y-4 | 로딩 스피너의 reduced-motion 대응 |
| A11Y-5 | "Task 직접 찾기" 토글의 `aria-expanded` |

같은 문서 §112의 **대조 방법**을 그대로 따른다. 결과가 다르면 **이관 중 회귀**이며,
그 자체가 이 세션의 FAIL 사유다.

`INT-E3-003`: 루트 layout에서 `FloatingDock`이 빠졌지만 그것은 `/sop` 경로에서 원래
렌더되지 않았으므로 이 대조에 영향을 주지 않는다 (`INT-E0-002`). 대조 결과가 다르다면
다른 원인을 찾아야 한다 — dock 제거로 설명하지 마라.

### 6. 결함을 발견했을 때

`REQ-E3-006`: 다음 두 가지만 이 세션이 직접 고친다.

1. `package.json`의 `test:sop` 스크립트에 신규 테스트 2개 추가 (§배타적 소유)
2. **명백한 오타 수준의 문서 링크 깨짐** — 코드·테스트·계약과 무관한 것에 한정

그 외 전부는 **반려한다.** 반려 형식:

```text
- 결함 요약 (한 문장)
- 재현 명령과 원문 오류
- 소유 세션 (P2-A / P2-B / P2-C / P2-D / P1)
- 대조 baseline 값과 실제 값
- 이것이 이관 결함인지, 원본에도 있던 것인지 (E0_BASELINE_EVIDENCE.md와 대조)
```

`REQ-E3-007`: **원본에도 있던 실패를 이관 결함으로 보고하지 않는다.**
`E0_BASELINE_EVIDENCE.md`가 그 구분을 위해 존재한다.

### 7. P4 시작 신호를 만든다

`REQ-E3-008`: 위 검증이 **전부 통과했을 때만** P4 시작 handoff를 낸다.
부분 통과로 신호를 내지 않는다 (`REQ-PAR-007`) — 검증되지 않은 이관 상태에서 원본을 지우면
되돌릴 근거가 사라진다.

## 금지

- 결함을 직접 고치는 것 (§6의 두 예외 외)
- SOP 도메인 코드·테스트 단언 수정
- `package.json`의 `test:sop` 외 필드 수정
- 게이트 명령을 건너뛰거나 결과를 요약해서 기록하는 것
- 브라우저 검증을 코드 읽기로 대체하는 것 — **실행 가능한 사용자 흐름이 증거다**
- 부분 통과 상태에서 P4 시작 신호를 내는 것
- `agent-shift` 수정 / 사용자 승인 없는 commit

## 수용 검증

`E3_PARITY_EVIDENCE.md`가 담아야 할 것:

1. 게이트 10개 명령의 실행 결과 원문 (PASS/FAIL, 테스트 수, 실패 시 오류 전문)
2. `E0_BASELINE_EVIDENCE.md`와의 **대조표** — 항목별 baseline / 실측 / 일치 여부
3. fixture 불변식 실측 수치
4. 외부망 차단 기동 결과와 `REQ-RUN-008` 미충족 기록
5. 브라우저 구성원 전체 흐름 — 단계별 결과, 세 생성 경로 각각
6. A11Y-1~5 대조 결과 (기준선 값 / 실측값 / 일치 여부)
7. 반려 목록 (있다면) — 소유 세션별로
8. P4 시작 가능 여부 판정과 그 근거

## 인계

`E0_00_MASTER.md` §12 형식에 더해:

1. **P4 시작 신호** — 전부 통과했을 때만
2. P4가 `agent-shift`에서 제거해야 할 **정확한 파일 목록** (E1이 실제로 이관한 것 기준)
3. P4의 `/flow` 회귀 대조 기준 — `E0_BASELINE_EVIDENCE.md`의
   `test:flow-branches`·`test:shapes` 결과
4. 이 라운드에서 **남은 보류 항목** 목록 — provider 미교체, DB 미도입,
   `next/font/google` 빌드 네트워크 의존, `/sop` 접두사 유지,
   `flow-shapes.ts`·`gemini-models.ts` 파일명, `localStorage` 키 이름,
   인라인 패치 프롬프트 위치
5. 사용자에게 보고할 **커밋 승인 요청** — 이 시점까지 어떤 세션도 commit하지 않았다
