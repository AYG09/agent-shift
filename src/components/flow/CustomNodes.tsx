'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

// ============================================
// 데이터 타입 정의
// ============================================
type TerminalNodeData = {
    label: string;
    terminalType?: 'start' | 'end';
};

type ProcessNodeData = {
    label: string;
    description?: string;
    stressLevel?: 'low' | 'medium' | 'high';
    metrics?: {
        timeMinutes?: number;
        costKRW?: number;
        peopleCount?: number;
    };
};

type DecisionNodeData = {
    label: string;
    condition?: string;
};

type IONodeData = {
    label: string;
    ioType?: 'input' | 'output';
    description?: string;
};

type AgentNodeData = {
    label: string;
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    agentDescription?: string;
};

// ============================================
// 공통 스타일
// ============================================
const nodeBaseStyle = "flow-node relative font-medium transition-all duration-200";

const formatNumber = (num: number): string => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
    return num.toString();
};

// ============================================
// Terminal Node (타원형 - 시작/종료)
// ============================================
export const TerminalNode = memo(({ data, selected }: NodeProps<Node<TerminalNodeData>>) => {
    const isStart = data.terminalType !== 'end';

    return (
        <div
            className={`${nodeBaseStyle} flow-terminal px-8 py-4 min-w-[140px] text-center
                ${selected ? 'ring-2 ring-indigo-400/50 ring-offset-2 ring-offset-white' : ''}
            `}
        >
            {!isStart && <Handle type="target" position={Position.Top} className="!bg-indigo-300" />}

            <div className="flex items-center justify-center gap-2">
                <span className="text-xl">{isStart ? '▶' : '⏹'}</span>
                <span className="font-semibold text-sm tracking-wide text-indigo-600">{data.label}</span>
            </div>

            {isStart && <Handle type="source" position={Position.Bottom} className="!bg-indigo-300" />}
        </div>
    );
});
TerminalNode.displayName = 'TerminalNode';

// ============================================
// Process Node (직사각형 - 처리) - 아코디언 확장
// ============================================
export const ProcessNode = memo(({ data, selected }: NodeProps<Node<ProcessNodeData>>) => {
    const [expanded, setExpanded] = useState(false);

    const stressBorderColors = {
        low: 'border-blue-400',
        medium: 'border-amber-400',
        high: 'border-red-400',
    };
    const stress = data.stressLevel || 'low';
    const metrics = data.metrics;
    const hasDescription = !!data.description;

    return (
        <div
            className={`${nodeBaseStyle} flow-process px-5 py-4 min-w-[180px] ${stressBorderColors[stress]} cursor-pointer
                ${expanded ? 'max-w-[320px]' : 'max-w-[220px]'}
                ${selected ? 'ring-2 ring-blue-400/50 ring-offset-2 ring-offset-white' : ''}
            `}
            onClick={(e) => {
                e.stopPropagation();
                if (hasDescription) setExpanded(!expanded);
            }}
        >
            <Handle type="target" position={Position.Top} className="!bg-blue-300" />

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-800">{data.label}</span>
                    {hasDescription && (
                        <span className="text-xs text-slate-400 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                        </span>
                    )}
                </div>

                {/* 축소 상태: 미리보기 */}
                {!expanded && hasDescription && (
                    <div className="text-xs text-slate-500 truncate">
                        {data.description?.slice(0, 30)}...
                    </div>
                )}

                {/* 확장 상태: 전체 설명 */}
                {expanded && hasDescription && (
                    <div className="text-xs text-slate-700 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        {data.description}
                    </div>
                )}

                {metrics && (metrics.timeMinutes || metrics.costKRW || metrics.peopleCount) && (
                    <div className="flex gap-2 pt-2 border-t border-slate-200 text-xs text-slate-500">
                        {metrics.timeMinutes && <span>⏱️ {metrics.timeMinutes}분</span>}
                        {metrics.costKRW && <span>💰 {formatNumber(metrics.costKRW)}₩</span>}
                        {metrics.peopleCount && <span>👥 {metrics.peopleCount}명</span>}
                    </div>
                )}
            </div>

            {/* Stress indicator */}
            {stress !== 'low' && (
                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full 
                    ${stress === 'high' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}
                />
            )}

            <Handle type="source" position={Position.Bottom} className="!bg-blue-300" />
        </div>
    );
});
ProcessNode.displayName = 'ProcessNode';

// ============================================
// Decision Node (마름모 - 판단/분기)
// ============================================
export const DecisionNode = memo(({ data, selected }: NodeProps<Node<DecisionNodeData>>) => {
    return (
        <div
            className={`${nodeBaseStyle} flow-decision w-[120px] h-[120px] flex items-center justify-center
                ${selected ? 'ring-2 ring-amber-400/50' : ''}
            `}
        >
            <Handle type="target" position={Position.Top} className="!bg-amber-300 !top-[10px]" />

            <div className="text-center p-2">
                <span className="text-lg">❓</span>
                <div className="font-semibold text-xs mt-1 text-slate-800">{data.label}</div>
            </div>

            <Handle type="source" position={Position.Bottom} id="yes" className="!bg-purple-300 !bottom-[10px]" />
            <Handle type="source" position={Position.Right} id="no" className="!bg-purple-300 !right-[10px]" />
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

    return (
        <div
            className={`${nodeBaseStyle} flow-io px-6 py-4 min-w-[160px] cursor-pointer
                ${expanded ? 'max-w-[280px]' : 'max-w-[200px]'}
                ${selected ? 'ring-2 ring-cyan-400/50 ring-offset-2 ring-offset-white' : ''}
            `}
            onClick={(e) => {
                e.stopPropagation();
                if (hasDescription) setExpanded(!expanded);
            }}
        >
            <Handle type="target" position={Position.Top} className="!bg-cyan-300" />

            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{isInput ? '📥' : '📤'}</span>
                    <span className="font-semibold text-sm text-slate-800">{data.label}</span>
                    {hasDescription && (
                        <span className="text-xs text-slate-400 ml-auto transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                        </span>
                    )}
                </div>

                {!expanded && hasDescription && (
                    <div className="text-xs text-slate-500 truncate">{data.description?.slice(0, 25)}...</div>
                )}

                {expanded && hasDescription && (
                    <div className="text-xs text-slate-600 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        {data.description}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-cyan-300" />
        </div>
    );
});
IONode.displayName = 'IONode';

// ============================================
// Agent Node (팔각형 - AI Agent) - 아코디언 확장
// ============================================
export const AgentNode = memo(({ data, selected }: NodeProps<Node<AgentNodeData>>) => {
    const [expanded, setExpanded] = useState(false);

    const collabBorderColors = {
        copilot: 'border-emerald-400',
        monitor: 'border-cyan-400',
        autonomous: 'border-violet-400',
    };

    const collabLabels = {
        copilot: '🤝 Co-pilot',
        monitor: '👁️ Monitor',
        autonomous: '🚀 Autonomous',
    };

    const collab = data.collaborationType || 'copilot';
    const hasDescription = !!data.agentDescription;

    return (
        <div
            className={`${nodeBaseStyle} flow-agent flex items-center justify-center ${collabBorderColors[collab]} cursor-pointer
                ${expanded ? 'w-[260px] h-auto min-h-[160px]' : 'w-[180px] h-[140px]'}
                ${selected ? 'ring-2 ring-emerald-400/50' : ''}
            `}
            onClick={(e) => {
                e.stopPropagation();
                if (hasDescription) setExpanded(!expanded);
            }}
        >
            <Handle type="target" position={Position.Top} className="!bg-emerald-300 !top-[15px]" />

            <div className="text-center p-4 space-y-2">
                <span className="text-3xl">🤖</span>
                <div className="font-semibold text-sm text-slate-800">{data.label}</div>
                <div className="flex items-center justify-center gap-2">
                    <div className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                        {collabLabels[collab]}
                    </div>
                    {hasDescription && (
                        <span className="text-xs text-slate-400 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                        </span>
                    )}
                </div>

                {/* 축소 상태: 미리보기 */}
                {!expanded && hasDescription && (
                    <div className="text-xs text-slate-500 max-w-[140px] truncate">
                        {data.agentDescription?.slice(0, 40)}...
                    </div>
                )}

                {/* 확장 상태: 전체 설명 */}
                {expanded && hasDescription && (
                    <div className="text-xs text-slate-700 leading-relaxed max-w-[220px] text-left animate-in fade-in slide-in-from-top-1 duration-200 border-t border-slate-200 pt-2 mt-2">
                        {data.agentDescription}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-emerald-300 !bottom-[15px]" />
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
