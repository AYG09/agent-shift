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

    return (
        <div className="h-full flex flex-col bg-white border-l border-zinc-200 overflow-y-auto">
            <SopStepCoreEditor step={step} stepIndex={stepIndex} allSteps={document.steps} onOpenAgentization={openAgentization}>
                <SopActivityMappingEditor step={step} />
                <SopSkillEditor step={step} />
                <SopExecutionEditor step={step} />
            </SopStepCoreEditor>
        </div>
    );
};
