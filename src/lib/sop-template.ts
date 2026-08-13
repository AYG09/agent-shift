import { z } from 'zod';
import type { SopDocument, SopMember } from './sop-types';
import type { SopRecord } from './sop-record-schema';

/**
 * A colleague-template candidate as shown on a card BEFORE cloning. Deliberately
 * excludes every personal identifier (memberId, employeeId, member name,
 * organizationId/organization, review comments) — only Task/SOP/role-category
 * context that helps a member judge relevance survives sanitization. Never add
 * a field here without checking it cannot re-identify who authored the record.
 *
 * `organizationCategory` was deliberately removed (not just renamed away from
 * the raw org string) — this prototype has no verified, allowlisted org
 * classification scheme, and echoing `member.organization` back under a
 * "category" name was fake anonymization: a small team/org name can re-identify
 * its author on its own. Re-introduce it only behind an explicit, reviewed
 * allowlist-based broad-category function, never a raw pass-through.
 *
 * `jobRoleCategory` is kept because a job-role label (e.g. "채용담당자") is
 * inherently a role category, not a personal identifier, in this prototype's
 * data model — but it is still exactly `member.jobRole` as authored, so it must
 * never be treated as a verified/normalized taxonomy either.
 */
export const SopTemplateSummarySchema = z.object({
    templateId: z.string(),
    taskId: z.string(),
    taskName: z.string(),
    sopTitle: z.string(),
    /** The source author's job-role label. Role category by construction, not an identity — see the file docstring. */
    jobRoleCategory: z.string(),
    activityCount: z.number().int().nonnegative(),
    subActionCount: z.number().int().nonnegative(),
    updatedAt: z.string(),
});
export type SopTemplateSummary = z.infer<typeof SopTemplateSummarySchema>;

export const SopTemplateListResponseSchema = z.object({ templates: z.array(SopTemplateSummarySchema) });

function collectDocumentTextFields(document: SopDocument): string[] {
    const fields: string[] = [document.title, document.context];
    document.steps.forEach((step) => {
        fields.push(step.title, step.definition);
        if (step.detailedInstructions) fields.push(step.detailedInstructions);
        (step.inputs ?? []).forEach((value) => fields.push(value));
        (step.outputs ?? []).forEach((value) => fields.push(value));
        (step.tools ?? []).forEach((value) => fields.push(value));
        (step.cautions ?? []).forEach((value) => fields.push(value));
        (step.decisionRules ?? []).forEach((value) => fields.push(value));
        step.requiredSkills.forEach((skill) => {
            fields.push(skill.name);
            if (skill.reason) fields.push(skill.reason);
        });
    });
    document.edges.forEach((edge) => {
        if (edge.label) fields.push(edge.label);
        if (edge.condition) fields.push(edge.condition);
    });
    return fields;
}

/** `>= 2` chars is a defensive floor against near-empty strings, not a real detection threshold. */
function collectKnownAuthorIdentifiers(member: SopMember): string[] {
    return [member.name, member.employeeId, member.organization, member.id]
        .filter((value): value is string => typeof value === 'string' && value.trim().length >= 2);
}

/**
 * Exact-substring (case-insensitive) scan for the source author's OWN known
 * identifier values — name, employeeId, organization, id — across every
 * free-text field of their document (title/context, step title/definition/
 * detailedInstructions/inputs/outputs/tools/cautions/decisionRules, required-
 * SKILL name/reason, edge label/condition).
 *
 * KNOWN LIMITATION, stated here rather than implied by silence: this can only
 * catch an identifier it was explicitly given, verbatim. It does NOT detect
 * paraphrased self-references ("작성자 본인"), a third party's personal
 * information typed into the content, or any unstructured PII (phone numbers,
 * emails) the member happened to type that isn't one of their four known
 * profile fields. This is a floor, not a general anonymization guarantee —
 * never describe a document that passes this scan as "AI로 익명화됨" or
 * otherwise fully scrubbed.
 *
 * Shared by both the template-listing route and the clone route (see their
 * call sites) so the two enforce the identical rule — a member must never be
 * able to reach a leaked document through one endpoint that the other blocks.
 */
export function documentContainsAuthorIdentifiers(document: SopDocument, member: SopMember): boolean {
    const identifiers = collectKnownAuthorIdentifiers(member);
    if (identifiers.length === 0) return false;
    const haystacks = collectDocumentTextFields(document)
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
    return identifiers.some((identifier) => {
        const needle = identifier.toLowerCase();
        return haystacks.some((haystack) => haystack.includes(needle));
    });
}

/** Strips every personal identifier from an approved, template-eligible record for card display. */
export function toSopTemplateSummary(record: SopRecord): SopTemplateSummary {
    const businessSteps = record.document.steps.filter((step) => !step.terminalType);
    return {
        templateId: record.id,
        taskId: record.taskId,
        taskName: record.taskName,
        sopTitle: record.document.title,
        jobRoleCategory: record.document.member.jobRole,
        activityCount: new Set(businessSteps.flatMap((step) => step.sourceActivityIds ?? [])).size,
        subActionCount: businessSteps.length,
        updatedAt: record.updatedAt,
    };
}

/**
 * Builds a brand-new, independent draft document from an approved colleague
 * template. Every invariant below is load-bearing — see
 * member-home-subaction-contract.md §2.3/§7.2:
 *  - new document id, current member's identity (never the source author's)
 *  - new createdAt/updatedAt, reviewStatus reset to 'ai-draft' (document AND
 *    every step — validateSopPersistenceState forbids a 'confirmed' step
 *    inside a non-confirmed document)
 *  - agentizationReview (the source member's judgement) is dropped entirely;
 *    agentizationSuggestion (AI-generated structural content) is kept
 *  - sourceTemplateId provenance is the only trace of where this came from
 *
 * Invariant: `newDocumentId` (and therefore `sourceTemplateId`, `templateId`
 * in SopTemplateSummary) must always be an opaque, member-info-independent
 * identifier (timestamp/UUID-derived — see every actual call site of this
 * function and of buildTaskGateSampleDocument/createSopDocumentFromGeneration)
 * — never a slug or hash built from the author's name/employeeId/org. This
 * function does not itself generate the id, so it cannot enforce that, but a
 * caller that ever changes id generation to derive from member fields would
 * silently reintroduce exactly the leak documentContainsAuthorIdentifiers
 * exists to close.
 */
export function cloneSopDocumentFromTemplate(source: SopDocument, currentMember: SopMember, newDocumentId: string): SopDocument {
    const now = new Date().toISOString();
    return {
        ...source,
        id: newDocumentId,
        member: currentMember,
        reviewStatus: 'ai-draft',
        steps: source.steps.map((step) => ({ ...step, reviewStatus: 'ai-draft' })),
        agentizationReview: undefined,
        createdAt: now,
        updatedAt: now,
        isSampleData: false,
        sourceTemplateId: source.id,
    };
}
