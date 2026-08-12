import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SopActorContext } from '@/lib/sop-actor';

const ActorHeaderSchema = z.object({
    actorId: z.string().min(1),
    role: z.enum(['member', 'leader', 'hr']),
    organizationId: z.string().min(1),
});

export type SopActorContextResult =
    | { ok: true; actor: SopActorContext }
    | { ok: false; response: NextResponse };

/**
 * Reads the caller's actor context from request headers. There is no
 * authentication provider connected in this environment, so this is a
 * deliberately explicit, distrusted test/dev seam: every caller must state who
 * they are, and nothing here verifies that claim. This MUST NOT be treated as
 * — or presented to a user as — real authentication. Swap this function's body
 * (not the SopActorContext type or its callers) once a real identity provider
 * is connected.
 */
export function readSopActorContext(request: NextRequest): SopActorContextResult {
    const parsed = ActorHeaderSchema.safeParse({
        actorId: request.headers.get('x-sop-actor-id'),
        role: request.headers.get('x-sop-actor-role'),
        organizationId: request.headers.get('x-sop-actor-organization-id'),
    });
    if (!parsed.success) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: 'x-sop-actor-id, x-sop-actor-role(member|leader|hr), x-sop-actor-organization-id 헤더가 모두 필요합니다. 이는 인증이 아니라 테스트용 actor 주입입니다.',
                },
                { status: 401 }
            ),
        };
    }
    return { ok: true, actor: parsed.data };
}
