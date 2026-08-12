import type { SopEdge } from './sop-types';

/**
 * Shared branch-type option list for the edge inspector. A decision step's
 * outgoing edges may never be 'default' (validateSopDecisionBranches requires
 * yes/no/condition on every one), so the 'default' option is appended only for
 * non-decision sources instead of being duplicated in a second literal array.
 */
export const SOP_DECISION_BRANCH_TYPE_OPTIONS: Array<{ id: Exclude<SopEdge['branchType'], 'default' | undefined>; label: string }> = [
    { id: 'yes', label: 'YES (통과)' },
    { id: 'no', label: 'NO (반려/미통과)' },
    { id: 'condition', label: '조건 분기/재작업' },
];

export const SOP_DEFAULT_BRANCH_TYPE_OPTION: { id: 'default'; label: string } = { id: 'default', label: '일반 순차 연결' };
