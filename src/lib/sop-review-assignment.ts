import type { SopRecord } from './sop-record-schema';
import { SOP_REVIEW_STAGE_ROLE, type SopReviewStage } from './sop-lifecycle';

/**
 * Role/stage scoping for the approver Inbox. There is no leader/SME
 * assignment or org-permission policy confirmed by the customer yet (see
 * final-system-scenario-contract.md §6) — every actor with the matching role
 * may act on every record sitting at their stage. Organization/job/status are
 * exposed only as *filters* in the UI, never as an access boundary, so this
 * module's scoping is intentionally role-only.
 */
export type SopApproverRole = 'leader' | 'sme';

/** True only when `role` is the reviewer role assigned to `stage` (see SOP_REVIEW_STAGE_ROLE). */
export function canActorActOnStage(role: SopApproverRole, stage: SopReviewStage): boolean {
    return SOP_REVIEW_STAGE_ROLE[stage] === role;
}

/** Every record currently sitting at the stage a given approver role owns — the raw Inbox pool before filters. */
export function scopeRecordsForReviewStage(records: SopRecord[], role: SopApproverRole): SopRecord[] {
    const stage: SopReviewStage = role === 'leader' ? 'leader-review' : 'sme-review';
    return records.filter((record) => record.lifecycleStatus === stage);
}

export interface SopApprovalQueueFilters {
    organizationId?: string;
    jobRole?: string;
    /** A prototype convenience filter over the *current* record status (draft/leader-review/sme-review/approved/rejected) — not a second access boundary. */
    status?: SopRecord['lifecycleStatus'];
}

/** Pure filter over an already role-scoped queue. Reused as-is by the Inbox API/UI so filtering never drifts between them. */
export function filterApprovalQueue(records: SopRecord[], filters: SopApprovalQueueFilters): SopRecord[] {
    return records.filter((record) => {
        if (filters.organizationId && record.organizationId !== filters.organizationId) return false;
        if (filters.jobRole && record.document.member.jobRole !== filters.jobRole) return false;
        if (filters.status && record.lifecycleStatus !== filters.status) return false;
        return true;
    });
}
