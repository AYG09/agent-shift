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
    reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { buildSopNodes, buildSopEdges, syncSopCanvasNodes } from '@/lib/sop-canvas-utils';
import { classifySopStepType } from '@/lib/graph-validation';
import { SopStepNode } from './SopStepNode';
import { SopReworkEdge } from './SopReworkEdge';
import { AI_APPLICATION_MODES } from '@/lib/sop-agentization';

interface SopCanvasProps {
    showMiniMap: boolean;
    showBranchLabels: boolean;
}

const nodeTypes = {
    sopStep: SopStepNode,
};

const edgeTypes = {
    sopRework: SopReworkEdge,
};

export const SopCanvas: React.FC<SopCanvasProps> = ({ showMiniMap, showBranchLabels }) => {
    const document = useSopPrototypeStore((state) => state.document);
    const selectedStepId = useSopPrototypeStore((state) => state.selectedStepId);
    const selectedEdgeId = useSopPrototypeStore((state) => state.selectedEdgeId);
    const selectedSourceActivityId = useSopPrototypeStore((state) => state.selectedSourceActivityId);
    const readOnly = useSopPrototypeStore((state) => state.customerReviewMode);
    const selectStep = useSopPrototypeStore((state) => state.selectStep);
    const selectEdge = useSopPrototypeStore((state) => state.selectEdge);
    const updateStep = useSopPrototypeStore((state) => state.updateStep);
    const addEdge = useSopPrototypeStore((state) => state.addEdge);
    const deleteEdge = useSopPrototypeStore((state) => state.deleteEdge);
    const updateEdge = useSopPrototypeStore((state) => state.updateEdge);
    const [connectionNotice, setConnectionNotice] = React.useState<string | null>(null);

    const initialNodes = useMemo(() => buildSopNodes(document, selectedStepId, selectedSourceActivityId), [document, selectedStepId, selectedSourceActivityId]);
    const initialEdges = useMemo(() => buildSopEdges(document, selectedEdgeId, showBranchLabels), [document, selectedEdgeId, showBranchLabels]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const edgeOptions = useMemo(
        () =>
            document?.edges.map((edge, index) => {
                const source = document.steps.find((step) => step.id === edge.source)?.title || edge.source;
                const target = document.steps.find((step) => step.id === edge.target)?.title || edge.target;
                return { id: edge.id, label: `${index + 1}. ${source} → ${target}` };
            }) || [],
        [document]
    );

    // Synchronize store updates into React Flow state
    useEffect(() => {
        if (!document) return;
        setNodes((prevNodes) => syncSopCanvasNodes(document, selectedStepId, prevNodes, selectedSourceActivityId));
    }, [document, selectedStepId, selectedSourceActivityId, setNodes]);

    useEffect(() => {
        if (!document) return;
        setEdges(buildSopEdges(document, selectedEdgeId, showBranchLabels));
    }, [document, selectedEdgeId, showBranchLabels, setEdges]);

    // Node Drag Stop -> save position to store
    const handleNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node) => {
            if (readOnly) return;
            updateStep(node.id, {
                position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
            });
        },
        [updateStep, readOnly]
    );

    // Edge Connection & Handle Preservation - 생성 시점에 명백히 잘못된 연결(자기 자신, 시작으로
    // 들어가는 edge, 종료에서 나가는 edge, 동일 source-target 중복)을 차단하고, decision 노드에서
    // 시작하는 새 edge는 절대 branchType='default'로 만들지 않는다 - 기존 outgoing edge 상태를 보고
    // yes -> no -> condition 순서로 아직 채워지지 않은 유형을 자동 배정한다(마지막 fallback은
    // condition이며, label/condition을 비워 두어 Inspector가 즉시 "condition 분기에는 label과
    // condition이 모두 필요합니다" 경고를 보여주게 한다 - validateSopDecisionBranches 재사용).
    const handleConnect = useCallback(
        (connection: Connection) => {
            if (!document || readOnly) return;
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
        [addEdge, document, readOnly]
    );

    const handleReconnect = useCallback(
        (oldEdge: Edge, connection: Connection) => {
            if (!document || readOnly || !connection.source || !connection.target) return;
            const { source, target } = connection;
            if (source === target) {
                setConnectionNotice('같은 단계 안에서는 연결점을 변경할 수 없습니다.');
                return;
            }
            if (document.steps.find((step) => step.id === source)?.terminalType === 'end') {
                setConnectionNotice('종료 단계에서는 연결을 시작할 수 없습니다.');
                return;
            }
            if (document.steps.find((step) => step.id === target)?.terminalType === 'start') {
                setConnectionNotice('시작 단계로 연결할 수 없습니다.');
                return;
            }
            if (document.edges.some((edge) => edge.id !== oldEdge.id && edge.source === source && edge.target === target)) {
                setConnectionNotice('같은 두 단계 사이에 이미 연결선이 있습니다.');
                return;
            }

            // Keep the React Flow edge endpoints in sync immediately, then
            // persist the same connection and selected handle IDs in the SOP.
            setEdges((current) => reconnectEdge(oldEdge, connection, current));
            updateEdge(oldEdge.id, {
                source,
                target,
                sourceHandle: connection.sourceHandle || undefined,
                targetHandle: connection.targetHandle || undefined,
                manualRouting: true,
            });
            setConnectionNotice('연결점이 변경되었습니다. 연결선 끝을 다시 드래그해 조정할 수 있습니다.');
        },
        [document, setEdges, updateEdge, readOnly]
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
            if (readOnly) return;
            deletedEdges.forEach((e) => deleteEdge(e.id));
        },
        [deleteEdge, readOnly]
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
            <div className="pointer-events-none absolute top-3 left-3 z-30 rounded-lg border border-zinc-200 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 shadow-sm">
                {readOnly
                    ? '고객 검토 모드: 열람과 선택만 가능하며 편집은 비활성화되어 있습니다.'
                    : '연결선 끝을 드래그하면 다른 연결점으로 옮길 수 있습니다.'}
            </div>
            <label className="absolute top-3 right-3 z-30 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 px-2 py-1.5 text-[11px] font-medium text-zinc-600 shadow-sm">
                겹친 연결선 선택
                <select
                    value={selectedEdgeId || ''}
                    onChange={(event) => selectEdge(event.target.value || null)}
                    className="max-w-52 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 outline-none focus:border-indigo-500"
                    aria-label="연결선 목록에서 선택"
                >
                    <option value="">연결선 선택</option>
                    {edgeOptions.map((edge) => (
                        <option key={edge.id} value={edge.id}>{edge.label}</option>
                    ))}
                </select>
            </label>
            {document.agentizationReview && (
                <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex max-w-[560px] flex-wrap items-center gap-1.5 rounded-md border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-[10px] shadow-sm">
                    <span className="mr-1 font-semibold text-zinc-600">AI 적용 방식</span>
                    {AI_APPLICATION_MODES.map((mode) => (
                        <span key={mode.id} className={`rounded-sm border px-1.5 py-0.5 font-semibold ${mode.badgeClass}`}>{mode.shortLabel}</span>
                    ))}
                </div>
            )}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleNodeDragStop}
                onConnect={handleConnect}
                onReconnect={handleReconnect}
                reconnectRadius={16}
                onEdgeClick={handleEdgeClick}
                onEdgesDelete={handleEdgesDelete}
                onPaneClick={handlePaneClick}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                edgesReconnectable={!readOnly}
                elementsSelectable
                deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
                // fitViewOptions.minZoom floors the AUTOMATIC initial "fit everything"
                // zoom so a 12-15+ node SOP never opens too small to read step titles
                // (a Task Gate with many Activities routinely produces 15+ Sub Action
                // nodes) — the interactive minZoom prop below stays the true floor for
                // manual zoom-out/the Controls "fit view" button, so a member can still
                // explicitly zoom out further to see the whole flow at once; this only
                // changes what happens on first load. No node content-detail display is
                // reintroduced — titles just stay legible at the zoom the canvas opens at.
                fitView
                fitViewOptions={{ padding: 0.2, minZoom: 0.7 }}
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
