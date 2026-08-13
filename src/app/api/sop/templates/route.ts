import { NextRequest } from 'next/server';
import { SopTemplateListResponseSchema, toSopTemplateSummary, documentContainsAuthorIdentifiers } from '@/lib/sop-template';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';

/**
 * Colleague-template candidate listing. Approved AND explicitly template-eligible
 * records only, EXCLUDING the requesting actor's own records — see
 * SopRepository.listColleagueTemplateCandidates, which is the intention-revealing
 * query for this exact use case (as opposed to listTemplateEligible, a "full
 * visibility" query no member-facing route should call). Records whose body text
 * contains the source author's own known identifiers are ALSO excluded here
 * (documentContainsAuthorIdentifiers — shared with the clone route so both
 * enforce the identical rule). Every remaining row is sanitized through
 * toSopTemplateSummary before it ever leaves the server, so no employeeId/name/
 * comment can reach the client even by a future field-add mistake elsewhere in
 * the record.
 */
export async function GET(request: NextRequest) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;

    const records = await sopRepository.listColleagueTemplateCandidates(actorResult.actor.actorId);
    const templates = records
        .filter((record) => !documentContainsAuthorIdentifiers(record.document, record.document.member))
        .map(toSopTemplateSummary);
    return respondValidated(SopTemplateListResponseSchema, { templates }, 200);
}
