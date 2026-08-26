'use client';

import { forwardRef } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { formatActivityCode } from '@/lib/sop-format';
import type { WorkLibraryActivity, WorkLibrarySkill } from '@/lib/sop-types';

export interface SopWorkMapActivityDetailProps {
    activity: WorkLibraryActivity;
    order: number;
    canDelete: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onUpdateActivity: (patch: { name?: string; description?: string }) => void;
    onMoveActivity: (direction: 'up' | 'down') => void;
    onDeleteActivity: () => void;
    onUpdateSkill: (skillId: string, patch: { name?: string; description?: string }) => void;
    onAddSkill: () => void;
    onDeleteSkill: (skillId: string) => void;
}

/**
 * 상세 Work Map의 detail pane. Foundation controller의 mutation만 호출한다 — 부모
 * (`SopWorkMapDetailedView`)가 Store action을 그대로 주입하고, 이 컴포넌트는 어떤
 * 상태도 스스로 만들지 않는다 (SPEC §3.7 "상세 뷰 전용 필드나 별도 저장 버튼을
 * 만들지 않는다").
 *
 * heading에 `ref`를 그대로 노출하는 이유: Activity 선택이 바뀔 때마다 부모가 이
 * heading으로 focus를 옮겨 screen-reader 문맥을 갱신한다 (05_WAVE1D 디자인 수용
 * 기준 1번 — "목록에서 Activity를 바꾸면 상세 heading으로 문맥이 갱신된다"). 이
 * 컴포넌트 자신은 focus 시점을 모른다 — 부모만이 "선택이 바뀌었다"는 사실을 안다.
 */
export const SopWorkMapActivityDetail = forwardRef<HTMLHeadingElement, SopWorkMapActivityDetailProps>(
    function SopWorkMapActivityDetail(
        { activity, order, canDelete, canMoveUp, canMoveDown, onUpdateActivity, onMoveActivity, onDeleteActivity, onUpdateSkill, onAddSkill, onDeleteSkill },
        headingRef
    ) {
        const activityLabel = activity.name || '이름 없는 Activity';

        return (
            <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 p-4 pb-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                {formatActivityCode(order)}
                            </span>
                            <h2 ref={headingRef} tabIndex={-1} className="truncate text-sm font-bold text-zinc-900 outline-none">
                                {activityLabel}
                            </h2>
                        </div>
                        <p className="mt-0.5 text-[11px] text-zinc-500">선택 Activity 상세 · 이름, 설명, Skill을 편집할 수 있습니다.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onMoveActivity('up')}
                            disabled={!canMoveUp}
                            title="위로 이동"
                            aria-label={`${activityLabel} 위로 이동`}
                            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onMoveActivity('down')}
                            disabled={!canMoveDown}
                            title="아래로 이동"
                            aria-label={`${activityLabel} 아래로 이동`}
                            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onDeleteActivity}
                            disabled={!canDelete}
                            title={canDelete ? undefined : 'Activity는 최소 1개가 필요합니다.'}
                            aria-label={`Activity '${activityLabel}' 삭제`}
                            className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="mx-auto max-w-[760px] space-y-4">
                        <label className="block">
                            <span className="text-[11px] font-bold text-zinc-500">Activity 명</span>
                            <input
                                value={activity.name}
                                onChange={(event) => onUpdateActivity({ name: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </label>

                        <label className="block">
                            <span className="text-[11px] font-bold text-zinc-500">Activity 설명 (전문)</span>
                            <textarea
                                value={activity.description ?? ''}
                                onChange={(event) => onUpdateActivity({ description: event.target.value })}
                                rows={5}
                                className="mt-1 w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-xs leading-relaxed text-zinc-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </label>

                        <div className="border-t border-zinc-100 pt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-zinc-700">연결 Skill · {activity.skills.length}개</h3>
                                <button
                                    type="button"
                                    onClick={onAddSkill}
                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                                >
                                    <Plus className="h-3 w-3" /> Skill 추가
                                </button>
                            </div>

                            {activity.skills.length === 0 ? (
                                <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 text-center text-[11px] text-zinc-500">
                                    연결된 Skill이 없습니다. &quot;Skill 추가&quot;로 새 Skill을 만드세요.
                                </p>
                            ) : (
                                <div className="mt-3 space-y-2">
                                    {activity.skills.map((skill) => (
                                        <SopWorkMapSkillRow
                                            key={skill.id}
                                            skill={skill}
                                            onUpdateSkill={(patch) => onUpdateSkill(skill.id, patch)}
                                            onDeleteSkill={() => onDeleteSkill(skill.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
);

function SopWorkMapSkillRow({
    skill,
    onUpdateSkill,
    onDeleteSkill,
}: {
    skill: WorkLibrarySkill;
    onUpdateSkill: (patch: { name?: string; description?: string }) => void;
    onDeleteSkill: () => void;
}) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_28px] gap-2 rounded-lg border border-zinc-200 p-2.5">
            <div className="min-w-0">
                <label className="block">
                    <span className="sr-only">Skill 명</span>
                    <input
                        value={skill.name}
                        onChange={(event) => onUpdateSkill({ name: event.target.value })}
                        placeholder="Skill 명"
                        className="w-full border-b border-transparent bg-transparent py-0.5 text-xs font-bold text-zinc-900 outline-none focus:border-indigo-500"
                    />
                </label>
                <label className="mt-1 block">
                    <span className="sr-only">Skill 설명</span>
                    <textarea
                        value={skill.description ?? ''}
                        onChange={(event) => onUpdateSkill({ description: event.target.value })}
                        placeholder="Skill 설명"
                        rows={2}
                        className="w-full resize-y rounded bg-transparent text-[11px] leading-relaxed text-zinc-600 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </label>
            </div>
            <button
                type="button"
                onClick={onDeleteSkill}
                aria-label={`Skill '${skill.name || '이름 없음'}' 삭제`}
                className="self-start rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
