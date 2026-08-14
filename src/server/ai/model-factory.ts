import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { sanitizeModelId, sanitizeReasoningLevel } from '@/lib/gemini-models';

/**
 * AI 생성 모델의 단일 해석 지점 (SSOT · 프로바이더 교체 지점).
 *
 * 이전에는 BYOK→환경변수→기본값 해석과 프로바이더 전용 추론 옵션이 4개 파일
 * (/api/ai, /api/sop/task-recommendations, /api/sop/activity-proposals,
 * sop-standard-draft-runner)에 각각 복사되어 있었다. 이제 모든 generateObject
 * 호출자는 이 팩토리만 사용하고, `@ai-sdk/google` import는 이 파일과
 * 모델 id 정책(src/lib/gemini-models.ts)에만 존재한다 —
 * `npm run verify:quality`가 이를 강제한다.
 *
 * ## 다른 프로바이더(OpenAI / Anthropic)로 교체하는 방법
 *
 * Vercel AI SDK의 `LanguageModel` 추상화를 경계로 쓰므로 교체 범위는 두 파일이다:
 *  1. 이 파일: `@ai-sdk/google` → `@ai-sdk/openai`(또는 `@ai-sdk/anthropic`)로
 *     import를 바꾸고, `resolveGenerationModel`의 인스턴스 생성과
 *     `buildReasoningProviderOptions`의 프로바이더 옵션 매핑(Google의
 *     `thinkingConfig` ↔ OpenAI `reasoningEffort` ↔ Anthropic `thinking`)을
 *     새 프로바이더 형식으로 바꾼다. 환경변수 이름(`GOOGLE_GENERATIVE_AI_API_KEY`)도
 *     여기서만 바뀐다.
 *  2. src/lib/gemini-models.ts: 모델 id 목록/검증 정책(sanitizeModelId 등)을
 *     새 프로바이더의 모델 id 체계로 교체한다 (설정 UI가 이 정책을 공유한다).
 * 호출자(API 라우트·러너)는 수정할 필요가 없다.
 */

export type GenerationModel = ReturnType<typeof google>;

export type GenerationKeySource = 'byok' | 'env' | 'none';

/**
 * BYOK(요청 바디의 사용자 키) → 환경변수 순으로 API 키를 해석한다.
 * `apiKey`가 없으면(source: 'none') 키가 필수인 라우트는 400을 반환하고,
 * 선택인 라우트는 프로바이더 기본 인스턴스로 진행한다.
 */
export function resolveGenerationApiKey(byokApiKey?: unknown): { apiKey?: string; source: GenerationKeySource } {
    // 검증 전 요청 바디 값이므로 문자열이 아니면 "키 없음"으로 처리한다 (500 방지).
    const byok = typeof byokApiKey === 'string' ? byokApiKey.trim() : '';
    if (byok) return { apiKey: byok, source: 'byok' };
    const env = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (env) return { apiKey: env, source: 'env' };
    return { source: 'none' };
}

/** 모델 id를 정책(sanitizeModelId)으로 정규화하고 해석된 키로 모델 인스턴스를 만든다. */
export function resolveGenerationModel(params: { model?: unknown; apiKey?: unknown }): GenerationModel {
    const modelId = sanitizeModelId(params.model);
    const { apiKey } = resolveGenerationApiKey(params.apiKey);
    return apiKey ? createGoogleGenerativeAI({ apiKey })(modelId) : google(modelId);
}

/**
 * 추론 깊이를 프로바이더 전용 providerOptions로 변환한다.
 * 'default'는 undefined를 반환해 모델 기본 추론 수준을 그대로 쓴다.
 * generateObject 호출부에서는 `...(options ? { providerOptions: options } : {})`
 * 형태로 전개한다.
 */
export function buildReasoningProviderOptions(reasoning: unknown) {
    const level = sanitizeReasoningLevel(reasoning);
    if (level === 'default') return undefined;
    // 반환 타입은 추론에 맡긴다 — generateObject의 providerOptions(JSONValue 제약)에
    // 그대로 대입 가능해야 하므로 넓은 Record 타입으로 명시하지 않는다.
    return { google: { thinkingConfig: { thinkingLevel: level } } };
}
