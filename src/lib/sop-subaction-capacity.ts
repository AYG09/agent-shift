import type { SopDetailLevel } from './sop-setup-validation';

/**
 * Per-Activity Sub Action decomposition floor: every Activity is expected to
 * decompose into AT LEAST this many Sub Actions by default. Confirmed project
 * direction (2026-08 방향 지시 + subaction-semantics-contract.md §4·§5의 "기본
 * 2단계" 규칙): a node is a Sub Action, never a 1:1 Activity copy, so a
 * 14-Activity Task must produce roughly 28~42 business nodes by default. A
 * single genuinely-atomic Activity may still end up with 1 Sub Action at the
 * margin (the semantic contract forbids force-splitting unified actions) —
 * that exception is handled as a generation-time repair/warning, not by
 * lowering this capacity floor.
 */
export const SUB_ACTION_PER_ACTIVITY_MIN = 2;

/**
 * How much headroom above `activityCount` the Task-wide Activity–Sub Action
 * generation request gets for `maxSteps`, keyed by detail level. With the
 * per-Activity floor of 2, these give the AI room for the "기본 2~3개 +
 * 예외적으로 그 이상" band: 14 Activities → max 35 (simple) / 42 (standard)
 * / 49 (detailed).
 */
export const SUB_ACTION_CAPACITY_MULTIPLIER: Record<SopDetailLevel, number> = {
    simple: 2.5,
    standard: 3,
    detailed: 3.5,
};

/**
 * Node overhead (start/end/decision-branch/loop-limit nodes) added on top of
 * `maxSteps` when deriving `maxTotalNodes`. Sized for the larger Sub Action
 * graphs the per-Activity floor produces.
 */
export const SUB_ACTION_NODE_OVERHEAD = 6;

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
 * there is exactly one place capacity is decided; the SERVER re-applies this
 * same function in the generateSop route so a stale client can never shrink
 * the floor).
 *
 * `minSteps` is floored at `SUB_ACTION_PER_ACTIVITY_MIN × activityCount` so
 * the default expectation of 2+ Sub Actions per Activity is structurally
 * enforced (총 단계 수 기준). `maxSteps` is raised SEPARATELY with real
 * headroom above that floor (see SUB_ACTION_CAPACITY_MULTIPLIER) — it must
 * never collapse to the same value as `minSteps`, or the AI is silently
 * forced into a fixed per-Activity count.
 */
export function computeSubActionCapacity(input: SubActionCapacityInput): SubActionCapacityResult {
    const { activityCount, minSteps, maxSteps, maxTotalNodes, detailLevel } = input;
    const effectiveMinSteps = Math.max(minSteps, activityCount * SUB_ACTION_PER_ACTIVITY_MIN);

    const multiplier = SUB_ACTION_CAPACITY_MULTIPLIER[detailLevel] ?? SUB_ACTION_CAPACITY_MULTIPLIER.standard;
    const headroomMaxSteps = Math.max(maxSteps, Math.ceil(activityCount * multiplier));
    const effectiveMaxSteps = Math.max(headroomMaxSteps, effectiveMinSteps + 1);

    const baselineMaxTotalNodes = maxTotalNodes ?? 15;
    const effectiveMaxTotalNodes = Math.max(baselineMaxTotalNodes, effectiveMaxSteps + SUB_ACTION_NODE_OVERHEAD);

    const adjusted = effectiveMinSteps !== minSteps || effectiveMaxSteps !== maxSteps || effectiveMaxTotalNodes !== baselineMaxTotalNodes;
    const explanation = adjusted
        ? `선택 Task의 Activity가 ${activityCount}개입니다. 각 Activity를 기본 2~3개의 Sub Action으로 분해하는 것을 전제로, 이번 생성 요청의 주요 단계 범위를 ${effectiveMinSteps}~${effectiveMaxSteps}개(전체 노드 상한 ${effectiveMaxTotalNodes}개)로 자동 확장했습니다. 화면에 표시된 설정값 자체는 바뀌지 않았습니다. 하나의 통합 행동으로만 성립하는 Activity는 예외적으로 더 적게 분해될 수 있습니다.`
        : null;

    return { minSteps: effectiveMinSteps, maxSteps: effectiveMaxSteps, maxTotalNodes: effectiveMaxTotalNodes, adjusted, explanation };
}
