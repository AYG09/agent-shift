import type { SopDocument } from './sop-types';
import type { SopRecord } from './sop-record-schema';

export type { SopRecord } from './sop-record-schema';

export type SopRepositoryCreateResult =
    | { ok: true; record: SopRecord }
    | { ok: false; reason: 'already-exists'; current: SopRecord };

export type SopRepositoryUpdateResult =
    | { ok: true; record: SopRecord }
    | { ok: false; reason: 'not-found' }
    | { ok: false; reason: 'version-conflict'; current: SopRecord }
    /** The record being updated (found by `id`) has a document whose own `document.id`
     *  disagrees with `id`. This can never happen through the API (checked at the
     *  boundary too — see PUT /api/sop/[id]), but the repository enforces it itself
     *  so the invariant holds for every caller, not just the one HTTP route. */
    | { ok: false; reason: 'id-mismatch' };

/**
 * Storage port for SOP records — a versioned, identity-tagged, confirmed save
 * that another role (leader/HR) could someday list and open. This is a
 * distinct concern from the browser's in-progress editing draft (see
 * SopDraftStorage, sop-draft-storage.ts): a draft is just whatever is
 * currently on a member's screen in this browser; a SopRecord only exists
 * once a member has actually saved through this interface.
 *
 * The only current implementation is InMemorySopRepository
 * (src/server/sop/sop-repository-memory.ts) — a non-durable reference adapter
 * used because no real database/auth infrastructure is connected yet. A
 * browser-only localStorage adapter was tried and removed: with no stable
 * memberId/organizationId source and no server save UI connected, it had no
 * real call path in product code (see that removal's notes in the SOP work
 * order history). Domain/API code still depends only on this interface, so a
 * real adapter can be substituted later without changing any caller.
 */
export interface SopRepository {
    /** Rejects with 'already-exists' if `document.id` is already a saved record — never a silent overwrite. */
    create(input: { memberId: string; organizationId: string; document: SopDocument }): Promise<SopRepositoryCreateResult>;
    getById(id: string): Promise<SopRecord | null>;
    /**
     * `expectedVersion` implements optimistic locking: a stale write is rejected,
     * not silently overwritten. `input.document.id` must equal `id` — an adapter
     * must reject a mismatch itself (reason: 'id-mismatch') rather than relying
     * on a caller to have already checked it.
     */
    update(id: string, input: { document: SopDocument; expectedVersion: number }): Promise<SopRepositoryUpdateResult>;
    listByMember(memberId: string): Promise<SopRecord[]>;
    listByOrganization(organizationId: string): Promise<SopRecord[]>;
    /** Every record across every organization. Only an HR-scoped caller should reach this. */
    listAll(): Promise<SopRecord[]>;
}
