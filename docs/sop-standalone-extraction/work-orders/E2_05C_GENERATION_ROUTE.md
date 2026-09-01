# 작업지시서 E2-05C — AI 라우트 분해 (P2-C, sop-platform, 병렬)

## 임무

원본 `src/app/api/ai/route.ts`의 **`generateSop` 분기만** 새 저장소의 SOP 전용 라우트로 옮긴다.
`/flow`의 as-is·to-be·drilldown·node-split action은 새 저장소에 존재하지 않으므로 공유 라우트를
유지할 이유가 없다 (`REQ-EXT-005`).

`INT-EXT-002`: **이 분해는 동작 변경이 아니다.** prompt 문자열, 스키마, repair 정책, 토큰 예산,
오류 응답 형태를 바꾸지 않는다. 옮기는 것은 **라우팅뿐**이다.

## 저장소

```text
읽기 참조   C:\Users\USER\Desktop\NOCODE\agent-shift\src\app\api\ai\route.ts  @ 52b8377
작업 대상   C:\Users\USER\Desktop\NOCODE\sop-platform   (branch: main)
```

`REQ-E2C-001`: `agent-shift`는 **읽기만** 한다. E1이 이 파일을 이관하지 않았으므로 원본을
직접 읽어 옮긴다.

## 시작 조건

`E0_00_MASTER.md` §2 필독 목록, E1-02 handoff를 읽는다. **E1-02 handoff에 적힌 provider 어댑터
5개 시그니처**가 이 세션이 호출할 계약이다. P2-B가 병렬로 그 파일을 만지고 있으므로
**시그니처를 협상하지 않고 handoff 값을 그대로 쓴다.**

```bash
cd C:/Users/USER/Desktop/NOCODE/sop-platform
git status --short
npm run test:sop            # 변경 전 기준
```

## 배타적 소유 파일

```text
src/app/api/sop/generate/route.ts        (신규)
src/server/sop/sop-request.ts
src/lib/sop-ai-generation.ts             (URL 문자열 한 줄만 — §4 참고)
```

`REQ-E2C-002`: `src/lib/sop-ai-generation.ts`는 SOP 도메인 파일이다. 이 세션에 허용된 변경은
**엔드포인트 URL 문자열 한 곳**뿐이다. 다른 줄을 바꾸면 소유 위반이다.

## 구현 지시

### 1. 옮길 것의 정확한 경계

원본 `route.ts`에서 `generateSop` 경로가 실행하는 것은 다음 순서다. **이 순서와 각 단계의
인자를 그대로 재현한다.**

```text
1. body 파싱
2. sanitizeModelId(body.model) / sanitizeReasoningLevel(body.reasoning)  ← 로깅용 정규화
   buildReasoningProviderOptions(body.reasoning)
   resolveGenerationApiKey(apiKey).source                                ← 로깅용
   console.log('[API Route] Model: … | Reasoning: … | Key: …')
   resolveGenerationModel({ model: body.model, apiKey })
3. parseSopGenerationRequest(body)  → 실패 시 그 응답을 그대로 반환 (400)
4. structureVersion === 'activity-subaction-v1' && activities.length > 0 이면
   computeSubActionCapacity(...)로 minSteps/maxSteps/maxTotalNodes를 덮어쓴다
5. schema = SopGenerationWireSchema
   prompt = getSopPrompt({ …sopRequest의 18개 필드 그대로… })
6. maxOutputTokens = 65536              ← SOP 전용 상한. /flow의 16384와 분리돼 있다
7. generateObject 1차 호출. 실패하면 같은 프롬프트로 1회 재시도
8. runSopGenerationPostProcessing({ object, prompt, sopRequest, generateRepair, generateSuggestionPatch })
   - generateRepair:          maxOutputTokens 65536
   - generateSuggestionPatch: maxOutputTokens 8192, 실패 시 1회 재시도
9. sopResult.ok === false 이면 그 응답을 그대로 반환
10. 응답: object + warnings
```

`REQ-E2C-003`: **6번의 `65536`과 8번의 `8192`를 바꾸지 않는다.** 원본 주석이 그 근거를
설명한다 — Activity–Sub Action Task 전체 SOP는 28~42+ 노드이므로 `/flow`의 16384를 쓰면 JSON이
잘려 `NoObjectGeneratedError`로 끝난다. **이 주석을 함께 옮긴다.** 이력 없는 저장소에서
그 숫자의 근거는 주석뿐이다.

`REQ-E2C-004`: **7번의 1차 재시도와 8번 패치의 재시도를 제거하지 않는다.** 원본 주석이
근거를 적고 있다 — 자유 문자열 필드의 퇴행 반복 루프는 확률적 실패라 두 번째 추첨이 대부분
성공한다.

### 2. 인라인 prompt 문자열을 그대로 옮긴다

`REQ-E2C-005`: `generateSuggestionPatch` 안의 **Agent화 제안 패치 프롬프트는 라우트 파일에
인라인으로 들어 있다.** 이 문자열은 `REQ-AI-001`이 보호하는 도메인 계약이다.

- 한 글자도 바꾸지 않는다 — 줄바꿈·공백·`type` 3종 설명·"확률/신뢰도 수치는 만들지 마세요"
  포함
- `type` 값 집합(`agent-candidate` / `ai-assist` / `not-recommended`)을 줄이지 않는다
  (`REQ-EXT-004`)
- 옮긴 뒤 원본과 byte 단위로 비교해 증명한다

```bash
# 옮긴 문자열이 원본과 동일한지
diff <(sed -n '/당신은 업무 프로세스의 AI 적용 가능성을/,/## 단계 목록/p' \
        C:/Users/USER/Desktop/NOCODE/agent-shift/src/app/api/ai/route.ts) \
     <(sed -n '/당신은 업무 프로세스의 AI 적용 가능성을/,/## 단계 목록/p' \
        src/app/api/sop/generate/route.ts)
# 출력이 비어야 한다
```

`INT-E2C-001`: 이 프롬프트를 `src/server/sop/sop-prompt.ts`로 옮기는 것이 구조적으로는 더
나아 보이지만, **이 라운드에서 하지 않는다.** 파일 이동은 검증 대상을 하나 더 만들고
`REQ-AI-001`의 보호 범위를 흔든다. 후속 라운드로 넘긴다는 사실만 handoff에 적는다.

### 3. 옮기지 않을 것

```text
generateAsIsFlow / generateToBeFlow / generateDrilldown / generateNodeSplit
validateFlowGraph 분기 · validateDrilldownBranching 분기
AsIsFlowResponseSchema / ToBeFlowResponseSchema / NodeSplitResponseSchema
getAsIsPrompt / getToBePrompt / getDrilldownPrompt / getNodeSplitPrompt (src/server/flow/flow-prompts.ts)
maxOutputTokens 16384 경로 전부
```

`REQ-E2C-006`: 위 항목이 새 저장소에 **하나도 들어오지 않아야 한다.**

```bash
grep -rn "generateAsIsFlow\|generateToBeFlow\|generateDrilldown\|generateNodeSplit\|flow-prompts\|validateDrilldownBranching" src/
# 출력이 비어야 한다
```

### 4. 클라이언트 URL을 바꾼다

`src/lib/sop-ai-generation.ts`가 `fetchFn('/api/ai', …)`를 호출한다. 이것을
`'/api/sop/generate'`로 바꾼다.

`REQ-E2C-007`: **요청 body를 바꾸지 않는다.** action 필드(`'generateSop'`)를 포함해 현재
보내는 것을 그대로 보낸다 — 서버가 action을 무시하더라도 body 형태를 바꾸면
`parseSopGenerationRequest`의 스키마와 테스트가 함께 흔들린다. 바뀌는 것은 URL 문자열
**하나**다 (`REQ-E0-008`).

`REQ-E2C-008`: 다른 SOP API 호출부(`/api/sop/task-recommendations`,
`/api/sop/activity-proposals`, `/api/sop/standard-drafts`, `/api/sop/templates`,
`/api/sop/approvals`, `/api/sop/analytics`, `/api/sop/[id]`)는 경로가 그대로다.
**건드리지 않는다.**

### 5. `sop-request.ts`를 다루는 방식

`REQ-E2C-009`: `parseSopGenerationRequest`의 **검증 규칙·오류 응답 형태·필드별 issue 구조를
바꾸지 않는다.** 이 세션에 허용된 변경은 docstring의 경로 언급(`/api/ai` → `/api/sop/generate`)
갱신뿐이다.

주석이 설명하는 계약을 유지한다 — 서버는 클라이언트 검증을 신뢰하지 않고, 요청 전체를
공용 스키마로 즉시 파싱하며, `apiKey`/`detailLevel`/`branchPolicy`가 잘못된 타입이어도
400으로 끝나고 500을 만들지 않는다.

### 6. 회귀 테스트를 남긴다

`REQ-E2C-010`: `TST-EXT-002`("분해 후 SOP 생성 요청이 기존과 **같은 문서**를 만든다")를
실행 가능한 형태로 증명한다. **기존 21개 테스트의 단언을 고치지 않고** 새 파일에 둔다.

```text
tests/sop-generate-route-parity.test.ts   (신규, P2-C 소유)
```

단언:

- 같은 wire 입력에 대해 `createSopDocumentFromGeneration` 결과의
  **steps·edges·provenance가 원본 기대값과 동일**하다
- `parseSopGenerationRequest`가 잘못된 body에 대해 **400과 필드별 issue**를 반환한다
  (`apiKey` 비문자열, `detailLevel` 미허용 값, `branchPolicy` 미허용 값 각각)
- `activity-subaction-v1` + activities 존재 시 `computeSubActionCapacity`가 적용된
  minSteps/maxSteps/maxTotalNodes가 prompt 빌드에 **실제로 전달**된다
- SOP 생성 경로의 `maxOutputTokens`가 **65536**이고 패치 경로가 **8192**다

`REQ-E2C-011`: 테스트는 모델을 **스텁으로 주입**한다. 실제 provider 호출을 하지 않는다 —
`TST-AI-001`이 확인한 대로 기존 생성 테스트가 이미 그 방식이며, 그것이 이 라운드의 회귀
안전망이다.

`REQ-E2C-012`: `package.json`의 `test:sop`에 이 파일을 추가해달라는 **요청을 handoff에
적는다.** `package.json`은 P2-C 소유가 아니다 — P3가 반영한다.

## 금지

- prompt 문자열 변경 (인라인 패치 프롬프트 포함) · zod 스키마 변경 · repair 정책 변경
- 토큰 예산(65536 / 8192) 변경
- 1차 생성·패치의 1회 재시도 제거
- `/flow` action·스키마·prompt를 새 저장소로 들여오는 것
- 요청/응답 wire 형태 변경 — URL 하나 외
- `src/lib/sop-ai-generation.ts`의 URL 외 다른 줄 수정
- 다른 SOP API 경로 변경
- provider 어댑터 시그니처 변경·협상 (P2-B 소유)
- 기존 SOP 테스트 21개의 단언 수정
- `package.json` 직접 수정
- `agent-shift` 수정 / 사용자 승인 없는 commit

## 수용 검증

```bash
npx tsc --noEmit
npm run lint
npx tsx tests/sop-generate-route-parity.test.ts    # 신규
npm run test:sop
npm run test:sop-demo
npm run build
git diff --check
git status --short          # 소유 파일 + 신규 테스트 1개만
```

`TST-E2C-001`: `grep`으로 `/flow` action 잔존 0건을 증명한다 (§3).

`TST-E2C-002`: 인라인 패치 프롬프트가 원본과 byte 동일함을 `diff`로 증명한다 (§2).

`TST-E2C-003`: `npm run test:sop`의 결과가 시작 조건에서 기록한 기준과 동일하다.

## 인계

`E0_00_MASTER.md` §12 형식에 더해:

1. **옮긴 단계 10개**와 원본 라인 범위의 대조 — 각 단계가 어디서 왔는지
2. **byte 동일성 증명** — 인라인 패치 프롬프트 `diff` 출력
3. **토큰 예산 보존 확인** — 65536 / 8192
4. `/flow` 잔존 0건 `grep` 출력
5. `sop-ai-generation.ts`에서 바꾼 **정확한 한 줄**의 diff
6. `package.json`의 `test:sop`에 신규 테스트 추가 **요청** (P3가 반영)
7. 인라인 프롬프트를 `sop-prompt.ts`로 옮기는 것을 **후속 라운드로 넘긴다**는 기록
   (`INT-E2C-001`)
8. P2-B에게: 실제로 호출한 provider 어댑터 함수와 인자 (시그니처 불일치 시 조기 발견용)
