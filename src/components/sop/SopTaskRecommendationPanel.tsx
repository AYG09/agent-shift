'use client';

import { useState } from 'react';
import { AlertCircle, BrainCircuit, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { getScopedSkills } from '@/lib/sop-task-library';
import { recommendTasksViaApi, type SopTaskRecommendationResponse } from '@/lib/sop-task-recommendation';
import { useSopAiSettings } from '@/hooks/useSopAiSettings';

export function SopTaskRecommendationPanel() {
    const { memberInfo, workLibrary, taskRecommendationInput, setTaskRecommendationInput, setWorkLibrary } = useSopPrototypeStore();
    const { apiKey, model, reasoning } = useSopAiSettings();
    const [result, setResult] = useState<SopTaskRecommendationResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectTask = (taskId: string) => {
        const task = workLibrary.taskCatalog.find((item) => item.id === taskId);
        if (!task) return;
        const firstActivity = [...task.activities].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))[0];
        const base = {
            ...workLibrary,
            taskId: task.id,
            taskName: task.name,
            activityId: firstActivity?.id,
            activityName: firstActivity?.name,
            sourceType: 'task' as const,
        };
        setWorkLibrary({ ...base, skills: getScopedSkills(base) });
        setResult(null);
    };

    const requestRecommendation = async () => {
        if (!taskRecommendationInput.trim()) {
            setError('수행 업무를 한두 문장으로 입력한 뒤 AI Task 추천을 실행해 주세요.');
            return;
        }
        if (!workLibrary.jobId || !workLibrary.sourceJobId || !workLibrary.jobName) {
            setError('현재 Task Library의 Job 정보가 없어 추천할 수 없습니다. 직접 Task를 선택해 주세요.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const next = await recommendTasksViaApi({
                member: memberInfo,
                job: { id: workLibrary.jobId, sourceJobId: workLibrary.sourceJobId, name: workLibrary.jobName },
                briefWorkDescription: taskRecommendationInput,
                candidates: workLibrary.taskCatalog,
                apiKey,
                model,
                reasoning,
            });
            setResult(next);
        } catch (caught) {
            setResult(null);
            setError(caught instanceof Error ? caught.message : 'AI Task 추천을 요청하지 못했습니다. 직접 Task를 선택할 수 있습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const catalogById = new Map(workLibrary.taskCatalog.map((task) => [task.id, task]));
    return (
        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><BrainCircuit className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-900">수행 업무로 AI Task 추천</p>
                    <p className="mt-0.5 text-xs text-zinc-600">입력한 업무 설명을 바탕으로 {workLibrary.jobName || '현재 직무'} Task Library에서 최대 3개를 추천합니다. 추천 결과는 선택하기 전까지 적용되지 않습니다.</p>
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                <textarea value={taskRecommendationInput} onChange={(event) => setTaskRecommendationInput(event.target.value)} rows={2} placeholder="예: 채용 요청을 검토하고 공고·지원자 선발 과정을 운영합니다." className="min-h-[58px] flex-1 resize-none rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-indigo-500 focus:ring-2" aria-label="수행 업무 설명" />
                <button type="button" onClick={requestRecommendation} disabled={isLoading} className="inline-flex min-w-[122px] items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI 추천
                </button>
            </div>
            {error && <p role="alert" className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-700"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
            {result && (
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                    {result.candidates.map((candidate) => {
                        const task = catalogById.get(candidate.taskId);
                        if (!task) return null;
                        return <button key={candidate.taskId} type="button" onClick={() => selectTask(candidate.taskId)} className="rounded-xl border border-indigo-200 bg-white p-3 text-left transition hover:border-indigo-500 hover:shadow-sm">
                            <span className="text-[10px] font-bold text-indigo-600">추천 {candidate.rank} · {workLibrary.jobName}</span>
                            <p className="mt-1 text-sm font-bold text-zinc-900">{task.name}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] text-zinc-600">{task.description}</p>
                            <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> 선택하기 · {candidate.reason}</p>
                        </button>;
                    })}
                </div>
            )}
        </section>
    );
}
