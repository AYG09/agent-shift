'use client';

import React, { useMemo, useState } from 'react';
import { Bot, CheckCircle2, CircleAlert, Users } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { formatStepNumber } from '@/lib/sop-format';
import { AGENTIZATION_SUGGESTION_META, AI_APPLICATION_MODES, getAgentizableSopStepIds, getAgentizationModeForStep, mapSuggestionToApplicationMode } from '@/lib/sop-agentization';
import type { SopAiApplicationMode } from '@/lib/sop-types';

const MODE_ICONS: Record<SopAiApplicationMode, React.ComponentType<{ className?: string }>> = {
    automation: Bot,
    assist: Users,
};

type Props = { onBack: () => void };

export const SopAgentizationPanel: React.FC<Props> = ({ onBack }) => {
    const {
        document,
        customerReviewMode: readOnly,
        selectStep,
        setAgentizationScope,
        setAgentizationDefaultMode,
        setAgentizationStepMode,
        toggleAgentizationStep,
        setAgentizationNote,
        confirmAgentization,
    } = useSopPrototypeStore();
    const [notice, setNotice] = useState<string | null>(null);
    const eligibleIds = useMemo(() => getAgentizableSopStepIds(document), [document]);
    if (!document) return null;

    const review = document.agentizationReview || { scope: 'steps' as const, stepIds: [], stepModes: {}, note: '' };
    const selectedIds = review.scope === 'workflow' ? eligibleIds : review.stepIds;
    const assignedCount = selectedIds.filter((id) => getAgentizationModeForStep(document, id)).length;
    const isConfirmed = Boolean(review.confirmedAt);

    const handleConfirm = () => setNotice(confirmAgentization().message);

    return (
        <div className="flex h-full min-h-0 flex-col border-l border-zinc-200 bg-white">
            <div className="shrink-0 border-b border-zinc-200 bg-white px-4 pb-3 pt-4">
                <div className="mb-3 grid grid-cols-2 rounded-md bg-zinc-100 p-1 text-xs font-semibold">
                    <button type="button" onClick={onBack} className="rounded px-2 py-1.5 text-zinc-500 hover:text-zinc-900">단계 상세</button>
                    <span className="flex items-center justify-center gap-1 rounded bg-white px-2 py-1.5 text-indigo-700 shadow-sm"><Bot className="h-3.5 w-3.5" /> AI Agent화</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white"><Bot className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold text-zinc-900">AI Agent화 검토</h2><p className="mt-0.5 text-[11px] text-zinc-500">대상 {selectedIds.length}개 · 적용 방식 {assignedCount}개 지정</p></div></div>
                    {isConfirmed && <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> 확정됨</span>}
                </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs">
                <p className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] leading-4 text-indigo-900"><CircleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />구성원의 적용 가능성 판단을 기록합니다. 노드별 판단은 Agent 개발의 자동 승인이나 실행 지시가 아닙니다.</p>
                {readOnly && <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] leading-4 text-zinc-600">고객 검토 모드에서는 Agent화 판단을 열람만 할 수 있고 변경할 수 없습니다.</p>}

                <div>
                    <label className="mb-1.5 block font-semibold text-zinc-800">검토 범위</label>
                    <div className="grid grid-cols-2 rounded-md bg-zinc-100 p-1"><button type="button" onClick={() => setAgentizationScope('workflow')} disabled={readOnly} className={`rounded px-2 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${review.scope === 'workflow' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>전체 워크플로우</button><button type="button" onClick={() => setAgentizationScope('steps')} disabled={readOnly} className={`rounded px-2 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${review.scope === 'steps' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>선택 단계</button></div>
                </div>

                {review.scope === 'steps' && <div><div className="mb-1.5 flex items-center justify-between"><label className="font-semibold text-zinc-800">검토 대상 단계</label><span className="text-[10px] text-zinc-500">시작·종료 제외</span></div><div className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200">{document.steps.filter((step) => eligibleIds.includes(step.id)).map((step, index) => { const checked = review.stepIds.includes(step.id); return <div key={step.id} className="flex items-center gap-2.5 bg-white px-3 py-2 hover:bg-zinc-50"><input id={`agent-step-${step.id}`} type="checkbox" checked={checked} onChange={() => toggleAgentizationStep(step.id)} disabled={readOnly} className="h-3.5 w-3.5 rounded-sm text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60" /><label htmlFor={`agent-step-${step.id}`} className="min-w-0 flex-1 cursor-pointer"><span className="mr-1.5 font-mono text-[10px] text-zinc-400">{formatStepNumber(index + 1)}</span><span className="font-medium text-zinc-800">{step.title}</span></label><button type="button" onClick={() => selectStep(step.id)} className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800">상세</button></div>; })}</div></div>}

                {selectedIds.length > 0 && <div><div className="mb-1.5 flex items-center justify-between"><label className="font-semibold text-zinc-800">선택 단계 일괄 지정</label><span className="text-[10px] text-zinc-500">개별 판단은 아래에서 변경</span></div><div className="grid grid-cols-1 gap-1.5">{AI_APPLICATION_MODES.map((mode) => { const Icon = MODE_ICONS[mode.id]; return <button key={mode.id} type="button" onClick={() => setAgentizationDefaultMode(mode.id)} disabled={readOnly} className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-zinc-200 disabled:hover:bg-white"><Icon className="h-3.5 w-3.5 text-indigo-600" /><span className="text-[11px] font-semibold text-zinc-800">{mode.label}</span><span className="ml-auto text-[10px] text-zinc-500">일괄 적용</span></button>; })}</div></div>}

                {selectedIds.length > 0 && <div><div className="mb-1.5 flex items-center justify-between"><label className="font-semibold text-zinc-800">노드별 AI 참여 방식</label><span className="text-[10px] text-zinc-500">미지정은 사람 수행</span></div><div className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200">{selectedIds.map((id) => {
                    const step = document.steps.find((item) => item.id === id);
                    if (!step) return null;
                    const mode = getAgentizationModeForStep(document, id);
                    const suggestion = step.agentizationSuggestion;
                    const suggestionMeta = suggestion ? AGENTIZATION_SUGGESTION_META[suggestion.type] : null;
                    const suggestedMode = suggestion ? mapSuggestionToApplicationMode(suggestion.type) : undefined;
                    return <div key={id} className="bg-white px-3 py-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => selectStep(id)} className="min-w-0 truncate text-left text-[11px] font-semibold text-zinc-800"><span className="mr-1.5 font-mono text-[10px] text-zinc-400">{formatStepNumber(document.steps.indexOf(step) + 1)}</span>{step.title}</button>
                            {mode && <span className="shrink-0 text-[10px] font-semibold text-emerald-600">지정됨</span>}
                        </div>
                        {suggestionMeta && (
                            <div className={`mb-1.5 flex items-start justify-between gap-2 rounded-sm border px-2 py-1.5 text-[10px] leading-4 ${suggestionMeta.badgeClass}`}>
                                <div className="min-w-0"><span className="font-bold">{suggestionMeta.label}</span><p className="mt-0.5 text-zinc-700">{suggestion!.rationale}</p></div>
                                {!readOnly && mode !== suggestedMode && (
                                    <button type="button" onClick={() => setAgentizationStepMode(id, suggestedMode)} className="shrink-0 rounded border border-current px-1.5 py-0.5 font-semibold hover:bg-white/60">제안 적용</button>
                                )}
                            </div>
                        )}
                        <select value={mode || ''} onChange={(event) => setAgentizationStepMode(id, event.target.value ? (event.target.value as SopAiApplicationMode) : undefined)} disabled={readOnly} className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-[11px] font-medium text-zinc-800 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="">AI 참여 방식 선택</option>{AI_APPLICATION_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
                    </div>;
                })}</div></div>}

                <div><label className="mb-1.5 block font-semibold text-zinc-800">판단 근거 <span className="font-normal text-zinc-400">(선택)</span></label><textarea rows={2} value={review.note || ''} onChange={(event) => setAgentizationNote(event.target.value)} placeholder="예: 반복 규칙은 명확하나 최종 승인에는 사람이 필요" disabled={readOnly} className="w-full resize-none rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-60" /></div>
                {isConfirmed && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-4 text-emerald-800"><span className="font-semibold">검토 확정:</span> {selectedIds.length}개 단계별 적용 방식이 기록되었습니다.</div>}
                {notice && <p role="status" className={`rounded-md px-3 py-2 text-[11px] font-medium ${isConfirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{notice}</p>}
            </div>

            <div className="shrink-0 border-t border-zinc-200 bg-white p-4"><button type="button" onClick={handleConfirm} disabled={readOnly} title={readOnly ? '고객 검토 모드에서는 Agent화 판단을 확정할 수 없습니다.' : undefined} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-indigo-600"><CheckCircle2 className="h-4 w-4" /> Agent화 검토 확정</button></div>
        </div>
    );
};
