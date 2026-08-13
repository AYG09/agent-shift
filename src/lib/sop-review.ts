import type { SopDocument, SopReviewStatus, SopStepData } from './sop-types';
import { validateSopGraph } from './graph-validation';
import {
    validateSubActionOrigins,
    formatSubActionOriginErrors,
    validateSubActionStructure,
    formatSubActionStructureErrors,
} from './sop-activity-coverage';
import { getScopedActivities } from './sop-task-library';

/** Step-level edits/UI updates can only ever produce 'reviewed', never 'confirmed'. */
export function computeDocumentReviewStatus(steps: SopStepData[]): SopReviewStatus {
    const anyUnreviewed = steps.some((s) => s.reviewStatus === 'ai-draft');
    if (anyUnreviewed) return 'ai-draft';
    return 'reviewed';
}

/**
 * The step-level review toggle. Cannot directly set 'confirmed' — that status is
 * only reachable through validateFullSopConfirmation's full validation pass.
 */
export function applyStepReviewStatus(
    doc: SopDocument,
    stepId: string,
    status: SopReviewStatus
): { steps: SopStepData[]; reviewStatus: SopReviewStatus } {
    const allowedStatus: SopReviewStatus = status === 'confirmed' ? 'reviewed' : status;
    const steps = doc.steps.map((s) => (s.id === stepId ? { ...s, reviewStatus: allowedStatus } : s));
    return { steps, reviewStatus: computeDocumentReviewStatus(steps) };
}

/**
 * Full-document confirmation validation: every step must be reviewed, every
 * AI-suggested SKILL must be accepted or removed, and the graph itself must be
 * structurally valid (start/end nodes, decision branches, orphans, cycles).
 * Confirmation is the ONLY path that can set reviewStatus: 'confirmed'.
 */
export function validateFullSopConfirmation(doc: SopDocument): { success: true; confirmedDocument: SopDocument } | { success: false; errors: string[] } {
    const errors: string[] = [];

    // Content completeness: the persist schema (sop-document-schema.ts) deliberately
    // allows an empty title/definition so an in-progress draft can be saved - but
    // confirmation is the point where a document claims to be actually ready, so an
    // empty (or whitespace-only) required field must block it here, not silently pass.
    if (!doc.title.trim()) {
        errors.push('SOP 문서 제목이 비어 있습니다.');
    }
    doc.steps.forEach((s) => {
        if (!s.title.trim()) {
            errors.push(`[${s.id}] 단계 제목이 비어 있습니다.`);
        }
        if (!s.definition.trim()) {
            errors.push(`[${s.title.trim() || s.id}] 단계 정의(definition)가 비어 있습니다.`);
        }
    });

    const unreviewedSteps = doc.steps.filter((s) => s.reviewStatus !== 'reviewed' && s.reviewStatus !== 'confirmed');
    if (unreviewedSteps.length > 0) {
        errors.push(
            `미검토 단계가 ${unreviewedSteps.length}개 남아있습니다 (${unreviewedSteps.map((s) => s.title).join(', ')})`
        );
    }

    const unacceptedAiSkills: string[] = [];
    doc.steps.forEach((s) => {
        s.requiredSkills.forEach((sk) => {
            if (sk.source === 'ai-suggested' && !sk.accepted) {
                unacceptedAiSkills.push(`[${s.title}] ${sk.name}`);
            }
        });
    });
    if (unacceptedAiSkills.length > 0) {
        errors.push(`미처리된 AI 제안 SKILL이 ${unacceptedAiSkills.length}개 있습니다 (${unacceptedAiSkills.join(', ')})`);
    }

    const graphIssues = validateSopGraph(doc.steps, doc.edges);
    graphIssues.forEach((issue) => errors.push(issue.message));

    // Confirm-boundary-only: a newer Activity–Sub Action document must satisfy the full
    // Sub Action contract before it can claim 'confirmed' — (1) structure: every Sub
    // Action maps to exactly one in-scope Activity, carries a positive subActionOrder
    // unique within that Activity, and every scoped Activity is covered; (2) origin:
    // every Sub Action traces where it came from (Activity 기본 분해 vs 직무 맥락 보강,
    // the latter with a rationale). Gated on structureVersion so a legacy
    // (structureVersion-less) document is never retroactively held to either rule.
    // Deliberately checked here (not at save/draft time) so this single function stays
    // the one shared confirm authority both confirmFullSop() (client) and
    // validateSopPersistenceState (server, which calls this function) enforce
    // identically — the client must never locally "confirm" a document the server
    // would then reject.
    if (doc.structureVersion === 'activity-subaction-v1') {
        const allowedActivityIds = getScopedActivities(doc.workLibrary).map((activity) => activity.id);
        const structure = validateSubActionStructure(doc.steps, allowedActivityIds);
        if (!structure.valid) errors.push(...formatSubActionStructureErrors(structure));
        const originResult = validateSubActionOrigins(doc.steps);
        if (!originResult.valid) errors.push(...formatSubActionOriginErrors(originResult));
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const now = new Date().toISOString();
    return {
        success: true,
        confirmedDocument: {
            ...doc,
            steps: doc.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const })),
            reviewStatus: 'confirmed',
            updatedAt: now,
        },
    };
}
