# SOP 독립 앱 분리 작업지시서 묶음

## 상태: 작성 대기

이 디렉터리는 분리 작업의 세션별 실행 지시서를 담는다. **아직 지시서가 없다.** 아래 선행
조건이 충족된 뒤에 작성한다.

## 작성 전 선행 조건

| 조건 | 이유 | 상태 |
|---|---|---|
| W4-05 통합 완료·검토 통과 | 분리 기준 커밋이 확정돼야 지시서의 baseline이 실제 값으로 채워진다 | 대기 |
| `src/app/api/ai/route.ts` 정리 완료 | 분리는 이 파일을 만진다. W4-05가 같은 파일에서 prompt builder를 옮기는 중이라 동시에 손대면 충돌한다 | 대기 |
| 새 저장소 이름·소유 조직 확정 | P1 세션이 저장소를 실제로 만들 때 필요하다. 문서에는 `sop-platform`이 가안으로 적혀 있다 | 미정 |

`W4-05가 끝나기 전에 이 디렉터리에 지시서를 만들지 않는다.` 기준 커밋 없이 만든 지시서는
각 세션의 preflight("baseline이 다르면 중단")를 무의미하게 만든다.

## 작성될 지시서 (예정)

`PARALLEL_EXECUTION.md`의 파동 구조를 그대로 따른다.

| 파일 | 세션 | 저장소 | 병렬 |
|---|---|---|---|
| `E0_00_MASTER.md` | 실행 관리자 | — | — |
| `E0_01_BASELINE.md` | P0 기준 고정 | agent-shift | 단독 |
| `E1_02_SKELETON.md` | P1 뼈대 | sop-platform | 단독 |
| `E2_03A_SHARED_MODULES.md` | P2-A 공유 모듈 좁히기 | sop-platform | 병렬 |
| `E2_04B_AI_PROVIDER.md` | P2-B provider 어댑터 | sop-platform | 병렬 |
| `E2_05C_GENERATION_ROUTE.md` | P2-C AI 라우트 분해 | sop-platform | 병렬 |
| `E2_06D_DOCS_AND_SKILL.md` | P2-D 문서·스킬 이관 | sop-platform | 병렬 |
| `E3_07_PARITY.md` | P3 동등성 검증 | sop-platform | 단독 |
| `E4_08_ORIGIN_CLEANUP.md` | P4 원본 정리 | **agent-shift** | P3 통과 후 |

## 지시서가 반드시 담아야 할 것

앞선 라운드에서 실제로 사고가 났던 지점들이다. 지시서마다 해당 항목을 명시한다.

1. **저장소와 worktree 절대 경로, branch, 기준 commit** — "코드 baseline은 X, 문서 commit이
   더 얹혀 있어도 정상"의 형태로. 움직이는 해시 하나만 적으면 세션이 자기 baseline을
   오판한다.
2. **배타적 소유 파일 목록과 금지 목록** — 소유 밖 변경 0건이 완료 조건이다.
3. **세션 간 고정 인터페이스 계약** — 병렬 세션은 실행 중 협상할 수 없다. P2-B가 노출하는
   함수 시그니처는 P1에서 미리 고정한다.
4. **한 세션은 한 저장소만** — P4만 `agent-shift`를 맡는다.
5. **`npm run build`/`npm run dev` 실행 가능 여부** — worktree의 `node_modules`가
   junction이면 Turbopack이 둘 다 거부한다. 각 지시서가 그 세션에서 무엇을 돌릴 수 있는지
   명시한다.
6. **커밋 전 `git diff --cached --name-only` 확인 의무** — 여러 writer가 같은 worktree를
   쓰면 `git add` 뒤의 `git commit`이 남의 스테이징을 함께 담는다. 이 저장소에서 실제로
   발생했다(`14929ad`가 문서 커밋에 W4-01 Foundation 통합분을 함께 담았다).
7. **좁히기의 증명 방법** — "줄였는데 테스트가 그대로 통과한다"가 그 코드가 불필요했다는
   증거다. 줄이기 전에 테스트를 먼저 돌려 기준을 만든다.
8. **HANDOFF 형식** — `PARALLEL_EXECUTION.md` §9.

## 참조할 문서

- [../README.md](../README.md) — 확정된 방향과 완료 경계
- [../CONTEXT.md](../CONTEXT.md) — 실측 결합도와 보류 항목
- [../EXTRACTION_SPEC.md](../EXTRACTION_SPEC.md) — 이관 인벤토리와 수용 기준
- [../RUNTIME_AND_DEPLOYMENT.md](../RUNTIME_AND_DEPLOYMENT.md) — 사내망 런타임 계약
- [../AI_PROVIDER_CONTRACT.md](../AI_PROVIDER_CONTRACT.md) — provider 교체 경계
- [../PARALLEL_EXECUTION.md](../PARALLEL_EXECUTION.md) — 소유권·파동·게이트
- [../../sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md](../../sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md)
  — 이관 후 접근성 회귀 대조 기준
