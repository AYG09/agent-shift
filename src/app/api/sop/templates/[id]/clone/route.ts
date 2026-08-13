import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SopDocumentSchema, SopMemberSchema } from '@/lib/sop-document-schema';
import { cloneSopDocumentFromTemplate, documentContainsAuthorIdentifiers } from '@/lib/sop-template';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';

type RouteContext = { params: Promise<{ id: string }> };

// SopMemberSchema.id is optional in general (legacy documents may not carry
// one) — but a clone request MUST identify who is cloning, so id is required
// here specifically. A request omitting it (the earlier bug: only checked
// equality when id was PRESENT, so omitting it entirely bypassed the check)
// is now rejected at the schema layer, before any comparison logic runs.
const CloneRequestSchema = z.object({ member: SopMemberSchema.extend({ id: z.string().min(1) }) });
const CloneResponseSchema = z.object({ document: SopDocumentSchema });

/**
 * Clones an approved, template-eligible colleague SOP into a brand-new,
 * independent draft document under the caller's own identity. Never mutates
 * or merges the source record — see cloneSopDocumentFromTemplate's docstring
 * for the exact invariants. Returns the built (not yet persisted) document so
 * the client can setDocument()+navigate exactly like an AI-generated SOP; a
 * separate explicit save action persists it as the member's own SopRecord.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;
    const { id } = await params;

    if (actor.role !== 'member') {
        return NextResponse.json({ error: '동료 SOP 템플릿 복제는 구성원만 할 수 있습니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = CloneRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: '복제 요청에 현재 구성원 정보(member.id 포함)가 필요합니다.' }, { status: 400 });
    }
    if (parsed.data.member.id !== actor.actorId) {
        return NextResponse.json({ error: 'member.id는 요청자 본인의 actor context와 일치해야 합니다.' }, { status: 403 });
    }

    const source = await sopRepository.getById(id);
    // Deliberately identical 404 for every non-cloneable reason (not found, not
    // eligible, or — critically — own record) — a member must not be able to
    // distinguish "no such SOP" from "exists but isn't an approved/eligible
    // colleague record" via this endpoint. The listing API already excludes a
    // member's own records (see listColleagueTemplateCandidates), but that is a
    // display filter, not a security boundary — a member who already knows a
    // template id (e.g. their own, from having created it) must be blocked here
    // too, independent of what the list endpoint would have shown them.
    if (
        !source ||
        source.lifecycleStatus !== 'approved' ||
        !source.templateEligible ||
        source.memberId === actor.actorId ||
        documentContainsAuthorIdentifiers(source.document, source.document.member)
    ) {
        return NextResponse.json({ error: '복제할 수 있는 동료 SOP 템플릿을 찾을 수 없습니다.' }, { status: 404 });
    }

    // id/organization ownership is never left to client-submitted values, even
    // though they were just validated above — normalizing to the trusted actor
    // context is a second, independent line of defense. name/jobRole/grade have
    // no verified source in this prototype (no real SSO/HR master connected) and
    // stay client-supplied "프로토타입 클라이언트 프로필" fields — that limitation
    // is real, but it must never extend to bypassing ID/organization ownership.
    const normalizedMember = { ...parsed.data.member, id: actor.actorId, organization: actor.organizationId };

    const document = cloneSopDocumentFromTemplate(source.document, normalizedMember, `sop-clone-${randomUUID()}`);
    return respondValidated(CloneResponseSchema, { document }, 200);
}
