import type { SopRecord } from './sop-record-schema';
import type { SopDocument } from './sop-types';
import type { SopRecordLifecycleStatus, SopMemberSummaryBucket } from './sop-lifecycle';
import { toMemberSummaryBucket } from './sop-lifecycle';

export type SopStatusCounts = Record<SopMemberSummaryBucket, number>;

export interface SopStatusRow {
    id: string;
    title: string;
    lifecycleStatus: SopRecordLifecycleStatus;
    /** 'local-draft' rows exist only in this browser and have no server record yet. */
    source: 'server' | 'local-draft';
}

/**
 * The single source of truth for both the Home status-count widget AND the
 * row list underneath it — computeSopStatusCounts (below) derives its numbers
 * FROM this list rather than counting independently, so the displayed number
 * and the enumerated rows can never silently drift apart (the bug this fixes:
 * a count that included the local draft while the list below it only showed
 * server records). Never fabricates a row — an empty `records` array with no
 * local draft yields an empty list. A local browser draft only becomes its
 * own row when its document id is NOT already represented by a server record
 * (once a document is saved, the server record is the single source of truth
 * for its lifecycle status — listing both would double-count the same SOP).
 */
export function buildSopStatusRows(records: SopRecord[], localDraft: SopDocument | null): SopStatusRow[] {
    const rows: SopStatusRow[] = [];
    const seenIds = new Set<string>();
    records.forEach((record) => {
        if (seenIds.has(record.id)) return;
        seenIds.add(record.id);
        rows.push({ id: record.id, title: record.document.title, lifecycleStatus: record.lifecycleStatus, source: 'server' });
    });
    if (localDraft && !seenIds.has(localDraft.id)) {
        rows.push({ id: localDraft.id, title: localDraft.title, lifecycleStatus: 'draft', source: 'local-draft' });
    }
    return rows;
}

/**
 * Aggregates buildSopStatusRows into per-status counts — see that function's
 * docstring for why this must derive from it rather than count independently.
 * 'leader-review' and 'sme-review' both fold into the single '승인 요청 중'
 * bucket here (see toMemberSummaryBucket); a detail row still shows the exact
 * stage via its own `lifecycleStatus` field.
 */
export function computeSopStatusCounts(records: SopRecord[], localDraft: SopDocument | null): SopStatusCounts {
    const counts: SopStatusCounts = { draft: 0, 'approval-requested': 0, approved: 0, rejected: 0 };
    buildSopStatusRows(records, localDraft).forEach((row) => {
        counts[toMemberSummaryBucket(row.lifecycleStatus)] += 1;
    });
    return counts;
}

export interface SopMemberContentCounts {
    /** Distinct Task ids the member has any saved record for. */
    taskCount: number;
    /** Distinct Activity ids referenced by any non-terminal step across the member's saved records. */
    activityCount: number;
    /** Distinct required-Skill identities (by skillId, falling back to name) referenced across the member's saved records — a DISTINCT count, not a count of Activity-Skill relationships (a Skill reused across steps counts once). */
    skillCount: number;
}

/**
 * Task/Activity/Skill counts for the member Home overview — derived ONLY from
 * saved server records (never a fabricated non-zero value; an empty
 * `records` array yields all zeros). Deduplicates by record id first (a
 * defensive measure — callers should already pass a unique-by-id list) so a
 * record can never be counted twice. "Skill count" is explicitly a distinct
 * count of Skill identity, not the number of Activity-Skill relationships —
 * the UI label using this value must say so, per the customer requirement to
 * disambiguate the two.
 */
export function computeMemberTaskActivitySkillCounts(records: SopRecord[]): SopMemberContentCounts {
    const seenIds = new Set<string>();
    const dedupedRecords = records.filter((record) => {
        if (seenIds.has(record.id)) return false;
        seenIds.add(record.id);
        return true;
    });

    const taskIds = new Set<string>();
    const activityIds = new Set<string>();
    const skillKeys = new Set<string>();
    dedupedRecords.forEach((record) => {
        taskIds.add(record.taskId);
        record.document.steps.forEach((step) => {
            if (step.terminalType) return;
            (step.sourceActivityIds ?? []).forEach((activityId) => activityIds.add(activityId));
            step.requiredSkills.forEach((skill) => {
                skillKeys.add(skill.skillId ? `id:${skill.skillId}` : `name:${skill.name}`);
            });
        });
    });

    return { taskCount: taskIds.size, activityCount: activityIds.size, skillCount: skillKeys.size };
}
