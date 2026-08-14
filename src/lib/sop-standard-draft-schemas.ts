import { z } from 'zod';
import { SopDocumentSchema } from './sop-document-schema';

/**
 * POST /api/sop/standard-drafts request — HR selects a Task-grouped candidate
 * set (sop-analytics.ts's computeStandardCandidateGroups) and asks for an AI
 * representative draft built ONLY from those approved, same-Task source
 * records. `sourceRecordIds` must all resolve to approved records sharing
 * `taskId` — the route re-verifies this server-side; the schema only
 * enforces shape (non-empty ids/array).
 */
export const SopStandardDraftRequestSchema = z.object({
    taskId: z.string().min(1),
    sourceRecordIds: z.array(z.string().min(1)).min(1),
    model: z.string().optional(),
    reasoning: z.string().optional(),
    apiKey: z.string().optional(),
});

/**
 * Response wrapper — deliberately NOT a field on SopDocument/SopRecord
 * (`sourceRecordIds` is a list, unlike the single-source `sourceTemplateId`/
 * `sourceRecordId` provenance fields on a personal SOP). This is a preview
 * only: `document` is never auto-saved via SopRepository.create, and this
 * response is never presented as an officially confirmed standard.
 */
export const SopStandardDraftResponseSchema = z.object({
    document: SopDocumentSchema,
    sourceRecordIds: z.array(z.string()),
    taskId: z.string(),
    generatedAt: z.string(),
});
