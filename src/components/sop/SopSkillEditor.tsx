'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Sparkles, Check, X } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopRequiredSkill, SopStepData } from '@/lib/sop-types';

interface SopSkillEditorProps {
    step: SopStepData;
}

/** The step's required-SKILL list: Work Library selection, AI-suggested accept/reject, custom add. */
export const SopSkillEditor: React.FC<SopSkillEditorProps> = ({ step }) => {
    const readOnly = useSopPrototypeStore((s) => s.customerReviewMode);
    const workLibrary = useSopPrototypeStore((s) => s.workLibrary);
    const acceptAiSkill = useSopPrototypeStore((s) => s.acceptAiSkill);
    const rejectAiSkill = useSopPrototypeStore((s) => s.rejectAiSkill);
    const addSkillToStep = useSopPrototypeStore((s) => s.addSkillToStep);
    const removeSkillFromStep = useSopPrototypeStore((s) => s.removeSkillFromStep);

    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillLevel, setNewSkillLevel] = useState<'basic' | 'intermediate' | 'advanced'>('basic');
    const [newSkillReason, setNewSkillReason] = useState('');
    const [showAddSkill, setShowAddSkill] = useState(false);

    const handleAddCustomSkill = () => {
        if (!newSkillName.trim()) return;
        const skill: SopRequiredSkill = {
            name: newSkillName.trim(),
            requiredLevel: newSkillLevel,
            reason: newSkillReason.trim() || '사용자 추가 역량',
            source: 'work-library',
            accepted: true,
        };
        addSkillToStep(step.id, skill);
        setNewSkillName('');
        setNewSkillReason('');
        setShowAddSkill(false);
    };

    const handleAddWorkLibrarySkill = (wlSkillName: string) => {
        const skill: SopRequiredSkill = {
            name: wlSkillName,
            requiredLevel: 'basic',
            reason: 'Work Library 표준 역량',
            source: 'work-library',
            accepted: true,
        };
        addSkillToStep(step.id, skill);
    };

    return (
        <div className="pt-3 border-t border-zinc-200">
            <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" /> 요구 SKILL ({step.requiredSkills.length})
                </label>
                <button
                    type="button"
                    onClick={() => setShowAddSkill(true)}
                    disabled={readOnly}
                    title={readOnly ? '고객 검토 모드에서는 SKILL을 추가할 수 없습니다.' : undefined}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Plus className="w-3 h-3" /> SKILL 연결
                </button>
            </div>

            <div className="space-y-2">
                {step.requiredSkills.map((sk, idx) => (
                    <div
                        key={idx}
                        className={`p-2.5 rounded-xl border transition-all ${
                            sk.source === 'ai-suggested' && !sk.accepted
                                ? 'bg-amber-50/80 border-amber-300'
                                : 'bg-zinc-50 border-zinc-200'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-zinc-900 text-xs">{sk.name}</span>
                                {sk.source === 'ai-suggested' ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 border border-amber-300">
                                        ★ AI 제안
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                                        Work Library
                                    </span>
                                )}
                                <span className="text-[9px] font-medium text-zinc-500 uppercase">
                                    [{sk.requiredLevel || 'basic'}]
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => removeSkillFromStep(step.id, sk.name)}
                                disabled={readOnly}
                                className="text-zinc-400 hover:text-rose-600 p-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label="SKILL 삭제"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {sk.reason && <p className="text-[10px] text-zinc-500 mb-1.5">이유: {sk.reason}</p>}

                        {/* AI Suggested Accept / Reject Action Bar */}
                        {sk.source === 'ai-suggested' && !sk.accepted && (
                            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-amber-200/80">
                                <button
                                    type="button"
                                    onClick={() => acceptAiSkill(step.id, sk.name)}
                                    disabled={readOnly}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Check className="w-3 h-3" /> 수락
                                </button>
                                <button
                                    type="button"
                                    onClick={() => rejectAiSkill(step.id, sk.name)}
                                    disabled={readOnly}
                                    className="px-2.5 py-1 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold rounded-lg text-[10px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <X className="w-3 h-3" /> 거절
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                {showAddSkill && (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                        <div className="font-semibold text-zinc-900 text-xs">Work Library SKILL에서 선택:</div>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {workLibrary.skills.map((wsk) => (
                                <button
                                    key={wsk.id}
                                    type="button"
                                    onClick={() => handleAddWorkLibrarySkill(wsk.name)}
                                    className="text-[10px] font-medium px-2 py-1 bg-white border border-indigo-300 hover:bg-indigo-100 text-indigo-900 rounded-md"
                                >
                                    + {wsk.name}
                                </button>
                            ))}
                        </div>

                        <div className="font-semibold text-zinc-900 text-xs border-t border-indigo-200 pt-2">
                            새 SKILL 직접 추가:
                        </div>
                        <input
                            type="text"
                            placeholder="SKILL 명칭"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-zinc-300 rounded-lg text-xs"
                        />
                        <input
                            type="text"
                            placeholder="필요 이유"
                            value={newSkillReason}
                            onChange={(e) => setNewSkillReason(e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-zinc-300 rounded-lg text-xs"
                        />
                        <div className="flex items-center justify-between pt-1">
                            <select
                                value={newSkillLevel}
                                onChange={(e) =>
                                    setNewSkillLevel(e.target.value as 'basic' | 'intermediate' | 'advanced')
                                }
                                className="px-2 py-1 bg-white border border-zinc-300 rounded-lg text-xs"
                            >
                                <option value="basic">기초 (Basic)</option>
                                <option value="intermediate">중급 (Intermediate)</option>
                                <option value="advanced">고급 (Advanced)</option>
                            </select>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={handleAddCustomSkill}
                                    className="px-2.5 py-1 bg-indigo-600 text-white font-bold rounded-lg text-xs"
                                >
                                    추가
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddSkill(false)}
                                    className="px-2.5 py-1 text-zinc-600 font-medium rounded-lg text-xs"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
