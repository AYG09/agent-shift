# AI provider 교체 계약

## 1. 목적

사내망 AI 대상이 **미정**인 상태에서, 대상이 정해졌을 때 **한 지점만 바꾸면 되도록** 경계를
고정한다. 이 문서는 어떤 모델을 쓸지 정하지 않는다. 무엇이 바뀌어도 되는 곳과 절대 바뀌면 안
되는 곳을 나눈다.

## 2. 현재 구조 (실측)

```text
브라우저                          서버
useSopAiSettings ──(model/reasoning/apiKey)──▶ API route
  └ localStorage                                 └ model-factory.ts (65줄)
    'agent-shift-api-key'                          ├ resolveGenerationModel()
  ApiKeySettings.tsx (423줄)                       └ buildReasoningProviderOptions()
                                                        └ @ai-sdk/google → generateObject
```

- `model-factory.ts`가 **문서화된 유일한 provider 교체 지점**이다. `verify:quality`가
  `@ai-sdk/google` import를 이 파일과 `gemini-models.ts` 밖에서 금지한다.
- 키 해석 순서는 BYOK → `GOOGLE_GENERATIVE_AI_API_KEY` env → 없음이다.
- 호출은 Vercel AI SDK의 `generateObject`(구조화 출력)를 경계로 한다.

이 구조는 교체를 전제로 이미 설계돼 있다. 분리 작업이 새로 만들 것은 많지 않다.

## 3. 바뀌어도 되는 것 / 바뀌면 안 되는 것

### 3.1 바뀌어도 되는 것 (provider 어댑터 내부)

- 어떤 SDK·클라이언트를 쓰는가
- 모델 ID 목록과 기본값 (`gemini-models.ts`가 담당하던 역할)
- 추론 옵션(`thinkingConfig` 같은 provider 전용 옵션)
- 인증 방식 (API key, mTLS, 사내 토큰, IAM)
- 엔드포인트 주소와 프로토콜

### 3.2 절대 바뀌면 안 되는 것

`REQ-AI-001`: **prompt 문자열과 출력 스키마.** `getSopPrompt`, `getStandardDraftPrompt`,
`SopGenerationWireSchema`, `SopGenerationResponseSchema`는 도메인 계약이지 provider 사정이
아니다. 모델을 바꾼다는 이유로 이 값들을 고치면 SOP 품질 계약이 조용히 달라진다.

`REQ-AI-002`: **생성 후처리 파이프라인.** 정규화 → 그래프 검증 → node 작성 품질 검증 →
1회 repair → 재검증 → blocking/warning 분리 순서를 유지한다.

`REQ-AI-003`: **Agent화 제안과 구성원 판단의 분리**, **tool policy가 실행 권한이 아니라는
계약**, **입력에 없는 수치·SLA·권한 생성 금지** — 전부 provider와 무관한 도메인 규칙이다.

`REQ-AI-004`: **오류 시 사용자 경험.** 실패해도 입력이 보존되고, 재시도·맥락 수정·수동 Task
선택 경로가 살아 있어야 한다. 가짜 진행률·ETA·confidence를 만들지 않는다.

## 4. provider 어댑터 계약

`REQ-AI-005`: 새 저장소의 provider 어댑터는 다음 두 가지만 노출한다. 이름은 현재와 같게
유지해 호출부 변경을 0으로 만든다.

```ts
resolveGenerationModel(params: { model?: string; apiKey?: string }): LanguageModel
buildReasoningProviderOptions(reasoning?: string): ProviderOptions | undefined
```

`REQ-AI-006`: provider 전용 옵션이 이 파일 밖으로 새지 않는다. `verify:quality`의 해당 규칙을
새 저장소에서도 유지한다 — 허용 파일 목록만 새 provider 파일로 바꾼다.

`REQ-AI-007`: 어댑터는 **키·엔드포인트가 없을 때 예외를 던지지 않고** 호출 시점에 명확한
실패를 만들어야 한다. 기동 실패로 만들면 AI 없이 쓸 수 있는 나머지 기능까지 죽는다.

## 5. 구조화 출력 의존성 — 가장 큰 이식 위험

`INT-AI-001`: 이 앱의 생성 경로는 **구조화 출력(JSON schema 강제)** 에 강하게 의존한다.
`generateObject`에 zod 스키마를 넘겨 28~42개 노드의 그래프를 한 번에 받는다.

사내 모델이 이를 지원하지 않거나 품질이 낮으면 다음이 무너진다.

- wire 스키마 파싱 (실패 시 repair 루프에 도달조차 못 한다)
- Activity–Sub Action coverage
- Agent화 제안 완결성
- 노드 실행 명세(`executionSpec`)

`REQ-AI-008`: provider 선정 시 **다음을 먼저 확인한다.**

1. JSON schema 기반 구조화 출력을 지원하는가 (아니면 함수 호출/문법 제약이라도 있는가)
2. enum 제약을 실제로 강제하는가 — 이 저장소는 자유 문자열 필드에서 모델이 퇴행 반복 루프에
   빠져 응답이 잘린 사고를 겪었고, `type` 필드를 enum으로 제한해 막았다
3. 28~42 노드 응답을 담을 출력 토큰 한도가 있는가 (현재 SOP 생성은 `/flow`와 **분리된**
   토큰 예산을 쓴다 — 같은 한도를 쓰면 JSON 절단으로 전체가 실패한다)
4. 한국어 지시·출력 품질이 노드 작성 5대 규칙을 만족하는가

`TST-AI-001`: provider 교체 후 **기존 생성 테스트가 그대로 통과**해야 한다. 특히
`tests/sop-node-authoring-generation.test.ts`와 `tests/sop-subaction-agentization.test.ts`는
wire → normalize → validate → document 전 구간을 실행한다. 이 테스트들은 모델을 스텁으로
주입하므로 provider 없이도 돌아간다 — 즉 **교체 작업의 회귀 안전망이 이미 존재한다.**

`INT-AI-002`: 사내 모델의 구조화 출력이 약하면 대안은 스키마 완화가 아니라 **분할 생성**이다.
Activity 단위로 나눠 여러 번 호출하고 합치는 방식. 이 경우에도 최종 문서가 같은 게이트
스키마를 통과해야 한다. 스키마를 낮추는 방향은 도메인 계약을 훼손하므로 금지한다.

## 6. 키 관리 전환

`REQ-AI-009`: 사내망 기본 경로는 **서버측 키**다. 브라우저는 키를 보지 않는다.

| 구분 | 현재 | 사내망 목표 |
|---|---|---|
| 저장 위치 | `localStorage['agent-shift-api-key']` | 서버 환경변수 또는 사내 비밀 저장소 |
| 전달 | 요청 body에 `apiKey` 포함 | 전달하지 않음 |
| 주체 | 구성원 개인 | 시스템 |
| 한도·감사 | 불가 | 서버에서 가능 |

`REQ-AI-010`: 요청 body의 `apiKey` 필드는 **즉시 제거하지 않는다.** 개발·시연 환경에서
BYOK가 여전히 유용하고, 제거하면 스키마·테스트가 함께 깨진다. 대신:

- 서버는 **서버측 키가 있으면 그것을 우선**한다
- 서버측 키가 있을 때 body의 `apiKey`는 **무시하고 로그에 남기지 않는다**
- BYOK UI는 기본 숨김이며, 설정으로만 노출한다

`REQ-AI-011`: 어떤 경로로도 키가 **로그·오류 메시지·클라이언트 응답**에 실리지 않는다.

`INT-AI-003`: 사내 프록시를 경유하는 형태가 확정되면, 어댑터는 엔드포인트만 바꾸면 된다.
프록시 인증 헤더도 어댑터 내부에 둔다 — 호출부는 이 사실을 몰라야 한다.

## 7. 보류 항목

확정 전까지 코드가 먼저 정하지 않는다.

- 모델 종류·버전·컨텍스트 한도·출력 토큰 한도
- 엔드포인트 주소, 프로토콜, 인증 방식
- 구조화 출력 지원 수준과 그에 따른 분할 생성 필요 여부
- 요청 한도·큐잉·동시성 정책
- 비용·사용량 집계 주체
- 프롬프트·응답의 보존 여부와 기간 (개인 업무 내용이 포함된다)
- 모델 품질 평가 기준과 합격선

## 8. 전환 순서 제안

`INT-AI-004`: 다음 순서를 권장한다. 각 단계가 독립적으로 검증 가능하다.

1. **분리 이관** — provider는 현행 유지. 동등성만 증명한다
2. **서버측 키 전환** — provider는 그대로, 키 출처만 바꾼다. BYOK는 숨김
3. **provider 교체** — 어댑터 내부만 교체. 기존 생성 테스트로 회귀 확인
4. **필요 시 분할 생성** — 구조화 출력이 약할 때만. 게이트 스키마는 유지

한 단계에 둘 이상을 겹치면 실패 원인을 분리할 수 없다.
