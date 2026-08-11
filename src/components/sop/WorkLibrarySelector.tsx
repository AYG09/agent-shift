'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Edit3, Plus, Trash2, Layers, Briefcase, Sparkles } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { WorkLibrarySkill } from '@/lib/sop-types';

export const WorkLibrarySelector: React.FC = () => {
    const { workLibrary, setWorkLibrary, confirmWorkLibrary, reopenWorkLibrary } = useSopPrototypeStore();

    const [isEditingTask, setIsEditingTask] = useState(false);
    const [isEditingActivity, setIsEditingActivity] = useState(false);

    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillDesc, setNewSkillDesc] = useState('');
    const [showAddSkill, setShowAddSkill] = useState(false);

    const handleToggleConfirm = () => {
        if (workLibrary.confirmed) {
            reopenWorkLibrary();
        } else {
            confirmWorkLibrary();
        }
    };

    const handleAddSkill = () => {
        if (!newSkillName.trim()) return;
        const newSkill: WorkLibrarySkill = {
            id: `skill-${Date.now()}`,
            name: newSkillName.trim(),
            description: newSkillDesc.trim(),
        };
        setWorkLibrary({ skills: [...workLibrary.skills, newSkill] });
        setNewSkillName('');
        setNewSkillDesc('');
        setShowAddSkill(false);
    };

    const handleRemoveSkill = (skillId: string) => {
        setWorkLibrary({
            skills: workLibrary.skills.filter((s) => s.id !== skillId),
        });
    };

    const handleUpdateSkill = (skillId: string, name: string, description?: string) => {
        setWorkLibrary({
            skills: workLibrary.skills.map((s) => (s.id === skillId ? { ...s, name, description } : s)),
        });
    };

    return (
        <div
            className={`p-6 rounded-2xl border transition-all ${
                workLibrary.confirmed
                    ? 'bg-emerald-50/40 border-emerald-200/80 shadow-sm'
                    : 'bg-white border-zinc-200/80 shadow-sm'
            }`}
        >
            {/* Header / Status Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            workLibrary.confirmed ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'
                        }`}
                    >
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                            2. Work Library Data 검토 및 확정
                            {workLibrary.confirmed ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> 확정됨
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    <AlertCircle className="w-3.5 h-3.5" /> 검토 및 확정 필요
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            SOP 생성의 기준이 될 Task, Activity, 표준 SKILL을 검토하고 &apos;검토 완료 · 확정&apos;을 완료해 주세요. (내용 변경 시 재확정 필요)
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleToggleConfirm}
                    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                        workLibrary.confirmed
                            ? 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                >
                    {workLibrary.confirmed ? (
                        <>
                            <CheckCircle2 className="w-4 h-4" /> 검토 재개 (미확정 전환)
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="w-4 h-4" /> 검토 완료 · 확정
                        </>
                    )}
                </button>
            </div>

            {/* SOP Generation Scope Segmented Control */}
            <div className="mb-6 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        SOP 생성 기준 단위
                    </label>
                    <div className="inline-flex p-1 bg-zinc-200/80 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setWorkLibrary({ sourceType: 'task' })}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                workLibrary.sourceType === 'task'
                                    ? 'bg-white text-zinc-900 shadow-sm'
                                    : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                        >
                            Task 전체 (End-to-End)
                        </button>
                        <button
                            type="button"
                            onClick={() => setWorkLibrary({ sourceType: 'activity' })}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                workLibrary.sourceType === 'activity'
                                    ? 'bg-white text-zinc-900 shadow-sm'
                                    : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                        >
                            특정 Activity (상세 SOP)
                        </button>
                    </div>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                    {workLibrary.sourceType === 'task'
                        ? '선택한 Task 전체 흐름과 하위 Activity를 포함한 End-to-End SOP를 생성합니다.'
                        : '선택한 특정 Activity 단위의 세부 수행절차 중심 상세 SOP를 생성합니다.'}
                </p>
            </div>

            {/* Task & Activity Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Task Card */}
                <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 text-indigo-500" /> Task
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsEditingTask(!isEditingTask)}
                            className="text-xs text-zinc-500 hover:text-indigo-600 flex items-center gap-1"
                        >
                            <Edit3 className="w-3 h-3" /> {isEditingTask ? '완료' : '수정'}
                        </button>
                    </div>
                    {isEditingTask ? (
                        <input
                            type="text"
                            value={workLibrary.taskName}
                            onChange={(e) => setWorkLibrary({ taskName: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-zinc-900 font-medium"
                        />
                    ) : (
                        <h3 className="text-base font-semibold text-zinc-900">{workLibrary.taskName}</h3>
                    )}
                </div>

                {/* Activity Card */}
                <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-emerald-500" /> Activity
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsEditingActivity(!isEditingActivity)}
                            className="text-xs text-zinc-500 hover:text-indigo-600 flex items-center gap-1"
                        >
                            <Edit3 className="w-3 h-3" /> {isEditingActivity ? '완료' : '수정'}
                        </button>
                    </div>
                    {isEditingActivity ? (
                        <input
                            type="text"
                            value={workLibrary.activityName || ''}
                            onChange={(e) => setWorkLibrary({ activityName: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-zinc-900 font-medium"
                        />
                    ) : (
                        <h3 className="text-base font-semibold text-zinc-900">
                            {workLibrary.activityName || 'Activity를 입력하세요'}
                        </h3>
                    )}
                </div>
            </div>

            {/* Connected Skills List */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                        연결된 Work Library SKILL ({workLibrary.skills.length})
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowAddSkill(true)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                    >
                        <Plus className="w-3.5 h-3.5" /> SKILL 추가
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {workLibrary.skills.map((skill) => (
                        <div
                            key={skill.id}
                            className="p-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-all flex items-start justify-between gap-2 shadow-2xs"
                        >
                            <div className="flex-1 min-w-0">
                                <input
                                    type="text"
                                    value={skill.name}
                                    onChange={(e) => handleUpdateSkill(skill.id, e.target.value, skill.description)}
                                    className="w-full text-xs font-semibold text-zinc-900 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-indigo-500 focus:bg-white px-1 py-0.5 focus:outline-hidden"
                                />
                                <input
                                    type="text"
                                    value={skill.description || ''}
                                    placeholder="SKILL 설명을 입력하세요"
                                    onChange={(e) => handleUpdateSkill(skill.id, skill.name, e.target.value)}
                                    className="w-full text-[11px] text-zinc-500 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-indigo-500 focus:bg-white px-1 py-0.5 focus:outline-hidden mt-0.5"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRemoveSkill(skill.id)}
                                className="text-zinc-400 hover:text-rose-500 p-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>

                {showAddSkill && (
                    <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-center gap-2">
                        <input
                            type="text"
                            placeholder="SKILL 이름 (예: 채용 기준 수립)"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-900"
                        />
                        <input
                            type="text"
                            placeholder="SKILL 설명 (선택)"
                            value={newSkillDesc}
                            onChange={(e) => setNewSkillDesc(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-900"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleAddSkill}
                                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                저장
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAddSkill(false)}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
