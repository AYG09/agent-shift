export type SourceHandle = 'top' | 'right' | 'bottom' | 'left';
export type TargetHandle = `${SourceHandle}-target`;

type Position = { x: number; y: number };

interface PositionedNode {
    id: string;
    position: Position;
}

interface HandleEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

const DEFAULT_SOURCE_HANDLE: SourceHandle = 'bottom';
const DEFAULT_TARGET_HANDLE: TargetHandle = 'top-target';

export function isSourceHandle(handle: string | null | undefined): handle is SourceHandle {
    return handle === 'top' || handle === 'right' || handle === 'bottom' || handle === 'left';
}

export function isTargetHandle(handle: string | null | undefined): handle is TargetHandle {
    return (
        handle === 'top-target' ||
        handle === 'right-target' ||
        handle === 'bottom-target' ||
        handle === 'left-target'
    );
}

export function toSourceHandle(handle: string | null | undefined): SourceHandle {
    if (!handle) return DEFAULT_SOURCE_HANDLE;

    const normalized = handle.endsWith('-target') ? handle.replace(/-target$/, '') : handle;
    return isSourceHandle(normalized) ? normalized : DEFAULT_SOURCE_HANDLE;
}

export function toTargetHandle(handle: string | null | undefined): TargetHandle {
    if (!handle) return DEFAULT_TARGET_HANDLE;

    if (isTargetHandle(handle)) return handle;

    const sourceLike = handle.endsWith('-target') ? handle.replace(/-target$/, '') : handle;
    if (isSourceHandle(sourceLike)) return `${sourceLike}-target`;

    return DEFAULT_TARGET_HANDLE;
}

export function determineOptimalHandlesByPosition(
    sourcePos: Position,
    targetPos: Position
): { sourceHandle: SourceHandle; targetHandle: TargetHandle } {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDy > absDx * 0.5) {
        if (dy > 0) {
            return { sourceHandle: 'bottom', targetHandle: 'top-target' };
        }

        return { sourceHandle: 'top', targetHandle: 'bottom-target' };
    }

    if (dx > 0) {
        return { sourceHandle: 'right', targetHandle: 'left-target' };
    }

    return { sourceHandle: 'left', targetHandle: 'right-target' };
}

export function resolveConnectionHandles(params: {
    sourcePos?: Position;
    targetPos?: Position;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}): { sourceHandle: SourceHandle; targetHandle: TargetHandle } {
    const { sourcePos, targetPos, sourceHandle, targetHandle } = params;

    if (sourceHandle && targetHandle) {
        return {
            sourceHandle: toSourceHandle(sourceHandle),
            targetHandle: toTargetHandle(targetHandle),
        };
    }

    if (sourcePos && targetPos) {
        return determineOptimalHandlesByPosition(sourcePos, targetPos);
    }

    return {
        sourceHandle: toSourceHandle(sourceHandle),
        targetHandle: toTargetHandle(targetHandle),
    };
}

export function normalizeEdgeHandlesByNodePositions<T extends HandleEdge>(
    nodes: PositionedNode[],
    edges: T[]
): T[] {
    const nodeMap = new Map(nodes.map((node) => [node.id, node.position]));

    return edges.map((edge) => {
        if (isSourceHandle(edge.sourceHandle) && isTargetHandle(edge.targetHandle)) {
            return edge;
        }

        const sourcePos = nodeMap.get(edge.source);
        const targetPos = nodeMap.get(edge.target);
        const { sourceHandle, targetHandle } = resolveConnectionHandles({
            sourcePos,
            targetPos,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
        });

        return {
            ...edge,
            sourceHandle,
            targetHandle,
        };
    });
}

export function getReversedEdgeHandles(edge: {
    sourceHandle?: string | null;
    targetHandle?: string | null;
}) {
    return {
        sourceHandle: toSourceHandle(edge.targetHandle),
        targetHandle: toTargetHandle(edge.sourceHandle),
    };
}
