'use client';

import { useCallback, useEffect, useState } from 'react';
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
import NodeEditor from './NodeEditor';
import NodeContextMenu from './NodeContextMenu';
import { Button } from '@/components/ui/button';
import { useAppStore, FlowNode, FlowEdge } from '@/lib/store';

interface FlowCanvasProps {
    onGenerateFlow?: () => void;
    isLoading?: boolean;
    onNodeSplit?: (nodeId: string, flowType: 'asis' | 'tobe') => Promise<{ nodes: FlowNode[]; edges: FlowEdge[] } | null>;
}

export default function FlowCanvas({ onGenerateFlow, isLoading, onNodeSplit }: FlowCanvasProps) {
    const {
        viewMode,
        setViewMode,
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
    } = useAppStore();

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
    const [newNodePosition, setNewNodePosition] = useState({ x: 250, y: 100 });

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; nodeLabel: string } | null>(null);
    const [isSplitting, setIsSplitting] = useState(false);

    const target = viewMode === 'tobe' ? 'tobe' : 'asis';

    // 현재 표시할 노드/엣지
    const currentNodes = viewMode === 'tobe'
        ? storeToBeNodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: { label: n.label, description: n.description, stressLevel: n.stressLevel, collaborationType: n.collaborationType, agentDescription: n.agentDescription, metrics: n.metrics } }))
        : storeAsIsNodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: { label: n.label, description: n.description, stressLevel: n.stressLevel, metrics: n.metrics } }));

    const currentEdges = viewMode === 'tobe'
        ? storeToBeEdges.map(e => ({ id: e.id, source: e.source, target: e.target }))
        : storeAsIsEdges.map(e => ({ id: e.id, source: e.source, target: e.target }));

    const storeNodes = viewMode === 'tobe' ? storeToBeNodes : storeAsIsNodes;
    const storeEdges = viewMode === 'tobe' ? storeToBeEdges : storeAsIsEdges;

    const placeholderNodes: Node[] = [
        { id: 'placeholder', type: 'process', position: { x: 250, y: 100 }, data: { label: '✨ AI 플로우 생성을 클릭하세요', stressLevel: 'low' } }
    ];

    const displayNodes = currentNodes.length > 0 ? currentNodes : placeholderNodes;
    const displayEdges = currentNodes.length > 0 ? currentEdges : [];

    const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes as Node[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges as Edge[]);

    useEffect(() => {
        const newNodes = currentNodes.length > 0 ? currentNodes : placeholderNodes;
        const newEdges = currentNodes.length > 0 ? currentEdges : [];
        setNodes(newNodes as Node[]);
        setEdges(newEdges as Edge[]);
    }, [viewMode, storeAsIsNodes, storeToBeNodes, storeAsIsEdges, storeToBeEdges]);

    const onConnect = useCallback(
        (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
        [setEdges]
    );

    // 좌클릭 = 선택만 (우클릭 메뉴용)
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.id === 'placeholder') return;
        // 선택만, 다른 동작 없음
    }, []);

    // 우클릭 컨텍스트 메뉴
    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        if (node.id === 'placeholder') return;

        const foundNode = storeNodes.find(n => n.id === node.id);
        if (foundNode) {
            setContextMenu({
                x: event.clientX,
                y: event.clientY,
                nodeId: node.id,
                nodeLabel: foundNode.label,
            });
        }
    }, [storeNodes]);

    // 컨텍스트 메뉴 닫기
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    // 편집
    const handleEdit = useCallback(() => {
        if (!contextMenu) return;
        const foundNode = storeNodes.find(n => n.id === contextMenu.nodeId);
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
        const foundNode = storeNodes.find(n => n.id === contextMenu.nodeId);
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
                const originalNode = storeNodes.find(n => n.id === contextMenu.nodeId);
                if (!originalNode) return;

                // 기존 노드의 위치 기준으로 하위 노드 배치
                const baseY = originalNode.position.y;
                const spacing = 100;

                // 새 노드들에 위치 할당
                const newNodes = result.nodes.map((node, idx) => ({
                    ...node,
                    id: `${contextMenu.nodeId}-sub-${idx}`,
                    position: { x: originalNode.position.x, y: baseY + (idx * spacing) },
                }));

                // 기존 엣지에서 원본 노드 연결 찾기
                const incomingEdges = storeEdges.filter(e => e.target === contextMenu.nodeId);
                const outgoingEdges = storeEdges.filter(e => e.source === contextMenu.nodeId);

                // 새 엣지: 하위 노드들 연결 (순차)
                const subEdges: FlowEdge[] = newNodes.slice(0, -1).map((node, idx) => ({
                    id: `edge-${node.id}-to-${newNodes[idx + 1].id}`,
                    source: node.id,
                    target: newNodes[idx + 1].id,
                }));

                // 기존 incoming을 첫 번째 하위 노드로 연결
                const reconnectedIncoming: FlowEdge[] = incomingEdges.map(e => ({
                    ...e,
                    target: newNodes[0].id,
                }));

                // 기존 outgoing을 마지막 하위 노드에서 연결
                const reconnectedOutgoing: FlowEdge[] = outgoingEdges.map(e => ({
                    ...e,
                    source: newNodes[newNodes.length - 1].id,
                }));

                // 원본 노드와 관련 엣지 제거 후 새 노드/엣지 추가
                const updatedNodes = [
                    ...storeNodes.filter(n => n.id !== contextMenu.nodeId),
                    ...newNodes,
                ];
                const updatedEdges = [
                    ...storeEdges.filter(e => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId),
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
    }, [contextMenu, onNodeSplit, target, storeNodes, storeEdges, setAsIsFlow, setToBeFlow, closeContextMenu]);

    // 삭제
    const handleDelete = useCallback(() => {
        if (!contextMenu) return;
        deleteNode(contextMenu.nodeId, target);
        closeContextMenu();
    }, [contextMenu, deleteNode, target, closeContextMenu]);

    // 빈 공간 더블클릭 시 노드 추가
    const onPaneClick = useCallback(() => {
        closeContextMenu();
    }, [closeContextMenu]);

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
    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        onNodesChange(changes);

        changes.forEach(change => {
            if (change.type === 'position' && change.position && change.id !== 'placeholder') {
                const posChange = change as NodePositionChange;
                if (posChange.position) {
                    updateNodePosition(change.id, posChange.position, target);
                }
            }
        });
    }, [onNodesChange, updateNodePosition, target]);

    // 노드 저장 핸들러
    const handleSaveNode = useCallback((data: { id?: string; label: string; description?: string; type: 'task' | 'decision' | 'subprocess' | 'agent'; stressLevel?: 'low' | 'medium' | 'high'; collaborationType?: 'copilot' | 'monitor' | 'autonomous' }) => {
        if (editorMode === 'create') {
            const newNode: FlowNode = {
                id: `node-${Date.now()}`,
                label: data.label,
                description: data.description,
                type: data.type,
                stressLevel: data.stressLevel,
                collaborationType: data.collaborationType,
                position: newNodePosition,
            };
            addNode(newNode, target);
        } else if (data.id) {
            updateNode(data.id, {
                label: data.label,
                description: data.description,
                type: data.type,
                stressLevel: data.stressLevel,
                collaborationType: data.collaborationType,
            }, target);
        }
        setEditorOpen(false);
    }, [editorMode, newNodePosition, addNode, updateNode, target]);

    // 노드 삭제 핸들러
    const handleDeleteNode = useCallback(() => {
        if (editingNode) {
            deleteNode(editingNode.id, target);
            setEditorOpen(false);
        }
    }, [editingNode, deleteNode, target]);

    // 새 노드 추가 버튼 핸들러
    const handleAddNewNode = () => {
        const maxY = Math.max(0, ...currentNodes.map(n => n.position.y));
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
                onPaneClick={onPaneClick}
                onDoubleClick={onPaneDoubleClick}
                nodeTypes={nodeTypes}
                fitView
                className="pro-canvas"
                defaultEdgeOptions={{
                    style: { stroke: '#71717A', strokeWidth: 1.5 },
                    type: 'bezier',
                    markerEnd: { type: 'arrowclosed', color: '#71717A', width: 16, height: 16 },
                    animated: false,
                }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#D4D4D8" />
                <Controls className="!bg-white/80 !backdrop-blur-md !border-[#E2E4E9] !rounded-xl !shadow-lg [&>button]:!bg-white [&>button]:!border-[#E2E4E9] [&>button]:!text-[#71717A] [&>button:hover]:!bg-[#F5F6F8] [&>button:hover]:!text-[#18181B]" />
                <MiniMap
                    className="!bg-white/80 !backdrop-blur-md !border-[#E2E4E9] !rounded-xl !shadow-lg"
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

                {/* View Mode Panel */}
                <Panel position="top-left" className="flex gap-2">
                    <Button size="sm" variant={viewMode === 'asis' ? 'default' : 'outline'} onClick={() => setViewMode('asis')} className="bg-white border-gray-200 text-gray-700 hover:bg-gray-100 shadow-sm">
                        📊 As-Is
                    </Button>
                    <Button size="sm" variant={viewMode === 'tobe' ? 'default' : 'outline'} onClick={() => setViewMode('tobe')} className="bg-white border-gray-200 text-gray-700 hover:bg-gray-100 shadow-sm">
                        🤖 To-Be
                    </Button>
                    <Button size="sm" variant={viewMode === 'split' ? 'default' : 'outline'} onClick={() => setViewMode('split')} className="bg-white border-gray-200 text-gray-700 hover:bg-gray-100 shadow-sm">
                        ⚡ 비교
                    </Button>
                </Panel>

                {/* Breadcrumb */}
                {drilldownPath.length > 0 && (
                    <Panel position="top-center" className="bg-white/90 px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
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
                <Panel position="top-right" className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={handleAddNewNode}
                        className="bg-green-600 hover:bg-green-500"
                    >
                        ➕ 노드 추가
                    </Button>
                    <Button
                        onClick={onGenerateFlow}
                        disabled={isLoading}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                    >
                        {isLoading ? '⏳ 생성 중...' : '✨ AI 플로우 생성'}
                    </Button>
                </Panel>

                {/* Node Count Info */}
                <Panel position="bottom-left" className="bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-400">
                    {currentNodes.length > 0 ? (
                        <span>{viewMode === 'tobe' ? '🤖' : '📊'} {currentNodes.length}개 노드 | 우클릭: 메뉴 | 더블클릭: 추가</span>
                    ) : (
                        <span>노드 없음 | 더블클릭으로 추가</span>
                    )}
                </Panel>
            </ReactFlow>

            {/* Context Menu */}
            {contextMenu && (
                <NodeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    nodeId={contextMenu.nodeId}
                    nodeLabel={contextMenu.nodeLabel}
                    onClose={closeContextMenu}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onSplit={handleSplit}
                    onDelete={handleDelete}
                    isLoading={isSplitting}
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
