import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
    SopDocument,
    SopStepData,
    SopEdge,
    SopMember,
    WorkLibrarySelection,
    SopSetupConfig,
    SopReviewStatus,
    SopRequiredSkill,
    SopAgentizationScope,
    SopAiApplicationMode,
} from './sop-types';
import { SAMPLE_SOP_DOCUMENT, SAMPLE_SOP_MEMBER, SAMPLE_WORK_LIBRARY } from './sop-sample-data';
import { layoutSopGraph } from './sop-layout';
import {
    resetAgentizationConfirmation,
    withAgentizationScope,
    withAgentizationDefaultMode,
    withAgentizationStepMode,
    withToggledAgentizationStep,
    withAgentizationNote,
    confirmAgentizationReview,
} from './sop-agentization';
import * as mutations from './sop-document-mutations';
import { applyStepReviewStatus, validateFullSopConfirmation } from './sop-review';
import { createBrowserSopDraftStorage, SOP_DRAFT_STORAGE_KEY } from './sop-draft-storage';

function withWorkLibraryCatalog(library: unknown): WorkLibrarySelection | undefined {
    if (!library || typeof library !== 'object') return undefined;
    const current = library as Partial<WorkLibrarySelection>;
    if (current.taskCatalog?.length) return current as WorkLibrarySelection;

    const sampleTask = SAMPLE_WORK_LIBRARY.taskCatalog[0];
    const currentSkills = Array.isArray(current.skills) && current.skills.length ? current.skills : sampleTask.activities[0].skills;
    const firstActivity = {
        ...sampleTask.activities[0],
        id: current.activityId || sampleTask.activities[0].id,
        name: current.activityName || sampleTask.activities[0].name,
        skills: currentSkills,
    };

    return {
        ...SAMPLE_WORK_LIBRARY,
        ...current,
        taskId: current.taskId || sampleTask.id,
        taskName: current.taskName || sampleTask.name,
        activityId: firstActivity.id,
        activityName: firstActivity.name,
        taskCatalog: [
            {
                ...sampleTask,
                id: current.taskId || sampleTask.id,
                name: current.taskName || sampleTask.name,
                activities: [firstActivity, ...sampleTask.activities.slice(1)],
            },
        ],
    };
}

interface SopPrototypeState {
    // Setup Gate States
    memberInfo: SopMember;
    workLibrary: WorkLibrarySelection;
    context: string;
    setupConfig: SopSetupConfig;

    // Workspace Active Document
    document: SopDocument | null;
    selectedStepId: string | null;
    selectedEdgeId: string | null;
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
    /** Returns null when customer review mode keeps the current document read-only. */
    generateFromSample: () => SopDocument | null;
    /** Returns false when customer review mode keeps the current document read-only. */
    setDocument: (doc: SopDocument) => boolean;

    // Actions - Workspace Navigation & Selection
    selectStep: (stepId: string | null) => void;
    selectEdge: (edgeId: string | null) => void;
    /** Deterministic mode transition for cross-screen navigation. */
    setCustomerReviewMode: (enabled: boolean) => void;
    toggleCustomerReviewMode: () => void;
    setAgentizationScope: (scope: SopAgentizationScope) => void;
    setAgentizationDefaultMode: (mode: SopAiApplicationMode) => void;
    /** `mode` undefined clears the step's judgement; an unset step remains human-performed. */
    setAgentizationStepMode: (stepId: string, mode?: SopAiApplicationMode) => void;
    toggleAgentizationStep: (stepId: string) => void;
    setAgentizationNote: (note: string) => void;
    confirmAgentization: () => { success: boolean; message: string };

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

function removeLegacySetupSourceType(config: unknown): SopSetupConfig | undefined {
    if (!config || typeof config !== 'object') return undefined;
    const current = { ...(config as Record<string, unknown>) };
    delete current.sourceType;
    return { ...DEFAULT_SETUP_CONFIG, ...current } as SopSetupConfig;
}

/** Pure v2 -> v3 persistence migration; exported so legacy data remains regression-testable. */
export function migrateSopPrototypePersistedState(persistedState: unknown): unknown {
    if (!persistedState || typeof persistedState !== 'object') return persistedState;
    const state = persistedState as Record<string, unknown>;
    const workLibrary = withWorkLibraryCatalog(state.workLibrary);
    const document = state.document && typeof state.document === 'object'
        ? {
            ...(state.document as SopDocument),
            workLibrary: withWorkLibraryCatalog((state.document as SopDocument).workLibrary) || SAMPLE_WORK_LIBRARY,
            setupConfig: removeLegacySetupSourceType((state.document as SopDocument).setupConfig),
        }
        : state.document;
    return {
        ...state,
        workLibrary: workLibrary || SAMPLE_WORK_LIBRARY,
        setupConfig: removeLegacySetupSourceType(state.setupConfig) || DEFAULT_SETUP_CONFIG,
        document,
        customerReviewMode: state.customerReviewMode || false,
    };
}

export const useSopPrototypeStore = create<SopPrototypeState>()(
    persist(
        (set, get) => {
            const pushHistory = (currentDoc: SopDocument) => {
                const history = get().history.slice(-19);
                return { history: [...history, currentDoc], future: [] };
            };

            // Customer review mode guarantees the document a customer is looking at cannot
            // change underneath them. Every action that edits `document` (or replays/reverts
            // it) must check this first; navigation/selection actions are exempt.
            const isCustomerReviewLocked = () => get().customerReviewMode;

            // Single path for edits that must invalidate both the SOP review status and any
            // confirmed Agent화 judgement, since both attest to a document state the edit just
            // moved past. `invalidate: false` is only for edits with no reviewable meaning
            // (e.g. a node drag that only moves `position`). The actual patch content (what
            // changed) is computed by pure builders in sop-document-mutations.ts; this helper
            // only owns the state-wiring (history, invalidation, timestamp, set()).
            const applyDocumentMutation = (
                doc: SopDocument,
                docPatch: Partial<SopDocument>,
                options?: { invalidate?: boolean; extraState?: Partial<SopPrototypeState> }
            ) => {
                const invalidate = options?.invalidate ?? true;
                set({
                    ...pushHistory(doc),
                    ...options?.extraState,
                    document: {
                        ...doc,
                        ...docPatch,
                        reviewStatus: invalidate ? 'ai-draft' : doc.reviewStatus,
                        agentizationReview: invalidate ? resetAgentizationConfirmation(doc) : doc.agentizationReview,
                        updatedAt: new Date().toISOString(),
                    },
                });
            };

            // Wires an Agent화 review builder (sop-agentization.ts) through the same
            // guard + history + set() path every agentization action shares.
            const applyAgentizationReview = (doc: SopDocument, review: ReturnType<typeof withAgentizationScope> | null) => {
                if (!review) return;
                set({
                    ...pushHistory(doc),
                    document: { ...doc, agentizationReview: review, updatedAt: new Date().toISOString() },
                });
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
                            partial.taskCatalog !== undefined ||
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
                    if (isCustomerReviewLocked()) return null;
                    const state = get();
                    const now = new Date().toISOString();
                    const layout = layoutSopGraph(SAMPLE_SOP_DOCUMENT.steps, SAMPLE_SOP_DOCUMENT.edges);
                    const doc: SopDocument = {
                        ...SAMPLE_SOP_DOCUMENT,
                        id: `sop-sample-${Date.now()}`,
                        member: { ...state.memberInfo },
                        workLibrary: { ...state.workLibrary, confirmed: true },
                        context: state.context || SAMPLE_SOP_DOCUMENT.context,
                        reviewStatus: 'ai-draft',
                        steps: layout.steps.map((s) => ({ ...s, reviewStatus: 'ai-draft' as const })),
                        edges: layout.edges,
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
                    if (isCustomerReviewLocked()) return false;
                    const now = new Date().toISOString();
                    set({
                        document: { ...doc, updatedAt: now },
                        selectedStepId: doc.steps[0]?.id || null,
                        selectedEdgeId: null,
                        lastSavedTimestamp: now,
                        history: [],
                        future: [],
                    });
                    return true;
                },

                // Mode and Selection
                selectStep: (stepId) => set({ selectedStepId: stepId, selectedEdgeId: null }),
                selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedStepId: null }),

                setCustomerReviewMode: (enabled) => set({ customerReviewMode: enabled }),

                toggleCustomerReviewMode: () =>
                    set((state) => ({ customerReviewMode: !state.customerReviewMode })),

                setAgentizationScope: (scope) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyAgentizationReview(doc, withAgentizationScope(doc, scope));
                },

                setAgentizationDefaultMode: (mode) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyAgentizationReview(doc, withAgentizationDefaultMode(doc, mode));
                },

                setAgentizationStepMode: (stepId, mode) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyAgentizationReview(doc, withAgentizationStepMode(doc, stepId, mode));
                },

                toggleAgentizationStep: (stepId) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyAgentizationReview(doc, withToggledAgentizationStep(doc, stepId));
                },

                setAgentizationNote: (note) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyAgentizationReview(doc, withAgentizationNote(doc, note));
                },

                confirmAgentization: () => {
                    const doc = get().document;
                    if (!doc) return { success: false, message: 'SOP 문서가 없습니다.' };
                    if (isCustomerReviewLocked()) return { success: false, message: '고객 검토 모드에서는 Agent화 판단을 확정할 수 없습니다.' };
                    const result = confirmAgentizationReview(doc);
                    if (result.success && result.review) {
                        set({
                            ...pushHistory(doc),
                            document: { ...doc, agentizationReview: result.review, updatedAt: result.review.confirmedAt! },
                        });
                    }
                    return { success: result.success, message: result.message };
                },

                updateDocumentTitle: (title) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, { title });
                },

                // Reverts step and document status to 'ai-draft' on any meaningful edit; a
                // position-only change (drag) carries no reviewable meaning and is exempt.
                updateStep: (stepId, partial) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const { steps, invalidate } = mutations.buildUpdateStepPatch(doc, stepId, partial);
                    applyDocumentMutation(doc, { steps }, { invalidate });
                },

                addStep: (newStep, edgeData) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const patch = mutations.buildAddStepPatch(doc, newStep, edgeData);
                    applyDocumentMutation(doc, patch, {
                        extraState: { selectedStepId: newStep.id, selectedEdgeId: null },
                    });
                },

                insertStepBeforeEnd: (newStep) => {
                    const doc = get().document;
                    if (!doc) return { success: false, reason: 'SOP 문서가 없습니다.' };
                    if (isCustomerReviewLocked()) {
                        return { success: false, reason: '고객 검토 모드에서는 단계를 추가할 수 없습니다.' };
                    }
                    const result = mutations.buildInsertStepBeforeEndPatch(doc, newStep);
                    if (!result.success) return result;
                    applyDocumentMutation(doc, { steps: result.steps, edges: result.edges }, {
                        extraState: { selectedStepId: newStep.id, selectedEdgeId: null },
                    });
                    return { success: true };
                },

                deleteStep: (stepId) => {
                    const doc = get().document;
                    if (!doc) return { success: false, reason: 'SOP 문서가 없습니다.' };
                    if (isCustomerReviewLocked()) {
                        return { success: false, reason: '고객 검토 모드에서는 단계를 삭제할 수 없습니다.' };
                    }
                    const result = mutations.buildDeleteStepPatch(doc, stepId, get().selectedStepId);
                    if (!result.success) return result;
                    // Step deletion always invalidates reviewStatus to 'ai-draft' — it must
                    // never auto-promote to 'confirmed' even if the remaining steps are.
                    applyDocumentMutation(doc, { steps: result.steps, edges: result.edges }, {
                        extraState: { selectedStepId: result.nextSelectedStepId },
                    });
                    return { success: true };
                },

                duplicateStep: (stepId) => {
                    const doc = get().document;
                    if (!doc) return { success: false, reason: 'SOP 문서가 없습니다.' };
                    if (isCustomerReviewLocked()) {
                        return { success: false, reason: '고객 검토 모드에서는 단계를 복제할 수 없습니다.' };
                    }
                    const result = mutations.buildDuplicateStepPatch(doc, stepId);
                    if (!result.success) return result;
                    applyDocumentMutation(doc, { steps: result.steps }, {
                        extraState: { selectedStepId: result.newStepId, selectedEdgeId: null },
                    });
                    return { success: true };
                },

                // Edge Edits (invalidate document reviewStatus + agentization confirmation)
                updateEdge: (edgeId, partial) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, mutations.buildUpdateEdgePatch(doc, edgeId, partial));
                },

                addEdge: (newEdge) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, mutations.buildAddEdgePatch(doc, newEdge), {
                        extraState: { selectedEdgeId: newEdge.id },
                    });
                },

                deleteEdge: (edgeId) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const { edges, nextSelectedEdgeId } = mutations.buildDeleteEdgePatch(doc, edgeId, get().selectedEdgeId);
                    applyDocumentMutation(doc, { edges }, { extraState: { selectedEdgeId: nextSelectedEdgeId } });
                },

                // Skill Actions — invalidate step/document review status AND any confirmed
                // Agent화 judgement, since a changed skill set can change what a step's AI
                // participation judgement was actually made against.
                acceptAiSkill: (stepId, skillName) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, mutations.buildAcceptAiSkillPatch(doc, stepId, skillName));
                },

                rejectAiSkill: (stepId, skillName) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, mutations.buildRejectAiSkillPatch(doc, stepId, skillName));
                },

                addSkillToStep: (stepId, skill) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, mutations.buildAddSkillToStepPatch(doc, stepId, skill));
                },

                removeSkillFromStep: (stepId, skillName) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    applyDocumentMutation(doc, mutations.buildRemoveSkillFromStepPatch(doc, stepId, skillName));
                },

                // Step-level review status toggle. Cannot directly set 'confirmed' — that
                // status is only reachable through confirmFullSop's full validation pass.
                updateStepReviewStatus: (stepId, status) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const { steps, reviewStatus } = applyStepReviewStatus(doc, stepId, status);
                    set({
                        ...pushHistory(doc),
                        document: { ...doc, steps, reviewStatus, updatedAt: new Date().toISOString() },
                    });
                },

                // Full Confirmation (ONLY path to set 'confirmed')
                confirmFullSop: () => {
                    const doc = get().document;
                    if (!doc) return { success: false, errors: ['SOP 데이터가 존재하지 않습니다.'] };
                    if (isCustomerReviewLocked()) {
                        return { success: false, errors: ['고객 검토 모드에서는 SOP를 확정할 수 없습니다.'] };
                    }
                    const result = validateFullSopConfirmation(doc);
                    if (!result.success) return { success: false, errors: result.errors };
                    set({
                        ...pushHistory(doc),
                        document: result.confirmedDocument,
                        lastSavedTimestamp: result.confirmedDocument.updatedAt,
                    });
                    return { success: true, errors: [] };
                },

                saveSnapshot: () => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const now = new Date().toISOString();
                    set({
                        lastSavedTimestamp: now,
                        document: { ...doc, updatedAt: now },
                    });
                },

                // Undo / Redo
                undo: () => {
                    const { history, document, future } = get();
                    if (history.length === 0 || !document || isCustomerReviewLocked()) return;
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
                    if (future.length === 0 || !document || isCustomerReviewLocked()) return;
                    const next = future[0];
                    const newFuture = future.slice(1);
                    set({
                        document: next,
                        history: [...history, document],
                        future: newFuture,
                    });
                },

                // Reset is an explicit session exit: it intentionally clears customer review
                // mode together with the document instead of behaving like an in-workspace edit.
                resetStore: () =>
                    set({
                        memberInfo: SAMPLE_SOP_MEMBER,
                        workLibrary: SAMPLE_WORK_LIBRARY,
                        context: '',
                        setupConfig: DEFAULT_SETUP_CONFIG,
                        document: null,
                        selectedStepId: null,
                        selectedEdgeId: null,
                        customerReviewMode: false,
                        lastSavedTimestamp: null,
                        history: [],
                        future: [],
                    }),
            };
        },
        {
            name: SOP_DRAFT_STORAGE_KEY,
            version: 3,
            migrate: migrateSopPrototypePersistedState,
            storage: createJSONStorage(createBrowserSopDraftStorage),
            partialize: (state) => ({
                memberInfo: state.memberInfo,
                workLibrary: state.workLibrary,
                context: state.context,
                setupConfig: state.setupConfig,
                document: state.document,
                customerReviewMode: state.customerReviewMode,
                lastSavedTimestamp: state.lastSavedTimestamp,
            }),
        }
    )
);
