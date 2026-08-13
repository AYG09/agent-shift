import { NextRequest, NextResponse } from 'next/server';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';
import { SopAnalyticsResponseSchema } from '@/lib/sop-response-schemas';
import {
    filterRecordsByOrganization,
    computeParticipatingMemberCount,
    computeLifecycleDistribution,
    computeApprovalRate,
    computeTopTasks,
    computeAgentizationEvidence,
    computeStandardCandidateGroups,
} from '@/lib/sop-analytics';

/**
 * HR-only dashboard data (작업 F). Every number here is derived from
 * `sopRepository.listAll()` filtered by the optional `organizationId` query
 * param — never a UI-only fixture count. `records` in the response is the
 * EXACT detail-row set /api/sop/analytics/export must reproduce as CSV; both
 * routes call the same filterRecordsByOrganization helper so the two can
 * never silently diverge.
 */
export async function GET(request: NextRequest) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;

    if (actor.role !== 'hr') {
        return NextResponse.json({ error: 'HR 대시보드는 hr 역할만 조회할 수 있습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') ?? undefined;

    const allRecords = await sopRepository.listAll();
    const records = filterRecordsByOrganization(allRecords, organizationId);

    return respondValidated(
        SopAnalyticsResponseSchema,
        {
            records,
            participatingMemberCount: computeParticipatingMemberCount(records),
            recordCount: records.length,
            lifecycleDistribution: computeLifecycleDistribution(records),
            approvalRate: computeApprovalRate(records),
            topTasks: computeTopTasks(records),
            agentizationEvidence: computeAgentizationEvidence(records),
            standardCandidates: computeStandardCandidateGroups(records),
        },
        200
    );
}
