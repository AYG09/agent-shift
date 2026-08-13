import type { SopDetailLevel } from './sop-setup-validation';

/**
 * How much headroom above `activityCount` the Task-wide Activity–Sub Action
 * generation request gets for `maxSteps`, keyed by detail level.
 *
 * PROTOTYPE IMPLEMENTATION ASSUMPTION — not a customer-confirmed ratio. The
 * customer has not specified how many Sub Actions an Activity may have (see
 * member-home-subaction-contract.md §3). These multipliers only need to give
 * the AI real room to split an Activity into more than one Sub Action when the
 * content genuinely calls for it; they must never be presented as a confirmed
 * business rule.
 */
export const SUB_ACTION_CAPACITY_MULTIPLIER: Record<SopDetailLevel, number> = {
    simple: 1.2,
    standard: 1.5,
    detailed: 2,
};

/**
 * Node overhead (start/end/typical decision-branch/loop-limit nodes) added on
 * top of `maxSteps` when deriving `maxTotalNodes`. Also a prototype assumption.
 */
export const SUB_ACTION_NODE_OVERHEAD = 4;

export interface SubActionCapacityInput {
    activityCount: number;
    minSteps: number;
    maxSteps: number;
    maxTotalNodes?: number;
    detailLevel: SopDetailLevel;
}

export interface SubActionCapacityResult {
    minSteps: number;
    maxSteps: number;
    maxTotalNodes: number;
    adjusted: boolean;
    explanation: string | null;
}

/**
 * Computes the minSteps/maxSteps/maxTotalNodes actually sent with a Task-wide
 * Activity–Sub Action generation request (Gate → request body → prompt →
 * post-processing validation all read the SAME three numbers this returns —
 * there is exactly one place capacity is decided).
 *
 * `minSteps` is raised only as far as needed for every Activity to be covered
 * at least once. `maxSteps` is raised SEPARATELY, with real headroom above
 * `activityCount` (see SUB_ACTION_CAPACITY_MULTIPLIER) — it must never
 * collapse to the same value as `minSteps` purely because of Activity count,
 * or the AI is silently forced into exactly one Sub Action per Activity,
 * which the customer has never confirmed as a rule.
 */
export function computeSubActionCapacity(input: SubActionCapacityInput): SubActionCapacityResult {
    const { activityCount, minSteps, maxSteps, maxTotalNodes, detailLevel } = input;
    const effectiveMinSteps = Math.max(minSteps, activityCount);

    const multiplier = SUB_ACTION_CAPACITY_MULTIPLIER[detailLevel] ?? SUB_ACTION_CAPACITY_MULTIPLIER.standard;
    const headroomMaxSteps = Math.max(maxSteps, Math.ceil(activityCount * multiplier));
    const effectiveMaxSteps = Math.max(headroomMaxSteps, effectiveMinSteps);

    const baselineMaxTotalNodes = maxTotalNodes ?? 15;
    const effectiveMaxTotalNodes = Math.max(baselineMaxTotalNodes, effectiveMaxSteps + SUB_ACTION_NODE_OVERHEAD);

    const adjusted = effectiveMinSteps !== minSteps || effectiveMaxSteps !== maxSteps || effectiveMaxTotalNodes !== baselineMaxTotalNodes;
    const explanation = adjusted
        ? `선택 Task의 Activity가 ${activityCount}개입니다. 모든 Activity를 최소 1회 반영하면서 Activity당 여러 Sub Action을 만들 여유도 두기 위해, 이번 생성 요청의 주요 단계 범위를 ${effectiveMinSteps}~${effectiveMaxSteps}개(전체 노드 상한 ${effectiveMaxTotalNodes}개)로 자동 확장했습니다. 화면에 표시된 설정값 자체는 바뀌지 않았습니다. Activity당 정확한 Sub Action 개수는 고객이 확정한 값이 아니며, 위 확장 범위는 프로토타입 구현 가정입니다.`
        : null;

    return { minSteps: effectiveMinSteps, maxSteps: effectiveMaxSteps, maxTotalNodes: effectiveMaxTotalNodes, adjusted, explanation };
}
