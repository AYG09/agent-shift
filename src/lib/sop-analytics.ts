import type { SopRecord } from './sop-record-schema';
import type { SopRecordLifecycleStatus } from './sop-lifecycle';
import type { SopMember, SopAiApplicationMode } from './sop-types';

/**
 * Pure, repository-record-derived aggregation selectors shared by the
 * approver org-progress panel (/sop/approvals) and the HR dashboard
 * (/sop/hr) — the same guardrail both screens must honor: "analytics와
 * export는 같은 selector 결과를 사용한다." Never fabricates a count; every
 * function here folds over whatever `records` it is given, so an empty input
 * yields all-zero output.
 */

/** The single organization-scoping filter both /api/sop/analytics and /api/sop/analytics/export apply — sharing this function is what keeps their numbers reconcilable. */
export function filterRecordsByOrganization(records: SopRecord[], organizationId?: string): SopRecord[] {
    return organizationId ? records.filter((record) => record.organizationId === organizationId) : records;
}

/** Every lifecycle status that counts as "already submitted at least once" — used as the approval-rate denominator. A record currently 'draft' has never been submitted. */
function isSubmittedStatus(status: SopRecordLifecycleStatus): boolean {
    return status !== 'draft';
}

export function computeLifecycleDistribution(records: SopRecord[]): Record<SopRecordLifecycleStatus, number> {
    const distribution: Record<SopRecordLifecycleStatus, number> = { draft: 0, 'leader-review': 0, 'sme-review': 0, approved: 0, rejected: 0 };
    records.forEach((record) => {
        distribution[record.lifecycleStatus] += 1;
    });
    return distribution;
}

export interface SopApprovalRate {
    approvedCount: number;
    /** Denominator: every record that has left 'draft' at least once (leader-review/sme-review/approved/rejected). A record rejected then resubmitted is still counted once, by record id. */
    submittedCount: number;
    /** `null` when submittedCount is 0 — never render a fabricated 0% or 100% with no real denominator. */
    rate: number | null;
}

export function computeApprovalRate(records: SopRecord[]): SopApprovalRate {
    const submitted = records.filter((record) => isSubmittedStatus(record.lifecycleStatus));
    const approved = records.filter((record) => record.lifecycleStatus === 'approved');
    return {
        approvedCount: approved.length,
        submittedCount: submitted.length,
        rate: submitted.length > 0 ? approved.length / submitted.length : null,
    };
}

export function computeParticipatingMemberCount(records: SopRecord[]): number {
    return new Set(records.map((record) => record.memberId)).size;
}

export interface SopOrganizationProgress {
    organizationId: string;
    /** Distinct members from `demoRoster` belonging to this org — the prototype's labeled stand-in population (see sop-scenario-seed.ts), never a real enterprise headcount. */
    rosterMemberCount: number;
    /** Distinct members from `demoRoster` in this org who have at least one saved record. */
    participatingRosterMemberCount: number;
    recordCount: number;
    approvalRate: SopApprovalRate;
}

/**
 * Organization-level "SOP 작성률과 승인 완료율" for the approver Inbox
 * (작업 D). "작성률" needs a population denominator this prototype has no
 * real HR roster for — final-system-scenario-contract.md §6 lists this as
 * explicitly unresolved. `demoRoster` (the fixed scenario-seed member list)
 * is used as the smallest reversible "프로토타입 기준" population so the
 * screen can show a real fraction instead of a meaningless 100%-by-
 * construction number; callers MUST label this in the UI as prototype-only,
 * never as a real enterprise participation rate.
 */
export function computeOrganizationProgress(records: SopRecord[], demoRoster: SopMember[]): SopOrganizationProgress[] {
    const orgIds = new Set<string>([...records.map((r) => r.organizationId), ...demoRoster.map((m) => m.organization).filter((v): v is string => Boolean(v))]);
    return [...orgIds].map((organizationId) => {
        const orgRecords = records.filter((r) => r.organizationId === organizationId);
        const rosterInOrg = demoRoster.filter((m) => m.organization === organizationId);
        const rosterMemberIds = new Set(rosterInOrg.map((m) => m.id).filter((v): v is string => Boolean(v)));
        const participatingRosterMemberIds = new Set(orgRecords.map((r) => r.memberId).filter((id) => rosterMemberIds.has(id)));
        return {
            organizationId,
            rosterMemberCount: rosterMemberIds.size,
            participatingRosterMemberCount: participatingRosterMemberIds.size,
            recordCount: orgRecords.length,
            approvalRate: computeApprovalRate(orgRecords),
        };
    });
}

export interface SopTopTask {
    taskId: string;
    taskName: string;
    recordCount: number;
}

/** Ranks Tasks by saved-record frequency in the currently filtered record set. Grouped by taskId (never taskName) per the customer contract. */
export function computeTopTasks(records: SopRecord[], limit?: number): SopTopTask[] {
    const byTask = new Map<string, SopTopTask>();
    records.forEach((record) => {
        const existing = byTask.get(record.taskId);
        if (existing) existing.recordCount += 1;
        else byTask.set(record.taskId, { taskId: record.taskId, taskName: record.taskName, recordCount: 1 });
    });
    const ranked = [...byTask.values()].sort((a, b) => b.recordCount - a.recordCount);
    return typeof limit === 'number' ? ranked.slice(0, limit) : ranked;
}

export interface SopAgentizationEvidence {
    taskId: string;
    taskName: string;
    /** Explicit member-confirmed mode counts across every approved record's non-terminal steps for this Task. Unspecified (human-performed) steps are NOT counted here — this is evidence FOR Agent화 candidacy, not a full step census. No threshold/probability is derived from these counts. */
    modeCounts: Record<SopAiApplicationMode, number>;
}

/**
 * Agent화 후보 근거 (작업 F #7): approved records only, member-CONFIRMED
 * stepModes only (never the AI suggestion) — mode-counted per Task. Terminal
 * steps and steps with no member judgement are excluded, never counted as a
 * default/human bucket that could be mistaken for an actual step census.
 */
export function computeAgentizationEvidence(records: SopRecord[]): SopAgentizationEvidence[] {
    const byTask = new Map<string, SopAgentizationEvidence>();
    records
        .filter((record) => record.lifecycleStatus === 'approved')
        .forEach((record) => {
            const stepModes = record.document.agentizationReview?.stepModes ?? {};
            const businessStepIds = new Set(record.document.steps.filter((step) => !step.terminalType).map((step) => step.id));
            const entry = byTask.get(record.taskId) ?? { taskId: record.taskId, taskName: record.taskName, modeCounts: { automation: 0, assist: 0 } };
            Object.entries(stepModes).forEach(([stepId, mode]) => {
                if (!mode || !businessStepIds.has(stepId)) return;
                entry.modeCounts[mode] += 1;
            });
            byTask.set(record.taskId, entry);
        });
    return [...byTask.values()];
}

export interface SopStandardCandidateGroup {
    taskId: string;
    taskName: string;
    recordCount: number;
    organizationCount: number;
    /** ISO timestamp — the most recently updated approved record in this group. */
    lastUpdatedAt: string;
    sourceRecordIds: string[];
}

/**
 * 표준 SOP 후보 (작업 F #8): approved records grouped by Task. This is a
 * deterministic listing/summary only — it must never be presented as
 * production clustering/process mining, and never auto-selects a "winner".
 */
export function computeStandardCandidateGroups(records: SopRecord[]): SopStandardCandidateGroup[] {
    const byTask = new Map<string, SopRecord[]>();
    records
        .filter((record) => record.lifecycleStatus === 'approved')
        .forEach((record) => {
            const group = byTask.get(record.taskId) ?? [];
            group.push(record);
            byTask.set(record.taskId, group);
        });
    return [...byTask.entries()].map(([taskId, group]) => ({
        taskId,
        taskName: group[0].taskName,
        recordCount: group.length,
        organizationCount: new Set(group.map((r) => r.organizationId)).size,
        lastUpdatedAt: group.reduce((latest, r) => (r.updatedAt > latest ? r.updatedAt : latest), group[0].updatedAt),
        sourceRecordIds: group.map((r) => r.id),
    }));
}
