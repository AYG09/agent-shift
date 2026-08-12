'use client';

import React from 'react';
import { X, Trash2, GitCommit, AlertCircle } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { validateSopDecisionBranches, classifySopStepType } from '@/lib/graph-validation';
import { SOP_DECISION_BRANCH_TYPE_OPTIONS, SOP_DEFAULT_BRANCH_TYPE_OPTION } from '@/lib/sop-edge-meta';

interface SopEdgeInspectorProps {
    onOpenAgentization: () => void;
}

/** Renders when an edge is selected. Reads only the edge-relevant slice of the store. */
export const SopEdgeInspector: React.FC<SopEdgeInspectorProps> = ({ onOpenAgentization }) => {
    const document = useSopPrototypeStore((s) => s.document);
    const selectedEdgeId = useSopPrototypeStore((s) => s.selectedEdgeId);
    const readOnly = useSopPrototypeStore((s) => s.customerReviewMode);
    const selectEdge = useSopPrototypeStore((s) => s.selectEdge);
    const updateEdge = useSopPrototypeStore((s) => s.updateEdge);
    const deleteEdge = useSopPrototypeStore((s) => s.deleteEdge);

    if (!document) return null;

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
                <div className="flex items-center gap-1">
                    <button type="button" onClick={onOpenAgentization} className="rounded-md border border-indigo-200 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50">AI Agent화</button>
                    <button type="button" onClick={() => selectEdge(null)} className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg hover:bg-zinc-100" aria-label="연결선 편집 닫기"><X className="w-4 h-4" /></button>
                </div>
            </div>

            {readOnly && (
                <div className="px-5 pt-3 text-[11px] font-medium text-indigo-800 bg-indigo-50 border-b border-indigo-200 py-2">
                    고객 검토 모드에서는 연결선을 열람만 할 수 있고 수정할 수 없습니다.
                </div>
            )}

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
                        disabled={readOnly}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                </div>

                {/* Branch Type Selector - decision 노드에서 출발하는 edge는 'default'(일반 순차
                    연결)를 정상 선택지로 제공하지 않는다. validateSopDecisionBranches가 decision의
                    모든 outgoing edge에 branchType('yes'/'no'/'condition')을 강제하기 때문이다. */}
                <div>
                    <label className="block font-semibold text-zinc-900 mb-2">분기 유형 (Branch Type)</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(isSourceDecision
                            ? SOP_DECISION_BRANCH_TYPE_OPTIONS
                            : [...SOP_DECISION_BRANCH_TYPE_OPTIONS, SOP_DEFAULT_BRANCH_TYPE_OPTION]
                        ).map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                onClick={() => updateEdge(edge.id, { branchType: b.id })}
                                disabled={readOnly}
                                className={`py-2 px-3 text-xs font-semibold rounded-xl border text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
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
                        disabled={readOnly}
                        className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
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
                        disabled={readOnly}
                        title={readOnly ? '고객 검토 모드에서는 연결선을 삭제할 수 없습니다.' : undefined}
                        className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> 이 연결선 삭제하기
                    </button>
                </div>
            </div>
        </div>
    );
};
