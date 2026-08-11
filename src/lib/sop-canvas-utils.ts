import { Node, Edge, MarkerType } from '@xyflow/react';
import { SopDisplayMode, SopDocument, SopStepData } from './sop-types';
import { getDirectionalHandles } from './flow-layout';
import { isSopReworkEdge, routeSopReworkEdge } from './sop-rework-routing';

const reworkRouteCache = new WeakMap<SopDocument, Map<string, ReturnType<typeof routeSopReworkEdge>>>();

/** SopStepNode와 연결선 좌표 계산이 공유하는 실제 노드 크기. */
export function getSopNodeSize(step: Pick<SopStepData, 'shape'>, displayMode: SopDisplayMode) {
    // Detailed data is available through hover and the inspector. Canvas nodes
    // remain compact so workflow shape and edge routing stay legible.
    void displayMode;
    let width = 190;
    let height = 74;

    if (step.shape === 'decision') {
        width = Math.max(width, 160);
        height = Math.max(height, 120);
    }

    return { width, height };
}

function isLegacyDefaultHandlePair(sourceHandle?: string, targetHandle?: string) {
    return (!sourceHandle && !targetHandle) || (sourceHandle === 'bottom' && targetHandle === 'top-target');
}

export function buildSopNodes(doc: SopDocument | null, selectedStepId: string | null): Node[] {
    if (!doc) return [];
    return syncSopCanvasNodes(doc, selectedStepId, []);
}

/**
 * store의 SopDocument를 React Flow 노드 배열로 동기화한다.
 *
 * SopCanvas의 useEffect(store -> React Flow state 동기화)가 그대로 쓰는 함수다.
 * 컴포넌트와 테스트가 정확히 같은 코드를 실행하도록, 드래그 중인 노드의 위치를
 * 유지하는 병합 로직(prevNodes)을 컴포넌트 밖으로 뺐다 - 이전에는 이 병합 로직이
 * useEffect 안에만 있어서 buildSopNodes()만 호출하는 테스트로는 검증할 수 없었다.
 */
export function syncSopCanvasNodes(doc: SopDocument, selectedStepId: string | null, prevNodes: Node[]): Node[] {
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
                displayMode: doc.displayMode,
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
                routeSopReworkEdge(edge, doc.steps, doc.displayMode, reworkLaneIndex++, occupiedReworkSegments)
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
        const sourceSize = sourceStep ? getSopNodeSize(sourceStep, doc.displayMode) : undefined;
        const targetSize = targetStep ? getSopNodeSize(targetStep, doc.displayMode) : undefined;
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
        const reworkRoute = isLoopRework ? cachedReworkRoutes.get(edge.id) || null : null;

        return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: reworkRoute?.sourceHandle || (preserveExplicitHandles ? edge.sourceHandle : autoHandles.sourceHandle),
            targetHandle: reworkRoute?.targetHandle || (preserveExplicitHandles ? edge.targetHandle : autoHandles.targetHandle),
            type: reworkRoute ? 'sopRework' : 'smoothstep',
            reconnectable: true,
            pathOptions: { borderRadius: 16, offset: 24 + (routeIndex % 3) * 12 },
            zIndex: 0,
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
