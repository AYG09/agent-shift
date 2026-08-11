import type { SopAiApplicationMode, SopDocument } from './sop-types';

export const AI_APPLICATION_MODES: Array<{ id: SopAiApplicationMode; label: string; shortLabel: string; detail: string; badgeClass: string }> = [
    { id: 'automation', label: 'AI 대체 가능', shortLabel: 'AI 대체', detail: '반복 실행을 AI가 수행', badgeClass: 'border-violet-300 bg-violet-50 text-violet-800' },
    { id: 'human-review', label: 'AI 수행 후 사람 확인', shortLabel: 'AI+검토', detail: 'AI 결과를 사람이 최종 검토', badgeClass: 'border-amber-300 bg-amber-50 text-amber-800' },
    { id: 'collaboration', label: '사람–AI 협업', shortLabel: 'AI 협업', detail: '업무를 나누어 함께 수행', badgeClass: 'border-sky-300 bg-sky-50 text-sky-800' },
    { id: 'assist', label: '사람 중심·AI 지원', shortLabel: 'AI 지원', detail: '초안·분석 등 보조 역할', badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-800' },
    { id: 'human-only', label: '사람 수행 필수', shortLabel: '사람 수행', detail: '판단·승인은 사람 책임', badgeClass: 'border-zinc-300 bg-zinc-50 text-zinc-700' },
];

export function getAgentizationModeForStep(document: SopDocument, stepId: string): SopAiApplicationMode | undefined {
    const review = document.agentizationReview;
    if (!review) return undefined;
    const step = document.steps.find((item) => item.id === stepId);
    if (!step || step.terminalType === 'start' || step.terminalType === 'end') return undefined;
    const isInScope = review.scope === 'workflow' || review.stepIds.includes(stepId);
    if (!isInScope) return undefined;
    return review.stepModes?.[stepId] || review.defaultMode || review.mode;
}

export function getAgentizationModeMeta(mode: SopAiApplicationMode | undefined) {
    return AI_APPLICATION_MODES.find((item) => item.id === mode);
}
