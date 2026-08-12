import type { SopDocument, SopEdge, SopStepData } from './sop-types';

const MEANINGFUL_STEP_FIELDS: (keyof SopStepData)[] = [
    'title',
    'definition',
    'detailedInstructions',
    'responsibleRole',
    'inputs',
    'outputs',
    'tools',
    'cautions',
    'decisionRules',
    'requiredSkills',
    'estimatedDuration',
    'type',
    'shape',
    'terminalType',
    'ioType',
];

export function isMeaningfulStepEdit(partial: Partial<SopStepData>): boolean {
    return MEANINGFUL_STEP_FIELDS.some((field) => field in partial);
}

type StructuralResult<T> = { success: true } & T | { success: false; reason: string };

/**
 * Pure builders for step/edge/SKILL mutations. Each takes the current document and
 * returns the patch to apply (never calls `set`), so the store only wires guard
 * checks, history push, and invalidation around these. A position-only step edit
 * carries no reviewable meaning, so callers should skip review/agentization
 * invalidation when `invalidate` is false.
 */
export function buildUpdateStepPatch(doc: SopDocument, stepId: string, partial: Partial<SopStepData>): { steps: SopStepData[]; invalidate: boolean } {
    const isContentEdit = isMeaningfulStepEdit(partial);
    const steps = doc.steps.map((s) => {
        if (s.id !== stepId) return s;
        const nextStep = { ...s, ...partial };
        if (isContentEdit) {
            nextStep.reviewStatus = 'ai-draft' as const;
        }
        return nextStep;
    });
    return { steps, invalidate: isContentEdit };
}

export function buildAddStepPatch(doc: SopDocument, newStep: SopStepData, edgeData?: SopEdge): { steps: SopStepData[]; edges: SopEdge[] } {
    const steps = [...doc.steps, { ...newStep, reviewStatus: 'ai-draft' as const }];
    const edges = edgeData ? [...doc.edges, edgeData] : doc.edges;
    return { steps, edges };
}

// "단계 추가"의 기본 동작: 종료 노드 바로 앞에 새 단계를 끼워 넣는다.
// 종료 노드로 직접 들어오던 모든 edge를 새 단계로 재배선하고(incoming -> newStep),
// 새 단계 -> 종료 edge를 하나 추가한다 - 여러 경로가 종료로 직접 들어와도(예: YES/NO가
// 둘 다 바로 종료로 향하는 경우) 모든 경로가 새 단계를 거쳐 종료하게 되므로 도달성이
// 보존된다. 종료 노드가 정확히 1개가 아니거나, 종료로 들어오는 edge가 하나도 없어
// "안전한 삽입 지점"을 결정할 수 없으면 어떤 edge도 만들지 않고 실패를 반환한다 -
// 호출자(SopWorkspace)가 사용자에게 삽입 위치를 직접 선택하도록 안내해야 한다.
export function buildInsertStepBeforeEndPatch(doc: SopDocument, newStep: SopStepData): StructuralResult<{ steps: SopStepData[]; edges: SopEdge[] }> {
    const endSteps = doc.steps.filter((s) => s.terminalType === 'end');
    if (endSteps.length !== 1) {
        return {
            success: false,
            reason:
                endSteps.length === 0
                    ? '종료 노드가 없어 자동으로 삽입할 위치를 정할 수 없습니다. 캔버스에서 직접 위치를 지정해 주세요.'
                    : '종료 노드가 여러 개여서 자동으로 삽입할 위치를 정할 수 없습니다. 캔버스에서 직접 위치를 지정해 주세요.',
        };
    }

    const endId = endSteps[0].id;
    const incomingToEnd = doc.edges.filter((e) => e.target === endId);
    if (incomingToEnd.length === 0) {
        return {
            success: false,
            reason: '종료 노드로 들어오는 연결선이 없어 안전하게 자동 삽입할 수 없습니다. 캔버스에서 새 단계를 추가한 뒤 직접 연결선을 그어 주세요.',
        };
    }

    const rewired = incomingToEnd.map((e) => ({ ...e, target: newStep.id }));
    const untouchedEdges = doc.edges.filter((e) => e.target !== endId);
    const bridgeEdge: SopEdge = {
        id: `e-${newStep.id}-${endId}`,
        source: newStep.id,
        target: endId,
        label: '다음',
        branchType: 'default',
        sourceHandle: 'bottom',
        targetHandle: 'top-target',
    };

    return {
        success: true,
        steps: [...doc.steps, { ...newStep, reviewStatus: 'ai-draft' as const }],
        edges: [...untouchedEdges, ...rewired, bridgeEdge],
    };
}

// 시작·종료 노드 삭제 정책: 기본적으로 차단한다. 문서에 시작/종료가 정확히 1개씩
// 있어야 한다는 불변식(validateSopGraph의 missing/multiple-start/end-nodes)을
// Inspector의 명시적 삭제 버튼에서 미리 깨뜨리지 않기 위함이다. 다른 terminal로
// 바꾸고 싶다면 도형을 변경(normalizeStepShapeChange)한 뒤 삭제해야 한다.
export function buildDeleteStepPatch(
    doc: SopDocument,
    stepId: string,
    currentSelectedStepId: string | null
): StructuralResult<{ steps: SopStepData[]; edges: SopEdge[]; nextSelectedStepId: string | null }> {
    const target = doc.steps.find((s) => s.id === stepId);
    if (!target) return { success: false, reason: '해당 단계를 찾을 수 없습니다.' };
    if (target.terminalType === 'start' || target.terminalType === 'end') {
        return {
            success: false,
            reason: `${target.terminalType === 'start' ? '시작' : '종료'} 노드는 삭제할 수 없습니다. SOP에는 시작·종료 노드가 각각 정확히 1개씩 있어야 합니다. 도형을 다른 유형으로 먼저 변경한 뒤 삭제해 주세요.`,
        };
    }

    const steps = doc.steps.filter((s) => s.id !== stepId);
    const edges = doc.edges.filter((e) => e.source !== stepId && e.target !== stepId);
    const nextSelectedStepId = currentSelectedStepId === stepId ? (steps[0]?.id || null) : currentSelectedStepId;
    return { success: true, steps, edges, nextSelectedStepId };
}

// terminal(시작/종료) 노드는 복제할 수 없다 - 그대로 복제하면 terminalType이 같은
// 노드가 2개가 되어 SOP의 "시작·종료 각각 정확히 1개" 불변식이 즉시 깨진다.
export function buildDuplicateStepPatch(doc: SopDocument, stepId: string): StructuralResult<{ steps: SopStepData[]; newStepId: string }> {
    const original = doc.steps.find((s) => s.id === stepId);
    if (!original) return { success: false, reason: '해당 단계를 찾을 수 없습니다.' };
    if (original.terminalType === 'start' || original.terminalType === 'end') {
        return {
            success: false,
            reason: `${original.terminalType === 'start' ? '시작' : '종료'} 노드는 복제할 수 없습니다. 복제하면 중복된 시작·종료 노드가 생성됩니다.`,
        };
    }

    const newId = `step-${Date.now()}`;
    const dupStep: SopStepData = {
        ...original,
        id: newId,
        title: `${original.title} (사본)`,
        position: { x: original.position.x + 40, y: original.position.y + 40 },
        reviewStatus: 'ai-draft',
    };
    return { success: true, steps: [...doc.steps, dupStep], newStepId: newId };
}

export function buildUpdateEdgePatch(doc: SopDocument, edgeId: string, partial: Partial<SopEdge>): { edges: SopEdge[] } {
    return { edges: doc.edges.map((e) => (e.id === edgeId ? { ...e, ...partial } : e)) };
}

export function buildAddEdgePatch(doc: SopDocument, newEdge: SopEdge): { edges: SopEdge[] } {
    return { edges: [...doc.edges, newEdge] };
}

export function buildDeleteEdgePatch(
    doc: SopDocument,
    edgeId: string,
    currentSelectedEdgeId: string | null
): { edges: SopEdge[]; nextSelectedEdgeId: string | null } {
    return {
        edges: doc.edges.filter((e) => e.id !== edgeId),
        nextSelectedEdgeId: currentSelectedEdgeId === edgeId ? null : currentSelectedEdgeId,
    };
}

// SKILL mutations invalidate step/document review status AND any confirmed
// Agent화 judgement (handled by the caller), since a changed skill set can change
// what a step's AI participation judgement was actually made against.
export function buildAcceptAiSkillPatch(doc: SopDocument, stepId: string, skillName: string): { steps: SopStepData[] } {
    return {
        steps: doc.steps.map((s) => {
            if (s.id !== stepId) return s;
            const requiredSkills = s.requiredSkills.map((sk) => (sk.name === skillName ? { ...sk, accepted: true } : sk));
            return { ...s, requiredSkills, reviewStatus: 'ai-draft' as const };
        }),
    };
}

export function buildRejectAiSkillPatch(doc: SopDocument, stepId: string, skillName: string): { steps: SopStepData[] } {
    return {
        steps: doc.steps.map((s) => {
            if (s.id !== stepId) return s;
            return { ...s, requiredSkills: s.requiredSkills.filter((sk) => sk.name !== skillName), reviewStatus: 'ai-draft' as const };
        }),
    };
}

export function buildAddSkillToStepPatch(doc: SopDocument, stepId: string, skill: SopStepData['requiredSkills'][number]): { steps: SopStepData[] } {
    return {
        steps: doc.steps.map((s) => {
            if (s.id !== stepId) return s;
            if (s.requiredSkills.some((sk) => sk.name === skill.name)) return s;
            return { ...s, requiredSkills: [...s.requiredSkills, skill], reviewStatus: 'ai-draft' as const };
        }),
    };
}

export function buildRemoveSkillFromStepPatch(doc: SopDocument, stepId: string, skillName: string): { steps: SopStepData[] } {
    return {
        steps: doc.steps.map((s) => {
            if (s.id !== stepId) return s;
            return { ...s, requiredSkills: s.requiredSkills.filter((sk) => sk.name !== skillName), reviewStatus: 'ai-draft' as const };
        }),
    };
}
