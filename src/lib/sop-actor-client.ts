import type { SopMember } from './sop-types';

/**
 * Derives the `x-sop-actor-*` headers every /api/sop* route requires (see
 * sop-actor-context.ts) from the current prototype member session. This is
 * explicitly NOT authentication — it is the client-side half of the same
 * distrusted test/dev seam the server already documents. A member's `id`
 * (falling back to `employeeId`) is their actorId; `organization` is used
 * as-is as the flat organizationId (this prototype has no org hierarchy).
 *
 * HTTP header VALUES are restricted to ISO-8859-1 — a real browser's
 * `fetch()` throws synchronously ("String contains non ISO-8859-1 code
 * point") if given a raw value containing e.g. Korean characters, which this
 * app's own sample organization name ('People & Culture팀') does. Values are
 * `encodeURIComponent`-escaped here and `decodeURIComponent`-reversed by
 * `readSopActorContext` on the server, so any member identity string is safe
 * to carry regardless of script. This bug was invisible to every test in this
 * repo because Node's `Headers` implementation does not enforce the same
 * restriction — only a real browser does.
 */
export function buildSopActorHeaders(member: SopMember): Record<string, string> {
    return {
        'x-sop-actor-id': encodeURIComponent(member.id || member.employeeId || 'unknown-member'),
        'x-sop-actor-role': 'member',
        'x-sop-actor-organization-id': encodeURIComponent(member.organization || 'unknown-org'),
    };
}

/**
 * The general-purpose counterpart to buildSopActorHeaders for the non-member
 * demo roles (leader/SME/HR) exercised by the "데모 역할 전환" toggles on
 * /sop/approvals and /sop/hr — same encoding, no member-specific fallback
 * logic. Still explicitly NOT authentication; see sop-actor-context.ts.
 */
export function buildDemoActorHeaders(actor: { actorId: string; role: 'leader' | 'sme' | 'hr'; organizationId: string }): Record<string, string> {
    return {
        'x-sop-actor-id': encodeURIComponent(actor.actorId),
        'x-sop-actor-role': actor.role,
        'x-sop-actor-organization-id': encodeURIComponent(actor.organizationId),
    };
}
