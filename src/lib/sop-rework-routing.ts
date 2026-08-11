import { SopEdge, SopStepData } from './sop-types';

export type SopRoutePoint = { x: number; y: number };
export type SopReworkRoute = {
    points: SopRoutePoint[];
    sourceHandle: string;
    targetHandle: string;
};

type Side = 'top' | 'right' | 'bottom' | 'left';
type Bounds = { left: number; top: number; right: number; bottom: number };
type RouteNode = { id: string; bounds: Bounds };

const CLEARANCE = 28;
const OUTER_GUTTER = 92;
const REWORK_LANE_GAP = 52;

const isSecondaryBranch = (edge: SopEdge) => edge.branchType === 'no' || edge.branchType === 'condition';

/** A NO/condition branch is drawn as a rework route only when it closes a loop. */
export function isSopReworkEdge(edge: SopEdge, edges: SopEdge[]): boolean {
    if (!isSecondaryBranch(edge)) return false;

    const outgoing = new Map<string, string[]>();
    edges.forEach((candidate) => {
        if (candidate.id === edge.id) return;
        const targets = outgoing.get(candidate.source) || [];
        targets.push(candidate.target);
        outgoing.set(candidate.source, targets);
    });

    const visited = new Set<string>();
    const stack = [edge.target];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === edge.source) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        (outgoing.get(current) || []).forEach((next) => stack.push(next));
    }

    return /재작업|재검토|재협의|rework/i.test(`${edge.label || ''} ${edge.condition || ''}`);
}

function stepBounds(step: SopStepData, displayMode: 'compact' | 'standard' | 'detailed'): Bounds {
    void displayMode;
    const width = step.shape === 'decision' ? 190 : 190;
    const height = step.shape === 'decision' ? 120 : 74;
    return {
        left: step.position.x,
        top: step.position.y,
        right: step.position.x + width,
        bottom: step.position.y + height,
    };
}

function getPort(bounds: Bounds, side: Side, target: boolean) {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    // SopStepNode deliberately offsets its hidden rework handles (35% / 65%)
    // from the visible, primary-flow handles. The custom SVG route must use
    // those exact coordinates; routing from the geometric centre creates a
    // small diagonal segment at the node boundary and makes a clean route look
    // as if it attaches to the wrong point.
    const horizontalRatio = target ? (side === 'top' ? 0.35 : 0.65) : side === 'top' ? 0.65 : 0.35;
    const verticalRatio = target ? (side === 'left' ? 0.35 : 0.65) : side === 'left' ? 0.65 : 0.35;
    const point =
        side === 'top'
            ? { x: bounds.left + width * horizontalRatio, y: bounds.top }
            : side === 'right'
              ? { x: bounds.right, y: bounds.top + height * verticalRatio }
              : side === 'bottom'
                ? { x: bounds.left + width * horizontalRatio, y: bounds.bottom }
                : { x: bounds.left, y: bounds.top + height * verticalRatio };
    const exit =
        side === 'top'
            ? { x: point.x, y: point.y - CLEARANCE }
            : side === 'right'
              ? { x: point.x + CLEARANCE, y: point.y }
              : side === 'bottom'
                ? { x: point.x, y: point.y + CLEARANCE }
                : { x: point.x - CLEARANCE, y: point.y };
    return {
        point,
        exit,
        handle: target ? `${side}-rework-target` : `${side}-rework`,
    };
}

function routeLength(points: SopRoutePoint[]) {
    return points.slice(1).reduce(
        (sum, point, index) => sum + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
        0
    );
}

function routeIsClear(points: SopRoutePoint[], obstacles: Bounds[], occupiedSegments: Set<string>) {
    // The first and final mini-segments intentionally leave / enter their own
    // node. All other segments must stay clear of every expanded node.
    for (let index = 1; index < points.length - 2; index += 1) {
        if (!isSegmentClear(points[index], points[index + 1], obstacles)) return false;
        if (occupiedSegments.has(segmentKey(points[index], points[index + 1]))) return false;
    }
    return true;
}

function toRoute(
    source: Bounds,
    target: Bounds,
    sourceSide: Side,
    targetSide: Side,
    waypoints: SopRoutePoint[],
    obstacles: Bounds[],
    occupiedSegments: Set<string>
): SopReworkRoute | null {
    const sourcePort = getPort(source, sourceSide, false);
    const targetPort = getPort(target, targetSide, true);
    const points = simplify([sourcePort.point, sourcePort.exit, ...waypoints, targetPort.exit, targetPort.point]);
    if (!routeIsClear(points, obstacles, occupiedSegments)) return null;
    return { points, sourceHandle: sourcePort.handle, targetHandle: targetPort.handle };
}

function expand(bounds: Bounds, amount: number): Bounds {
    return {
        left: bounds.left - amount,
        top: bounds.top - amount,
        right: bounds.right + amount,
        bottom: bounds.bottom + amount,
    };
}

function isPointClear(point: SopRoutePoint, obstacles: Bounds[]) {
    return !obstacles.some(
        (bounds) => point.x > bounds.left && point.x < bounds.right && point.y > bounds.top && point.y < bounds.bottom
    );
}

function isSegmentClear(from: SopRoutePoint, to: SopRoutePoint, obstacles: Bounds[]) {
    if (from.x !== to.x && from.y !== to.y) return false;
    return !obstacles.some((bounds) => {
        if (from.y === to.y) {
            const left = Math.min(from.x, to.x);
            const right = Math.max(from.x, to.x);
            return from.y > bounds.top && from.y < bounds.bottom && right > bounds.left && left < bounds.right;
        }
        const top = Math.min(from.y, to.y);
        const bottom = Math.max(from.y, to.y);
        return from.x > bounds.left && from.x < bounds.right && bottom > bounds.top && top < bounds.bottom;
    });
}

function key(point: SopRoutePoint) {
    return `${point.x}:${point.y}`;
}

function segmentKey(from: SopRoutePoint, to: SopRoutePoint) {
    return from.x === to.x
        ? `v:${from.x}:${Math.min(from.y, to.y)}:${Math.max(from.y, to.y)}`
        : `h:${from.y}:${Math.min(from.x, to.x)}:${Math.max(from.x, to.x)}`;
}

function simplify(points: SopRoutePoint[]) {
    return points.filter((point, index) => {
        if (index === 0 || index === points.length - 1) return true;
        const previous = points[index - 1];
        const next = points[index + 1];
        return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
    });
}

function findOrthogonalPath(
    start: SopRoutePoint,
    end: SopRoutePoint,
    gridX: number[],
    gridY: number[],
    obstacles: Bounds[],
    occupiedSegments: Set<string>,
    preventHorizontalAtStartY: boolean = false
) {
    const points = new Map<string, SopRoutePoint>();
    gridX.forEach((x) => {
        gridY.forEach((y) => {
            const point = { x, y };
            if (isPointClear(point, obstacles) || key(point) === key(start) || key(point) === key(end)) points.set(key(point), point);
        });
    });

    const startKey = key(start);
    const endKey = key(end);
    points.set(startKey, start);
    points.set(endKey, end);
    const xIndex = new Map(gridX.map((x, index) => [x, index]));
    const yIndex = new Map(gridY.map((y, index) => [y, index]));
    const queue: Array<{ point: SopRoutePoint; direction?: 'h' | 'v'; cost: number; path: SopRoutePoint[] }> = [
        { point: start, cost: 0, path: [start] },
    ];
    const best = new Map<string, number>();

    while (queue.length > 0) {
        queue.sort((a, b) => a.cost - b.cost);
        const current = queue.shift()!;
        const currentKey = `${key(current.point)}:${current.direction || 'start'}`;
        if (current.cost >= (best.get(currentKey) ?? Infinity)) continue;
        best.set(currentKey, current.cost);
        if (key(current.point) === endKey) return current.path;

        const currentXIndex = xIndex.get(current.point.x);
        const currentYIndex = yIndex.get(current.point.y);
        const neighbours = [
            currentXIndex !== undefined && currentXIndex > 0 ? { x: gridX[currentXIndex - 1], y: current.point.y } : null,
            currentXIndex !== undefined && currentXIndex < gridX.length - 1 ? { x: gridX[currentXIndex + 1], y: current.point.y } : null,
            currentYIndex !== undefined && currentYIndex > 0 ? { x: current.point.x, y: gridY[currentYIndex - 1] } : null,
            currentYIndex !== undefined && currentYIndex < gridY.length - 1 ? { x: current.point.x, y: gridY[currentYIndex + 1] } : null,
        ].filter(
            (point): point is SopRoutePoint =>
                !!point &&
                points.has(key(point)) &&
                isSegmentClear(current.point, point, obstacles) &&
                !(preventHorizontalAtStartY && current.point.y === start.y && point.y === current.point.y)
        );

        neighbours.forEach((next) => {
            const direction: 'h' | 'v' = next.y === current.point.y ? 'h' : 'v';
            const distance = Math.abs(next.x - current.point.x) + Math.abs(next.y - current.point.y);
            const turnCost = current.direction && current.direction !== direction ? 36 : 0;
            const sharedRouteCost = occupiedSegments.has(segmentKey(current.point, next)) ? 260 : 0;
            queue.push({ point: next, direction, cost: current.cost + distance + turnCost + sharedRouteCost, path: [...current.path, next] });
        });
    }

    return null;
}

/**
 * Routes a rework loop through a dedicated outer lane. The path is calculated
 * from node bounds (not AI-supplied edge coordinates), so it never runs through
 * a SOP node and each additional loop receives a separate lane.
 */
export function routeSopReworkEdge(
    edge: SopEdge,
    steps: SopStepData[],
    displayMode: 'compact' | 'standard' | 'detailed',
    laneIndex: number,
    occupiedSegments: Set<string>
): SopReworkRoute | null {
    const routeNodes: RouteNode[] = steps.map((step) => ({ id: step.id, bounds: stepBounds(step, displayMode) }));
    const source = routeNodes.find((node) => node.id === edge.source);
    const target = routeNodes.find((node) => node.id === edge.target);
    if (!source || !target) return null;

    const obstacles = routeNodes.map((node) => expand(node.bounds, 16));
    const minX = Math.min(...routeNodes.map((node) => node.bounds.left));
    const maxX = Math.max(...routeNodes.map((node) => node.bounds.right));
    const minY = Math.min(...routeNodes.map((node) => node.bounds.top));
    const maxY = Math.max(...routeNodes.map((node) => node.bounds.bottom));
    const sourceCenterX = (source.bounds.left + source.bounds.right) / 2;
    const targetCenterX = (target.bounds.left + target.bounds.right) / 2;
    const sourceCenterY = (source.bounds.top + source.bounds.bottom) / 2;
    const targetCenterY = (target.bounds.top + target.bounds.bottom) / 2;
    const localOffset = (laneIndex % 2) * 24;

    // The previous implementation gave every loop a full-canvas outer rail.
    // That makes three independent rework decisions look like one tangled
    // perimeter. Prefer the nearest free reading channel first: above a
    // rightward return, below a leftward return, and between adjacent rows for
    // diagonal returns. Only the upper-right-to-upper-left return needs a
    // single clear exterior rail to stay out of the primary reading path.
    let preferred: SopReworkRoute | null = null;
    if (sourceCenterY > targetCenterY + 40 && sourceCenterX > targetCenterX + 40) {
        const sourcePort = getPort(source.bounds, 'right', false);
        const targetPort = getPort(target.bounds, 'top', true);
        const railX = maxX + OUTER_GUTTER + laneIndex * REWORK_LANE_GAP;
        const railY = minY - OUTER_GUTTER - laneIndex * REWORK_LANE_GAP;
        preferred = toRoute(
            source.bounds,
            target.bounds,
            'right',
            'top',
            [
                { x: railX, y: sourcePort.exit.y },
                { x: railX, y: railY },
                { x: targetPort.exit.x, y: railY },
            ],
            obstacles,
            occupiedSegments
        );
    } else if (sourceCenterY > targetCenterY + 40 && sourceCenterX < targetCenterX - 40) {
        const sourcePort = getPort(source.bounds, 'top', false);
        const targetPort = getPort(target.bounds, 'bottom', true);
        const channelY = (sourcePort.exit.y + targetPort.exit.y) / 2 - localOffset;
        preferred = toRoute(
            source.bounds,
            target.bounds,
            'top',
            'bottom',
            [
                { x: sourcePort.exit.x, y: channelY },
                { x: targetPort.exit.x, y: channelY },
            ],
            obstacles,
            occupiedSegments
        );
    } else if (Math.abs(sourceCenterY - targetCenterY) <= 40 && sourceCenterX < targetCenterX) {
        const sourcePort = getPort(source.bounds, 'top', false);
        const targetPort = getPort(target.bounds, 'top', true);
        const channelY = Math.min(source.bounds.top, target.bounds.top) - CLEARANCE - 20 - localOffset;
        preferred = toRoute(
            source.bounds,
            target.bounds,
            'top',
            'top',
            [
                { x: sourcePort.exit.x, y: channelY },
                { x: targetPort.exit.x, y: channelY },
            ],
            obstacles,
            occupiedSegments
        );
    } else if (Math.abs(sourceCenterY - targetCenterY) <= 40 && sourceCenterX > targetCenterX) {
        const sourcePort = getPort(source.bounds, 'bottom', false);
        const targetPort = getPort(target.bounds, 'bottom', true);
        const channelY = Math.max(source.bounds.bottom, target.bounds.bottom) + CLEARANCE + 20 + localOffset;
        preferred = toRoute(
            source.bounds,
            target.bounds,
            'bottom',
            'bottom',
            [
                { x: sourcePort.exit.x, y: channelY },
                { x: targetPort.exit.x, y: channelY },
            ],
            obstacles,
            occupiedSegments
        );
    }

    if (preferred) {
        preferred.points.slice(1).forEach((point, index) => occupiedSegments.add(segmentKey(preferred!.points[index], point)));
        return preferred;
    }

    // Non-serpentine or manually arranged graphs use a shortest clear path as
    // a fallback. It considers local corridors before the far canvas boundary.
    const sidePairs: Array<[Side, Side]> = [
        ['top', 'top'], ['top', 'bottom'], ['top', 'left'], ['top', 'right'],
        ['bottom', 'top'], ['bottom', 'bottom'], ['bottom', 'left'], ['bottom', 'right'],
        ['left', 'top'], ['left', 'bottom'], ['left', 'left'], ['left', 'right'],
        ['right', 'top'], ['right', 'bottom'], ['right', 'left'], ['right', 'right'],
    ];
    let bestRoute: SopReworkRoute | null = null;
    let bestLength = Infinity;
    for (const [sourceSide, targetSide] of sidePairs) {
        const sourcePort = getPort(source.bounds, sourceSide, false);
        const targetPort = getPort(target.bounds, targetSide, true);
        const gridX = [
            ...new Set([
                ...routeNodes.flatMap((node) => [node.bounds.left - 16, node.bounds.right + 16]),
                sourcePort.exit.x,
                targetPort.exit.x,
                minX - OUTER_GUTTER,
                maxX + OUTER_GUTTER,
            ]),
        ].sort((a, b) => a - b);
        const gridY = [
            ...new Set([
                ...routeNodes.flatMap((node) => [node.bounds.top - 16, node.bounds.bottom + 16]),
                sourcePort.exit.y,
                targetPort.exit.y,
                minY - OUTER_GUTTER,
                maxY + OUTER_GUTTER,
            ]),
        ].sort((a, b) => a - b);
        const path = findOrthogonalPath(sourcePort.exit, targetPort.exit, gridX, gridY, obstacles, occupiedSegments);
        if (!path) continue;
        const candidate = toRoute(
            source.bounds,
            target.bounds,
            sourceSide,
            targetSide,
            path.slice(1, -1),
            obstacles,
            occupiedSegments
        );
        if (!candidate) continue;
        const length = routeLength(candidate.points);
        if (length < bestLength) {
            bestRoute = candidate;
            bestLength = length;
        }
    }

    if (bestRoute) {
        bestRoute.points.slice(1).forEach((point, index) => occupiedSegments.add(segmentKey(bestRoute!.points[index], point)));
    }
    return bestRoute;
}
