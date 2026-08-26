'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, LayoutList, Pencil, Plus, Trash2 } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopMemberRouteGuard } from './SopMemberRouteGuard';
import { SOP_INTAKE_ROUTES } from '@/lib/sop-member-intake';
import {
    selectSimpleWorkMapRows,
    selectWorkMapRelationCount,
    type WorkMapValidationError,
} from '@/lib/sop-work-map-draft';
import { confirmWorkMapAndProceed } from '@/lib/sop-setup-actions';
import { formatActivityCode } from '@/lib/sop-format';
import { SopWorkMapSimpleEditDrawer, type SopWorkMapEditTarget } from './SopWorkMapSimpleEditDrawer';

/**
 * 간소화 Work Map (`/sop/work-map/simple`, REQ-WM-001~006).
 *
 * 이 화면의 유일한 목적은 14개 Activity(대표 Task 기준) × Skill 관계를 "훑는"
 * 것이다. 그래서 본문은 각 Activity를 한 줄 요약으로만 그리고, 전체 필드 편집은
 * 전부 {@link SopWorkMapSimpleEditDrawer}로 넘긴다 — 두 화면이 갈라지면 "간소화
 * 에서는 못 고치는 필드가 생긴다"는 결함이 구조적으로 생기기 때문이다.
 *
 * 모든 mutation은 Foundation Store action(`useSopPrototypeStore`)만 호출한다.
 * `/sop/work-map/detailed`로의 전환은 순수 navigate이며 어떤 상태도 바꾸지
 * 않는다(TST-STATE-006).
 */
export interface SopWorkMapSimpleViewProps {
    navigate: (path: string) => void;
}

function SopWorkMapSimpleContent({ navigate }: SopWorkMapSimpleViewProps) {
    const draft = useSopPrototypeStore((s) => s.workMapDraft);
    const addWorkMapActivity = useSopPrototypeStore((s) => s.addWorkMapActivity);
    const deleteWorkMapActivity = useSopPrototypeStore((s) => s.deleteWorkMapActivity);
    const moveWorkMapActivity = useSopPrototypeStore((s) => s.moveWorkMapActivity);
    const confirmWorkMap = useSopPrototypeStore((s) => s.confirmWorkMap);
    const setWorkLibrary = useSopPrototypeStore((s) => s.setWorkLibrary);

    const [editTarget, setEditTarget] = useState<SopWorkMapEditTarget | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<WorkMapValidationError[]>([]);

    // Route guard already requires a Work Map draft to reach this route; this is a
    // defensive fallback for the instant between a discard and the guard's redirect.
    if (!draft) return null;

    const rows = selectSimpleWorkMapRows(draft);
    const relationCount = selectWorkMapRelationCount(draft);
    const taskOneLine = (draft.task.description ?? '').replace(/\s+/g, ' ').trim();

    const errorByActivityId = new Map<string, WorkMapValidationError>();
    validationErrors.forEach((error) => {
        if (error.activityId && !errorByActivityId.has(error.activityId)) errorByActivityId.set(error.activityId, error);
    });

    const handleAddActivity = () => {
        const newId = addWorkMapActivity();
        setValidationErrors([]);
        if (newId) setEditTarget({ kind: 'activity', activityId: newId });
    };

    const handleConfirmDelete = (activityId: string) => {
        deleteWorkMapActivity(activityId);
        setPendingDeleteId(null);
        setValidationErrors([]);
    };

    const handleReviewComplete = () => {
        const result = confirmWorkMapAndProceed({ confirmWorkMap, setWorkLibrary, navigate });
        if (!result) return;
        if (!result.ok) {
            setValidationErrors(result.errors);
            const first = result.errors[0];
            if (first.activityId) setEditTarget({ kind: 'activity', activityId: first.activityId });
            else if (first.field === 'taskName') setEditTarget({ kind: 'task' });
            return;
        }
        setValidationErrors([]);
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
            <header className="shrink-0 border-b border-zinc-200 bg-white shadow-2xs">
                <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-zinc-500">Task</p>
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-base font-bold text-zinc-900" title={draft.task.name}>
                                {draft.task.name || '이름 없는 Task'}
                            </h1>
                            <button
                                type="button"
                                onClick={() => setEditTarget({ kind: 'task' })}
                                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                            >
                                <Pencil className="h-3 w-3" /> 편집
                            </button>
                        </div>
                        {taskOneLine && (
                            <p className="mt-0.5 truncate text-xs text-zinc-500" title={taskOneLine}>
                                {taskOneLine}
                            </p>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-5">
                        <div className="text-center">
                            <div className="text-lg font-bold text-zinc-900">{rows.length}</div>
                            <div className="text-[10px] font-semibold text-zinc-500">Activity</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-zinc-900">{relationCount}</div>
                            <div className="text-[10px] font-semibold text-zinc-500">Skill 관계</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(SOP_INTAKE_ROUTES.workMapDetailed)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                            <LayoutList className="h-3.5 w-3.5" /> 상세 보기로 전환 <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-2 px-6 py-4">
                <div className="grid shrink-0 grid-cols-[48px_minmax(0,220px)_minmax(0,1fr)_minmax(0,260px)_88px] gap-3 px-3 text-[10px] font-semibold text-zinc-500">
                    <span>순서</span>
                    <span>Activity명</span>
                    <span>한 줄 정의</span>
                    <span>Skill</span>
                    <span className="text-right">동작</span>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                    {rows.map((row, index) => {
                        const rowError = errorByActivityId.get(row.activityId);
                        return (
                            <div
                                key={row.activityId}
                                className={`rounded-xl border bg-white p-3 shadow-sm ${
                                    rowError ? 'border-rose-300 bg-rose-50/40' : 'border-zinc-200'
                                }`}
                            >
                                <div className="grid grid-cols-[48px_minmax(0,220px)_minmax(0,1fr)_minmax(0,260px)_88px] items-center gap-3">
                                    <span className="shrink-0 whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-center text-[10px] font-bold text-zinc-600">
                                        {formatActivityCode(row.order)}
                                    </span>
                                    <span className="min-w-0 truncate text-xs font-bold text-zinc-900" title={row.name}>
                                        {row.name || '(이름 없음)'}
                                    </span>
                                    <span className="min-w-0 truncate text-[11px] text-zinc-500" title={row.description}>
                                        {row.oneLineDescription || '설명 없음'}
                                    </span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
                                        {row.skillNames.slice(0, 3).map((name, skillIndex) => (
                                            <span
                                                key={`${row.activityId}-skill-${skillIndex}`}
                                                className="shrink-0 max-w-[110px] truncate whitespace-nowrap rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                                title={name}
                                            >
                                                {name || '(이름 없음)'}
                                            </span>
                                        ))}
                                        {row.skillCount > 3 && (
                                            <span className="shrink-0 whitespace-nowrap rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                                                +{row.skillCount - 3}
                                            </span>
                                        )}
                                        {row.skillCount === 0 && <span className="text-[10px] text-zinc-400">없음</span>}
                                    </div>
                                    <div className="flex items-center justify-end gap-0.5">
                                        <button
                                            type="button"
                                            title="위로 이동"
                                            aria-label={`${row.name || '이름 없는 Activity'} 위로 이동`}
                                            disabled={index === 0}
                                            onClick={() => moveWorkMapActivity(row.activityId, 'up')}
                                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            title="아래로 이동"
                                            aria-label={`${row.name || '이름 없는 Activity'} 아래로 이동`}
                                            disabled={index === rows.length - 1}
                                            onClick={() => moveWorkMapActivity(row.activityId, 'down')}
                                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            title="편집"
                                            aria-label={`${row.name || '이름 없는 Activity'} 편집`}
                                            onClick={() => setEditTarget({ kind: 'activity', activityId: row.activityId })}
                                            className="rounded p-1 text-indigo-500 hover:bg-indigo-50"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            title={rows.length <= 1 ? 'Activity가 최소 1개 필요합니다.' : '삭제'}
                                            aria-label={`${row.name || '이름 없는 Activity'} 삭제`}
                                            disabled={rows.length <= 1}
                                            onClick={() => setPendingDeleteId(row.activityId)}
                                            className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {rowError && <p className="mt-1.5 text-[10px] font-semibold text-rose-700">{rowError.message}</p>}
                                {pendingDeleteId === row.activityId && (
                                    <div className="mt-2 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
                                        <span className="text-[11px] font-semibold text-rose-700">
                                            {row.name || '이 Activity'} 삭제 시 연결된 Skill {row.skillCount}개도 함께 삭제됩니다.
                                        </span>
                                        <div className="flex shrink-0 gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setPendingDeleteId(null)}
                                                className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                                            >
                                                취소
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleConfirmDelete(row.activityId)}
                                                className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
                                            >
                                                삭제 확정
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={handleAddActivity}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-semibold text-zinc-500 hover:border-indigo-300 hover:text-indigo-600"
                    >
                        <Plus className="h-3.5 w-3.5" /> Activity 추가
                    </button>
                </div>
            </main>

            <footer className="shrink-0 border-t border-zinc-200 bg-white">
                <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3">
                    <div className="min-w-0 flex-1">
                        {validationErrors.length > 0 && (
                            <p role="alert" className="truncate text-xs font-semibold text-rose-700">
                                {validationErrors[0].message}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleReviewComplete}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                        <CheckCircle2 className="h-4 w-4" /> 검토 완료 · SOP 생성으로 계속
                    </button>
                </div>
            </footer>

            <SopWorkMapSimpleEditDrawer target={editTarget} onClose={() => setEditTarget(null)} />
        </div>
    );
}

export const SopWorkMapSimpleView: React.FC<SopWorkMapSimpleViewProps> = ({ navigate }) => (
    <SopMemberRouteGuard route={SOP_INTAKE_ROUTES.workMapSimple} navigate={navigate}>
        <SopWorkMapSimpleContent navigate={navigate} />
    </SopMemberRouteGuard>
);
