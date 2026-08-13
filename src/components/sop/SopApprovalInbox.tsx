'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { listApprovalQueue, decideSopApproval } from '@/lib/sop-record-client';
import { SOP_LIFECYCLE_STATUS_META } from '@/lib/sop-lifecycle';
import { SopApprovalReadOnlyPanel } from './SopApprovalReadOnlyPanel';
import { SopRejectionModal } from './SopRejectionModal';
import type { SopRecord } from '@/lib/sop-record-schema';
import type { SopOrganizationProgress } from '@/lib/sop-analytics';

type ApproverRole = 'leader' | 'sme';

/** Fixed prototype reviewer identities for the demo role toggle — not real accounts. There is no assignment policy in this prototype (see sop-review-assignment.ts), so any actorId with the matching role can act on any record at that stage. */
const DEMO_REVIEWERS: Record<ApproverRole, { actorId: string; organizationId: string; label: string }> = {
    leader: { actorId: 'demo-leader-1', organizationId: 'org-demo-leader', label: '직책자 (1차 검토)' },
    sme: { actorId: 'demo-sme-1', organizationId: 'org-demo-sme', label: 'SME (2차 검토)' },
};

interface BulkResult {
    successCount: number;
    failures: { record: SopRecord; error: string }[];
}

export function SopApprovalInbox({ fetchImpl }: { fetchImpl?: typeof fetch }) {
    const [role, setRole] = useState<ApproverRole>('leader');
    const reviewer = DEMO_REVIEWERS[role];

    const [records, setRecords] = useState<SopRecord[] | null>(null);
    const [organizationProgress, setOrganizationProgress] = useState<SopOrganizationProgress[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [organizationFilter, setOrganizationFilter] = useState('');
    const [jobRoleFilter, setJobRoleFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [rejectingRecord, setRejectingRecord] = useState<SopRecord | null>(null);
    const [rejectError, setRejectError] = useState<string | null>(null);
    const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const loadQueue = () => {
        setLoadError(null);
        listApprovalQueue({
            actor: { actorId: reviewer.actorId, role, organizationId: reviewer.organizationId },
            filters: { organizationId: organizationFilter || undefined, jobRole: jobRoleFilter || undefined },
            fetchImpl,
        }).then((result) => {
            if (result.success) {
                setRecords(result.data.records);
                setOrganizationProgress(result.data.organizationProgress);
            } else {
                setLoadError(result.error);
                setRecords([]);
            }
        });
    };

    useEffect(() => {
        setRecords(null);
        setSelectedIds(new Set());
        setDetailRecordId(null);
        setBulkResult(null);
        loadQueue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, organizationFilter, jobRoleFilter]);

    const isLoading = records === null;
    const detailRecord = useMemo(() => records?.find((r) => r.id === detailRecordId) ?? null, [records, detailRecordId]);

    const toggleSelect = (id: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (!records) return;
        setSelectedIds((current) => (current.size === records.length ? new Set() : new Set(records.map((r) => r.id))));
    };

    const applyDecisionLocally = (updated: SopRecord) => {
        setRecords((current) => (current ? current.filter((r) => r.id !== updated.id) : current));
        setSelectedIds((current) => {
            const next = new Set(current);
            next.delete(updated.id);
            return next;
        });
        if (detailRecordId === updated.id) setDetailRecordId(null);
    };

    const handleApproveOne = async (record: SopRecord) => {
        setActionError(null);
        setBusyIds((current) => new Set(current).add(record.id));
        const result = await decideSopApproval({ actor: { actorId: reviewer.actorId, role, organizationId: reviewer.organizationId }, recordId: record.id, decision: { decision: 'approve' }, fetchImpl });
        setBusyIds((current) => {
            const next = new Set(current);
            next.delete(record.id);
            return next;
        });
        if (!result.success) {
            setActionError(result.error);
            return;
        }
        applyDecisionLocally(result.data);
    };

    const handleRejectConfirm = async (input: { reasonCode: string; feedback: string }) => {
        if (!rejectingRecord) return;
        setRejectError(null);
        setBusyIds((current) => new Set(current).add(rejectingRecord.id));
        const result = await decideSopApproval({
            actor: { actorId: reviewer.actorId, role, organizationId: reviewer.organizationId },
            recordId: rejectingRecord.id,
            decision: { decision: 'reject', reasonCode: input.reasonCode, feedback: input.feedback },
            fetchImpl,
        });
        setBusyIds((current) => {
            const next = new Set(current);
            next.delete(rejectingRecord.id);
            return next;
        });
        if (!result.success) {
            setRejectError(result.error);
            return;
        }
        applyDecisionLocally(result.data);
        setRejectingRecord(null);
    };

    /** Bulk approve — each row goes through the exact same single-record decideSopApproval call as the individual action button; never a separate bulk-only code path. Partial failure never hides the failed record. */
    const runBulkApprove = async (targets: SopRecord[]) => {
        if (targets.length === 0) return;
        setActionError(null);
        setBulkResult(null);
        setBusyIds((current) => new Set([...current, ...targets.map((t) => t.id)]));
        const outcomes = await Promise.allSettled(
            targets.map((record) =>
                decideSopApproval({ actor: { actorId: reviewer.actorId, role, organizationId: reviewer.organizationId }, recordId: record.id, decision: { decision: 'approve' }, fetchImpl }).then((result) => ({ record, result }))
            )
        );
        setBusyIds((current) => {
            const next = new Set(current);
            targets.forEach((t) => next.delete(t.id));
            return next;
        });

        const succeeded: SopRecord[] = [];
        const failures: BulkResult['failures'] = [];
        outcomes.forEach((outcome, index) => {
            if (outcome.status === 'fulfilled' && outcome.value.result.success) {
                succeeded.push(outcome.value.result.data);
            } else {
                const record = targets[index];
                const error = outcome.status === 'fulfilled' ? outcome.value.result.success ? '' : outcome.value.result.error : outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
                failures.push({ record, error });
            }
        });
        succeeded.forEach((record) => applyDecisionLocally(record));
        setBulkResult({ successCount: succeeded.length, failures });
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white shadow-2xs">
                <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white"><ShieldCheck className="h-4.5 w-4.5" /></div>
                        <div>
                            <h1 className="text-base font-semibold leading-tight text-zinc-900">승인 Inbox</h1>
                            <p className="text-xs text-zinc-500">직책자·SME 공용 화면 · 프로토타입 역할 전환</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1" role="group" aria-label="데모 역할 전환">
                        {(['leader', 'sme'] as ApproverRole[]).map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setRole(option)}
                                aria-pressed={role === option}
                                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${role === option ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                                {DEMO_REVIEWERS[option].label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1440px] space-y-5 px-6 py-6">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                    데모 역할 전환입니다. 실제 인증이 아니며, 현재 <strong>{DEMO_REVIEWERS[role].label}</strong> 역할로 조회 중입니다. 저장소는 in-memory reference 어댑터로 서버 재시작 시 초기화될 수 있습니다.
                </p>

                {/* 조직 현황 */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-3 text-sm font-bold text-zinc-900">조직 SOP 작성률·승인 완료율 (프로토타입 기준)</h2>
                    <p className="mb-3 text-[10px] text-zinc-500">
                        작성률의 분모는 실제 전사 인원이 아니라 시나리오 데모 인원(sop-scenario-seed.ts)입니다. 승인 완료율 = 승인 완료 건수 / (초안이 아닌 전체 제출 건수).
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {organizationProgress.map((org) => (
                            <div key={org.organizationId} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                                <p className="truncate text-xs font-bold text-zinc-800">{org.organizationId}</p>
                                <p className="mt-1 text-[10px] text-zinc-500">
                                    작성률(프로토타입): {org.rosterMemberCount > 0 ? `${org.participatingRosterMemberCount}/${org.rosterMemberCount}` : '대상 인원 없음'}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                    승인 완료율: {org.approvalRate.rate === null ? '제출 건 없음' : `${Math.round(org.approvalRate.rate * 100)}% (${org.approvalRate.approvedCount}/${org.approvalRate.submittedCount})`}
                                </p>
                            </div>
                        ))}
                        {organizationProgress.length === 0 && <p className="text-[11px] text-zinc-400">표시할 조직 데이터가 없습니다.</p>}
                    </div>
                </section>

                {/* 필터 + 대량 작업 */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-zinc-500" htmlFor="approval-org-filter">조직</label>
                            <input id="approval-org-filter" type="text" value={organizationFilter} onChange={(e) => setOrganizationFilter(e.target.value)} placeholder="조직 ID" className="mt-1 w-40 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-zinc-500" htmlFor="approval-job-filter">직무</label>
                            <input id="approval-job-filter" type="text" value={jobRoleFilter} onChange={(e) => setJobRoleFilter(e.target.value)} placeholder="직무" className="mt-1 w-40 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs" />
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <button type="button" onClick={() => records && toggleSelectAll()} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                                {records && selectedIds.size === records.length && records.length > 0 ? '전체 선택 해제' : '현재 필터 전체 선택'}
                            </button>
                            <button
                                type="button"
                                disabled={selectedIds.size === 0}
                                onClick={() => records && runBulkApprove(records.filter((r) => selectedIds.has(r.id)))}
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                            >
                                선택 승인 ({selectedIds.size})
                            </button>
                            <button
                                type="button"
                                disabled={!records || records.length === 0}
                                onClick={() => records && runBulkApprove(records)}
                                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                현재 필터 전체 승인
                            </button>
                        </div>
                    </div>

                    {bulkResult && (
                        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px]">
                            <p className="font-bold text-zinc-800">일괄 승인 결과: 성공 {bulkResult.successCount}건 · 실패 {bulkResult.failures.length}건</p>
                            {bulkResult.failures.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                    {bulkResult.failures.map(({ record, error }) => (
                                        <li key={record.id} className="text-rose-700">{record.document.title}: {error}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {actionError && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-700">{actionError}</p>}
                </section>

                {/* 목록 */}
                <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    {loadError && (
                        <p role="alert" className="m-4 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {loadError}
                        </p>
                    )}
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
                        </div>
                    )}
                    {!isLoading && records && records.length === 0 && !loadError && (
                        <div className="px-4 py-10 text-center text-xs text-zinc-500">
                            현재 {DEMO_REVIEWERS[role].label} 단계에서 검토할 SOP가 없습니다.
                        </div>
                    )}
                    {!isLoading && records && records.length > 0 && (
                        <div className="max-h-[520px] overflow-y-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="sticky top-0 bg-zinc-50 text-[10px] uppercase text-zinc-500">
                                    <tr>
                                        <th className="w-8 px-3 py-2"><span className="sr-only">선택</span></th>
                                        <th className="px-2 py-2">요청자</th>
                                        <th className="px-2 py-2">요청일</th>
                                        <th className="px-2 py-2">Task</th>
                                        <th className="px-2 py-2">조직</th>
                                        <th className="px-2 py-2">직무</th>
                                        <th className="px-2 py-2">우선순위</th>
                                        <th className="px-2 py-2">현재 상태</th>
                                        <th className="px-2 py-2 text-right">동작</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((record) => {
                                        const busy = busyIds.has(record.id);
                                        return (
                                            <tr key={record.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                                                <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.has(record.id)} onChange={() => toggleSelect(record.id)} aria-label={`${record.document.title} 선택`} /></td>
                                                <td className="px-2 py-2 font-semibold text-zinc-800">{record.document.member.name}</td>
                                                <td className="px-2 py-2 text-zinc-500">{new Date(record.createdAt).toLocaleDateString('ko-KR')}</td>
                                                <td className="max-w-[160px] truncate px-2 py-2">
                                                    <button type="button" onClick={() => setDetailRecordId(record.id)} className="font-semibold text-indigo-600 hover:underline">{record.taskName}</button>
                                                </td>
                                                <td className="px-2 py-2 text-zinc-500">{record.organizationId}</td>
                                                <td className="px-2 py-2 text-zinc-500">{record.document.member.jobRole}</td>
                                                <td className="px-2 py-2 text-zinc-400" title="프로토타입 값 — 산식 미확정">일반</td>
                                                <td className="px-2 py-2"><span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-bold ${SOP_LIFECYCLE_STATUS_META[record.lifecycleStatus].badgeClass}`}>{SOP_LIFECYCLE_STATUS_META[record.lifecycleStatus].label}</span></td>
                                                <td className="px-2 py-2">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button type="button" onClick={() => setDetailRecordId(record.id)} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50">검토</button>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => handleApproveOne(record)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                                        >
                                                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} 승인
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => setRejectingRecord(record)}
                                                            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                                        >
                                                            <XCircle className="h-3 w-3" /> 반려
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            {detailRecord && (
                <div role="dialog" aria-modal="true" aria-labelledby="approval-detail-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                            <h3 id="approval-detail-title" className="text-sm font-bold text-zinc-900">읽기 전용 검토</h3>
                            <button type="button" onClick={() => setDetailRecordId(null)} aria-label="닫기" className="text-xl font-bold text-zinc-400 hover:text-zinc-700">&times;</button>
                        </div>
                        <div className="mt-3">
                            <SopApprovalReadOnlyPanel record={detailRecord} />
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-zinc-200 pt-3">
                            <button
                                type="button"
                                disabled={busyIds.has(detailRecord.id)}
                                onClick={() => setRejectingRecord(detailRecord)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                                <XCircle className="h-3.5 w-3.5" /> 반려
                            </button>
                            <button
                                type="button"
                                disabled={busyIds.has(detailRecord.id)}
                                onClick={() => handleApproveOne(detailRecord)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {busyIds.has(detailRecord.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} 승인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {rejectingRecord && (
                <SopRejectionModal
                    onCancel={() => { setRejectingRecord(null); setRejectError(null); }}
                    onConfirm={handleRejectConfirm}
                    isSubmitting={busyIds.has(rejectingRecord.id)}
                    error={rejectError}
                />
            )}
        </div>
    );
}
