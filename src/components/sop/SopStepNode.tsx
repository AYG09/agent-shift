'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowShapeRenderer } from '@/components/flow/FlowShapeRenderer';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopStepData, SopDisplayMode } from '@/lib/sop-types';
import { getSopNodeSize } from '@/lib/sop-canvas-utils';
import { CheckCircle2, Clock } from 'lucide-react';

export const SopStepNode = memo(({ data, selected }: NodeProps) => {
    const step = data.step as SopStepData;
    const stepNumber = (data.index as number) || 1;
    const displayMode = (data.displayMode as SopDisplayMode) || 'standard';

    const { selectStep } = useSopPrototypeStore();
    const [isHovered, setIsHovered] = useState(false);

    if (!step) return null;

    const { width, height } = getSopNodeSize(step, displayMode);

    const isConfirmed = step.reviewStatus === 'confirmed';
    const isReviewed = step.reviewStatus === 'reviewed';

    const strokeColor = selected
        ? '#4f46e5'
        : isConfirmed
        ? '#10b981'
        : isReviewed
        ? '#3b82f6'
        : '#94a3b8';

    const fillColor = selected
        ? '#f5f3ff'
        : isConfirmed
        ? '#f0fdf4'
        : isReviewed
        ? '#eff6ff'
        : '#ffffff';

    const handleSingleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        selectStep(step.id);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        selectStep(step.id);
    };

    return (
        <div
            className="relative group cursor-pointer select-none"
            onClick={handleSingleClick}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ width, height }}
        >
            {/* Standardized React Flow Target Handles (Item 5) */}
            <Handle type="target" position={Position.Top} id="top-target" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
            <Handle type="target" position={Position.Left} id="left-target" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
            <Handle type="target" position={Position.Right} id="right-target" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
            <Handle type="target" position={Position.Bottom} id="bottom-target" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />

            {/* Standardized React Flow Source Handles (Item 5) */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />

            {/* SVG Flow Shape Background */}
            <FlowShapeRenderer
                shape={step.shape}
                width={width}
                height={height}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={selected ? 3 : 2}
            />

            {/* Inner Content overlay */}
            <div className="absolute inset-0 p-3 flex flex-col justify-center text-center items-center overflow-hidden z-10">
                {/* Step Number & Title */}
                <div className="flex items-center gap-1.5 justify-center max-w-full">
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-300 shrink-0">
                        {String(stepNumber).padStart(2, '0')}
                    </span>
                    <h4 className="text-xs font-bold text-zinc-900 truncate max-w-[150px] leading-tight">
                        {step.title}
                    </h4>
                    {isConfirmed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                </div>

                {/* Standard Mode: Title + Definition */}
                {displayMode === 'standard' && (
                    <>
                        <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2 leading-tight px-1 font-normal">
                            {step.definition}
                        </p>
                        {step.requiredSkills.length > 0 && (
                            <div className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200/60">
                                SKILL {step.requiredSkills.length}
                            </div>
                        )}
                    </>
                )}

                {/* Detailed Mode: Title + Definition + Skill Chips */}
                {displayMode === 'detailed' && (
                    <>
                        <p className="text-[10px] text-zinc-600 mt-1 line-clamp-2 leading-tight px-1 font-normal">
                            {step.definition}
                        </p>
                        {step.requiredSkills.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1 justify-center max-w-full">
                                {step.requiredSkills.slice(0, 2).map((sk, idx) => (
                                    <span
                                        key={idx}
                                        className={`text-[9px] font-medium px-1.5 py-0.2 rounded-md border truncate max-w-[90px] ${
                                            sk.source === 'ai-suggested'
                                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                        }`}
                                    >
                                        {sk.source === 'ai-suggested' && !sk.accepted ? '★ ' : ''}
                                        {sk.name}
                                    </span>
                                ))}
                                {step.requiredSkills.length > 2 && (
                                    <span className="text-[9px] font-semibold text-zinc-500 bg-zinc-100 px-1 py-0.2 rounded-md">
                                        +{step.requiredSkills.length - 2}
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Hover Tooltip Preview */}
            {isHovered && (
                <div className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 w-64 bg-zinc-900/95 text-white p-3 rounded-xl shadow-xl z-50 pointer-events-none text-left border border-zinc-700 backdrop-blur-xs animate-fade-in">
                    <div className="flex items-center justify-between border-b border-zinc-700 pb-1.5 mb-1.5">
                        <span className="text-xs font-bold text-indigo-300">
                            {String(stepNumber).padStart(2, '0')}. {step.title}
                        </span>
                        {step.estimatedDuration && (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-indigo-400" />
                                {step.estimatedDuration.value} {step.estimatedDuration.unit}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-200 mb-2 leading-relaxed">{step.definition}</p>
                    {step.requiredSkills.length > 0 && (
                        <div>
                            <span className="text-[10px] font-semibold text-zinc-400 block mb-1">요구 SKILL:</span>
                            <div className="flex flex-wrap gap-1">
                                {step.requiredSkills.map((sk, i) => (
                                    <span
                                        key={i}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300"
                                    >
                                        {sk.source === 'ai-suggested' ? '[AI제안] ' : ''}
                                        {sk.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

SopStepNode.displayName = 'SopStepNode';
