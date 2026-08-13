import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { sanitizeModelId, sanitizeReasoningLevel } from '@/lib/gemini-models';
import { SopGenerationResponseSchema } from '@/lib/sop-schemas';
import { runSopValidationPipeline } from '@/lib/sop-generation-pipeline';
import { createSopDocumentFromGeneration } from '@/lib/sop-normalizer';
import { getStandardDraftPrompt, type SopStandardDraftSourceSummary } from './sop-prompt';
import type { SopDocument, SopMember, WorkLibrarySelection } from '@/lib/sop-types';
import type { SopStructuralConstraints } from '@/lib/graph-validation';

/**
 * A deliberately loose structural check for the HR standard-draft preview —
 * start/end/decision/connectivity only (via runSopValidationPipeline), never
 * the strict per-Task Activity coverage a member's own Task-wide generation
 * requires (this is a cross-member representative merge with no single
 * source Activity list to cover). Wide step-count bounds because the model
 * decides how much to consolidate across N source SOPs.
 */
const STANDARD_DRAFT_CONSTRAINTS: SopStructuralConstraints = {
    minSteps: 3,
    maxSteps: 24,
    maxTotalNodes: 30,
    branchPolicy: 'auto',
    maxBranches: 3,
    allowRework: true,
    maxLoops: 3,
};

export type SopStandardDraftRunResult =
    | { ok: true; document: SopDocument }
    | { ok: false; error: string };

/**
 * Generates the HR-only "대표 표준안 초안" — never persisted by this
 * function (the caller decides whether/how to preview it; see
 * /api/sop/standard-drafts/route.ts, which never calls sopRepository.create
 * with the result). `sources` must already be PII-sanitized before reaching
 * here — this function has no sanitization logic of its own.
 */
export async function generateStandardDraftDocument(params: {
    id: string;
    taskName: string;
    taskDefinition?: string;
    sources: SopStandardDraftSourceSummary[];
    workLibrary: WorkLibrarySelection;
    model?: string;
    reasoning?: string;
    apiKey?: string;
}): Promise<SopStandardDraftRunResult> {
    const modelId = sanitizeModelId(params.model);
    const reasoningLevel = sanitizeReasoningLevel(params.reasoning);
    const providerOptions = reasoningLevel === 'default' ? undefined : { google: { thinkingConfig: { thinkingLevel: reasoningLevel } } };

    const trimmedApiKey = params.apiKey?.trim();
    const envApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    const model = trimmedApiKey
        ? createGoogleGenerativeAI({ apiKey: trimmedApiKey })(modelId)
        : envApiKey
          ? createGoogleGenerativeAI({ apiKey: envApiKey })(modelId)
          : google(modelId);

    const prompt = getStandardDraftPrompt({ taskName: params.taskName, taskDefinition: params.taskDefinition, sources: params.sources });

    let firstObject: unknown;
    try {
        const result = await generateObject({
            model,
            schema: SopGenerationResponseSchema,
            prompt,
            maxOutputTokens: 16384,
            ...(providerOptions ? { providerOptions } : {}),
        });
        firstObject = result.object;
    } catch (err) {
        return { ok: false, error: `대표 표준안 초안 생성 요청이 실패했습니다: ${err instanceof Error ? err.message : String(err)}` };
    }

    const pipelineResult = await runSopValidationPipeline(
        firstObject,
        prompt,
        async (repairPrompt) => {
            const repaired = await generateObject({ model, schema: SopGenerationResponseSchema, prompt: repairPrompt, maxOutputTokens: 16384, ...(providerOptions ? { providerOptions } : {}) });
            return repaired.object;
        },
        STANDARD_DRAFT_CONSTRAINTS
    );
    if (!pipelineResult.ok) {
        return { ok: false, error: `대표 표준안 초안이 그래프 검증을 통과하지 못했습니다: ${pipelineResult.error}` };
    }

    const placeholderMember: SopMember = { name: 'HR 대표 표준안 (AI 초안)', jobRole: params.workLibrary.taskName };
    const document = createSopDocumentFromGeneration({
        id: params.id,
        rawResponse: pipelineResult.object,
        member: placeholderMember,
        workLibrary: params.workLibrary,
        context: `${params.taskName} — ${params.sources.length}건의 승인된 구성원 SOP를 종합한 AI 대표 표준안 초안입니다. 공식 확정본이 아닙니다.`,
        setupConfig: { detailLevel: 'standard', minSteps: STANDARD_DRAFT_CONSTRAINTS.minSteps, maxSteps: STANDARD_DRAFT_CONSTRAINTS.maxSteps, branchPolicy: 'auto', maxBranches: STANDARD_DRAFT_CONSTRAINTS.maxBranches, allowRework: true, maxTotalNodes: STANDARD_DRAFT_CONSTRAINTS.maxTotalNodes, maxLoops: STANDARD_DRAFT_CONSTRAINTS.maxLoops },
        isSampleData: false,
    });

    return { ok: true, document };
}
