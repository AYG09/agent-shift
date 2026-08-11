/**
 * 그래프 수준 의미 검증 + 결정론적 repair.
 *
 * 가벼운 모델(Gemini 3.5 Flash-Lite 등)의 구조적 실수를 코드로 보완하기 위한 모듈이다.
 * 여기 있는 함수들은 모두 순수 함수이며 LLM을 호출하지 않는다 - 실제 LLM 재요청(1회 repair)은
 * 이 모듈이 만든 이슈 목록을 프롬프트로 변환해 route.ts에서 수행한다.
 */

export type EdgeBranchType = 'yes' | 'no' | 'condition' | 'default';

export interface ValidatableNode {
    id: string;
    type?: string;
    terminalType?: 'start' | 'end';
    shape?: string;
}

export interface ValidatableEdge {
    id?: string;
    source: string;
    target: string;
    branchType?: EdgeBranchType;
    label?: string;
    condition?: string;
}

export type GraphIssueType =
    | 'decision-insufficient-edges'
    | 'decision-missing-yes-no'
    | 'orphan-node'
    | 'dangling-edge'
    | 'unbounded-cycle'
    | 'invalid-start-incoming'
    | 'invalid-end-outgoing'
    | 'terminal-missing-type'
    | 'missing-start-node'
    | 'multiple-start-nodes'
    | 'missing-end-node'
    | 'multiple-end-nodes'
    // SOP 전용 연결성 검증 (validateSopGraph)
    | 'duplicate-node-id'
    | 'duplicate-edge-id'
    | 'unreachable-from-start'
    | 'cannot-reach-end'
    // SOP 전용 decision 분기 유형 검증 (validateSopDecisionBranches)
    | 'decision-untyped-branch'
    | 'decision-invalid-binary-branches'
    | 'decision-duplicate-branch-type'
    | 'decision-condition-missing'
    | 'decision-duplicate-condition'
    // SOP 전용 구조 제약 검증 (validateSopStructuralConstraints)
    | 'step-count-out-of-range'
    | 'total-node-limit-exceeded'
    | 'decision-not-allowed'
    | 'decision-limit-exceeded'
    | 'rework-not-allowed'
    | 'loop-limit-exceeded';

export interface GraphValidationIssue {
    type: GraphIssueType;
    nodeId?: string;
    message: string;
}

export interface CycleInfo {
    nodeIds: string[];
    edges: ValidatableEdge[];
}

/**
 * DFS 3색(white/gray/black) 사이클 탐지 - 각 노드는 정확히 한 번만 완전 방문되므로
 * 순환 edge가 아무리 많아도 무한 재귀 없이 항상 종료한다.
 *
 * export된 이유: validateSopStructuralConstraints()가 "재작업 루프 개수"를 셀 때
 * 재사용한다 (SOP에서 순환 = 재작업/되돌아가기 경로).
 */
export function findCycles(nodeIds: string[], edges: ValidatableEdge[]): CycleInfo[] {
    const adj = new Map<string, ValidatableEdge[]>();
    nodeIds.forEach((id) => adj.set(id, []));
    edges.forEach((e) => adj.get(e.source)?.push(e));

    const color = new Map<string, 0 | 1 | 2>();
    nodeIds.forEach((id) => color.set(id, 0));
    const stack: string[] = [];
    const edgeStack: ValidatableEdge[] = [];
    const cycles: CycleInfo[] = [];

    function dfs(nodeId: string) {
        color.set(nodeId, 1);
        stack.push(nodeId);
        for (const e of adj.get(nodeId) || []) {
            const targetColor = color.get(e.target);
            if (targetColor === 1) {
                const idx = stack.indexOf(e.target);
                if (idx !== -1) {
                    cycles.push({
                        nodeIds: stack.slice(idx),
                        edges: [...edgeStack.slice(idx), e],
                    });
                }
            } else if (targetColor === 0) {
                edgeStack.push(e);
                dfs(e.target);
                edgeStack.pop();
            }
        }
        color.set(nodeId, 2);
        stack.pop();
    }

    for (const id of nodeIds) {
        if (color.get(id) === 0) dfs(id);
    }
    return cycles;
}

/** source -> target(또는 반대) 인접 리스트를 만든다. 배열 순서에 의존하지 않는 순수 그래프 구조 함수. */
function buildAdjacency(edges: ValidatableEdge[], direction: 'forward' | 'backward'): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
        const from = direction === 'forward' ? e.source : e.target;
        const to = direction === 'forward' ? e.target : e.source;
        if (!adj.has(from)) adj.set(from, []);
        adj.get(from)!.push(to);
    }
    return adj;
}

/** startId에서 BFS로 도달 가능한 모든 노드 id 집합을 구한다 (startId 자신 포함). */
function bfsReachableSet(startId: string, adj: Map<string, string[]>): Set<string> {
    const visited = new Set<string>([startId]);
    const queue: string[] = [startId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of adj.get(current) || []) {
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }
    return visited;
}

/**
 * 시작 노드로부터 각 노드까지의 최단 hop 수(BFS 레벨)를 구한다.
 *
 * findReworkEdges()가 "되돌아가는 edge"를 판별하는 기준으로 쓴다. DFS 스택 기반 back-edge
 * 판정(findCycles)과 달리, BFS 레벨은 노드/엣지 배열의 순회 순서가 아니라 그래프 구조(엣지
 * 집합) 그 자체로만 결정되므로, 배열 순서를 바꿔도 항상 같은 결과가 나온다.
 */
function computeBfsLevels(startId: string, edges: ValidatableEdge[]): Map<string, number> {
    const adj = buildAdjacency(edges, 'forward');
    const levels = new Map<string, number>([[startId, 0]]);
    const queue: string[] = [startId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLevel = levels.get(current)!;
        for (const next of adj.get(current) || []) {
            if (!levels.has(next)) {
                levels.set(next, currentLevel + 1);
                queue.push(next);
            }
        }
    }
    return levels;
}

/**
 * "재작업(되돌아가는) edge" 목록 - "재작업 루프 수"의 유일한 계산 기준.
 *
 * target의 BFS 레벨이 source의 BFS 레벨보다 크지 않은(같거나 작은) edge를 "되돌아가는 edge"로
 * 정의한다. 이 정의는 노드/엣지 배열의 순서와 무관하게 그래프 구조만으로 결정되므로, 배열
 * 순서를 바꿔도 항상 동일한 결과를 낸다(findCycles의 DFS gray-스택 판정은 방문 순서에 따라
 * 같은 그래프에서도 다른 back-edge 집합을 고를 수 있어 카운트 용도로는 쓰지 않는다).
 *
 * validateSopStructuralConstraints(maxLoops 강제)와 SopGenerationSettings의 UI 설명("정적
 * 그래프 안에 존재하는 이전 단계로 되돌아가는 재작업 경로의 최대 개수")이 이 정의를 공유한다.
 */
export function findReworkEdges<E extends ValidatableEdge>(nodeIds: string[], edges: E[], startId?: string): E[] {
    const resolvedStart = startId && nodeIds.includes(startId) ? startId : nodeIds[0];
    if (resolvedStart === undefined) return [];
    const levels = computeBfsLevels(resolvedStart, edges);
    return edges.filter((e) => {
        const fromLevel = levels.get(e.source);
        const toLevel = levels.get(e.target);
        if (fromLevel === undefined || toLevel === undefined) return false;
        return toLevel <= fromLevel;
    });
}

/** yes/no/condition 중 하나이고, condition 타입이면 비어있지 않은 condition 설명까지 있는 "제대로 타입이 지정된" 분기 edge인지. */
function isTypedBranchEdge(e: ValidatableEdge): boolean {
    if (e.branchType === 'yes' || e.branchType === 'no') return true;
    if (e.branchType === 'condition') return !!e.condition?.trim();
    return false;
}

/**
 * SOP 전용 재작업 순환 검증 - 조건 없는(라벨만 있거나 branchType='default'인) 순환을
 * "정상 재작업 루프"로 오인하지 않는다.
 *
 * 다음 중 하나를 충족해야 정상으로 인정한다:
 * 1) 순환 구간에 shape='loopLimit' 노드가 존재
 * 2) 순환을 닫는(되돌아가는) edge 자체가 yes/no/condition 중 하나이고, condition이면 비어있지
 *    않은 조건 설명이 있음
 * 3) 순환 안의 어떤 노드에서든, 순환 밖으로 나가는 제대로 타입이 지정된(yes/no/condition) 분기가 존재
 *
 * 이 세 조건을 모두 만족하지 못하면(예: branchType='default'나 단순 label만 있는 되돌아가기)
 * unbounded-cycle로 차단한다. /flow에서 쓰는 validateFlowGraph()의 순환 판정(label/branchType만
 * 있으면 통과)은 그대로 두고, SOP 워크스페이스(validateSopGraph)에서만 이 더 엄격한 규칙을 쓴다.
 */
export function validateSopReworkCycles(
    nodes: ValidatableNode[],
    edges: ValidatableEdge[]
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = [];
    const nodeIds = nodes.map((n) => n.id);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const cycles = findCycles(nodeIds, edges);

    for (const cycle of cycles) {
        const cycleNodeSet = new Set(cycle.nodeIds);
        const hasLoopLimitNode = cycle.nodeIds.some((id) => nodeById.get(id)?.shape === 'loopLimit');

        // findCycles가 채우는 cycle.edges의 마지막 원소가 항상 "순환을 닫는(되돌아가는)" 그 edge다.
        const closingEdge = cycle.edges[cycle.edges.length - 1];
        const hasTypedClosingEdge = !!closingEdge && isTypedBranchEdge(closingEdge);

        const hasExplicitExit = edges.some(
            (e) => cycleNodeSet.has(e.source) && !cycleNodeSet.has(e.target) && isTypedBranchEdge(e)
        );

        if (!hasLoopLimitNode && !hasTypedClosingEdge && !hasExplicitExit) {
            issues.push({
                type: 'unbounded-cycle',
                message: `재작업 순환 경로(${cycle.nodeIds.join(' -> ')})에 종료 조건이 없습니다. loopLimit 도형, 조건(yes/no/condition + 비어있지 않은 condition)이 있는 되돌아가는 edge, 또는 순환을 벗어나 종료 노드로 가는 명시적 분기 중 하나가 필요합니다 (단순 label이나 branchType='default'만으로는 재작업 루프로 인정되지 않습니다).`,
            });
        }
    }

    return issues;
}

/**
 * 그래프(노드+엣지) 수준 의미 검증.
 *
 * - decision 노드는 서로 다른 target을 가진 outgoing edge가 2개 이상이어야 한다
 * - outgoing이 정확히 2개(이진 판단)면 branchType='yes'/'no'가 각각 하나씩 있어야 한다
 * - edge가 없는 고립 노드, 시작/종료 노드 방향 오류, dangling edge를 잡아낸다
 * - 순환이 있어도 branchType/label이 있거나 loopLimit 도형이 포함되면 의도된 것으로 간주한다
 *   (그 외의 "설명 없는" 순환만 이슈로 보고한다)
 */
export function validateFlowGraph(
    nodes: ValidatableNode[],
    edges: ValidatableEdge[]
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = [];
    const nodeIds = new Set(nodes.map((n) => n.id));

    const validEdges: ValidatableEdge[] = [];
    for (const e of edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
            issues.push({
                type: 'dangling-edge',
                message: `엣지(${e.source} -> ${e.target})가 존재하지 않는 노드를 참조합니다.`,
            });
        } else {
            validEdges.push(e);
        }
    }

    const outgoing = new Map<string, ValidatableEdge[]>();
    const incoming = new Map<string, ValidatableEdge[]>();
    nodes.forEach((n) => {
        outgoing.set(n.id, []);
        incoming.set(n.id, []);
    });
    validEdges.forEach((e) => {
        outgoing.get(e.source)?.push(e);
        incoming.get(e.target)?.push(e);
    });

    for (const n of nodes) {
        if (n.type !== 'decision') continue;
        const out = outgoing.get(n.id) || [];
        const distinctTargets = new Set(out.map((e) => e.target));

        if (distinctTargets.size < 2) {
            issues.push({
                type: 'decision-insufficient-edges',
                nodeId: n.id,
                message: `decision 노드 "${n.id}"는 서로 다른 target을 가진 outgoing edge가 2개 이상이어야 합니다 (현재 서로 다른 target ${distinctTargets.size}개).`,
            });
            continue;
        }

        if (out.length === 2) {
            const branchTypes = out.map((e) => e.branchType);
            if (!branchTypes.includes('yes') || !branchTypes.includes('no')) {
                issues.push({
                    type: 'decision-missing-yes-no',
                    nodeId: n.id,
                    message: `decision 노드 "${n.id}"의 outgoing edge 2개에는 branchType='yes'와 'no'가 각각 하나씩 있어야 합니다.`,
                });
            }
        }
    }

    if (nodes.length > 1) {
        for (const n of nodes) {
            const inCount = (incoming.get(n.id) || []).length;
            const outCount = (outgoing.get(n.id) || []).length;
            const isStart = n.type === 'terminal' && n.terminalType === 'start';
            const isEnd = n.type === 'terminal' && n.terminalType === 'end';

            if (inCount === 0 && outCount === 0) {
                issues.push({
                    type: 'orphan-node',
                    nodeId: n.id,
                    message: `노드 "${n.id}"에 연결된 edge가 없습니다.`,
                });
            } else if (isStart && outCount === 0) {
                issues.push({
                    type: 'orphan-node',
                    nodeId: n.id,
                    message: `시작 노드 "${n.id}"에 나가는 edge가 없습니다.`,
                });
            } else if (isEnd && inCount === 0) {
                issues.push({
                    type: 'orphan-node',
                    nodeId: n.id,
                    message: `종료 노드 "${n.id}"에 들어오는 edge가 없습니다.`,
                });
            }
        }
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const e of validEdges) {
        const targetNode = nodeById.get(e.target);
        if (targetNode?.type === 'terminal' && targetNode.terminalType === 'start') {
            issues.push({
                type: 'invalid-start-incoming',
                nodeId: targetNode.id,
                message: `시작 노드 "${targetNode.id}"로 들어오는 edge가 있습니다 (source: ${e.source}).`,
            });
        }
        const sourceNode = nodeById.get(e.source);
        if (sourceNode?.type === 'terminal' && sourceNode.terminalType === 'end') {
            issues.push({
                type: 'invalid-end-outgoing',
                nodeId: sourceNode.id,
                message: `종료 노드 "${sourceNode.id}"에서 나가는 edge가 있습니다 (target: ${e.target}).`,
            });
        }
    }

    const cycles = findCycles(Array.from(nodeIds), validEdges);
    for (const cycle of cycles) {
        const hasLabeledBranch = cycle.edges.some((e) => !!e.branchType || !!e.label);
        const hasLoopLimitNode = cycle.nodeIds.some((id) => nodeById.get(id)?.shape === 'loopLimit');
        if (!hasLabeledBranch && !hasLoopLimitNode) {
            issues.push({
                type: 'unbounded-cycle',
                message: `순환 경로(${cycle.nodeIds.join(' -> ')})에 종료 조건(branchType/label)이나 loopLimit 도형이 없습니다.`,
            });
        }
    }

    return issues;
}

/** 반복 재시도를 유발하는 판단형 이슈만 남기고, 정보성 이슈(orphan 등)는 제외한다. */
export function hasBlockingIssues(issues: GraphValidationIssue[]): boolean {
    return issues.some(
        (i) =>
            i.type === 'decision-insufficient-edges' ||
            i.type === 'decision-missing-yes-no' ||
            i.type === 'unbounded-cycle' ||
            i.type === 'invalid-start-incoming' ||
            i.type === 'invalid-end-outgoing'
    );
}

/** LLM에게 보낼 한국어 repair 지시문을 생성한다 (최대 1회 재시도용). */
export function buildRepairInstruction(issues: GraphValidationIssue[]): string {
    const lines = issues.map((i) => `- ${i.message}`).join('\n');
    return `## 이전 응답의 구조적 오류 - 반드시 모두 수정하세요\n${lines}\n\n위 문제를 모두 해결한 완전한 JSON을 다시 생성하세요. 기존에 잘 만들어진 부분(정상 노드, 정상 edge)은 그대로 유지하고, 지적된 부분만 고치세요.`;
}

// ----------------------------------------------------------------------------
// 드릴다운 subEdges 검증
// ----------------------------------------------------------------------------

export interface DrilldownStepLike {
    id: string;
    type?: string;
}

export interface DrilldownSubEdgeLike {
    source: string;
    target: string;
    branchType?: EdgeBranchType;
    label?: string;
}

/**
 * 드릴다운 subEdges 검증. 전체 그래프 validateFlowGraph와 달리, target이 subSteps id에
 * 없어도 "exit-marker"(상위 노드의 원래 다음 단계로 빠져나감)로 간주해 dangling으로 보지 않는다.
 *
 * decision이 포함되지 않은 subSteps는 검증하지 않는다(순차 fallback으로 충분).
 */
export function validateDrilldownBranching(
    subSteps: DrilldownStepLike[],
    subEdges: DrilldownSubEdgeLike[] | undefined
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = [];
    const hasDecision = subSteps.some((s) => s.type === 'decision');
    if (!hasDecision) return issues;

    if (!subEdges || subEdges.length === 0) {
        issues.push({
            type: 'decision-insufficient-edges',
            message: 'decision이 포함된 하위 단계 분해에 subEdges가 없습니다. YES/NO 분기를 subEdges로 명시하세요.',
        });
        return issues;
    }

    const stepIds = new Set(subSteps.map((s) => s.id));
    const outgoingByStep = new Map<string, DrilldownSubEdgeLike[]>();
    subSteps.forEach((s) => outgoingByStep.set(s.id, []));
    subEdges.forEach((e) => {
        if (stepIds.has(e.source)) outgoingByStep.get(e.source)?.push(e);
    });

    for (const step of subSteps) {
        if (step.type !== 'decision') continue;
        const out = outgoingByStep.get(step.id) || [];
        // internal(다른 subStep으로) 또는 exit-marker(상위 노드 밖으로) 각각을 서로 다른 분기로 센다
        const distinctKeys = new Set(
            out.map((e) =>
                stepIds.has(e.target) ? `internal:${e.target}` : `exit:${e.branchType || 'default'}:${e.label || ''}`
            )
        );
        if (distinctKeys.size < 2) {
            issues.push({
                type: 'decision-insufficient-edges',
                nodeId: step.id,
                message: `하위 decision 단계 "${step.id}"는 서로 다른 분기의 subEdges가 2개 이상이어야 합니다 (현재 ${distinctKeys.size}개).`,
            });
            continue;
        }
        if (out.length === 2) {
            const branchTypes = out.map((e) => e.branchType);
            if (!branchTypes.includes('yes') || !branchTypes.includes('no')) {
                issues.push({
                    type: 'decision-missing-yes-no',
                    nodeId: step.id,
                    message: `하위 decision 단계 "${step.id}"의 subEdges 2개에는 branchType='yes'와 'no'가 각각 하나씩 있어야 합니다.`,
                });
            }
        }
    }

    return issues;
}

export interface DeterministicFixResult<N, E> {
    nodes: N[];
    edges: E[];
    fixesApplied: string[];
}

/**
 * LLM 재시도로도 못 고친 구조적 결함에 대한 최종 안전망.
 *
 * - dangling edge(존재하지 않는 노드 참조)와 완전 중복 edge를 제거한다
 * - decision 노드가 여전히 outgoing edge를 2개 미만 가지면, 가장 가까운 predecessor(없으면
 *   시작 노드)로 되돌아가는 branchType='no' edge를 자동으로 추가해 "단일 분기 decision"이
 *   조용히 정상 결과처럼 보이지 않게 한다.
 *
 * 순수 함수이며 입력 배열을 변경하지 않는다.
 */
export function applyDeterministicGraphFixes<
    N extends ValidatableNode,
    E extends ValidatableEdge & { id: string },
>(nodes: N[], edges: E[]): DeterministicFixResult<N, E> {
    const fixesApplied: string[] = [];
    const nodeIds = new Set(nodes.map((n) => n.id));

    let cleanEdges = edges.filter((e) => {
        const ok = nodeIds.has(e.source) && nodeIds.has(e.target);
        if (!ok) fixesApplied.push(`dangling edge 제거: ${e.source} -> ${e.target}`);
        return ok;
    });

    const seenKeys = new Set<string>();
    cleanEdges = cleanEdges.filter((e) => {
        const key = `${e.source}::${e.target}::${e.branchType || ''}`;
        if (seenKeys.has(key)) {
            fixesApplied.push(`중복 edge 제거: ${e.source} -> ${e.target}`);
            return false;
        }
        seenKeys.add(key);
        return true;
    });

    const outgoingByNode = new Map<string, E[]>();
    const incomingByNode = new Map<string, E[]>();
    nodes.forEach((n) => {
        outgoingByNode.set(n.id, []);
        incomingByNode.set(n.id, []);
    });
    cleanEdges.forEach((e) => {
        outgoingByNode.get(e.source)?.push(e);
        incomingByNode.get(e.target)?.push(e);
    });

    const isStartTerminal = (id: string) => {
        const node = nodes.find((n) => n.id === id);
        return !!node && node.type === 'terminal' && node.terminalType === 'start';
    };

    for (const n of nodes) {
        if (n.type !== 'decision') continue;
        const out = outgoingByNode.get(n.id) || [];
        const distinctTargets = new Set(out.map((e) => e.target));
        if (distinctTargets.size >= 2) continue;

        // 시작 노드로 들어가는 edge는 그 자체로 또 다른 위반이므로 fallback 대상에서 제외한다.
        const predecessorId = (incomingByNode.get(n.id) || [])
            .map((e) => e.source)
            .find((id) => id !== n.id && !isStartTerminal(id));

        const fallbackTargetId = predecessorId;

        if (fallbackTargetId && !distinctTargets.has(fallbackTargetId)) {
            const fallbackEdge = {
                id: `${n.id}-fallback-no-${fallbackTargetId}`,
                source: n.id,
                target: fallbackTargetId,
                label: '조건 미충족',
                branchType: 'no' as const,
                condition: '자동 생성된 안전 fallback: 두 번째 분기가 생성되지 않아 이전 단계로 되돌아갑니다.',
            } as unknown as E;

            // 기존에 있던 유일한 outgoing edge가 branchType이 없다면, 새로 추가하는 NO와 짝을 맞춰
            // 'yes'로 승격시킨다 - 그래야 decision이 "단일 분기"였다는 사실이 fallback 이후에도
            // (branchType 짝이 안 맞는 형태로) 남아 있지 않고 완전히 해소된다.
            if (out.length === 1 && !out[0].branchType) {
                const upgraded = { ...out[0], branchType: 'yes' as const };
                cleanEdges = cleanEdges.map((e) => (e === out[0] ? upgraded : e));
            }

            cleanEdges = [...cleanEdges, fallbackEdge];
            outgoingByNode.get(n.id)?.push(fallbackEdge);
            fixesApplied.push(`decision "${n.id}"에 fallback NO edge 자동 추가 (-> ${fallbackTargetId})`);
        }
    }

    return { nodes, edges: cleanEdges, fixesApplied };
}

export interface ValidatableSopStep {
    id: string;
    title?: string;
    type?: string;
    shape?: string;
    terminalType?: 'start' | 'end';
    reviewStatus?: string;
    requiredSkills?: Array<{ name: string; source: string; accepted: boolean }>;
}

/**
 * SOP 단계 하나를 ValidatableNode의 `type`으로 분류하는 단일 기준.
 *
 * normalizer(sop-normalizer.ts)와 API route, 이 파일의 validateSopGraph가 모두
 * 이 함수 하나만 사용하도록 해서 "정규화 규칙"과 "검증 규칙"이 서로 다른 기준으로
 * start/end나 decision을 판단하는 일이 없게 한다. 배열 위치(index)는 절대 쓰지 않는다.
 */
export function classifySopStepType(step: {
    shape?: string;
    type?: string;
    terminalType?: 'start' | 'end';
}): 'terminal' | 'decision' | 'process' {
    if (step.shape === 'terminal' || step.type === 'terminal' || step.terminalType !== undefined) {
        return 'terminal';
    }
    if (step.shape === 'decision' || step.type === 'decision') {
        return 'decision';
    }
    return 'process';
}

export interface ShapeChangeNormalization {
    shape: string;
    type: 'terminal' | 'decision' | 'process';
    terminalType?: 'start' | 'end';
}

/**
 * 도형(shape)이 바뀔 때 type/terminalType을 항상 일관되게 유지하는 단일 정규화 함수.
 *
 * Inspector의 "표준 도형" 선택 UI가 이 함수 하나만 거쳐 updateStep()을 호출하도록 해서,
 * "화면은 process인데 검증기는 terminal로 인식"하는 것 같은 shape/type/terminalType 불일치가
 * 생기지 않게 한다.
 *
 * - terminal이 아닌 도형으로 바꾸면 terminalType은 항상 제거된다(이전에 시작/종료였어도).
 * - decision으로 바꾸면 type도 'decision'으로 맞춘다.
 * - terminal로 바꿀 때, 원래도 terminal이었다면 기존 terminalType을 보존하고, 그렇지 않았다면
 *   terminalType을 비워 둔다 - 호출자(Inspector)가 사용자에게 start/end를 명시적으로 선택하게
 *   해야 한다(배열 위치나 추측으로 start/end를 정하지 않는다).
 */
export function normalizeStepShapeChange(
    current: { shape?: string; type?: string; terminalType?: 'start' | 'end' },
    newShape: string
): ShapeChangeNormalization {
    const wasTerminal = current.shape === 'terminal' || current.type === 'terminal';

    if (newShape === 'terminal') {
        return { shape: 'terminal', type: 'terminal', terminalType: wasTerminal ? current.terminalType : undefined };
    }
    if (newShape === 'decision') {
        return { shape: 'decision', type: 'decision', terminalType: undefined };
    }
    return { shape: newShape, type: 'process', terminalType: undefined };
}

export function hasBlockingSopIssues(issues: GraphValidationIssue[]): boolean {
    return issues.length > 0;
}

export function validateSopGraph(
    steps: ValidatableSopStep[],
    edges: ValidatableEdge[]
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = [];

    if (steps.length === 0) {
        return [{ type: 'orphan-node', message: 'SOP에 단계가 존재하지 않습니다.' }];
    }

    // 중복 step ID / edge ID 검증 - 이후의 그래프 순회(도달성, decision 분기 등)가 잘못된
    // 노드/edge 동일시로 왜곡되지 않도록 가장 먼저 검사한다.
    const stepIdCounts = new Map<string, number>();
    steps.forEach((s) => stepIdCounts.set(s.id, (stepIdCounts.get(s.id) || 0) + 1));
    stepIdCounts.forEach((count, id) => {
        if (count > 1) {
            issues.push({
                type: 'duplicate-node-id',
                nodeId: id,
                message: `단계 ID "${id}"가 ${count}번 중복 사용되었습니다. 모든 단계 ID는 고유해야 합니다.`,
            });
        }
    });

    const edgeIdCounts = new Map<string, number>();
    edges.forEach((e) => {
        if (!e.id) return;
        edgeIdCounts.set(e.id, (edgeIdCounts.get(e.id) || 0) + 1);
    });
    edgeIdCounts.forEach((count, id) => {
        if (count > 1) {
            issues.push({
                type: 'duplicate-edge-id',
                message: `연결선 ID "${id}"가 ${count}번 중복 사용되었습니다. 모든 연결선 ID는 고유해야 합니다.`,
            });
        }
    });

    // Check for terminal steps missing terminalType (배열 위치로 추정하지 않고 오류로 처리)
    steps.forEach((s) => {
        const isTerminal = s.shape === 'terminal' || s.type === 'terminal';
        if (isTerminal && !s.terminalType) {
            issues.push({
                type: 'terminal-missing-type',
                nodeId: s.id,
                message: `터미널 노드 "${s.id}"에 terminalType("start" 또는 "end")이 지정되지 않았습니다.`,
            });
        }
    });

    // Strictly map steps to ValidatableNode via the shared classifier - NO index/array-position inference!
    const nodes: ValidatableNode[] = steps.map((s) => ({
        id: s.id,
        type: classifySopStepType(s),
        terminalType: s.terminalType,
        shape: s.shape,
    }));

    // Run core graph validation (start/end 방향, orphan, dangling, cycle). decision-insufficient-edges /
    // decision-missing-yes-no는 validateFlowGraph의 범용(2-edge yes/no만 아는) 판정이라 제외하고,
    // SOP 전용 validateSopDecisionBranches()의 결과로 완전히 대체한다. unbounded-cycle도 validateFlowGraph의
    // 느슨한 판정(label/branchType 아무거나 있으면 통과) 대신 아래 validateSopReworkCycles()의 더 엄격한
    // 판정으로 완전히 대체한다 - validateFlowGraph는 여전히 /flow(As-Is/To-Be)의 그래프 검증에 그대로
    // 쓰이므로 여기서 필터링해도 그쪽엔 영향이 없다.
    issues.push(
        ...validateFlowGraph(nodes, edges).filter(
            (i) =>
                i.type !== 'decision-insufficient-edges' &&
                i.type !== 'decision-missing-yes-no' &&
                i.type !== 'unbounded-cycle'
        )
    );
    issues.push(...validateSopDecisionBranches(nodes, edges));
    issues.push(...validateSopReworkCycles(nodes, edges));

    // 도달성 검증: 시작 노드가 정확히 1개일 때만 "시작에서 도달 불가"를 판정하고(시작 개수 자체가
    // 잘못됐을 땐 그 문제를 우선 보고), 종료 노드가 정확히 1개일 때만 "종료로 도달 불가"를 판정한다.
    const uniqueStartNodesForReachability = steps.filter((s) => s.terminalType === 'start');
    const uniqueEndNodesForReachability = steps.filter((s) => s.terminalType === 'end');

    if (uniqueStartNodesForReachability.length === 1) {
        const startId = uniqueStartNodesForReachability[0].id;
        const reachableFromStart = bfsReachableSet(startId, buildAdjacency(edges, 'forward'));
        for (const s of steps) {
            if (s.id === startId) continue;
            if (!reachableFromStart.has(s.id)) {
                issues.push({
                    type: 'unreachable-from-start',
                    nodeId: s.id,
                    message: `단계 "${s.id}"는 시작 노드에서 도달할 수 없습니다(별도의 연결되지 않은 그래프이거나 들어오는 경로가 없습니다).`,
                });
            }
        }
    }

    if (uniqueEndNodesForReachability.length === 1) {
        const endId = uniqueEndNodesForReachability[0].id;
        const canReachEnd = bfsReachableSet(endId, buildAdjacency(edges, 'backward'));
        for (const s of steps) {
            if (s.id === endId) continue;
            if (!canReachEnd.has(s.id)) {
                issues.push({
                    type: 'cannot-reach-end',
                    nodeId: s.id,
                    message: `단계 "${s.id}"에서 종료 노드로 가는 경로가 없습니다(막힌 부분 그래프이거나, 순환에서 빠져나가는 경로가 없습니다).`,
                });
            }
        }
    }

    // Explicit Start Node count check (terminalType === 'start') - SOP은 정확히 1개만 허용한다.
    const startNodes = steps.filter((s) => s.terminalType === 'start');
    if (startNodes.length === 0) {
        issues.push({
            type: 'missing-start-node',
            message: '시작 노드가 필요합니다 (terminalType="start").',
        });
    } else if (startNodes.length > 1) {
        issues.push({
            type: 'multiple-start-nodes',
            message: `시작 노드는 정확히 1개여야 합니다 (현재 ${startNodes.length}개: ${startNodes.map((s) => s.id).join(', ')}).`,
        });
    }

    // Explicit End Node count check (terminalType === 'end') - SOP은 정확히 1개만 허용한다.
    const endNodes = steps.filter((s) => s.terminalType === 'end');
    if (endNodes.length === 0) {
        issues.push({
            type: 'missing-end-node',
            message: '종료 노드가 필요합니다 (terminalType="end").',
        });
    } else if (endNodes.length > 1) {
        issues.push({
            type: 'multiple-end-nodes',
            message: `종료 노드는 정확히 1개여야 합니다 (현재 ${endNodes.length}개: ${endNodes.map((s) => s.id).join(', ')}).`,
        });
    }

    return issues;
}

/**
 * SOP decision 노드의 outgoing edge 분기 유형 검증.
 *
 * 두 가지 정상 패턴을 구분해서 인식한다:
 * - 이진 판단: outgoing edge가 정확히 2개이고 조건(condition) 분기가 전혀 없으면, 반드시
 *   branchType='yes' 1개 + 'no' 1개여야 한다.
 * - 조건 분기: condition 타입 edge가 하나라도 있으면(2개든 3개든), 각 condition edge에
 *   비어있지 않은 label과 condition이 있어야 하고 중복되지 않아야 한다.
 *
 * yes/no와 condition을 "완전히 배타적"으로 강제하지는 않는다 - 이 앱의 실제 SOP 샘플
 * 데이터(step-10: 수락=yes / 조건부 재협의=condition / 최대 재시도 초과 시 최종거절=no)처럼
 * "수락 / 조건부 재시도 / 한계 초과 거절" 3갈래는 실무에서 유효한 패턴이라, yes/no 각각을
 * 최대 1개까지만 허용하고 나머지는 condition 규칙으로 검증한다. 대신 다음은 항상 금지한다:
 * - branchType 미지정/'default' (decision-untyped-branch)
 * - 동일 target으로 향하는 중복(가짜) 분기 (decision-insufficient-edges)
 * - yes 2개 이상 또는 no 2개 이상 (decision-duplicate-branch-type)
 * - label/condition이 비어있는 condition 분기 (decision-condition-missing)
 * - label+condition 조합이 중복되는 condition 분기 (decision-duplicate-condition)
 */
export function validateSopDecisionBranches(
    nodes: ValidatableNode[],
    edges: ValidatableEdge[]
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = [];
    const outgoing = new Map<string, ValidatableEdge[]>();
    nodes.forEach((n) => outgoing.set(n.id, []));
    edges.forEach((e) => {
        if (outgoing.has(e.source)) outgoing.get(e.source)!.push(e);
    });

    for (const n of nodes) {
        if (n.type !== 'decision') continue;
        const out = outgoing.get(n.id) || [];
        const distinctTargets = new Set(out.map((e) => e.target));

        if (distinctTargets.size < 2 || out.length !== distinctTargets.size) {
            issues.push({
                type: 'decision-insufficient-edges',
                nodeId: n.id,
                message: `decision 노드 "${n.id}"는 서로 다른 target을 가진 outgoing edge가 2개 이상이어야 하며, 동일한 target으로 향하는 중복(가짜) 분기가 없어야 합니다 (현재 edge ${out.length}개, 서로 다른 target ${distinctTargets.size}개).`,
            });
            continue;
        }

        const untyped = out.filter((e) => !e.branchType || e.branchType === 'default');
        if (untyped.length > 0) {
            issues.push({
                type: 'decision-untyped-branch',
                nodeId: n.id,
                message: `decision 노드 "${n.id}"의 모든 outgoing edge는 branchType('yes'/'no'/'condition')이 지정되어야 합니다 (branchType 미지정 또는 'default' 금지).`,
            });
            continue;
        }

        const yesEdges = out.filter((e) => e.branchType === 'yes');
        const noEdges = out.filter((e) => e.branchType === 'no');
        const conditionEdges = out.filter((e) => e.branchType === 'condition');

        // 조건 분기가 전혀 없는 순수 2-edge 이진 판단만 "정확히 yes 1 + no 1"을 엄격히 요구한다.
        if (out.length === 2 && conditionEdges.length === 0) {
            if (yesEdges.length !== 1 || noEdges.length !== 1) {
                issues.push({
                    type: 'decision-invalid-binary-branches',
                    nodeId: n.id,
                    message: `decision 노드 "${n.id}"의 이진 판단은 branchType='yes' 1개, 'no' 1개로 구성되어야 합니다 (현재 yes ${yesEdges.length}개, no ${noEdges.length}개).`,
                });
            }
            continue;
        }

        if (yesEdges.length > 1 || noEdges.length > 1) {
            issues.push({
                type: 'decision-duplicate-branch-type',
                nodeId: n.id,
                message: `decision 노드 "${n.id}"에 동일한 branchType('yes' 또는 'no')이 2개 이상 있습니다 (yes ${yesEdges.length}개, no ${noEdges.length}개). yes/no는 각각 최대 1개만 허용됩니다.`,
            });
        }

        if (conditionEdges.length > 0) {
            const missingDetail = conditionEdges.filter((e) => !e.label?.trim() || !e.condition?.trim());
            if (missingDetail.length > 0) {
                issues.push({
                    type: 'decision-condition-missing',
                    nodeId: n.id,
                    message: `decision 노드 "${n.id}"의 condition 분기에는 비어 있지 않은 label과 condition이 모두 필요합니다.`,
                });
            }

            const seenLabelCondition = new Set<string>();
            let hasDuplicate = false;
            for (const e of conditionEdges) {
                const key = `${(e.label || '').trim()}::${(e.condition || '').trim()}`;
                if (seenLabelCondition.has(key)) hasDuplicate = true;
                seenLabelCondition.add(key);
            }
            if (hasDuplicate) {
                issues.push({
                    type: 'decision-duplicate-condition',
                    nodeId: n.id,
                    message: `decision 노드 "${n.id}"의 condition 분기에 동일한 label+condition 조합이 중복됩니다.`,
                });
            }
        }
    }

    return issues;
}

export interface SopStructuralConstraints {
    minSteps: number;
    maxSteps: number;
    maxTotalNodes?: number;
    branchPolicy: 'auto' | 'none' | 'max';
    maxBranches: number;
    allowRework: boolean;
    maxLoops?: number;
}

/**
 * 워크플로우 구조 설정(SopSetupConfig)이 실제 생성 결과에 반영됐는지 검증한다.
 *
 * - minSteps/maxSteps: 시작·종료 노드를 제외한 주요 업무 단계 수
 * - maxTotalNodes: 시작·종료·decision·loopLimit을 모두 포함한 전체 노드 상한
 * - maxBranches: decision 노드의 최대 개수 (branchPolicy='max'일 때만 강제)
 * - maxLoops: 정적 그래프 내 재작업(순환) 경로의 최대 개수 (allowRework=true일 때만 의미가 있음)
 *
 * 프롬프트 지시만으로는 가벼운 모델이 종종 무시하므로, generateSop 파이프라인에서 실제
 * 결과를 이 함수로 다시 검증한다 (프롬프트는 "권장", 여기가 최종 강제).
 */
export function validateSopStructuralConstraints(
    steps: ValidatableSopStep[],
    edges: ValidatableEdge[],
    constraints: SopStructuralConstraints
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = [];

    const majorStepCount = steps.filter((s) => classifySopStepType(s) !== 'terminal').length;
    if (majorStepCount < constraints.minSteps || majorStepCount > constraints.maxSteps) {
        issues.push({
            type: 'step-count-out-of-range',
            message: `주요 업무 단계 수(시작·종료 노드 제외)는 ${constraints.minSteps}~${constraints.maxSteps}개여야 합니다 (현재 ${majorStepCount}개).`,
        });
    }

    if (constraints.maxTotalNodes !== undefined && steps.length > constraints.maxTotalNodes) {
        issues.push({
            type: 'total-node-limit-exceeded',
            message: `전체 노드 수(시작·종료·decision·loopLimit 포함)는 ${constraints.maxTotalNodes}개를 초과할 수 없습니다 (현재 ${steps.length}개).`,
        });
    }

    const decisionCount = steps.filter((s) => classifySopStepType(s) === 'decision').length;
    if (constraints.branchPolicy === 'none' && decisionCount > 0) {
        issues.push({
            type: 'decision-not-allowed',
            message: `분기 정책이 'none'이므로 decision(판단) 노드를 포함할 수 없습니다 (현재 ${decisionCount}개).`,
        });
    }
    if (constraints.branchPolicy === 'max' && decisionCount > constraints.maxBranches) {
        issues.push({
            type: 'decision-limit-exceeded',
            message: `decision(판단) 노드는 최대 ${constraints.maxBranches}개까지 허용됩니다 (현재 ${decisionCount}개).`,
        });
    }

    // "재작업 루프 수" = 정적 그래프 안에서 "이전 단계로 되돌아가는" edge의 개수(findReworkEdges).
    // 노드/edge 배열 순서를 바꿔도 항상 동일한 결과를 내야 하므로 findCycles(DFS 스택 기반, 방문
    // 순서에 따라 back-edge 집합이 달라질 수 있음) 대신 BFS 레벨 기반 판정을 쓴다.
    const nodeIds = steps.map((s) => s.id);
    const startId = steps.find((s) => s.terminalType === 'start')?.id;
    const reworkEdges = findReworkEdges(nodeIds, edges, startId);
    if (!constraints.allowRework && reworkEdges.length > 0) {
        issues.push({
            type: 'rework-not-allowed',
            message: `재작업 경로 허용이 꺼져 있어 순환(재작업) 경로를 포함할 수 없습니다 (현재 ${reworkEdges.length}개 발견).`,
        });
    } else if (
        constraints.allowRework &&
        constraints.maxLoops !== undefined &&
        reworkEdges.length > constraints.maxLoops
    ) {
        issues.push({
            type: 'loop-limit-exceeded',
            message: `재작업 루프 수는 최대 ${constraints.maxLoops}개까지 허용됩니다 (현재 ${reworkEdges.length}개).`,
        });
    }

    return issues;
}

/** validateSopGraph(구조/방향/분기)와 validateSopStructuralConstraints(설정값 준수)를 합친 전체 검증. */
export function validateSopFull(
    steps: ValidatableSopStep[],
    edges: ValidatableEdge[],
    constraints: SopStructuralConstraints
): GraphValidationIssue[] {
    return [...validateSopGraph(steps, edges), ...validateSopStructuralConstraints(steps, edges, constraints)];
}
