'use client';

import React, { useMemo, useCallback, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Connection,
    Edge,
    Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { buildSopNodes, buildSopEdges, syncSopCanvasNodes } from '@/lib/sop-canvas-utils';
import { classifySopStepType } from '@/lib/graph-validation';
import { SopStepNode } from './SopStepNode';

interface SopCanvasProps {
    showMiniMap: boolean;
    showBranchLabels: boolean;
}

const nodeTypes = {
    sopStep: SopStepNode,
};

export const SopCanvas: React.FC<SopCanvasProps> = ({ showMiniMap, showBranchLabels }) => {
    const {
        document,
        selectedStepId,
        selectedEdgeId,
        selectStep,
        selectEdge,
        updateStep,
        addEdge,
        deleteEdge,
    } = useSopPrototypeStore();
    const [connectionNotice, setConnectionNotice] = React.useState<string | null>(null);

    const initialNodes = useMemo(() => buildSopNodes(document, selectedStepId), [document, selectedStepId]);
    const initialEdges = useMemo(() => buildSopEdges(document, selectedEdgeId, showBranchLabels), [document, selectedEdgeId, showBranchLabels]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Synchronize store updates into React Flow state
    useEffect(() => {
        if (!document) return;
        setNodes((prevNodes) => syncSopCanvasNodes(document, selectedStepId, prevNodes));
    }, [document, selectedStepId, setNodes]);

    useEffect(() => {
        if (!document) return;
        setEdges(buildSopEdges(document, selectedEdgeId, showBranchLabels));
    }, [document, selectedEdgeId, showBranchLabels, setEdges]);

    // Node Drag Stop -> save position to store
    const handleNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node) => {
            updateStep(node.id, {
                position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
            });
        },
        [updateStep]
    );

    // Edge Connection & Handle Preservation - 생성 시점에 명백히 잘못된 연결(자기 자신, 시작으로
    // 들어가는 edge, 종료에서 나가는 edge, 동일 source-target 중복)을 차단하고, decision 노드에서
    // 시작하는 새 edge는 절대 branchType='default'로 만들지 않는다 - 기존 outgoing edge 상태를 보고
    // yes -> no -> condition 순서로 아직 채워지지 않은 유형을 자동 배정한다(마지막 fallback은
    // condition이며, label/condition을 비워 두어 Inspector가 즉시 "condition 분기에는 label과
    // condition이 모두 필요합니다" 경고를 보여주게 한다 - validateSopDecisionBranches 재사용).
    const handleConnect = useCallback(
        (connection: Connection) => {
            if (!document) return;
            const { source, target } = connection;
            if (!source || !target) return;

            if (source === target) {
                setConnectionNotice('같은 단계로는 연결선을 만들 수 없습니다.');
                return;
            }

            const sourceStep = document.steps.find((s) => s.id === source);
            const targetStep = document.steps.find((s) => s.id === target);

            if (targetStep?.terminalType === 'start') {
                setConnectionNotice('시작 노드로 들어오는 연결선은 만들 수 없습니다.');
                return;
            }
            if (sourceStep?.terminalType === 'end') {
                setConnectionNotice('종료 노드에서 나가는 연결선은 만들 수 없습니다.');
                return;
            }
            if (document.edges.some((e) => e.source === source && e.target === target)) {
                setConnectionNotice('두 단계 사이에 이미 동일한 연결선이 있습니다.');
                return;
            }

            const isDecisionSource = sourceStep ? classifySopStepType(sourceStep) === 'decision' : false;
            let branchType: 'yes' | 'no' | 'condition' | 'default' = 'default';
            let label = '연결';

            if (isDecisionSource) {
                const existingOutgoing = document.edges.filter((e) => e.source === source);
                const hasYes = existingOutgoing.some((e) => e.branchType === 'yes');
                const hasNo = existingOutgoing.some((e) => e.branchType === 'no');
                if (!hasYes) {
                    branchType = 'yes';
                    label = 'YES';
                } else if (!hasNo) {
                    branchType = 'no';
                    label = 'NO';
                } else {
                    branchType = 'condition';
                    label = '';
                }
            }

            const newEdgeId = `e-${source}-${target}-${Date.now()}`;
            addEdge({
                id: newEdgeId,
                source,
                target,
                sourceHandle: connection.sourceHandle || undefined,
                targetHandle: connection.targetHandle || undefined,
                label,
                branchType,
            });
        },
        [addEdge, document]
    );

    // Edge Selection
    const handleEdgeClick = useCallback(
        (e: React.MouseEvent, edge: Edge) => {
            e.stopPropagation();
            selectEdge(edge.id);
        },
        [selectEdge]
    );

    // Edge Deletion
    const handleEdgesDelete = useCallback(
        (deletedEdges: Edge[]) => {
            deletedEdges.forEach((e) => deleteEdge(e.id));
        },
        [deleteEdge]
    );

    const handlePaneClick = useCallback(() => {
        selectStep(null);
        selectEdge(null);
    }, [selectStep, selectEdge]);

    useEffect(() => {
        if (!connectionNotice) return;
        const timer = window.setTimeout(() => setConnectionNotice(null), 4000);
        return () => window.clearTimeout(timer);
    }, [connectionNotice]);

    if (!document) return null;

    return (
        <div className="w-full h-full relative bg-zinc-50/50">
            {connectionNotice && (
                <div
                    role="status"
                    className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-rose-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-lg"
                >
                    {connectionNotice}
                </div>
            )}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleNodeDragStop}
                onConnect={handleConnect}
                onEdgeClick={handleEdgeClick}
                onEdgesDelete={handleEdgesDelete}
                onPaneClick={handlePaneClick}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={1.8}
            >
                <Background color="#cbd5e1" gap={24} size={1} />
                <Controls className="!bg-white !border !border-zinc-200 !shadow-sm !rounded-xl" />
                {showMiniMap && (
                    <MiniMap
                        className="!bg-white/90 !border !border-zinc-200 !rounded-xl !shadow-md"
                        nodeColor={() => '#6366f1'}
                    />
                )}
            </ReactFlow>
        </div>
    );
};
