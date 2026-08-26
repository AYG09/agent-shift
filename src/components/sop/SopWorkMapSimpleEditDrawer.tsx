'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { selectWorkMapActivity, type MemberWorkMapDraft } from '@/lib/sop-work-map-draft';

/**
 * 간소화/상세 두 화면이 공유할 "전체 필드 편집" drawer. 화면에는 최소 정보만
 * 두고 여기서 Task 또는 Activity(+ 그 Skill 전체)를 편집한다 (SPEC §3.6).
 *
 * 모든 편집은 Foundation Store action만 호출한다 — 이 파일 안에 별도 mutation
 * 사본이나 로컬 편집 상태를 만들지 않는다. 각 입력의 value는 매 렌더마다
 * Store에서 다시 읽으므로, 상세 화면에서 같은 값을 고치면 다음 렌더에 즉시
 * 반영된다(TST-WM-004와 동일한 "같은 초안" 불변식).
 */
export type SopWorkMapEditTarget = { kind: 'task' } | { kind: 'activity'; activityId: string };

interface SopWorkMapSimpleEditDrawerProps {
    target: SopWorkMapEditTarget | null;
    onClose: () => void;
}

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 최소 수동 focus trap. Radix 같은 portal 기반 dialog는 이 저장소의 테스트
 * 하네스(react-test-renderer, jsdom 없음)에서 마운트를 검증할 수 없어서
 * 피했다 — 대신 컨테이너 안의 실제 포커스 가능 요소를 순회하는 표준 패턴을
 * 직접 구현한다. 초기 포커스, Tab 순환, Escape, 닫힌 뒤 트리거로 포커스
 * 복귀를 모두 이 하나의 effect가 책임진다.
 */
function useDrawerFocusTrap(
    open: boolean,
    containerRef: React.RefObject<HTMLDivElement | null>,
    initialFocusRef: React.RefObject<HTMLElement | null>,
    onClose: () => void
) {
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        // This repository's component tests run react-test-renderer without jsdom
        // (see tests/sop-readonly-inspectors.test.tsx) — there is no real `document`.
        // Skipping imperative DOM work there (rather than crashing) mirrors the
        // existing `typeof window === 'undefined'` guard in sop-draft-storage.ts.
        if (typeof document === 'undefined') return;
        previouslyFocused.current = document.activeElement as HTMLElement | null;

        const container = containerRef.current;
        const focusables = () => Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
        // Prefer the drawer's primary field (name input) over "whatever is
        // first in DOM order" — the header's close button happens to come
        // first in markup, and landing focus there first is a poor default.
        const first = initialFocusRef.current ?? focusables()[0];
        first?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusables();
            if (items.length === 0) return;
            const currentIndex = items.indexOf(document.activeElement as HTMLElement);
            if (event.shiftKey) {
                if (currentIndex <= 0) {
                    event.preventDefault();
                    items[items.length - 1].focus();
                }
            } else if (currentIndex === items.length - 1 || currentIndex === -1) {
                event.preventDefault();
                items[0].focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused.current?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
}

function SkillRow({ draft, activityId, skillId }: { draft: MemberWorkMapDraft; activityId: string; skillId: string }) {
    const updateWorkMapSkill = useSopPrototypeStore((s) => s.updateWorkMapSkill);
    const deleteWorkMapSkill = useSopPrototypeStore((s) => s.deleteWorkMapSkill);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const activity = selectWorkMapActivity(draft, activityId);
    const skill = activity?.skills.find((item) => item.id === skillId);
    if (!skill) return null;

    return (
        <div className="rounded-lg border border-zinc-200 p-2.5">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <label className="block">
                        <span className="sr-only">Skill명</span>
                        <input
                            value={skill.name}
                            onChange={(event) => updateWorkMapSkill(activityId, skillId, { name: event.target.value })}
                            placeholder="Skill명"
                            className="w-full border-b border-zinc-200 py-1 text-xs font-semibold text-zinc-900 outline-none focus:border-indigo-500"
                        />
                    </label>
                    <label className="block">
                        <span className="sr-only">Skill 설명</span>
                        <textarea
                            value={skill.description ?? ''}
                            onChange={(event) => updateWorkMapSkill(activityId, skillId, { description: event.target.value })}
                            placeholder="Skill 설명"
                            rows={2}
                            className="w-full resize-none rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 outline-none focus:border-indigo-400"
                        />
                    </label>
                </div>
                {!confirmingDelete ? (
                    <button
                        type="button"
                        aria-label="Skill 삭제"
                        onClick={() => setConfirmingDelete(true)}
                        className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                ) : null}
            </div>
            {confirmingDelete && (
                <div className="mt-2 flex items-center justify-between rounded-md bg-rose-50 px-2 py-1.5">
                    <span className="text-[10px] font-semibold text-rose-700">
                        {skill.name || '이름 없는 Skill'} 삭제 확인
                    </span>
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(false)}
                            className="rounded px-2 py-1 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-100"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteWorkMapSkill(activityId, skillId)}
                            className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700"
                        >
                            삭제
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export const SopWorkMapSimpleEditDrawer: React.FC<SopWorkMapSimpleEditDrawerProps> = ({ target, onClose }) => {
    const draft = useSopPrototypeStore((s) => s.workMapDraft);
    const updateWorkMapTask = useSopPrototypeStore((s) => s.updateWorkMapTask);
    const updateWorkMapActivity = useSopPrototypeStore((s) => s.updateWorkMapActivity);
    const addWorkMapSkill = useSopPrototypeStore((s) => s.addWorkMapSkill);

    const containerRef = useRef<HTMLDivElement>(null);
    const initialFocusRef = useRef<HTMLInputElement>(null);
    const open = target !== null && draft !== null;
    useDrawerFocusTrap(open, containerRef, initialFocusRef, onClose);

    if (!open || !draft) return null;

    const activity = target.kind === 'activity' ? selectWorkMapActivity(draft, target.activityId) : undefined;
    if (target.kind === 'activity' && !activity) return null;

    const titleId = 'sop-work-map-drawer-title';

    return (
        <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-zinc-200 bg-white shadow-2xl"
            >
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
                    <h2 id={titleId} className="truncate text-sm font-bold text-zinc-900">
                        {target.kind === 'task' ? 'Task 정보 편집' : `Activity 편집 — ${activity!.name || '이름 없음'}`}
                    </h2>
                    <button
                        type="button"
                        aria-label="편집 닫기"
                        onClick={onClose}
                        className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {target.kind === 'task' ? (
                        <div className="space-y-3">
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Task명</span>
                                <input
                                    ref={initialFocusRef}
                                    value={draft.task.name}
                                    onChange={(event) => updateWorkMapTask({ name: event.target.value })}
                                    className="w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Task 정의</span>
                                <textarea
                                    value={draft.task.description ?? ''}
                                    onChange={(event) => updateWorkMapTask({ description: event.target.value })}
                                    rows={4}
                                    className="w-full resize-none rounded-lg border border-zinc-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                                />
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Activity명</span>
                                <input
                                    ref={initialFocusRef}
                                    value={activity!.name}
                                    onChange={(event) => updateWorkMapActivity(activity!.id, { name: event.target.value })}
                                    className="w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-zinc-600">설명 (전체 원문)</span>
                                <textarea
                                    value={activity!.description ?? ''}
                                    onChange={(event) => updateWorkMapActivity(activity!.id, { description: event.target.value })}
                                    rows={4}
                                    className="w-full resize-none rounded-lg border border-zinc-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                                />
                            </label>
                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-zinc-600">Skill ({activity!.skills.length})</span>
                                    <button
                                        type="button"
                                        onClick={() => addWorkMapSkill(activity!.id)}
                                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                                    >
                                        <Plus className="h-3 w-3" /> Skill 추가
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {activity!.skills.map((skill) => (
                                        <SkillRow key={skill.id} draft={draft} activityId={activity!.id} skillId={skill.id} />
                                    ))}
                                    {activity!.skills.length === 0 && (
                                        <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-center text-[11px] text-zinc-400">
                                            연결된 Skill이 없습니다.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 px-5 py-3">
                    <span className="text-[10px] text-zinc-400">변경 내용은 즉시 반영됩니다.</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};
