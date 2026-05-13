'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from './CustomNodes';
import { edgeTypes } from './CustomEdges';
import { Button } from '@/components/ui/button';
import GapAnalysisSummary from './GapAnalysisSummary';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface SplitViewCanvasProps {
    asIsNodes: Node[];
    asIsEdges: Edge[];
    toBeNodes: Node[];
    toBeEdges: Edge[];
}

type MetricsType =
    | {
          timeMinutes?: number;
          costKRW?: number;
          peopleCount?: number;
      }
    | undefined;

function toTokenFlowEdges(edges: Edge[], speed: 'slow' | 'fast'): Edge[] {
    return edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: 'tokenFlow',
        data: { speed },
    }));
}

function withHeatmapFlag(nodes: Node[], isHeatmapMode: boolean): Node[] {
    return nodes.map((node) => ({
        ...node,
        data: { ...node.data, isHeatmapMode },
    }));
}

function extractMetrics(nodes: Node[]) {
    return nodes.map((node) => ({
        id: node.id,
        metrics: (node.data as { metrics?: MetricsType })?.metrics,
    }));
}

export default function SplitViewCanvas({
    asIsNodes,
    asIsEdges,
    toBeNodes,
    toBeEdges,
}: SplitViewCanvasProps) {
    const [isHeatmapMode, setIsHeatmapMode] = useState(false);
    // 모바일 탭 전환 상태
    const [mobileTab, setMobileTab] = useState<'asis' | 'tobe'>('asis');
    // 모바일 하단 시트 상태
    const [bottomSheetOpen, setBottomSheetOpen] = useState(false);

    const nodesLeft = useMemo(() => withHeatmapFlag(asIsNodes, isHeatmapMode), [asIsNodes, isHeatmapMode]);
    const nodesRight = useMemo(() => withHeatmapFlag(toBeNodes, isHeatmapMode), [toBeNodes, isHeatmapMode]);
    const edgesLeft = useMemo(() => toTokenFlowEdges(asIsEdges, 'slow'), [asIsEdges]);
    const edgesRight = useMemo(() => toTokenFlowEdges(toBeEdges, 'fast'), [toBeEdges]);
    const asIsMetrics = useMemo(() => extractMetrics(asIsNodes), [asIsNodes]);
    const toBeMetrics = useMemo(() => extractMetrics(toBeNodes), [toBeNodes]);

    const [nodesLeftState, setNodesLeftState, onNodesChangeLeft] = useNodesState(nodesLeft);
    const [nodesRightState, setNodesRightState, onNodesChangeRight] = useNodesState(nodesRight);
    const [edgesLeftState, setEdgesLeftState, onEdgesChangeLeft] = useEdgesState(edgesLeft);
    const [edgesRightState, setEdgesRightState, onEdgesChangeRight] = useEdgesState(edgesRight);

    useEffect(() => {
        setNodesLeftState(nodesLeft);
    }, [nodesLeft, setNodesLeftState]);

    useEffect(() => {
        setNodesRightState(nodesRight);
    }, [nodesRight, setNodesRightState]);

    useEffect(() => {
        setEdgesLeftState(edgesLeft);
    }, [edgesLeft, setEdgesLeftState]);

    useEffect(() => {
        setEdgesRightState(edgesRight);
    }, [edgesRight, setEdgesRightState]);

    return (
        <div className="w-full h-full flex flex-col md:flex-row">
            {/* 모바일 탭 네비게이션 */}
            <div className="md:hidden flex border-b border-slate-200 bg-white sticky top-0 z-20">
                <button
                    onClick={() => setMobileTab('asis')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors touch-target ${
                        mobileTab === 'asis'
                            ? 'bg-red-50 text-red-600 border-b-2 border-red-500'
                            : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    📊 Before (As-Is)
                </button>
                <button
                    onClick={() => setMobileTab('tobe')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors touch-target ${
                        mobileTab === 'tobe'
                            ? 'bg-emerald-50 text-emerald-600 border-b-2 border-emerald-500'
                            : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    🤖 After (To-Be)
                </button>
            </div>

            {/* Main Canvas Area */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0">
                {/* Before (As-Is) - 모바일에서는 탭으로 전환 */}
                <div className={`flex-1 border-r border-slate-200 relative ${mobileTab !== 'asis' ? 'hidden md:block' : ''}`}>
                    <div className="absolute top-4 left-4 z-10 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border border-red-200 hidden md:block">
                        📊 Before (As-Is)
                    </div>

                    <ReactFlow
                        nodes={nodesLeftState}
                        edges={edgesLeftState}
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

                {/* After (To-Be) - 모바일에서는 탭으로 전환 */}
                <div className={`flex-1 relative ${mobileTab !== 'tobe' ? 'hidden md:block' : ''}`}>
                    <div className="absolute top-4 left-4 z-10 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border border-emerald-200 hidden md:block">
                        🤖 After (To-Be)
                    </div>

                    <ReactFlow
                        nodes={nodesRightState}
                        edges={edgesRightState}
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

            {/* Desktop: Right Sidebar - ROI Summary Panel */}
            <div className="hidden md:flex w-80 border-l border-slate-200 bg-slate-50/50 p-4 overflow-y-auto flex-col gap-4">
                {/* Heatmap 토글 */}
                <div className="flex-shrink-0">
                    <Button
                        onClick={() => setIsHeatmapMode(!isHeatmapMode)}
                        className={`w-full ${
                            isHeatmapMode
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                        } shadow-sm transition-colors duration-300`}
                    >
                        {isHeatmapMode ? '🔥 Heatmap ON' : '🌡️ Heatmap OFF'}
                    </Button>
                </div>

                <div className="flex-shrink-0">
                    <GapAnalysisSummary
                        asIsNodes={asIsMetrics}
                        toBeNodes={toBeMetrics}
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

            {/* Mobile: Bottom Sheet - ROI Summary */}
            <div className="md:hidden">
                {/* Toggle Button */}
                <button
                    onClick={() => setBottomSheetOpen(!bottomSheetOpen)}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] touch-target"
                >
                    {bottomSheetOpen ? (
                        <ChevronDown className="w-5 h-5 text-slate-500" />
                    ) : (
                        <ChevronUp className="w-5 h-5 text-slate-500" />
                    )}
                    <span className="text-sm font-medium text-slate-600">
                        {bottomSheetOpen ? '분석 결과 닫기' : '📊 분석 결과 보기'}
                    </span>
                </button>

                {/* Bottom Sheet Content */}
                <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out bg-slate-50/95 backdrop-blur-sm border-t border-slate-200 ${
                        bottomSheetOpen ? 'max-h-[60vh] pb-24' : 'max-h-0'
                    }`}
                >
                    <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(60vh-48px)]">
                        {/* Heatmap 토글 */}
                        <Button
                            onClick={() => setIsHeatmapMode(!isHeatmapMode)}
                            className={`w-full touch-target ${
                                isHeatmapMode
                                    ? 'bg-red-500 hover:bg-red-600 text-white'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                            } shadow-sm transition-colors duration-300`}
                        >
                            {isHeatmapMode ? '🔥 Heatmap ON' : '🌡️ Heatmap OFF'}
                        </Button>

                        <GapAnalysisSummary
                            asIsNodes={asIsMetrics}
                            toBeNodes={toBeMetrics}
                        />
                        
                        {/* 시뮬레이션 속도 안내 */}
                        <div className="bg-white/95 backdrop-blur-sm px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
                            <div className="text-xs font-medium text-slate-700 mb-2">시뮬레이션 속도</div>
                            <div className="flex gap-6">
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
            </div>
        </div>
    );
}
