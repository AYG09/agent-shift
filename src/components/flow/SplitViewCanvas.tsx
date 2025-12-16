'use client';

import { useState, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from './CustomNodes';
import { edgeTypes } from './CustomEdges';
import { Button } from '@/components/ui/button';
import GapAnalysisSummary from './GapAnalysisSummary';

interface SplitViewCanvasProps {
    asIsNodes: Node[];
    asIsEdges: Edge[];
    toBeNodes: Node[];
    toBeEdges: Edge[];
}

export default function SplitViewCanvas({
    asIsNodes,
    asIsEdges,
    toBeNodes,
    toBeEdges,
}: SplitViewCanvasProps) {
    const [isHeatmapMode, setIsHeatmapMode] = useState(false);

    const [nodesLeft, setNodesLeft, onNodesChangeLeft] = useNodesState(asIsNodes);
    const [edgesLeft, setEdgesLeft, onEdgesChangeLeft] = useEdgesState(
        asIsEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: 'tokenFlow',
            data: { speed: 'slow' },
        }))
    );

    const [nodesRight, setNodesRight, onNodesChangeRight] = useNodesState(toBeNodes);
    const [edgesRight, setEdgesRight, onEdgesChangeRight] = useEdgesState(
        toBeEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: 'tokenFlow',
            data: { speed: 'fast' },
        }))
    );

    // Props 변경 시 실시간 동기화
    useEffect(() => {
        setNodesLeft(asIsNodes.map((node) => ({
            ...node,
            data: { ...node.data, isHeatmapMode },
        })));
    }, [asIsNodes, isHeatmapMode, setNodesLeft]);

    useEffect(() => {
        setNodesRight(toBeNodes.map((node) => ({
            ...node,
            data: { ...node.data, isHeatmapMode },
        })));
    }, [toBeNodes, isHeatmapMode, setNodesRight]);

    useEffect(() => {
        setEdgesLeft(asIsEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: 'tokenFlow',
            data: { speed: 'slow' },
        })));
    }, [asIsEdges, setEdgesLeft]);

    useEffect(() => {
        setEdgesRight(toBeEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: 'tokenFlow',
            data: { speed: 'fast' },
        })));
    }, [toBeEdges, setEdgesRight]);

    // Type-safe metrics extraction
    type MetricsType = { timeMinutes?: number; costKRW?: number; peopleCount?: number } | undefined;
    const extractMetrics = (nodes: Node[]) =>
        nodes.map((n) => ({
            id: n.id,
            metrics: (n.data as { metrics?: MetricsType })?.metrics,
        }));

    return (
        <div className="w-full h-full flex">
            {/* Main Canvas Area */}
            <div className="flex-1 flex">
                {/* Before (As-Is) */}
                <div className="flex-1 border-r border-slate-200 relative">
                    <div className="absolute top-4 left-4 z-10 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border border-red-200">
                        📊 Before (As-Is)
                    </div>

                    <ReactFlow
                        nodes={nodesLeft}
                        edges={edgesLeft}
                        onNodesChange={onNodesChangeLeft}
                        onEdgesChange={onEdgesChangeLeft}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        fitView
                        className="bg-slate-50"
                        defaultEdgeOptions={{ type: 'tokenFlow' }}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={20}
                            size={1}
                            color="#cbd5e1"
                        />
                        <Controls className="!bg-white !border-slate-200 !shadow-md" />
                    </ReactFlow>
                </div>

            {/* Center Controls - Heatmap toggle only */}
            <div className="absolute left-1/2 top-4 -translate-x-1/2 z-40 flex gap-2">
                <Button
                    onClick={() => setIsHeatmapMode(!isHeatmapMode)}
                    className={`${
                        isHeatmapMode
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                    } shadow-md transition-colors duration-300`}
                >
                    {isHeatmapMode ? '🔥 Heatmap ON' : '🌡️ Heatmap OFF'}
                </Button>
            </div>

            {/* After (To-Be) */}
            <div className="flex-1 relative">
                <div className="absolute top-4 left-4 z-10 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border border-emerald-200">
                    🤖 After (To-Be)
                </div>

                <ReactFlow
                    nodes={nodesRight}
                    edges={edgesRight}
                    onNodesChange={onNodesChangeRight}
                    onEdgesChange={onEdgesChangeRight}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    className="bg-slate-50"
                    defaultEdgeOptions={{ type: 'tokenFlow' }}
                >
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={20}
                        size={1}
                        color="#cbd5e1"
                    />
                    <Controls className="!bg-white !border-slate-200 !shadow-md" />
                </ReactFlow>
            </div>
            </div>

            {/* Right Sidebar - ROI Summary Panel */}
            <div className="w-80 border-l border-slate-200 bg-slate-50/50 p-4 overflow-y-auto flex flex-col gap-4">
                <div className="flex-shrink-0">
                    <GapAnalysisSummary
                        asIsNodes={extractMetrics(asIsNodes)}
                        toBeNodes={extractMetrics(toBeNodes)}
                    />
                </div>
                
                {/* 시뮬레이션 속도 안내 */}
                <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs font-medium text-slate-700 mb-2">시뮬레이션 속도</div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs text-slate-600">As-Is (느림)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                            <span className="text-xs text-slate-600">To-Be (빠름)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
