import type { SopRecord } from './sop-record-schema';
import { SOP_LIFECYCLE_STATUS_META } from './sop-lifecycle';

const CSV_COLUMNS = ['recordId', 'taskId', 'taskName', 'organizationId', 'memberName', 'jobRole', 'lifecycleStatus', 'createdAt', 'updatedAt'] as const;

function escapeCsvField(value: string): string {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

/**
 * Builds a CSV export of the SAME record set the HR dashboard's detail rows
 * show — the export must be reachable by re-deriving from `records` with no
 * separate filter logic (see /api/sop/analytics and /api/sop/analytics/export,
 * which both call the same record-fetch + org-filter helper). No new
 * dependency (papaparse/xlsx) — a manual, well-escaped serializer is
 * sufficient for this column set.
 */
export function buildAnalyticsCsv(records: SopRecord[]): string {
    const header = CSV_COLUMNS.join(',');
    const rows = records.map((record) =>
        [
            record.id,
            record.taskId,
            record.taskName,
            record.organizationId,
            record.document.member.name,
            record.document.member.jobRole,
            SOP_LIFECYCLE_STATUS_META[record.lifecycleStatus].label,
            record.createdAt,
            record.updatedAt,
        ]
            .map((value) => escapeCsvField(String(value)))
            .join(',')
    );
    return [header, ...rows].join('\n');
}
