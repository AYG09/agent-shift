'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Search, Sparkles } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SOP_INTAKE_ROUTES, normalizeWorkContext } from '@/lib/sop-member-intake';
import { getTaskLibraryJobByRole, SOP_TASK_LIBRARY_FIXTURE } from '@/lib/sop-task-library';
import { recommendTasksViaApi } from '@/lib/sop-task-recommendation';
import { useSopAiSettings } from '@/hooks/useSopAiSettings';
import { SopRecommendationLoading } from './SopRecommendationLoading';
import {
    SOP_RECOMMENDATION_CONFIRM_ACTION_LABEL,
    SOP_RECOMMENDATION_STATUS_MESSAGES,
    SOP_TOP_RECOMMENDATION_LABEL,
} from '@/lib/sop-task-recommendation-meta';
import type { WorkLibraryTask } from '@/lib/sop-types';

/**
 * Thin routed wrapper — 이 저장소의 기존 관례(SopMemberHome/SopSetupGate)와 같이
 * `useRouter()`를 호출하는 유일한 지점이다. 실제 로직은 `navigate`를 prop으로 받는
 * View에 있어 react-test-renderer(Next App Router 컨텍스트가 없는 환경)에서도
 * 직접 테스트할 수 있다.
 */
export function SopTaskRecommendationFlow() {
    const router = useRouter();
    return <SopTaskRecommendationFlowView navigate={router.push} />;
}

export interface SopTaskRecommendationFlowViewProps {
    navigate: (href: string) => void;
    /** 테스트가 실제 네트워크 호출 없이 응답을 주입하기 위한 선택적 fetch 대체 구현. */
    fetchImpl?: typeof fetch;
}

export function SopTaskRecommendationFlowView({ navigate, fetchImpl }: SopTaskRecommendationFlowViewProps) {
    const member = useSopPrototypeStore((state) => state.memberSession.member);
    const memberContext = useSopPrototypeStore((state) => state.memberContext);
    const recommendation = useSopPrototypeStore((state) => state.taskRecommendation);
    const beginTaskRecommendationRequest = useSopPrototypeStore((state) => state.beginTaskRecommendationRequest);
    const applyTaskRecommendations = useSopPrototypeStore((state) => state.applyTaskRecommendations);
    const failTaskRecommendation = useSopPrototypeStore((state) => state.failTaskRecommendation);
    const cancelTaskRecommendation = useSopPrototypeStore((state) => state.cancelTaskRecommendation);
    const confirmRecommendedTask = useSopPrototypeStore((state) => state.confirmRecommendedTask);
    const { apiKey, model, reasoning } = useSopAiSettings();

    const [attempt, setAttempt] = useState(0);
    const [manualQuery, setManualQuery] = useState('');
    const [showManualSearch, setShowManualSearch] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const job = useMemo(
        () => getTaskLibraryJobByRole(member?.jobRole) ?? SOP_TASK_LIBRARY_FIXTURE.jobs[0],
        [member?.jobRole]
    );
    const contextText = normalizeWorkContext(memberContext.confirmedText ?? memberContext.draft);
    const contextKey = recommendation.contextKey;

    // 정확히 한 번만 요청을 시작한다(TST-STATE-003). 실제 중복 방지는
    // beginTaskRecommendationRequest(store, sop-member-intake.ts)의 `requested` guard가
    // 담당하므로, React Strict Mode의 effect 재실행이나 이 컴포넌트의 재마운트가
    // 두 번째 fetch를 만들지 못한다. `attempt`는 "다시 추천" 버튼이 같은 contextKey로
    // 재시도할 수 있게 하는 로컬 트리거일 뿐 도메인 상태가 아니다.
    useEffect(() => {
        if (!member || !contextKey || !contextText) return;
        if (!beginTaskRecommendationRequest(contextKey)) return;

        const controller = new AbortController();
        abortRef.current = controller;

        recommendTasksViaApi({
            member,
            job: { id: job.id, sourceJobId: job.sourceJobId, name: job.name },
            briefWorkDescription: contextText,
            candidates: job.tasks,
            apiKey,
            model,
            reasoning,
            signal: controller.signal,
            fetchImpl,
        })
            .then((response) => {
                if (controller.signal.aborted) return;
                applyTaskRecommendations(contextKey, response.candidates);
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                failTaskRecommendation(contextKey, error instanceof Error ? error.message : 'AI Task 추천 중 오류가 발생했습니다.');
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contextKey, attempt]);

    const handleCancel = () => {
        abortRef.current?.abort();
        cancelTaskRecommendation();
        navigate(SOP_INTAKE_ROUTES.context);
    };

    const handleRetry = () => setAttempt((current) => current + 1);

    const handleEditContext = () => navigate(SOP_INTAKE_ROUTES.context);

    const handleConfirmTask = (taskId: string) => {
        const confirmed = confirmRecommendedTask(taskId);
        if (confirmed) navigate(SOP_INTAKE_ROUTES.workMapSimple);
    };

    const candidateTasks = recommendation.candidates
        .map((candidate) => ({ candidate, task: job.tasks.find((task) => task.id === candidate.taskId) }))
        .filter((entry): entry is { candidate: (typeof recommendation.candidates)[number]; task: WorkLibraryTask } => !!entry.task)
        .sort((left, right) => left.candidate.rank - right.candidate.rank);

    const manualResults = manualQuery.trim()
        ? job.tasks.filter((task) => task.name.toLowerCase().includes(manualQuery.trim().toLowerCase()))
        : job.tasks;

    const statusMessage =
        recommendation.status === 'pending'
            ? SOP_RECOMMENDATION_STATUS_MESSAGES.pending
            : recommendation.status === 'ready'
                ? SOP_RECOMMENDATION_STATUS_MESSAGES.ready(recommendation.candidates.length)
                : recommendation.status === 'error'
                    ? SOP_RECOMMENDATION_STATUS_MESSAGES.error(recommendation.error ?? '')
                    : '';

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white shadow-2xs">
                <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-6">
                    <Sparkles className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                    <h1 className="text-base font-semibold text-zinc-900">AI Task 추천</h1>
                </div>
            </header>

            {/* 상태 변화(시작·성공·실패)만 알린다 — 도움말 순환은 별도로 읽히지 않는다(NFR-LOAD-004). */}
            <div aria-live="polite" role="status" className="sr-only">
                {statusMessage}
            </div>

            <main className="mx-auto max-w-[1440px] space-y-6 px-6 py-8">
                {recommendation.status === 'pending' && <SopRecommendationLoading onCancel={handleCancel} />}

                {recommendation.status === 'idle' && (
                    <section className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600">
                        업무맥락을 먼저 작성해야 추천을 받을 수 있습니다.
                        <div className="mt-3">
                            <button type="button" onClick={handleEditContext} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                                업무맥락 작성으로 이동
                            </button>
                        </div>
                    </section>
                )}

                {recommendation.status === 'error' && (
                    <section className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
                            <div>
                                <p className="text-sm font-bold text-rose-800">AI Task 추천을 받아오지 못했습니다</p>
                                <p className="mt-1 text-xs text-rose-700">{recommendation.error}</p>
                                <p className="mt-2 text-xs text-rose-700">작성하신 업무맥락은 그대로 보존되어 있습니다. 다시 시도하거나 업무맥락을 수정하거나, Task를 직접 검색해 선택할 수 있습니다.</p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={handleRetry} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                다시 추천
                            </button>
                            <button type="button" onClick={handleEditContext} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                                업무맥락 수정
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowManualSearch(true)}
                                aria-expanded={showManualSearch}
                                aria-controls="sop-manual-task-search-section"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                                <Search className="h-3.5 w-3.5" /> Task 직접 찾기
                            </button>
                        </div>
                    </section>
                )}

                {recommendation.status === 'ready' && (
                    <section aria-label="AI 추천 결과">
                        <div className="mb-4">
                            <p className="text-sm font-bold text-zinc-900">추천 Task {candidateTasks.length}건</p>
                            <p className="mt-0.5 text-xs text-zinc-500">추천은 확정이 아닙니다. 계속할 Task를 직접 선택해 주세요.</p>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                            {candidateTasks.map(({ candidate, task }) => {
                                const isTop = candidate.rank === 1;
                                return (
                                    <article
                                        key={candidate.taskId}
                                        className={`flex flex-col rounded-2xl border p-4 shadow-sm ${isTop ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-zinc-200 bg-white'}`}
                                    >
                                        <span className={`inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${isTop ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                                            {isTop ? SOP_TOP_RECOMMENDATION_LABEL : `추천 ${candidate.rank}순위`}
                                        </span>
                                        <p className="mt-2 text-sm font-bold text-zinc-900">{task.name}</p>
                                        <p className="mt-1 line-clamp-3 text-[11px] text-zinc-600" title={task.description}>{task.description}</p>
                                        <p className="mt-2 text-[11px] font-medium text-zinc-700">추천 이유: {candidate.reason}</p>
                                        <button
                                            type="button"
                                            onClick={() => handleConfirmTask(candidate.taskId)}
                                            className={`mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isTop ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50'}`}
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5" /> {SOP_RECOMMENDATION_CONFIRM_ACTION_LABEL}
                                        </button>
                                    </article>
                                );
                            })}
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <button type="button" onClick={handleEditContext} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                                업무맥락 수정
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowManualSearch((current) => !current)}
                                aria-expanded={showManualSearch}
                                aria-controls="sop-manual-task-search-section"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                                <Search className="h-3.5 w-3.5" /> Task 직접 찾기
                            </button>
                        </div>
                    </section>
                )}

                {showManualSearch && (
                    <section id="sop-manual-task-search-section" aria-label="Task 직접 검색" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <label htmlFor="sop-manual-task-search" className="text-xs font-bold text-zinc-700">Task 이름으로 검색</label>
                        <input
                            id="sop-manual-task-search"
                            type="text"
                            value={manualQuery}
                            onChange={(event) => setManualQuery(event.target.value)}
                            placeholder="예: 채용"
                            className="mt-1.5 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                            {manualResults.map((task) => (
                                <li key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-zinc-900" title={task.name}>{task.name}</p>
                                        <p className="truncate text-[11px] text-zinc-500" title={task.description}>{task.description}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleConfirmTask(task.id)}
                                        className="shrink-0 whitespace-nowrap rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        {SOP_RECOMMENDATION_CONFIRM_ACTION_LABEL}
                                    </button>
                                </li>
                            ))}
                            {manualResults.length === 0 && <li className="py-4 text-center text-xs text-zinc-400">일치하는 Task가 없습니다.</li>}
                        </ul>
                    </section>
                )}
            </main>
        </div>
    );
}
