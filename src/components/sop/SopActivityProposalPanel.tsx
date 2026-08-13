'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Lightbulb, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { proposeActivitiesViaApi, acceptActivityProposal, type SopActivityProposal, type AcceptActivityProposalResult } from '@/lib/sop-activity-proposal';
import { useSopAiSettings } from '@/hooks/useSopAiSettings';

type AcceptFailureReason = Extract<AcceptActivityProposalResult, { ok: false }>['reason'];

const ACCEPT_FAILURE_MESSAGES: Record<AcceptFailureReason, string> = {
    'stale-task': '이 제안은 다른 Task에서 생성되었습니다. Task가 바뀌어 더 이상 적용할 수 없습니다.',
    'stale-context': '이 제안을 생성한 이후 업무 맥락이 변경되었습니다. 다시 "부족한 Activity 찾기"를 실행해 주세요.',
    'task-not-found': '현재 선택된 Task를 Work Map에서 찾을 수 없습니다.',
    'duplicate-name': '이미 같은 이름의 Activity가 Work Map에 존재합니다.',
    'already-accepted': '이미 수락되어 Work Map에 반영된 제안입니다.',
};

/**
 * "AI 제안 Activity" — surfaces work described in the member's free-text
 * context that doesn't belong to any currently confirmed Activity, as an
 * explicitly UNACCEPTED card (name/description/rationale/proposed Skills).
 * A proposal never touches the Work Map by itself; only clicking "수락"
 * calls acceptActivityProposal + setWorkLibrary with a partial patch (never
 * a full WorkLibrarySelection, so `confirmed` is never accidentally carried
 * over stale — see acceptActivityProposal's docstring). That is what
 * actually adds the Activity to the authoritative Task list, brings it into
 * Task-wide generation scope, AND clears Task Library confirmation through
 * the existing central Work Map invalidation rule.
 */
export function SopActivityProposalPanel() {
    const { memberInfo, workLibrary, context, setWorkLibrary, customerReviewMode } = useSopPrototypeStore();
    const { apiKey, model, reasoning } = useSopAiSettings();

    const [proposals, setProposals] = useState<SopActivityProposal[]>([]);
    const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedTask = workLibrary.taskCatalog.find((task) => task.id === workLibrary.taskId);

    // A proposal is only ever valid for the exact Task + context text it was
    // generated against (see acceptActivityProposal's staleness checks) — the
    // moment either changes, any proposal still on screen is stale. Clearing
    // this local state here is a UX nicety on top of that real domain-level
    // rejection, not a substitute for it.
    useEffect(() => {
        setProposals([]);
        setAcceptedIds(new Set());
        setError(null);
    }, [workLibrary.taskId, context]);

    if (!selectedTask) return null;

    const requestProposals = async () => {
        if (customerReviewMode) return;
        if (!context.trim()) {
            setError('업무 맥락을 먼저 입력한 뒤 AI Activity 제안을 실행해 주세요.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const result = await proposeActivitiesViaApi({
                member: memberInfo,
                taskId: selectedTask.id,
                taskName: selectedTask.name,
                taskDefinition: selectedTask.description,
                existingActivityNames: selectedTask.activities.map((activity) => activity.name),
                context,
                apiKey,
                model,
                reasoning,
            });
            setProposals(result.proposals);
            setAcceptedIds(new Set());
            if (result.proposals.length === 0) setError('현재 업무 맥락에서 기존 Activity에 속하지 않는 새로운 행동을 찾지 못했습니다.');
        } catch (caught) {
            setProposals([]);
            setError(caught instanceof Error ? caught.message : 'AI Activity 제안을 요청하지 못했습니다. Work Map에서 직접 Activity를 추가할 수 있습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAccept = (proposal: SopActivityProposal) => {
        if (customerReviewMode) return;
        const result = acceptActivityProposal(workLibrary, proposal, context);
        if (!result.ok) {
            setError(ACCEPT_FAILURE_MESSAGES[result.reason]);
            return;
        }
        setWorkLibrary(result.patch);
        setAcceptedIds((current) => new Set(current).add(proposal.id));
        setError(null);
    };

    const handleDismiss = (proposalId: string) => {
        setProposals((current) => current.filter((item) => item.id !== proposalId));
    };

    return (
        <section className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><Lightbulb className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-900">AI 제안 Activity (미수락)</p>
                    <p className="mt-0.5 text-xs text-zinc-600">업무 맥락에서 현재 Activity 목록 어디에도 속하지 않는 행동을 찾아 제안합니다. 수락하기 전까지는 Work Map과 SOP 생성 범위에 포함되지 않습니다.</p>
                </div>
                <button
                    type="button"
                    onClick={requestProposals}
                    disabled={isLoading || customerReviewMode}
                    title={customerReviewMode ? '고객 검토 모드에서는 AI Activity 제안을 사용할 수 없습니다.' : undefined}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} 부족한 Activity 찾기
                </button>
            </div>

            {customerReviewMode && (
                <p className="mt-2 text-[11px] font-medium text-indigo-800">고객 검토 모드에서는 AI Activity 제안 조회·수락이 모두 차단됩니다.</p>
            )}
            {error && <p role="alert" className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-800"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}</p>}

            {proposals.length > 0 && (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {proposals.map((proposal) => {
                        const isAccepted = acceptedIds.has(proposal.id);
                        return (
                            <div key={proposal.id} className={`rounded-xl border p-3 ${isAccepted ? 'border-emerald-300 bg-emerald-50' : 'border-amber-200 bg-white'}`}>
                                <div className="flex items-center gap-1.5">
                                    {isAccepted ? (
                                        <span className="rounded-sm border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">수락됨 · Work Map 반영</span>
                                    ) : (
                                        <span className="rounded-sm border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">AI 제안 · 미수락</span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm font-bold text-zinc-900">{proposal.name}</p>
                                <p className="mt-0.5 text-[11px] text-zinc-600">{proposal.description}</p>
                                <p className="mt-1 text-[10px] italic text-amber-700">근거: {proposal.rationale}</p>
                                <p className="mt-1 text-[10px] text-zinc-500">제안 SKILL: {proposal.skills.map((skill) => skill.name).join(', ')}</p>
                                {!isAccepted && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleAccept(proposal)}
                                            disabled={customerReviewMode}
                                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Plus className="h-3 w-3" /> 수락하고 Work Map에 추가
                                        </button>
                                        <button type="button" onClick={() => handleDismiss(proposal.id)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50">
                                            <X className="h-3 w-3" /> 무시
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
