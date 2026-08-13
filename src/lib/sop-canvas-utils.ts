import { Node, Edge, MarkerType } from '@xyflow/react';
import { SopDocument } from './sop-types';
import { getDirectionalHandles } from './flow-layout';
import { isSopReworkEdge, routeSopReworkEdge } from './sop-rework-routing';
import { getSopNodeSize } from './sop-node-geometry';

export { getSopNodeSize };

const reworkRouteCache = new WeakMap<SopDocument, Map<string, ReturnType<typeof routeSopReworkEdge>>>();

function isLegacyDefaultHandlePair(sourceHandle?: string, targetHandle?: string) {
    return (!sourceHandle && !targetHandle) || (sourceHandle === 'bottom' && targetHandle === 'top-target');
}

/**
 * Resolves each selected Task's Activity id to its catalog `order`/`name` ONCE
 * per document build, so SopStepNode never has to parse an id string (a
 * normalized Activity id is a stable identifier/hash, not an ordinal — slicing
 * its last path segment could show a wildly wrong number) and never has to
 * subscribe to the whole Store itself just to look this up per node.
 */
function buildActivityMetaLookup(doc: SopDocument): Map<string, { order: number; name: string }> {
    const task = doc.workLibrary.taskCatalog.find((item) => item.id === doc.workLibrary.taskId);
    const lookup = new Map<string, { order: number; name: string }>();
    (task?.activities ?? []).forEach((activity, index) => {
        lookup.set(activity.id, { order: activity.order ?? index + 1, name: activity.name });
    });
    return lookup;
}

/** `'unmapped'` means the step DOES reference an Activity id, but that id no longer resolves in the current catalog — a real fallback, never a fabricated ordinal. */
export type SopNodeActivityBadgeData = number | 'unmapped' | undefined;

function resolveActivityBadge(step: { sourceActivityIds?: string[] }, activityMetaLookup: Map<string, { order: number; name: string }>): SopNodeActivityBadgeData {
    const primaryId = step.sourceActivityIds?.[0];
    if (!primaryId) return undefined;
    const meta = activityMetaLookup.get(primaryId);
    return meta !== undefined ? meta.order : 'unmapped';
}

/** Data payload for the read-only Activity group container nodes. */
export interface SopActivityGroupNodeData {
    label: string;
    /** Only the FIRST segment of an Activity that wraps across layout rows shows the full label; continuations show a compact "계속" chip. */
    showFullLabel: boolean;
    order: number;
    width: number;
    height: number;
    [key: string]: unknown;
}

/**
 * Builds the read-only background container nodes that visualize which
 * Activity each Sub Action belongs to — the customer's expected SOP design
 * shows Sub Actions grouped inside their parent Activity section. Groups are
 * computed from CONTIGUOUS runs of steps sharing the same primary Activity
 * (generation orders Sub Actions per Activity, so runs are contiguous along
 * the reading path). layoutSopGraph wraps rows at Activity-block boundaries,
 * so a generated document renders ONE container per Activity; the per-row
 * split below is only a safety net for hand-dragged nodes or an Activity
 * longer than a full layout row — without it, a single box would have to
 * cover unrelated nodes from other rows. Terminals and unmapped steps never
 * join a group. Pure function of the document — canvas and tests run the
 * same code.
 */
export function buildSopActivityGroupNodes(doc: SopDocument | null): Node[] {
    if (!doc || doc.structureVersion !== 'activity-subaction-v1') return [];
    const activityMetaLookup = buildActivityMetaLookup(doc);

    // 1. Contiguous runs of the same primary Activity along the step order.
    type Segment = { activityId: string; steps: SopDocument['steps'] };
    const runs: Segment[] = [];
    doc.steps.forEach((step) => {
        const primaryId = !step.terminalType ? step.sourceActivityIds?.[0] : undefined;
        if (!primaryId || !activityMetaLookup.has(primaryId)) return;
        const last = runs[runs.length - 1];
        if (last && last.activityId === primaryId) last.steps.push(step);
        else runs.push({ activityId: primaryId, steps: [step] });
    });

    // 2. Split each run by layout row (nodes in the same row share y within half
    //    a row spacing) so the container hugs its own row segment.
    const ROW_CLUSTER_TOLERANCE = 100;
    const PADDING_X = 16;
    const PADDING_TOP = 30;
    const PADDING_BOTTOM = 18;
    const nodes: Node[] = [];
    const segmentCountByActivity = new Map<string, number>();

    runs.forEach((run) => {
        const rows = new Map<number, SopDocument['steps']>();
        run.steps.forEach((step) => {
            const y = step.position?.y ?? 0;
            const rowKey = [...rows.keys()].find((key) => Math.abs(key - y) <= ROW_CLUSTER_TOLERANCE);
            if (rowKey !== undefined) rows.get(rowKey)!.push(step);
            else rows.set(y, [step]);
        });

        [...rows.values()].forEach((rowSteps) => {
            const meta = activityMetaLookup.get(run.activityId)!;
            const minX = Math.min(...rowSteps.map((s) => s.position.x));
            const minY = Math.min(...rowSteps.map((s) => s.position.y));
            const maxX = Math.max(...rowSteps.map((s) => s.position.x + getSopNodeSize(s).width));
            const maxY = Math.max(...rowSteps.map((s) => s.position.y + getSopNodeSize(s).height));
            const segmentIndex = segmentCountByActivity.get(run.activityId) ?? 0;
            segmentCountByActivity.set(run.activityId, segmentIndex + 1);

            nodes.push({
                id: `sop-activity-group:${run.activityId}:${segmentIndex}`,
                type: 'sopActivityGroup',
                position: { x: minX - PADDING_X, y: minY - PADDING_TOP },
                data: {
                    label: `${meta.order}. ${meta.name}`,
                    showFullLabel: segmentIndex === 0,
                    order: meta.order,
                    width: maxX - minX + PADDING_X * 2,
                    height: maxY - minY + PADDING_TOP + PADDING_BOTTOM,
                } satisfies SopActivityGroupNodeData,
                draggable: false,
                selectable: false,
                focusable: false,
                deletable: false,
                zIndex: -10,
                style: { pointerEvents: 'none' },
            });
        });
    });

    return nodes;
}

export function buildSopNodes(doc: SopDocument | null, selectedStepId: string | null, selectedSourceActivityId: string | null = null): Node[] {
    if (!doc) return [];
    return syncSopCanvasNodes(doc, selectedStepId, [], selectedSourceActivityId);
}

/**
 * store의 SopDocument를 React Flow 노드 배열로 동기화한다.
 *
 * SopCanvas의 useEffect(store -> React Flow state 동기화)가 그대로 쓰는 함수다.
 * 컴포넌트와 테스트가 정확히 같은 코드를 실행하도록, 드래그 중인 노드의 위치를
 * 유지하는 병합 로직(prevNodes)을 컴포넌트 밖으로 뺐다 - 이전에는 이 병합 로직이
 * useEffect 안에만 있어서 buildSopNodes()만 호출하는 테스트로는 검증할 수 없었다.
 */
export function syncSopCanvasNodes(doc: SopDocument, selectedStepId: string | null, prevNodes: Node[], selectedSourceActivityId: string | null = null): Node[] {
    const activityMetaLookup = buildActivityMetaLookup(doc);
    return doc.steps.map((step, idx) => {
        const existing = prevNodes.find((n) => n.id === step.id);
        const posX = existing && existing.dragging ? existing.position.x : (step.position?.x ?? idx * 240 + 100);
        const posY = existing && existing.dragging ? existing.position.y : (step.position?.y ?? 150);

        return {
            id: step.id,
            type: 'sopStep',
            position: { x: posX, y: posY },
            data: {
                step,
                index: idx + 1,
                highlightedByActivity: Boolean(selectedSourceActivityId && step.sourceActivityIds?.includes(selectedSourceActivityId)),
                activityBadgeOrder: resolveActivityBadge(step, activityMetaLookup),
            },
            selected: step.id === selectedStepId,
            // 노드는 React Flow의 키보드/UI 삭제(Backspace 등)로 직접 지울 수 없다 - Store와
            // 화면이 어긋나는(화면에서만 사라지고 Store에는 남는) 문제를 원천 차단하기 위해,
            // 모든 단계 삭제는 SopStepInspector의 명시적 삭제 버튼(store.deleteStep, 시작·종료
            // 노드 보호 포함)을 거치도록 강제한다.
            deletable: false,
        };
    });
}

export function buildSopEdges(
    doc: SopDocument | null,
    selectedEdgeId: string | null,
    showBranchLabels: boolean = true
): Edge[] {
    if (!doc) return [];
    const stepById = new Map(doc.steps.map((step) => [step.id, step]));
    const outgoingOrder = new Map<string, number>();
    let cachedReworkRoutes = reworkRouteCache.get(doc);
    if (!cachedReworkRoutes) {
        cachedReworkRoutes = new Map();
        const occupiedReworkSegments = new Set<string>();
        let reworkLaneIndex = 0;
        doc.edges.forEach((edge) => {
            if (!isSopReworkEdge(edge, doc.edges)) return;
            cachedReworkRoutes!.set(
                edge.id,
                routeSopReworkEdge(edge, doc.steps, reworkLaneIndex++, occupiedReworkSegments)
            );
        });
        reworkRouteCache.set(doc, cachedReworkRoutes);
    }

    return doc.edges.map((edge) => {
        const isSelected = edge.id === selectedEdgeId;
        const isYes =
            edge.branchType === 'yes' ||
            edge.label?.includes('YES') ||
            edge.label?.includes('합격') ||
            edge.label?.includes('수락');
        const isNo =
            edge.branchType === 'no' ||
            edge.label?.includes('NO') ||
            edge.label?.includes('불합격') ||
            edge.label?.includes('거절');
        const isRework =
            edge.branchType === 'condition' ||
            edge.label?.includes('재검토') ||
            edge.label?.includes('재협의');

        const isLoopRework = isSopReworkEdge(edge, doc.edges);
        let strokeColor = isSelected ? '#4f46e5' : '#64748b';
        if (!isSelected) {
            if (edge.branchType === 'no') strokeColor = '#ef4444';
            else if (edge.branchType === 'condition') strokeColor = '#f59e0b';
            else if (edge.branchType === 'yes') strokeColor = '#10b981';
            else if (isYes) strokeColor = '#10b981';
            else if (isNo) strokeColor = '#ef4444';
            else if (isRework) strokeColor = '#f59e0b';
        }

        const sourceStep = stepById.get(edge.source);
        const targetStep = stepById.get(edge.target);
        const sourceSize = sourceStep ? getSopNodeSize(sourceStep) : undefined;
        const targetSize = targetStep ? getSopNodeSize(targetStep) : undefined;
        const autoHandles =
            sourceStep && targetStep && sourceSize && targetSize
                ? getDirectionalHandles(
                      {
                          x: sourceStep.position.x + sourceSize.width / 2,
                          y: sourceStep.position.y + sourceSize.height / 2,
                      },
                      {
                          x: targetStep.position.x + targetSize.width / 2,
                          y: targetStep.position.y + targetSize.height / 2,
                      }
                  )
                : { sourceHandle: 'bottom', targetHandle: 'top-target' };
        const preserveExplicitHandles = !isLegacyDefaultHandlePair(edge.sourceHandle, edge.targetHandle);
        const routeIndex = outgoingOrder.get(edge.source) || 0;
        outgoingOrder.set(edge.source, routeIndex + 1);
        // A member's endpoint choice is authoritative. Auto-routing remains a
        // draft aid and must never pull a manually reconnected edge back to its
        // former ports.
        const reworkRoute = isLoopRework && !edge.manualRouting ? cachedReworkRoutes.get(edge.id) || null : null;

        return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: reworkRoute?.sourceHandle || (preserveExplicitHandles ? edge.sourceHandle : autoHandles.sourceHandle),
            targetHandle: reworkRoute?.targetHandle || (preserveExplicitHandles ? edge.targetHandle : autoHandles.targetHandle),
            type: reworkRoute ? 'sopRework' : 'smoothstep',
            reconnectable: true,
            pathOptions: { borderRadius: 16, offset: 24 + (routeIndex % 3) * 12 },
            zIndex: isSelected ? 1000 : 0,
            data: reworkRoute
                ? { branchType: edge.branchType, label: showBranchLabels ? edge.label : undefined, reworkRoute }
                : undefined,
            label: showBranchLabels ? edge.label : undefined,
            labelStyle: { fill: strokeColor, fontWeight: 700, fontSize: 11 },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 },
            labelBgPadding: [6, 3],
            animated: isLoopRework,
            selected: isSelected,
            style: {
                stroke: strokeColor,
                strokeWidth: isSelected ? 3.5 : isYes || isNo || isRework ? 2.5 : 2,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: strokeColor,
                width: 16,
                height: 16,
            },
        };
    });
}
