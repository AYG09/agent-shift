# SOP 독립 앱 분리 작업지시서 묶음

## 상태: 작성 완료 (2026-08-27) — 실행 대기

## 선행 조건 — 전부 충족

| 조건 | 상태 | 근거 |
|---|---|---|
| W4-05 통합 완료·검토 통과 | ✅ | `52b8377 feat(sop): complete member entry integration` — W4-01/02A/03B/04C + W4-05A closeout. `origin/wave0/sop-foundation`과 동기화됨 |
| `src/app/api/ai/route.ts` 정리 완료 | ✅ | 남은 export는 `POST` 하나. 비-route export 5개는 `src/server/flow/flow-prompts.ts`로 이동 완료 |
| 새 저장소 이름·소유 조직 확정 | ✅ 부분 | 이름 **`sop-platform`**, 로컬 경로 `C:\Users\USER\Desktop\NOCODE\sop-platform` 확정 (2026-08-27). **원격 호스팅은 여전히 미정** — 어떤 세션도 `git remote add`·`push`를 하지 않는다 |

## 지시서

`PARALLEL_EXECUTION.md`의 파동 구조를 그대로 따른다. **`E0_00_MASTER.md`를 먼저 읽는다.**

| 파일 | 세션 | 저장소 | 병렬 | 선행 |
|---|---|---|---|---|
| [E0_00_MASTER.md](E0_00_MASTER.md) | 실행 관리자 | — | — | — |
| [E0_01_BASELINE.md](E0_01_BASELINE.md) | P0 기준 고정 | agent-shift | 단독 | — |
| [E1_02_SKELETON.md](E1_02_SKELETON.md) | P1 뼈대 | sop-platform | 단독 | E0-01 |
| [E2_03A_SHARED_MODULES.md](E2_03A_SHARED_MODULES.md) | P2-A 공유 모듈 좁히기 | sop-platform | 병렬 | E1-02 |
| [E2_04B_AI_PROVIDER.md](E2_04B_AI_PROVIDER.md) | P2-B provider 어댑터 | sop-platform | 병렬 | E1-02 (+ P2-D의 `verify-quality.mjs` 완료) |
| [E2_05C_GENERATION_ROUTE.md](E2_05C_GENERATION_ROUTE.md) | P2-C AI 라우트 분해 | sop-platform | 병렬 | E1-02 |
| [E2_06D_DOCS_AND_SKILL.md](E2_06D_DOCS_AND_SKILL.md) | P2-D 문서·스킬 이관 | sop-platform | 병렬 | E1-02 |
| [E3_07_PARITY.md](E3_07_PARITY.md) | P3 동등성 검증 | sop-platform | 단독 | P2-A~D 전원 |
| [E4_08_ORIGIN_CLEANUP.md](E4_08_ORIGIN_CLEANUP.md) | P4 원본 정리 | **agent-shift** | 별도 저장소 | **E3 통과** |

## 실측으로 확인된 격차 4건

지시서 작성 중 `52b8377` 기준 실측에서 문서와 실제가 어긋나는 지점이 나왔다. 각 지시서가
해당 격차를 명시적으로 처리한다. 상세는 `E0_00_MASTER.md` §8~§9.

| ID | 요약 | 처리 |
|---|---|---|
| G1 | `src/components/sop-demo/**` 3개가 이관 인벤토리에 없다 | P0 확정 → P1 이관 |
| G2 | `src/app/api/models/route.ts`가 9번째 결합 지점이다 | P0 확정 → P1 이관, P2-B 소유 |
| G3 | `REQ-EXT-006`의 제거 대상이 전이 의존을 놓쳤다 (radix·cva·tailwind-merge는 `ApiKeySettings` 경유로 SOP가 사용) | P1이 유지, P2-D가 문서 교정 |
| G4 | 루트 layout이 `next/font/google`(빌드 시 네트워크)과 `FloatingDock`(framer-motion)을 쓴다 | P1이 layout 재작성, 폰트는 유지하고 미충족 기록 |

## 지시서가 담고 있는 것 — 앞선 라운드의 사고 지점

1. **저장소·worktree 절대 경로·branch·기준 commit** — "코드 baseline은 `52b8377`, 문서 commit이
   더 얹혀 있어도 정상"의 형태로. 판정은 해시가 아니라 `git diff --stat 52b8377 -- src tests`.
2. **배타적 소유 파일과 금지 목록** — 소유 밖 변경 0건이 완료 조건.
3. **세션 간 고정 인터페이스 계약** — provider 어댑터 5개 export와 `/api/sop/generate` wire를
   E1이 미리 고정한다. P2-B·P2-C는 실행 중 협상하지 않는다.
4. **한 세션은 한 저장소만** — P0와 P4만 `agent-shift`.
5. **`npm run build`/`dev` 실행 가능 여부** — `node_modules`를 junction으로 만들지 않는다.
6. **커밋 전 `git diff --cached --name-only` 확인 의무** — `14929ad`가 문서 커밋에 W4-01
   통합분을 함께 담은 사고가 실제로 있었다.
7. **좁히기의 증명 방법** — 줄이기 **전에** 테스트를 돌려 기준을 만든다.
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
