import type { SopReviewStatus } from './sop-types';

/**
 * Shared badge styling for a document-level review status pill. Used wherever
 * the SOP's overall reviewStatus is shown as a passive label (not a button
 * that changes it, which intentionally uses its own actionable styling).
 */
export const SOP_REVIEW_STATUS_BADGE_CLASS: Record<SopReviewStatus, string> = {
    confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    reviewed: 'bg-blue-100 text-blue-800 border border-blue-300',
    'ai-draft': 'bg-amber-100 text-amber-800 border border-amber-300',
};
