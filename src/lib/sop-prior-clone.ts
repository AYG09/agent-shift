import type { SopDocument } from './sop-types';

/**
 * Builds a brand-new, independent draft document from one of the CURRENT
 * member's own past records (any lifecycle status — draft, rejected, or
 * approved; ownership, not lifecycle, is the only eligibility rule). Unlike
 * `cloneSopDocumentFromTemplate` (sop-template.ts), member identity is kept
 * as-is: this is the same person, not a colleague, so there is no PII to
 * sanitize. Every invariant below is load-bearing — see
 * final-system-scenario-contract.md §5 and the work order's "own-prior" rules:
 *  - new document id, new createdAt/updatedAt
 *  - reviewStatus reset to 'ai-draft' (document AND every step — a
 *    'confirmed' step inside a non-confirmed document fails
 *    validateSopPersistenceState)
 *  - agentizationReview (the member's own prior judgement) is dropped —
 *    approval/review/Agentization state must restart for the new draft
 *  - agentizationSuggestion (AI-generated structural content) is kept
 *  - sourceRecordId provenance is the only trace of where this came from;
 *    never set together with sourceTemplateId
 *  - the source record itself is never mutated by this function — it only
 *    builds a new document; a caller must never write the result back over
 *    `source`
 */
export function cloneSopDocumentFromPriorRecord(source: SopDocument, newDocumentId: string): SopDocument {
    const now = new Date().toISOString();
    return {
        ...source,
        id: newDocumentId,
        reviewStatus: 'ai-draft',
        steps: source.steps.map((step) => ({ ...step, reviewStatus: 'ai-draft' })),
        agentizationReview: undefined,
        createdAt: now,
        updatedAt: now,
        isSampleData: false,
        sourceTemplateId: undefined,
        sourceRecordId: source.id,
        creationSource: 'own-prior',
    };
}
