import { z } from 'zod';
import { SopDocumentSchema } from './sop-document-schema';
import { SopRecordLifecycleStatusSchema, SopRejectionSchema } from './sop-lifecycle';
import { resolveCreationSource } from './sop-types';

export { SopDocumentSchema };

/**
 * The minimal cross-role SOP data contract. A member's live editing session
 * (useSopPrototypeStore, autosaved via the draft-storage adapter) works with
 * the raw `SopDocument`; a `SopRecord` is the versioned, identity-tagged
 * envelope saved through a `SopRepository` so a future leader/HR UI can list
 * and open the same document. `reviewDecision`/`reviewComment` hold only the
 * latest value — no change-history array (explicitly out of scope).
 */
export const SopRecordSchema = z.object({
    id: z.string(),
    memberId: z.string().min(1),
    organizationId: z.string().min(1),
    taskId: z.string(),
    taskName: z.string(),
    sourceType: z.enum(['task', 'activity']),
    activityId: z.string().min(1).optional(),
    activityName: z.string().min(1).optional(),
    document: SopDocumentSchema,
    version: z.number().int().positive(),
    reviewDecision: z.enum(['approved', 'changes-requested']).optional(),
    reviewComment: z.string().optional(),
    /** Approval workflow status — see sop-lifecycle.ts. Defaults to 'draft' for every newly created record. */
    lifecycleStatus: SopRecordLifecycleStatusSchema.default('draft'),
    /** Leader/HR-only flag (no member-facing write path) marking this approved record eligible as a colleague template. */
    templateEligible: z.boolean().default(false),
    /** Set once, at creation, when this record originated from cloning another member's template. Never re-derived. */
    sourceTemplateId: z.string().optional(),
    /** Set once, at creation, when this record originated from cloning the same member's own prior record. Never set together with sourceTemplateId; never re-derived. */
    sourceRecordId: z.string().optional(),
    /** Denormalized from document.creationSource (via resolveCreationSource) for cheap listing — see the superRefine consistency check below. */
    creationSource: z.enum(['task', 'colleague-template', 'own-prior']),
    /**
     * Latest rejection decision only — no audit array. Present exactly when
     * lifecycleStatus === 'rejected'; cleared (undefined) the moment a
     * resubmission succeeds. See sop-lifecycle.ts's computeSopLifecycleTransition,
     * the only writer of this field.
     */
    rejection: SopRejectionSchema.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
    // The envelope (id/memberId/taskId/taskName/sourceType/activityId/activityName) is a denormalized
    // summary of `document` kept for cheap listing without parsing every full
    // document. A repository that ever lets these drift apart (e.g. a future
    // adapter bug) is a real bug, not something the response schema should
    // silently accept — this refinement is what lets respondValidated() catch
    // that at the API boundary instead of shipping mismatched data to a client.
    .superRefine((val, ctx) => {
        if (val.id !== val.document.id) {
            ctx.addIssue({ code: 'custom', path: ['id'], message: `record.id(${val.id})와 document.id(${val.document.id})가 일치하지 않습니다.` });
        }
        if (val.taskId !== val.document.workLibrary.taskId) {
            ctx.addIssue({ code: 'custom', path: ['taskId'], message: `record.taskId(${val.taskId})가 document.workLibrary.taskId(${val.document.workLibrary.taskId})와 일치하지 않습니다.` });
        }
        if (val.taskName !== val.document.workLibrary.taskName) {
            ctx.addIssue({ code: 'custom', path: ['taskName'], message: `record.taskName(${val.taskName})이 document.workLibrary.taskName(${val.document.workLibrary.taskName})과 일치하지 않습니다.` });
        }
        if (val.sourceType !== val.document.workLibrary.sourceType) {
            ctx.addIssue({ code: 'custom', path: ['sourceType'], message: 'record.sourceType이 document.workLibrary.sourceType과 일치하지 않습니다.' });
        }
        const expectedActivityId = val.document.workLibrary.sourceType === 'activity'
            ? val.document.workLibrary.activityId
            : undefined;
        const expectedActivityName = val.document.workLibrary.sourceType === 'activity'
            ? val.document.workLibrary.activityName
            : undefined;
        if (val.sourceType === 'activity' && (!val.activityId || !val.activityName)) {
            ctx.addIssue({ code: 'custom', path: ['activityId'], message: 'Activity-scoped records require Activity summary identifiers.' });
        }
        if (val.activityId !== expectedActivityId) {
            ctx.addIssue({ code: 'custom', path: ['activityId'], message: 'record.activityId가 document.workLibrary.activityId와 일치하지 않습니다.' });
        }
        if (val.activityName !== expectedActivityName) {
            ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'record.activityName이 document.workLibrary.activityName과 일치하지 않습니다.' });
        }
        if (val.document.member.id !== undefined && val.memberId !== val.document.member.id) {
            ctx.addIssue({ code: 'custom', path: ['memberId'], message: 'record.memberId와 document.member.id가 일치하지 않습니다.' });
        }
        if (val.sourceTemplateId !== val.document.sourceTemplateId) {
            ctx.addIssue({ code: 'custom', path: ['sourceTemplateId'], message: 'record.sourceTemplateId가 document.sourceTemplateId와 일치하지 않습니다.' });
        }
        if (val.sourceRecordId !== val.document.sourceRecordId) {
            ctx.addIssue({ code: 'custom', path: ['sourceRecordId'], message: 'record.sourceRecordId가 document.sourceRecordId와 일치하지 않습니다.' });
        }
        if (val.sourceTemplateId && val.sourceRecordId) {
            ctx.addIssue({ code: 'custom', path: ['sourceRecordId'], message: 'sourceTemplateId와 sourceRecordId는 동시에 설정될 수 없습니다.' });
        }
        if (val.creationSource !== resolveCreationSource(val.document)) {
            ctx.addIssue({ code: 'custom', path: ['creationSource'], message: 'record.creationSource가 document로부터 도출된 creationSource와 일치하지 않습니다.' });
        }
        if (val.rejection && val.lifecycleStatus !== 'rejected') {
            ctx.addIssue({ code: 'custom', path: ['rejection'], message: "rejection은 lifecycleStatus가 'rejected'일 때만 존재할 수 있습니다." });
        }
    });

/**
 * `SopRecord` is inferred directly from the schema above rather than hand-kept
 * as a parallel interface, so the two can never drift apart. `document`'s
 * inferred type already resolves to the canonical `SopDocument` (sop-types.ts)
 * because `SopDocumentSchema` is itself declared as `z.ZodType<SopDocument>`.
 */
export type SopRecord = z.infer<typeof SopRecordSchema>;

export const SopRecordCreateRequestSchema = z.object({
    memberId: z.string().min(1),
    organizationId: z.string().min(1),
    document: SopDocumentSchema,
});

export const SopRecordUpdateRequestSchema = z.object({
    document: SopDocumentSchema,
    expectedVersion: z.number().int().positive(),
});
