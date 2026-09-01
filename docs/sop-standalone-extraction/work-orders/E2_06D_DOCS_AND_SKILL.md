# 작업지시서 E2-06D — 문서·스킬 이관 정리 (P2-D, sop-platform, 병렬)

## 임무

E1이 그대로 복사해 놓은 문서·스킬·검증 스크립트가 **새 저장소에서 실제로 성립하도록** 고친다.
지금은 `/flow` 경로를 전제한 규칙들이 남아 있어 `verify:quality`와 `verify:sop-customer`가
실패한다. 이 세션이 그 실패를 없애는 것이 P3 게이트의 전제다.

`REQ-EXT-001`: SOP 도메인 계약 문서는 코드와 함께 이관된다. 계약이 저장소를 건너지 못하면
이후 세션이 근거 없이 판단하게 된다. **이 세션은 계약을 하나도 폐기하지 않는다.**

## 저장소

```text
C:\Users\USER\Desktop\NOCODE\sop-platform   (branch: main)
```

## 시작 조건

`E0_00_MASTER.md` §2 필독 목록, `E0_BASELINE_EVIDENCE.md`, E1-02 handoff를 읽는다.

```bash
cd C:/Users/USER/Desktop/NOCODE/sop-platform
git status --short
npm run verify:quality           # 현재 상태 기록 (실패해도 정상)
npm run verify:sop-customer      # 현재 상태 기록 (실패해도 정상)
```

## 배타적 소유 파일

```text
docs/**
.agents/skills/**
scripts/verify-quality.mjs        (P2-B가 이 세션 이후에 provider 규칙 3개를 얹는다)
AGENTS.md
CLAUDE.md
README.md
SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md
```

`REQ-E2D-001`: `scripts/verify-quality.mjs`는 P2-B와 공유한다. **P2-D가 먼저 끝낸다**
(`REQ-E0-006`). 완료 즉시 handoff를 내어 P2-B가 이어받게 한다.

`REQ-E2D-002`: `src/**`와 `tests/**`를 수정하지 않는다. 문서가 코드와 어긋난다고 판단되면
**문서를 고치는 것이 이 세션의 일이고, 코드를 고치는 것은 아니다.**

## 구현 지시

### 1. `verify-sop-customer.mjs`의 `/flow` 보호 규칙을 좁힌다

현재 이 스크립트는 새 저장소에 **존재하지 않는 경로**를 검사한다.

| 현재 규칙 | 새 저장소에서 |
|---|---|
| `forbiddenPrefixes = ['src/app/flow/', 'src/components/flow/']` | 두 경로 모두 없다 |
| `forbiddenFiles = ['tests/flow-shapes.test.ts', 'tests/terminal-node.test.tsx']` | 두 파일 모두 없다 |
| `sensitiveFiles`에 `src/app/api/ai/route.ts`, `src/lib/store.ts`, `tests/flow-branches.test.ts` | 셋 다 없다 |
| `sensitiveFiles`에 `src/lib/graph-validation.ts`, `src/lib/flow-shapes.ts` | **둘 다 있다 — 유지한다** |

`REQ-E2D-003`: `/flow` 보호 규칙을 **삭제하지 말고 대체한다.** 이 저장소에서 그 규칙이 막던
사고("SOP 요청을 만족시키려고 `/flow`를 고친다")는 이제 다른 형태로 나타난다 —
**"분리 라운드에서 SOP 도메인 코드를 고친다"** (`REQ-PAR-004`가 금지한 것). 새 규칙:

```text
forbiddenPrefixes  → 제거 (해당 경로 없음). 제거 사실과 이유를 주석으로 남긴다
sensitiveFiles     → src/lib/graph-validation.ts, src/lib/flow-shapes.ts,
                     src/app/api/sop/generate/route.ts, src/server/ai/model-factory.ts
                     (분리 라운드의 고위험 공유 파일)
```

`REQ-E2D-004`: 기존 주석(W4-05 예외를 설명하는 8줄짜리 블록)은 **이 저장소에서 의미를 잃는다.**
지우되, 그 자리에 **왜 지웠는지**를 남긴다 — `tests/flow-branches.test.ts`가 이 저장소에
존재하지 않기 때문이며, 소급 허용이 아니다.

`REQ-E2D-005`: `/flow` 검사 외의 나머지 검사는 **하나도 약화하지 않는다.**
고객 fixture 불변식, 필수 reference 존재 검사, 구성원 Home·승인·HR route 존재 검사,
`--final`·`--scenario-final` 모드의 추가 검사 전부 유지한다.

### 2. `verify-quality.mjs`의 범위를 좁힌다

현재 `docs/QUALITY_CONVENTIONS.md`가 "대상 범위: `src/**`. `/flow` 경로는 제외"라고 적고 있다.
새 저장소에는 `/flow`가 없으므로 예외 자체가 사라진다.

- `RULES`의 `scope`·`allow` 목록이 새 저장소 경로와 맞는지 확인한다
- `suggestion-enum-literal`, `inline-pad-format`, `document-status-label`,
  `step-status-label` 4개 규칙은 **그대로 유지**한다 — SOP 전용 SSOT 규칙이다
- `provider-import`, `provider-env-key`, `provider-options` 3개 규칙은 **P2-B 소유다.**
  건드리지 말고 그대로 둔다

`REQ-E2D-006`: 규칙을 추가하지 않는다. 새 규칙을 만들 근거가 이 라운드에는 없다.

### 3. 문서의 수치를 실측값으로 갱신한다

`E0_BASELINE_EVIDENCE.md`가 기록한 값으로 다음을 고친다.

| 문서 | 고칠 것 |
|---|---|
| `docs/sop-standalone-extraction/CONTEXT.md` §2.1 | 98 → **101** (`src/components/sop-demo/**` 3개 포함, 격차 G1), 테스트 20 → **21** |
| 같은 문서 §2.2 | 공유 모듈 8개 → **9개** (`src/app/api/models/route.ts` 추가, 격차 G2). 전이 의존 실측 결과를 표 아래에 명시 |
| 같은 문서 §2.3 | "`@/components/ui/*` 0건"이 **직접 import 기준**임을 명시하고, 전이 폐포에서는 6개를 사용한다는 사실을 추가 (격차 G3) |
| `EXTRACTION_SPEC.md` §2.1 | `src/components/sop-demo/**`를 인벤토리에 추가 |
| 같은 문서 §3 | 공유 모듈 표에 `src/app/api/models/route.ts` 행 추가 |
| 같은 문서 `REQ-EXT-006` | 제거 대상 목록을 E1이 확정한 7개로 교정하고, 왜 `@radix-ui/*` 전부를 지울 수 없는지 근거를 남긴다 |
| `AI_PROVIDER_CONTRACT.md` `REQ-AI-005` | 노출 함수 2개 → **3개**(`resolveGenerationApiKey` 추가) + 타입 2개 (`REQ-E0-007`) |
| `RUNTIME_AND_DEPLOYMENT.md` §3 | `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` 행을 "제거 완료"로 갱신. `REQ-RUN-008` 아래에 **`next/font/google` 미충족 사실**을 명시 (격차 G4) |

`REQ-E2D-007`: 수치를 **추정으로 채우지 않는다.** `E0_BASELINE_EVIDENCE.md`에 실측값이 없으면
직접 측정하고 그 명령을 문서에 남긴다.

`REQ-E2D-008`: **보류 항목을 확정으로 바꾸지 않는다.** `CONTEXT.md` §7,
`AI_PROVIDER_CONTRACT.md` §7, `RUNTIME_AND_DEPLOYMENT.md`의 각 "빈칸"은 그대로 둔다.
확정된 것은 저장소 이름(`sop-platform`)·경로·빈 이력뿐이며, 이것만 반영한다.

### 4. 저장소 정체성 문서를 다시 쓴다

| 파일 | 할 일 |
|---|---|
| `README.md` | `sop-platform`의 README로 새로 쓴다. 무엇인 앱인지, 어떻게 돌리는지, 현재 상태(in-memory 저장소·AI 미연결)를 적는다. `agent-shift`의 README를 그대로 두지 않는다 |
| `AGENTS.md` | `/flow` 관련 문단을 걷어낸다. "Do not modify `/flow`" 규칙은 **분리 라운드 규칙으로 대체**한다 — 이관된 SOP 도메인 코드는 분리 라운드에서 수정 대상이 아니다 (`REQ-PAR-004`). 나머지(스킬 필수 읽기, verify 명령, 품질 규약, commit 금지)는 유지 |
| `CLAUDE.md` | 같은 방식으로 갱신. 스킬 경로와 verify 명령은 그대로 유효하다 |
| `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md` | 경로 참조만 갱신. **기능 계약 내용은 한 글자도 바꾸지 않는다** |

`REQ-E2D-009`: `AGENTS.md`·`CLAUDE.md`에 **커밋·푸시 금지 규칙을 유지한다.**
새 저장소에서도 사용자 명시 승인 없이 commit·push하지 않는다.

### 5. 스킬의 `/flow` 격리 규칙을 다시 쓴다

`.agents/skills/implement-sop-customer-requirements/SKILL.md`가 `/flow` 격리를 여러 곳에서
요구한다 (`description`, 원칙 문단, "Do not modify" 목록, 고위험 공유 파일 문단).

`REQ-E2D-010`: 이 규칙들을 **삭제가 아니라 이관**한다.

- `src/app/flow/**`·`src/components/flow/**` 언급 → 새 저장소에 없으므로 제거
- 고위험 공유 파일 문단 → `src/lib/graph-validation.ts`, `src/lib/flow-shapes.ts`,
  `src/app/api/sop/generate/route.ts`, `src/server/ai/model-factory.ts`로 대체
- `description`의 저장소 이름 `agent-shift` → `sop-platform`
- **토큰 예산 문단은 그대로 유지한다** — "output-token budget sized for 28–42+ node responses,
  separate from /flow's budget"의 취지는 여전히 유효하다. `/flow`라는 비교 대상이 사라졌으므로
  **절대값 65536을 명시하는 형태로 바꾼다** (`REQ-E2C-003`의 값과 일치해야 한다)

`REQ-E2D-011`: **필수 reference 5개의 내용을 바꾸지 않는다.**

```text
customer-requirements.md
final-system-scenario-contract.md
implementation-contract.md
member-home-subaction-contract.md
subaction-semantics-contract.md
```

경로 참조가 어긋난 곳만 고친다. 도메인 계약 — 승인 생애주기, Activity–Sub Action,
Agent화 판단 분리, 노드 작성 계약, HR 분석, 구성원 진입 흐름 — 은 그대로 이식된다.

### 6. 재설계 문서와 접근성 기준선을 확인한다

```bash
ls docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md
```

`REQ-E2D-012`: 이 파일은 **P3의 대조 기준**이다 (`REQ-EXT-007`). 존재를 확인하고,
**실측값을 한 글자도 바꾸지 않는다.** 이관 후 접근성이 달라졌는지 판단하는 유일한 기준이다.

`docs/sop-member-context-redesign/**`의 나머지 문서는 경로 참조만 확인한다. W4 라운드의
작업지시서들은 완료된 이력이므로 내용을 갱신하지 않는다.

### 7. 문서 간 링크가 깨지지 않았는지 확인한다

```bash
grep -rnoE "\]\(([^)]+\.md)\)" docs/ .agents/ *.md | sed -E "s/.*\((.*)\)/\1/" | sort -u
# 각 경로가 실제로 존재하는지 확인한다
```

## 금지

- `src/**`·`tests/**` 수정
- 필수 reference 5개의 계약 내용 변경
- `W4_BASELINE_A11Y_EVIDENCE.md`의 실측값 변경
- 보류 항목을 확정으로 바꾸는 것
- `verify-sop-customer.mjs`의 `/flow` 외 검사 약화 — fixture 불변식·필수 문서·route 존재 검사
- `verify-quality.mjs`의 provider 규칙 3개 수정 (P2-B 소유)
- 새 품질 규칙 추가
- 커밋·푸시 금지 규칙을 문서에서 빼는 것
- `agent-shift` 수정 / 사용자 승인 없는 commit

## 수용 검증

```bash
npm run verify:quality
npm run verify:sop-customer
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
npx tsc --noEmit
npm run lint
npm run test:sop
git diff --check
git status --short          # 소유 파일만
```

`TST-E2D-001`: `verify:sop-customer`의 **세 모드가 전부 통과**한다. 통과하지 못하면 이 세션은
완료가 아니다 — P3가 이 명령을 게이트로 쓴다.

`TST-E2D-002`: `verify:quality`가 통과한다. P2-B가 provider 규칙을 얹기 전 상태에서도
통과해야 한다.

`TST-E2D-003`: `npm run test:sop`의 결과가 시작 시점과 같다. 이 세션은 코드를 만지지 않았으므로
달라질 이유가 없다.

## 인계

`E0_00_MASTER.md` §12 형식에 더해:

1. **`verify-sop-customer.mjs` 변경 diff** — 무엇을 지우고 무엇으로 대체했는지, 약화하지
   않았다는 확인
2. **문서 수치 갱신 목록** — 문서·절·이전값·새값·측정 명령
3. **보류 항목에 손대지 않았다는 확인** — `CONTEXT.md` §7,
   `AI_PROVIDER_CONTRACT.md` §7, `RUNTIME_AND_DEPLOYMENT.md`의 빈칸 전부
4. 필수 reference 5개가 **내용 무변경**임을 증명하는 `diff` 출력
5. `W4_BASELINE_A11Y_EVIDENCE.md`가 원본과 byte 동일함
6. **P2-B에게**: `scripts/verify-quality.mjs`를 이제 열어도 된다는 신호와, 이 세션이 그
   파일에서 바꾼 정확한 범위
7. 깨진 문서 링크가 있었다면 그 목록과 수정 내용
