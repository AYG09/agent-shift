import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { SopDocumentSchema } from '@/lib/sop-document-schema';
import { cloneSopDocumentFromPriorRecord } from '@/lib/sop-prior-clone';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';
import { z } from 'zod';

type RouteContext = { params: Promise<{ id: string }> };

const CloneResponseSchema = z.object({ document: SopDocumentSchema });

/**
 * Clones one of the CURRENT member's own past records (any lifecycle status)
 * into a brand-new, independent draft document. Unlike the colleague-template
 * clone route, this never sanitizes member identity — it's the same person —
 * and never requires the source to be approved/eligible; only ownership.
 * Returns the built (not yet persisted) document, same contract as the
 * colleague-clone route: a separate explicit save action persists it as the
 * member's own new SopRecord.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;
    const { id } = await params;

    if (actor.role !== 'member') {
        return NextResponse.json({ error: '기존 작성 내용 기반 복제는 구성원만 할 수 있습니다.' }, { status: 403 });
    }

    const source = await sopRepository.getById(id);
    // Deliberately identical 404 for "not found" and "not this actor's own
    // record" — a member must not be able to distinguish the two through this
    // endpoint, same reasoning as the colleague-template clone route.
    if (!source || source.memberId !== actor.actorId) {
        return NextResponse.json({ error: '복제할 수 있는 기존 작성 SOP를 찾을 수 없습니다.' }, { status: 404 });
    }

    const document = cloneSopDocumentFromPriorRecord(source.document, `sop-prior-clone-${randomUUID()}`);
    return respondValidated(CloneResponseSchema, { document }, 200);
}
