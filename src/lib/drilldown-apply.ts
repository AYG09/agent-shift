/**
 * 드릴다운(상세분석) 결과를 그래프에 적용하는 순수 로직.
 *
 * subEdges가 있으면 분기(YES/NO)와 되돌아가는 재시도 경로를 그대로 반영하고,
 * 없으면(레거시/단순 순차 응답) 기존처럼 subSteps 순서대로 체인 연결한다.
 *
 * FlowCanvas/page.tsx의 UI 상태(Zustand store, 다이얼로그 등)와 분리된 순수 함수라서
 * 단위 테스트로 분기·순환·재연결 로직을 검증할 수 있다.
 */

import { aiNodeToFlowNode, type FlowEdge, type FlowNode, type EdgeBranchType } from './store';
import { layoutFlowGraph } from './flow-layout';

export interface DrilldownSubStepInput {
    id: string;
    label: string;
    description?: string;
    type?: string;
    shape?: string;
    terminalType?: 'start' | 'end';
    ioType?: 'input' | 'output';
    stressLevel?: 'low' | 'medium' | 'high';
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    agentDescription?: string;
    metrics?: FlowNode['metrics'];
}

export interface DrilldownSubEdgeInput {
    source: string;
    target: string;
    label?: string;
    branchType?: EdgeBranchType;
    condition?: string;
}

export interface ApplyDrilldownInput {
    parentNodeId: string;
    parentPosition: { x: number; y: number };
    subSteps: DrilldownSubStepInput[];
    subEdges?: DrilldownSubEdgeInput[];
    /** 부모 노드로 들어오던(target === parentNodeId) 기존 edge */
    incomingEdges: FlowEdge[];
    /** 부모 노드에서 나가던(source === parentNodeId) 기존 edge */
    outgoingEdges: FlowEdge[];
}

export interface ApplyDrilldownResult {
    nodes: FlowNode[];
    edges: FlowEdge[];
}

export function applyDrilldownSubSteps(input: ApplyDrilldownInput): ApplyDrilldownResult {
    const { parentNodeId, parentPosition, subSteps, incomingEdges, outgoingEdges } = input;
    const rawSubEdges = input.subEdges || [];

    // AI가 준 subStep.id(예: "screening")는 다른 노드와 충돌할 수 있으므로 부모 id로 네임스페이스를 준다.
    const idMap = new Map(subSteps.map((step, idx) => [step.id || `step-${idx}`, `${parentNodeId}-${step.id || idx}`]));

    const newNodes: FlowNode[] = subSteps.map((step) => {
        const localId = step.id;
        const rawNode = {
            id: idMap.get(localId),
            label: step.label,
            description: step.description,
            type: step.type || 'process',
            shape: step.shape,
            terminalType: step.terminalType,
            ioType: step.ioType,
            stressLevel: step.stressLevel || 'low',
            collaborationType: step.collaborationType,
            agentDescription: step.agentDescription,
            metrics: step.metrics,
        };
        // 좌표는 아래 layoutFlowGraph가 분기 구조에 맞춰 다시 계산하므로 임시값이면 충분하다.
        return aiNodeToFlowNode(rawNode as Record<string, unknown>, parentPosition);
    });

    const entryLocalId = subSteps[0]?.id || 'step-0';

    // 양쪽 다 subSteps id를 가리키는 subEdge만 "내부(재시도 포함) 연결"로 취급한다.
    const internalRaw = rawSubEdges.filter((e) => idMap.has(e.source) && idMap.has(e.target));
    // source는 유효하지만 target이 subSteps에 없으면 "이 하위 분해를 벗어나 상위 노드의
    // 원래 다음 단계로 나가는 분기" 표시로 취급한다(target 문자열 자체는 쓰지 않는다).
    const exitMarkers = rawSubEdges.filter((e) => idMap.has(e.source) && !idMap.has(e.target));

    let internalFlowEdges: FlowEdge[];
    let exitLocalIds: string[];

    if (rawSubEdges.length > 0) {
        internalFlowEdges = internalRaw.map((e) => ({
            id: `edge-${idMap.get(e.source)}-${idMap.get(e.target)}`,
            source: idMap.get(e.source) as string,
            target: idMap.get(e.target) as string,
            label: e.label,
            branchType: e.branchType,
            condition: e.condition,
        }));

        const hasOutgoing = new Set([...internalRaw.map((e) => e.source), ...exitMarkers.map((e) => e.source)]);
        exitLocalIds = subSteps
            .map((s) => s.id)
            .filter((localId) => exitMarkers.some((e) => e.source === localId) || !hasOutgoing.has(localId));
        if (exitLocalIds.length === 0) {
            exitLocalIds = [subSteps[subSteps.length - 1]?.id];
        }
    } else {
        // 레거시/단순 순차 응답: subEdges가 없으면 기존처럼 순서대로 체인 연결한다.
        internalFlowEdges = newNodes.slice(0, -1).map((node, idx) => ({
            id: `edge-${node.id}-to-${newNodes[idx + 1].id}`,
            source: node.id,
            target: newNodes[idx + 1].id,
        }));
        exitLocalIds = [subSteps[subSteps.length - 1]?.id];
    }

    const entryNodeId = idMap.get(entryLocalId) as string;

    // exit-marker subEdge가 준 label/branchType/condition(보통 YES)을, 재연결되는 실제 edge에도 그대로 실어준다.
    const exitMetaByLocalId = new Map<string, { label?: string; branchType?: EdgeBranchType; condition?: string }>();
    exitMarkers.forEach((e) => {
        exitMetaByLocalId.set(e.source, { label: e.label, branchType: e.branchType, condition: e.condition });
    });

    // 분기 구조를 반영해 새 노드/내부 edge만 재배치한다 (기존 노드 좌표는 건드리지 않음)
    const { nodes: laidOutNodes, edges: laidOutInternalEdges } = layoutFlowGraph(
        newNodes,
        internalFlowEdges,
        { anchor: parentPosition }
    );

    const reconnectedIncoming: FlowEdge[] = incomingEdges.map((e) => ({
        ...e,
        target: entryNodeId,
        sourceHandle: undefined,
        targetHandle: undefined,
    }));

    // "더 이상 내부로 나가는 edge가 없는" 완료 노드들에서 기존 outgoing이 나가도록 연결한다.
    // NO 재시도로 되돌아가는 노드는 내부 outgoing edge가 있으므로 여기 포함되지 않는다.
    const reconnectedOutgoing: FlowEdge[] = outgoingEdges.flatMap((e) =>
        exitLocalIds.flatMap((localId) => {
            const exitNodeId = idMap.get(localId);
            if (!exitNodeId) return [];
            const meta = exitMetaByLocalId.get(localId);
            return [{
                ...e,
                id: `${e.id}-${exitNodeId}`,
                source: exitNodeId,
                label: meta?.label ?? e.label,
                branchType: meta?.branchType ?? e.branchType,
                condition: meta?.condition ?? e.condition,
                sourceHandle: undefined,
                targetHandle: undefined,
            }];
        })
    );

    return {
        nodes: laidOutNodes,
        edges: [...laidOutInternalEdges, ...reconnectedIncoming, ...reconnectedOutgoing],
    };
}
