import type { SopRecord } from './sop-repository';

/**
 * Minimal role boundary for cross-role SOP visibility. This intentionally stops
 * at three flat roles with no org hierarchy, dual-reporting, delegation, or
 * field-level access control — those are out of scope until a real identity
 * provider is connected (see SOP_CODE_QUALITY_REVIEW_AND_SONNET5_WORK_ORDER.md,
 * 작업 F). `organizationId` here is a single flat identifier, not a tree.
 */
export type SopActorRole = 'member' | 'leader' | 'hr';

export interface SopActorContext {
    actorId: string;
    role: SopActorRole;
    organizationId: string;
}

/**
 * member: only their own SOPs. leader: every SOP in their (single, flat)
 * organization. hr: every SOP across every organization. This is a visibility
 * filter only — it grants no write/approval authority.
 */
export function scopeSopRecordsForActor(actor: SopActorContext, records: SopRecord[]): SopRecord[] {
    if (actor.role === 'hr') return records;
    if (actor.role === 'leader') return records.filter((record) => record.organizationId === actor.organizationId);
    return records.filter((record) => record.memberId === actor.actorId);
}
