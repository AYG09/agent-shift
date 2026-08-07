/**
 * Gemini 모델 목록/식별자 해석 로직.
 *
 * Culture-MAP V2의 AIService에 있던 모델 해석 규칙을 이식한 것으로,
 * API 라우트(서버)와 설정 UI(클라이언트) 양쪽에서 공유한다.
 * 브라우저 전용 API(localStorage 등)는 이 파일에 두지 않는다.
 */

// 사용자가 선택한 모델을 저장하는 localStorage 키
export const MODEL_STORAGE_KEY = 'agent-shift-model';

// 같은 탭 안에서 모델 변경을 알리는 커스텀 이벤트 이름
export const MODEL_UPDATED_EVENT = 'model-updated';

// 사용할 최소 Gemini 세대. 2.x 이하 구형 모델은 목록에서 제외한다.
const MIN_GEMINI_MAJOR = 3;

// 우선순위 순으로 정렬된 기본 모델 선호 목록
// (실제 선택은 Google API가 반환한 목록에 있는 모델로 한정된다)
export const FALLBACK_MODEL_PRIORITY = [
    'gemini-3.6-flash', // Latest stable flagship
    'gemini-3.5-flash', // Stable
    'gemini-3.5-flash-lite', // Stable
    'gemini-3.1-flash-lite', // Stable
    'gemini-3.1-pro-preview', // Preview
    'gemini-3-flash-preview', // Preview
] as const;

// API 조회 전에 쓰는 하드코딩 기본값
export const DEFAULT_GEMINI_MODEL: string = FALLBACK_MODEL_PRIORITY[0];

export type GeminiModelListReason =
    | 'missing-api-key'
    | 'api-error'
    | 'empty-api-result'
    | 'filter-empty';

export interface GeminiModelListResult {
    models: string[];
    source: 'api' | 'fallback';
    reason?: GeminiModelListReason;
    errorMessage?: string;
    rawCount?: number;
    filteredCount?: number;
    hasConfiguredApiKey?: boolean;
}

export interface RawModelEntry {
    id: string;
    supportedGenerationMethods?: string[];
}

/** 'models/gemini-3.5-flash' → 'gemini-3.5-flash' */
function normalizeModelId(modelName: string): string {
    return modelName.replace(/^models\//, '').trim();
}

/** 'gemini-3.5-flash' → 3, 'gemini-3-flash-preview' → 3. 형식이 아니면 null. */
function getGeminiMajorVersion(modelId: string): number | null {
    const match = /^gemini-(\d+)/.exec(modelId);
    if (!match) return null;
    return Number(match[1]);
}

/** 3세대 이상인지 판정. 구형(2.x 이하) 모델을 걸러내는 데 쓴다. */
function isSupportedGeneration(modelId: string): boolean {
    const major = getGeminiMajorVersion(modelId);
    return major !== null && major >= MIN_GEMINI_MAJOR;
}

/**
 * available 목록에서 FALLBACK_MODEL_PRIORITY 순서로 첫 번째 일치 모델을 반환.
 * 일치하는 모델이 없으면 available[0], 그것도 없으면 하드코딩 기본값.
 */
function getDefaultGeminiModelId(available: string[]): string {
    for (const preferred of FALLBACK_MODEL_PRIORITY) {
        if (available.includes(preferred)) return preferred;
    }
    return available[0] ?? DEFAULT_GEMINI_MODEL;
}

/**
 * ListModels 응답에서 실제로 쓸 수 있는 Gemini 모델만 남긴다.
 * - 3세대 미만 구형 모델 제외
 * - 임베딩/TTS/Live/이미지 생성 등 generateObject에 못 쓰는 모델 제외
 */
export function filterOfficialGeminiModels(models: RawModelEntry[]): string[] {
    const allowed = models
        .map((m) => {
            const id = normalizeModelId(m.id);
            const methods = m.supportedGenerationMethods;
            // undefined = 응답에 필드 없음(이름 기반 fallback 허용)
            // [] = 지원 메서드 없음으로 명시 → 제외
            const supportsGenerate =
                methods === undefined ? true : methods.includes('generateContent');
            return { id, supportsGenerate };
        })
        .filter(({ id, supportsGenerate }) => {
            if (!id || !isSupportedGeneration(id)) return false;
            if (!supportsGenerate) return false;
            if (/embedding|tts|live|vision-only|imagen|-image$/.test(id)) return false;
            return true;
        });

    return Array.from(new Set(allowed.map(({ id }) => id)));
}

/**
 * 단종된 3.x 모델을 현행 모델로 옮기는 alias 표.
 * Stable을 Preview보다 앞에 둔다.
 *
 * 2.x 이하는 여기에 넣지 않는다 — 표에 없는 값은 기본 모델로 떨어지므로
 * 예전에 gemini-2.5-*를 저장해 둔 사용자도 자동으로 현행 기본 모델로 이동한다.
 */
const MODEL_ALIASES: Record<string, string[]> = {
    'gemini-flash-latest': ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'],
    'gemini-pro-latest': ['gemini-3.1-pro-preview'],
    // Preview → Stable 마이그레이션
    'gemini-3.1-flash-lite-preview': ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'],
    // 단종된 3.x → 현행 모델 자동 전환
    'gemini-3-flash-preview': ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'],
    'gemini-3-flash': ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'],
    'gemini-3-pro': ['gemini-3.1-pro-preview'],
    'gemini-3-pro-preview': ['gemini-3.1-pro-preview'],
};

function resolveModelAlias(preferredModel: string, available: string[]): string | null {
    const candidates = MODEL_ALIASES[preferredModel];
    if (!candidates) return null;
    for (const candidate of candidates) {
        if (available.length === 0 || available.includes(candidate)) return candidate;
    }
    return null;
}

/**
 * 저장된 모델 값을 실제 사용 가능한 모델로 확정한다.
 * available에 있으면 그대로 두고, 없을 때만 alias → 기본값 순으로 대체한다.
 */
export function resolveModelId(
    preferredModel: string | null | undefined,
    available: string[]
): string {
    const modelId = preferredModel ? normalizeModelId(preferredModel) : '';
    // 빈 값이거나 구형 세대면 곧장 기본 모델로 보낸다
    if (!modelId || !isSupportedGeneration(modelId)) return getDefaultGeminiModelId(available);
    if (available.includes(modelId)) return modelId;
    return resolveModelAlias(modelId, available) ?? getDefaultGeminiModelId(available);
}

/**
 * 요청 body로 받은 모델 문자열을 서버에서 검증한다.
 * 서버는 실시간 목록을 들고 있지 않으므로 형식과 세대만 확인하고,
 * alias 마이그레이션은 목록을 아는 클라이언트에 맡긴다.
 */
export function sanitizeModelId(model: unknown): string {
    if (typeof model !== 'string') return DEFAULT_GEMINI_MODEL;
    const id = normalizeModelId(model);
    if (!/^gemini-[a-z0-9.-]+$/i.test(id)) return DEFAULT_GEMINI_MODEL;
    if (!isSupportedGeneration(id)) return DEFAULT_GEMINI_MODEL;
    return id;
}

// ============================================
// 추론 깊이 (thinking level)
// ============================================

// 선택한 추론 깊이를 저장하는 localStorage 키
export const REASONING_STORAGE_KEY = 'agent-shift-reasoning';

// 같은 탭 안에서 추론 깊이 변경을 알리는 커스텀 이벤트 이름
export const REASONING_UPDATED_EVENT = 'reasoning-updated';

/**
 * Gemini 3.x의 thinking_level 값.
 * 'default'는 앱 자체 값으로, 아무것도 보내지 않고 모델 기본 추론을 쓴다는 뜻이다.
 * (모델마다 기본값이 다르다 — 예: 3.5 Flash는 medium, 3.1 Pro는 high)
 */
export type ReasoningLevel = 'default' | 'minimal' | 'low' | 'medium' | 'high';

export const REASONING_LEVELS: ReasoningLevel[] = [
    'default',
    'minimal',
    'low',
    'medium',
    'high',
];

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'default';

export const REASONING_LEVEL_LABELS: Record<ReasoningLevel, string> = {
    default: '모델 기본값 — 모델이 정한 추론 수준',
    minimal: '최소 — 추론 토큰 최소화, 가장 빠름',
    low: '낮음 — 짧은 추론',
    medium: '중간 — 지연과 정확도 균형',
    high: '높음 — 깊은 추론, 복잡한 분석용',
};

export function sanitizeReasoningLevel(value: unknown): ReasoningLevel {
    if (typeof value !== 'string') return DEFAULT_REASONING_LEVEL;
    return (REASONING_LEVELS as string[]).includes(value)
        ? (value as ReasoningLevel)
        : DEFAULT_REASONING_LEVEL;
}
