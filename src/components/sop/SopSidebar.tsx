'use client';

import React, { useState } from 'react';
import {
    LayoutDashboard,
    ListOrdered,
    Sparkles,
    Sliders,
    CheckSquare,
    Search,
} from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopDisplayMode } from '@/lib/sop-types';

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
        displayMode,
        setDisplayMode,
    } = useSopPrototypeStore();

    const [activeTab, setActiveTab] = useState<TabType>('steps');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUnreviewedOnly, setFilterUnreviewedOnly] = useState(false);

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

    // Filtered steps
    const filteredSteps = document.steps.filter((step) => {
        const matchesSearch = step.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesUnreviewed = filterUnreviewedOnly ? step.reviewStatus === 'ai-draft' : true;
        return matchesSearch && matchesUnreviewed;
    });

    return (
        <div className="h-full flex flex-col bg-white border-r border-zinc-200 w-72 shrink-0 select-none">
            {/* Sidebar Tabs */}
            <div className="flex items-center border-b border-zinc-200 bg-zinc-50/70 p-1">
                {[
                    { id: 'overview' as const, icon: LayoutDashboard, title: '개요' },
                    { id: 'steps' as const, icon: ListOrdered, title: '단계' },
                    { id: 'skills' as const, icon: Sparkles, title: 'SKILL' },
                    { id: 'display' as const, icon: Sliders, title: '표시' },
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
                            <p className="text-[11px] text-zinc-600">
                                {document.workLibrary.activityName || '전체 Activity'}
                            </p>
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

                        {/* Step items */}
                        <div className="space-y-1.5">
                            {filteredSteps.map((step) => {
                                const realIndex = document.steps.findIndex((s) => s.id === step.id);
                                const isSelected = step.id === selectedStepId;
                                return (
                                    <div
                                        key={step.id}
                                        onClick={() => selectStep(step.id)}
                                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                            isSelected
                                                ? 'bg-indigo-50 border-indigo-400 shadow-2xs'
                                                : 'bg-white border-zinc-200 hover:border-zinc-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 shrink-0">
                                                {String(realIndex + 1).padStart(2, '0')}
                                            </span>
                                            <span className="font-semibold text-zinc-900 truncate">{step.title}</span>
                                        </div>

                                        <div>
                                            {step.reviewStatus === 'confirmed' ? (
                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                                    확정
                                                </span>
                                            ) : step.reviewStatus === 'reviewed' ? (
                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                                                    검토됨
                                                </span>
                                            ) : (
                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                                    초안
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
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
                                Work Library SKILL: {allSkillsList.filter((s) => s.source === 'work-library').length}개 | AI
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
                                                Work Library
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
                        <div>
                            <label className="block font-semibold text-zinc-900 mb-2">표시 밀도 모드</label>
                            <div className="space-y-1.5">
                                {[
                                    { id: 'compact' as SopDisplayMode, label: '단계명 중심 (Compact)' },
                                    { id: 'standard' as SopDisplayMode, label: '단계명 + 개요 (Standard)' },
                                    { id: 'detailed' as SopDisplayMode, label: '단계명 + 개요 + SKILL (Detailed)' },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setDisplayMode(mode.id)}
                                        className={`w-full p-2.5 rounded-xl border text-left font-medium transition-all ${
                                            displayMode === mode.id
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                                        }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>

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
                                className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                    document.reviewStatus === 'confirmed'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : document.reviewStatus === 'reviewed'
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
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
