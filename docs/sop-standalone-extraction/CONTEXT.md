# SOP 독립 앱 분리 컨텍스트

## 1. 분석 단위와 목적

- 분석 단위: `agent-shift` 저장소 안에서 SOP 프로토타입이 차지하는 코드·데이터·빌드 경계
- 목적: 그 경계를 잘라 **독립 저장소의 독립 배포 단위**로 만들고, 사내 서버망에서 자체 AI
  연결로 운영 가능한 상태로 옮기는 것
- 비목적: SOP 기능 변경, `/flow` 기능 변경, UX 재설계

## 2. 검증된 사실 (2026-08-26 실측)

아래 수치는 추정이 아니라 저장소를 직접 조사해 얻은 값이다. 이후 판단은 전부 이 위에 선다.

### 2.1 SOP가 차지하는 범위

| 항목 | 실측 |
|---|---|
| `src/lib/sop-*`, `src/components/sop/*`, `src/server/sop/*` | **98개 파일** |
| `src/app/sop/**`, `src/app/api/sop/**` | **24개 파일** |
| SOP 전용 테스트 | **20개** (`tests/sop*`) |
| SOP 전용 fixture | `src/data/sop-task-library-sample.json` 1개 |
| SOP 전용 검증 스크립트 | `.agents/skills/.../scripts/verify-sop-customer.mjs` |

### 2.2 의존 방향 — 단방향

**`/flow` → SOP 참조: 0건.** `src/app/flow`, `src/components/flow`, `src/lib/store.ts` 어디에도
`sop-` 또는 `/sop/` 참조가 없다.

**SOP → 비-SOP 모듈: 8개뿐** (참조 횟수 순).

| 모듈 | 줄 수 | 참조 | 성격 |
|---|---|---|---|
| `src/lib/graph-validation.ts` | 972 | 5 | 그래프 검증. `/flow`와 SOP가 **서로 다른 분기**를 가짐 |
| `src/hooks/useSopAiSettings.ts` | 87 | 4 | 이름만 SOP, 위치는 공용 `hooks/` |
| `src/server/ai/model-factory.ts` | 65 | 3 | **AI provider 교체 지점** (문서화된 SSOT) |
| `src/lib/ai-shape-guide.ts` | 106 | 2 | 도형·분기 prompt 가이드 |
| `src/lib/gemini-models.ts` | 214 | 1 | 모델 ID 정책 (Gemini 고정) |
| `src/lib/flow-shapes.ts` | 581 | 1 | 도형 enum·기하 |
| `src/components/settings/ApiKeySettings.tsx` | 423 | 1 | BYOK 입력 UI |
| `src/components/flow/FlowShapeRenderer.tsx` | 549 | 1 | 노드 배경 SVG 렌더러 |

합계 약 3,000줄. 결합의 성격은 **얕고 값 기반**이다. 예를 들어 `FlowShapeRenderer`는
`SopStepNode.tsx`가 `shape`/`width`/`height`를 넘겨 SVG 배경만 그리게 하는 용도다.

### 2.3 SOP가 쓰지 않는 것

- **`@liveblocks/*` 0건** — 실시간 협업은 `/flow`만의 기능이다.
- **`src/lib/store.ts`(flow store) 0건** — SOP는 `sop-prototype-store.ts`만 쓴다.
- **`@/components/ui/*` 0건** — SOP 화면은 Tailwind로 자립해 있고 radix 프리미티브를 쓰지 않는다.
- `framer-motion`, `cmdk`, `docx`, `exceljs` 0건 — 전부 `/flow`·export-service 쪽 의존이다.

SOP가 실제로 쓰는 npm 패키지는 `next`, `react`, `zustand`, `zod`, `ai`, `@xyflow/react`,
`lucide-react`, 그리고 model-factory를 통한 `@ai-sdk/google`뿐이다.

### 2.4 진짜 얽힘은 하나

`src/app/api/ai/route.ts`가 SOP 모듈 6개를 import한다.

```text
@/lib/sop-schemas          (SopGenerationWireSchema, SopSuggestionPatchSchema)
@/server/sop/sop-prompt    (getSopPrompt)
@/server/sop/sop-request   (parseSopGenerationRequest)
@/lib/sop-ai-request       (SopGenerationRequest 타입)
@/server/sop/sop-generation-runner (runSopGenerationPostProcessing)
@/lib/sop-subaction-capacity       (computeSubActionCapacity)
```

즉 **SOP의 SOP 생성 경로가 `/flow`와 같은 라우트 안에 산다.** 이것이 분리에서 유일하게
설계 판단이 필요한 지점이다.

같은 파일에 `getAsIsPrompt` 등 비-route export가 있어 Next의 route 타입 검증기가 거부하는
baseline 결함도 있다. 이 정리는 진행 중인 W4-05가 이미 맡고 있다(`W4_00_MASTER_PARALLEL.md`).

### 2.5 현재 인프라 가정

| 지점 | 현재 | 사내망에서 문제 |
|---|---|---|
| AI 키 | `localStorage['agent-shift-api-key']` BYOK + `GOOGLE_GENERATIVE_AI_API_KEY` env fallback | 구성원 개인이 외부 상용 키를 브라우저에 넣는 구조. 사내 정책과 충돌할 가능성이 높다 |
| 모델 | `gemini-models.ts`가 Gemini 모델 ID를 고정 | 사내 모델로 교체 필요 |
| 저장소 | `sop-repository-memory.ts` (in-memory, 프로세스 재시작 시 소실) | 실제 DB 필요 |
| 배포 | Vercel + GitHub 연동 | 사내망은 외부 SaaS 배포를 쓸 수 없을 가능성 |
| 외부 통신 | `generateObject` → Google API 직통 | 외부망 차단 환경에서 동작 불가 |
| 시드 | `SOP_SCENARIO_SEED_MODE` env로 데모 레코드 생성 | 운영 환경에서는 꺼야 한다 |

## 3. 문제 정의

### 3.1 한 저장소에 두 제품

`/flow`(워크플로우 캔버스·전략·협업)와 SOP(구성원 SOP 작성·승인·HR 분석)는 사용자, 데이터
모델, 배포 대상, 보안 요구가 전부 다르다. 지금은 한 빌드에 묶여 있어 사내망에 SOP만 올릴 수
없고, `/flow`의 외부 의존(liveblocks 등)이 함께 따라간다.

### 3.2 AI 연결이 브라우저에 묶여 있다

BYOK는 프로토타입 시연에는 합리적이었지만, 사내망 운영에서는 (1) 개인이 외부 키를 관리하고
(2) 키가 브라우저 저장소에 남고 (3) 서버가 호출 주체가 아니어서 감사·한도·차단을 걸 수 없다.
프로덕션에서 이미 이 한계가 드러났다 — 키가 없어 추천이 항상 실패한다.

### 3.3 영속성이 없다

`sop-repository-memory.ts`는 이름 그대로 in-memory다. 승인 흐름과 HR 분석이 실제 레코드를
전제하는데, 프로세스가 재시작되면 사라진다. 사내망 이전은 이 포트에 실제 구현을 붙이는 일과
동시에 일어나야 한다.

### 3.4 공유 모듈의 소유권이 모호하다

`graph-validation.ts`는 `/flow`용 규칙과 SOP 전용 규칙(`validateSopDecisionBranches`,
SOP 전용 rework cycle 규칙 등)을 함께 담고 있다. 분리 후 어느 쪽이 원본인지 정하지 않으면
양쪽에서 따로 고쳐지며 갈라진다.

## 4. 목표 상태

```text
[사내 서버망]
  sop-platform (신규 저장소, 독립 배포)
    ├─ 구성원 진입 흐름 (login → context → recommendation → work map)
    ├─ Task-wide SOP 생성 (Activity–Sub Action, 노드 작성 계약)
    ├─ 승인 (직책자 → SME) · HR 분석 · 대표 표준안
    ├─ AI: 서버측 provider 어댑터 하나 (교체 가능)
    └─ 저장: SopRepository 포트에 붙은 실제 구현

[기존 저장소]
  agent-shift
    └─ /flow, 전략, 협업 — SOP 코드 제거됨
```

두 저장소는 코드를 공유하지 않는다. 공유 모듈은 **복사 후 각자 소유**한다(§5 용어 참고).

## 5. 용어와 권위 원본

| 용어 | 정의 | 권위 원본 |
|---|---|---|
| 이관(migrate) | SOP 전용 파일을 새 저장소로 옮기고 원본에서 제거 | `EXTRACTION_SPEC.md` 인벤토리 |
| 분기 복사(fork-copy) | 공유 모듈을 양쪽이 각자 사본으로 소유. 이후 동기화하지 않음 | 같은 문서 §공유 모듈 처리 |
| 좁히기(narrow) | 복사한 사본에서 상대 제품 전용 분기를 제거 | 같은 문서 |
| provider 어댑터 | AI 모델 호출을 캡슐화한 단일 교체 지점 | `AI_PROVIDER_CONTRACT.md` |
| 저장소 포트 | `SopRepository` 인터페이스. 구현은 교체 가능 | `RUNTIME_AND_DEPLOYMENT.md` |
| 동등성(parity) | 분리 후에도 같은 입력에 같은 도메인 결과가 나오는 상태 | `EXTRACTION_SPEC.md` 수용 기준 |

## 6. 구현 해석

다음은 확정 사실이 아니라 이 분리를 실행 가능하게 만드는 해석이다.

1. **공유 모듈은 동기화하지 않고 분기 복사한다.** 두 저장소가 코드를 공유하면 사내망 저장소가
   외부 저장소를 의존하게 되어 분리 목적이 무너진다. 3,000줄 중 SOP가 실제로 쓰는 부분은 그보다
   훨씬 작으므로, 복사 후 좁히는 편이 공유 패키지를 유지하는 것보다 총비용이 낮다.
2. **`graph-validation.ts`는 SOP 사본에서 `/flow` 전용 분기를 제거한다.** 두 제품이 같은 함수를
   서로 다른 의미로 쓰고 있어, 공유를 유지하면 한쪽 수정이 다른 쪽을 조용히 깨뜨린다.
3. **`api/ai/route.ts`의 SOP 부분은 SOP 전용 라우트로 옮긴다.** 새 저장소에는 `/flow` action이
   존재하지 않으므로 공유 라우트를 유지할 이유가 없다.
4. **BYOK UI는 이관하되 기본 비활성으로 둔다.** 사내망 기본값은 서버측 키이고, BYOK는 개발·
   시연용 선택 경로로만 남긴다. 키 관리 정책이 확정되기 전에 UI를 삭제하지 않는다.
5. **in-memory 저장소는 그대로 이관한다.** 실제 DB 어댑터는 별도 작업이며, 포트가 이미 있으므로
   분리와 동시에 바꾸지 않는다. 대신 비영속임을 화면에 계속 표시한다.
6. **새 저장소 이름은 `sop-platform`을 가안으로 쓴다.** 최종 명칭은 보류 항목이다.
7. **분리 시점의 기준 커밋을 고정한다.** 진행 중인 W4 라운드가 끝난 뒤의 커밋을 기준으로 삼아,
   이관 중에 원본이 움직이지 않게 한다.

## 7. 보류·확인 필요 항목

임의로 확정하지 않는다.

- 사내 서버망의 런타임(Node 버전, 컨테이너 여부, 오케스트레이션, 리버스 프록시)
- 사용 가능한 DB 종류와 접근 방식
- AI 모델·엔드포인트·인증 방식, 그리고 그 모델의 구조화 출력(JSON schema) 지원 수준
- 외부망 차단 범위 (npm 설치, 폰트, 원격 이미지 포함)
- 사내 인증(SSO/HR master) 연동 방식과 시점
- 감사 로그·보존 기간·개인정보 마스킹 정책
- 새 저장소 이름, 소유 조직, 접근 권한
- CI/CD 수단 (사내 GitLab? 수동 배포?)
- `/flow` 저장소에서 SOP 코드를 **언제** 제거할지 (즉시 vs 이관 검증 후)

## 8. 제외 범위

- SOP 기능 변경·UX 재설계 (진행 중인 W4 라운드가 담당)
- `/flow` 기능 변경
- 실제 DB 스키마 설계와 마이그레이션 도구
- 프로덕션 인증·권한 체계 구현
- 성능 튜닝, 부하 테스트, 보안 감사
- 다국어·모바일 지원
