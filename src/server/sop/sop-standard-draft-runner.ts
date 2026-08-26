import { generateObject } from 'ai';
import { resolveGenerationModel, buildReasoningProviderOptions } from '@/server/ai/model-factory';
// generateObject에는 관대한 와이어 스키마를 쓴다 — 엄격한 게이트 규칙(superRefine,
// min-length)은 Gemini가 강제하지 못해 파싱 즉사(NoObjectGeneratedError)만 만든다.
// 이 초안도 파이프라인 정규화를 거친 뒤 createSopDocumentFromGeneration의 엄격한
// 게이트(SopGenerationResponseSchema)를 통과해야 문서가 된다. sop-schemas.ts 참고.
import { SopGenerationWireSchema } from '@/lib/sop-schemas';
import { runSopValidationPipeline, buildSopStructuralDigest, generateSopRepairWithRetry } from '@/lib/sop-generation-pipeline';
import { createSopDocumentFromGeneration } from '@/lib/sop-normalizer';
import {
    validateSopNodeAuthoring,
    formatSopNodeQualityIssues,
    SOP_NODE_INSTRUCTION_CONTRACT_VERSION,
    EMPTY_TOOL_REGISTRY,
    SopAgentInstructionSpecSchema,
    SopNodeExecutionSpecSchema,
    type SopNodeQualityReport,
    type SopNodeAuthoringStepInput,
    type SopAgentInstructionSpec,
    type SopNodeExecutionSpec,
} from '@/lib/sop-node-authoring-contract';
import { SopStandardizationIssueWireSchema, SopStandardizationIssueSchema, type SopStandardizationIssue } from '@/lib/sop-standard-draft-schemas';
import { getStandardDraftPrompt, type SopStandardDraftSourceSummary } from './sop-standard-draft-prompt';
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
    | { ok: true; document: SopDocument; qualityReport: SopNodeQualityReport; standardizationIssues: SopStandardizationIssue[] }
    | { ok: false; error: string };

type RawGenerationObject = {
    title?: unknown;
    agentInstruction?: unknown;
    steps?: Array<{
        id?: unknown;
        title?: unknown;
        definition?: unknown;
        shape?: unknown;
        type?: unknown;
        terminalType?: unknown;
        executionSpec?: unknown;
    }>;
    edges?: unknown[];
    /** Additive top-level field the model may return alongside the draft — SopGenerationWireSchema is `.passthrough()`, so this survives parsing/normalization without any Foundation-owned schema change. */
    standardizationIssues?: unknown;
};

/**
 * Coerces a wire-lenient (all-fields-optional) agentInstruction into the
 * strict shape validateSopNodeAuthoring expects, or undefined if even the
 * required `objective` is missing/empty. A structurally invalid glossary
 * entry (missing term/definition) fails the WHOLE coercion rather than being
 * silently dropped — the objective still surfaces via the `missing-mission`
 * warning path in that case, which is an acceptable, self-correcting
 * degradation for a preview-only AI draft.
 */
function coerceAgentInstruction(raw: unknown): SopAgentInstructionSpec | undefined {
    const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const parsed = SopAgentInstructionSpecSchema.safeParse({
        objective: candidate.objective,
        successCriteria: candidate.successCriteria,
        globalConstraints: candidate.globalConstraints,
        glossary: candidate.glossary,
    });
    return parsed.success ? parsed.data : undefined;
}

/**
 * Coerces a wire-lenient executionSpec (every field optional, including
 * `toolPolicy` itself) into the strict shape validateSopNodeAuthoring
 * expects. Returns undefined when required fields (actorRole/action) are
 * missing — validateSopNodeAuthoring then correctly reports
 * `missing-execution-spec` for that step rather than this function silently
 * fabricating placeholder values.
 */
function coerceExecutionSpec(raw: unknown): SopNodeExecutionSpec | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const parsed = SopNodeExecutionSpecSchema.safeParse({
        actorRole: r.actorRole,
        action: r.action,
        completionCriteria: r.completionCriteria,
        decisionCriteria: r.decisionCriteria,
        toolPolicy: r.toolPolicy && typeof r.toolPolicy === 'object' ? r.toolPolicy : {},
        escalationRules: r.escalationRules,
    });
    return parsed.success ? parsed.data : undefined;
}

function toNodeAuthoringSteps(raw: RawGenerationObject): SopNodeAuthoringStepInput[] {
    return (raw.steps ?? []).map((step, index) => ({
        id: typeof step.id === 'string' ? step.id : `step-${index + 1}`,
        title: typeof step.title === 'string' ? step.title : '',
        definition: typeof step.definition === 'string' ? step.definition : '',
        shape: typeof step.shape === 'string' ? step.shape : undefined,
        type: typeof step.type === 'string' ? step.type : undefined,
        terminalType: step.terminalType === 'start' || step.terminalType === 'end' ? step.terminalType : undefined,
        executionSpec: coerceExecutionSpec(step.executionSpec),
    }));
}

/** Builds the corpus findUngroundedThresholds/findUndefinedAbbreviations check node content against — every sanitized source field, so a threshold that genuinely appeared in an approved source is never flagged as invented. */
function buildGroundingTexts(taskDefinition: string | undefined, sources: SopStandardDraftSourceSummary[]): string[] {
    const texts: string[] = [taskDefinition ?? ''];
    sources.forEach((source) => {
        source.steps.forEach((step) => {
            texts.push(step.title, step.definition);
            if (step.responsibleRoleCategory) texts.push(step.responsibleRoleCategory);
            (step.inputs ?? []).forEach((v) => texts.push(v));
            (step.outputs ?? []).forEach((v) => texts.push(v));
            (step.tools ?? []).forEach((v) => texts.push(v));
            (step.cautions ?? []).forEach((v) => texts.push(v));
            (step.decisionRules ?? []).forEach((v) => texts.push(v));
            (step.decisionCriteria ?? []).forEach((c) => texts.push(c.condition, c.outcome));
        });
    });
    return texts;
}

/**
 * The generation WIRE schema accepts a partial executionSpec/agentInstruction
 * (every field optional, so one omission never kills the whole parse — see
 * sop-schemas.ts). The persistence GATE schema
 * (SopGenerationResponseSchema → SopStepCommonFieldsSchema, used inside
 * createSopDocumentFromGeneration) requires a COMPLETE executionSpec/
 * agentInstruction when the field is present at all. Feeding a
 * wire-parsed-but-incomplete spec straight into the gate would throw and turn
 * a node-quality issue (already captured in `quality` above) into a hard
 * document-build failure. This rewrites `raw` with the SAME coerced
 * (defaults-filled-or-dropped) values `validateSopNodeAuthoring` already
 * judged, so the gate only ever sees a spec that is either fully valid or
 * entirely absent, and the quality report stays in sync with what the
 * document actually carries.
 */
function toGateSafeObject(raw: RawGenerationObject, agentInstruction: SopAgentInstructionSpec | undefined, steps: SopNodeAuthoringStepInput[]): RawGenerationObject {
    return {
        ...raw,
        agentInstruction,
        steps: (raw.steps ?? []).map((step, index) => ({ ...step, executionSpec: steps[index]?.executionSpec })),
    };
}

/**
 * Tolerantly extracts and validates the model's `standardizationIssues`
 * passthrough field. A malformed array/entry never fails the whole
 * generation — it degrades to an empty list with a logged warning, since
 * this is a secondary, best-effort channel on top of the (already validated)
 * draft document, not a gate on it.
 */
function extractStandardizationIssues(raw: RawGenerationObject): SopStandardizationIssue[] {
    const wireParsed = SopStandardizationIssueWireSchema.array().safeParse(raw.standardizationIssues ?? []);
    if (!wireParsed.success) {
        console.warn('[SOP StandardDraft] standardizationIssues 필드가 예상 형식이 아니어서 빈 배열로 대체합니다.', wireParsed.error.issues);
        return [];
    }
    const strict: SopStandardizationIssue[] = [];
    wireParsed.data.forEach((candidate) => {
        const parsed = SopStandardizationIssueSchema.safeParse(candidate);
        if (parsed.success) strict.push(parsed.data);
        else console.warn('[SOP StandardDraft] standardizationIssues 항목 하나가 불완전해 제외합니다.', parsed.error.issues);
    });
    return strict;
}

export type SopStandardDraftGenerate = (prompt: string) => Promise<unknown>;

/**
 * Generates the HR-only "대표 표준안 초안" — never persisted by this
 * function (the caller decides whether/how to preview it; see
 * /api/sop/standard-drafts/route.ts, which never calls sopRepository.create
 * with the result), and never invokes any tool/agent executor. `sources`
 * must already be PII-sanitized before reaching here (sanitizeStandardDraftSource).
 *
 * `generate` is injectable (used for both the initial attempt and every
 * repair round) so this can be tested without ever exercising the live
 * network AI call — the same DI seam generateSopFromSetup
 * (sop-setup-actions.ts) uses for its client-side equivalent. Defaults to the
 * real generateObject-backed implementation.
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
    generate?: SopStandardDraftGenerate;
}): Promise<SopStandardDraftRunResult> {
    // 모델·키·추론 옵션 해석은 model-factory(SSOT·프로바이더 교체 지점)가 담당한다.
    const providerOptions = buildReasoningProviderOptions(params.reasoning);
    const model = resolveGenerationModel({ model: params.model, apiKey: params.apiKey });

    const prompt = getStandardDraftPrompt({ taskName: params.taskName, taskDefinition: params.taskDefinition, sources: params.sources });

    const defaultGenerate: SopStandardDraftGenerate = async (p) => {
        const result = await generateObject({ model, schema: SopGenerationWireSchema, prompt: p, maxOutputTokens: 16384, ...(providerOptions ? { providerOptions } : {}) });
        return result.object;
    };
    const generate = params.generate ?? defaultGenerate;

    let firstObject: unknown;
    try {
        firstObject = await generate(prompt);
    } catch (err) {
        return { ok: false, error: `대표 표준안 초안 생성 요청이 실패했습니다: ${err instanceof Error ? err.message : String(err)}` };
    }

    const pipelineResult = await runSopValidationPipeline(firstObject, prompt, generate, STANDARD_DRAFT_CONSTRAINTS);
    if (!pipelineResult.ok) {
        return { ok: false, error: `대표 표준안 초안이 그래프 검증을 통과하지 못했습니다: ${pipelineResult.error}` };
    }

    // 그래프는 유효하다. 이제 개인 SOP와 동일한 5대 node 작성 규칙과 agent-ready
    // 계약(validateSopNodeAuthoring)을 적용한다 — 이 검증은 REQ-STD-003의 대상이며
    // 실패해도 여기서는 절대 502로 만들지 않는다: 1회 repair 후에도 남는 blocking
    // issue는 qualityReport로 명시 반환한다 (§ 수용 검증 "통과하거나 명시적 issue를
    // 반환한다").
    let rawObject = pipelineResult.object as RawGenerationObject;
    const groundingTexts = buildGroundingTexts(params.taskDefinition, params.sources);

    let coercedAgentInstruction = coerceAgentInstruction(rawObject.agentInstruction);
    let nodeAuthoringSteps = toNodeAuthoringSteps(rawObject);
    let quality = validateSopNodeAuthoring({
        agentInstruction: coercedAgentInstruction,
        steps: nodeAuthoringSteps,
        groundingTexts,
        toolRegistry: EMPTY_TOOL_REGISTRY,
        requireExecutionSpec: true,
    });

    if (!quality.ok) {
        try {
            const repairPrompt = `${prompt}\n\n## 이전 응답의 node 작성 품질 결함 (모두 고쳐서 전체 응답을 다시 생성하세요)\n${formatSopNodeQualityIssues(quality.blockingIssues).join('\n')}\n\n## 직전 응답의 구조 요약 (참고용)\n${buildSopStructuralDigest(rawObject)}`;
            const repaired = await generateSopRepairWithRetry(generate, repairPrompt);
            const repairedPipeline = await runSopValidationPipeline(repaired, prompt, generate, STANDARD_DRAFT_CONSTRAINTS);
            if (repairedPipeline.ok) {
                rawObject = repairedPipeline.object as RawGenerationObject;
                coercedAgentInstruction = coerceAgentInstruction(rawObject.agentInstruction);
                nodeAuthoringSteps = toNodeAuthoringSteps(rawObject);
                quality = validateSopNodeAuthoring({
                    agentInstruction: coercedAgentInstruction,
                    steps: nodeAuthoringSteps,
                    groundingTexts,
                    toolRegistry: EMPTY_TOOL_REGISTRY,
                    requireExecutionSpec: true,
                });
            }
            // repairedPipeline이 그래프 검증에 실패하면 repair 이전(그래프는 유효했던)
            // rawObject를 그대로 유지한다 — node 품질 repair 시도가 이미 유효한 그래프를
            // 깨뜨렸다는 이유로 전체 요청을 502로 만들지 않는다.
        } catch (repairError) {
            console.error('[SOP StandardDraft] node 품질 repair 요청 실패, 이전 응답의 quality issue를 그대로 반환합니다:', repairError);
        }
    }

    const standardizationIssues = extractStandardizationIssues(rawObject);
    const gateSafeObject = toGateSafeObject(rawObject, coercedAgentInstruction, nodeAuthoringSteps);

    const placeholderMember: SopMember = { name: 'HR 대표 표준안 (AI 초안)', jobRole: params.workLibrary.taskName };
    let document: SopDocument;
    try {
        document = createSopDocumentFromGeneration({
            id: params.id,
            rawResponse: gateSafeObject,
            member: placeholderMember,
            workLibrary: params.workLibrary,
            context: `${params.taskName} — ${params.sources.length}건의 승인된 구성원 SOP를 종합한 AI 대표 표준안 초안입니다. 공식 확정본이 아닙니다.`,
            setupConfig: {
                detailLevel: 'standard',
                minSteps: STANDARD_DRAFT_CONSTRAINTS.minSteps,
                maxSteps: STANDARD_DRAFT_CONSTRAINTS.maxSteps,
                branchPolicy: 'auto',
                maxBranches: STANDARD_DRAFT_CONSTRAINTS.maxBranches,
                allowRework: true,
                maxTotalNodes: STANDARD_DRAFT_CONSTRAINTS.maxTotalNodes,
                maxLoops: STANDARD_DRAFT_CONSTRAINTS.maxLoops,
            },
            isSampleData: false,
            instructionContractVersion: SOP_NODE_INSTRUCTION_CONTRACT_VERSION,
        });
    } catch (err) {
        return { ok: false, error: `대표 표준안 초안 문서를 구성하지 못했습니다: ${err instanceof Error ? err.message : String(err)}` };
    }

    return { ok: true, document, qualityReport: quality, standardizationIssues };
}
