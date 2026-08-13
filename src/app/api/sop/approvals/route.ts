import { NextRequest, NextResponse } from 'next/server';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';
import { SopApprovalQueueResponseSchema } from '@/lib/sop-response-schemas';
import { filterApprovalQueue } from '@/lib/sop-review-assignment';
import { computeOrganizationProgress } from '@/lib/sop-analytics';
import { SCENARIO_DEMO_MEMBERS } from '@/lib/sop-scenario-seed';
import type { SopRecordLifecycleStatus } from '@/lib/sop-lifecycle';

/**
 * The single Inbox entry point for both leader and SME roles (작업 D). The
 * actionable queue is always exactly one stage — 'leader-review' for a leader
 * actor, 'sme-review' for an SME actor — never mixed and never showing a
 * status the caller cannot act on; that constraint is what "leader inbox에는
 * leader-review만 결정 가능하게 표시한다" means at the data-shape level, not
 * just a UI filter. Organization/job/status query params narrow this same
 * actionable set (a display filter, not a broader access grant — see
 * scopeSopRecordsForActor for the actual visibility boundary already checked
 * at the repository layer via listByLifecycleStage).
 *
 * `organizationProgress` is computed from EVERY record system-wide (not just
 * the current queue) so the "조직 SOP 작성률과 승인 완료율" panel reflects
 * real organizational activity, not a transient snapshot of what happens to
 * be pending review right now.
 */
export async function GET(request: NextRequest) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;

    if (actor.role !== 'leader' && actor.role !== 'sme') {
        return NextResponse.json({ error: '승인자 Inbox는 leader 또는 sme 역할만 조회할 수 있습니다.' }, { status: 403 });
    }

    const stage = actor.role === 'leader' ? ('leader-review' as const) : ('sme-review' as const);
    const queue = await sopRepository.listByLifecycleStage(stage);

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') ?? undefined;
    const jobRole = searchParams.get('jobRole') ?? undefined;
    const statusParam = searchParams.get('status') ?? undefined;
    const status = statusParam as SopRecordLifecycleStatus | undefined;

    const filtered = filterApprovalQueue(queue, { organizationId, jobRole, status });

    const allRecords = await sopRepository.listAll();
    const organizationProgress = computeOrganizationProgress(allRecords, SCENARIO_DEMO_MEMBERS);

    return respondValidated(SopApprovalQueueResponseSchema, { records: filtered, organizationProgress }, 200);
}
