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
import { Cursors } from '@/components/collaboration/Cursors';
import { useCollabStore } from '@/lib/collaboration-store';
import { throttle } from '@/lib/utils';
import { FlowNode, FlowEdge } from '@/lib/store';

export function CollaborativeFlowCanvas() {
    const {
        viewMode,
        setViewMode,
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
        setCursor,
        setSelectedNodeId,
        liveblocks: { others },
    } = useCollabStore();

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

    const target = viewMode === 'tobe' ? 'tobe' : 'asis';

    // 커서 위치 업데이트 (throttle 적용 - 50ms)
    const handlePointerMove = useMemo(
        () =>
            throttle((e: React.PointerEvent) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setCursor({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                });
            }, 50),
        [setCursor]
    );

    const handlePointerLeave = useCallback(() => {
        setCursor(null);
    }, [setCursor]);

    // 현재 표시할 노드/엣지
    const currentNodes = useMemo(() => {
        const storeNodes = viewMode === 'tobe' ? storeToBeNodes : storeAsIsNodes;
        return storeNodes.map((n) => ({
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
                children: n.children,
            },
        }));
    }, [viewMode, storeAsIsNodes, storeToBeNodes]);

    const currentEdges = useMemo(() => {
        const storeEdges = viewMode === 'tobe' ? storeToBeEdges : storeAsIsEdges;
        return storeEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            animated: e.animated,
            type: 'default',
        }));
    }, [viewMode, storeAsIsEdges, storeToBeEdges]);

    const [nodes, setNodes, onNodesChange] = useNodesState(currentNodes as Node[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState(currentEdges as Edge[]);

    // Store 변경 시 로컬 상태 동기화
    useEffect(() => {
        setNodes(currentNodes as Node[]);
    }, [currentNodes, setNodes]);

    useEffect(() => {
        setEdges(currentEdges as Edge[]);
    }, [currentEdges, setEdges]);

    // 노드 위치 변경 핸들러
    const handleNodesChange = useCallback(
        (changes: NodeChange[]) => {
            onNodesChange(changes);
            changes.forEach((change) => {
                if (change.type === 'position' && (change as NodePositionChange).position) {
                    const posChange = change as NodePositionChange;
                    if (posChange.position) {
                        updateNodePosition(posChange.id, posChange.position, target);
                    }
                }
            });
        },
        [onNodesChange, updateNodePosition, target]
    );

    // 엣지 연결 핸들러
    const handleConnect = useCallback(
        (connection: Connection) => {
            if (connection.source && connection.target) {
                const newEdge: FlowEdge = {
                    id: `e-${connection.source}-${connection.target}-${Date.now()}`,
                    source: connection.source,
                    target: connection.target,
                    sourceHandle: connection.sourceHandle || undefined,
                    targetHandle: connection.targetHandle || undefined,
                };

                if (viewMode === 'tobe') {
                    setToBeFlow(storeToBeNodes, [...storeToBeEdges, newEdge]);
                } else {
                    setAsIsFlow(storeAsIsNodes, [...storeAsIsEdges, newEdge]);
                }

                setEdges((eds) => addEdge(connection, eds));
            }
        },
        [viewMode, storeAsIsNodes, storeAsIsEdges, storeToBeNodes, storeToBeEdges, setAsIsFlow, setToBeFlow, setEdges]
    );

    // 노드 클릭 핸들러
    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            setSelectedNodeId(node.id);
        },
        [setSelectedNodeId]
    );

    // 노드 우클릭 핸들러
    const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
            nodeLabel: (node.data as { label?: string })?.label || '',
        });
    }, []);

    // 컨텍스트 메뉴 닫기
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    // 노드 편집
    const handleEditNode = useCallback(() => {
        if (!contextMenu) return;
        const storeNodes = viewMode === 'tobe' ? storeToBeNodes : storeAsIsNodes;
        const node = storeNodes.find((n) => n.id === contextMenu.nodeId);
        if (node) {
            setEditingNode(node);
            setEditorMode('edit');
            setEditorOpen(true);
        }
        closeContextMenu();
    }, [contextMenu, viewMode, storeAsIsNodes, storeToBeNodes, closeContextMenu]);

    // 노드 삭제
    const handleDeleteNode = useCallback(() => {
        if (!contextMenu) return;
        deleteNode(contextMenu.nodeId, target);
        setNodes((nds) => nds.filter((n) => n.id !== contextMenu.nodeId));
        setEdges((eds) =>
            eds.filter((e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId)
        );
        closeContextMenu();
    }, [contextMenu, deleteNode, target, setNodes, setEdges, closeContextMenu]);

    // 노드 저장
    const handleSaveNode = useCallback(
        (nodeData: Partial<FlowNode>) => {
            if (editorMode === 'create') {
                const newNode: FlowNode = {
                    id: `node-${Date.now()}`,
                    type: nodeData.type || 'task',
                    label: nodeData.label || '새 노드',
                    description: nodeData.description,
                    shape: nodeData.shape,
                    shapeMode: nodeData.shapeMode,
                    terminalType: nodeData.terminalType,
                    ioType: nodeData.ioType,
                    stressLevel: nodeData.stressLevel,
                    position: newNodePosition,
                    collaborationType: nodeData.collaborationType,
                    agentDescription: nodeData.agentDescription,
                    metrics: nodeData.metrics,
                };
                addNode(newNode, target);
            } else if (editingNode) {
                updateNode(editingNode.id, nodeData, target);
            }
            setEditorOpen(false);
            setEditingNode(null);
        },
        [editorMode, editingNode, newNodePosition, addNode, updateNode, target]
    );

    // 새 노드 추가
    const handleAddNode = useCallback(() => {
        setEditingNode(null);
        setEditorMode('create');
        setNewNodePosition({
            x: 100 + Math.random() * 200,
            y: 100 + Math.random() * 200,
        });
        setEditorOpen(true);
    }, []);

    // 배경 클릭 시 선택 해제
    const handlePaneClick = useCallback(() => {
        setSelectedNodeId(null);
        closeContextMenu();
    }, [setSelectedNodeId, closeContextMenu]);

    // 다른 사용자가 선택한 노드 하이라이트 스타일
    const othersSelectedNodes = useMemo(() => {
        const selected = new Map<string, string>();
        others.forEach((other) => {
            const nodeId = other.presence?.selectedNodeId;
            const color = other.presence?.user?.color;
            if (nodeId && color) {
                selected.set(nodeId, color);
            }
        });
        return selected;
    }, [others]);

    return (
        <div
            className="relative h-full w-full"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                onNodeClick={handleNodeClick}
                onNodeContextMenu={handleNodeContextMenu}
                onPaneClick={handlePaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                className="bg-slate-50/50"
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
                <Controls className="!rounded-lg !border-gray-200 !bg-white/90 !shadow-lg" />
                <MiniMap
                    className="!rounded-lg !border-gray-200 !bg-white/90 !shadow-lg"
                    nodeColor={(node) => {
                        // 다른 사용자가 선택한 노드 색상 표시
                        const otherColor = othersSelectedNodes.get(node.id);
                        if (otherColor) return otherColor;
                        // 기본 색상
                        if (node.type === 'agent') return '#8b5cf6';
                        if (node.type === 'decision') return '#f59e0b';
                        if (node.type === 'subprocess') return '#3b82f6';
                        return '#64748b';
                    }}
                />

                {/* 컨트롤 패널 */}
                <Panel position="top-left" className="!m-4">
                    <div className="flex gap-2 rounded-lg bg-white/90 p-2 shadow-lg backdrop-blur-sm">
                        <button
                            onClick={() => setViewMode('asis')}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                viewMode === 'asis'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            As-Is
                        </button>
                        <button
                            onClick={() => setViewMode('tobe')}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                viewMode === 'tobe'
                                    ? 'bg-green-600 text-white'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            To-Be
                        </button>
                    </div>
                </Panel>

                {/* 노드 추가 버튼 */}
                <Panel position="top-right" className="!m-4">
                    <button
                        onClick={handleAddNode}
                        className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-gray-700 shadow-lg backdrop-blur-sm transition-colors hover:bg-white"
                    >
                        <span className="text-lg">+</span>
                        노드 추가
                    </button>
                </Panel>
            </ReactFlow>

            {/* 다른 사용자 커서 */}
            <Cursors others={others as unknown as { presence: { cursor: { x: number; y: number } | null; user: { name: string; color: string } } }[]} />

            {/* 노드 컨텍스트 메뉴 */}
            {contextMenu && (
                <NodeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    nodeLabel={contextMenu.nodeLabel}
                    onClose={closeContextMenu}
                    onEdit={handleEditNode}
                    onDuplicate={() => {}} // 협업 모드에서는 사용 안 함
                    onDrilldown={() => {}} // 협업 모드에서는 사용 안 함
                    onDelete={handleDeleteNode}
                />
            )}

            {/* 노드 편집 다이얼로그 */}
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
