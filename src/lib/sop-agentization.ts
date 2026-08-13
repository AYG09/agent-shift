import { z } from 'zod';
import type { SopAgentizationReview, SopAgentizationScope, SopAgentizationSuggestionType, SopAiApplicationMode, SopDocument } from './sop-types';

/**
 * `SopAgentizationReview.mode`/`.stepModes` values are typed as the current,
 * narrower `SopAiApplicationMode` union, but a review rehydrated from an
 * older persisted browser draft can still carry pre-reduction legacy values
 * ('human-review', 'collaboration', 'human-only', or anything else a past
 * schema version allowed). This schema validates only the container shape
 * (object with these optional keys) so that access below is genuinely safe
 * rather than a blind cast — each individual value is still resolved through
 * normalizeAgentizationMode(), which already tolerates unrecognized values.
 */
const LegacyAgentizationReviewFieldsSchema = z.object({
    defaultMode: z.unknown().optional(),
    mode: z.unknown().optional(),
    stepModes: z.record(z.string(), z.unknown()).optional(),
});

function readLegacyAgentizationReviewFields(review: SopAgentizationReview | undefined) {
    if (!review) return {};
    const parsed = LegacyAgentizationReviewFieldsSchema.safeParse(review);
    return parsed.success ? parsed.data : {};
}

export const AI_APPLICATION_MODES: Array<{ id: SopAiApplicationMode; label: string; shortLabel: string; detail: string; badgeClass: string }> = [
    { id: 'automation', label: 'AI Agent 후보', shortLabel: 'AI Agent', detail: '정해진 규칙 안에서 AI가 단계 실행을 주도', badgeClass: 'border-violet-300 bg-violet-50 text-violet-800' },
    { id: 'assist', label: 'AI 지원', shortLabel: 'AI 지원', detail: '사람이 수행하고 AI가 초안·검색·분석을 지원', badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-800' },
];

/**
 * Display metadata for an AI-generated suggestion (SopStepData.agentizationSuggestion).
 * Deliberately a separate table from AI_APPLICATION_MODES — a suggestion is not a
 * member decision, so its badge must never look identical to the "지정됨"/"확정됨"
 * member-confirmed indicators used elsewhere in this panel.
 */
export const AGENTIZATION_SUGGESTION_META: Record<SopAgentizationSuggestionType, { label: string; badgeClass: string }> = {
    'agent-candidate': { label: 'AI 제안: AI Agent 후보', badgeClass: 'border-violet-200 bg-violet-50 text-violet-700' },
    'ai-assist': { label: 'AI 제안: AI 지원', badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
    'not-recommended': { label: 'AI 제안: 권장 안 함', badgeClass: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
};

/** A suggestion pre-fills the member's select value — it never writes stepModes itself. 'not-recommended' has no member-mode analog, so it maps to unset (human-performed). */
export function mapSuggestionToApplicationMode(type: SopAgentizationSuggestionType): SopAiApplicationMode | undefined {
    if (type === 'agent-candidate') return 'automation';
    if (type === 'ai-assist') return 'assist';
    return undefined;
}

/**
 * Keeps existing browser-persisted reviews readable after reducing the old
 * five-way taxonomy. "Human-only" becomes the natural unset state.
 */
export function normalizeAgentizationMode(value: unknown): SopAiApplicationMode | undefined {
    if (value === 'automation') return 'automation';
    if (value === 'assist' || value === 'human-review' || value === 'collaboration') return 'assist';
    return undefined;
}

/**
 * Reads the authoritative per-step judgement only. `defaultMode` is a batch-entry
 * convenience that is written into `stepModes` at the moment it is applied
 * (see `withAgentizationDefaultMode`) — it is never consulted as a fallback here,
 * so an unset step reads as unset even if a batch default was chosen earlier.
 */
export function getAgentizationModeForStep(document: SopDocument, stepId: string): SopAiApplicationMode | undefined {
    const review = document.agentizationReview;
    if (!review) return undefined;
    const step = document.steps.find((item) => item.id === stepId);
    if (!step || step.terminalType === 'start' || step.terminalType === 'end') return undefined;
    const isInScope = review.scope === 'workflow' || review.stepIds.includes(stepId);
    if (!isInScope) return undefined;
    return normalizeAgentizationMode(review.stepModes?.[stepId]);
}

export function getAgentizationModeMeta(mode: SopAiApplicationMode | undefined) {
    return AI_APPLICATION_MODES.find((item) => item.id === mode);
}

/** Terminal (start/end) steps are never Agent화 candidates. */
export function getAgentizableSopStepIds(document: SopDocument | null): string[] {
    return (document?.steps || [])
        .filter((step) => step.terminalType !== 'start' && step.terminalType !== 'end')
        .map((step) => step.id);
}

/** Any meaningful document edit calls this to invalidate a previously confirmed review. */
export function resetAgentizationConfirmation(document: SopDocument): SopAgentizationReview | undefined {
    return document.agentizationReview
        ? { ...document.agentizationReview, confirmedAt: undefined }
        : undefined;
}

export function normalizeAgentizationReview(
    document: SopDocument,
    review: SopAgentizationReview | undefined,
    fallbackScope: SopAgentizationScope = 'steps'
): SopAgentizationReview {
    const eligibleIds = getAgentizableSopStepIds(document);
    const rawReview = readLegacyAgentizationReviewFields(review);
    const rawStepModes = rawReview.stepModes || {};
    const stepModes = Object.fromEntries(
        Object.entries(rawStepModes)
            .map(([id, value]) => [id, normalizeAgentizationMode(value)] as const)
            .filter((entry): entry is [string, SopAiApplicationMode] => Boolean(entry[1]))
    );
    const legacyHumanOnly = rawReview.mode === 'human-only'
        && Object.values(rawStepModes).every((value) => normalizeAgentizationMode(value) === undefined);
    const scope = legacyHumanOnly ? 'steps' : (review?.scope || fallbackScope);
    const excludedLegacyHumanOnlyIds = new Set(
        Object.entries(rawStepModes)
            .filter(([, value]) => value === 'human-only')
            .map(([id]) => id)
    );
    const stepIds = (scope === 'workflow' ? eligibleIds : review?.stepIds || [])
        .filter((id) => eligibleIds.includes(id) && !excludedLegacyHumanOnlyIds.has(id));
    // `legacyMode` is the pre-stepModes scalar persisted format; migrating it into
    // explicit per-step values is a one-time data-shape upgrade, so it is only
    // consulted when stepModes is genuinely absent (not yet normalized). `mode` is
    // dropped from the returned shape below, so this migration cannot re-fire once
    // a document has been normalized. `defaultMode` (the live batch-assign value)
    // is never used to repopulate stepModes here — a member clearing every step's
    // mode must leave the review actually empty, not resurrect the old batch value.
    const legacyMode = normalizeAgentizationMode(rawReview.mode);
    if (legacyMode && Object.keys(stepModes).length === 0) {
        stepIds.forEach((id) => { stepModes[id] = legacyMode; });
    }
    const defaultMode = normalizeAgentizationMode(rawReview.defaultMode) || legacyMode;
    return { scope, stepIds, defaultMode, stepModes, note: review?.note || '', confirmedAt: review?.confirmedAt };
}

/**
 * Pure builders for each Agent화 review action. Each takes the current document and
 * returns the next `SopAgentizationReview` (or `null` for a no-op, e.g. an ineligible
 * stepId). The store wraps these with its customerReviewMode guard, history push, and
 * `set()` — it does not compute the review shape itself.
 */
export function withAgentizationScope(document: SopDocument, scope: SopAgentizationScope): SopAgentizationReview {
    const eligibleIds = getAgentizableSopStepIds(document);
    const current = normalizeAgentizationReview(document, document.agentizationReview, scope);
    const stepIds = scope === 'workflow'
        ? eligibleIds
        : current.scope === 'steps'
          ? current.stepIds.filter((id) => eligibleIds.includes(id))
          : [];
    return { ...current, scope, stepIds, confirmedAt: undefined };
}

export function withAgentizationDefaultMode(document: SopDocument, mode: SopAiApplicationMode): SopAgentizationReview {
    const current = normalizeAgentizationReview(document, document.agentizationReview, 'workflow');
    const targetIds = current.scope === 'workflow'
        ? getAgentizableSopStepIds(document)
        : current.stepIds;
    return {
        ...current,
        stepIds: targetIds,
        defaultMode: mode,
        stepModes: { ...current.stepModes, ...Object.fromEntries(targetIds.map((id) => [id, mode])) },
        confirmedAt: undefined,
    };
}

export function withAgentizationStepMode(document: SopDocument, stepId: string, mode: SopAiApplicationMode | undefined): SopAgentizationReview | null {
    if (!getAgentizableSopStepIds(document).includes(stepId)) return null;
    const current = normalizeAgentizationReview(document, document.agentizationReview, 'steps');
    const stepIds = current.scope === 'workflow'
        ? getAgentizableSopStepIds(document)
        : Array.from(new Set([...current.stepIds, stepId]));
    // An unset mode clears the key entirely (unset = human-performed) rather than
    // storing a placeholder value inside SopAiApplicationMode's type.
    const stepModes = { ...current.stepModes };
    if (mode) {
        stepModes[stepId] = mode;
    } else {
        delete stepModes[stepId];
    }
    return { ...current, stepIds, stepModes, confirmedAt: undefined };
}

export function withToggledAgentizationStep(document: SopDocument, stepId: string): SopAgentizationReview | null {
    if (!getAgentizableSopStepIds(document).includes(stepId)) return null;
    const current = normalizeAgentizationReview(document, document.agentizationReview, 'steps');
    const stepIds = current.scope === 'workflow'
        ? [stepId]
        : current.stepIds.includes(stepId)
          ? current.stepIds.filter((id) => id !== stepId)
          : [...current.stepIds, stepId];
    return {
        ...current,
        scope: 'steps',
        stepIds,
        stepModes: Object.fromEntries(Object.entries(current.stepModes).filter(([id]) => stepIds.includes(id))),
        confirmedAt: undefined,
    };
}

export function withAgentizationNote(document: SopDocument, note: string): SopAgentizationReview {
    const current = normalizeAgentizationReview(document, document.agentizationReview, 'steps');
    return { ...current, note, confirmedAt: undefined };
}

export function confirmAgentizationReview(document: SopDocument): { success: boolean; message: string; review?: SopAgentizationReview } {
    const current = normalizeAgentizationReview(document, document.agentizationReview, 'steps');
    const eligibleIds = getAgentizableSopStepIds(document);
    const stepIds = current.scope === 'workflow'
        ? eligibleIds
        : current.stepIds.filter((id) => eligibleIds.includes(id));
    if (stepIds.length === 0) {
        return { success: false, message: 'Agent화 검토 대상 단계를 하나 이상 선택해 주세요.' };
    }
    if (stepIds.some((id) => !current.stepModes[id])) {
        return { success: false, message: '선택한 각 단계에 AI 적용 방식을 지정해 주세요.' };
    }
    const confirmedAt = new Date().toISOString();
    return { success: true, message: 'Agent화 검토 결과를 확정했습니다.', review: { ...current, stepIds, confirmedAt } };
}
