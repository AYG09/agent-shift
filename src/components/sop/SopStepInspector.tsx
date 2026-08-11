'use client';

import React, { useState } from 'react';
import {
    CheckCircle2,
    X,
    Plus,
    Trash2,
    Sparkles,
    Check,
    Clock,
    User,
    Wrench,
    Layers,
    GitCommit,
    AlertCircle,
} from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { FLOW_SHAPE_IDS, FLOW_SHAPES, FlowShape } from '@/lib/flow-shapes';
import { SopRequiredSkill, SopReviewStatus } from '@/lib/sop-types';
import { validateSopDecisionBranches, classifySopStepType, normalizeStepShapeChange } from '@/lib/graph-validation';

export const SopStepInspector: React.FC = () => {
    const {
        document,
        selectedStepId,
        selectedEdgeId,
        selectStep,
        selectEdge,
        updateStep,
        updateEdge,
        deleteEdge,
        deleteStep,
        duplicateStep,
        acceptAiSkill,
        rejectAiSkill,
        addSkillToStep,
        removeSkillFromStep,
        updateStepReviewStatus,
        workLibrary,
    } = useSopPrototypeStore();

    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillLevel, setNewSkillLevel] = useState<'basic' | 'intermediate' | 'advanced'>('basic');
    const [newSkillReason, setNewSkillReason] = useState('');
    const [showAddSkill, setShowAddSkill] = useState(false);
    const [structureNotice, setStructureNotice] = useState<string | null>(null);

    if (!document) return null;

    // Edge Inspector View (Item 4 Requirement)
    if (selectedEdgeId) {
        const edgeIndex = document.edges.findIndex((e) => e.id === selectedEdgeId);
        const edge = document.edges[edgeIndex];

        if (!edge) {
            return (
                <div className="h-full p-6 flex flex-col items-center justify-center text-center text-zinc-400 bg-white border-l border-zinc-200">
                    <p className="text-sm font-medium text-zinc-600">선택된 연결선이 없습니다.</p>
                </div>
            );
        }

        const sourceStep = document.steps.find((s) => s.id === edge.source);
        const targetStep = document.steps.find((s) => s.id === edge.target);

        // Check for decision outgoing branch warnings - 서버(graph-validation.ts)와 완전히 동일한
        // 규칙을 재사용한다. YES/NO만 강제하던 예전 하드코딩 로직은 다중 condition 분기를 모두
        // 오류로 잘못 표시했었다.
        const isSourceDecision = sourceStep ? classifySopStepType(sourceStep) === 'decision' : false;
        const decisionBranchIssues = isSourceDecision
            ? validateSopDecisionBranches(
                  document.steps.map((s) => ({
                      id: s.id,
                      type: classifySopStepType(s),
                      terminalType: s.terminalType,
                      shape: s.shape,
                  })),
                  document.edges
              ).filter((issue) => issue.nodeId === edge.source)
            : [];
        const isBranchWarning = decisionBranchIssues.length > 0;

        return (
            <div className="h-full flex flex-col bg-white border-l border-zinc-200 overflow-y-auto">
                {/* Header */}
                <div className="p-4 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-20">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                            <GitCommit className="w-3.5 h-3.5 text-indigo-600" /> 연결선 #{edgeIndex + 1}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => selectEdge(null)}
                        className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg hover:bg-zinc-100"
                        aria-label="연결선 편집 닫기"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Form Fields */}
                <div className="p-5 space-y-5 text-xs text-zinc-700">
                    {/* Source -> Target Info */}
                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">출발 노드</span>
                            <span className="font-semibold text-zinc-900">{sourceStep?.title || edge.source}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-200">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">도착 노드</span>
                            <span className="font-semibold text-zinc-900">{targetStep?.title || edge.target}</span>
                        </div>
                    </div>

                    {/* Decision Branch Warning */}
                    {isBranchWarning && (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-1">
                            <div className="font-bold flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> 판단 분기 경고
                            </div>
                            {decisionBranchIssues.map((issue, idx) => (
                                <p key={idx} className="text-[11px] text-amber-800 leading-tight">
                                    {issue.message}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Label Input */}
                    <div>
                        <label className="block font-semibold text-zinc-900 mb-1">연결선 라벨 (Label)</label>
                        <input
                            type="text"
                            value={edge.label || ''}
                            onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
                            placeholder="예: YES, NO, 합격, 되돌아감"
                            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* Branch Type Selector - decision 노드에서 출발하는 edge는 'default'(일반 순차
                        연결)를 정상 선택지로 제공하지 않는다. validateSopDecisionBranches가 decision의
                        모든 outgoing edge에 branchType('yes'/'no'/'condition')을 강제하기 때문이다. */}
                    <div>
                        <label className="block font-semibold text-zinc-900 mb-2">분기 유형 (Branch Type)</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(isSourceDecision
                                ? [
                                      { id: 'yes' as const, label: 'YES (통과)' },
                                      { id: 'no' as const, label: 'NO (반려/미통과)' },
                                      { id: 'condition' as const, label: '조건 분기/재작업' },
                                  ]
                                : [
                                      { id: 'yes' as const, label: 'YES (통과)' },
                                      { id: 'no' as const, label: 'NO (반려/미통과)' },
                                      { id: 'condition' as const, label: '조건 분기/재작업' },
                                      { id: 'default' as const, label: '일반 순차 연결' },
                                  ]
                            ).map((b) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => updateEdge(edge.id, { branchType: b.id })}
                                    className={`py-2 px-3 text-xs font-semibold rounded-xl border text-left transition-all ${
                                        (edge.branchType || 'default') === b.id
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                                    }`}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                        {isSourceDecision && (
                            <p className="mt-1.5 text-[10px] text-zinc-500">
                                판단(decision) 단계에서 나가는 연결선은 일반 순차 연결로 둘 수 없습니다 - YES / NO / 조건 분기 중 하나를 선택해야 합니다.
                            </p>
                        )}
                    </div>

                    {/* Condition Text */}
                    <div>
                        <label className="block font-semibold text-zinc-900 mb-1">조건 상세 설명 (Condition)</label>
                        <textarea
                            rows={2}
                            value={edge.condition || ''}
                            onChange={(e) => updateEdge(edge.id, { condition: e.target.value })}
                            placeholder="분기가 발동되는 세부 조건이나 사유를 입력하세요."
                            className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900"
                        />
                        {edge.branchType === 'condition' && (!edge.label?.trim() || !edge.condition?.trim()) && (
                            <p className="mt-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                조건(condition) 분기에는 라벨과 조건 설명이 모두 필요합니다.
                            </p>
                        )}
                    </div>

                    {/* Delete Edge Action */}
                    <div className="pt-4 border-t border-zinc-200">
                        <button
                            type="button"
                            onClick={() => {
                                deleteEdge(edge.id);
                                selectEdge(null);
                            }}
                            className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> 이 연결선 삭제하기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Step Inspector View
    if (!selectedStepId) {
        return (
            <div className="h-full p-6 flex flex-col items-center justify-center text-center text-zinc-400 bg-white border-l border-zinc-200">
                <Layers className="w-10 h-10 mb-2 opacity-40 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-600">선택된 단계나 연결선이 없습니다.</p>
                <p className="text-xs text-zinc-400 mt-1">
                    캔버스에서 단계 노드 또는 연결선을 클릭하면 상세 편집 패널이 표시됩니다.
                </p>
            </div>
        );
    }

    const stepIndex = document.steps.findIndex((s) => s.id === selectedStepId);
    const step = document.steps[stepIndex];

    if (!step) return null;

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

    const handleToggleReviewStatus = () => {
        const nextStatus: SopReviewStatus = step.reviewStatus === 'ai-draft' ? 'reviewed' : 'ai-draft';
        updateStepReviewStatus(step.id, nextStatus);
    };

    // 도형 변경은 항상 normalizeStepShapeChange를 거쳐 shape/type/terminalType을 한 번에
    // 일관되게 맞춘다 - terminal이 아닌 도형으로 바꾸면 terminalType이 자동으로 제거되고,
    // terminal로 바꿀 때는 start/end를 아래 별도 UI에서 명시적으로 선택해야 한다.
    const handleShapeChange = (newShape: FlowShape) => {
        const normalized = normalizeStepShapeChange(step, newShape);
        updateStep(step.id, {
            shape: normalized.shape as FlowShape,
            type: normalized.type,
            terminalType: normalized.terminalType,
        });
        setStructureNotice(null);
    };

    // SOP에는 시작·종료가 각각 정확히 1개만 있어야 하므로, 이미 다른 단계가 같은 terminalType을
    // 가지고 있으면 명확히 차단한다(자동으로 덮어쓰지 않는다).
    const handleSetTerminalType = (terminalType: 'start' | 'end') => {
        const conflict = document!.steps.find((s) => s.id !== step.id && s.terminalType === terminalType);
        if (conflict) {
            setStructureNotice(
                `이미 "${conflict.title}" 단계가 ${terminalType === 'start' ? '시작' : '종료'} 노드로 지정되어 있습니다. SOP에는 ${terminalType === 'start' ? '시작' : '종료'} 노드가 정확히 1개만 있어야 하므로, 먼저 기존 단계의 도형을 변경한 뒤 다시 지정해 주세요.`
            );
            return;
        }
        updateStep(step.id, { terminalType });
        setStructureNotice(null);
    };

    const handleDeleteStep = () => {
        const result = deleteStep(step.id);
        if (!result.success) {
            setStructureNotice(result.reason || '이 단계를 삭제할 수 없습니다.');
        }
    };

    const handleDuplicateStep = () => {
        const result = duplicateStep(step.id);
        if (!result.success) {
            setStructureNotice(result.reason || '이 단계를 복제할 수 없습니다.');
        }
    };

    const isTerminalStep = step.shape === 'terminal' || step.type === 'terminal';
    const isProtectedTerminal = step.terminalType === 'start' || step.terminalType === 'end';

    return (
        <div className="h-full flex flex-col bg-white border-l border-zinc-200 overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-20">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Step {String(stepIndex + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-bold text-zinc-900 truncate max-w-[180px]">{step.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleToggleReviewStatus}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            step.reviewStatus === 'confirmed'
                                ? 'bg-emerald-600 text-white'
                                : step.reviewStatus === 'reviewed'
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                        }`}
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {step.reviewStatus === 'confirmed'
                            ? '확정됨 (수정 시 재검토)'
                            : step.reviewStatus === 'reviewed'
                            ? '검토 완료 (해제)'
                            : '이 단계 검토 완료'}
                    </button>
                    <button
                        type="button"
                        onClick={() => selectStep(null)}
                        className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg hover:bg-zinc-100"
                        aria-label="단계 편집 닫기"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Inspector Form Fields */}
            <div className="p-5 space-y-5 text-xs text-zinc-700">
                {/* Title */}
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1">단계명 (Title)</label>
                    <input
                        type="text"
                        value={step.title}
                        onChange={(e) => updateStep(step.id, { title: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Definition */}
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1 flex items-center justify-between">
                        <span>단계 정의 (Definition)</span>
                        <span className="text-[10px] font-normal text-zinc-400">무엇을 · 어떤 기준 · 결과</span>
                    </label>
                    <textarea
                        rows={3}
                        value={step.definition}
                        onChange={(e) => updateStep(step.id, { definition: e.target.value })}
                        placeholder="무엇을, 어떤 기준으로 수행하여, 어떤 결과를 만들어내는지 1~2문장으로 명확히 정의합니다."
                        className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Shape Selection */}
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1">표준 도형 (Flow Shape)</label>
                    <select
                        value={step.shape}
                        onChange={(e) => handleShapeChange(e.target.value as FlowShape)}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-medium text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                        {FLOW_SHAPE_IDS.map((shapeId) => (
                            <option key={shapeId} value={shapeId}>
                                {FLOW_SHAPES[shapeId]?.name || shapeId} ({shapeId})
                            </option>
                        ))}
                    </select>

                    {/* Terminal Start/End Picker - terminal 도형인데 아직 start/end가 지정되지 않았을 때만 표시 */}
                    {isTerminalStep && !step.terminalType && (
                        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                            <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> 시작 또는 종료 노드인지 선택이 필요합니다
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleSetTerminalType('start')}
                                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                                >
                                    시작 노드로 지정
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetTerminalType('end')}
                                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                                >
                                    종료 노드로 지정
                                </button>
                            </div>
                        </div>
                    )}

                    {isTerminalStep && step.terminalType && (
                        <div className="mt-2 flex items-center gap-2">
                            <span
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${
                                    step.terminalType === 'start'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : 'bg-rose-50 text-rose-800 border-rose-300'
                                }`}
                            >
                                {step.terminalType === 'start' ? '시작 노드' : '종료 노드'}로 지정됨
                            </span>
                        </div>
                    )}

                    {structureNotice && (
                        <p className="mt-2 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2 leading-relaxed">
                            {structureNotice}
                        </p>
                    )}
                </div>

                {/* Responsible Role & Duration */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block font-semibold text-zinc-900 mb-1 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-indigo-500" /> 담당 역할
                        </label>
                        <input
                            type="text"
                            value={step.responsibleRole || ''}
                            onChange={(e) => updateStep(step.id, { responsibleRole: e.target.value })}
                            placeholder="예: 채용담당자"
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900"
                        />
                    </div>

                    <div>
                        <label className="block font-semibold text-zinc-900 mb-1 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" /> 소요 시간
                        </label>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                value={step.estimatedDuration?.value || 1}
                                onChange={(e) =>
                                    updateStep(step.id, {
                                        estimatedDuration: {
                                            value: Number(e.target.value),
                                            unit: step.estimatedDuration?.unit || 'days',
                                        },
                                    })
                                }
                                className="w-16 px-2 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900"
                            />
                            <select
                                value={step.estimatedDuration?.unit || 'days'}
                                onChange={(e) =>
                                    updateStep(step.id, {
                                        estimatedDuration: {
                                            value: step.estimatedDuration?.value || 1,
                                            unit: e.target.value as 'minutes' | 'hours' | 'days' | 'weeks',
                                        },
                                    })
                                }
                                className="px-2 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900"
                            >
                                <option value="minutes">분</option>
                                <option value="hours">시간</option>
                                <option value="days">일</option>
                                <option value="weeks">주</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* SKILLS Section */}
                <div className="pt-3 border-t border-zinc-200">
                    <div className="flex items-center justify-between mb-2">
                        <label className="font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-indigo-600" /> 요구 SKILL ({step.requiredSkills.length})
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowAddSkill(true)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
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
                                        className="text-zinc-400 hover:text-rose-600 p-0.5"
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
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-2xs"
                                        >
                                            <Check className="w-3 h-3" /> 수락
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => rejectAiSkill(step.id, sk.name)}
                                            className="px-2.5 py-1 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold rounded-lg text-[10px] flex items-center gap-1"
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

                {/* Detailed Instructions */}
                <div className="pt-3 border-t border-zinc-200">
                    <label className="block font-semibold text-zinc-900 mb-1">상세 수행 방법</label>
                    <textarea
                        rows={3}
                        value={step.detailedInstructions || ''}
                        onChange={(e) => updateStep(step.id, { detailedInstructions: e.target.value })}
                        placeholder="구체적인 작업 가이드라인 및 1, 2, 3 순서 지침"
                        className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900"
                    />
                </div>

                {/* Inputs & Outputs */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block font-semibold text-zinc-900 mb-1">입력 정보 (Inputs)</label>
                        <input
                            type="text"
                            value={(step.inputs || []).join(', ')}
                            onChange={(e) =>
                                updateStep(step.id, {
                                    inputs: e.target.value.split(',').map((s) => s.trim()),
                                })
                            }
                            placeholder="쉼표로 구분"
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs"
                        />
                    </div>
                    <div>
                        <label className="block font-semibold text-zinc-900 mb-1">산출물 (Outputs)</label>
                        <input
                            type="text"
                            value={(step.outputs || []).join(', ')}
                            onChange={(e) =>
                                updateStep(step.id, {
                                    outputs: e.target.value.split(',').map((s) => s.trim()),
                                })
                            }
                            placeholder="쉼표로 구분"
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs"
                        />
                    </div>
                </div>

                {/* Tools & Cautions */}
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1 flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-zinc-500" /> 사용 시스템 · 도구
                    </label>
                    <input
                        type="text"
                        value={(step.tools || []).join(', ')}
                        onChange={(e) =>
                            updateStep(step.id, {
                                tools: e.target.value.split(',').map((s) => s.trim()),
                            })
                        }
                        placeholder="예: ATS, 전자결재, Slack"
                        className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs"
                    />
                </div>

                {/* Duplicate / Delete Step Actions */}
                <div className="pt-4 border-t border-zinc-200 space-y-2">
                    <button
                        type="button"
                        onClick={handleDuplicateStep}
                        disabled={isProtectedTerminal}
                        title={isProtectedTerminal ? '시작·종료 노드는 복제할 수 없습니다.' : undefined}
                        className="w-full py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-50"
                    >
                        <Layers className="w-3.5 h-3.5" /> 이 단계 복제
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteStep}
                        disabled={isProtectedTerminal}
                        title={isProtectedTerminal ? '시작·종료 노드는 삭제할 수 없습니다.' : undefined}
                        className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> 이 단계 삭제
                    </button>
                    {isProtectedTerminal && (
                        <p className="text-[10px] text-zinc-400 text-center">
                            시작·종료 노드는 SOP에 정확히 1개씩 있어야 하므로 삭제·복제할 수 없습니다.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
