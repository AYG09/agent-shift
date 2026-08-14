import { generateObject } from 'ai';
import { resolveGenerationModel, buildReasoningProviderOptions } from '@/server/ai/model-factory';
// generateObject에는 관대한 와이어 스키마를 쓴다 — 엄격한 게이트 규칙(superRefine,
// min-length)은 Gemini가 강제하지 못해 파싱 즉사(NoObjectGeneratedError)만 만든다.
// 이 초안도 파이프라인 정규화를 거친 뒤 createSopDocumentFromGeneration의 엄격한
// 게이트(SopGenerationResponseSchema)를 통과해야 문서가 된다. sop-schemas.ts 참고.
import { SopGenerationWireSchema } from '@/lib/sop-schemas';
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
    // 모델·키·추론 옵션 해석은 model-factory(SSOT·프로바이더 교체 지점)가 담당한다.
    const providerOptions = buildReasoningProviderOptions(params.reasoning);
    const model = resolveGenerationModel({ model: params.model, apiKey: params.apiKey });

    const prompt = getStandardDraftPrompt({ taskName: params.taskName, taskDefinition: params.taskDefinition, sources: params.sources });

    let firstObject: unknown;
    try {
        const result = await generateObject({
            model,
            schema: SopGenerationWireSchema,
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
            const repaired = await generateObject({ model, schema: SopGenerationWireSchema, prompt: repairPrompt, maxOutputTokens: 16384, ...(providerOptions ? { providerOptions } : {}) });
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
