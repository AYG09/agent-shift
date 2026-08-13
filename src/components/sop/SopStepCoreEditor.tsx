'use client';

import React, { useState } from 'react';
import { CheckCircle2, X, Clock, User, Layers, Trash2, AlertCircle } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { FLOW_SHAPE_IDS, FLOW_SHAPES, FlowShape } from '@/lib/flow-shapes';
import { SopReviewStatus, SopStepData } from '@/lib/sop-types';
import { normalizeStepShapeChange } from '@/lib/graph-validation';
import { SopInspectorSection } from './SopInspectorSection';

interface SopStepCoreEditorProps {
    step: SopStepData;
    stepIndex: number;
    allSteps: SopStepData[];
    onOpenAgentization: () => void;
    /** SopSkillEditor / SopExecutionEditor, rendered between the core fields and the
     *  duplicate/delete footer so the panel's original field order is unchanged. */
    children?: React.ReactNode;
}

/**
 * The step's structural identity: title, definition, shape/terminal designation,
 * responsible role, duration, and the duplicate/delete actions that depend on that
 * same structural state (a protected start/end step cannot be duplicated or deleted).
 */
export const SopStepCoreEditor: React.FC<SopStepCoreEditorProps> = ({ step, stepIndex, allSteps, onOpenAgentization, children }) => {
    const readOnly = useSopPrototypeStore((s) => s.customerReviewMode);
    const isSubActionStructure = useSopPrototypeStore((s) => s.document?.structureVersion === 'activity-subaction-v1');
    const selectStep = useSopPrototypeStore((s) => s.selectStep);
    const updateStep = useSopPrototypeStore((s) => s.updateStep);
    const updateStepReviewStatus = useSopPrototypeStore((s) => s.updateStepReviewStatus);
    const deleteStep = useSopPrototypeStore((s) => s.deleteStep);
    const duplicateStep = useSopPrototypeStore((s) => s.duplicateStep);

    const [structureNotice, setStructureNotice] = useState<string | null>(null);

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
        const conflict = allSteps.find((s) => s.id !== step.id && s.terminalType === terminalType);
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

    // Explicit member choice, never a silent default — an unset origin blocks SOP
    // confirmation (validateFullSopConfirmation), so a manually-added or AI-generated step
    // missing this must stay visibly "미지정" until the member picks one. Switching AWAY
    // from context-derived clears the rationale in the SAME patch so a stale rationale can
    // never survive under activity-derived (that combination itself fails confirmation).
    const handleOriginChange = (value: '' | 'activity-derived' | 'context-derived') => {
        if (value === 'context-derived') {
            updateStep(step.id, { subActionOrigin: 'context-derived' });
        } else {
            updateStep(step.id, { subActionOrigin: value === 'activity-derived' ? 'activity-derived' : undefined, subActionOriginRationale: undefined });
        }
    };

    const isTerminalStep = step.shape === 'terminal' || step.type === 'terminal';
    const isProtectedTerminal = step.terminalType === 'start' || step.terminalType === 'end';

    return (
        <>
            {/* Header — 2행 구조. 이전의 1행 justify-between 구조는 380px 패널에서
                검토 버튼이 수십 px로 짓눌려 글자가 세로로 한 자씩 꺾이는 렌더 파손을
                만들었다. 1행: 식별(Step 번호·제목)과 닫기, 2행: 행동(검토 토글·Agent화). */}
            <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 p-3 backdrop-blur-xs">
                <div className="flex items-center gap-2">
                    <span className="shrink-0 whitespace-nowrap rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                        Step {String(stepIndex + 1).padStart(2, '0')}
                    </span>
                    <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-900" title={step.title}>{step.title}</h3>
                    <button
                        type="button"
                        onClick={() => selectStep(null)}
                        className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        aria-label="단계 편집 닫기"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleToggleReviewStatus}
                        disabled={readOnly}
                        title={readOnly ? '고객 검토 모드에서는 검토 상태를 변경할 수 없습니다.' : undefined}
                        className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                            step.reviewStatus === 'confirmed'
                                ? 'bg-emerald-600 text-white'
                                : step.reviewStatus === 'reviewed'
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                        }`}
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        {step.reviewStatus === 'confirmed'
                            ? '확정됨 (수정 시 재검토)'
                            : step.reviewStatus === 'reviewed'
                            ? '검토 완료 (해제)'
                            : '이 단계 검토 완료'}
                    </button>
                    <button
                        type="button"
                        onClick={onOpenAgentization}
                        className="shrink-0 whitespace-nowrap rounded-xl border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                        AI Agent화
                    </button>
                </div>
            </div>

            {readOnly && (
                <div className="px-5 pt-3 text-[11px] font-medium text-indigo-800 bg-indigo-50 border-b border-indigo-200 py-2">
                    고객 검토 모드에서는 단계를 열람만 할 수 있고 수정할 수 없습니다.
                </div>
            )}

            <div className="space-y-3 p-4 text-xs text-zinc-700">
                {/* 구조 관련 안내(도형 충돌·삭제 불가 등)는 어느 섹션이 접혀 있어도
                    항상 보이도록 섹션 밖 최상단에 표시한다. */}
                {structureNotice && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] font-medium leading-relaxed text-rose-700">
                        {structureNotice}
                    </p>
                )}

                {/* Title */}
                <div>
                    <label className="block font-semibold text-zinc-900 mb-1">단계명 (Title)</label>
                    <input
                        type="text"
                        value={step.title}
                        onChange={(e) => updateStep(step.id, { title: e.target.value })}
                        disabled={readOnly}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                        disabled={readOnly}
                        className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                </div>

                {!isTerminalStep && isSubActionStructure && (
                    <div className={`rounded-xl border px-3 py-2.5 ${step.subActionOrigin === 'context-derived' ? 'border-violet-200 bg-violet-50' : step.subActionOrigin === 'activity-derived' ? 'border-zinc-200 bg-zinc-50' : 'border-rose-200 bg-rose-50'}`}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                            <label className="text-[11px] font-semibold text-zinc-800" htmlFor={`sub-action-origin-${step.id}`}>Sub Action 생성 근거</label>
                            {!step.subActionOrigin && (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">미지정 · SOP 확정 차단</span>
                            )}
                        </div>
                        <select
                            id={`sub-action-origin-${step.id}`}
                            value={step.subActionOrigin ?? ''}
                            onChange={(e) => handleOriginChange(e.target.value as '' | 'activity-derived' | 'context-derived')}
                            disabled={readOnly}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <option value="">미지정</option>
                            <option value="activity-derived">Activity 기본 분해</option>
                            <option value="context-derived">직무 맥락 보강</option>
                        </select>
                        {step.subActionOrigin === 'context-derived' && (
                            <textarea
                                value={step.subActionOriginRationale ?? ''}
                                onChange={(e) => updateStep(step.id, { subActionOriginRationale: e.target.value })}
                                disabled={readOnly}
                                rows={2}
                                placeholder="직무 맥락에서 이 Sub Action을 추가한 구체적인 근거를 입력하세요 (필수 — 비어 있으면 SOP를 확정할 수 없습니다)."
                                className="mt-1.5 w-full rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-zinc-900 focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        )}
                    </div>
                )}

                {/* Shape Selection — 도형·terminal 구조는 자주 바꾸지 않으므로 접힌
                    섹션으로 두되, terminal인데 start/end 미지정이면 즉시 조치가 필요하므로
                    강조 톤으로 펼쳐 둔다. */}
                <SopInspectorSection
                    title="표준 도형 (Flow Shape)"
                    summary={isTerminalStep && !step.terminalType ? '시작/종료 지정 필요' : FLOW_SHAPES[step.shape]?.name || step.shape}
                    defaultOpen={isTerminalStep && !step.terminalType}
                    tone={isTerminalStep && !step.terminalType ? 'attention' : 'default'}
                >
                    <select
                        value={step.shape}
                        onChange={(e) => handleShapeChange(e.target.value as FlowShape)}
                        disabled={readOnly}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-medium text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                                    disabled={readOnly}
                                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    시작 노드로 지정
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetTerminalType('end')}
                                    disabled={readOnly}
                                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </SopInspectorSection>

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
                            disabled={readOnly}
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
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
                                disabled={readOnly}
                                className="w-16 px-2 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
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
                                disabled={readOnly}
                                className="px-2 py-1.5 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <option value="minutes">분</option>
                                <option value="hours">시간</option>
                                <option value="days">일</option>
                                <option value="weeks">주</option>
                            </select>
                        </div>
                    </div>
                </div>

                {children}

                {/* Duplicate / Delete Step Actions */}
                <SopInspectorSection title="단계 관리" summary="복제 · 삭제">
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={handleDuplicateStep}
                        disabled={isProtectedTerminal || readOnly}
                        title={readOnly ? '고객 검토 모드에서는 단계를 복제할 수 없습니다.' : isProtectedTerminal ? '시작·종료 노드는 복제할 수 없습니다.' : undefined}
                        className="w-full py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-50"
                    >
                        <Layers className="w-3.5 h-3.5" /> 이 단계 복제
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteStep}
                        disabled={isProtectedTerminal || readOnly}
                        title={readOnly ? '고객 검토 모드에서는 단계를 삭제할 수 없습니다.' : isProtectedTerminal ? '시작·종료 노드는 삭제할 수 없습니다.' : undefined}
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
                </SopInspectorSection>
            </div>
        </>
    );
};
