'use client';

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
    isSimulating?: boolean;
    onToggleSimulation?: () => void;
}

export default function SplitViewCanvas({
    asIsNodes,
    asIsEdges,
    toBeNodes,
    toBeEdges,
    isSimulating = false,
    onToggleSimulation,
}: SplitViewCanvasProps) {
    const [nodesLeft, , onNodesChangeLeft] = useNodesState(asIsNodes);
    const [edgesLeft, , onEdgesChangeLeft] = useEdgesState(
        asIsEdges.map(e => ({ ...e, type: isSimulating ? 'tokenFlow' : 'smooth', data: { speed: 'slow' } }))
    );

    const [nodesRight, , onNodesChangeRight] = useNodesState(toBeNodes);
    const [edgesRight, , onEdgesChangeRight] = useEdgesState(
        toBeEdges.map(e => ({ ...e, type: isSimulating ? 'tokenFlow' : 'smooth', data: { speed: 'fast' } }))
    );

    // Type-safe metrics extraction
    type MetricsType = { timeMinutes?: number; costKRW?: number; peopleCount?: number } | undefined;
    const extractMetrics = (nodes: Node[]) => nodes.map(n => ({
        id: n.id,
        metrics: (n.data as { metrics?: MetricsType })?.metrics
    }));

    return (
        <div className="w-full h-full flex">
            {/* Before (As-Is) */}
            <div className="flex-1 border-r border-slate-700 relative">
                <div className="absolute top-4 left-4 z-10 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm border border-red-500/30">
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
                    className="bg-slate-950"
                    defaultEdgeOptions={{ type: isSimulating ? 'tokenFlow' : 'smooth' }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
                    <Controls className="!bg-slate-800 !border-slate-700" />
                </ReactFlow>
            </div>

            {/* Center Controls */}
            <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20">
                <Button
                    onClick={onToggleSimulation}
                    className={`${isSimulating
                        ? 'bg-green-600 hover:bg-green-500'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                        } shadow-lg`}
                >
                    {isSimulating ? '⏸️ 시뮬레이션 정지' : '▶️ 토큰 시뮬레이션'}
                </Button>
            </div>

            {/* After (To-Be) */}
            <div className="flex-1 relative">
                <div className="absolute top-4 left-4 z-10 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm border border-green-500/30">
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
                    className="bg-slate-950"
                    defaultEdgeOptions={{ type: isSimulating ? 'tokenFlow' : 'smooth' }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
                    <Controls className="!bg-slate-800 !border-slate-700" />
                </ReactFlow>
            </div>

            {/* Speed Legend */}
            {isSimulating && (
                <Panel position="bottom-center" className="bg-slate-800/90 px-4 py-2 rounded-lg border border-slate-700 flex gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs text-slate-400">병목 (느림)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span className="text-xs text-slate-400">효율적 (빠름)</span>
                    </div>
                </Panel>
            )}

            {/* ROI Summary Panel */}
            {!isSimulating && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[600px]">
                    <GapAnalysisSummary
                        asIsNodes={extractMetrics(asIsNodes)}
                        toBeNodes={extractMetrics(toBeNodes)}
                    />
                </div>
            )}
        </div>
    );
}
