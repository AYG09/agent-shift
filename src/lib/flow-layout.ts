/**
 * 분기(YES/NO)와 순환(재시도) 구조를 가진 그래프를 위한 결정론적 자동 배치.
 *
 * AI가 돌려주는 position은 신뢰하지 않고(가벼운 모델이 분기 좌표를 정확히 계산하기 어려움),
 * 이 모듈이 edge 구조만으로 rank(세로 단계)와 column(가로 분기)을 계산해 좌표를 새로 부여한다.
 *
 * - 기본 진행(YES/default/라벨 없음)은 같은 column에서 아래로 진행한다
 * - NO/condition 분기는 옆 column으로 이동한다
 * - 이미 방문한 노드(순환의 되돌아가는 대상)는 재배치하지 않는다 -> 방문마다 노드 하나씩만
 *   좌표를 부여하므로 순환이 아무리 많아도 반드시 종료한다 (무한 루프 불가)
 *
 * 새로 생성되는 노드에만 적용해야 한다 - 사용자가 수동으로 옮긴 기존 노드의 좌표는
 * 이 함수에 넘기지 않는 방식으로 보존한다 (호출부의 책임).
 */

export interface LayoutableNode {
    id: string;
    position?: { x: number; y: number };
}

export interface LayoutableEdge {
    source: string;
    target: string;
    branchType?: 'yes' | 'no' | 'condition' | 'default';
    sourceHandle?: string;
    targetHandle?: string;
}

export interface LayoutOptions {
    /** 배치의 원점 (rank 0, column 0의 좌표) */
    anchor?: { x: number; y: number };
    columnSpacing?: number;
    rowSpacing?: number;
}

function isSecondaryBranch(e: LayoutableEdge): boolean {
    return e.branchType === 'no' || e.branchType === 'condition';
}

export function getDirectionalHandles(
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;

    // 실제로 옆 column으로 벌어져 있는 분기(NO/condition)만 좌우 handle을 쓴다.
    // 같은 column으로 되돌아가는 재시도 edge는 위/아래 handle이 훨씬 자연스럽다.
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
            ? { sourceHandle: 'right', targetHandle: 'left-target' }
            : { sourceHandle: 'left', targetHandle: 'right-target' };
    }

    return dy >= 0
        ? { sourceHandle: 'bottom', targetHandle: 'top-target' }
        : { sourceHandle: 'top', targetHandle: 'bottom-target' };
}

/**
 * 노드/엣지에 rank/column 기반 좌표와 handle을 부여한다.
 * 입력 배열은 변경하지 않고 새 배열을 반환한다.
 */
export function layoutFlowGraph<N extends LayoutableNode, E extends LayoutableEdge>(
    nodes: N[],
    edges: E[],
    options: LayoutOptions = {}
): { nodes: N[]; edges: E[] } {
    const { anchor = { x: 250, y: 0 }, columnSpacing = 220, rowSpacing = 140 } = options;

    if (nodes.length === 0) {
        return { nodes, edges };
    }

    const nodeIds = nodes.map((n) => n.id);
    const nodeIdSet = new Set(nodeIds);
    const outgoingByNode = new Map<string, E[]>();
    const incomingCount = new Map<string, number>();
    nodeIds.forEach((id) => {
        outgoingByNode.set(id, []);
        incomingCount.set(id, 0);
    });

    const validEdges = edges.filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
    validEdges.forEach((e) => {
        outgoingByNode.get(e.source)?.push(e);
        incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1);
    });

    const rank = new Map<string, number>();
    const column = new Map<string, number>();
    const visited = new Set<string>();
    const occupied = new Set<string>();

    function place(id: string, r: number, c: number) {
        let finalColumn = c;
        while (occupied.has(`${r}:${finalColumn}`)) finalColumn += 1;
        rank.set(id, r);
        column.set(id, finalColumn);
        occupied.add(`${r}:${finalColumn}`);
    }

    // visited-set 기반 BFS: 각 노드는 정확히 한 번만 큐에 들어가고 좌표를 부여받는다.
    // 순환의 back-edge는 target이 이미 visited이므로 조건문에서 즉시 걸러져 큐에 다시 들어가지 않는다.
    function bfsFrom(rootId: string) {
        if (visited.has(rootId)) return;
        visited.add(rootId);
        place(rootId, 0, 0);
        const queue: string[] = [rootId];

        while (queue.length > 0) {
            const current = queue.shift() as string;
            const currentRank = rank.get(current) as number;
            const currentColumn = column.get(current) as number;

            for (const e of outgoingByNode.get(current) || []) {
                if (visited.has(e.target)) continue;
                visited.add(e.target);
                const targetColumn = isSecondaryBranch(e) ? currentColumn + 1 : currentColumn;
                place(e.target, currentRank + 1, targetColumn);
                queue.push(e.target);
            }
        }
    }

    const roots = nodeIds.filter((id) => (incomingCount.get(id) || 0) === 0);
    (roots.length > 0 ? roots : [nodeIds[0]]).forEach(bfsFrom);

    // 루트에서 도달하지 못한 고립된 하위 그래프도 모두 배치한다 - 노드 수만큼만 반복되므로 항상 종료.
    for (const id of nodeIds) {
        if (!visited.has(id)) bfsFrom(id);
    }

    const laidOutNodes = nodes.map((n) => ({
        ...n,
        position: {
            x: anchor.x + (column.get(n.id) || 0) * columnSpacing,
            y: anchor.y + (rank.get(n.id) || 0) * rowSpacing,
        },
    }));

    const positionById = new Map(laidOutNodes.map((n) => [n.id, n.position]));

    const laidOutEdges = edges.map((e) => {
        // targetHandle은 앱 전역 규약상 '-target' 접미사가 있어야 유효하다(store.ts의 isValidTargetHandle과 동일 기준).
        // AI 응답의 sourceHandle/targetHandle은 zod 기본값('bottom'/'top', 접미사 없음)이 항상 채워져 있으므로,
        // 단순 truthy 체크로는 "이미 유효한 handle"로 잘못 판단해 아래 분기-인식 handle 계산이 건너뛰어진다.
        if (e.sourceHandle && e.targetHandle?.endsWith('-target')) return e;
        const sourcePos = positionById.get(e.source);
        const targetPos = positionById.get(e.target);
        if (!sourcePos || !targetPos) {
            return {
                ...e,
                sourceHandle: e.sourceHandle || 'bottom',
                targetHandle: e.targetHandle || 'top-target',
            };
        }
        const handles = getDirectionalHandles(sourcePos, targetPos);
        return { ...e, ...handles };
    });

    return { nodes: laidOutNodes, edges: laidOutEdges };
}
