import { z } from 'zod';
import { FLOW_SHAPE_IDS } from './flow-shapes';
import { SOP_DETAIL_LEVELS, SOP_BRANCH_POLICIES } from './sop-setup-validation';
import { SopStepCommonFieldsSchema, SopEdgeCommonFieldsSchema, forbidDuplicateIds } from './sop-step-common-schema';
import { SopAgentInstructionSpecSchema, SOP_NODE_INSTRUCTION_CONTRACT_VERSION } from './sop-node-authoring-contract';
import type { SopDocument } from './sop-types';

/**
 * Validates a persisted SOP document — what a member's Store actually saves
 * through a SopRepository, at any review stage. This is deliberately NOT the
 * same schema as SopGenerationResponseSchema (sop-schemas.ts), which exists
 * to reject a low-quality AI output before it reaches the Store.
 *
 * A document a member is still editing (`reviewStatus: 'ai-draft'` or
 * 'reviewed', not yet confirmed) can legitimately have an empty/short
 * `definition`, or a terminal-shaped step with no `terminalType` chosen yet —
 * none of that should make a save request fail with a schema error. What
 * this schema DOES still enforce is data-safety: every field's *type*, enum
 * membership, and structural shape (a step really is an object with a real
 * `shape` and `position`, an edge really points at two strings, etc.).
 * Whether the *content* is complete enough to confirm is the separate job of
 * validateFullSopConfirmation (sop-review.ts) at confirm time, not this
 * schema at save time.
 */
export const SopStepPersistSchema = SopStepCommonFieldsSchema.extend({
    title: z.string(),
    definition: z.string(),
    shape: z.enum(FLOW_SHAPE_IDS),
    position: z.object({
        x: z.number(),
        y: z.number(),
    }),
    reviewStatus: z.enum(['ai-draft', 'reviewed', 'confirmed']),
});

export const SopEdgePersistSchema = SopEdgeCommonFieldsSchema.extend({
    manualRouting: z.boolean().optional(),
});

export const SopMemberSchema = z.object({
    id: z.string().optional(),
    employeeId: z.string().optional(),
    name: z.string().min(1),
    jobRole: z.string().min(1),
    organization: z.string().optional(),
    grade: z.string().optional(),
});

const WorkLibrarySkillSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
});

const WorkLibraryActivitySchema = z.object({
    id: z.string(),
    order: z.number().int().positive().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    skills: z.array(WorkLibrarySkillSchema),
});

const WorkLibraryTaskSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
    activities: z.array(WorkLibraryActivitySchema),
});

export const WorkLibrarySelectionSchema = z.object({
    jobId: z.string().optional(),
    sourceJobId: z.string().optional(),
    jobName: z.string().optional(),
    taskId: z.string(),
    taskName: z.string().min(1),
    activityId: z.string().optional(),
    activityName: z.string().optional(),
    taskCatalog: z.array(WorkLibraryTaskSchema),
    skills: z.array(WorkLibrarySkillSchema),
    sourceType: z.enum(['task', 'activity']),
    confirmed: z.boolean(),
}).superRefine((selection, ctx) => {
    const jobFields = [selection.jobId, selection.sourceJobId, selection.jobName];
    if (jobFields.some((field) => field !== undefined) && jobFields.some((field) => !field?.trim())) {
        ctx.addIssue({ code: 'custom', path: ['jobId'], message: 'Job metadata must include id, sourceJobId, and name together.' });
    }
    const selectedTask = selection.taskCatalog.find((task) => task.id === selection.taskId);
    if (!selectedTask) {
        ctx.addIssue({ code: 'custom', path: ['taskId'], message: 'Selected Task must exist in taskCatalog.' });
        return;
    }
    if (selectedTask.name !== selection.taskName) {
        ctx.addIssue({ code: 'custom', path: ['taskName'], message: 'taskName must match the selected Task.' });
    }

    const seenOrders = new Set<number>();
    let previousOrder = 0;
    selectedTask.activities.forEach((activity, index) => {
        const order = activity.order ?? index + 1;
        if (seenOrders.has(order)) {
            ctx.addIssue({ code: 'custom', path: ['taskCatalog'], message: 'Activity order must be unique within a Task.' });
        }
        if (order < previousOrder) {
            ctx.addIssue({ code: 'custom', path: ['taskCatalog'], message: 'Activities must be stored in source order.' });
        }
        seenOrders.add(order);
        previousOrder = order;
    });

    const hasActivityReference = selection.activityId !== undefined || selection.activityName !== undefined;
    if (selection.sourceType === 'activity' && !selection.activityId) {
        ctx.addIssue({ code: 'custom', path: ['activityId'], message: 'Activity scope requires activityId.' });
    }
    if (selection.sourceType === 'activity' && !selection.activityName?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'Activity scope requires activityName.' });
    }
    if (!hasActivityReference) return;

    if (!selection.activityId || !selection.activityName?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['activityId'], message: 'Activity references require both id and name.' });
        return;
    }
    const selectedActivity = selectedTask.activities.find((activity) => activity.id === selection.activityId);
    if (!selectedActivity) {
        ctx.addIssue({ code: 'custom', path: ['activityId'], message: 'Selected Activity must exist in the selected Task.' });
        return;
    }
    if (selectedActivity.name !== selection.activityName) {
        ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'activityName must match the selected Activity.' });
    }
});

const SopSetupConfigSchema = z.object({
    detailLevel: z.enum(SOP_DETAIL_LEVELS),
    minSteps: z.number().int(),
    maxSteps: z.number().int(),
    branchPolicy: z.enum(SOP_BRANCH_POLICIES),
    maxBranches: z.number().int(),
    allowRework: z.boolean(),
    maxTotalNodes: z.number().int().optional(),
    maxLoops: z.number().int().optional(),
    splitComplexSteps: z.boolean().optional(),
});

const SopAgentizationReviewSchema = z.object({
    scope: z.enum(['workflow', 'steps']),
    stepIds: z.array(z.string()),
    defaultMode: z.enum(['automation', 'assist']).optional(),
    stepModes: z.record(z.string(), z.enum(['automation', 'assist'])),
    note: z.string().optional(),
    confirmedAt: z.string().optional(),
});

export const SopDocumentSchema: z.ZodType<SopDocument> = z.object({
    id: z.string(),
    title: z.string(),
    member: SopMemberSchema,
    workLibrary: WorkLibrarySelectionSchema,
    context: z.string(),
    setupConfig: SopSetupConfigSchema.optional(),
    steps: z.array(SopStepPersistSchema),
    edges: z.array(SopEdgePersistSchema),
    reviewStatus: z.enum(['ai-draft', 'reviewed', 'confirmed']),
    agentizationReview: SopAgentizationReviewSchema.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    isSampleData: z.boolean().optional(),
    structureVersion: z.literal('activity-subaction-v1').optional(),
    agentInstruction: SopAgentInstructionSpecSchema.optional(),
    instructionContractVersion: z.literal(SOP_NODE_INSTRUCTION_CONTRACT_VERSION).optional(),
    sourceTemplateId: z.string().optional(),
    sourceRecordId: z.string().optional(),
    creationSource: z.enum(['task', 'colleague-template', 'own-prior']).optional(),
})
    // Duplicate step/edge ids would corrupt the graph model regardless of review
    // status, so this stays a save-time (not just confirm-time) safety check.
    // Sub Action shape (exactly one source Activity, unique order per Activity) is
    // deliberately NOT enforced here — a document mid-edit may legitimately have
    // an incomplete mapping. That stricter check runs at generation time
    // (sop-activity-coverage.ts) and at confirm time (sop-persistence-validation.ts),
    // matching the existing draft-permissive / confirm-strict split in this file.
    .superRefine((val, ctx) => {
        forbidDuplicateIds(val.steps, ctx, 'steps', '단계');
        forbidDuplicateIds(val.edges, ctx, 'edges', '연결선');
        val.steps.forEach((step) => {
            if (step.terminalType && (step.sourceActivityIds?.length || step.subActionOrder !== undefined || step.subActionOrigin || step.subActionOriginRationale || step.agentizationSuggestion || step.executionSpec)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['steps'],
                    message: `[${step.id}] 시작·종료 단계에는 Activity 매핑, Sub Action 순서·출처, Agent화 제안, 실행 명세를 둘 수 없습니다.`,
                });
            }
            if (step.subActionOrigin === 'context-derived' && !step.subActionOriginRationale?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['steps'],
                    message: `[${step.id}] 직무 맥락에서 추가된 Sub Action에는 추가 근거가 필요합니다.`,
                });
            }
            if (step.subActionOrigin === 'activity-derived' && step.subActionOriginRationale !== undefined) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['steps'],
                    message: `[${step.id}] Activity 기본 분해 단계에는 직무 맥락 추가 근거를 넣지 않습니다.`,
                });
            }
        });
    });
