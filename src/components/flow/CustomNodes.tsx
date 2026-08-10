'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { DurationUnit, SkillMultipliers } from '@/lib/store';
import {
    FLOW_SHAPES,
    SHAPE_HANDLE_ANCHORS,
    getFlowShapePolicy,
} from '@/lib/flow-shapes';
import { FlowShapeRenderer } from './FlowShapeRenderer';

// ============================================
// 데이터 타입 정의
// ============================================

type NodeMetrics = {
    timeMinutes?: number;
    duration?: number;
    durationUnit?: DurationUnit;
    skillMultipliers?: SkillMultipliers;
};

export type CommonNodeData = {
    label: string;
    description?: string;
    shape?: string;
    shapeMode?: 'auto' | 'manual';
    terminalType?: 'start' | 'end';
    ioType?: 'input' | 'output';
    stressLevel?: 'low' | 'medium' | 'high';
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    agentDescription?: string;
    metrics?: NodeMetrics;
    isHeatmapMode?: boolean;
    isSelectedForStrategy?: boolean;
};

// ============================================
// 시간 포맷터 유틸
// ============================================

const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
    minutes: '분',
    hours: '시간',
    days: '일',
    weeks: '주',
    months: '개월',
};

const formatDuration = (metrics?: NodeMetrics): string | null => {
    if (!metrics) return null;
    if (metrics.duration !== undefined && metrics.duration > 0) {
        const unit = metrics.durationUnit || 'minutes';
        return `${metrics.duration}${DURATION_UNIT_LABELS[unit]}`;
    }
    if (metrics.timeMinutes !== undefined && metrics.timeMinutes > 0) {
        return `${metrics.timeMinutes}분`;
    }
    return null;
};

const formatDurationWithMultiplier = (metrics?: NodeMetrics, multiplier: number = 1): string | null => {
    if (!metrics) return null;
    const duration = metrics.duration ?? metrics.timeMinutes;
    if (duration === undefined || duration <= 0) return null;
    const unit = metrics.durationUnit || 'minutes';
    const adjusted = multiplier === 1 ? duration : (duration * multiplier).toFixed(1);
    return `${adjusted}${DURATION_UNIT_LABELS[unit]}`;
};

const SKILL_MULTIPLIERS = {
    junior: 1.5,
    mid: 1.0,
    senior: 0.7,
};

/**
 * 노드 콘텐츠 표시 결정 순수 유틸리티 (단일 출처 계산)
 */
export function getNodeContentState(
    data: CommonNodeData,
    nodeType: string
) {
    const policy = getFlowShapePolicy(data.shape, nodeType, data.terminalType, data.ioType);
    const hasDescription = !!(data.description || data.agentDescription);
    const durationText = formatDuration(data.metrics);
    const canShowPopover = !!(hasDescription || durationText);

    return {
        normalizedShape: policy.shape,
        bounds: policy.bounds,
        compact: policy.compact,
        maxLines: policy.maxLines,
        showIcon: !policy.compact,
        showDurationInNode: !policy.compact && !!durationText,
        showDetailHint: !policy.compact && (hasDescription || !!durationText),
        showCollabBadge: !policy.compact && nodeType === 'agent',
        showAgentIndicator: !policy.compact && hasDescription && nodeType === 'agent',
        canShowPopover,
        durationText,
        hasDescription,
    };
}

// ============================================
// Node Shape Wrapper (공통 SVG 도형 & 정밀 핸들 좌표 관리)
// ============================================

interface NodeShapeWrapperProps {
    shape?: string;
    type?: string;
    terminalType?: 'start' | 'end';
    ioType?: 'input' | 'output';
    stress?: 'low' | 'medium' | 'high';
    isHeatmapMode?: boolean;
    selected?: boolean;
    className?: string;
    width?: number;
    height?: number;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    handles?: {
        top?: boolean;
        right?: boolean;
        bottom?: boolean;
        left?: boolean;
    };
    isAgent?: boolean;
}

const NodeShapeWrapper = ({
    shape: rawShape,
    type,
    terminalType,
    ioType,
    stress = 'low',
    isHeatmapMode,
    selected,
    className = '',
    width: customWidth,
    height: customHeight,
    children,
    onClick,
    handles = { top: true, right: true, bottom: true, left: true },
    isAgent = false,
}: NodeShapeWrapperProps) => {
    const policy = getFlowShapePolicy(rawShape, type, terminalType, ioType);
    const { shape, bounds: anchorsContent } = policy;
    const shapeDef = FLOW_SHAPES[shape] || FLOW_SHAPES.process;
    const anchors = SHAPE_HANDLE_ANCHORS[shape] || SHAPE_HANDLE_ANCHORS.process;

    const width = customWidth || shapeDef.defaultWidth;
    const height = customHeight || shapeDef.defaultHeight;

    const getStrokeColor = () => {
        if (selected) return '#6366f1';
        if (isAgent) return '#8b5cf6';
        if (isHeatmapMode) {
            switch (stress) {
                case 'high': return '#ef4444';
                case 'medium': return '#f59e0b';
                case 'low':
                default: return '#94a3b8';
            }
        }
        switch (stress) {
            case 'high': return '#f87171';
            case 'medium': return '#fbbf24';
            case 'low':
            default: return '#60a5fa';
        }
    };

    const getFillColor = () => {
        if (isHeatmapMode) {
            switch (stress) {
                case 'high': return '#fef2f2';
                case 'medium': return '#fffbeb';
                case 'low':
                default: return '#f8fafc';
            }
        }
        if (isAgent) return '#f5f3ff';
        return '#ffffff';
    };

    const getVisualClasses = () => {
        if (isHeatmapMode) {
            switch (stress) {
                case 'high': return 'drop-shadow-[0_0_12px_rgba(239,68,68,0.5)] scale-105 transition-all duration-300';
                case 'medium': return 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)] transition-all duration-300';
                case 'low':
                default: return 'opacity-50 grayscale transition-all duration-300';
            }
        }
        return selected
            ? 'drop-shadow-[0_0_10px_rgba(99,102,241,0.6)] transition-all duration-200'
            : 'drop-shadow-sm hover:drop-shadow-md transition-all duration-200';
    };

    return (
        <div
            className={`relative group ${getVisualClasses()} ${className}`}
            style={{ width, height }}
            onClick={onClick}
        >
            {/* SVG Background Shape */}
            <FlowShapeRenderer
                shape={shape}
                width={width}
                height={height}
                fill={getFillColor()}
                stroke={getStrokeColor()}
                strokeWidth={selected ? 3 : 2}
            />

            {/* 4방향 Handles (정확한 SVG 외곽선 좌표 사용) */}
            {handles.top && (
                <>
                    <Handle
                        type="source"
                        position={Position.Top}
                        id="top"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair z-20"
                        style={{ top: anchors.top.y, left: anchors.top.x, transform: 'translate(-50%, -50%)' }}
                    />
                    <Handle
                        type="target"
                        position={Position.Top}
                        id="top-target"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair z-20"
                        style={{ top: anchors.top.y, left: anchors.top.x, transform: 'translate(-50%, -50%)' }}
                    />
                </>
            )}
            {handles.right && (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="right"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair z-20"
                        style={{ top: anchors.right.y, left: anchors.right.x, transform: 'translate(-50%, -50%)' }}
                    />
                    <Handle
                        type="target"
                        position={Position.Right}
                        id="right-target"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair z-20"
                        style={{ top: anchors.right.y, left: anchors.right.x, transform: 'translate(-50%, -50%)' }}
                    />
                </>
            )}
            {handles.bottom && (
                <>
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="bottom"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair z-20"
                        style={{ top: anchors.bottom.y, left: anchors.bottom.x, transform: 'translate(-50%, -50%)' }}
                    />
                    <Handle
                        type="target"
                        position={Position.Bottom}
                        id="bottom-target"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair z-20"
                        style={{ top: anchors.bottom.y, left: anchors.bottom.x, transform: 'translate(-50%, -50%)' }}
                    />
                </>
            )}
            {handles.left && (
                <>
                    <Handle
                        type="source"
                        position={Position.Left}
                        id="left"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair z-20"
                        style={{ top: anchors.left.y, left: anchors.left.x, transform: 'translate(-50%, -50%)' }}
                    />
                    <Handle
                        type="target"
                        position={Position.Left}
                        id="left-target"
                        className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair z-20"
                        style={{ top: anchors.left.y, left: anchors.left.x, transform: 'translate(-50%, -50%)' }}
                    />
                </>
            )}

            {/* Content Container Inside SVG Shape (도형별 안전영역 적용) */}
            <div
                className="absolute flex items-center justify-center z-10 overflow-hidden pointer-events-none"
                style={{
                    top: anchorsContent.top,
                    right: anchorsContent.right,
                    bottom: anchorsContent.bottom,
                    left: anchorsContent.left,
                }}
            >
                <div className="pointer-events-auto w-full h-full flex flex-col items-center justify-center text-center overflow-hidden">
                    {children}
                </div>
            </div>

            {/* Stress Indicator Dot */}
            {!isHeatmapMode && stress !== 'low' && (
                <div
                    className={`absolute -top-1 -right-1 w-3 h-3 rounded-full z-30 ${
                        stress === 'high' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
                    }`}
                />
            )}
        </div>
    );
};

// ============================================
// Terminal Node (시작/종료)
// ============================================
const TerminalNode = memo(({ data, selected }: NodeProps<Node<CommonNodeData>>) => {
    const [showPopover, setShowPopover] = useState(false);
    const contentState = getNodeContentState(data, 'terminal');
    const isStart = data.terminalType !== 'end';

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (contentState.canShowPopover) {
            setShowPopover(!showPopover);
        }
    };

    return (
        <div className="relative">
            <NodeShapeWrapper
                shape={data.shape}
                type="terminal"
                terminalType={data.terminalType}
                selected={selected}
                isHeatmapMode={data.isHeatmapMode}
                stress={data.stressLevel}
                onClick={handleNodeClick}
            >
                <div className="flex items-center justify-center gap-1.5 px-2 overflow-hidden w-full">
                    {contentState.showIcon && <span className="text-base shrink-0">{isStart ? '▶' : '⏹'}</span>}
                    <span
                        className="font-semibold text-xs text-indigo-700 w-full text-center"
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: contentState.maxLines,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                        }}
                    >
                        {data.label}
                    </span>
                </div>
            </NodeShapeWrapper>

            {showPopover && (
                <div
                    className="absolute left-full ml-3 top-0 z-50 w-[240px]
                               bg-white/95 backdrop-blur-xl border border-slate-200
                               rounded-xl shadow-2xl p-3
                               animate-in fade-in slide-in-from-left-2 zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="pb-1.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 line-clamp-1">
                            {isStart ? '▶ 시작' : '⏹ 종료'} · {data.label}
                        </span>
                        <button
                            onClick={() => setShowPopover(false)}
                            className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-[10px] text-slate-500 shrink-0"
                        >
                            ✕
                        </button>
                    </div>

                    {contentState.hasDescription && (
                        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-md p-2 mt-2">
                            {data.description}
                        </div>
                    )}

                    {contentState.durationText && (
                        <div className="mt-2 text-xs text-indigo-700 font-medium">
                            ⏱️ 예상 소요 시간: {contentState.durationText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
TerminalNode.displayName = 'TerminalNode';

// ============================================
// Process Node (일반 처리) - Float Popover 기반 확장 (Overflow 절단 방지)
// ============================================
const ProcessNode = memo(({ data, selected }: NodeProps<Node<CommonNodeData>>) => {
    const [showPopover, setShowPopover] = useState(false);
    const contentState = getNodeContentState(data, 'process');
    const stress = data.stressLevel || 'low';
    const metrics = data.metrics;

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (contentState.canShowPopover) {
            setShowPopover(!showPopover);
        }
    };

    return (
        <div className="relative">
            <NodeShapeWrapper
                shape={data.shape}
                type="process"
                stress={stress}
                isHeatmapMode={data.isHeatmapMode}
                selected={selected}
                onClick={handleNodeClick}
            >
                <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                    <span
                        className="font-semibold text-xs text-slate-800 leading-tight w-full text-center"
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: contentState.maxLines,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                        }}
                    >
                        {data.label}
                    </span>
                    {contentState.showDurationInNode && (
                        <span className="text-[10px] text-slate-500 font-medium mt-1 truncate max-w-full">
                            ⏱️ {contentState.durationText}
                        </span>
                    )}
                    {contentState.showDetailHint && (
                        <span className="text-[8px] text-indigo-500 font-medium mt-0.5 opacity-70 group-hover:opacity-100 truncate max-w-full">
                            ⓘ 클릭하여 상세 보기
                        </span>
                    )}
                </div>
            </NodeShapeWrapper>

            {/* 상세 설명 및 역량별 소요시간 Float Popover */}
            {showPopover && (
                <div
                    className="absolute left-full ml-3 top-0 z-50 w-[240px]
                               bg-white/95 backdrop-blur-xl border border-slate-200
                               rounded-xl shadow-2xl p-3
                               animate-in fade-in slide-in-from-left-2 zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="pb-1.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 line-clamp-1">{data.label}</span>
                        <button
                            onClick={() => setShowPopover(false)}
                            className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-[10px] text-slate-500 shrink-0"
                        >
                            ✕
                        </button>
                    </div>

                    {contentState.hasDescription && (
                        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-md p-2 mt-2">
                            {data.description}
                        </div>
                    )}

                    {contentState.durationText && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                            <div className="text-[10px] text-slate-500 font-medium mb-1 flex items-center justify-between">
                                <span>예상 소요 시간</span>
                                <span className="font-semibold text-indigo-600">⏱️ {contentState.durationText}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center text-[9px]">
                                <div className="bg-red-50 p-1 rounded border border-red-100">
                                    <div className="text-red-500">저역량</div>
                                    <div className="font-semibold text-red-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.junior)}</div>
                                </div>
                                <div className="bg-amber-50 p-1 rounded border border-amber-100">
                                    <div className="text-amber-500">중역량</div>
                                    <div className="font-semibold text-amber-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.mid)}</div>
                                </div>
                                <div className="bg-emerald-50 p-1 rounded border border-emerald-100">
                                    <div className="text-emerald-500">고역량</div>
                                    <div className="font-semibold text-emerald-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.senior)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
ProcessNode.displayName = 'ProcessNode';

// ============================================
// Decision Node (조건 판단/분기)
// ============================================
const DecisionNode = memo(({ data, selected }: NodeProps<Node<CommonNodeData>>) => {
    const [showPopover, setShowPopover] = useState(false);
    const contentState = getNodeContentState(data, 'decision');

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (contentState.canShowPopover) {
            setShowPopover(!showPopover);
        }
    };

    return (
        <div className="relative">
            <NodeShapeWrapper
                shape={data.shape}
                type="decision"
                selected={selected}
                isHeatmapMode={data.isHeatmapMode}
                stress={data.stressLevel}
                onClick={handleNodeClick}
            >
                <div className="flex flex-col items-center justify-center px-1 overflow-hidden w-full">
                    {contentState.showIcon && <span className="text-sm shrink-0">❓</span>}
                    <span
                        className="font-semibold text-[11px] text-slate-800 leading-tight mt-0.5 w-full text-center"
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: contentState.maxLines,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                        }}
                    >
                        {data.label}
                    </span>
                    {contentState.showDurationInNode && (
                        <span className="text-[9px] text-amber-600 font-medium mt-0.5 truncate max-w-full">⏱️{contentState.durationText}</span>
                    )}
                </div>
            </NodeShapeWrapper>

            {showPopover && (
                <div
                    className="absolute left-full ml-3 top-0 z-50 w-[240px]
                               bg-white/95 backdrop-blur-xl border border-slate-200
                               rounded-xl shadow-2xl p-3
                               animate-in fade-in slide-in-from-left-2 zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="pb-1.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 line-clamp-1">{data.label}</span>
                        <button
                            onClick={() => setShowPopover(false)}
                            className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-[10px] text-slate-500 shrink-0"
                        >
                            ✕
                        </button>
                    </div>
                    {contentState.hasDescription && (
                        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-md p-2 mt-2">
                            {data.description}
                        </div>
                    )}
                    {contentState.durationText && (
                        <div className="mt-2 text-xs text-amber-700 font-medium">
                            ⏱️ 예상 소요 시간: {contentState.durationText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
DecisionNode.displayName = 'DecisionNode';

// ============================================
// IO Node (입출력 데이터)
// ============================================
const IONode = memo(({ data, selected }: NodeProps<Node<CommonNodeData>>) => {
    const [showPopover, setShowPopover] = useState(false);
    const contentState = getNodeContentState(data, 'io');
    const isInput = data.ioType !== 'output';

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (contentState.canShowPopover) {
            setShowPopover(!showPopover);
        }
    };

    return (
        <div className="relative">
            <NodeShapeWrapper
                shape={data.shape}
                type="io"
                ioType={data.ioType}
                selected={selected}
                isHeatmapMode={data.isHeatmapMode}
                stress={data.stressLevel}
                onClick={handleNodeClick}
            >
                <div className="flex flex-col items-center justify-center px-1 overflow-hidden w-full">
                    <div className="flex items-center justify-center gap-1 w-full overflow-hidden">
                        {contentState.showIcon && <span className="text-sm shrink-0">{isInput ? '📥' : '📤'}</span>}
                        <span
                            className="font-semibold text-xs text-slate-800 w-full text-center"
                            style={{
                                display: '-webkit-box',
                                WebkitLineClamp: contentState.maxLines,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                            }}
                        >
                            {data.label}
                        </span>
                    </div>
                    {contentState.showDurationInNode && (
                        <span className="text-[9px] text-blue-600 font-medium mt-0.5 truncate max-w-full">⏱️{contentState.durationText}</span>
                    )}
                </div>
            </NodeShapeWrapper>

            {showPopover && (
                <div
                    className="absolute left-full ml-3 top-0 z-50 w-[240px]
                               bg-white/95 backdrop-blur-xl border border-slate-200
                               rounded-xl shadow-2xl p-3
                               animate-in fade-in slide-in-from-left-2 zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="pb-1.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 line-clamp-1">{data.label}</span>
                        <button
                            onClick={() => setShowPopover(false)}
                            className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-[10px] text-slate-500 shrink-0"
                        >
                            ✕
                        </button>
                    </div>
                    {contentState.hasDescription && (
                        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-md p-2 mt-2">
                            {data.description}
                        </div>
                    )}
                    {contentState.durationText && (
                        <div className="mt-2 text-xs text-blue-700 font-medium">
                            ⏱️ 예상 소요 시간: {contentState.durationText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
IONode.displayName = 'IONode';

// ============================================
// Agent Node (AI Agent) - Popover 확장
// ============================================
const AgentNode = memo(({ data, selected }: NodeProps<Node<CommonNodeData>>) => {
    const [showPopover, setShowPopover] = useState(false);
    const contentState = getNodeContentState(data, 'agent');

    const collabLabels = {
        copilot: '🤝 Co-pilot',
        monitor: '👁️ Monitor',
        autonomous: '🚀 Autonomous',
    };

    const collabColors = {
        copilot: 'bg-emerald-100 text-emerald-700',
        monitor: 'bg-blue-100 text-blue-700',
        autonomous: 'bg-purple-100 text-purple-700',
    };

    const collab = data.collaborationType || 'copilot';
    const isStrategySelected = data.isSelectedForStrategy;
    const metrics = data.metrics;

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (contentState.canShowPopover) {
            setShowPopover(!showPopover);
        }
    };

    return (
        <div className="relative">
            <NodeShapeWrapper
                shape={data.shape}
                type="agent"
                selected={selected}
                isHeatmapMode={data.isHeatmapMode}
                stress={data.stressLevel}
                isAgent={true}
                onClick={handleNodeClick}
                className={isStrategySelected ? 'ring-4 ring-purple-500/70 ring-offset-2 ring-offset-white shadow-lg' : ''}
            >
                {/* 전략 선택 뱃지 */}
                {isStrategySelected && (
                    <div className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-md z-30 animate-pulse">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}

                {/* 상세 설명 인디케이터 (compact 시 숨김) */}
                {contentState.showAgentIndicator && (
                    <div className="absolute -top-1 -left-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-30">
                        <span className="text-white text-[9px] font-bold">i</span>
                    </div>
                )}

                <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                    {contentState.showIcon && <span className="text-base leading-none mb-0.5">🤖</span>}
                    <div
                        className="font-semibold text-xs text-slate-800 leading-tight w-full text-center"
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: contentState.maxLines,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                        }}
                    >
                        {data.label}
                    </div>
                    {contentState.showCollabBadge && (
                        <div className={`text-[9px] px-1.5 py-0.5 rounded-full mt-1 font-medium ${collabColors[collab]}`}>
                            {collabLabels[collab]}
                        </div>
                    )}

                    {contentState.showDurationInNode && (
                        <div className="text-[9px] text-slate-500 mt-0.5 truncate max-w-full">
                            ⏱️ {contentState.durationText}
                        </div>
                    )}
                </div>
            </NodeShapeWrapper>

            {/* 글래스모피즘 상세 설명 Popover */}
            {showPopover && (
                <div
                    className="absolute left-full ml-3 top-0 z-50 w-[260px]
                               bg-white/95 backdrop-blur-xl border border-slate-200
                               rounded-xl shadow-2xl p-3
                               animate-in fade-in slide-in-from-left-2 zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <span className="text-base">🤖</span>
                            <span className="font-semibold text-xs text-slate-800 line-clamp-1">{data.label}</span>
                        </div>
                        <button
                            onClick={() => setShowPopover(false)}
                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-xs text-slate-500 shrink-0"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="py-2">
                        <div className={`text-[10px] px-2 py-0.5 rounded-full inline-block font-medium ${collabColors[collab]}`}>
                            {collabLabels[collab]}
                        </div>
                    </div>

                    {data.agentDescription && (
                        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-md p-2">
                            {data.agentDescription}
                        </div>
                    )}

                    {contentState.durationText && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                            <div className="text-[10px] text-slate-500 font-medium mb-1">예상 처리 시간</div>
                            <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                                <div className="bg-red-50 p-1 rounded">
                                    <div className="text-red-500">저역량</div>
                                    <div className="font-semibold text-red-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.junior)}</div>
                                </div>
                                <div className="bg-amber-50 p-1 rounded">
                                    <div className="text-amber-500">중역량</div>
                                    <div className="font-semibold text-amber-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.mid)}</div>
                                </div>
                                <div className="bg-emerald-50 p-1 rounded">
                                    <div className="text-emerald-500">고역량</div>
                                    <div className="font-semibold text-emerald-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.senior)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
AgentNode.displayName = 'AgentNode';

export const nodeTypes = {
    terminal: TerminalNode,
    process: ProcessNode,
    decision: DecisionNode,
    io: IONode,
    agent: AgentNode,
    task: ProcessNode,
    subprocess: ProcessNode,
};

export { TerminalNode, ProcessNode, DecisionNode, IONode, AgentNode, NodeShapeWrapper };
