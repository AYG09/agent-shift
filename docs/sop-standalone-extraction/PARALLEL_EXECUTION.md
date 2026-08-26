# 병렬 실행 경계 (분리 작업)

## 1. 이 작업이 앞선 라운드와 다른 점

Wave 0~3과 W4는 **한 저장소 안에서 파일을 나눠 가졌다.** 분리 작업은 **저장소 두 개가 등장**
하므로 소유권 축이 하나 더 생긴다.

```text
축 1: 어느 저장소인가        (agent-shift / sop-platform)
축 2: 그 저장소의 어느 파일인가
```

두 축을 함께 보지 않으면 "같은 파일을 서로 다른 저장소에서 각자 고치고 나중에 합치려는"
상황이 생긴다. 그것은 병렬이 아니라 분기(fork)다.

## 2. 병렬화가 가능한 구간과 불가능한 구간

### 2.1 본질적으로 순차인 구간

`REQ-PAR-001`: **이관 자체(파일 복사·경로 정리·빌드 성립)는 병렬화하지 않는다.** 새 저장소가
아직 없거나 빌드가 성립하지 않은 상태에서는 어떤 세션도 검증할 수 없다. 첫 걸음은 "빌드되고
테스트가 도는 뼈대"를 한 세션이 만드는 것이다.

`REQ-PAR-002`: **W4 라운드 완료가 선행 조건이다.** W4-05가 `src/app/api/ai/route.ts`를 정리
중이고, 분리는 같은 파일을 만진다. 기준 커밋은 W4-05 통합이 끝난 뒤로 고정한다.

### 2.2 병렬화가 실제로 이득인 구간

뼈대가 서고 나면 서로 다른 파일을 만지는 작업이 남는다.

| 작업 | 만지는 대상 | 다른 작업과 겹침 |
|---|---|---|
| 공유 모듈 좁히기 | `graph-validation`, `flow-shapes` 사본 | 없음 |
| provider 어댑터 재작성 | `model-factory`, `gemini-models` 사본 | 없음 |
| AI 라우트 분해 | `api/sop/generate/route.ts` (신규) | provider 어댑터와 **호출 관계** |
| 의존성·빌드 정리 | `package.json`, config | 모든 작업의 결과에 영향 |
| 원본 정리 | `agent-shift`의 SOP 제거 | **다른 저장소** |
| 문서 이관 | `docs/`, `.agents/skills/` | 없음 |

`INT-PAR-001`: 이 중 **원본 정리(`agent-shift`에서 SOP 제거)** 는 다른 저장소이므로
**진짜 병렬**이 가능하다. 단, `EXTRACTION_SPEC.md` `REQ-EXT-002`에 따라 **새 저장소 검증이
끝난 뒤**에만 시작한다. 병렬로 돌리되 시작 신호가 있다.

## 3. 권장 파동

```text
P0 — 기준 고정 (단독)
  W4-05 완료 커밋을 기준으로 고정, 이관 인벤토리 실측 재확인
        │
        ▼
P1 — 뼈대 (단독)
  새 저장소 생성, 파일 이관, 의존성 축소, 빌드·테스트 성립
        │
        ├──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
P2-A            P2-B            P2-C            P2-D
공유 모듈       provider        AI 라우트       문서·스킬
좁히기          어댑터          분해            이관 정리
        │              │              │              │
        └──────┬───────┴──────────────┘              │
               ▼                                      │
P3 — 동등성 검증 (단독)                                │
  전체 게이트 + 브라우저 + 기준선 대조                  │
               │                                      │
               ▼                                      ▼
P4 — 원본 정리 (별도 저장소, P3 통과 후 시작) ◀────────┘
  agent-shift에서 SOP 제거, /flow 회귀 증명
```

`REQ-PAR-003`: P2-C(AI 라우트 분해)는 P2-B(provider 어댑터)가 노출하는 함수 시그니처를
사용한다. 두 세션이 동시에 진행하려면 **시그니처를 P1에서 미리 고정**해야 한다
(`AI_PROVIDER_CONTRACT.md` `REQ-AI-005`가 그 값을 이미 정해 뒀다 — 현행과 동일한 두 함수).

## 4. 파일 소유권 레지스트리 (P2 기준)

한 파일의 active owner는 동시에 한 세션뿐이다.

| 세션 | 저장소 | 배타적 소유 |
|---|---|---|
| P2-A | sop-platform | `src/lib/graph-validation.ts`, `src/lib/flow-shapes.ts`, 그 사본의 테스트 |
| P2-B | sop-platform | `src/server/ai/**`, `src/lib/gemini-models.ts`(또는 후속 이름) |
| P2-C | sop-platform | `src/app/api/sop/generate/**`, `src/server/sop/sop-request.ts` |
| P2-D | sop-platform | `docs/**`, `.agents/skills/**`, `scripts/verify-quality.mjs` |
| P4 | **agent-shift** | SOP 전용 파일 제거, `package.json`, `/flow` 테스트 |

**모든 세션 수정 금지**: SOP 도메인 파일(`src/lib/sop-*`, `src/components/sop/**`,
`src/server/sop/**` 중 P2-C 소유 외), 테스트 20개의 단언 내용, prompt 문자열, 스키마.

`REQ-PAR-004`: 이관된 SOP 도메인 코드는 **분리 라운드에서 수정 대상이 아니다.** 수정이
필요하다고 판단되면 그것은 분리 작업이 아니라 기능 변경이므로, 별도 라운드로 넘긴다.

## 5. 저장소 두 개를 다루는 규칙

`REQ-PAR-005`: 한 세션은 **한 저장소만** 만진다. 두 저장소를 오가는 세션은 만들지 않는다.
P4가 `agent-shift`를 단독으로 맡는 이유다.

`REQ-PAR-006`: 새 저장소의 초기 커밋은 **원본의 이력을 가져오지 않는다**(단순 복사). 이력
보존이 필요하면 `git filter-repo` 같은 도구를 쓸 수 있으나, 그 판단은 보류 항목이다. 어느
쪽이든 P1이 결정하고 handoff에 명시한다.

`REQ-PAR-007`: P4는 **P3 통과 handoff를 받은 뒤에만** 시작한다. 검증되지 않은 이관 상태에서
원본을 지우면 되돌릴 근거가 사라진다.

## 6. worktree와 환경 제약 (앞선 라운드의 교훈)

`REQ-PAR-008`: 병렬 worktree의 `node_modules`를 junction/symlink로 연결하지 않는다. Next 16의
Turbopack이 이를 거부해 `npm run build`와 `npm run dev`가 모두 죽는다. 이 저장소에서 실제로
세 번 관측됐다. 각 worktree에서 `npm ci`를 정직하게 수행하거나, 빌드·브라우저 검증을 단일
통합 worktree로 몰아준다.

`REQ-PAR-009`: `.next/dev/lock`이 남아 있으면 진짜 원인과 다른 오류가 먼저 난다. 빌드·dev
실패를 판단하기 전에 잠금을 지우고 한 번 더 확인한다.

`REQ-PAR-010`: 브라우저 산출물(`.playwright-mcp/`)은 `.gitignore`에 등록한다. 등록하지 않으면
세션 간 소유권 대조(`git status --short`)가 오염된다.

## 7. 각 세션의 완료 게이트

```bash
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run test:sop            # 소유 범위와 무관하게 전체
git diff --check
```

소유 파일 밖 변경은 0건이어야 한다.

## 8. P3 동등성 게이트

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

여기에 더해:

- 외부망 차단 상태 기동 확인 (`RUNTIME_AND_DEPLOYMENT.md` `TST-RUN-002`)
- 브라우저에서 구성원 전체 흐름 확인
- 접근성 기준선 대조 — `docs/sop-member-context-redesign/work-orders/W4_BASELINE_A11Y_EVIDENCE.md`
  의 실측값과 같은 결과가 나오는지 (다르면 이관 중 회귀)

## 9. HANDOFF 형식

```text
1. 기준 commit / 저장소 / branch / worktree
2. 변경 파일 (소유 목록과 대조)
3. 충족한 REQ·TST ID
4. 새로 도입한 구현 해석
5. 좁히기를 수행했다면: 제거 대상이 SOP 테스트에서 참조되지 않음을 증명한 방법
6. 실행한 명령과 PASS/FAIL
7. 실패 명령의 원문 오류
8. 다른 세션·다른 저장소로 넘기는 요청
9. 보류 항목에 손대지 않았음의 확인
10. 다음 세션이 건드리면 안 되는 파일
```

## 10. 병렬 작업에서 금지할 것

- 한 세션이 두 저장소를 만지는 것
- 검증 전 원본에서 SOP 제거
- 이관과 기능 변경을 같은 세션에서 수행
- 공유 모듈을 npm 패키지로 만들어 두 저장소가 의존하게 만드는 것
- 값 집합(enum) 축소
- prompt·스키마·repair 정책 변경
- W4 라운드와 동시에 `api/ai/route.ts` 수정
- 사용자 승인 없는 commit·push
