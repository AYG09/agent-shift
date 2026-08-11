'use client';

import React, { useMemo, useState } from 'react';
import { Bot, CheckCircle2, CircleAlert, Handshake, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { getAgentizableSopStepIds, useSopPrototypeStore } from '@/lib/sop-prototype-store';
import type { SopAiApplicationMode } from '@/lib/sop-types';

const APPLICATION_MODES: Array<{ id: SopAiApplicationMode; label: string; detail: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'automation', label: 'AI 대체 가능', detail: '반복 실행을 AI가 수행', icon: Bot },
    { id: 'human-review', label: 'AI 수행 후 사람 확인', detail: 'AI 결과를 사람이 최종 검토', icon: ShieldCheck },
    { id: 'collaboration', label: '사람–AI 협업', detail: '업무를 나누어 함께 수행', icon: Handshake },
    { id: 'assist', label: '사람 중심·AI 지원', detail: '초안·분석 등 보조 역할', icon: Users },
    { id: 'human-only', label: '사람 수행 필수', detail: '판단·승인은 사람 책임', icon: UserCheck },
];

type Props = { onBack: () => void };

export const SopAgentizationPanel: React.FC<Props> = ({ onBack }) => {
    const {
        document,
        selectStep,
        setAgentizationScope,
        setAgentizationMode,
        toggleAgentizationStep,
        setAgentizationNote,
        confirmAgentization,
    } = useSopPrototypeStore();
    const [notice, setNotice] = useState<string | null>(null);

    const eligibleIds = useMemo(() => getAgentizableSopStepIds(document), [document]);
    if (!document) return null;

    const review = document.agentizationReview || {
        scope: 'workflow' as const,
        stepIds: eligibleIds,
        mode: 'collaboration' as const,
        note: '',
    };
    const isConfirmed = Boolean(review.confirmedAt);
    const selectedIds = review.scope === 'workflow' ? eligibleIds : review.stepIds;

    const handleConfirm = () => {
        const result = confirmAgentization();
        setNotice(result.message);
    };

    return (
        <div className="flex h-full min-h-0 flex-col border-l border-zinc-200 bg-white">
            <div className="shrink-0 border-b border-zinc-200 bg-white px-4 pb-3 pt-4">
                <div className="mb-3 grid grid-cols-2 rounded-md bg-zinc-100 p-1 text-xs font-semibold">
                    <button type="button" onClick={onBack} className="rounded px-2 py-1.5 text-zinc-500 hover:text-zinc-900">단계 상세</button>
                    <span className="flex items-center justify-center gap-1 rounded bg-white px-2 py-1.5 text-indigo-700 shadow-sm"><Bot className="h-3.5 w-3.5" /> AI Agent화</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white"><Bot className="h-4 w-4" /></div>
                        <div><h2 className="text-sm font-semibold text-zinc-900">AI Agent화 검토</h2><p className="mt-0.5 text-[11px] text-zinc-500">후보 {eligibleIds.length}개 중 {selectedIds.length}개 선택</p></div>
                    </div>
                    {isConfirmed && <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> 확정됨</span>}
                </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs">
                <p className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] leading-4 text-indigo-900"><CircleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />구성원의 적용 가능성 판단을 기록합니다. 이 확정만으로 AI Agent 개발이 자동 결정되지는 않습니다.</p>

                <div>
                    <label className="mb-1.5 block font-semibold text-zinc-800">검토 범위</label>
                    <div className="grid grid-cols-2 rounded-md bg-zinc-100 p-1">
                        <button type="button" onClick={() => setAgentizationScope('workflow')} className={`rounded px-2 py-1.5 font-semibold ${review.scope === 'workflow' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>전체 워크플로우</button>
                        <button type="button" onClick={() => setAgentizationScope('steps')} className={`rounded px-2 py-1.5 font-semibold ${review.scope === 'steps' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>선택 단계</button>
                    </div>
                </div>

                {review.scope === 'steps' && (
                    <div>
                        <div className="mb-1.5 flex items-center justify-between"><label className="font-semibold text-zinc-800">검토 대상 단계</label><span className="text-[10px] text-zinc-500">시작·종료 제외</span></div>
                        <div className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200">
                            {document.steps.filter((step) => eligibleIds.includes(step.id)).map((step, index) => {
                                const checked = review.stepIds.includes(step.id);
                                return <div key={step.id} className="flex items-center gap-2.5 bg-white px-3 py-2 hover:bg-zinc-50"><input id={`agent-step-${step.id}`} type="checkbox" checked={checked} onChange={() => toggleAgentizationStep(step.id)} className="h-3.5 w-3.5 rounded-sm text-indigo-600 focus:ring-indigo-500" /><label htmlFor={`agent-step-${step.id}`} className="min-w-0 flex-1 cursor-pointer"><span className="mr-1.5 font-mono text-[10px] text-zinc-400">{String(index + 1).padStart(2, '0')}</span><span className="font-medium text-zinc-800">{step.title}</span></label><button type="button" onClick={() => selectStep(step.id)} className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800">상세</button></div>;
                            })}
                        </div>
                    </div>
                )}

                <div>
                    <label className="mb-1.5 block font-semibold text-zinc-800">가능한 AI 적용 방식</label>
                    <div className="space-y-1.5">
                        {APPLICATION_MODES.map((mode) => {
                            const Icon = mode.icon;
                            const selected = review.mode === mode.id;
                            return <button key={mode.id} type="button" onClick={() => setAgentizationMode(mode.id)} className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${selected ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-100' : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'}`}><Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-zinc-400'}`} /><span className="min-w-0"><span className={`block text-xs font-semibold ${selected ? 'text-indigo-900' : 'text-zinc-800'}`}>{mode.label}</span><span className="block text-[10px] text-zinc-500">{mode.detail}</span></span></button>;
                        })}
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block font-semibold text-zinc-800">판단 근거 <span className="font-normal text-zinc-400">(선택)</span></label>
                    <textarea rows={2} value={review.note || ''} onChange={(event) => setAgentizationNote(event.target.value)} placeholder="예: 반복 규칙이 명확하나 최종 승인에는 사람이 필요" className="w-full resize-none rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none" />
                </div>

                {isConfirmed && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-4 text-emerald-800"><span className="font-semibold">검토 확정:</span> {review.scope === 'workflow' ? '전체 워크플로우' : `선택 단계 ${selectedIds.length}개`} · {APPLICATION_MODES.find((mode) => mode.id === review.mode)?.label}</div>}
                {notice && <p role="status" className={`rounded-md px-3 py-2 text-[11px] font-medium ${isConfirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{notice}</p>}
            </div>

            <div className="shrink-0 border-t border-zinc-200 bg-white p-4">
                <button type="button" onClick={handleConfirm} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"><CheckCircle2 className="h-4 w-4" /> Agent화 검토 확정</button>
            </div>
        </div>
    );
};
