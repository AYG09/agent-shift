import { z } from 'zod';
import { SopRecordSchema } from './sop-record-schema';

/**
 * Shared response-body shapes for /api/sop and /api/sop/[id]'s well-defined
 * outcomes (single record, record list, create conflict, update conflict). The
 * route handlers validate their own response against these before sending it —
 * see respondValidated in src/server/sop/sop-response.ts — so an internal
 * schema drift fails as a generic 500 instead of shipping a malformed record.
 */
export const SopRecordResponseSchema = z.object({ record: SopRecordSchema });

export const SopRecordListResponseSchema = z.object({ records: z.array(SopRecordSchema) });

/**
 * POST /api/sop duplicate-id conflict. The requester attempting to create a
 * record under an id that already exists may be a completely different
 * member/organization than the one who owns the existing record — so the
 * existing record must never be echoed back here. Only a generic error and a
 * machine-readable `code` are returned; the client learns nothing about who
 * owns the id or what its document contains.
 */
export const SopCreateConflictResponseSchema = z.object({
    error: z.string(),
    code: z.literal('already-exists'),
});

/**
 * PUT /api/sop/[id] optimistic-locking version conflict. This branch is only
 * reachable after the route has already verified the requester IS the
 * record's own owning member (see the ownership check in
 * src/app/api/sop/[id]/route.ts) — so returning `current` here only ever
 * hands a member back their own record, never another member's. This schema
 * is intentionally distinct from SopCreateConflictResponseSchema and must not
 * be reused for the create-conflict path above.
 */
export const SopUpdateConflictResponseSchema = z.object({
    error: z.string(),
    current: SopRecordSchema,
});

/**
 * PUT /api/sop/[id] rejection because the record's lifecycleStatus is not
 * 'draft' (approval-requested/approved/rejected). Same ownership-already-
 * verified reasoning as SopUpdateConflictResponseSchema, so `current` is safe
 * to echo back here too.
 */
export const SopLifecycleLockedResponseSchema = z.object({
    error: z.string(),
    current: SopRecordSchema,
});

const SopOrganizationProgressSchema = z.object({
    organizationId: z.string(),
    rosterMemberCount: z.number().int().nonnegative(),
    participatingRosterMemberCount: z.number().int().nonnegative(),
    recordCount: z.number().int().nonnegative(),
    approvalRate: z.object({
        approvedCount: z.number().int().nonnegative(),
        submittedCount: z.number().int().nonnegative(),
        rate: z.number().min(0).max(1).nullable(),
    }),
});

/** GET /api/sop/approvals — the role-scoped, filtered Inbox queue plus organization progress computed from the SAME (role-scoped, pre-filter) record set. */
export const SopApprovalQueueResponseSchema = z.object({
    records: z.array(SopRecordSchema),
    organizationProgress: z.array(SopOrganizationProgressSchema),
});

const SopLifecycleDistributionSchema = z.object({
    draft: z.number().int().nonnegative(),
    'leader-review': z.number().int().nonnegative(),
    'sme-review': z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
});

const SopApprovalRateSchema = z.object({
    approvedCount: z.number().int().nonnegative(),
    submittedCount: z.number().int().nonnegative(),
    rate: z.number().min(0).max(1).nullable(),
});

const SopTopTaskSchema = z.object({ taskId: z.string(), taskName: z.string(), recordCount: z.number().int().nonnegative() });

const SopAgentizationEvidenceSchema = z.object({
    taskId: z.string(),
    taskName: z.string(),
    modeCounts: z.object({ automation: z.number().int().nonnegative(), assist: z.number().int().nonnegative() }),
});

const SopStandardCandidateGroupSchema = z.object({
    taskId: z.string(),
    taskName: z.string(),
    recordCount: z.number().int().nonnegative(),
    organizationCount: z.number().int().nonnegative(),
    lastUpdatedAt: z.string(),
    sourceRecordIds: z.array(z.string()),
});

/** GET /api/sop/analytics — HR-only. `records` is the exact filtered detail-row set the export endpoint must reproduce. */
export const SopAnalyticsResponseSchema = z.object({
    records: z.array(SopRecordSchema),
    participatingMemberCount: z.number().int().nonnegative(),
    recordCount: z.number().int().nonnegative(),
    lifecycleDistribution: SopLifecycleDistributionSchema,
    approvalRate: SopApprovalRateSchema,
    topTasks: z.array(SopTopTaskSchema),
    agentizationEvidence: z.array(SopAgentizationEvidenceSchema),
    standardCandidates: z.array(SopStandardCandidateGroupSchema),
});
