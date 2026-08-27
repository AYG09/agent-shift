'use client';

import { useMemo, useState } from 'react';
import { Copy, FileClock, Loader2, Search } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { cloneSopPriorRecord } from '@/lib/sop-record-client';
import { SOP_LIFECYCLE_STATUS_META } from '@/lib/sop-lifecycle';
import type { SopRecord } from '@/lib/sop-record-schema';

function countActivityAndSubActions(record: SopRecord): { activityCount: number; subActionCount: number } {
    const businessSteps = record.document.steps.filter((step) => !step.terminalType);
    return {
        activityCount: new Set(businessSteps.flatMap((step) => step.sourceActivityIds ?? [])).size,
        subActionCount: businessSteps.length,
    };
}

/**
 * Lists the CURRENT member's own previously saved records (passed in as
 * `records` — the same list SopMemberHome already fetched via GET /api/sop,
 * scoped server-side to this member — no separate network round-trip or
 * endpoint) and clones a chosen one into a brand-new, independent draft under
 * the same identity. Unlike the colleague-template picker, there is no
 * approval/eligibility filter here and no PII to sanitize (it is already the
 * member's own record) — the only eligibility rule is ownership, already
 * guaranteed by how `records` was fetched.
 */
export function SopOwnPriorPicker({
    records,
    onClose,
    navigate,
    fetchImpl,
}: {
    records: SopRecord[];
    onClose: () => void;
    navigate: (href: string) => void;
    fetchImpl?: typeof fetch;
}) {
    const memberInfo = useSopPrototypeStore((state) => state.memberInfo);
    const setDocument = useSopPrototypeStore((state) => state.setDocument);
    const adoptClonedWorkMap = useSopPrototypeStore((state) => state.adoptClonedWorkMap);
    const customerReviewMode = useSopPrototypeStore((state) => state.customerReviewMode);

    const [searchQuery, setSearchQuery] = useState('');
    const [selected, setSelected] = useState<SopRecord | null>(null);
    const [isCloning, setIsCloning] = useState(false);
    const [cloneError, setCloneError] = useState<string | null>(null);

    const visibleRecords = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const sorted = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (!query) return sorted;
        return sorted.filter((record) => record.taskName.toLowerCase().includes(query) || record.document.title.toLowerCase().includes(query));
    }, [records, searchQuery]);

    const handleClone = async () => {
        if (!selected || customerReviewMode) return;
        setIsCloning(true);
        setCloneError(null);
        const result = await cloneSopPriorRecord({ member: memberInfo, recordId: selected.id, fetchImpl });
        setIsCloning(false);
        if (!result.success) {
            setCloneError(result.error);
            return;
        }
        if (!setDocument(result.data)) {
            setCloneError('복제된 SOP를 현재 문서에 적용하지 못했습니다. 고객 검토 모드와 문서 상태를 확인해 주세요.');
            return;
        }
        onClose();
        // §2.4: 과거 작성 복제본도 공통 편집 흐름을 타야 하므로 Work Map 편집 단계를
        // 거친다. workLibrary 스냅샷에서 선택 Task를 찾을 수 없는 legacy 문서 등으로
        // 초안 채택이 실패하면(false) 복제 자체는 실패시키지 않고 기존대로 Workspace로
        // 보낸다.
        navigate(adoptClonedWorkMap(result.data) ? '/sop/work-map/simple' : '/sop/workspace');
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="own-prior-picker-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                    <h3 id="own-prior-picker-title" className="flex items-center gap-2 text-lg font-bold text-zinc-900">
                        <FileClock className="h-5 w-5 text-indigo-600" /> 기존 내가 작성한 내용 기반 생성
                    </h3>
                    <button type="button" onClick={onClose} aria-label="닫기" className="text-xl font-bold text-zinc-400 hover:text-zinc-700">
                        &times;
                    </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-zinc-500">
                    내가 과거에 작성한 Work Map과 SOP만 표시됩니다. 선택하면 원본은 그대로 보존되고, 새 독립 초안(새 ID, 초기화된 승인·검토·Agent화 상태)으로 복제되어 Workspace로 이동합니다.
                </p>

                {records.length > 0 && (
                    <div className="mt-3">
                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Task명 · SOP 제목으로 검색"
                                className="w-full rounded-lg border border-zinc-300 py-2 pl-8 pr-3 text-xs focus:border-indigo-500 focus:outline-none"
                            />
                        </label>
                    </div>
                )}

                {records.length === 0 && (
                    <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-xs text-zinc-500">
                        아직 저장된 내 SOP가 없습니다. Task 기반 생성으로 먼저 SOP를 작성하고 서버에 저장하면 여기에 표시됩니다.
                    </div>
                )}

                {records.length > 0 && visibleRecords.length === 0 && (
                    <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500">
                        &quot;{searchQuery}&quot;와 일치하는 내 SOP가 없습니다. 다른 검색어로 다시 시도해 주세요.
                    </div>
                )}

                {visibleRecords.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {visibleRecords.map((record) => {
                            const isSelected = selected?.id === record.id;
                            const { activityCount, subActionCount } = countActivityAndSubActions(record);
                            const statusMeta = SOP_LIFECYCLE_STATUS_META[record.lifecycleStatus];
                            return (
                                <button
                                    key={record.id}
                                    type="button"
                                    onClick={() => setSelected(record)}
                                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-zinc-900">{record.document.title}</p>
                                        <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-zinc-500">Task: {record.taskName} · 수정일 {new Date(record.updatedAt).toLocaleDateString('ko-KR')}</p>
                                    <p className="mt-0.5 text-[11px] text-zinc-400">Activity {activityCount}개 · Sub Action {subActionCount}개</p>
                                </button>
                            );
                        })}
                    </div>
                )}

                {selected && (
                    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-[11px] font-bold text-zinc-700">읽기 전용 미리 보기</p>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-600">{selected.document.context || '(맥락 설명 없음)'}</p>
                    </div>
                )}

                {selected && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                        <p className="text-xs font-bold text-indigo-900">선택한 기록을 복제해 새 독립 초안을 만듭니다.</p>
                        <p className="mt-1 text-[11px] leading-5 text-indigo-800">
                            원본은 수정되지 않고 그대로 유지됩니다. 복제본은 새 문서 ID를 받으며, 승인·검토·Agent화 확정 상태는 모두 초기화됩니다.
                        </p>
                        {cloneError && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-700">{cloneError}</p>}
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleClone}
                                disabled={isCloning || customerReviewMode}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                            >
                                {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} 이 기록으로 새 초안 만들기
                            </button>
                            <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                                다른 기록 선택
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
