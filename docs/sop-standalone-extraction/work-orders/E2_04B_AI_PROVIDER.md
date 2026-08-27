# 작업지시서 E2-04B — provider 어댑터 (P2-B, sop-platform, 병렬)

## 임무

AI 호출을 **한 지점에서만 교체 가능한 어댑터**로 정리한다. **이 세션은 provider를 바꾸지
않는다.** 사내망 AI 대상이 미정이기 때문이다 (`AI_PROVIDER_CONTRACT.md` §7 보류 항목).
하는 일은 경계를 확정하고, 서버측 키를 기본 경로로 만들고, 교체 시 손댈 곳을 한 파일로
모으는 것이다.

`INT-AI-004`의 전환 순서 중 **1단계(분리 이관, provider 현행 유지)와 2단계(서버측 키 전환)**
까지가 이 세션의 범위다. 3단계(provider 교체)와 4단계(분할 생성)는 하지 않는다.

## 저장소

```text
C:\Users\USER\Desktop\NOCODE\sop-platform   (branch: main)
기준: E1-02 handoff 시점의 작업트리
```

## 시작 조건

`E0_00_MASTER.md` §2 필독 목록, `AI_PROVIDER_CONTRACT.md` 전문, E1-02 handoff를 읽는다.
E1-02 handoff에 적힌 **고정 인터페이스 계약**이 이 세션의 산출 규격이다.

```bash
cd C:/Users/USER/Desktop/NOCODE/sop-platform
git status --short
npm run test:sop            # 변경 전 기준
```

## 배타적 소유 파일

```text
src/server/ai/model-factory.ts
src/lib/gemini-models.ts
src/app/api/models/route.ts
scripts/verify-quality.mjs   의 provider 규칙 3개만 (provider-import / provider-env-key / provider-options)
```

`REQ-E2B-001`: `scripts/verify-quality.mjs`는 **P2-D와 공유하는 파일**이다.
`E0_00_MASTER.md` `REQ-E0-006`에 따라 **P2-D가 먼저 끝낸 뒤** 그 위에 얹는다. P2-D의 handoff를
받기 전에는 이 파일을 열지 않고 다른 소유 파일을 진행한다.

`REQ-E2B-002`: `src/components/settings/ApiKeySettings.tsx`는 **P2-B 소유가 아니다.**
BYOK UI의 기본 노출 여부를 바꾸는 것은 화면 변경이며 `SopSetupGate`를 만져야 한다.
이 세션은 **서버 동작만** 바꾼다 (§3).

## 구현 지시

### 1. 고정 인터페이스를 확정한다 — 이름과 시그니처를 바꾸지 않는다

`REQ-E2B-003`: `src/server/ai/model-factory.ts`가 노출하는 것은 정확히 다음 5개다.
`AI_PROVIDER_CONTRACT.md` `REQ-AI-005`가 함수 2개만 적고 있으나, 실측상
`resolveGenerationApiKey`가 `src/app/api/models/route.ts`에서 쓰이므로 계약에 포함된다
(`REQ-E0-007`).

```ts
export type GenerationModel = /* provider별 LanguageModel */;
export type GenerationKeySource = 'byok' | 'env' | 'none';
export function resolveGenerationApiKey(byokApiKey?: unknown): { apiKey?: string; source: GenerationKeySource };
export function resolveGenerationModel(params: { model?: unknown; apiKey?: unknown }): GenerationModel;
export function buildReasoningProviderOptions(reasoning: unknown): unknown;
```

이름·인자·반환 형태를 바꾸면 P2-C가 병렬로 작성 중인 라우트가 깨진다. **호출부 변경 0**이
이 계약의 목적이다.

### 2. provider 교체 지점을 한 파일로 좁힌다

현재 `model-factory.ts`의 docstring은 교체 범위를 **두 파일**(`model-factory.ts` +
`gemini-models.ts`)로 적고 있다. 모델 id 정책이 설정 UI와 공유되기 때문이다.

`REQ-E2B-004`: 이 구조를 **유지한다.** 한 파일로 억지로 합치지 않는다. `gemini-models.ts`는
`localStorage` 키·이벤트 이름·추론 레벨 라벨 등 **클라이언트가 함께 쓰는 정책**을 담고 있어
서버 전용 파일로 옮기면 클라이언트가 깨진다.

대신 다음을 한다.

- `model-factory.ts`의 docstring에서 `/api/ai` 언급을 `/api/sop/generate`로 갱신한다.
  **P2-C가 그 라우트를 만들고 있으므로 경로 문자열만 맞춘다** — 코드는 건드리지 않는다.
- 교체 절차 docstring에 **사내망 provider 교체 시 확인해야 할 4가지**
  (`REQ-AI-008`: 구조화 출력 지원, enum 제약 강제, 28~42 노드 출력 토큰 한도, 한국어 품질)를
  추가한다. 이력이 없는 저장소에서 이 판단 근거는 주석으로만 남는다.

`REQ-E2B-005`: `@ai-sdk/google` import는 `model-factory.ts` 밖으로 새지 않는다.
`verify:quality`의 `provider-import` 규칙이 강제한다 — allowlist를 넓히지 않는다.

### 3. 서버측 키를 기본 경로로 만든다

`REQ-AI-009`의 사내망 목표는 서버측 키다. 그러나 `REQ-AI-010`이 body의 `apiKey` 필드를
**즉시 제거하지 말라**고 못박는다 — 제거하면 스키마와 테스트가 함께 깨진다.

`REQ-E2B-006`: `resolveGenerationApiKey`의 **해석 우선순위를 뒤집는다.**

```text
현재   BYOK(body.apiKey) → env → none
변경   서버측 키(env) → BYOK(body.apiKey) → none
```

동작 규칙:

- 서버측 키가 있으면 **body의 `apiKey`는 무시하고 로그에 남기지 않는다** (`REQ-AI-010`)
- 서버측 키가 없으면 BYOK를 쓴다 (개발·시연 경로 유지)
- 둘 다 없으면 `source: 'none'`을 반환한다. **예외를 던지지 않는다** (`REQ-AI-007`) —
  기동 실패로 만들면 AI 없이 쓸 수 있는 나머지 기능까지 죽는다

`REQ-E2B-007`: 이 변경은 **동작 관찰 가능한 변경**이다. 반드시 실행 가능한 회귀 테스트를
남긴다. `tests/sop-node-authoring-generation.test.ts`나 별도 파일이 아니라, **P2-B가 새로
만드는 테스트 파일**에 둔다 — 기존 21개 테스트의 단언을 고치는 것은 금지다.

```text
tests/sop-provider-key-resolution.test.ts   (신규, P2-B 소유)
```

단언:

- env만 있을 때 → `source: 'env'`, env 값 사용
- env와 body.apiKey가 모두 있을 때 → `source: 'env'`, **body 값이 반환값에 나타나지 않는다**
- body.apiKey만 있을 때 → `source: 'byok'`
- 둘 다 없을 때 → `source: 'none'`, throw 하지 않는다
- 비문자열 body.apiKey(숫자·객체·null) → `source: 'none'` 또는 env로 폴백, throw 하지 않는다

`REQ-E2B-008`: `package.json`의 `test:sop`에 이 파일을 추가한다. `package.json`은 P2-B 소유가
아니므로 **직접 고치지 말고 handoff에 요청으로 적는다** — P3가 반영한다.

### 4. 키가 새지 않음을 확인한다

`REQ-AI-011`: 어떤 경로로도 키가 **로그·오류 메시지·클라이언트 응답**에 실리지 않는다.

```bash
grep -rn "apiKey" src/server/ src/app/api/ --include=*.ts | grep -iE "console|throw|NextResponse|message"
```

발견되면 해당 지점이 소유 파일이면 고치고, 소유 밖이면 handoff에 반려로 적는다.

### 5. `gemini-models.ts`를 다루는 방식

`REQ-E2B-009`: **모델 id 목록과 기본값을 바꾸지 않는다.** 사내 모델이 미정이므로
(`AI_PROVIDER_CONTRACT.md` §7) 지금 바꾸면 근거 없는 값이 확정처럼 굳는다.

이 세션이 이 파일에 하는 일은 다음뿐이다.

- 파일 상단에 **provider 교체 시 이 파일이 함께 바뀐다**는 사실과, 어떤 export가
  클라이언트와 공유되는지(localStorage 키·이벤트 이름·라벨)를 docstring으로 명시
- 이름 변경 없음. `gemini-models.ts`라는 파일명은 provider 교체 시 함께 바꾼다 —
  지금 바꾸면 import 4곳이 흔들리고 얻는 것이 없다

`INT-E2B-001`: `MODEL_STORAGE_KEY = 'agent-shift-model'`,
`REASONING_STORAGE_KEY = 'agent-shift-reasoning'`, 그리고 `ApiKeySettings`의
`'agent-shift-api-key'`는 **제품명이 바뀐 뒤에도 그대로 남는 localStorage 키**다.
바꾸면 기존 설정이 유실된다. **이 라운드에서 바꾸지 않는다.** 후속 라운드로 넘긴다는 사실을
handoff에 적는다.

### 6. `verify:quality`의 provider 규칙 (P2-D 이후)

P2-D handoff를 받은 뒤에만 연다.

- `provider-import` / `provider-env-key` / `provider-options` 세 규칙의 `allow` 목록이
  새 저장소 경로와 맞는지 확인한다. 실측상 경로가 그대로이므로 변경이 없을 가능성이 높다 —
  **변경이 없다면 없다고 기록한다.**
- `provider-env-key`가 `GOOGLE_GENERATIVE_AI_API_KEY`를 검사한다면, 서버측 키 우선 전환
  (§3) 이후에도 이 변수 이름이 그대로임을 확인한다. **변수 이름을 바꾸지 않는다** —
  provider가 미정이므로 새 이름을 지금 정할 근거가 없다 (`REQ-RUN-001` 표의 "provider 교체와
  함께 이름·의미가 바뀐다").

## 금지

- provider 실제 교체 (`@ai-sdk/google` → 다른 SDK)
- 모델 id 목록·기본값·추론 레벨 집합 변경
- prompt 문자열·zod 스키마·repair 정책·토큰 예산 변경 (`REQ-AI-001`, `REQ-AI-002`)
- body의 `apiKey` 필드 제거 (`REQ-AI-010`)
- `ApiKeySettings.tsx`·`SopSetupGate.tsx` 수정 — BYOK UI 노출 변경은 이 세션 범위 밖
- `localStorage` 키 이름 변경
- 기존 SOP 테스트 21개의 단언 수정
- `package.json` 직접 수정 (요청으로 넘긴다)
- 키 부재를 기동 실패로 만드는 것 (`REQ-AI-007`)
- P2-D handoff 전에 `scripts/verify-quality.mjs`를 여는 것
- `agent-shift` 수정 / 사용자 승인 없는 commit

## 수용 검증

```bash
npx tsc --noEmit
npm run lint
npx tsx tests/sop-provider-key-resolution.test.ts    # 신규
npm run test:sop
npm run test:sop-demo
git diff --check
git status --short          # 소유 파일 + 신규 테스트 1개만
```

`TST-E2B-001`: 기존 생성 테스트가 그대로 통과한다 (`TST-AI-001`).
특히 `tests/sop-node-authoring-generation.test.ts`와 `tests/sop-subaction-agentization.test.ts`는
wire → normalize → validate → document 전 구간을 실행하며 모델을 스텁으로 주입한다.
**이 테스트들이 provider 교체 작업의 회귀 안전망**이므로 결과가 바뀌면 안 된다.

`TST-E2B-002`: env 키가 설정된 상태와 설정되지 않은 상태 **양쪽에서** `npm run test:sop`이
같은 결과를 낸다.

```bash
GOOGLE_GENERATIVE_AI_API_KEY= npm run test:sop
```

## 인계

`E0_00_MASTER.md` §12 형식에 더해:

1. **고정 인터페이스 5개의 최종 시그니처** — P2-C·P3가 대조할 값
2. **키 해석 우선순위 변경**의 전후 동작표와 신규 테스트 단언 목록
3. `package.json`의 `test:sop`에 신규 테스트를 추가해달라는 **요청** (P3가 반영)
4. `gemini-models.ts`·`localStorage` 키 이름을 **바꾸지 않았다**는 확인과 후속 라운드 이관
5. `AI_PROVIDER_CONTRACT.md` §7 보류 항목에 **손대지 않았다**는 확인 —
   모델 종류·엔드포인트·인증·한도·보존정책 전부
6. `verify:quality` provider 규칙의 변경 여부 (없으면 없다고 명시)
