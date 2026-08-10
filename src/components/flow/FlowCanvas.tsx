'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    BackgroundVariant,
    Panel,
    NodeChange,
    NodePositionChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from './CustomNodes';
import { edgeTypes } from './CustomEdges';
import NodeEditor from './NodeEditor';
import NodeContextMenu from './NodeContextMenu';
import EdgeContextMenu from './EdgeContextMenu';
import { Button } from '@/components/ui/button';
import { useAppStore, FlowNode, FlowEdge, FlowNodeType, DurationUnit, getReversedEdgeHandles } from '@/lib/store';
import { type FlowShape } from '@/lib/flow-shapes';

interface FlowCanvasProps {
    onGenerateFlow?: () => void;
    isLoading?: boolean;
    onNodeSplit?: (
        nodeId: string,
        flowType: 'asis' | 'tobe'
    ) => Promise<{ nodes: FlowNode[]; edges: FlowEdge[] } | null>;
    onDrilldown?: (nodeId: string) => void;
}

export default function FlowCanvas(props: FlowCanvasProps) {
    const { onNodeSplit, onDrilldown } = props;
    const {
        viewMode,
        drilldownPath,
        asIsNodes: storeAsIsNodes,
        asIsEdges: storeAsIsEdges,
        toBeNodes: storeToBeNodes,
        toBeEdges: storeToBeEdges,
        addNode,
        updateNode,
        deleteNode,
        updateNodePosition,
        setAsIsFlow,
        setToBeFlow,
        deleteEdge: storeDeleteEdge,
        reverseEdge: storeReverseEdge,
        selectedToBeNodeId,
        setSelectedToBeNodeId,
    } = useAppStore();

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
    const [newNodePosition, setNewNodePosition] = useState({ x: 250, y: 100 });

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        nodeId: string;
        nodeLabel: string;
    } | null>(null);

    // Edge Context Menu State
    const [edgeContextMenu, setEdgeContextMenu] = useState<{
        x: number;
        y: number;
        edgeId: string;
    } | null>(null);

    // 선택된 Edge ID
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

    const [isSplitting, setIsSplitting] = useState(false);
    const [isHeatmapMode, setIsHeatmapMode] = useState(false);

    const target = viewMode === 'tobe' ? 'tobe' : 'asis';

    // 현재 표시할 노드/엣지 (메모이제이션으로 동일 데이터 반복 렌더 시 리렌더 루프 방지)
    const currentNodes = useMemo(() => {
        if (viewMode === 'tobe') {
            return storeToBeNodes.map((n) => ({
                id: n.id,
                type: n.type,
                position: n.position,
                data: {
                    label: n.label,
                    description: n.description,
                    shape: n.shape,
                    terminalType: n.terminalType,
                    ioType: n.ioType,
                    stressLevel: n.stressLevel,
                    collaborationType: n.collaborationType,
                    agentDescription: n.agentDescription,
                    metrics: n.metrics,
                    isHeatmapMode,
                    isSelectedForStrategy: n.id === selectedToBeNodeId,
                },
            }));
        }

        return storeAsIsNodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: {
                label: n.label,
                description: n.description,
                shape: n.shape,
                terminalType: n.terminalType,
                ioType: n.ioType,
                stressLevel: n.stressLevel,
                metrics: n.metrics,
                isHeatmapMode,
            },
        }));
    }, [viewMode, storeAsIsNodes, storeToBeNodes, isHeatmapMode, selectedToBeNodeId]);

    const currentEdges = useMemo(() => {
        if (viewMode === 'tobe') {
            return storeToBeEdges.map((e) => ({ 
                id: e.id, 
                source: e.source, 
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
                animated: e.animated,
            }));
        }
        return storeAsIsEdges.map((e) => ({ 
            id: e.id, 
            source: e.source, 
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            animated: e.animated,
        }));
    }, [viewMode, storeAsIsEdges, storeToBeEdges]);

    const storeNodes = viewMode === 'tobe' ? storeToBeNodes : storeAsIsNodes;
    const storeEdges = viewMode === 'tobe' ? storeToBeEdges : storeAsIsEdges;

    const placeholderNodes: Node[] = useMemo(
        () => [
            {
                id: 'placeholder',
                type: 'process',
                position: { x: 250, y: 100 },
                data: { label: '✨ AI 플로우 생성을 클릭하세요', stressLevel: 'low' },
            },
        ],
        []
    );

    const displayNodes = currentNodes.length > 0 ? currentNodes : placeholderNodes;
    const displayEdges = currentNodes.length > 0 ? currentEdges : [];

    const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes as Node[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges as Edge[]);

    useEffect(() => {
        const newNodes = currentNodes.length > 0 ? currentNodes : placeholderNodes;
        const newEdges = currentNodes.length > 0 ? currentEdges : [];
        setNodes(newNodes as Node[]);
        setEdges(newEdges as Edge[]);
    }, [currentNodes, currentEdges, placeholderNodes, setNodes, setEdges]);

    // 노드 위치 기반으로 최적의 연결점(handle) 결정
    const determineOptimalHandles = useCallback(
        (sourceId: string, targetId: string, providedSourceHandle?: string | null, providedTargetHandle?: string | null) => {
            // 사용자가 명시적으로 handle을 지정한 경우 그대로 사용
            if (providedSourceHandle && providedTargetHandle) {
                return { sourceHandle: providedSourceHandle, targetHandle: providedTargetHandle };
            }

            const sourceNodes = target === 'asis' ? storeAsIsNodes : storeToBeNodes;
            const sourceNode = sourceNodes.find(n => n.id === sourceId);
            const targetNode = sourceNodes.find(n => n.id === targetId);

            if (!sourceNode || !targetNode) {
                // sourceHandle은 source 타입, targetHandle은 target 타입 (suffix: -target)
                return { sourceHandle: 'bottom', targetHandle: 'top-target' };
            }

            const dx = targetNode.position.x - sourceNode.position.x;
            const dy = targetNode.position.y - sourceNode.position.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            // 마름모(decision) 노드 특별 처리: 분기점에서 나가는 연결
            const isSourceDecision = sourceNode.type === 'decision';
            
            // 수직 이동이 더 큰 경우 (일반적인 위→아래 흐름)
            if (absDy > absDx * 0.5) {
                if (dy > 0) {
                    // target이 아래에 있음: source의 bottom → target의 top
                    return { sourceHandle: 'bottom', targetHandle: 'top-target' };
                } else {
                    // target이 위에 있음 (역방향): source의 top → target의 bottom
                    return { sourceHandle: 'top', targetHandle: 'bottom-target' };
                }
            }
            
            // 수평 이동이 더 큰 경우 (분기)
            if (dx > 0) {
                // target이 오른쪽: source의 right → target의 left
                return { 
                    sourceHandle: isSourceDecision ? 'right' : 'right', 
                    targetHandle: 'left-target' 
                };
            } else {
                // target이 왼쪽: source의 left → target의 right
                return { 
                    sourceHandle: isSourceDecision ? 'left' : 'left', 
                    targetHandle: 'right-target' 
                };
            }
        },
        [target, storeAsIsNodes, storeToBeNodes]
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            // 위치 기반으로 최적의 handle 결정
            const { sourceHandle, targetHandle } = determineOptimalHandles(
                connection.source || '',
                connection.target || '',
                connection.sourceHandle,
                connection.targetHandle
            );

            // 최적화된 연결 정보로 엣지 생성
            const optimizedConnection: Connection = {
                ...connection,
                sourceHandle,
                targetHandle,
            };

            // 새 엣지를 로컬 상태에 추가
            setEdges((eds) => addEdge(optimizedConnection, eds));
            
            // Store에도 동기화 (handle 정보 포함)
            const handleSuffix = sourceHandle && targetHandle 
                ? `-${sourceHandle}-${targetHandle}` 
                : '';
            const newEdge: FlowEdge = {
                id: `edge-${connection.source}-${connection.target}${handleSuffix}`,
                source: connection.source || '',
                target: connection.target || '',
                sourceHandle: sourceHandle || undefined,
                targetHandle: targetHandle || undefined,
            };
            
            if (target === 'asis') {
                setAsIsFlow(storeAsIsNodes, [...storeAsIsEdges, newEdge]);
            } else {
                setToBeFlow(storeToBeNodes, [...storeToBeEdges, newEdge]);
            }
        },
        [setEdges, target, storeAsIsNodes, storeAsIsEdges, storeToBeNodes, storeToBeEdges, setAsIsFlow, setToBeFlow, determineOptimalHandles]
    );

    // Edge 클릭 핸들러
    const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.stopPropagation();
        setSelectedEdgeId(edge.id);
        setEdgeContextMenu(null); // 이전 메뉴 닫기
    }, []);

    // Edge 우클릭 컨텍스트 메뉴
    const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedEdgeId(edge.id);
        setEdgeContextMenu({
            x: event.clientX,
            y: event.clientY,
            edgeId: edge.id,
        });
    }, []);

    // Edge 컨텍스트 메뉴 닫기
    const closeEdgeContextMenu = useCallback(() => {
        setEdgeContextMenu(null);
    }, []);

    // Edge 삭제 핸들러
    const handleDeleteEdge = useCallback(() => {
        if (!selectedEdgeId) return;
        
        // Store에서 삭제
        storeDeleteEdge(selectedEdgeId, target);
        
        // 로컬 상태에서도 삭제
        setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
        
        setSelectedEdgeId(null);
        closeEdgeContextMenu();
    }, [selectedEdgeId, storeDeleteEdge, target, setEdges, closeEdgeContextMenu]);

    // Edge 방향 뒤집기 핸들러
    const handleReverseEdgeDirection = useCallback(() => {
        if (!selectedEdgeId) return;
        
        const currentEdge = storeEdges.find((e) => e.id === selectedEdgeId);
        if (!currentEdge) return;
        
        // Store에서 방향 뒤집기
        storeReverseEdge(selectedEdgeId, target);
        
        // 로컬 상태도 업데이트 (source ↔ target 교환)
        setEdges((eds) => eds.map((e) => {
            if (e.id !== selectedEdgeId) return e;

            const reversedHandles = getReversedEdgeHandles({
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
            });
            const handleSuffix = reversedHandles.sourceHandle && reversedHandles.targetHandle
                ? `-${reversedHandles.sourceHandle}-${reversedHandles.targetHandle}`
                : '';
            const newId = `edge-${e.target}-${e.source}${handleSuffix}`;
            return {
                ...e,
                id: newId,
                source: e.target as string,
                target: e.source as string,
                sourceHandle: reversedHandles.sourceHandle,
                targetHandle: reversedHandles.targetHandle,
            };
        }));
        
        setSelectedEdgeId(null);
        closeEdgeContextMenu();
    }, [selectedEdgeId, storeEdges, storeReverseEdge, target, setEdges, closeEdgeContextMenu]);

    // Delete 키로 선택된 Edge 삭제, R 키로 방향 뒤집기
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' && selectedEdgeId) {
                handleDeleteEdge();
            }
            if ((e.key === 'r' || e.key === 'R') && selectedEdgeId) {
                e.preventDefault();
                handleReverseEdgeDirection();
            }
            if (e.key === 'Escape') {
                setSelectedEdgeId(null);
                closeEdgeContextMenu();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedEdgeId, handleDeleteEdge, handleReverseEdgeDirection, closeEdgeContextMenu]);

    // 좌클릭 = 선택 (To-Be 모드에서 agent 타입 노드만 전략 페이지용 선택 가능)
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.id === 'placeholder') return;
        
        // To-Be 모드에서 agent 타입 노드만 전략 범위 선택 가능
        if (viewMode === 'tobe') {
            const storeNode = storeToBeNodes.find(n => n.id === node.id);
            // agent 타입만 선택 허용
            if (storeNode?.type === 'agent') {
                // 이미 선택된 노드를 다시 클릭하면 선택 해제
                if (selectedToBeNodeId === node.id) {
                    setSelectedToBeNodeId(null);
                } else {
                    setSelectedToBeNodeId(node.id);
                }
            }
        }
    }, [viewMode, selectedToBeNodeId, setSelectedToBeNodeId, storeToBeNodes]);

    // 우클릭 컨텍스트 메뉴
    const onNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            if (node.id === 'placeholder') return;

            const foundNode = storeNodes.find((n) => n.id === node.id);
            if (foundNode) {
                setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    nodeId: node.id,
                    nodeLabel: foundNode.label,
                });
            }
        },
        [storeNodes]
    );

    // 컨텍스트 메뉴 닫기
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    // 편집
    const handleEdit = useCallback(() => {
        if (!contextMenu) return;
        const foundNode = storeNodes.find((n) => n.id === contextMenu.nodeId);
        if (foundNode) {
            setEditingNode(foundNode);
            setEditorMode('edit');
            setEditorOpen(true);
        }
        closeContextMenu();
    }, [contextMenu, storeNodes, closeContextMenu]);

    // 복제
    const handleDuplicate = useCallback(() => {
        if (!contextMenu) return;
        const foundNode = storeNodes.find((n) => n.id === contextMenu.nodeId);
        if (foundNode) {
            const newNode: FlowNode = {
                ...foundNode,
                id: `node-${Date.now()}`,
                label: `${foundNode.label} (복사본)`,
                position: { x: foundNode.position.x + 50, y: foundNode.position.y + 50 },
            };
            addNode(newNode, target);
        }
        closeContextMenu();
    }, [contextMenu, storeNodes, addNode, target, closeContextMenu]);

    // 세분화 (AI Split)
    const handleSplit = useCallback(async () => {
        if (!contextMenu || !onNodeSplit) return;

        setIsSplitting(true);

        try {
            const result = await onNodeSplit(contextMenu.nodeId, target);

            if (result && result.nodes.length > 0) {
                const originalNode = storeNodes.find((n) => n.id === contextMenu.nodeId);
                if (!originalNode) return;

                // 기존 노드의 위치 기준으로 하위 노드 배치
                const baseY = originalNode.position.y;
                const spacing = 100;

                // 새 노드들에 위치 할당
                const newNodes = result.nodes.map((node, idx) => ({
                    ...node,
                    id: `${contextMenu.nodeId}-sub-${idx}`,
                    position: { x: originalNode.position.x, y: baseY + idx * spacing },
                }));

                // 기존 엣지에서 원본 노드 연결 찾기
                const incomingEdges = storeEdges.filter((e) => e.target === contextMenu.nodeId);
                const outgoingEdges = storeEdges.filter((e) => e.source === contextMenu.nodeId);

                // 새 엣지: 하위 노드들 연결 (순차)
                const subEdges: FlowEdge[] = newNodes.slice(0, -1).map((node, idx) => ({
                    id: `edge-${node.id}-to-${newNodes[idx + 1].id}`,
                    source: node.id,
                    target: newNodes[idx + 1].id,
                }));

                // 기존 incoming을 첫 번째 하위 노드로 연결
                const reconnectedIncoming: FlowEdge[] = incomingEdges.map((e) => ({
                    ...e,
                    target: newNodes[0].id,
                }));

                // 기존 outgoing을 마지막 하위 노드에서 연결
                const reconnectedOutgoing: FlowEdge[] = outgoingEdges.map((e) => ({
                    ...e,
                    source: newNodes[newNodes.length - 1].id,
                }));

                // 원본 노드와 관련 엣지 제거 후 새 노드/엣지 추가
                const updatedNodes = [
                    ...storeNodes.filter((n) => n.id !== contextMenu.nodeId),
                    ...newNodes,
                ];
                const updatedEdges = [
                    ...storeEdges.filter(
                        (e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId
                    ),
                    ...subEdges,
                    ...reconnectedIncoming,
                    ...reconnectedOutgoing,
                ];

                // Store 업데이트
                if (target === 'asis') {
                    setAsIsFlow(updatedNodes, updatedEdges);
                } else {
                    setToBeFlow(updatedNodes, updatedEdges);
                }
            }
        } finally {
            setIsSplitting(false);
            closeContextMenu();
        }
    }, [
        contextMenu,
        onNodeSplit,
        target,
        storeNodes,
        storeEdges,
        setAsIsFlow,
        setToBeFlow,
        closeContextMenu,
    ]);

    // 드릴다운
    const handleDrilldown = useCallback(() => {
        if (!contextMenu || !onDrilldown) return;
        onDrilldown(contextMenu.nodeId);
        closeContextMenu();
    }, [contextMenu, onDrilldown, closeContextMenu]);

    // 삭제
    const handleDelete = useCallback(() => {
        if (!contextMenu) return;
        deleteNode(contextMenu.nodeId, target);
        closeContextMenu();
    }, [contextMenu, deleteNode, target, closeContextMenu]);

    // 빈 공간 더블클릭 시 노드 추가
    const onPaneClick = useCallback(() => {
        closeContextMenu();
        closeEdgeContextMenu();
        setSelectedEdgeId(null);
    }, [closeContextMenu, closeEdgeContextMenu]);

    const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        setNewNodePosition({ x, y });
        setEditingNode(null);
        setEditorMode('create');
        setEditorOpen(true);
    }, []);

    // 노드 이동 후 위치 저장
    const handleNodesChange = useCallback(
        (changes: NodeChange<Node>[]) => {
            onNodesChange(changes);

            changes.forEach((change) => {
                if (change.type === 'position' && change.position && change.id !== 'placeholder') {
                    const posChange = change as NodePositionChange;
                    if (posChange.position) {
                        updateNodePosition(change.id, posChange.position, target);
                    }
                }
            });
        },
        [onNodesChange, updateNodePosition, target]
    );

    // 노드 저장 핸들러
    const handleSaveNode = useCallback(
        (data: {
            id?: string;
            label: string;
            description?: string;
            type: FlowNodeType;
            shape?: FlowShape;
            shapeMode?: 'auto' | 'manual';
            terminalType?: 'start' | 'end';
            ioType?: 'input' | 'output';
            stressLevel?: 'low' | 'medium' | 'high';
            collaborationType?: 'copilot' | 'monitor' | 'autonomous';
            metrics?: { timeMinutes?: number; duration?: number; durationUnit?: DurationUnit };
        }) => {
            if (editorMode === 'create') {
                const newNode: FlowNode = {
                    id: `node-${Date.now()}`,
                    label: data.label,
                    description: data.description,
                    type: data.type,
                    shape: data.shape,
                    shapeMode: data.shapeMode,
                    terminalType: data.terminalType,
                    ioType: data.ioType,
                    stressLevel: data.stressLevel,
                    collaborationType: data.collaborationType,
                    metrics: data.metrics,
                    position: newNodePosition,
                };
                addNode(newNode, target);
            } else if (data.id) {
                updateNode(
                    data.id,
                    {
                        label: data.label,
                        description: data.description,
                        type: data.type,
                        shape: data.shape,
                        shapeMode: data.shapeMode,
                        terminalType: data.terminalType,
                        ioType: data.ioType,
                        stressLevel: data.stressLevel,
                        collaborationType: data.collaborationType,
                        metrics: data.metrics,
                    },
                    target
                );
            }
            setEditorOpen(false);
        },
        [editorMode, newNodePosition, addNode, updateNode, target]
    );

    // 노드 삭제 핸들러
    const handleDeleteNode = useCallback(() => {
        if (editingNode) {
            deleteNode(editingNode.id, target);
            setEditorOpen(false);
        }
    }, [editingNode, deleteNode, target]);

    // 새 노드 추가 버튼 핸들러
    const handleAddNewNode = () => {
        const maxY = Math.max(0, ...currentNodes.map((n) => n.position.y));
        setNewNodePosition({ x: 250, y: maxY + 100 });
        setEditingNode(null);
        setEditorMode('create');
        setEditorOpen(true);
    };

    return (
        <div className="w-full h-full pro-canvas">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onEdgeClick={onEdgeClick}
                onEdgeContextMenu={onEdgeContextMenu}
                onPaneClick={onPaneClick}
                onDoubleClick={onPaneDoubleClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                className="pro-canvas"
                defaultEdgeOptions={{
                    type: 'selectable',
                    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
                    animated: false,
                }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#D4D4D8" />
                <Controls 
                    position="bottom-right"
                    className="!bg-white/80 !backdrop-blur-md !border-[#E2E4E9] !rounded-xl !shadow-lg !mb-24 !mr-3 [&>button]:!bg-white [&>button]:!border-[#E2E4E9] [&>button]:!text-[#71717A] [&>button:hover]:!bg-[#F5F6F8] [&>button:hover]:!text-[#18181B]" 
                />
                <MiniMap
                    position="bottom-left"
                    className="!bg-white/80 !backdrop-blur-md !border-[#E2E4E9] !rounded-xl !shadow-lg !mb-4 !ml-3"
                    nodeColor={(node) => {
                        if (node.type === 'agent') return '#10B981';
                        if (node.type === 'decision') return '#F59E0B';
                        if (node.type === 'terminal') return '#6366F1';
                        if (node.type === 'io') return '#06B6D4';
                        if (node.data?.stressLevel === 'high') return '#EF4444';
                        if (node.data?.stressLevel === 'medium') return '#F59E0B';
                        return '#3B82F6';
                    }}
                />

                {/* Node/Edge Count Info - Top Left (노드가 있을 때만 표시) */}
                {currentNodes.length > 0 && (
                    <Panel
                        position="top-left"
                        className="bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 shadow-lg"
                    >
                        <span className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5 font-medium">
                                {viewMode === 'tobe' ? '🤖' : '📊'}
                                <span className="text-gray-900">{currentNodes.length}</span>
                                <span className="text-gray-500">노드</span>
                            </span>
                            <span className="w-px h-4 bg-gray-300" />
                            <span className="flex items-center gap-1.5">
                                <span className="text-gray-900">{currentEdges.length}</span>
                                <span className="text-gray-500">연결</span>
                            </span>
                            <span className="w-px h-4 bg-gray-300" />
                            <span className="text-gray-400 text-xs">우클릭: 메뉴</span>
                        </span>
                    </Panel>
                )}

                {/* Breadcrumb */}
                {drilldownPath.length > 0 && (
                    <Panel
                        position="top-center"
                        className="bg-white/90 px-4 py-2 rounded-lg border border-gray-200 shadow-sm"
                    >
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400">📁</span>
                            {drilldownPath.map((id, idx) => (
                                <span key={id} className="text-indigo-600">
                                    {idx > 0 && <span className="text-gray-400 mx-1">→</span>}
                                    {id}
                                </span>
                            ))}
                        </div>
                    </Panel>
                )}

                {/* Top Right Controls */}
                <Panel position="top-right" className="flex gap-2 !mt-3 !mr-3">
                    <Button
                        size="sm"
                        onClick={() => setIsHeatmapMode(!isHeatmapMode)}
                        className={`${isHeatmapMode
                                ? 'bg-red-600 hover:bg-red-500 text-white'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                            } shadow-sm border`}
                    >
                        {isHeatmapMode ? '🔥 ON' : '🌡️ Heatmap'}
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleAddNewNode}
                        className="bg-green-600 hover:bg-green-500 text-white shadow-sm"
                    >
                        ➕ 추가
                    </Button>
                </Panel>

            </ReactFlow>

            {/* Context Menu */}
            {contextMenu && (
                <NodeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    nodeLabel={contextMenu.nodeLabel}
                    onClose={closeContextMenu}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onSplit={handleSplit}
                    onDrilldown={handleDrilldown}
                    onDelete={handleDelete}
                    isLoading={isSplitting}
                />
            )}

            {/* Edge Context Menu */}
            {edgeContextMenu && (
                <EdgeContextMenu
                    x={edgeContextMenu.x}
                    y={edgeContextMenu.y}
                    edgeId={edgeContextMenu.edgeId}
                    onClose={closeEdgeContextMenu}
                    onDelete={handleDeleteEdge}
                    onReverseDirection={handleReverseEdgeDirection}
                />
            )}

            {/* Node Editor Dialog */}
            <NodeEditor
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                onSave={handleSaveNode}
                onDelete={editorMode === 'edit' ? handleDeleteNode : undefined}
                initialData={editingNode}
                mode={editorMode}
                flowType={target}
            />
        </div>
    );
}
