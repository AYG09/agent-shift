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
    resolveCreationSource,
} from './sop-types';
import { CUSTOMER_SOP_MEMBER, CUSTOMER_WORK_LIBRARY, buildTaskGateSampleDocument } from './sop-sample-data';
import { createTaskLibrarySelectionForRole, findTaskLibraryTaskById, getScopedSkills, withCatalogActivityOrders } from './sop-task-library';
import {
    ANONYMOUS_MEMBER_SESSION,
    EMPTY_MEMBER_CONTEXT,
    IDLE_TASK_RECOMMENDATION,
    LEGACY_SAMPLE_CONTEXT_SENTENCE,
    authenticateMemberSession,
    confirmMemberContext,
    isSameMember,
    isStaleRecommendationResponse,
    migrateMemberIntakeState,
    normalizeWorkContext,
    validateMemberIdentity,
    type MemberContextState,
    type MemberIdentityValidation,
    type PrototypeMemberSession,
    type TaskRecommendationCandidateState,
    type TaskRecommendationState,
} from './sop-member-intake';
import * as workMapDraft from './sop-work-map-draft';
import type { MemberWorkMapDraft } from './sop-work-map-draft';
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
import { applyStepReviewStatus, applyBulkStepReview, validateFullSopConfirmation } from './sop-review';
import { createBrowserSopDraftStorage, SOP_DRAFT_STORAGE_KEY } from './sop-draft-storage';

function withWorkLibraryCatalog(library: unknown): WorkLibrarySelection | undefined {
    if (!library || typeof library !== 'object') return undefined;
    const current = library as Partial<WorkLibrarySelection>;
    if (current.taskCatalog?.length) {
        const selection = { ...current, taskCatalog: withCatalogActivityOrders(current.taskCatalog) } as WorkLibrarySelection;
        return { ...selection, skills: getScopedSkills(selection) };
    }

    const sampleTask = CUSTOMER_WORK_LIBRARY.taskCatalog[0];
    const currentSkills = Array.isArray(current.skills) && current.skills.length ? current.skills : sampleTask.activities[0].skills;
    const firstActivity = {
        ...sampleTask.activities[0],
        id: current.activityId || sampleTask.activities[0].id,
        name: current.activityName || sampleTask.activities[0].name,
        skills: currentSkills,
    };

    return {
        ...CUSTOMER_WORK_LIBRARY,
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
    // 구성원 intake (재설계 흐름: 로그인 → 업무맥락 → 추천 → Work Map)
    /** 프로토타입 로그인 세션. 기본값은 언제나 anonymous — memberInfo 샘플은 인증 근거가 아니다. */
    memberSession: PrototypeMemberSession;
    /** 추천과 SOP 생성이 함께 읽는 **단일** 업무맥락 (SSOT). */
    memberContext: MemberContextState;
    taskRecommendation: TaskRecommendationState;
    /** 확정 Task를 복제한 member-owned Work Map. simple/detailed가 함께 읽고 함께 고친다. */
    workMapDraft: MemberWorkMapDraft | null;

    // Setup Gate States
    memberInfo: SopMember;
    workLibrary: WorkLibrarySelection;
    /**
     * @deprecated `memberContext.draft`의 읽기 전용 미러. 기존 Gate 화면이 계속
     * 동작하도록 남겨 둔 호환 뷰이며, 쓰기는 항상 setContext/
     * setTaskRecommendationInput을 통해 단일 원본으로 들어간다. Wave 2가 화면을
     * 연결하면서 이 미러의 사용처를 정리한다.
     */
    context: string;
    setupConfig: SopSetupConfig;
    /** @deprecated `context`와 같은 미러. 두 입력은 더 이상 독립된 원본이 아니다. */
    taskRecommendationInput: string;

    // Workspace Active Document
    document: SopDocument | null;
    selectedStepId: string | null;
    selectedEdgeId: string | null;
    selectedSourceActivityId: string | null;
    customerReviewMode: boolean;
    lastSavedTimestamp: string | null;

    // Undo / Redo History
    history: SopDocument[];
    future: SopDocument[];

    // Actions - Setup Gate & Work Library
    setMemberInfo: (member: Partial<SopMember>) => void;
    /** Prototype-only persona switch; production login integration is intentionally not implemented. */
    useSamplePersona: (member: SopMember) => void;
    setWorkLibrary: (library: Partial<WorkLibrarySelection>) => void;
    confirmWorkLibrary: () => void;
    reopenWorkLibrary: () => void;
    setContext: (context: string) => void;
    setSetupConfig: (config: Partial<SopSetupConfig>) => void;
    setTaskRecommendationInput: (input: string) => void;

    // Actions - 구성원 intake
    /** 검증 실패 시 field error를 돌려주고 세션을 만들지 않는다. */
    submitMemberIdentity: (input: Partial<SopMember>) => MemberIdentityValidation;
    /** 저장된 SOP record는 건드리지 않고 intake 세션과 미확정 초안만 정리한다. */
    signOutMember: () => void;
    setMemberContextDraft: (draft: string) => void;
    /** 공백 입력이면 null을 돌려주고 아무 상태도 만들지 않는다 (TST-REC-001). */
    submitMemberContext: () => { contextKey: string } | null;
    /** 같은 contextKey로 이미 요청이 진행 중이면 false — 중복 호출 방지 (TST-STATE-003). */
    beginTaskRecommendationRequest: (contextKey: string) => boolean;
    applyTaskRecommendations: (contextKey: string, candidates: TaskRecommendationCandidateState[]) => boolean;
    failTaskRecommendation: (contextKey: string, error: string) => boolean;
    cancelTaskRecommendation: () => void;
    /** 추천 성공이 아니라 이 명시적 확정만이 Work Map을 만든다 (REQ-REC-004). */
    confirmRecommendedTask: (taskId: string) => boolean;
    /**
     * 동료 SOP·과거 작성 복제본에서 Work Map 초안을 채택한다 (`INT-CLONE-001`).
     * `resolveCreationSource(document)`로 origin을 판정하므로 호출자가 origin을 따로
     * 넘기지 않는다. Task 출처 문서이거나 문서 스냅샷에서 선택 Task를 찾을 수 없으면
     * `false`를 돌려주고 아무 상태도 바꾸지 않는다.
     */
    adoptClonedWorkMap: (document: SopDocument) => boolean;

    // Actions - Work Map 초안 (simple/detailed 공용)
    updateWorkMapTask: (patch: { name?: string; description?: string }) => void;
    updateWorkMapActivity: (activityId: string, patch: { name?: string; description?: string }) => void;
    addWorkMapActivity: (input?: { name?: string; description?: string }) => string | null;
    deleteWorkMapActivity: (activityId: string) => void;
    moveWorkMapActivity: (activityId: string, direction: 'up' | 'down') => void;
    updateWorkMapSkill: (activityId: string, skillId: string, patch: { name?: string; description?: string }) => void;
    addWorkMapSkill: (activityId: string, input?: { name?: string; description?: string }) => string | null;
    deleteWorkMapSkill: (activityId: string, skillId: string) => void;
    confirmWorkMap: () => ReturnType<typeof workMapDraft.confirmWorkMapDraft> | null;
    reopenWorkMap: () => void;
    discardWorkMapDraft: () => void;
    /** Returns null when customer review mode keeps the current document read-only. */
    generateFromSample: () => SopDocument | null;
    /** Returns false when customer review mode keeps the current document read-only. */
    setDocument: (doc: SopDocument) => boolean;

    // Actions - Workspace Navigation & Selection
    selectStep: (stepId: string | null) => void;
    selectEdge: (edgeId: string | null) => void;
    selectSourceActivity: (activityId: string | null) => void;
    setStepSourceActivities: (stepId: string, activityIds: string[]) => void;
    setStepSubActionOrder: (stepId: string, order: number) => void;
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
    /** 미검토(ai-draft) 단계를 일괄 '검토됨'으로 바꾼다. activityId를 주면 그 Activity의 Sub Action만. 변경된 단계 수를 반환한다. */
    markStepsReviewedBulk: (activityId?: string) => number;
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

/**
 * Pure legacy -> v6 persistence migration.
 * v4: removes obsolete scope state and derives missing Activity order.
 * v5: introduces `memberInfo.grade` and `SopDocument.structureVersion` /
 * per-step `subActionOrder`/`agentizationSuggestion` — all additive-optional
 * fields, so no persisted value needs to change shape. The one real invariant
 * this migration enforces: a persisted `document` that predates this version
 * must NOT be stamped with `structureVersion` here — that discriminator may
 * only ever be set by an actual Activity–Sub Action generation/clone, never by
 * a migration pass, or a legacy document would be silently disguised as the
 * newer structure (see member-home-subaction-contract.md §2.4).
 *
 * v6: 두 개의 독립된 업무맥락 문자열(`taskRecommendationInput`, `context`)을
 * 하나의 권위 있는 `memberContext`로 합치고, 프로토타입 로그인 세션·추천 상태·
 * Work Map 초안을 추가한다. 합치는 규칙은 sop-member-intake.ts의
 * migrateMemberIntakeState가 원천이다(Store가 재구현하지 않는다): 구성원이 직접 쓴
 * 추천 입력이 우선이고, fixture의 샘플 안내 문장은 실제 업무맥락으로 승격하지
 * 않으며, 자동 제출하지 않고, 채택되지 않은 legacy 원문도 보존한다. 세션은
 * 항상 `anonymous`로 마이그레이션된다 — 저장된 memberInfo 샘플은 로그인 폼의
 * 빠른 입력값일 뿐 누군가 로그인했다는 근거가 아니다 (SPEC §3.1).
 */
export function migrateSopPrototypePersistedState(persistedState: unknown): unknown {
    if (!persistedState || typeof persistedState !== 'object') return persistedState;
    const state = persistedState as Record<string, unknown>;
    const workLibrary = withWorkLibraryCatalog(state.workLibrary);
    const document = state.document && typeof state.document === 'object'
        ? {
            ...(state.document as SopDocument),
            workLibrary: withWorkLibraryCatalog((state.document as SopDocument).workLibrary) || CUSTOMER_WORK_LIBRARY,
            setupConfig: removeLegacySetupSourceType((state.document as SopDocument).setupConfig),
        }
        : state.document;
    const intake = migrateMemberIntakeState({ taskRecommendationInput: state.taskRecommendationInput, context: state.context });
    return {
        ...state,
        workLibrary: workLibrary || CUSTOMER_WORK_LIBRARY,
        setupConfig: removeLegacySetupSourceType(state.setupConfig) || DEFAULT_SETUP_CONFIG,
        document,
        customerReviewMode: state.customerReviewMode || false,
        memberSession: intake.session,
        memberContext: intake.memberContext,
        taskRecommendation: intake.recommendation,
        // 확정 Task를 다시 고르기 전까지 Work Map은 없다. legacy 상태에는 member-owned
        // 스냅샷이라는 개념 자체가 없었으므로 추측해서 만들지 않는다.
        workMapDraft: null,
        context: intake.memberContext.draft,
        taskRecommendationInput: intake.memberContext.draft,
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

            // 미러 필드(context / taskRecommendationInput)를 단일 원본과 함께 갱신하는
            // 유일한 경로. 두 legacy 입력이 서로 다른 값을 갖는 상태를 만들지 않는다.
            const writeContextDraft = (draft: string) => {
                set((state) => ({
                    memberContext: { ...state.memberContext, draft },
                    context: draft,
                    taskRecommendationInput: draft,
                }));
            };

            const clearIntakeProgress = () => ({
                memberContext: { ...EMPTY_MEMBER_CONTEXT },
                taskRecommendation: { ...IDLE_TASK_RECOMMENDATION },
                workMapDraft: null,
                context: '',
                taskRecommendationInput: '',
            });

            // Work Map mutation 공통 배선: 초안이 없으면 아무 것도 하지 않고, 있으면
            // 순수 함수 결과를 그대로 반영한다(confirmed 해제는 순수 함수가 담당).
            const applyWorkMapMutation = (mutate: (draft: MemberWorkMapDraft) => MemberWorkMapDraft) => {
                const current = get().workMapDraft;
                if (!current) return;
                set({ workMapDraft: mutate(current) });
            };

            return {
                memberSession: { ...ANONYMOUS_MEMBER_SESSION },
                memberContext: { ...EMPTY_MEMBER_CONTEXT },
                taskRecommendation: { ...IDLE_TASK_RECOMMENDATION },
                workMapDraft: null,

                memberInfo: CUSTOMER_SOP_MEMBER,
                workLibrary: CUSTOMER_WORK_LIBRARY,
                context: LEGACY_SAMPLE_CONTEXT_SENTENCE,
                setupConfig: DEFAULT_SETUP_CONFIG,
                taskRecommendationInput: '',

                document: null,
                selectedStepId: null,
                selectedEdgeId: null,
                selectedSourceActivityId: null,
                customerReviewMode: false,
                lastSavedTimestamp: null,

                history: [],
                future: [],

                // Setup Gate Handlers
                setMemberInfo: (partial) =>
                    set((state) => ({ memberInfo: { ...state.memberInfo, ...partial } })),

                useSamplePersona: (member) => set({ memberInfo: member, workLibrary: createTaskLibrarySelectionForRole(member.jobRole) }),

                setWorkLibrary: (partial) =>
                    set((state) => {
                        const updated = { ...state.workLibrary, ...partial };
                        if ('confirmed' in partial) {
                            updated.confirmed = partial.confirmed!;
                        } else if (
                            partial.taskName !== undefined ||
                            partial.taskId !== undefined ||
                            partial.activityName !== undefined ||
                            partial.activityId !== undefined ||
                            partial.jobId !== undefined ||
                            partial.sourceJobId !== undefined ||
                            partial.jobName !== undefined ||
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

                setContext: (context) => writeContextDraft(context),

                setSetupConfig: (partial) =>
                    set((state) => ({ setupConfig: { ...state.setupConfig, ...partial } })),

                setTaskRecommendationInput: (input) => writeContextDraft(input),

                submitMemberIdentity: (input) => {
                    const validation = validateMemberIdentity(input);
                    if (!validation.ok) return validation;
                    const previous = get().memberSession.member;
                    // 다른 구성원으로 바뀌면 이전 구성원의 미확정 intake 진행 상태를
                    // 물려주지 않는다 (§4.2). 저장된 SOP record는 건드리지 않는다.
                    const reset = isSameMember(previous, validation.member) ? {} : clearIntakeProgress();
                    set({
                        ...reset,
                        memberSession: authenticateMemberSession(validation.member, new Date().toISOString()),
                        // 병합(`{...old, ...new}`)이 아니라 완전 대체다: 로그인 폼은 `id`를
                        // 입력받지 않으므로, 병합했다면 초기/샘플 memberInfo(CUSTOMER_SOP_MEMBER,
                        // id: 'member-001')의 `id`가 실제로 로그인한 구성원 뒤에 영영 남는다.
                        // listMySopRecords 등 record 조회는 `member.id || member.employeeId`
                        // 순으로 식별자를 고르므로, 그 남은 `id`가 실제 로그인한 구성원의
                        // employeeId보다 우선해 다른 구성원(샘플)의 record를 계속 조회하게
                        // 만든다 — INT-LAND-001의 착지 판정(record 유무)이 항상 "0건"으로
                        // 나오는 방식으로 깨진다. validation.member를 그대로 쓰면 이전
                        // memberInfo의 잔여 필드가 새 로그인에 새지 않는다.
                        memberInfo: validation.member,
                    });
                    return validation;
                },

                signOutMember: () =>
                    set({ ...clearIntakeProgress(), memberSession: { ...ANONYMOUS_MEMBER_SESSION } }),

                setMemberContextDraft: (draft) => writeContextDraft(draft),

                submitMemberContext: () => {
                    const state = get();
                    const result = confirmMemberContext({
                        context: state.memberContext,
                        recommendation: state.taskRecommendation,
                        hasWorkMapDraft: !!state.workMapDraft,
                        now: new Date().toISOString(),
                    });
                    if (!result) return null;
                    set({
                        memberContext: result.context,
                        taskRecommendation: result.recommendation,
                        workMapDraft: result.discardWorkMapDraft ? null : state.workMapDraft,
                        context: result.context.draft,
                        taskRecommendationInput: result.context.draft,
                    });
                    return { contextKey: result.contextKey };
                },

                beginTaskRecommendationRequest: (contextKey) => {
                    const current = get().taskRecommendation;
                    // 이미 같은 맥락으로 요청을 **보낸** 적이 있으면 두 번째 호출을
                    // 거절한다. React Strict Mode의 재마운트나 rerender가 중복 요청을
                    // 만들지 못하게 하는 도메인 차원의 guard다 (TST-STATE-003).
                    // `pending`은 "요청해야 한다"는 뜻이고 `requested`는 "실제로
                    // 보냈다"는 뜻이라 두 값이 필요하다.
                    if (current.requested && current.contextKey === contextKey) return false;
                    set({ taskRecommendation: { status: 'pending', candidates: [], contextKey, requested: true } });
                    return true;
                },

                applyTaskRecommendations: (contextKey, candidates) => {
                    const current = get().taskRecommendation;
                    if (isStaleRecommendationResponse(current, contextKey)) return false;
                    set({ taskRecommendation: { status: 'ready', candidates, contextKey } });
                    return true;
                },

                failTaskRecommendation: (contextKey, error) => {
                    const current = get().taskRecommendation;
                    if (isStaleRecommendationResponse(current, contextKey)) return false;
                    // 실패는 입력을 지우지 않는다. 재시도·수정·수동 선택이 모두 가능해야 한다.
                    set({ taskRecommendation: { status: 'error', candidates: [], contextKey, error } });
                    return true;
                },

                cancelTaskRecommendation: () =>
                    set((state) => ({ taskRecommendation: { ...IDLE_TASK_RECOMMENDATION, contextKey: state.taskRecommendation.contextKey } })),

                confirmRecommendedTask: (taskId) => {
                    const state = get();
                    const found = findTaskLibraryTaskById(taskId);
                    if (!found) return false;
                    set({
                        workMapDraft: workMapDraft.createWorkMapDraftFromCatalog({
                            job: found.job,
                            task: found.task,
                            contextText: normalizeWorkContext(state.memberContext.confirmedText ?? state.memberContext.draft),
                            now: new Date().toISOString(),
                        }),
                    });
                    return true;
                },

                // 왜 memberContext까지 함께 채우는가: Work Map route 가드
                // (resolveIntakeRouteAccess)는 "제출된 업무맥락"을 요구한다. 복제본의
                // 업무맥락은 이미 그 문서가 실제로 생성될 때 쓰인 원문이므로, 이 대입은
                // 가드를 우회하는 것이 아니라 그 조건을 정당하게 충족시키는 것이다 —
                // resolveIntakeRouteAccess의 조건식 자체는 바꾸지 않는다 (SPEC.md §2.3
                // INT-CLONE-001). Task 경로 구성원은 여전히 스스로 업무맥락을 제출해야만
                // Work Map에 들어갈 수 있다.
                adoptClonedWorkMap: (document) => {
                    if (isCustomerReviewLocked()) return false;
                    const origin = resolveCreationSource(document);
                    if (origin === 'task') return false;
                    const draft = workMapDraft.createWorkMapDraftFromDocument({ document, origin, now: new Date().toISOString() });
                    if (!draft) return false;
                    const confirmedText = normalizeWorkContext(document.context);
                    set((state) => ({
                        workMapDraft: draft,
                        memberContext: { ...state.memberContext, draft: confirmedText, confirmedText, confirmedAt: draft.createdAt },
                        context: confirmedText,
                        taskRecommendationInput: confirmedText,
                    }));
                    return true;
                },

                updateWorkMapTask: (patch) => applyWorkMapMutation((draft) => workMapDraft.updateWorkMapTask(draft, patch)),

                updateWorkMapActivity: (activityId, patch) =>
                    applyWorkMapMutation((draft) => workMapDraft.updateWorkMapActivity(draft, activityId, patch)),

                addWorkMapActivity: (input) => {
                    const current = get().workMapDraft;
                    if (!current) return null;
                    const result = workMapDraft.addWorkMapActivity(current, input);
                    set({ workMapDraft: result.draft });
                    return result.activityId;
                },

                deleteWorkMapActivity: (activityId) => applyWorkMapMutation((draft) => workMapDraft.deleteWorkMapActivity(draft, activityId)),

                moveWorkMapActivity: (activityId, direction) =>
                    applyWorkMapMutation((draft) => workMapDraft.moveWorkMapActivity(draft, activityId, direction)),

                updateWorkMapSkill: (activityId, skillId, patch) =>
                    applyWorkMapMutation((draft) => workMapDraft.updateWorkMapSkill(draft, activityId, skillId, patch)),

                addWorkMapSkill: (activityId, input) => {
                    const current = get().workMapDraft;
                    if (!current) return null;
                    const result = workMapDraft.addWorkMapSkill(current, activityId, input);
                    set({ workMapDraft: result.draft });
                    return result.skillId;
                },

                deleteWorkMapSkill: (activityId, skillId) =>
                    applyWorkMapMutation((draft) => workMapDraft.deleteWorkMapSkill(draft, activityId, skillId)),

                confirmWorkMap: () => {
                    const current = get().workMapDraft;
                    if (!current) return null;
                    const result = workMapDraft.confirmWorkMapDraft(current);
                    if (result.ok) set({ workMapDraft: result.draft });
                    return result;
                },

                reopenWorkMap: () =>
                    applyWorkMapMutation((draft) => (draft.confirmed ? { ...draft, confirmed: false } : draft)),

                discardWorkMapDraft: () => set({ workMapDraft: null }),

                // 구성원 Task 기반 Gate 전용 샘플이다 - 선택된 Task/Activity로부터 매번 새로
                // Activity-Sub Action 구조를 만든다(고정 채용 콘텐츠를 다른 Task의 Activity에
                // 억지로 매핑하지 않는다). Activity 데이터가 없는 등 만들 수 없는 선택 상태라면
                // 조용히 legacy 문서를 만드는 대신 null을 반환한다 - 호출부(loadSampleSopFromSetup)가
                // 그 사실을 명확한 안내 메시지로 보여준다.
                generateFromSample: () => {
                    if (isCustomerReviewLocked()) return null;
                    const state = get();
                    const now = new Date().toISOString();
                    const result = buildTaskGateSampleDocument({
                        id: `sop-sample-${Date.now()}`,
                        member: { ...state.memberInfo },
                        workLibrary: state.workLibrary,
                        context: state.context,
                        setupConfig: state.setupConfig,
                    });
                    if (!result.success) {
                        console.warn(`[generateFromSample] ${result.reason}`);
                        return null;
                    }
                    const doc = result.document;
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
                selectSourceActivity: (selectedSourceActivityId) => set({ selectedSourceActivityId }),

                setStepSourceActivities: (stepId, activityIds) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const task = doc.workLibrary.taskCatalog.find((item) => item.id === doc.workLibrary.taskId);
                    const allowedIds = new Set(task?.activities.map((activity) => activity.id) ?? []);
                    const uniqueIds = [...new Set(activityIds)];
                    const step = doc.steps.find((item) => item.id === stepId);
                    if (!step || step.terminalType || uniqueIds.some((id) => !allowedIds.has(id))) return;
                    applyDocumentMutation(doc, {
                        steps: doc.steps.map((item) => item.id === stepId ? { ...item, sourceActivityIds: uniqueIds } : item),
                    });
                },

                setStepSubActionOrder: (stepId, order) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return;
                    const step = doc.steps.find((item) => item.id === stepId);
                    if (!step || step.terminalType || !Number.isInteger(order) || order < 1) return;
                    applyDocumentMutation(doc, {
                        steps: doc.steps.map((item) => item.id === stepId ? { ...item, subActionOrder: order } : item),
                    });
                },

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

                // 일괄 검토: applyBulkStepReview docstring 참고. 'confirmed'는 여기서도
                // 절대 만들어지지 않으며, 실제 변경이 없으면 히스토리도 쌓지 않는다.
                // 되돌리기(Undo)는 한 번의 일괄 작업 전체를 한 단계로 취소한다.
                markStepsReviewedBulk: (activityId) => {
                    const doc = get().document;
                    if (!doc || isCustomerReviewLocked()) return 0;
                    const { steps, reviewStatus, changedCount } = applyBulkStepReview(doc, activityId);
                    if (changedCount === 0) return 0;
                    set({
                        ...pushHistory(doc),
                        document: { ...doc, steps, reviewStatus, updatedAt: new Date().toISOString() },
                    });
                    return changedCount;
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
                        memberSession: { ...ANONYMOUS_MEMBER_SESSION },
                        memberContext: { ...EMPTY_MEMBER_CONTEXT },
                        taskRecommendation: { ...IDLE_TASK_RECOMMENDATION },
                        workMapDraft: null,
                        memberInfo: CUSTOMER_SOP_MEMBER,
                        workLibrary: CUSTOMER_WORK_LIBRARY,
                        context: '',
                        setupConfig: DEFAULT_SETUP_CONFIG,
                        taskRecommendationInput: '',
                        document: null,
                        selectedStepId: null,
                        selectedEdgeId: null,
                        selectedSourceActivityId: null,
                        customerReviewMode: false,
                        lastSavedTimestamp: null,
                        history: [],
                        future: [],
                    }),
            };
        },
        {
            name: SOP_DRAFT_STORAGE_KEY,
            version: 6,
            migrate: migrateSopPrototypePersistedState,
            storage: createJSONStorage(createBrowserSopDraftStorage),
            partialize: (state) => ({
                memberSession: state.memberSession,
                memberContext: state.memberContext,
                taskRecommendation: state.taskRecommendation,
                workMapDraft: state.workMapDraft,
                memberInfo: state.memberInfo,
                workLibrary: state.workLibrary,
                context: state.context,
                setupConfig: state.setupConfig,
                taskRecommendationInput: state.taskRecommendationInput,
                document: state.document,
                customerReviewMode: state.customerReviewMode,
                lastSavedTimestamp: state.lastSavedTimestamp,
            }),
        }
    )
);
