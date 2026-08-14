# 코드 품질 컨벤션 · 작업지시서

이 문서는 agent-shift 저장소의 코드 품질 기준 6개 축을 **검증 가능한 규칙**으로
정의한다. 규칙 중 기계 검증이 가능한 것은 `npm run verify:quality`
([scripts/verify-quality.mjs](../scripts/verify-quality.mjs))가 강제하며, CI/수동
검증 절차에 포함된다. 새 코드를 작성하거나 리뷰할 때 이 문서를 기준으로 삼는다.

> 대상 범위: `src/**`. `/flow` 경로(`src/app/flow`, `src/components/flow`)는
> 기존 동작 보존이 최우선이므로 신규 규칙의 소급 적용 대상이 아니다(신규 편집 시에만 적용).

---

## 축 1. 이해가능성 — AI 엔지니어가 읽고 바로 작업할 수 있는가

**규칙**

- 모든 모듈은 파일 상단 또는 핵심 export에 **"왜 이렇게 되어 있는가"를 설명하는
  docstring**을 가진다. 코드가 스스로 말하는 것(무엇을 하는가)은 주석으로 반복하지
  않는다.
- 불변식(예: "confirmed는 confirmFullSop만 만든다", "terminal에는 provenance가
  없다")은 그 불변식을 지키는 코드 옆에 명시한다.
- 도메인 계약은 코드가 아니라 문서가 원천이다:
  - SOP 도메인 계약: `.agents/skills/implement-sop-customer-requirements/references/*`
  - UI 컨벤션: [docs/DESIGN_CONVENTIONS.md](DESIGN_CONVENTIONS.md)
  - 품질 규칙: 이 문서

**검증**: 리뷰 시 수동 확인. (docstring 존재 여부의 기계 검증은 노이즈가 커서 하지 않는다.)

## 축 2. 타입 단일성 — 같은 기능을 다른 타입으로 재정의하지 않는가

**규칙**

- 하나의 도메인 값 집합(enum)은 **정확히 한 곳**에서 정의하고, zod 스키마와 TS
  타입은 그 원천에서 파생한다.
  - Agent화 제안 타입: `SOP_AGENTIZATION_SUGGESTION_TYPES`
    ([sop-step-common-schema.ts](../src/lib/sop-step-common-schema.ts))가 유일한
    원천. zod `z.enum(...)` 리터럴 재나열 금지.
  - 검토 상태(SopReviewStatus), 라이프사이클 상태 등 기존 단일 정의를 유지한다.
- 서로 다른 계층이 같은 데이터를 다른 폭으로 보는 "뷰 타입"(예: 러너의
  `GeneratedStep`)은 허용하되, 원천 타입/스키마를 주석으로 명시해 드리프트를
  막는다.

**검증(기계)**: `verify:quality`가 `z.enum(['agent-candidate'...])` 리터럴이
원천 파일 밖에서 등장하면 실패한다.

## 축 3. SSOT — 단일 원천으로 가능한 것을 중복 구현하지 않는가

**규칙**

- **표시 문자열·스타일 클래스·포맷 규칙**은 meta/토큰 모듈이 원천이다:
  - 단계 검토 상태 배지(라벨+클래스): `SOP_STEP_REVIEW_STATUS_META`
    ([sop-review-status-meta.ts](../src/lib/sop-review-status-meta.ts))
  - Activity 코드 포맷(`A01`)·단계 번호 포맷(`01`): `formatActivityCode` /
    `formatStepNumber` ([sop-format.ts](../src/lib/sop-format.ts))
  - 시작/종료 터미널 칩: `SOP_TERMINAL_CHIP_META` (sop-review-status-meta.ts)
- **AI 모델 해석(BYOK→env→기본값)과 추론 옵션**은
  [src/server/ai/model-factory.ts](../src/server/ai/model-factory.ts)가 유일한
  원천이다 (축 4와 동일 지점).
- 같은 계산/검증 로직을 두 곳에 복사하지 않는다. 클라이언트·서버가 같은 규칙을
  써야 하면 `src/lib`의 공용 모듈 하나를 양쪽에서 import한다
  (예: `computeSubActionCapacity`, `validateSopSetupConfig`).

**검증(기계)**: `verify:quality`가 컴포넌트 코드에서 `padStart(2, '0')` 인라인
포맷, 원천 밖의 상태 배지 클래스 조합 재정의를 금지한다.

## 축 4. AI 프로바이더 교체 용이성

**규칙**

- **`@ai-sdk/google` import는 [src/server/ai/model-factory.ts](../src/server/ai/model-factory.ts)와
  [src/lib/gemini-models.ts](../src/lib/gemini-models.ts)(모델 id 정책)에서만
  허용**된다. API 라우트·러너는 팩토리의 `resolveGenerationModel` /
  `buildReasoningProviderOptions`만 사용한다.
- 다른 프로바이더(OpenAI, Anthropic)로 교체하는 절차는 model-factory.ts의
  docstring에 명시된 대로 **그 파일(및 모델 id 정책 파일)만 수정**하면 되어야
  한다. Vercel AI SDK의 `generateObject`/`LanguageModel` 추상화를 경계로 유지하고,
  프로바이더 전용 옵션(`thinkingConfig` 등)은 팩토리 밖으로 새지 않게 한다.

**검증(기계)**: `verify:quality`가 허용 목록 밖 파일에서 `@ai-sdk/google` import
또는 `thinkingConfig` 사용을 발견하면 실패한다.

## 축 5. 프론트엔드 디자인 컨벤션

**규칙**: [docs/DESIGN_CONVENTIONS.md](DESIGN_CONVENTIONS.md)가 원천이다. 요약:

- 색상 의미 체계·타이포 스케일·카드/배지/버튼 규격·아코디언 패턴·헤더 규격을
  문서의 표대로 사용한다.
- 반복 UI 요소(상태 배지, 터미널 칩, Activity 코드)는 meta/토큰 모듈을 통해서만
  렌더링한다 — 화면마다 클래스 문자열을 다시 조립하지 않는다.
- 밀도 원칙: 읽기 전용 정보와 선택 기능은 기본 접힘 + 요약 헤더
  (`SopInspectorSection` 패턴), 액션이 필요한 상태는 강조 톤으로 자동 펼침.

**검증(기계)**: 축 3의 금지 패턴 검사와 동일. 나머지는 리뷰 시 문서 대조.

## 축 6. Dead Code 금지

**규칙**

- 사용처가 없는 export/모듈은 만들지 않는다. "나중에 쓸 것"은 쓰는 시점에 추가한다.
- 주기 점검: `npx -y ts-prune -p tsconfig.json`으로 미사용 export를 확인한다.
  Next.js 진입점(`page.tsx`/`route.ts`/`layout.tsx`의 default·GET·POST 등)은
  오탐이므로 제외하고 판단한다.

**검증**: 릴리스 전 수동으로 ts-prune 실행(위 오탐 규칙 적용). 2026-08 리뷰에서
발견된 7개 미사용 export는 제거 완료.

---

## 작업 절차 (이 문서를 적용하는 방법)

1. 코드 작성 전: 관련 축의 규칙과 원천 모듈을 확인한다.
2. 코드 작성 후: `npm run verify:quality` → `npx tsc --noEmit` → `npm run lint`
   → 해당 테스트 스위트를 실행한다.
3. SOP 도메인 작업이면 스킬의 최종 가드(`npm run verify:sop-customer -- --final`)까지
   실행한다.
4. 규칙과 충돌하는 요구가 생기면 규칙을 몰래 우회하지 말고 이 문서를 먼저
   갱신한 뒤 코드를 바꾼다 (문서가 원천).
