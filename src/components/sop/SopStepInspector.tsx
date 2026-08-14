'use client';

import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopAgentizationPanel } from './SopAgentizationPanel';
import { SopEdgeInspector } from './SopEdgeInspector';
import { SopStepCoreEditor } from './SopStepCoreEditor';
import { SopSkillEditor } from './SopSkillEditor';
import { SopExecutionEditor } from './SopExecutionEditor';
import { SopActivityMappingEditor } from './SopActivityMappingEditor';
import { SopInspectorSection } from './SopInspectorSection';
import { formatActivityCode } from '@/lib/sop-format';

/**
 * Routes to the right editing surface for the current selection: the Agent화
 * review panel, an edge, a step (Core + Skill + Execution), or an empty state.
 * Each surface subscribes to only the store slices it needs.
 */
export const SopStepInspector: React.FC = () => {
    const document = useSopPrototypeStore((s) => s.document);
    const selectedStepId = useSopPrototypeStore((s) => s.selectedStepId);
    const selectedEdgeId = useSopPrototypeStore((s) => s.selectedEdgeId);

    const [activePanel, setActivePanel] = useState<'details' | 'agentization'>('details');
    const openAgentization = () => setActivePanel('agentization');

    if (!document) return null;

    if (activePanel === 'agentization') return <SopAgentizationPanel onBack={() => setActivePanel('details')} />;

    if (selectedEdgeId) {
        return <SopEdgeInspector onOpenAgentization={openAgentization} />;
    }

    if (!selectedStepId) {
        return (
            <div className="flex h-full flex-col border-l border-zinc-200 bg-white">
                <div className="grid grid-cols-2 border-b border-zinc-200 p-2 text-xs font-semibold"><span className="rounded-md bg-zinc-100 px-2 py-1.5 text-center text-zinc-700">단계 상세</span><button type="button" onClick={openAgentization} className="rounded-md px-2 py-1.5 text-indigo-700 hover:bg-indigo-50">AI Agent화</button></div>
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-zinc-400"><Layers className="mb-2 h-10 w-10 opacity-40" /><p className="text-sm font-medium text-zinc-600">선택된 단계나 연결선이 없습니다.</p><p className="mt-1 text-xs text-zinc-400">캔버스에서 노드를 선택하거나 AI Agent화 탭에서 검토 범위를 정해 주세요.</p></div>
            </div>
        );
    }

    const stepIndex = document.steps.findIndex((s) => s.id === selectedStepId);
    const step = document.steps[stepIndex];
    if (!step) return null;

    // 접힌 상태에서도 현재 값이 보이도록 섹션 요약을 계산한다.
    const task = document.workLibrary.taskCatalog.find((item) => item.id === document.workLibrary.taskId);
    const primaryActivity = task?.activities.find((activity) => activity.id === step.sourceActivityIds?.[0]);
    const activitySummary = step.sourceActivityIds?.length
        ? `${primaryActivity ? formatActivityCode(primaryActivity.order) : '미확인 Activity'}${step.subActionOrder !== undefined ? ` · #${step.subActionOrder}` : ''}`
        : '미지정';
    const isTerminal = Boolean(step.terminalType);

    return (
        <div className="h-full flex flex-col bg-white border-l border-zinc-200 overflow-y-auto">
            <SopStepCoreEditor step={step} stepIndex={stepIndex} allSteps={document.steps} onOpenAgentization={openAgentization}>
                {/* 밀도 개선: 관심사별 아코디언 — 핵심 필드(단계명·정의·근거·담당·시간)만
                    항상 보이고, 나머지는 요약 칩과 함께 접어 필요할 때만 펼친다.
                    terminal 단계는 Activity 매핑이 없으므로 그 섹션 자체를 만들지 않는다. */}
                {!isTerminal && (
                    <SopInspectorSection
                        title="소속 Activity · 순서"
                        summary={activitySummary}
                        tone={step.sourceActivityIds?.length ? 'default' : 'attention'}
                        defaultOpen={!step.sourceActivityIds?.length}
                    >
                        <SopActivityMappingEditor step={step} />
                    </SopInspectorSection>
                )}
                <SopInspectorSection title="요구 SKILL" summary={`${step.requiredSkills.length}개`}>
                    <SopSkillEditor step={step} />
                </SopInspectorSection>
                <SopInspectorSection title="상세 수행 정보" summary={step.detailedInstructions?.trim() ? '작성됨' : '비어 있음'}>
                    <SopExecutionEditor step={step} />
                </SopInspectorSection>
            </SopStepCoreEditor>
        </div>
    );
};
