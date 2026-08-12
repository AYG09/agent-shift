import { z } from 'zod';
import { sanitizeModelId, sanitizeReasoningLevel, type ReasoningLevel } from './gemini-models';
import { SOP_DETAIL_LEVELS, SOP_BRANCH_POLICIES, validateSopSetupConfig, type SopDetailLevel, type SopBranchPolicy } from './sop-setup-validation';

/**
 * The client/server-shared SOP generation request contract. `buildSopGenerationRequestBody`
 * (client) and the `/api/ai` `generateSop` handler (server) both produce/consume values that
 * must satisfy this schema, so a request either passes the same validation on both sides or
 * is rejected with a 400 before any model call — never trusted as a loosely-typed request body.
 */
const SopSkillRefSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
});

const SopActivityRefSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    skills: z.array(SopSkillRefSchema),
});

export const SopGenerationRequestSchema = z
    .object({
        action: z.literal('generateSop'),
        memberRole: z.string().min(1),
        taskName: z.string().min(1),
        sourceType: z.enum(['task', 'activity']),
        activityName: z.string().optional(),
        activities: z.array(SopActivityRefSchema).min(1),
        skills: z.array(SopSkillRefSchema),
        context: z.string(),
        detailLevel: z.enum(SOP_DETAIL_LEVELS),
        minSteps: z.number().int(),
        maxSteps: z.number().int(),
        maxTotalNodes: z.number().int().optional(),
        branchPolicy: z.enum(SOP_BRANCH_POLICIES),
        maxBranches: z.number().int(),
        allowRework: z.boolean(),
        maxLoops: z.number().int().optional(),
        splitComplexSteps: z.boolean().optional(),
        apiKey: z.string().optional(),
        model: z.string().optional(),
        reasoning: z.string().optional(),
    })
    // Delegates the structural business rules (min < max, maxTotalNodes floor, branch count
    // range) to the same pure function the client (SopGenerationSettings) validates against
    // live, instead of re-encoding those rules a second time here.
    .superRefine((val, ctx) => {
        if (val.sourceType === 'task' && val.activityName !== undefined) {
            ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'Task-scoped SOP requests cannot include activityName.' });
        }
        if (val.sourceType === 'activity') {
            if (!val.activityName?.trim()) {
                ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'Activity-scoped SOP requests require activityName.' });
            }
            if (val.activities.length !== 1) {
                ctx.addIssue({ code: 'custom', path: ['activities'], message: 'Activity-scoped SOP requests require exactly one Activity.' });
            } else if (val.activityName !== val.activities[0].name) {
                ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'activityName must match the selected Activity.' });
            }
        }
        const issues = validateSopSetupConfig({
            minSteps: val.minSteps,
            maxSteps: val.maxSteps,
            maxTotalNodes: val.maxTotalNodes,
            branchPolicy: val.branchPolicy,
            maxBranches: val.maxBranches,
            allowRework: val.allowRework,
            maxLoops: val.maxLoops,
        });
        issues.forEach((issue) => ctx.addIssue({ code: 'custom', path: [issue.field], message: issue.message }));
    });

export type SopGenerationRequest = z.infer<typeof SopGenerationRequestSchema>;

/**
 * Builds the SOP generation request body as a pure function, kept separate from the
 * client component (SopSetupGate) so it can be unit tested without React/browser APIs.
 * model/reasoning are normalized here so the badge shown in the UI and the value actually
 * sent to the server always agree. The return value must satisfy SopGenerationRequest.
 */
export interface SopGenerationRequestBodyParams {
    memberRole: string;
    taskName: string;
    sourceType: 'task' | 'activity';
    activityName?: string;
    activities: Array<{
        name: string;
        description?: string;
        skills: Array<{ id?: string; name: string; description?: string }>;
    }>;
    skills: Array<{ id?: string; name: string; description?: string }>;
    context: string;
    detailLevel: SopDetailLevel;
    minSteps: number;
    maxSteps: number;
    maxTotalNodes?: number;
    branchPolicy: SopBranchPolicy;
    maxBranches: number;
    allowRework: boolean;
    maxLoops?: number;
    splitComplexSteps?: boolean;
    apiKey?: string | null;
    model?: string | null;
    reasoning?: ReasoningLevel | string | null;
}

export function buildSopGenerationRequestBody(params: SopGenerationRequestBodyParams): SopGenerationRequest {
    const request = {
        action: 'generateSop' as const,
        memberRole: params.memberRole,
        taskName: params.taskName,
        sourceType: params.sourceType,
        ...(params.activityName !== undefined ? { activityName: params.activityName } : {}),
        activities: params.activities,
        skills: params.skills,
        context: params.context,
        detailLevel: params.detailLevel,
        minSteps: params.minSteps,
        maxSteps: params.maxSteps,
        maxTotalNodes: params.maxTotalNodes,
        branchPolicy: params.branchPolicy,
        maxBranches: params.maxBranches,
        allowRework: params.allowRework,
        maxLoops: params.maxLoops,
        splitComplexSteps: params.splitComplexSteps,
        ...(params.apiKey ? { apiKey: params.apiKey } : {}),
        ...(params.model ? { model: sanitizeModelId(params.model) } : {}),
        reasoning: sanitizeReasoningLevel(params.reasoning),
    };
    const parsed = SopGenerationRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw new Error(`Invalid SOP generation request: ${parsed.error.issues.map((issue) => issue.message).join(' / ')}`);
    }
    return parsed.data;
}
