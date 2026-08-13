import type { SopDocument } from './sop-types';
import type { SopRecord } from './sop-record-schema';
import type { SopRecordLifecycleStatus, SopLifecycleTransitionInput } from './sop-lifecycle';

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
    | { ok: false; reason: 'id-mismatch' }
    /**
     * The record's lifecycleStatus is not member-editable (see
     * `isMemberEditableLifecycleStatus` in sop-lifecycle.ts — only 'draft' and
     * 'rejected' qualify). Once a member has requested review (or is awaiting
     * SME review, or the record is officially approved), the content a
     * reviewer saw/approved must stay exactly what they saw — a normal content
     * PUT is rejected outright rather than silently letting the saved document
     * drift out of sync with the lifecycle status attesting to it. `current`
     * is included (same ownership-already-verified reasoning as
     * 'version-conflict') so a caller can show the record's real
     * lifecycleStatus without a second read.
     */
    | { ok: false; reason: 'locked-lifecycle'; current: SopRecord };

export type SopRepositoryLifecycleResult =
    | { ok: true; record: SopRecord }
    | { ok: false; reason: 'not-found' }
    | { ok: false; reason: 'forbidden'; message: string }
    /** Requested transition is not reachable from the record's current lifecycleStatus. */
    | { ok: false; reason: 'invalid-transition'; message: string }
    /** The transition itself is well-formed but its payload is invalid (e.g. an empty rejection reason/feedback). */
    | { ok: false; reason: 'invalid-request'; message: string };

/** Every actor-role/action combination a caller may request through `transitionLifecycle`. Mirrors `SopLifecycleTransitionInput`'s `kind` values but pairs each with the actor role allowed to invoke it — this is the repository-level defense-in-depth check, independent of whatever the API route already validated. */
export type SopRepositoryLifecycleInput =
    | { actorRole: 'member'; actorId: string; kind: 'member-submit' }
    | { actorRole: 'leader'; actorId: string; kind: 'leader-approve' }
    | { actorRole: 'leader'; actorId: string; kind: 'leader-reject'; reasonCode: string; feedback: string }
    | { actorRole: 'sme'; actorId: string; kind: 'sme-approve' }
    | { actorRole: 'sme'; actorId: string; kind: 'sme-reject'; reasonCode: string; feedback: string };

/**
 * Storage port for SOP records — a versioned, identity-tagged, confirmed save
 * that another role (leader/SME/HR) could someday list and open. This is a
 * distinct concern from the browser's in-progress editing draft (see
 * SopDraftStorage, sop-draft-storage.ts): a draft is just whatever is
 * currently on a member's screen in this browser; a SopRecord only exists
 * once a member has actually saved through this interface.
 *
 * The only current implementation is InMemorySopRepository
 * (src/server/sop/sop-repository-memory.ts) — a non-durable reference adapter
 * used because no real database/auth infrastructure is connected yet. Domain/
 * API code still depends only on this interface, so a real adapter can be
 * substituted later without changing any caller.
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
    /** Every record currently sitting at `stage`, across every organization — the raw pool for a leader/SME Inbox before role/filter scoping (see sop-review-assignment.ts). */
    listByLifecycleStage(stage: 'leader-review' | 'sme-review'): Promise<SopRecord[]>;
    /**
     * Every approved AND explicitly template-eligible record system-wide, own
     * records included. This is the "full visibility" query (a future leader/
     * HR template-management view) — NOT what a member's colleague-template
     * picker should call. See listColleagueTemplateCandidates for that.
     */
    listTemplateEligible(): Promise<SopRecord[]>;
    /**
     * The actual colleague-template candidate pool for a specific member:
     * approved AND template-eligible AND NOT owned by `excludingMemberId`. A
     * member's own SOP must never appear in their own "동료 SOP" list, no
     * matter its lifecycle/eligibility state — this is enforced here, in the
     * repository, rather than as an ad-hoc filter the API route could forget
     * to apply (or a future second route could skip).
     */
    listColleagueTemplateCandidates(excludingMemberId: string): Promise<SopRecord[]>;
    /**
     * The only lifecycle entry point after create — every member-submit /
     * leader-approve / leader-reject / sme-approve / sme-reject transition
     * goes through here, backed by `computeSopLifecycleTransition`
     * (sop-lifecycle.ts). Role/kind pairing is enforced here too (not just at
     * the API boundary) — see `SopRepositoryLifecycleInput`.
     */
    transitionLifecycle(id: string, input: SopRepositoryLifecycleInput): Promise<SopRepositoryLifecycleResult>;
    /** Leader/HR-only capability with no member-facing route. Marks (or unmarks) an approved record as a colleague-template candidate. */
    setTemplateEligibility(id: string, eligible: boolean): Promise<SopRepositoryLifecycleResult>;
}

/** Re-exported so callers of this module don't also need to import from sop-lifecycle.ts for the shared transition input shape. */
export type { SopLifecycleTransitionInput, SopRecordLifecycleStatus };
