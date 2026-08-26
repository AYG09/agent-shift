import { z } from 'zod';
import { SopDocumentSchema } from './sop-document-schema';
import { SOP_NODE_BLOCKING_ISSUE_CODES, SOP_NODE_WARNING_ISSUE_CODES, SOP_NODE_INSTRUCTION_CONTRACT_VERSION } from './sop-node-authoring-contract';

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
 * A genuine cross-source disagreement the synthesis model must NOT resolve on
 * its own (NODE_AUTHORING_AND_AGENT_CONTROL.md §6.3 / REQ-STD-002): a
 * responsibility, numeric threshold, tool-policy, or decision-condition
 * conflict between approved source SOPs. `conflictingValues` names each
 * disagreeing source only by its OPAQUE label (`sourceLabel`, e.g. "원본 1")
 * — never the source member's identity — so this can be shown to HR without
 * reintroducing the PII the source summaries already stripped.
 */
export const SOP_STANDARDIZATION_ISSUE_TYPES = ['responsibility', 'threshold', 'tool-policy', 'condition'] as const;
export type SopStandardizationIssueType = (typeof SOP_STANDARDIZATION_ISSUE_TYPES)[number];

const SopStandardizationConflictValueSchema = z.object({
    sourceLabel: z.string().min(1),
    /** De-identified description of that source's stance — never a raw copy-paste of free text that could carry residual PII. */
    value: z.string().min(1),
});

export const SopStandardizationIssueSchema = z.object({
    /** Short description of the represented action/decision this concerns — not required to exactly match a generated step id, since sources have no shared step identity to begin with. */
    targetStepLabel: z.string().min(1),
    issueType: z.enum(SOP_STANDARDIZATION_ISSUE_TYPES),
    conflictingValues: z.array(SopStandardizationConflictValueSchema).min(2),
    humanDecisionNeeded: z.string().min(1),
});
export type SopStandardizationIssue = z.infer<typeof SopStandardizationIssueSchema>;

/**
 * Wire-lenient counterpart for tolerantly reading the model's raw
 * `standardizationIssues` passthrough field (see sop-standard-draft-runner.ts)
 * before it is re-validated against the strict schema above for the actual
 * response — the same wire/gate split sop-schemas.ts uses for the main
 * generation object, and for an identical reason: one malformed issue must
 * never be allowed to throw away the whole (already-generated) draft.
 */
export const SopStandardizationIssueWireSchema = z.object({
    targetStepLabel: z.string().optional(),
    issueType: z.enum(SOP_STANDARDIZATION_ISSUE_TYPES).optional(),
    conflictingValues: z
        .array(
            z.object({
                sourceLabel: z.string().optional(),
                value: z.string().optional(),
            })
        )
        .optional(),
    humanDecisionNeeded: z.string().optional(),
});

const SopNodeQualityIssueSchema = z.object({
    severity: z.enum(['blocking', 'warning']),
    code: z.enum([...SOP_NODE_BLOCKING_ISSUE_CODES, ...SOP_NODE_WARNING_ISSUE_CODES]),
    stepId: z.string().optional(),
    message: z.string(),
});

/** Mirrors SopNodeQualityReport (sop-node-authoring-contract.ts) as a response-schema shape — that module defines the report as a plain TS interface, not a zod schema, since it never crosses the wire on its own. */
export const SopNodeQualityReportSchema = z.object({
    contractVersion: z.literal(SOP_NODE_INSTRUCTION_CONTRACT_VERSION),
    issues: z.array(SopNodeQualityIssueSchema),
    blockingIssues: z.array(SopNodeQualityIssueSchema),
    warningIssues: z.array(SopNodeQualityIssueSchema),
    ok: z.boolean(),
});

/**
 * Response wrapper — deliberately NOT a field on SopDocument/SopRecord
 * (`sourceRecordIds` is a list, unlike the single-source `sourceTemplateId`/
 * `sourceRecordId` provenance fields on a personal SOP). This is a preview
 * only: `document` is never auto-saved via SopRepository.create, and this
 * response is never presented as an officially confirmed standard.
 *
 * `qualityReport` and `standardizationIssues` are additive: a node-quality or
 * standardization concern is surfaced explicitly here rather than silently
 * dropped or forced into a picked/averaged value — REQ-STD-002/REQ-STD-003.
 * Neither field ever turns a successful generation into an error response;
 * only graph-level structural failure (see sop-standard-draft-runner.ts) does.
 */
export const SopStandardDraftResponseSchema = z.object({
    document: SopDocumentSchema,
    sourceRecordIds: z.array(z.string()),
    taskId: z.string(),
    generatedAt: z.string(),
    qualityReport: SopNodeQualityReportSchema,
    standardizationIssues: z.array(SopStandardizationIssueSchema),
});
