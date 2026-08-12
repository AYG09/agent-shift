import { NextRequest, NextResponse } from 'next/server';
import { SopRecordUpdateRequestSchema } from '@/lib/sop-record-schema';
import { SopRecordResponseSchema, SopUpdateConflictResponseSchema } from '@/lib/sop-response-schemas';
import { scopeSopRecordsForActor } from '@/lib/sop-actor';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;
    const { id } = await params;

    const record = await sopRepository.getById(id);
    if (!record || scopeSopRecordsForActor(actor, [record]).length === 0) {
        return NextResponse.json({ error: 'SOP 기록을 찾을 수 없거나 조회 권한이 없습니다.' }, { status: 404 });
    }
    return respondValidated(SopRecordResponseSchema, { record }, 200);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;
    const { id } = await params;

    const existing = await sopRepository.getById(id);
    if (!existing || scopeSopRecordsForActor(actor, [existing]).length === 0) {
        return NextResponse.json({ error: 'SOP 기록을 찾을 수 없거나 조회 권한이 없습니다.' }, { status: 404 });
    }
    // Only the owning member may edit their own SOP through this boundary —
    // a leader/HR review decision is a separate, narrower action (reviewDecision/
    // reviewComment), not a rewrite of the member's document, and is not
    // implemented in this minimal contract.
    if (actor.role !== 'member' || actor.actorId !== existing.memberId) {
        return NextResponse.json({ error: '이 SOP는 작성한 구성원만 수정할 수 있습니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = SopRecordUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({ field: issue.path.join('.') || '(root)', message: issue.message }));
        return NextResponse.json(
            { error: `SOP 갱신 요청이 유효하지 않습니다: ${issues.map((i) => `${i.field}: ${i.message}`).join(' / ')}`, issues },
            { status: 400 }
        );
    }

    // The URL id names the record being updated; a document whose own id
    // disagrees with it must never be accepted — that is exactly how a record
    // envelope's id and its embedded document.id could end up mismatched.
    // Rejected before any repository call, so a mismatched request can never
    // reach (and can never bump the version of) the wrong record.
    if (parsed.data.document.id !== id) {
        return NextResponse.json(
            { error: `URL의 SOP id(${id})와 요청 본문 document.id(${parsed.data.document.id})가 일치하지 않습니다.` },
            { status: 400 }
        );
    }

    const result = await sopRepository.update(id, parsed.data);
    if (!result.ok) {
        // The API-level check above already rejects an id mismatch with 400 before
        // ever calling update() — this branch means the repository itself caught
        // something the API boundary didn't (defense in depth, not the primary path).
        if (result.reason === 'id-mismatch') {
            return NextResponse.json({ error: 'record id와 document.id가 일치하지 않아 저장할 수 없습니다.' }, { status: 400 });
        }
        if (result.reason === 'not-found') {
            return NextResponse.json({ error: 'SOP 기록을 찾을 수 없습니다.' }, { status: 404 });
        }
        // Safe to include `current` here (unlike the POST create-conflict path):
        // the ownership check above already guarantees this requester IS the
        // record's own owning member, so `current` only ever hands them back
        // their own record.
        return respondValidated(
            SopUpdateConflictResponseSchema,
            { error: '다른 곳에서 먼저 저장되어 버전이 어긋났습니다. 최신 내용을 다시 불러온 뒤 저장해 주세요.', current: result.current },
            409
        );
    }
    return respondValidated(SopRecordResponseSchema, { record: result.record }, 200);
}
