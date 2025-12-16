'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { DurationUnit } from '@/lib/store';

// ============================================
// 데이터 타입 정의
// ============================================

// 공통 Metrics 타입 (duration + durationUnit 지원)
type NodeMetrics = {
    timeMinutes?: number; // 하위 호환성
    duration?: number;
    durationUnit?: DurationUnit;
};

type TerminalNodeData = {
    label: string;
    terminalType?: 'start' | 'end';
    shape?: ShapeType;
};

type ProcessNodeData = {
    label: string;
    description?: string;
    stressLevel?: 'low' | 'medium' | 'high';
    metrics?: NodeMetrics;
    isHeatmapMode?: boolean;
    shape?: ShapeType;
};

type DecisionNodeData = {
    label: string;
    condition?: string;
    shape?: ShapeType;
};

type IONodeData = {
    label: string;
    ioType?: 'input' | 'output';
    description?: string;
    shape?: ShapeType;
};

type AgentNodeData = {
    label: string;
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    agentDescription?: string;
    shape?: ShapeType;
    isSelectedForStrategy?: boolean;
    metrics?: NodeMetrics;
};

// ============================================
// 공통 스타일
// ============================================

const formatNumber = (num: number): string => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
    return num.toString();
};

// 시간 단위별 표시 포맷터
const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
    minutes: '분',
    hours: '시간',
    days: '일',
    weeks: '주',
    months: '개월',
};

const formatDuration = (metrics?: NodeMetrics): string | null => {
    if (!metrics) return null;
    
    // 새 형식 우선 (duration + durationUnit)
    if (metrics.duration !== undefined && metrics.duration > 0) {
        const unit = metrics.durationUnit || 'minutes';
        return `${metrics.duration}${DURATION_UNIT_LABELS[unit]}`;
    }
    
    // 하위 호환성 (기존 timeMinutes)
    if (metrics.timeMinutes !== undefined && metrics.timeMinutes > 0) {
        return `${metrics.timeMinutes}분`;
    }
    
    return null;
};

// 스킬 레벨별 시간 계산 (duration 기준)
const formatDurationWithMultiplier = (metrics?: NodeMetrics, multiplier: number = 1): string | null => {
    if (!metrics) return null;
    
    const duration = metrics.duration ?? metrics.timeMinutes;
    if (duration === undefined || duration <= 0) return null;
    
    const unit = metrics.durationUnit || 'minutes';
    const adjusted = multiplier === 1 ? duration : (duration * multiplier).toFixed(1);
    return `${adjusted}${DURATION_UNIT_LABELS[unit]}`;
};

export type ShapeType = 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'parallelogram' | 'hexagon';

// ============================================
// Node Shape Wrapper (공통 모양 & 핸들 관리)
// ============================================
interface NodeShapeWrapperProps {
    shape?: ShapeType;
    stress?: 'low' | 'medium' | 'high';
    isHeatmapMode?: boolean;
    selected?: boolean;
    className?: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    handles?: {
        top?: boolean;
        right?: boolean;
        bottom?: boolean;
        left?: boolean;
    };
}

const NodeShapeWrapper = ({
    shape = 'rectangle',
    stress = 'low',
    isHeatmapMode,
    selected,
    className = '',
    children,
    onClick,
    handles = { top: true, right: true, bottom: true, left: true }, // 기본값: 4방향 모두 활성
}: NodeShapeWrapperProps) => {
    // Shape별 스타일 정의
    const getShapeStyle = (s: ShapeType) => {
        switch (s) {
            case 'pill':
                return 'rounded-full';
            case 'rounded':
                return 'rounded-xl';
            case 'diamond':
                return 'rotate-45 scale-90'; // 내용은 역회전 필요
            case 'parallelogram':
                return '-skew-x-12'; // 내용은 역스큐 필요
            case 'hexagon':
                return 'clip-path-hexagon'; // CSS 클래스 또는 clip-path 필요
            case 'rectangle':
            default:
                return 'rounded-md';
        }
    };

    // Stress & Heatmap 스타일
    const getVisualStyles = () => {
        // 히트맵 모드 처리
        if (isHeatmapMode) {
            switch (stress) {
                case 'high':
                    return 'ring-4 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)] bg-red-50/90 border-red-500 scale-105 z-10 transition-all duration-300';
                case 'medium':
                    return 'ring-2 ring-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.3)] bg-amber-50/80 border-amber-400 transition-all duration-300';
                case 'low':
                default:
                    return 'opacity-40 grayscale blur-[1px] scale-95 transition-all duration-300';
            }
        }

        // 일반 모드 테두리 색상
        const borderColors = {
            low: 'border-blue-400',
            medium: 'border-amber-400',
            high: 'border-red-400',
        };
        return borderColors[stress] || 'border-slate-400';
    };

    const baseStyle = `relative bg-white border-2 shadow-sm transition-all duration-200 ${getShapeStyle(shape)} ${getVisualStyles()} ${selected ? 'ring-2 ring-indigo-400/50 ring-offset-2 ring-offset-slate-900' : ''} ${className}`;

    // 내부 컨텐츠용 역변환 스타일 (도형 변형 시 내용물 바로잡기)
    const contentStyle =
        shape === 'diamond' ? '-rotate-45 scale-110' : shape === 'parallelogram' ? 'skew-x-12' : '';

    return (
        <div className={baseStyle} onClick={onClick}>
            {/* 4-way Handles - 모든 방향에서 드래그 시작 시 해당 노드가 source가 되도록 설정 */}
            {handles.top && (
                <>
                    {/* 드래그 시작용 source handle (기본 보임) */}
                    <Handle
                        type="source"
                        position={Position.Top}
                        id="top"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                    />
                    {/* 연결 받기용 target handle (같은 위치에 겹침) */}
                    <Handle
                        type="target"
                        position={Position.Top}
                        id="top-target"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair"
                        style={{ top: 0 }}
                    />
                </>
            )}
            {handles.right && (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="right"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                    />
                    <Handle
                        type="target"
                        position={Position.Right}
                        id="right-target"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair"
                        style={{ right: 0 }}
                    />
                </>
            )}
            {handles.bottom && (
                <>
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="bottom"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                    />
                    <Handle
                        type="target"
                        position={Position.Bottom}
                        id="bottom-target"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair"
                        style={{ bottom: 0 }}
                    />
                </>
            )}
            {handles.left && (
                <>
                    {/* 드래그 시작용 source handle (기본 보임) */}
                    <Handle
                        type="source"
                        position={Position.Left}
                        id="left"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                    />
                    {/* 연결 받기용 target handle (같은 위치에 겹침) */}
                    <Handle
                        type="target"
                        position={Position.Left}
                        id="left-target"
                        className="!bg-slate-400 w-4 h-4 border-2 border-white !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all pointer-events-auto cursor-crosshair"
                        style={{ left: 0 }}
                    />
                </>
            )}

            {/* Content Area */}
            <div className={`flex items-center justify-center w-full h-full p-2 ${contentStyle}`}>
                {children}
            </div>

            {/* Stress indicator (Standard Mode only) */}
            {!isHeatmapMode && stress !== 'low' && (
                <div
                    className={`absolute -top-1 -right-1 w-3 h-3 rounded-full z-10 
                    ${stress === 'high' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}
                />
            )}
        </div>
    );
};

// ============================================
// Terminal Node (타원형 - 시작/종료)
// ============================================
export const TerminalNode = memo(({ data, selected }: NodeProps<Node<TerminalNodeData>>) => {
    const isStart = data.terminalType !== 'end';
    const shape = data.shape || 'pill';

    return (
        <NodeShapeWrapper
            shape={shape}
            selected={selected}
            className="px-8 py-4 min-w-[140px] text-center"
        >
            <div className="flex items-center justify-center gap-2">
                <span className="text-xl">{isStart ? '▶' : '⏹'}</span>
                <span className="font-semibold text-sm tracking-wide text-indigo-600">
                    {data.label}
                </span>
            </div>
        </NodeShapeWrapper>
    );
});
TerminalNode.displayName = 'TerminalNode';

// ============================================
// 스킬 레벨 상수 (Manhour 계산용)
// ============================================
const SKILL_MULTIPLIERS = {
    junior: 1.5,
    mid: 1.0,
    senior: 0.7,
};

// ============================================
// Process Node (직사각형 - 처리) - 아코디언 확장
// ============================================
// ============================================
// Process Node (직사각형 - 처리) - 아코디언 확장
// ============================================
export const ProcessNode = memo(({ data, selected }: NodeProps<Node<ProcessNodeData>>) => {
    const [expanded, setExpanded] = useState(false);
    const [skillExpanded, setSkillExpanded] = useState(false);

    const stress = data.stressLevel || 'low';
    const metrics = data.metrics;
    const hasDescription = !!data.description;
    const isHeatmapMode = data.isHeatmapMode;
    // Default shape for Process is 'rectangle' if not specified
    const shape = data.shape || 'rectangle';
    const durationText = formatDuration(metrics);

    const handleTimeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (durationText) {
            setSkillExpanded(!skillExpanded);
        }
    };

    return (
        <NodeShapeWrapper
            shape={shape}
            stress={stress}
            isHeatmapMode={isHeatmapMode}
            selected={selected}
            className={`min-w-[150px] ${expanded || skillExpanded ? 'max-w-[300px]' : 'max-w-[200px]'}`}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                if (hasDescription) setExpanded(!expanded);
            }}
        >
            <div className="flex flex-col w-full">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm text-slate-800">{data.label}</span>
                    {hasDescription && (
                        <span
                            className="text-xs text-slate-400 transition-transform"
                            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                            ▼
                        </span>
                    )}
                </div>

                {/* 축소 상태: 미리보기 */}
                {!expanded && hasDescription && (
                    <div className="text-xs text-slate-500 truncate">
                        {data.description?.slice(0, 25)}...
                    </div>
                )}

                {/* 확장 상태: 전체 설명 */}
                {expanded && hasDescription && (
                    <div className="text-xs text-slate-700 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        {data.description}
                    </div>
                )}

                {durationText && (
                    <div className="pt-2 mt-2 border-t border-slate-200">
                        <div 
                            className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700 transition-colors"
                            onClick={handleTimeClick}
                        >
                            <span>⏱️ {durationText}</span>
                            <span 
                                className="text-[10px] transition-transform"
                                style={{ transform: skillExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                                ▼
                            </span>
                        </div>
                        {/* 스킬별 시간 표시 */}
                        {skillExpanded && (
                            <div className="mt-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    <span className="text-slate-600">저역량:</span>
                                    <span className="font-medium text-red-600">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.junior)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    <span className="text-slate-600">중역량:</span>
                                    <span className="font-medium text-amber-600">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.mid)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span className="text-slate-600">고역량:</span>
                                    <span className="font-medium text-emerald-600">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.senior)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </NodeShapeWrapper>
    );
});
ProcessNode.displayName = 'ProcessNode';

// ============================================
// Decision Node (마름모 - 판단/분기)
// ============================================
// 마름모는 꼭지점에 연결점이 있어야 하므로 별도 구현
// ============================================
export const DecisionNode = memo(({ data, selected }: NodeProps<Node<DecisionNodeData>>) => {
    // 마름모 노드 - 꼭지점에 Handle 배치를 위해 커스텀 렌더링
    const size = 100; // 마름모 크기
    const half = size / 2;

    return (
        <div
            className={`relative ${selected ? 'drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]' : ''}`}
            style={{ width: size, height: size }}
        >
            {/* 마름모 SVG */}
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="absolute inset-0"
            >
                <polygon
                    points={`${half},4 ${size - 4},${half} ${half},${size - 4} 4,${half}`}
                    fill="white"
                    stroke={selected ? '#6366f1' : '#60a5fa'}
                    strokeWidth={selected ? 3 : 2}
                    className="transition-all duration-200"
                />
            </svg>

            {/* 꼭지점 Handle들 - 상/우/하/좌 (각 방향 source/target 모두 지원) */}
            {/* 상단 꼭지점 */}
            <Handle
                type="target"
                position={Position.Top}
                id="top"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ top: 0, left: '50%', transform: 'translate(-50%, -50%)' }}
            />
            <Handle
                type="source"
                position={Position.Top}
                id="top-source"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ top: 0, left: '50%', transform: 'translate(-50%, -50%)' }}
            />
            {/* 우측 꼭지점 */}
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ top: '50%', right: 0, transform: 'translate(50%, -50%)' }}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="right-target"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ top: '50%', right: 0, transform: 'translate(50%, -50%)' }}
            />
            {/* 하단 꼭지점 */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' }}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                id="bottom-target"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' }}
            />
            {/* 좌측 꼭지점 */}
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ top: '50%', left: 0, transform: 'translate(-50%, -50%)' }}
            />
            <Handle
                type="source"
                position={Position.Left}
                id="left-source"
                className="!bg-amber-400 !w-4 !h-4 !border-2 !border-white !rounded-full !opacity-0 hover:!opacity-100 hover:!bg-indigo-500 hover:scale-125 transition-all cursor-crosshair"
                style={{ top: '50%', left: 0, transform: 'translate(-50%, -50%)' }}
            />

            {/* 컨텐츠 (중앙에 배치) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-3 pointer-events-none">
                <span className="text-lg mb-0.5">❓</span>
                <div className="font-semibold text-[11px] text-slate-800 leading-tight text-center max-w-[70px]">
                    {data.label}
                </div>
            </div>
        </div>
    );
});
DecisionNode.displayName = 'DecisionNode';

// ============================================
// IO Node (평행사변형 - 입출력) - 아코디언 확장
// ============================================
export const IONode = memo(({ data, selected }: NodeProps<Node<IONodeData>>) => {
    const [expanded, setExpanded] = useState(false);
    const isInput = data.ioType !== 'output';
    const hasDescription = !!data.description;
    const shape = data.shape || 'parallelogram';

    return (
        <NodeShapeWrapper
            shape={shape}
            selected={selected}
            className={`px-6 py-4 min-w-[160px] cursor-pointer ${expanded ? 'max-w-[280px]' : 'max-w-[200px]'}`}
            onClick={(e) => {
                e.stopPropagation();
                if (hasDescription) setExpanded(!expanded);
            }}
        >
            <div className="space-y-1 w-full">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{isInput ? '📥' : '📤'}</span>
                    <span className="font-semibold text-sm text-slate-800">{data.label}</span>
                    {hasDescription && (
                        <span
                            className="text-xs text-slate-400 ml-auto transition-transform"
                            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                            ▼
                        </span>
                    )}
                </div>

                {!expanded && hasDescription && (
                    <div className="text-xs text-slate-500 truncate">
                        {data.description?.slice(0, 25)}...
                    </div>
                )}

                {expanded && hasDescription && (
                    <div className="text-xs text-slate-600 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        {data.description}
                    </div>
                )}
            </div>
        </NodeShapeWrapper>
    );
});
IONode.displayName = 'IONode';

// ============================================
// Agent Node (팔각형 - AI Agent) - 아코디언 확장
// ============================================
export const AgentNode = memo(({ data, selected }: NodeProps<Node<AgentNodeData>>) => {
    const [showPopover, setShowPopover] = useState(false);
    const [skillExpanded, setSkillExpanded] = useState(false);

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
    const hasDescription = !!data.agentDescription;
    const shape = data.shape || 'hexagon';
    const isStrategySelected = data.isSelectedForStrategy;
    const metrics = data.metrics;
    const durationText = formatDuration(metrics);

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasDescription) {
            setShowPopover(!showPopover);
        }
    };

    const handleTimeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (durationText) {
            setSkillExpanded(!skillExpanded);
        }
    };

    const handlePopoverClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowPopover(false);
    };

    return (
        <div className="relative">
            <NodeShapeWrapper
                shape={shape}
                selected={selected}
                className={`flex items-center justify-center cursor-pointer w-[180px] h-[140px] ${isStrategySelected ? 'ring-4 ring-purple-500/70 ring-offset-2 ring-offset-white shadow-lg shadow-purple-200' : ''}`}
                onClick={handleNodeClick}
            >
                {/* 전략 선택 뱃지 */}
                {isStrategySelected && (
                    <div className="absolute -top-3 -right-3 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center shadow-md z-20 animate-pulse">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
                
                {/* 상세 설명 있음 표시 */}
                {hasDescription && (
                    <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-20">
                        <span className="text-white text-[10px] font-bold">i</span>
                    </div>
                )}

                <div className="text-center p-3 space-y-1.5 w-full overflow-hidden">
                    <span className="text-2xl block">🤖</span>
                    {/* 레이블: 2줄 제한 + ellipsis */}
                    <div className="font-semibold text-xs text-slate-800 line-clamp-2 leading-tight px-1">
                        {data.label}
                    </div>
                    <div className={`text-[10px] px-2 py-0.5 rounded-full inline-block ${collabColors[collab]}`}>
                        {collabLabels[collab]}
                    </div>

                    {/* 시간 메트릭 표시 */}
                    {durationText && (
                        <div 
                            className="text-[10px] text-slate-500 flex items-center justify-center gap-1 cursor-pointer hover:text-slate-700 transition-colors pt-1"
                            onClick={handleTimeClick}
                        >
                            <span>⏱️ {durationText}</span>
                            <span 
                                className="text-[8px] transition-transform"
                                style={{ transform: skillExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                                ▼
                            </span>
                        </div>
                    )}
                </div>
            </NodeShapeWrapper>

            {/* 스킬별 시간 Popover (작은 팝업) */}
            {skillExpanded && durationText && (
                <div 
                    className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 
                               bg-white/95 backdrop-blur-lg border border-slate-200/80 
                               rounded-lg shadow-xl shadow-slate-200/50 p-3 min-w-[140px]
                               animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                            <span className="text-slate-600">저역량:</span>
                            <span className="font-semibold text-red-600 ml-auto">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.junior)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                            <span className="text-slate-600">중역량:</span>
                            <span className="font-semibold text-amber-600 ml-auto">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.mid)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                            <span className="text-slate-600">고역량:</span>
                            <span className="font-semibold text-emerald-600 ml-auto">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.senior)}</span>
                        </div>
                    </div>
                    {/* 닫기 힌트 */}
                    <div className="text-[9px] text-slate-400 text-center mt-2 pt-2 border-t border-slate-100">
                        시간 클릭하여 닫기
                    </div>
                </div>
            )}

            {/* 글래스모피즘 상세 설명 Popover */}
            {showPopover && hasDescription && (
                <div 
                    className="absolute left-full ml-3 top-0 z-50 w-[280px]
                               bg-white/90 backdrop-blur-xl border border-white/50 
                               rounded-2xl shadow-2xl shadow-slate-900/20 
                               animate-in fade-in slide-in-from-left-2 zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* 헤더 */}
                    <div className="px-4 py-3 border-b border-slate-200/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🤖</span>
                            <span className="font-semibold text-sm text-slate-800 line-clamp-1">{data.label}</span>
                        </div>
                        <button 
                            onClick={handlePopoverClose}
                            className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                        >
                            <span className="text-slate-500 text-xs">✕</span>
                        </button>
                    </div>
                    
                    {/* 협업 유형 */}
                    <div className="px-4 py-2">
                        <div className={`text-xs px-3 py-1 rounded-full inline-block ${collabColors[collab]}`}>
                            {collabLabels[collab]}
                        </div>
                    </div>

                    {/* 상세 설명 */}
                    <div className="px-4 pb-4">
                        <div className="text-xs text-slate-600 font-medium mb-1.5">상세 설명</div>
                        <div className="text-sm text-slate-700 leading-relaxed bg-slate-50/80 rounded-lg p-3">
                            {data.agentDescription}
                        </div>
                    </div>

                    {/* 시간 정보 (있으면 표시) */}
                    {durationText && (
                        <div className="px-4 pb-4">
                            <div className="text-xs text-slate-600 font-medium mb-1.5">예상 처리 시간</div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-center p-2 bg-red-50 rounded-lg">
                                    <div className="text-[10px] text-red-600">저역량</div>
                                    <div className="font-semibold text-red-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.junior)}</div>
                                </div>
                                <div className="text-center p-2 bg-amber-50 rounded-lg">
                                    <div className="text-[10px] text-amber-600">중역량</div>
                                    <div className="font-semibold text-amber-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.mid)}</div>
                                </div>
                                <div className="text-center p-2 bg-emerald-50 rounded-lg">
                                    <div className="text-[10px] text-emerald-600">고역량</div>
                                    <div className="font-semibold text-emerald-700">{formatDurationWithMultiplier(metrics, SKILL_MULTIPLIERS.senior)}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 화살표 포인터 */}
                    <div className="absolute left-0 top-6 -translate-x-full">
                        <div className="w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-white/90"></div>
                    </div>
                </div>
            )}
        </div>
    );
});
AgentNode.displayName = 'AgentNode';

// ============================================
// Legacy Support - Task/SubProcess (기존 호환)
// ============================================
export const TaskNode = ProcessNode;
export const SubProcessNode = ProcessNode;

// ============================================
// Node Types Export
// ============================================
export const nodeTypes = {
    // 표준 도식 도형
    terminal: TerminalNode,
    process: ProcessNode,
    decision: DecisionNode,
    io: IONode,
    agent: AgentNode,
    // 기존 호환
    task: ProcessNode,
    subprocess: ProcessNode,
};
