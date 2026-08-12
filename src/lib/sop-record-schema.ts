import { z } from 'zod';
import { SopDocumentSchema } from './sop-document-schema';

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
    activityId: z.string().optional(),
    activityName: z.string().optional(),
    document: SopDocumentSchema,
    version: z.number().int().positive(),
    reviewDecision: z.enum(['approved', 'changes-requested']).optional(),
    reviewComment: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
    // The envelope (id/taskId/taskName/activityId/activityName) is a denormalized
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
        if (val.activityId !== val.document.workLibrary.activityId) {
            ctx.addIssue({ code: 'custom', path: ['activityId'], message: 'record.activityId가 document.workLibrary.activityId와 일치하지 않습니다.' });
        }
        if (val.activityName !== val.document.workLibrary.activityName) {
            ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'record.activityName이 document.workLibrary.activityName과 일치하지 않습니다.' });
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
