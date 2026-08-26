'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Plus } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { formatActivityCode } from '@/lib/sop-format';
import {
    selectWorkMapActivities,
    selectWorkMapRelationCount,
    validateWorkMapDraft,
} from '@/lib/sop-work-map-draft';
import { confirmWorkMapAndProceed } from '@/lib/sop-setup-actions';
import type { WorkLibraryActivity } from '@/lib/sop-types';
import { SopWorkMapActivityDetail } from './SopWorkMapActivityDetail';

/**
 * 선택 Activity를 지운 뒤 다음에 선택할 Activity id를 결정한다 (05_WAVE1D
 * "선택 Activity 삭제 후 focus와 selection을 결정론적으로 다음 유효 Activity에
 * 둔다"). 삭제된 위치에 있던 항목이 새로 그 자리를 채우고, 마지막 항목이었다면
 * 새로운 마지막 항목을 선택한다. 남은 Activity가 없으면 `null`.
 */
export function computeNextActivitySelection(activities: WorkLibraryActivity[], deletedId: string): string | null {
    const index = activities.findIndex((activity) => activity.id === deletedId);
    const remaining = activities.filter((activity) => activity.id !== deletedId);
    if (remaining.length === 0) return null;
    if (index < 0) return remaining[0].id;
    return remaining[Math.min(index, remaining.length - 1)].id;
}

export interface SopWorkMapDetailedViewProps {
    navigate: (href: string) => void;
}

/**
 * 상세 Work Map 페이지. 간소화 페이지(Wave 1C)와 같은 Foundation draft를 같은
 * mutation으로 편집하는 **projection**일 뿐이다 — 이 컴포넌트는 자체 상태를
 * `selectedActivityId`(순수 UI 선택) 하나만 갖고, T/A/S 데이터는 전부 Store를 통해
 * 읽고 쓴다 (INT-WM 계열 불변식).
 */
export function SopWorkMapDetailedView({ navigate }: SopWorkMapDetailedViewProps) {
    const draft = useSopPrototypeStore((state) => state.workMapDraft);
    const updateWorkMapTask = useSopPrototypeStore((state) => state.updateWorkMapTask);
    const updateWorkMapActivity = useSopPrototypeStore((state) => state.updateWorkMapActivity);
    const addWorkMapActivity = useSopPrototypeStore((state) => state.addWorkMapActivity);
    const deleteWorkMapActivity = useSopPrototypeStore((state) => state.deleteWorkMapActivity);
    const moveWorkMapActivity = useSopPrototypeStore((state) => state.moveWorkMapActivity);
    const updateWorkMapSkill = useSopPrototypeStore((state) => state.updateWorkMapSkill);
    const addWorkMapSkill = useSopPrototypeStore((state) => state.addWorkMapSkill);
    const deleteWorkMapSkill = useSopPrototypeStore((state) => state.deleteWorkMapSkill);
    const confirmWorkMap = useSopPrototypeStore((state) => state.confirmWorkMap);
    const setWorkLibrary = useSopPrototypeStore((state) => state.setWorkLibrary);

    const activities = draft ? selectWorkMapActivities(draft) : [];
    const relationCount = draft ? selectWorkMapRelationCount(draft) : 0;

    const [selectedActivityId, setSelectedActivityId] = useState<string | null>(activities[0]?.id ?? null);
    const [showErrors, setShowErrors] = useState(false);

    const taskNameRef = useRef<HTMLInputElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);

    // 목록이 바뀌어(추가/삭제/reorder) 현재 선택이 더는 유효하지 않으면 안전하게
    // 첫 Activity로 되돌린다. 삭제 핸들러는 이미 정확한 다음 선택을 직접 지정하므로,
    // 이 effect는 방어적 안전망일 뿐 평소에는 아무 일도 하지 않는다.
    useEffect(() => {
        if (activities.length === 0) {
            if (selectedActivityId !== null) setSelectedActivityId(null);
            return;
        }
        if (!activities.some((activity) => activity.id === selectedActivityId)) {
            setSelectedActivityId(activities[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activities.map((activity) => activity.id).join('|')]);

    // Activity 선택이 바뀔 때만 상세 heading으로 focus를 옮겨 screen-reader 문맥을
    // 갱신한다 (디자인 수용 기준 1번). 같은 Activity 안에서 타이핑하는 동안에는
    // selectedActivityId가 바뀌지 않으므로 이 effect가 매 keystroke마다 focus를
    // 빼앗지 않는다.
    useEffect(() => {
        if (selectedActivityId) headingRef.current?.focus();
    }, [selectedActivityId]);

    if (!draft) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-zinc-500">
                Work Map을 불러오는 중입니다…
            </div>
        );
    }

    const selectedIndex = activities.findIndex((activity) => activity.id === selectedActivityId);
    const selectedActivity = selectedIndex >= 0 ? activities[selectedIndex] : undefined;
    const validation = validateWorkMapDraft(draft);
    const showBanner = showErrors && !validation.ok;

    const handleAddActivity = () => {
        const newId = addWorkMapActivity();
        if (newId) setSelectedActivityId(newId);
    };

    const handleDeleteActivity = () => {
        if (!selectedActivity) return;
        const nextId = computeNextActivitySelection(activities, selectedActivity.id);
        deleteWorkMapActivity(selectedActivity.id);
        setSelectedActivityId(nextId);
    };

    const handleAddSkill = () => {
        if (!selectedActivity) return;
        addWorkMapSkill(selectedActivity.id);
    };

    const handleConfirm = () => {
        const result = confirmWorkMapAndProceed({ confirmWorkMap, setWorkLibrary, navigate });
        if (!result || !result.ok) {
            setShowErrors(true);
            const firstError = (result?.errors ?? validation.errors)[0];
            if (firstError?.field === 'taskName') {
                taskNameRef.current?.focus();
            } else if (firstError?.activityId) {
                setSelectedActivityId(firstError.activityId);
            }
            return;
        }
        setShowErrors(false);
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
            <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 shadow-2xs">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">SOP</div>
                    <div>
                        <h1 className="text-sm font-semibold leading-tight text-zinc-900">Work Map · 상세 보기</h1>
                        <p className="text-[11px] text-zinc-500">Task, Activity, Skill을 전체 원문으로 검토·수정합니다.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/sop/work-map/simple')}
                    className="shrink-0 whitespace-nowrap rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                >
                    간소화 보기로 전환
                </button>
            </header>

            <section className="shrink-0 border-b border-zinc-200 bg-white px-6 py-3">
                <div className="flex flex-wrap items-start gap-4">
                    <label className="block w-full max-w-[320px] shrink-0">
                        <span className="text-[10px] font-bold text-zinc-500">TASK 명</span>
                        <input
                            ref={taskNameRef}
                            value={draft.task.name}
                            onChange={(event) => updateWorkMapTask({ name: event.target.value })}
                            aria-invalid={showBanner && validation.errors.some((error) => error.field === 'taskName')}
                            aria-describedby={showBanner && validation.errors.some((error) => error.field === 'taskName') ? 'sop-work-map-task-name-error' : undefined}
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-bold text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {showBanner && validation.errors.some((error) => error.field === 'taskName') && (
                            <span id="sop-work-map-task-name-error" role="alert" className="mt-1 block text-[10px] font-semibold text-rose-600">Task명을 입력하세요.</span>
                        )}
                    </label>
                    <label className="block min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-zinc-500">TASK 정의 (전문)</span>
                        <textarea
                            value={draft.task.description ?? ''}
                            onChange={(event) => updateWorkMapTask({ description: event.target.value })}
                            rows={2}
                            className="mt-1 max-h-24 w-full resize-y overflow-y-auto rounded-lg border border-zinc-300 px-3 py-2 text-xs leading-relaxed text-zinc-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </label>
                    <div className="flex shrink-0 gap-1.5 pt-4">
                        <span className="shrink-0 whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            Activity {activities.length}개
                        </span>
                        <span className="shrink-0 whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                            Skill 관계 {relationCount}개
                        </span>
                    </div>
                </div>
            </section>

            <main className="mx-auto grid w-full min-h-0 max-w-[1440px] flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4 px-6 py-4">
                <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                    <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-2.5">
                        <span className="text-xs font-bold text-zinc-700">Activity 목록 · {activities.length}개</span>
                        <button
                            type="button"
                            onClick={handleAddActivity}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                            <Plus className="h-3 w-3" /> Activity
                        </button>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Activity 목록">
                        {activities.map((activity) => {
                            const isSelected = activity.id === selectedActivityId;
                            return (
                                <li key={activity.id} className="list-none">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedActivityId(activity.id)}
                                        aria-current={isSelected ? 'true' : undefined}
                                        title={activity.description || activity.name}
                                        className={`mb-1 flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                                            isSelected ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-zinc-50'
                                        }`}
                                    >
                                        <span
                                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                                                isSelected ? 'bg-indigo-600 text-white' : 'border border-zinc-300 text-transparent'
                                            }`}
                                        >
                                            <Check className="h-2.5 w-2.5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className={`shrink-0 whitespace-nowrap text-[10px] font-bold ${isSelected ? 'text-indigo-700' : 'text-zinc-500'}`}>
                                                    {formatActivityCode(activity.order)}
                                                </span>
                                                <span className={`truncate text-xs ${isSelected ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-800'}`}>
                                                    {activity.name || '(이름 없음)'}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{activity.description || '설명 없음'}</span>
                                        </span>
                                        <span className="shrink-0 whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">
                                            Skill {activity.skills.length}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </aside>

                <section className="min-h-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                    {selectedActivity ? (
                        <SopWorkMapActivityDetail
                            ref={headingRef}
                            activity={selectedActivity}
                            order={selectedActivity.order ?? selectedIndex + 1}
                            canDelete={activities.length > 1}
                            canMoveUp={selectedIndex > 0}
                            canMoveDown={selectedIndex >= 0 && selectedIndex < activities.length - 1}
                            onUpdateActivity={(patch) => updateWorkMapActivity(selectedActivity.id, patch)}
                            onMoveActivity={(direction) => moveWorkMapActivity(selectedActivity.id, direction)}
                            onDeleteActivity={handleDeleteActivity}
                            onUpdateSkill={(skillId, patch) => updateWorkMapSkill(selectedActivity.id, skillId, patch)}
                            onAddSkill={handleAddSkill}
                            onDeleteSkill={(skillId) => deleteWorkMapSkill(selectedActivity.id, skillId)}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-500">
                            선택된 Activity가 없습니다. 왼쪽에서 &quot;Activity&quot;를 추가해 시작하세요.
                        </div>
                    )}
                </section>
            </main>

            <footer className="z-30 shrink-0 border-t border-zinc-200 bg-white/95 px-6 py-3">
                <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-zinc-500">
                        {draft.confirmed ? (
                            <span className="flex shrink-0 items-center gap-1 font-semibold text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" /> Work Map 검토 완료
                            </span>
                        ) : (
                            <span className="flex shrink-0 items-center gap-1 font-semibold text-amber-600">
                                <AlertCircle className="h-4 w-4" /> Work Map 검토 · 확정 필요
                            </span>
                        )}
                        {showBanner && (
                            <span className="flex min-w-0 items-center gap-1 font-semibold text-rose-600">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span className="truncate">
                                    오류 {validation.errors.length}건 — {validation.errors[0]?.message}
                                </span>
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
                    >
                        검토 완료 · SOP 생성으로 계속 <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </footer>
        </div>
    );
}
