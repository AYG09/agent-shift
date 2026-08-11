import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
    SopDocument,
    SopStepData,
    SopEdge,
    SopMember,
    WorkLibrarySelection,
    SopSetupConfig,
    SopDisplayMode,
    SopReviewStatus,
    SopRequiredSkill,
} from './sop-types';
import { SAMPLE_SOP_DOCUMENT, SAMPLE_SOP_MEMBER, SAMPLE_WORK_LIBRARY } from './sop-sample-data';
import { validateSopGraph } from './graph-validation';

const customStorage = {
    getItem: (name: string) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return localStorage.getItem(name);
        }
        return null;
    },
    setItem: (name: string, value: string) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(name, value);
        }
    },
    removeItem: (name: string) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(name);
        }
    },
};

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

interface SopPrototypeState {
    // Setup Gate States
    memberInfo: SopMember;
    workLibrary: WorkLibrarySelection;
    context: string;
    setupConfig: SopSetupConfig;

    // Workspace Active Document & Display Mode
    document: SopDocument | null;
    selectedStepId: string | null;
    selectedEdgeId: string | null;
    displayMode: SopDisplayMode;
    customerReviewMode: boolean;
    lastSavedTimestamp: string | null;

    // Undo / Redo History
    history: SopDocument[];
    future: SopDocument[];

    // Actions - Setup Gate & Work Library
    setMemberInfo: (member: Partial<SopMember>) => void;
    setWorkLibrary: (library: Partial<WorkLibrarySelection>) => void;
    confirmWorkLibrary: () => void;
    reopenWorkLibrary: () => void;
    setContext: (context: string) => void;
    setSetupConfig: (config: Partial<SopSetupConfig>) => void;
    generateFromSample: () => SopDocument;
    setDocument: (doc: SopDocument) => void;

    // Actions - Workspace Navigation & Selection
    selectStep: (stepId: string | null) => void;
    selectEdge: (edgeId: string | null) => void;
    setDisplayMode: (mode: SopDisplayMode) => void;
    setCustomerReviewMode: (enabled: boolean) => void;
    toggleCustomerReviewMode: () => void;

    // Actions - Document Content Editing (Invalidates Confirmation)
    updateDocumentTitle: (title: string) => void;
    updateStep: (stepId: string, partial: Partial<SopStepData>) => void;
    addStep: (newStep: SopStepData, edgeData?: SopEdge) => void;
    insertStepBeforeEnd: (newStep: SopStepData) => { success: boolean; reason?: string };
    deleteStep: (stepId: string) => { success: boolean; reason?: string };
    duplicateStep: (stepId: string) => { success: boolean; reason?: string };

    // Actions - Edges
    updateEdge: (edgeId: string, partial: Partial<SopEdge>) => void;
    addEdge: (newEdge: SopEdge) => void;
    deleteEdge: (edgeId: string) => void;

    // Actions - Skills
    acceptAiSkill: (stepId: string, skillName: string) => void;
    rejectAiSkill: (stepId: string, skillName: string) => void;
    addSkillToStep: (stepId: string, skill: SopRequiredSkill) => void;
    removeSkillFromStep: (stepId: string, skillName: string) => void;

    // Actions - Review & Confirm Status
    updateStepReviewStatus: (stepId: string, status: SopReviewStatus) => void;
    confirmFullSop: () => { success: boolean; errors: string[] };

    // Undo / Redo / Save
    saveSnapshot: () => void;
    undo: () => void;
    redo: () => void;
    resetStore: () => void;
}

const DEFAULT_SETUP_CONFIG: SopSetupConfig = {
    sourceType: 'task',
    detailLevel: 'standard',
    minSteps: 6,
    maxSteps: 8,
    branchPolicy: 'auto',
    maxBranches: 2,
    allowRework: true,
    maxTotalNodes: 15,
    maxLoops: 3,
    splitComplexSteps: true,
};

export const useSopPrototypeStore = create<SopPrototypeState>()(
    persist(
        (set, get) => {
            const pushHistory = (currentDoc: SopDocument) => {
                const history = get().history.slice(-19);
                return { history: [...history, currentDoc], future: [] };
            };

            const computeDocumentReviewStatus = (steps: SopStepData[]): SopReviewStatus => {
                const anyUnreviewed = steps.some((s) => s.reviewStatus === 'ai-draft');
                if (anyUnreviewed) return 'ai-draft';
                // Note: Step-level edits or UI updates can only produce 'reviewed', NEVER 'confirmed'!
                return 'reviewed';
            };

            return {
                memberInfo: SAMPLE_SOP_MEMBER,
                workLibrary: SAMPLE_WORK_LIBRARY,
                context:
                    '실제 업무 순서, 승인 조건, 예외 상황, 사용 시스템, 반드시 지켜야 할 기준, 협업 방식과 자주 되돌아가는 단계를 검토하여 SOP를 구체화합니다.',
                setupConfig: DEFAULT_SETUP_CONFIG,

                document: null,
                selectedStepId: null,
                selectedEdgeId: null,
                displayMode: 'standard',
                customerReviewMode: false,
                lastSavedTimestamp: null,

                history: [],
                future: [],

                // Setup Gate Handlers
                setMemberInfo: (partial) =>
                    set((state) => ({ memberInfo: { ...state.memberInfo, ...partial } })),

                setWorkLibrary: (partial) =>
                    set((state) => {
                        const updated = { ...state.workLibrary, ...partial };
                        if ('confirmed' in partial) {
                            updated.confirmed = partial.confirmed!;
                        } else if (
                            partial.taskName !== undefined ||
                            partial.activityName !== undefined ||
                            partial.skills !== undefined ||
                            partial.sourceType !== undefined
                        ) {
                            updated.confirmed = false;
                        }
                        return { workLibrary: updated };
                    }),

                confirmWorkLibrary: () =>
                    set((state) => ({ workLibrary: { ...state.workLibrary, confirmed: true } })),

                reopenWorkLibrary: () =>
                    set((state) => ({ workLibrary: { ...state.workLibrary, confirmed: false } })),

                setContext: (context) => set({ context }),

                setSetupConfig: (partial) =>
                    set((state) => ({ setupConfig: { ...state.setupConfig, ...partial } })),

                generateFromSample: () => {
                    const state = get();
                    const now = new Date().toISOString();
                    const doc: SopDocument = {
                        ...SAMPLE_SOP_DOCUMENT,
                        id: `sop-sample-${Date.now()}`,
                        member: { ...state.memberInfo },
                        workLibrary: { ...state.workLibrary, confirmed: true },
                        context: state.context || SAMPLE_SOP_DOCUMENT.context,
                        displayMode: state.displayMode,
                        reviewStatus: 'ai-draft',
                        steps: SAMPLE_SOP_DOCUMENT.steps.map((s) => ({ ...s, reviewStatus: 'ai-draft' as const })),
                        createdAt: now,
                        updatedAt: now,
                        isSampleData: true,
                    };
                    set({
                        document: doc,
                        selectedStepId: doc.steps[0]?.id || null,
                        selectedEdgeId: null,
                        lastSavedTimestamp: now,
                        history: [],
                        future: [],
                    });
                    return doc;
                },

                setDocument: (doc) => {
                    const now = new Date().toISOString();
                    set({
                        document: { ...doc, updatedAt: now },
                        selectedStepId: doc.steps[0]?.id || null,
                        selectedEdgeId: null,
                        lastSavedTimestamp: now,
                        history: [],
                        future: [],
                    });
                },

                // Mode and Selection
                selectStep: (stepId) => set({ selectedStepId: stepId, selectedEdgeId: null }),
                selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedStepId: null }),

                setDisplayMode: (mode) => {
                    set({ displayMode: mode });
                    const doc = get().document;
                    if (doc) {
                        // Display mode change does NOT invalidate review/confirmation status
                        set({ document: { ...doc, displayMode: mode } });
                    }
                },

                setCustomerReviewMode: (enabled) => set({ customerReviewMode: enabled }),
                toggleCustomerReviewMode: () =>
                    set((state) => ({ customerReviewMode: !state.customerReviewMode })),

                updateDocumentTitle: (title) => {
                    const doc = get().document;
                    if (!doc) return;
                    // Item 3: Document title edit invalidates document reviewStatus back to 'ai-draft'!
                    set({
                        ...pushHistory(doc),
                        document: { ...doc, title, reviewStatus: 'ai-draft', updatedAt: new Date().toISOString() },
                    });
                },

                // Item 3: Step Edits (Reverts step and document status to ai-draft on ANY meaningful edit)
                updateStep: (stepId, partial) => {
                    const doc = get().document;
                    if (!doc) return;

                    const isContentEdit = isMeaningfulStepEdit(partial);

                    const steps = doc.steps.map((s) => {
                        if (s.id !== stepId) return s;
                        const nextStep = { ...s, ...partial };
                        if (isContentEdit) {
                            nextStep.reviewStatus = 'ai-draft' as const;
                        }
                        return nextStep;
                    });

                    const nextDocStatus = isContentEdit ? 'ai-draft' : doc.reviewStatus;

                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: nextDocStatus,
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                addStep: (newStep, edgeData) => {
                    const doc = get().document;
                    if (!doc) return;
                    const steps = [...doc.steps, { ...newStep, reviewStatus: 'ai-draft' as const }];
                    const edges = edgeData ? [...doc.edges, edgeData] : doc.edges;

                    // Item 3: Step addition invalidates document reviewStatus to 'ai-draft'
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            edges,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                        selectedStepId: newStep.id,
                        selectedEdgeId: null,
                    });
                },

                // "단계 추가"의 기본 동작: 종료 노드 바로 앞에 새 단계를 끼워 넣는다.
                // 종료 노드로 직접 들어오던 모든 edge를 새 단계로 재배선하고(incoming -> newStep),
                // 새 단계 -> 종료 edge를 하나 추가한다 - 여러 경로가 종료로 직접 들어와도(예: YES/NO가
                // 둘 다 바로 종료로 향하는 경우) 모든 경로가 새 단계를 거쳐 종료하게 되므로 도달성이
                // 보존된다. 종료 노드가 정확히 1개가 아니거나, 종료로 들어오는 edge가 하나도 없어
                // "안전한 삽입 지점"을 결정할 수 없으면 어떤 edge도 만들지 않고 실패를 반환한다 -
                // 호출자(SopWorkspace)가 사용자에게 삽입 위치를 직접 선택하도록 안내해야 한다.
                insertStepBeforeEnd: (newStep) => {
                    const doc = get().document;
                    if (!doc) return { success: false, reason: 'SOP 문서가 없습니다.' };

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
                            reason:
                                '종료 노드로 들어오는 연결선이 없어 안전하게 자동 삽입할 수 없습니다. 캔버스에서 새 단계를 추가한 뒤 직접 연결선을 그어 주세요.',
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

                    const steps = [...doc.steps, { ...newStep, reviewStatus: 'ai-draft' as const }];
                    const edges = [...untouchedEdges, ...rewired, bridgeEdge];

                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            edges,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                        selectedStepId: newStep.id,
                        selectedEdgeId: null,
                    });
                    return { success: true };
                },

                // 시작·종료 노드 삭제 정책: 기본적으로 차단한다. 문서에 시작/종료가 정확히 1개씩
                // 있어야 한다는 불변식(validateSopGraph의 missing/multiple-start/end-nodes)을
                // Inspector의 명시적 삭제 버튼에서 미리 깨뜨리지 않기 위함이다. 다른 terminal로
                // 바꾸고 싶다면 도형을 변경(normalizeStepShapeChange)한 뒤 삭제해야 한다.
                deleteStep: (stepId) => {
                    const doc = get().document;
                    if (!doc) return { success: false, reason: 'SOP 문서가 없습니다.' };
                    const target = doc.steps.find((s) => s.id === stepId);
                    if (!target) return { success: false, reason: '해당 단계를 찾을 수 없습니다.' };
                    if (target.terminalType === 'start' || target.terminalType === 'end') {
                        return {
                            success: false,
                            reason: `${target.terminalType === 'start' ? '시작' : '종료'} 노드는 삭제할 수 없습니다. SOP에는 시작·종료 노드가 각각 정확히 1개씩 있어야 합니다. 도형을 다른 유형으로 먼저 변경한 뒤 삭제해 주세요.`,
                        };
                    }

                    const steps = doc.steps.filter((s) => s.id !== stepId);
                    const edges = doc.edges.filter(
                        (e) => e.source !== stepId && e.target !== stepId
                    );
                    const currentSelected = get().selectedStepId;
                    const nextSelected = currentSelected === stepId ? (steps[0]?.id || null) : currentSelected;

                    // Item 3: Step deletion invalidates document reviewStatus to 'ai-draft'!
                    // NEVER auto-set to 'confirmed' even if remaining steps are confirmed!
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            edges,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                        selectedStepId: nextSelected,
                    });
                    return { success: true };
                },

                // terminal(시작/종료) 노드는 복제할 수 없다 - 그대로 복제하면 terminalType이 같은
                // 노드가 2개가 되어 SOP의 "시작·종료 각각 정확히 1개" 불변식이 즉시 깨진다.
                duplicateStep: (stepId) => {
                    const doc = get().document;
                    if (!doc) return { success: false, reason: 'SOP 문서가 없습니다.' };
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
                    const steps = [...doc.steps, dupStep];

                    // Item 3: Step duplication invalidates document reviewStatus to 'ai-draft'
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                        selectedStepId: newId,
                        selectedEdgeId: null,
                    });
                    return { success: true };
                },

                // Edge Edits (Item 3: Invalidates document reviewStatus)
                updateEdge: (edgeId, partial) => {
                    const doc = get().document;
                    if (!doc) return;
                    const edges = doc.edges.map((e) => (e.id === edgeId ? { ...e, ...partial } : e));
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            edges,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                addEdge: (newEdge) => {
                    const doc = get().document;
                    if (!doc) return;
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            edges: [...doc.edges, newEdge],
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                        selectedEdgeId: newEdge.id,
                    });
                },

                deleteEdge: (edgeId) => {
                    const doc = get().document;
                    if (!doc) return;
                    const edges = doc.edges.filter((e) => e.id !== edgeId);
                    const currentSelectedEdge = get().selectedEdgeId;
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            edges,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                        selectedEdgeId: currentSelectedEdge === edgeId ? null : currentSelectedEdge,
                    });
                },

                // Skill Actions (Item 3: Invalidates step and document status to ai-draft)
                acceptAiSkill: (stepId, skillName) => {
                    const doc = get().document;
                    if (!doc) return;
                    const steps = doc.steps.map((s) => {
                        if (s.id !== stepId) return s;
                        const requiredSkills = s.requiredSkills.map((sk) =>
                            sk.name === skillName ? { ...sk, accepted: true } : sk
                        );
                        return { ...s, requiredSkills, reviewStatus: 'ai-draft' as const };
                    });
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                rejectAiSkill: (stepId, skillName) => {
                    const doc = get().document;
                    if (!doc) return;
                    const steps = doc.steps.map((s) => {
                        if (s.id !== stepId) return s;
                        const requiredSkills = s.requiredSkills.filter((sk) => sk.name !== skillName);
                        return { ...s, requiredSkills, reviewStatus: 'ai-draft' as const };
                    });
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                addSkillToStep: (stepId, skill) => {
                    const doc = get().document;
                    if (!doc) return;
                    const steps = doc.steps.map((s) => {
                        if (s.id !== stepId) return s;
                        if (s.requiredSkills.some((sk) => sk.name === skill.name)) return s;
                        return {
                            ...s,
                            requiredSkills: [...s.requiredSkills, skill],
                            reviewStatus: 'ai-draft' as const,
                        };
                    });
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                removeSkillFromStep: (stepId, skillName) => {
                    const doc = get().document;
                    if (!doc) return;
                    const steps = doc.steps.map((s) => {
                        if (s.id !== stepId) return s;
                        return {
                            ...s,
                            requiredSkills: s.requiredSkills.filter((sk) => sk.name !== skillName),
                            reviewStatus: 'ai-draft' as const,
                        };
                    });
                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: 'ai-draft',
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                // Item 4: Step UI Review Status Updates (CANNOT directly set 'confirmed')
                updateStepReviewStatus: (stepId, status) => {
                    const doc = get().document;
                    if (!doc) return;

                    // Item 4: Block setting 'confirmed' via step UI!
                    const allowedStatus: SopReviewStatus = status === 'confirmed' ? 'reviewed' : status;
                    const steps = doc.steps.map((s) => (s.id === stepId ? { ...s, reviewStatus: allowedStatus } : s));
                    const overallStatus = computeDocumentReviewStatus(steps);

                    set({
                        ...pushHistory(doc),
                        document: {
                            ...doc,
                            steps,
                            reviewStatus: overallStatus,
                            updatedAt: new Date().toISOString(),
                        },
                    });
                },

                // Full Confirmation (ONLY path to set 'confirmed')
                confirmFullSop: () => {
                    const doc = get().document;
                    if (!doc) return { success: false, errors: ['SOP 데이터가 존재하지 않습니다.'] };

                    const errors: string[] = [];

                    // 1. Unreviewed steps check - any step that is NOT 'reviewed'
                    const unreviewedSteps = doc.steps.filter((s) => s.reviewStatus !== 'reviewed' && s.reviewStatus !== 'confirmed');
                    if (unreviewedSteps.length > 0) {
                        errors.push(
                            `미검토 단계가 ${unreviewedSteps.length}개 남아있습니다 (${unreviewedSteps.map((s) => s.title).join(', ')})`
                        );
                    }

                    // 2. Pending AI skills check
                    const unacceptedAiSkills: string[] = [];
                    doc.steps.forEach((s) => {
                        s.requiredSkills.forEach((sk) => {
                            if (sk.source === 'ai-suggested' && !sk.accepted) {
                                unacceptedAiSkills.push(`[${s.title}] ${sk.name}`);
                            }
                        });
                    });
                    if (unacceptedAiSkills.length > 0) {
                        errors.push(`미처리된 AI 제안 SKILL이 ${unacceptedAiSkills.length}개 있습니다 (${unacceptedAiSkills.join(', ')})`);
                    }

                    // 3. Graph level validation (Start/End nodes, decision branches, orphan nodes, cycles)
                    const graphIssues = validateSopGraph(doc.steps, doc.edges);
                    graphIssues.forEach((issue) => {
                        errors.push(issue.message);
                    });

                    if (errors.length > 0) {
                        return { success: false, errors };
                    }

                    // Confirm document ONLY when all validations pass!
                    const updatedSteps = doc.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const }));
                    const now = new Date().toISOString();
                    const updatedDoc: SopDocument = {
                        ...doc,
                        steps: updatedSteps,
                        reviewStatus: 'confirmed',
                        updatedAt: now,
                    };

                    set({
                        ...pushHistory(doc),
                        document: updatedDoc,
                        lastSavedTimestamp: now,
                    });

                    return { success: true, errors: [] };
                },

                saveSnapshot: () => {
                    const doc = get().document;
                    if (!doc) return;
                    const now = new Date().toISOString();
                    set({
                        lastSavedTimestamp: now,
                        document: { ...doc, updatedAt: now },
                    });
                },

                // Undo / Redo
                undo: () => {
                    const { history, document, future } = get();
                    if (history.length === 0 || !document) return;
                    const previous = history[history.length - 1];
                    const newHistory = history.slice(0, history.length - 1);
                    set({
                        document: previous,
                        history: newHistory,
                        future: [document, ...future],
                    });
                },

                redo: () => {
                    const { future, document, history } = get();
                    if (future.length === 0 || !document) return;
                    const next = future[0];
                    const newFuture = future.slice(1);
                    set({
                        document: next,
                        history: [...history, document],
                        future: newFuture,
                    });
                },

                resetStore: () =>
                    set({
                        memberInfo: SAMPLE_SOP_MEMBER,
                        workLibrary: SAMPLE_WORK_LIBRARY,
                        context: '',
                        setupConfig: DEFAULT_SETUP_CONFIG,
                        document: null,
                        selectedStepId: null,
                        selectedEdgeId: null,
                        displayMode: 'standard',
                        customerReviewMode: false,
                        lastSavedTimestamp: null,
                        history: [],
                        future: [],
                    }),
            };
        },
        {
            name: 'sop-prototype-storage',
            version: 1,
            migrate: (persistedState: unknown) => {
                if (!persistedState || typeof persistedState !== 'object') return persistedState;
                const state = persistedState as Record<string, unknown>;
                return {
                    ...state,
                    displayMode: state.displayMode || 'standard',
                    customerReviewMode: state.customerReviewMode || false,
                };
            },
            storage: createJSONStorage(() => customStorage),
            partialize: (state) => ({
                memberInfo: state.memberInfo,
                workLibrary: state.workLibrary,
                context: state.context,
                setupConfig: state.setupConfig,
                document: state.document,
                displayMode: state.displayMode,
                customerReviewMode: state.customerReviewMode,
                lastSavedTimestamp: state.lastSavedTimestamp,
            }),
        }
    )
);
