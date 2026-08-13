'use client';

import React, { useState } from 'react';
import {
    LayoutDashboard,
    ListOrdered,
    Sparkles,
    CheckSquare,
    Search,
    ChevronDown,
} from 'lucide-react';
import type { SopStepData } from '@/lib/sop-types';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SOP_REVIEW_STATUS_BADGE_CLASS } from '@/lib/sop-review-status-meta';

interface SopSidebarProps {
    showMiniMap: boolean;
    setShowMiniMap: (val: boolean) => void;
    showBranchLabels: boolean;
    setShowBranchLabels: (val: boolean) => void;
}

type TabType = 'overview' | 'steps' | 'skills' | 'display' | 'review';

export const SopSidebar: React.FC<SopSidebarProps> = ({
    showMiniMap,
    setShowMiniMap,
    showBranchLabels,
    setShowBranchLabels,
}) => {
    const {
        document,
        selectedStepId,
        selectStep,
        selectSourceActivity,
        selectedSourceActivityId,
        customerReviewMode: readOnly,
    } = useSopPrototypeStore();

    const [activeTab, setActiveTab] = useState<TabType>('steps');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUnreviewedOnly, setFilterUnreviewedOnly] = useState(false);
    // 접힌 Activity 그룹 id 집합 — 목록 밀도 개선의 핵심. 기본은 모두 펼침이며,
    // 구성원이 그룹 단위로 접어 원하는 Activity에 집중할 수 있다.
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const toggleGroup = (groupId: string) =>
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });

    if (!document) return null;

    const totalSteps = document.steps.length;
    const reviewedCount = document.steps.filter((s) => s.reviewStatus !== 'ai-draft').length;
    const progressPercent = totalSteps > 0 ? Math.round((reviewedCount / totalSteps) * 100) : 0;

    // Collect all skills across steps
    const allSkillsMap = new Map<
        string,
        { name: string; source: 'work-library' | 'ai-suggested'; count: number; accepted: boolean; steps: string[] }
    >();

    document.steps.forEach((step) => {
        step.requiredSkills.forEach((sk) => {
            const existing = allSkillsMap.get(sk.name);
            if (existing) {
                existing.count += 1;
                existing.steps.push(step.title);
            } else {
                allSkillsMap.set(sk.name, {
                    name: sk.name,
                    source: sk.source,
                    count: 1,
                    accepted: sk.accepted,
                    steps: [step.title],
                });
            }
        });
    });

    const allSkillsList = Array.from(allSkillsMap.values());
    const aiSuggestedPendingSkills = allSkillsList.filter((s) => s.source === 'ai-suggested' && !s.accepted);
    const selectedTask = document.workLibrary.taskCatalog.find((task) => task.id === document.workLibrary.taskId);
    const sourceActivities = [...(selectedTask?.activities ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    const coveredActivityIds = new Set(document.steps.flatMap((step) => step.sourceActivityIds ?? []));

    // Filtered steps
    const filteredSteps = document.steps.filter((step) => {
        const matchesSearch = step.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesUnreviewed = filterUnreviewedOnly ? step.reviewStatus === 'ai-draft' : true;
        return matchesSearch && matchesUnreviewed;
    });

    // Activity–Sub Action 문서의 단계 목록은 캔버스의 그룹 컨테이너와 같은 기준
    // (primary Activity)으로 묶어 보여준다 — 30개 안팎의 평평한 목록은 스캔이
    // 불가능하다는 고객 피드백의 직접 대응. terminal·미매핑 단계는 어떤 Activity
    // 그룹에도 속하지 않으므로 문서 순서 그대로 그룹 밖 단독 행으로 표시한다.
    const isSubActionStructure = document.structureVersion === 'activity-subaction-v1';
    type StepGroup =
        | { kind: 'solo'; step: SopStepData }
        | { kind: 'activity'; activityId: string; order: number; name: string; steps: SopStepData[] };
    const stepGroups: StepGroup[] = [];
    if (isSubActionStructure) {
        const activityMeta = new Map(sourceActivities.map((activity, index) => [activity.id, { order: activity.order ?? index + 1, name: activity.name }]));
        filteredSteps.forEach((step) => {
            const activityId = !step.terminalType ? step.sourceActivityIds?.[0] : undefined;
            const meta = activityId ? activityMeta.get(activityId) : undefined;
            if (!activityId || !meta) {
                stepGroups.push({ kind: 'solo', step });
                return;
            }
            const last = stepGroups[stepGroups.length - 1];
            if (last && last.kind === 'activity' && last.activityId === activityId) last.steps.push(step);
            else stepGroups.push({ kind: 'activity', activityId, order: meta.order, name: meta.name, steps: [step] });
        });
    }

    return (
        <div className="h-full flex flex-col bg-white border-r border-zinc-200 w-72 shrink-0 select-none">
            {readOnly && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border-b border-indigo-100 text-center">
                    고객 검토 모드 · 열람 전용
                </div>
            )}
            {/* Sidebar Tabs — search/filter/display toggles here are local view state,
                not document edits, so they stay usable in customer review mode. */}
            <div className="flex items-center border-b border-zinc-200 bg-zinc-50/70 p-1">
                {[
                    { id: 'overview' as const, icon: LayoutDashboard, title: '개요' },
                    { id: 'steps' as const, icon: ListOrdered, title: '단계' },
                    { id: 'skills' as const, icon: Sparkles, title: 'SKILL' },
                    { id: 'display' as const, icon: LayoutDashboard, title: '보기' },
                    { id: 'review' as const, icon: CheckSquare, title: '검토' },
                ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-2 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold transition-all ${
                                activeTab === tab.id
                                    ? 'bg-white text-indigo-600 shadow-2xs'
                                    : 'text-zinc-500 hover:text-zinc-900'
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {tab.title}
                        </button>
                    );
                })}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 text-xs">
                {/* 1. SOP 개요 */}
                {activeTab === 'overview' && (
                    <div className="space-y-4">
                        <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">
                                대상 Task / Activity
                            </span>
                            <h4 className="font-bold text-zinc-900 text-xs mb-0.5">{document.workLibrary.taskName}</h4>
                            <p className="text-[11px] text-zinc-600">{document.workLibrary.jobName || document.member.jobRole} · {document.workLibrary.sourceType === 'task' ? 'Task 전체' : document.workLibrary.activityName || '선택 Activity'}</p>
                            {selectedTask?.description && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{selectedTask.description}</p>}
                        </div>

                        <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">
                                담당 구성원
                            </span>
                            <p className="font-bold text-zinc-900 text-xs">
                                {document.member.name} ({document.member.jobRole})
                            </p>
                            <p className="text-[11px] text-zinc-500">{document.member.organization || '소속 팀'}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-xl">
                                <span className="text-[10px] text-indigo-700 font-semibold block">총 단계 수</span>
                                <span className="text-base font-bold text-indigo-900">{totalSteps} 개</span>
                            </div>

                            <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                                <span className="text-[10px] text-emerald-700 font-semibold block">검토 진행률</span>
                                <span className="text-base font-bold text-emerald-900">{progressPercent}%</span>
                            </div>
                        </div>

                        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-violet-800">{document.structureVersion === 'activity-subaction-v1' ? 'Activity별 Sub Action' : 'Activity 반영률'}</span>
                                <span className="text-sm font-bold text-violet-900">{coveredActivityIds.size}/{sourceActivities.length}</span>
                            </div>
                            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{sourceActivities.map((activity) => {
                                const mappedSteps = document.steps
                                    .filter((step) => step.sourceActivityIds?.includes(activity.id))
                                    .sort((left, right) => (left.subActionOrder ?? 0) - (right.subActionOrder ?? 0));
                                const active = selectedSourceActivityId === activity.id;
                                return (
                                    <div key={activity.id} className="rounded-md">
                                        <button type="button" onClick={() => selectSourceActivity(active ? null : activity.id)} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] ${active ? 'bg-violet-200 text-violet-950' : 'hover:bg-white text-zinc-700'}`}>
                                            <span className="font-bold text-violet-700">A{String(activity.order ?? 0).padStart(2, '0')}</span>
                                            <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                                            <span className="text-[10px]">{mappedSteps.length}개</span>
                                        </button>
                                        {active && mappedSteps.length > 0 && (
                                            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-violet-200 pl-2">
                                                {mappedSteps.map((step) => (
                                                    <button key={step.id} type="button" onClick={() => selectStep(step.id)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ${step.id === selectedStepId ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'text-zinc-600 hover:bg-white'}`}>
                                                        {step.subActionOrder !== undefined ? `#${step.subActionOrder} ` : ''}{step.title}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}</div>
                        </div>

                        <div>
                            <span className="text-[10px] font-semibold text-zinc-500 block mb-1">업무 맥락</span>
                            <p className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] text-zinc-700 leading-relaxed max-h-36 overflow-y-auto">
                                {document.context || '설정된 업무 맥락이 없습니다.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* 2. 단계 목록 */}
                {activeTab === 'steps' && (
                    <div className="space-y-3">
                        {/* Search & Filter */}
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                                <input
                                    type="text"
                                    placeholder="단계 검색..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs"
                                />
                            </div>

                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={filterUnreviewedOnly}
                                    onChange={(e) => setFilterUnreviewedOnly(e.target.checked)}
                                    className="w-3.5 h-3.5 text-indigo-600 rounded-sm"
                                />
                                미검토 단계만 보기 ({document.steps.filter((s) => s.reviewStatus === 'ai-draft').length})
                            </label>
                        </div>

                        {/* Step items — Activity 그룹 아코디언(신규 구조) 또는 평면 목록(레거시).
                            상태 배지는 shrink-0 + nowrap으로 고정해 "초 안"처럼 글자가
                            꺾여 렌더링되는 파손을 차단한다. */}
                        {(() => {
                            const renderStepRow = (step: SopStepData) => {
                                const realIndex = document.steps.findIndex((s) => s.id === step.id);
                                const isSelected = step.id === selectedStepId;
                                return (
                                    <div
                                        key={step.id}
                                        onClick={() => selectStep(step.id)}
                                        className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition-all ${
                                            isSelected
                                                ? 'bg-indigo-50 border-indigo-400 shadow-2xs'
                                                : 'bg-white border-zinc-200 hover:border-zinc-300'
                                        }`}
                                    >
                                        <span className="shrink-0 whitespace-nowrap rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                                            {String(realIndex + 1).padStart(2, '0')}
                                        </span>
                                        {isSubActionStructure && step.subActionOrder !== undefined && (
                                            <span className="shrink-0 whitespace-nowrap rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-700">#{step.subActionOrder}</span>
                                        )}
                                        <span className="min-w-0 flex-1 truncate font-semibold text-zinc-900" title={step.title}>{step.title}</span>
                                        {step.terminalType && (
                                            <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold ${step.terminalType === 'start' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                                {step.terminalType === 'start' ? '시작' : '종료'}
                                            </span>
                                        )}
                                        <span
                                            className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                                step.reviewStatus === 'confirmed'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : step.reviewStatus === 'reviewed'
                                                    ? 'bg-blue-100 text-blue-800'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}
                                        >
                                            {step.reviewStatus === 'confirmed' ? '확정' : step.reviewStatus === 'reviewed' ? '검토됨' : '초안'}
                                        </span>
                                    </div>
                                );
                            };

                            if (!isSubActionStructure) {
                                return <div className="space-y-1.5">{filteredSteps.map(renderStepRow)}</div>;
                            }

                            return (
                                <div className="space-y-2">
                                    {stepGroups.map((group) => {
                                        if (group.kind === 'solo') return renderStepRow(group.step);
                                        const groupKey = `${group.activityId}`;
                                        const collapsed = collapsedGroups.has(groupKey);
                                        const reviewedInGroup = group.steps.filter((s) => s.reviewStatus !== 'ai-draft').length;
                                        return (
                                            <div key={groupKey} className="rounded-xl border border-violet-200/80 bg-violet-50/40">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(groupKey)}
                                                    aria-expanded={!collapsed}
                                                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-violet-100/60"
                                                >
                                                    <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-violet-700">
                                                        A{String(group.order).padStart(2, '0')}
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-800" title={group.name}>{group.name}</span>
                                                    <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold ${reviewedInGroup === group.steps.length ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-zinc-500 border border-zinc-200'}`}>
                                                        {reviewedInGroup}/{group.steps.length} 검토
                                                    </span>
                                                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-violet-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                                                </button>
                                                {!collapsed && <div className="space-y-1.5 px-2 pb-2">{group.steps.map(renderStepRow)}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* 3. 요구 SKILL */}
                {activeTab === 'skills' && (
                    <div className="space-y-3">
                        <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl">
                            <span className="text-[10px] font-bold text-indigo-900 block mb-1">
                                SOP 사용 SKILL 총 {allSkillsList.length}개
                            </span>
                            <p className="text-[11px] text-indigo-700">
                                Task Library SKILL: {allSkillsList.filter((s) => s.source === 'work-library').length}개 | AI
                                제안: {allSkillsList.filter((s) => s.source === 'ai-suggested').length}개
                            </p>
                        </div>

                        <div className="space-y-2">
                            {allSkillsList.map((skill, i) => (
                                <div key={i} className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-bold text-zinc-900">{skill.name}</span>
                                        <span className="text-[10px] font-semibold text-zinc-500">
                                            연결 {skill.count}개 단계
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px]">
                                        {skill.source === 'ai-suggested' ? (
                                            <span className="text-amber-800 font-bold bg-amber-100 px-1.5 py-0.2 rounded">
                                                ★ AI 제안 {!skill.accepted ? '(미수락)' : '(수락됨)'}
                                            </span>
                                        ) : (
                                            <span className="text-indigo-800 font-medium bg-indigo-100 px-1.5 py-0.2 rounded">
                                                Task Library
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. 표시 설정 */}
                {activeTab === 'display' && (
                    <div className="space-y-4">
                        <div className="pt-3 border-t border-zinc-200 space-y-2">
                            <label className="flex items-center justify-between text-xs font-semibold text-zinc-800">
                                <span>미니맵 렌더링</span>
                                <input
                                    type="checkbox"
                                    checked={showMiniMap}
                                    onChange={(e) => setShowMiniMap(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 rounded-sm"
                                />
                            </label>

                            <label className="flex items-center justify-between text-xs font-semibold text-zinc-800">
                                <span>분기 라벨 (YES/NO) 표시</span>
                                <input
                                    type="checkbox"
                                    checked={showBranchLabels}
                                    onChange={(e) => setShowBranchLabels(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 rounded-sm"
                                />
                            </label>
                        </div>
                    </div>
                )}

                {/* 5. 검토 상태 */}
                {activeTab === 'review' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center">
                            <span className="text-xs font-semibold text-zinc-500 block mb-1">전체 SOP 상태</span>
                            <span
                                className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${SOP_REVIEW_STATUS_BADGE_CLASS[document.reviewStatus]}`}
                            >
                                {document.reviewStatus === 'confirmed'
                                    ? 'SOP 확정 완료'
                                    : document.reviewStatus === 'reviewed'
                                    ? '전체 검토 완료'
                                    : 'AI 초안 검토 중'}
                            </span>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <span className="font-semibold text-emerald-900">확정/검토 완료 단계</span>
                                <span className="font-bold text-emerald-700">{reviewedCount} 개</span>
                            </div>

                            <div className="flex items-center justify-between p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                                <span className="font-semibold text-amber-900">미검토 초안 단계</span>
                                <span className="font-bold text-amber-700">{totalSteps - reviewedCount} 개</span>
                            </div>

                            <div className="flex items-center justify-between p-2.5 bg-purple-50 border border-purple-200 rounded-xl">
                                <span className="font-semibold text-purple-900">미수락 AI 제안 SKILL</span>
                                <span className="font-bold text-purple-700">{aiSuggestedPendingSkills.length} 개</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
