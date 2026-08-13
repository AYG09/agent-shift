'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, Download, Loader2, Sparkles } from 'lucide-react';
import { fetchSopAnalytics, requestStandardDraft, type SopAnalyticsFetchResult } from '@/lib/sop-record-client';
import { buildDemoActorHeaders } from '@/lib/sop-actor-client';
import { SopRoleNav } from './SopRoleNav';
import { SOP_LIFECYCLE_STATUS_META } from '@/lib/sop-lifecycle';
import type { SopDocument } from '@/lib/sop-types';

/** Fixed prototype HR identity for the demo role toggle — not a real account. */
const DEMO_HR_ACTOR = { actorId: 'demo-hr-1', organizationId: 'org-demo-hr' };

interface StandardDraftPreview {
    document: SopDocument;
    sourceRecordIds: string[];
    taskId: string;
    generatedAt: string;
}

export function SopHrDashboard({ fetchImpl }: { fetchImpl?: typeof fetch }) {
    const [organizationFilter, setOrganizationFilter] = useState('');
    const [data, setData] = useState<SopAnalyticsFetchResult | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    const [draftGroupTaskId, setDraftGroupTaskId] = useState<string | null>(null);
    const [draftPreview, setDraftPreview] = useState<StandardDraftPreview | null>(null);
    const [isDrafting, setIsDrafting] = useState(false);
    const [draftError, setDraftError] = useState<string | null>(null);

    const loadAnalytics = () => {
        setLoadError(null);
        fetchSopAnalytics({ actor: DEMO_HR_ACTOR, organizationId: organizationFilter || undefined, fetchImpl }).then((result) => {
            if (result.success) setData(result.data);
            else {
                setLoadError(result.error);
                setData(null);
            }
        });
    };

    useEffect(() => {
        setData(null);
        loadAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationFilter]);

    const handleExport = async () => {
        setIsExporting(true);
        setExportError(null);
        try {
            const query = organizationFilter ? `?organizationId=${encodeURIComponent(organizationFilter)}` : '';
            const res = await (fetchImpl ?? fetch)(`/api/sop/analytics/export${query}`, {
                headers: buildDemoActorHeaders({ ...DEMO_HR_ACTOR, role: 'hr' }),
            });
            if (!res.ok) {
                setExportError('CSV 내보내기에 실패했습니다.');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `sop-hr-export-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : 'CSV 내보내기 중 알 수 없는 오류가 발생했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const openDraftPreview = async (taskId: string, sourceRecordIds: string[]) => {
        setDraftGroupTaskId(taskId);
        setDraftPreview(null);
        setDraftError(null);
        setIsDrafting(true);
        const result = await requestStandardDraft({ actor: DEMO_HR_ACTOR, taskId, sourceRecordIds, fetchImpl });
        setIsDrafting(false);
        if (!result.success) {
            setDraftError(result.error);
            return;
        }
        setDraftPreview(result.data);
    };

    const isLoading = data === null && !loadError;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white shadow-2xs">
                <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-6">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white"><BarChart3 className="h-4.5 w-4.5" /></div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-semibold leading-tight text-zinc-900">HR 대시보드</h1>
                        <p className="truncate text-xs text-zinc-500">데모 역할 전환: 현재 HR 역할로 조회 중 (읽기 전용) · 실제 인증이 아닙니다.</p>
                    </div>
                    <SopRoleNav />
                </div>
            </header>

            <main className="mx-auto max-w-[1440px] space-y-5 px-6 py-6">
                <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div>
                        <label className="block text-[10px] font-semibold text-zinc-500" htmlFor="hr-org-filter">조직 필터</label>
                        <input id="hr-org-filter" type="text" value={organizationFilter} onChange={(e) => setOrganizationFilter(e.target.value)} placeholder="전체 조직 (비워두면 전사)" className="mt-1 w-56 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs" />
                    </div>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={isExporting}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} 현재 필터 결과 CSV 내보내기
                    </button>
                </div>
                {exportError && <p role="alert" className="text-[11px] font-medium text-rose-700">{exportError}</p>}
                {loadError && (
                    <p role="alert" className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {loadError}
                    </p>
                )}
                {isLoading && (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
                    </div>
                )}

                {data && (
                    <>
                        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                                <p className="text-[10px] font-semibold text-zinc-500">작성 참여 구성원 수</p>
                                <p className="mt-1 text-2xl font-bold text-zinc-900">{data.participatingMemberCount}</p>
                            </div>
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                                <p className="text-[10px] font-semibold text-zinc-500">SOP 작성 건수</p>
                                <p className="mt-1 text-2xl font-bold text-zinc-900">{data.recordCount}</p>
                            </div>
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                                <p className="text-[10px] font-semibold text-zinc-500">최종 승인 건수</p>
                                <p className="mt-1 text-2xl font-bold text-zinc-900">{data.approvalRate.approvedCount}</p>
                            </div>
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                                <p className="text-[10px] font-semibold text-zinc-500">승인 완료율</p>
                                <p className="mt-1 text-2xl font-bold text-zinc-900">
                                    {data.approvalRate.rate === null ? '—' : `${Math.round(data.approvalRate.rate * 100)}%`}
                                </p>
                                <p className="text-[9px] text-zinc-400">
                                    {data.approvalRate.approvedCount} / {data.approvalRate.submittedCount} (초안 제외 전체 제출 건수 기준)
                                </p>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                            <h2 className="mb-3 text-sm font-bold text-zinc-900">Lifecycle 분포</h2>
                            <div className="grid grid-cols-5 gap-2">
                                {(Object.keys(SOP_LIFECYCLE_STATUS_META) as (keyof typeof SOP_LIFECYCLE_STATUS_META)[]).map((status) => (
                                    <div key={status} className={`rounded-xl border px-2 py-2.5 text-center ${SOP_LIFECYCLE_STATUS_META[status].badgeClass}`}>
                                        <span className="block text-lg font-bold">{data.lifecycleDistribution[status]}</span>
                                        <span className="block text-[9px] font-semibold">{SOP_LIFECYCLE_STATUS_META[status].label}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="grid gap-5 lg:grid-cols-2">
                            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                                <h2 className="mb-1 text-sm font-bold text-zinc-900">Top Task</h2>
                                <p className="mb-3 text-[10px] text-zinc-500">현재 필터의 record 수 기준 내림차순 (프로토타입 데이터).</p>
                                {data.topTasks.length === 0 && <p className="text-[11px] text-zinc-400">표시할 데이터가 없습니다.</p>}
                                <ol className="space-y-1.5">
                                    {data.topTasks.map((task, index) => (
                                        <li key={task.taskId} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs">
                                            <span className="font-semibold text-zinc-800">{index + 1}. {task.taskName}</span>
                                            <span className="font-bold text-zinc-600">{task.recordCount}건</span>
                                        </li>
                                    ))}
                                </ol>
                            </section>

                            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                                <h2 className="mb-1 text-sm font-bold text-zinc-900">Agent화 근거 (승인 SOP 기준)</h2>
                                <p className="mb-3 text-[10px] text-zinc-500">승인된 SOP의 구성원 확정 Sub Action 판단을 Task별로 집계합니다. 임계값·확률이 아닌 단순 건수입니다.</p>
                                {data.agentizationEvidence.length === 0 && <p className="text-[11px] text-zinc-400">승인된 SOP 중 Agent화 판단이 확정된 데이터가 없습니다.</p>}
                                <ul className="space-y-1.5">
                                    {data.agentizationEvidence.map((evidence) => (
                                        <li key={evidence.taskId} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs">
                                            <p className="font-semibold text-zinc-800">{evidence.taskName}</p>
                                            <p className="mt-0.5 text-[10px] text-zinc-500">AI Agent 후보 {evidence.modeCounts.automation}건 · AI 지원 {evidence.modeCounts.assist}건</p>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>

                        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                            <h2 className="mb-1 text-sm font-bold text-zinc-900">표준 SOP 후보</h2>
                            <p className="mb-3 text-[10px] text-zinc-500">
                                승인 SOP를 Task별로 그룹화한 목록입니다. 운영용 군집화·프로세스 마이닝이 아니며, 아래 &quot;AI 초안&quot;은 검토용 미리보기일 뿐 자동으로 공식 표준으로 확정되지 않습니다.
                            </p>
                            {data.standardCandidates.length === 0 && <p className="text-[11px] text-zinc-400">승인된 SOP가 없어 표시할 후보 그룹이 없습니다.</p>}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {data.standardCandidates.map((group) => (
                                    <div key={group.taskId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                                        <p className="text-xs font-bold text-zinc-900">{group.taskName}</p>
                                        <p className="mt-1 text-[10px] text-zinc-500">원본 {group.recordCount}건 · 조직 {group.organizationCount}개 · 최근 수정 {new Date(group.lastUpdatedAt).toLocaleDateString('ko-KR')}</p>
                                        <button
                                            type="button"
                                            onClick={() => openDraftPreview(group.taskId, group.sourceRecordIds)}
                                            disabled={isDrafting && draftGroupTaskId === group.taskId}
                                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                                        >
                                            {isDrafting && draftGroupTaskId === group.taskId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} 대표 표준안 초안 생성
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </main>

            {draftGroupTaskId && (
                <div role="dialog" aria-modal="true" aria-labelledby="standard-draft-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                            <h3 id="standard-draft-title" className="text-sm font-bold text-zinc-900">대표 표준안 AI 초안 (미리보기)</h3>
                            <button type="button" onClick={() => { setDraftGroupTaskId(null); setDraftPreview(null); }} aria-label="닫기" className="text-xl font-bold text-zinc-400 hover:text-zinc-700">&times;</button>
                        </div>
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-800">
                            이 초안은 AI가 생성한 검토용 미리보기이며 자동으로 공식 표준으로 저장·확정되지 않습니다.
                        </p>
                        {isDrafting && (
                            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> 대표 표준안 초안을 생성하는 중...
                            </div>
                        )}
                        {draftError && <p role="alert" className="mt-3 text-[11px] font-medium text-rose-700">{draftError}</p>}
                        {draftPreview && (
                            <div className="mt-3 space-y-3">
                                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                                    <p className="text-xs font-bold text-zinc-900">{draftPreview.document.title}</p>
                                    <p className="mt-1 text-[10px] text-zinc-500">{draftPreview.document.context}</p>
                                    <p className="mt-1 text-[10px] text-zinc-400">원본 provenance: {draftPreview.sourceRecordIds.join(', ')}</p>
                                </div>
                                <ol className="space-y-1.5">
                                    {draftPreview.document.steps.filter((step) => !step.terminalType).map((step, index) => (
                                        <li key={step.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs">
                                            <span className="mr-1.5 rounded-sm bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">#{index + 1}</span>
                                            <span className="font-semibold text-zinc-900">{step.title}</span>
                                            <p className="mt-0.5 text-[11px] text-zinc-600">{step.definition}</p>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
