import { getDirectionalHandles } from './flow-layout';
import { SopEdge, SopStepData } from './sop-types';
import { isSecondaryBranch } from './sop-rework-routing';

type Point = { x: number; y: number };

/**
 * Places newly generated SOPs in a compact, multi-row reading path.
 * AI supplies sequence and branch semantics; this deterministic pass owns the
 * visual coordinates so a plausible-looking AI coordinate never creates an
 * unreadable single-line diagram.
 *
 * Row wrapping is Activity-block-aware: consecutive steps sharing the same
 * primary Activity never split across a row wrap (the whole block moves to
 * the next row instead), so the canvas can draw one Activity = one group
 * container without per-row segmentation. Steps without an Activity mapping
 * pack exactly like the previous plain serpentine fill.
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

    const rowCountTarget = Math.min(3, Math.max(1, Math.ceil(primary.length / 4)));
    const columns = Math.max(3, Math.ceil(primary.length / rowCountTarget));
    const columnSpacing = 270;
    const rowSpacing = 210;
    const anchor: Point = { x: 100, y: 110 };
    const positionById = new Map<string, Point>();
    const occupied = new Set<string>();

    // Activity 블록 단위 줄바꿈: 주 경로를 "같은 primary Activity를 공유하는 연속
    // 구간(블록)"으로 묶고, 행에 남은 칸이 블록 전체를 담기에 부족하면 블록을 통째로
    // 다음 행으로 내린다. 그래야 캔버스의 Activity 그룹 컨테이너가 행을 넘어
    // 쪼개지지 않고("(계속)" 세그먼트 없이) 한 Activity = 한 박스로 그려진다.
    // terminal과 Activity 미매핑 단계는 1칸짜리 블록이므로, 매핑이 없는 레거시
    // 문서에서는 이 패킹이 기존의 단순 serpentine 채우기와 동일하게 동작한다.
    // 한 행(columns)보다 긴 블록만 예외적으로 행을 넘어간다(그 경우에만 그룹
    // 컨테이너의 행별 분할이 안전망으로 남는다).
    const blocks: { key: string | undefined; ids: string[] }[] = [];
    primary.forEach((id) => {
        const step = byId.get(id);
        const key = step && !step.terminalType ? step.sourceActivityIds?.[0] : undefined;
        const last = blocks[blocks.length - 1];
        if (last && key !== undefined && last.key === key) last.ids.push(id);
        else blocks.push({ key, ids: [id] });
    });

    let packRow = 0;
    let packCol = 0;
    blocks.forEach((block) => {
        if (packCol > 0 && packCol + block.ids.length > columns && block.ids.length <= columns) {
            packRow += 1;
            packCol = 0;
        }
        block.ids.forEach((id) => {
            if (packCol >= columns) {
                packRow += 1;
                packCol = 0;
            }
            const column = packRow % 2 === 0 ? packCol : columns - 1 - packCol;
            positionById.set(id, { x: anchor.x + column * columnSpacing, y: anchor.y + packRow * rowSpacing });
            occupied.add(`${packRow}:${column}`);
            packCol += 1;
        });
    });
    const rowCount = packRow + 1;

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
