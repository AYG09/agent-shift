'use client';

import React from 'react';
import { Wrench } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopStepData } from '@/lib/sop-types';

interface SopExecutionEditorProps {
    step: SopStepData;
}

/** How the step is actually carried out: detailed instructions, inputs/outputs, tools. */
export const SopExecutionEditor: React.FC<SopExecutionEditorProps> = ({ step }) => {
    const readOnly = useSopPrototypeStore((s) => s.customerReviewMode);
    const updateStep = useSopPrototypeStore((s) => s.updateStep);

    return (
        <>
            {/* Detailed Instructions — 섹션 구분은 인스펙터의 아코디언이 담당하므로
                자체 상단 경계선을 두지 않는다. */}
            <div>
                <label className="block font-semibold text-zinc-900 mb-1">상세 수행 방법</label>
                <textarea
                    rows={3}
                    value={step.detailedInstructions || ''}
                    onChange={(e) => updateStep(step.id, { detailedInstructions: e.target.value })}
                    placeholder="구체적인 작업 가이드라인 및 1, 2, 3 순서 지침"
                    disabled={readOnly}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                />
            </div>

            {/* Inputs & Outputs */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1">입력 정보 (Inputs)</label>
                    <input
                        type="text"
                        value={(step.inputs || []).join(', ')}
                        onChange={(e) =>
                            updateStep(step.id, {
                                inputs: e.target.value.split(',').map((s) => s.trim()),
                            })
                        }
                        placeholder="쉼표로 구분"
                        disabled={readOnly}
                        className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    />
                </div>
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1">산출물 (Outputs)</label>
                    <input
                        type="text"
                        value={(step.outputs || []).join(', ')}
                        onChange={(e) =>
                            updateStep(step.id, {
                                outputs: e.target.value.split(',').map((s) => s.trim()),
                            })
                        }
                        placeholder="쉼표로 구분"
                        disabled={readOnly}
                        className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    />
                </div>
            </div>

            {/* Tools */}
            <div>
                <label className="block font-semibold text-zinc-900 mb-1 flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5 text-zinc-500" /> 사용 시스템 · 도구
                </label>
                <input
                    type="text"
                    value={(step.tools || []).join(', ')}
                    onChange={(e) =>
                        updateStep(step.id, {
                            tools: e.target.value.split(',').map((s) => s.trim()),
                        })
                    }
                    placeholder="예: ATS, 전자결재, Slack"
                    disabled={readOnly}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
            </div>
        </>
    );
};
