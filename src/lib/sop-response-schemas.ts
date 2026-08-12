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
