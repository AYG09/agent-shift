import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    SopMemberLifecycleTransitionSchema,
    SopReviewerLifecycleTransitionSchema,
} from '@/lib/sop-lifecycle';
import { SopRecordResponseSchema } from '@/lib/sop-response-schemas';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The single approval-lifecycle route for every role. The request shape a
 * caller may send depends entirely on their actor role — a member may only
 * ever send `{ transition: 'leader-review' }`; there is no field a forged
 * member request could set to reach 'sme-review'/'approved'/'rejected'.
 * Leader/SME callers send `{ decision: 'approve' }` or `{ decision:
 * 'reject', reasonCode, feedback }`, and `SopRepository.transitionLifecycle`
 * independently re-checks that the caller's role matches the stage their
 * record is actually sitting at (see `SopRepositoryLifecycleInput`) — this
 * route's role branch is not the only enforcement point.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;
    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (actor.role === 'member') {
        const parsed = SopMemberLifecycleTransitionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: `요청 형식이 유효하지 않습니다. transition은 'leader-review'만 허용됩니다.` },
                { status: 400 }
            );
        }
        const result = await sopRepository.transitionLifecycle(id, { actorRole: 'member', actorId: actor.actorId, kind: 'member-submit' });
        return respondLifecycleResult(result);
    }

    if (actor.role === 'leader' || actor.role === 'sme') {
        const parsed = SopReviewerLifecycleTransitionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: `요청 형식이 유효하지 않습니다. decision은 'approve' 또는 'reject'(reasonCode, feedback 필수)여야 합니다.` },
                { status: 400 }
            );
        }
        const result = await sopRepository.transitionLifecycle(id, buildReviewerLifecycleInput(actor.role, actor.actorId, parsed.data));
        return respondLifecycleResult(result);
    }

    return NextResponse.json({ error: 'HR 역할은 승인 lifecycle 전이를 수행할 수 없습니다.' }, { status: 403 });
}

function buildReviewerLifecycleInput(
    role: 'leader' | 'sme',
    actorId: string,
    decision: z.infer<typeof SopReviewerLifecycleTransitionSchema>
) {
    if (role === 'leader') {
        return decision.decision === 'approve'
            ? ({ actorRole: 'leader', actorId, kind: 'leader-approve' } as const)
            : ({ actorRole: 'leader', actorId, kind: 'leader-reject', reasonCode: decision.reasonCode, feedback: decision.feedback } as const);
    }
    return decision.decision === 'approve'
        ? ({ actorRole: 'sme', actorId, kind: 'sme-approve' } as const)
        : ({ actorRole: 'sme', actorId, kind: 'sme-reject', reasonCode: decision.reasonCode, feedback: decision.feedback } as const);
}

async function respondLifecycleResult(result: Awaited<ReturnType<typeof sopRepository.transitionLifecycle>>) {
    if (!result.ok) {
        if (result.reason === 'not-found') return NextResponse.json({ error: 'SOP 기록을 찾을 수 없습니다.' }, { status: 404 });
        if (result.reason === 'forbidden') return NextResponse.json({ error: result.message }, { status: 403 });
        if (result.reason === 'invalid-request') return NextResponse.json({ error: result.message }, { status: 400 });
        return NextResponse.json({ error: result.message }, { status: 409 });
    }
    return respondValidated(SopRecordResponseSchema, { record: result.record }, 200);
}
