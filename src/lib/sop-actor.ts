import type { SopRecord } from './sop-repository';

/**
 * Minimal role boundary for cross-role SOP visibility. This intentionally stops
 * at four flat roles with no org hierarchy, dual-reporting, delegation, or
 * field-level access control — those are out of scope until a real identity
 * provider is connected (see SOP_CODE_QUALITY_REVIEW_AND_SONNET5_WORK_ORDER.md,
 * 작업 F). `organizationId` here is a single flat identifier, not a tree. There
 * is no leader/SME assignment policy either (final-system-scenario-contract.md
 * §6, explicitly unresolved) — any 'leader' actor may act on any
 * 'leader-review' record, any 'sme' actor on any 'sme-review' record,
 * regardless of organization.
 */
export type SopActorRole = 'member' | 'leader' | 'sme' | 'hr';

export interface SopActorContext {
    actorId: string;
    role: SopActorRole;
    organizationId: string;
}

/**
 * member: only their own SOPs. leader: every SOP in their (single, flat)
 * organization, PLUS any record currently at the 'leader-review' stage
 * (needed to open a cross-org record surfaced by the approvals Inbox — see
 * sop-review-assignment.ts). sme: same, but for 'sme-review'. hr: every SOP
 * across every organization. This is a visibility filter only — it grants no
 * write/approval authority; the actual approve/reject transition is checked
 * independently by SopRepository.transitionLifecycle.
 */
export function scopeSopRecordsForActor(actor: SopActorContext, records: SopRecord[]): SopRecord[] {
    if (actor.role === 'hr') return records;
    if (actor.role === 'leader') {
        return records.filter((record) => record.organizationId === actor.organizationId || record.lifecycleStatus === 'leader-review');
    }
    if (actor.role === 'sme') {
        return records.filter((record) => record.organizationId === actor.organizationId || record.lifecycleStatus === 'sme-review');
    }
    return records.filter((record) => record.memberId === actor.actorId);
}
