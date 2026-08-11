import { getDirectionalHandles } from './flow-layout';
import { SopEdge, SopStepData } from './sop-types';

type Point = { x: number; y: number };

const isSecondaryBranch = (edge: SopEdge) => edge.branchType === 'no' || edge.branchType === 'condition';

/**
 * Places newly generated SOPs in a compact, multi-row reading path.
 * AI supplies sequence and branch semantics; this deterministic pass owns the
 * visual coordinates so a plausible-looking AI coordinate never creates an
 * unreadable single-line diagram.
 */
export function layoutSopGraph(steps: SopStepData[], edges: SopEdge[]): { steps: SopStepData[]; edges: SopEdge[] } {
    if (steps.length === 0) return { steps, edges };

    const byId = new Map(steps.map((step) => [step.id, step]));
    const outgoing = new Map<string, SopEdge[]>();
    const incoming = new Map<string, number>();
    steps.forEach((step) => {
        outgoing.set(step.id, []);
        incoming.set(step.id, 0);
    });
    edges.forEach((edge) => {
        if (!byId.has(edge.source) || !byId.has(edge.target)) return;
        outgoing.get(edge.source)?.push(edge);
        incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    });

    const first = steps.find((step) => step.terminalType === 'start') || steps.find((step) => (incoming.get(step.id) || 0) === 0) || steps[0];
    const primary: string[] = [];
    const visited = new Set<string>();
    let current: string | undefined = first.id;
    while (current && !visited.has(current)) {
        primary.push(current);
        visited.add(current);
        const next: SopEdge | undefined = [...(outgoing.get(current) || [])]
            .sort((a, b) => Number(isSecondaryBranch(a)) - Number(isSecondaryBranch(b)))
            .find((edge) => !visited.has(edge.target));
        current = next?.target;
    }
    steps.forEach((step) => {
        if (!visited.has(step.id)) primary.push(step.id);
    });

    const rowCount = Math.min(3, Math.max(1, Math.ceil(primary.length / 4)));
    const columns = Math.max(3, Math.ceil(primary.length / rowCount));
    const columnSpacing = 270;
    const rowSpacing = 210;
    const anchor: Point = { x: 100, y: 110 };
    const positionById = new Map<string, Point>();
    const occupied = new Set<string>();

    primary.forEach((id, index) => {
        const row = Math.floor(index / columns);
        const rawColumn = index % columns;
        const column = row % 2 === 0 ? rawColumn : columns - 1 - rawColumn;
        positionById.set(id, { x: anchor.x + column * columnSpacing, y: anchor.y + row * rowSpacing });
        occupied.add(`${row}:${column}`);
    });

    // Keep secondary branches near the decision that created them, in a free
    // lane. This prevents branch nodes from covering the main reading path.
    for (const step of steps) {
        if (positionById.has(step.id)) continue;
        const parentEdge = edges.find((edge) => edge.target === step.id);
        const parent = parentEdge ? positionById.get(parentEdge.source) : undefined;
        const parentColumn = parent ? Math.round((parent.x - anchor.x) / columnSpacing) : 0;
        let row = parent ? Math.round((parent.y - anchor.y) / rowSpacing) + 1 : rowCount;
        let column = parentColumn;
        while (occupied.has(`${row}:${column}`)) {
            column += 1;
            if (column >= columns) {
                column = 0;
                row += 1;
            }
        }
        positionById.set(step.id, { x: anchor.x + column * columnSpacing, y: anchor.y + row * rowSpacing });
        occupied.add(`${row}:${column}`);
    }

    const laidOutSteps = steps.map((step) => ({ ...step, position: positionById.get(step.id) || step.position }));
    const laidOutEdges = edges.map((edge) => {
        const source = positionById.get(edge.source);
        const target = positionById.get(edge.target);
        if (!source || !target) return edge;
        return { ...edge, ...getDirectionalHandles(source, target) };
    });

    return { steps: laidOutSteps, edges: laidOutEdges };
}
