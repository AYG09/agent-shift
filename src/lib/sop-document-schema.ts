import { z } from 'zod';
import { FLOW_SHAPE_IDS } from './flow-shapes';
import { SOP_DETAIL_LEVELS, SOP_BRANCH_POLICIES } from './sop-setup-validation';
import { SopStepCommonFieldsSchema, SopEdgeCommonFieldsSchema, forbidDuplicateIds } from './sop-step-common-schema';
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

const SopMemberSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    jobRole: z.string().min(1),
    organization: z.string().optional(),
});

const WorkLibrarySkillSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
});

const WorkLibraryActivitySchema = z.object({
    id: z.string(),
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
    taskId: z.string(),
    taskName: z.string().min(1),
    activityId: z.string().optional(),
    activityName: z.string().optional(),
    taskCatalog: z.array(WorkLibraryTaskSchema),
    skills: z.array(WorkLibrarySkillSchema),
    sourceType: z.enum(['task', 'activity']),
    confirmed: z.boolean(),
}).superRefine((selection, ctx) => {
    const selectedTask = selection.taskCatalog.find((task) => task.id === selection.taskId);
    if (!selectedTask) {
        ctx.addIssue({ code: 'custom', path: ['taskId'], message: 'Selected Task must exist in taskCatalog.' });
        return;
    }
    if (selectedTask.name !== selection.taskName) {
        ctx.addIssue({ code: 'custom', path: ['taskName'], message: 'taskName must match the selected Task.' });
    }

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
})
    // Duplicate step/edge ids would corrupt the graph model regardless of review
    // status, so this stays a save-time (not just confirm-time) safety check.
    .superRefine((val, ctx) => {
        forbidDuplicateIds(val.steps, ctx, 'steps', '단계');
        forbidDuplicateIds(val.edges, ctx, 'edges', '연결선');
    });
