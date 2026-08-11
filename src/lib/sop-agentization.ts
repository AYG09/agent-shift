import type { SopAiApplicationMode, SopDocument } from './sop-types';

export const AI_APPLICATION_MODES: Array<{ id: SopAiApplicationMode; label: string; shortLabel: string; detail: string; badgeClass: string }> = [
    { id: 'automation', label: 'AI Agent 후보', shortLabel: 'AI Agent', detail: '정해진 규칙 안에서 AI가 단계 실행을 주도', badgeClass: 'border-violet-300 bg-violet-50 text-violet-800' },
    { id: 'assist', label: 'AI 지원', shortLabel: 'AI 지원', detail: '사람이 수행하고 AI가 초안·검색·분석을 지원', badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-800' },
];

/**
 * Keeps existing browser-persisted reviews readable after reducing the old
 * five-way taxonomy. "Human-only" becomes the natural unset state.
 */
export function normalizeAgentizationMode(value: unknown): SopAiApplicationMode | undefined {
    if (value === 'automation') return 'automation';
    if (value === 'assist' || value === 'human-review' || value === 'collaboration') return 'assist';
    return undefined;
}

export function getAgentizationModeForStep(document: SopDocument, stepId: string): SopAiApplicationMode | undefined {
    const review = document.agentizationReview;
    if (!review) return undefined;
    const step = document.steps.find((item) => item.id === stepId);
    if (!step || step.terminalType === 'start' || step.terminalType === 'end') return undefined;
    const isInScope = review.scope === 'workflow' || review.stepIds.includes(stepId);
    if (!isInScope) return undefined;
    return normalizeAgentizationMode(review.stepModes?.[stepId])
        || normalizeAgentizationMode(review.defaultMode)
        || normalizeAgentizationMode(review.mode);
}

export function getAgentizationModeMeta(mode: SopAiApplicationMode | undefined) {
    return AI_APPLICATION_MODES.find((item) => item.id === mode);
}
