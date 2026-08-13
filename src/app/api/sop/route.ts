import { NextRequest, NextResponse } from 'next/server';
import { SopRecordCreateRequestSchema } from '@/lib/sop-record-schema';
import { SopRecordResponseSchema, SopRecordListResponseSchema, SopCreateConflictResponseSchema } from '@/lib/sop-response-schemas';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';
import { validateSopDocumentOwner, validateSopPersistenceState } from '@/lib/sop-persistence-validation';

function invalidSopStateResponse(errors: string[]) {
    return NextResponse.json(
        { error: `SOP 상태가 저장 조건을 충족하지 않습니다: ${errors.join(' / ')}`, issues: errors.map((message) => ({ field: 'document', message })) },
        { status: 400 }
    );
}

/**
 * SOP save/list boundary — separate from /api/ai's generation endpoint. Backed
 * by the in-memory reference SopRepository (see sop-repository-memory.ts): it
 * proves out this contract but is not durable. A member UI that calls this
 * only shows "saved" after a successful response; it must not claim success
 * from a client-side write alone.
 */
export async function POST(request: NextRequest) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;

    // Only a member creates their own SOP. A leader/HR "creating" a SOP under
    // someone else's identity is delegated authorship, which this contract
    // does not model — leader/HR write access is limited to review actions
    // (not implemented in this minimal scope), never to authoring a document.
    if (actor.role !== 'member') {
        return NextResponse.json({ error: 'SOP 생성은 구성원만 할 수 있습니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = SopRecordCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({ field: issue.path.join('.') || '(root)', message: issue.message }));
        return NextResponse.json(
            { error: `SOP 저장 요청이 유효하지 않습니다: ${issues.map((i) => `${i.field}: ${i.message}`).join(' / ')}`, issues },
            { status: 400 }
        );
    }

    // A member may only create a record under their own identity — this is not
    // a delegation/authoring-on-behalf-of feature.
    if (parsed.data.memberId !== actor.actorId || parsed.data.organizationId !== actor.organizationId) {
        return NextResponse.json(
            { error: 'memberId/organizationId는 요청자 본인의 actor context와 일치해야 합니다.' },
            { status: 403 }
        );
    }

    const stateErrors = [
        ...validateSopDocumentOwner(parsed.data.document, actor.actorId),
        ...validateSopPersistenceState(parsed.data.document),
    ];
    if (stateErrors.length > 0) return invalidSopStateResponse(stateErrors);

    const result = await sopRepository.create(parsed.data);
    if (!result.ok) {
        // 'already-exists' is a real conflict, never a silent overwrite of the
        // prior record — create() and update() are deliberately not merged
        // into an implicit upsert. The requester attempting this create may be
        // a completely different member/organization than whoever owns the
        // existing record, so the existing record (result.current) is
        // deliberately NOT included in the response — only a generic error and
        // a machine-readable code. See SopCreateConflictResponseSchema's
        // docstring for why this must stay a separate schema from the
        // PUT version-conflict response, which IS safe to include `current` in.
        return respondValidated(
            SopCreateConflictResponseSchema,
            { error: `이미 동일한 ID로 저장된 SOP가 있습니다 (id: ${parsed.data.document.id}). 기존 SOP의 소유자만 PUT /api/sop/${parsed.data.document.id}로 수정할 수 있습니다.`, code: 'already-exists' },
            409
        );
    }
    return respondValidated(SopRecordResponseSchema, { record: result.record }, 201);
}

export async function GET(request: NextRequest) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;

    // Each role's scope is resolved by calling the repository operation that
    // is itself scoped to exactly that role's contract — member's own SOPs,
    // leader/SME's own organization, HR's every organization — rather than
    // fetching a broad set and filtering it after the fact. This generic
    // listing is NOT the leader/SME review queue (see GET /api/sop/approvals,
    // backed by listByLifecycleStage + sop-review-assignment.ts) — a leader/
    // SME actor calling this endpoint only sees their own organization's
    // records, same minimal-privilege default as before 'sme' existed.
    const records = actor.role === 'member'
        ? await sopRepository.listByMember(actor.actorId)
        : actor.role === 'leader' || actor.role === 'sme'
        ? await sopRepository.listByOrganization(actor.organizationId)
        : await sopRepository.listAll();

    return respondValidated(SopRecordListResponseSchema, { records }, 200);
}
