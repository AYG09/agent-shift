'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { fixtureFor, RECRUITING_CONTEXT, scenarioInfo, isDemoScenarioReady, type DemoDocument, type DemoMode, type DemoPreset, type DemoScenario, type DemoStep } from './sop-demo-fixtures';
import type { SopAiApplicationMode } from './sop-types';
import { AI_APPLICATION_MODES, normalizeAgentizationMode } from './sop-agentization';

type Member = { name: string; role: string; organization: string };
type WorkLibrarySkill = { id: string; name: string; description: string };
type WorkLibraryActivity = { id: string; name: string; description: string; skills: WorkLibrarySkill[] };
type WorkLibraryTask = { id: string; name: string; description: string; activities: WorkLibraryActivity[] };
export type DemoAgentizationScope = 'workflow' | 'steps';

export function getAgentizableDemoStepIds(document: DemoDocument | null): string[] {
    return (document?.steps || [])
        .filter((step) => step.terminalType !== 'start' && step.terminalType !== 'end')
        .map((step) => step.id);
}

/**
 * Same lookup rule as the real product's getAgentizationModeForStep: an explicit
 * per-step mode only, gated by scope. There is no batch-default fallback, so a
 * step a member has not (or no longer) assigned reads as unset/human-performed.
 */
export function getDemoAgentizationModeForStep(
    state: Pick<State, 'document' | 'agentizationScope' | 'agentizationStepIds' | 'agentizationStepModes'>,
    stepId: string
): SopAiApplicationMode | undefined {
    const eligibleIds = getAgentizableDemoStepIds(state.document);
    if (!eligibleIds.includes(stepId)) return undefined;
    const isInScope = state.agentizationScope === 'workflow' || state.agentizationStepIds.includes(stepId);
    if (!isInScope) return undefined;
    return normalizeAgentizationMode(state.agentizationStepModes[stepId]);
}

const DEMO_WORK_LIBRARY: WorkLibraryTask[] = [
    { id: 'talent-acquisition', name: '인재 채용', description: '채용 요청부터 입사 확정까지의 인재 확보 업무입니다.', activities: [
        { id: 'recruit-request', name: '채용 요청 검토', description: '채용 필요성과 직무 요건을 확인합니다.', skills: [{ id: 'rq-1', name: '채용 요건 분석', description: '채용 요청을 직무·경력·필수 요건으로 구조화합니다.' }, { id: 'rq-2', name: '인력 계획 검토', description: '인력 계획과 채용 필요 시점을 확인합니다.' }] },
        { id: 'sourcing', name: '공고 및 후보자 소싱', description: '공고를 게시하고 후보자 풀을 확보합니다.', skills: [{ id: 'so-1', name: '채용 공고 작성', description: '직무 요건을 명확한 공고 문안으로 작성합니다.' }, { id: 'so-2', name: '후보자 소싱', description: '적합한 후보자 채널을 운영합니다.' }] },
        { id: 'screening', name: '서류 전형', description: '지원 자료를 기준에 따라 검토합니다.', skills: [{ id: 'sc-1', name: '지원자 자격 검토', description: '필수·우대 요건 충족 여부를 검토합니다.' }, { id: 'sc-2', name: '후보자 비교 평가', description: '검토 결과를 일관된 기준으로 비교합니다.' }] },
        { id: 'interview', name: '면접 운영', description: '구조화된 기준으로 면접을 진행합니다.', skills: [{ id: 'in-1', name: '구조화 면접 운영', description: '평가 기준에 맞춰 면접을 진행하고 기록합니다.' }, { id: 'in-2', name: '평가 결과 종합', description: '면접 결과와 의견을 종합합니다.' }] },
        { id: 'onboarding', name: '처우 및 입사 확정', description: '처우 협의와 입사 준비를 완료합니다.', skills: [{ id: 'on-1', name: '처우 협상', description: '승인 범위에서 처우 조건을 조율합니다.' }, { id: 'on-2', name: '근로계약 및 입사 일정 관리', description: '계약과 입사 준비를 관리합니다.' }] },
    ] },
    { id: 'purchasing', name: '구매 관리', description: '구매 요청과 비용 승인을 관리합니다.', activities: [
        { id: 'purchase-request', name: '구매 요청 접수', description: '요청 목적과 필요 시점을 확인합니다.', skills: [{ id: 'pr-1', name: '구매 요청 분석', description: '구매 목적과 요구사항을 구조화합니다.' }] },
        { id: 'vendor', name: '공급업체 검토', description: '공급 조건과 견적을 비교합니다.', skills: [{ id: 've-1', name: '견적 비교', description: '가격과 조건을 비교합니다.' }] },
        { id: 'approval', name: '비용 승인', description: '예산과 승인 권한을 확인합니다.', skills: [{ id: 'ap-1', name: '예산 검토', description: '예산 한도와 승인 기준을 확인합니다.' }] },
        { id: 'order', name: '발주 처리', description: '승인된 구매를 발주로 전환합니다.', skills: [{ id: 'or-1', name: '발주 관리', description: '발주 정보와 납기 조건을 관리합니다.' }] },
    ] },
    { id: 'customer-care', name: '고객 경험 관리', description: '고객 불만 접수와 해결을 관리합니다.', activities: [
        { id: 'complaint', name: '불만 접수', description: '고객 이슈와 증빙을 접수합니다.', skills: [{ id: 'co-1', name: '고객 이슈 분류', description: '이슈 유형과 영향도를 분류합니다.' }] },
        { id: 'investigate', name: '사실관계 확인', description: '관련 사실과 책임 범위를 확인합니다.', skills: [{ id: 'iv-1', name: '사실관계 조사', description: '근거 자료를 기반으로 사실을 확인합니다.' }] },
        { id: 'resolve', name: '해결안 수립', description: '해결안과 고객 안내를 준비합니다.', skills: [{ id: 'rs-1', name: '고객 커뮤니케이션', description: '해결 방안을 명확히 안내합니다.' }] },
        { id: 'close', name: '처리 결과 관리', description: '처리 결과와 재발 방지 과제를 기록합니다.', skills: [{ id: 'cl-1', name: '사후 조치 관리', description: '결과와 후속 과제를 관리합니다.' }] },
    ] },
];

export const scenarioForTask = (taskId: string): DemoScenario => taskId === 'purchasing' ? 'purchasing' : taskId === 'customer-care' ? 'complaint' : 'recruiting';
const taskForScenario = (scenario: DemoScenario) => scenario === 'purchasing' ? 'purchasing' : scenario === 'complaint' ? 'customer-care' : 'talent-acquisition';

type State = {
    version: 3;
    member: Member;
    scenario: DemoScenario;
    mode: DemoMode;
    preset: DemoPreset;
    context: string;
    workLibraryConfirmed: boolean;
    workLibrary: WorkLibraryTask[];
    selectedWorkTaskId: string;
    selectedWorkActivityId: string;
    sopSourceType: 'task' | 'activity';
    document: DemoDocument | null;
    selectedStepId: string | null;
    selectedEdgeId: string | null;
    customerMode: boolean;
    agentizationScope: DemoAgentizationScope;
    /** Unset stays human-performed; there is no batch-default fallback for a step's read. */
    agentizationStepModes: Partial<Record<string, SopAiApplicationMode>>;
    agentizationStepIds: string[];
    agentizationNote: string;
    agentizationConfirmedAt: string | null;
    history: DemoDocument[];
    future: DemoDocument[];
    lastSavedAt: string | null;
    setMember: (update: Partial<Member>) => void;
    setScenario: (scenario: DemoScenario) => void;
    setMode: (mode: DemoMode) => void;
    setPreset: (preset: DemoPreset) => void;
    setContext: (context: string) => void;
    setWorkLibraryConfirmed: (confirmed: boolean) => void;
    selectWorkTask: (taskId: string) => void;
    selectWorkActivity: (activityId: string) => void;
    setSopSourceType: (sourceType: 'task' | 'activity') => void;
    updateWorkTask: (taskId: string, update: Partial<Pick<WorkLibraryTask, 'name' | 'description'>>) => void;
    addWorkTask: () => void;
    deleteWorkTask: (taskId: string) => void;
    updateWorkActivity: (activityId: string, update: Partial<Pick<WorkLibraryActivity, 'name' | 'description'>>) => void;
    addWorkActivity: (taskId?: string) => void;
    deleteWorkActivity: (activityId: string) => void;
    updateWorkSkill: (skillId: string, update: Partial<Omit<WorkLibrarySkill, 'id'>>) => void;
    addWorkSkill: (activityId?: string) => void;
    deleteWorkSkill: (skillId: string) => void;
    generate: () => DemoDocument;
    loadFromQuery: (scenario: DemoScenario, mode: DemoMode, preset: DemoPreset) => void;
    selectStep: (id: string | null) => void;
    selectEdge: (id: string | null) => void;
    updateStep: (id: string, update: Partial<DemoStep>) => void;
    updateStepPosition: (id: string, position: { x: number; y: number }) => void;
    addStep: () => void;
    duplicateStep: (id: string) => void;
    deleteStep: (id: string) => void;
    addEdge: (source: string, target: string) => void;
    deleteEdge: (id: string) => void;
    setStepReviewed: (id: string) => void;
    acceptAiSkill: (stepId: string, skillId: string) => void;
    rejectAiSkill: (stepId: string, skillId: string) => void;
    toggleCustomerMode: () => void;
    setAgentizationScope: (scope: DemoAgentizationScope) => void;
    /** Applies `mode` to every step currently in scope (batch assign). */
    setAgentizationDefaultMode: (mode: SopAiApplicationMode) => void;
    /** `mode` undefined clears the step's judgement; an unset step stays human-performed. */
    setAgentizationStepMode: (stepId: string, mode?: SopAiApplicationMode) => void;
    toggleAgentizationStep: (stepId: string) => void;
    setAgentizationNote: (note: string) => void;
    confirmAgentization: () => { success: boolean; message: string };
    confirmAll: () => { success: boolean; message: string };
    undo: () => void;
    redo: () => void;
    resetDemo: () => void;
};

const defaults = () => ({ member: { name: '김지윤', role: 'Talent Acquisition Manager', organization: 'People & Culture Team' }, scenario: 'recruiting' as DemoScenario, mode: 'standard' as DemoMode, preset: 'branching' as DemoPreset, context: RECRUITING_CONTEXT, workLibraryConfirmed: true, workLibrary: structuredClone(DEMO_WORK_LIBRARY), selectedWorkTaskId: 'talent-acquisition', selectedWorkActivityId: 'interview', sopSourceType: 'activity' as const });

const clone = (doc: DemoDocument) => structuredClone(doc);

export const useSopDemoStore = create<State>()(persist((set, get) => ({
    version: 3,
    ...defaults(),
    document: null,
    selectedStepId: null,
    selectedEdgeId: null,
    customerMode: false,
    agentizationScope: 'workflow',
    agentizationStepModes: {},
    agentizationStepIds: [],
    agentizationNote: '',
    agentizationConfirmedAt: null,
    history: [], future: [], lastSavedAt: null,
    setMember: (update) => set((state) => ({ member: { ...state.member, ...update } })),
    // 아직 제목과 실제 단계 내용이 일치하지 않는(purchasing/complaint) 시나리오는 store 레벨에서도
    // 활성화를 막는다 - UI(WorkLibraryEditor)의 버튼 비활성화는 1차 방어선이고, 여기가 최종 방어선이다.
    setScenario: (scenario) => set((state) => {
        if (!isDemoScenarioReady(scenario)) return state;
        const selectedWorkTaskId = taskForScenario(scenario);
        const task = state.workLibrary.find((item) => item.id === selectedWorkTaskId);
        return { scenario, selectedWorkTaskId, selectedWorkActivityId: task?.activities[0]?.id || '', workLibraryConfirmed: false };
    }),
    setMode: (mode) => set({ mode }),
    setPreset: (preset) => set({ preset }),
    setContext: (context) => set({ context }),
    setWorkLibraryConfirmed: (workLibraryConfirmed) => set({ workLibraryConfirmed }),
    selectWorkTask: (taskId) => set((state) => {
        const task = state.workLibrary.find((item) => item.id === taskId);
        if (!task || !isDemoScenarioReady(scenarioForTask(taskId))) return state;
        return { scenario: scenarioForTask(taskId), selectedWorkTaskId: taskId, selectedWorkActivityId: task.activities[0]?.id || '', workLibraryConfirmed: false };
    }),
    selectWorkActivity: (selectedWorkActivityId) => set({ selectedWorkActivityId, workLibraryConfirmed: false }),
    setSopSourceType: (sopSourceType) => set({ sopSourceType }),
    updateWorkTask: (taskId, update) => set((state) => ({ workLibrary: state.workLibrary.map((task) => task.id === taskId ? { ...task, ...update } : task), workLibraryConfirmed: false })),
    addWorkTask: () => set((state) => {
        const id = `task-${state.workLibrary.length + 1}`;
        const activity = { id: `${id}-activity-1`, name: '새 주요 Activity', description: 'Activity 설명을 입력하세요.', skills: [] };
        return { workLibrary: [...state.workLibrary, { id, name: '새 Task', description: 'Task 설명을 입력하세요.', activities: [activity] }], selectedWorkTaskId: id, selectedWorkActivityId: activity.id, workLibraryConfirmed: false };
    }),
    deleteWorkTask: (taskId) => set((state) => {
        if (state.workLibrary.length === 1) return state;
        const workLibrary = state.workLibrary.filter((task) => task.id !== taskId);
        const next = workLibrary[0];
        return { workLibrary, selectedWorkTaskId: next.id, selectedWorkActivityId: next.activities[0]?.id || '', workLibraryConfirmed: false };
    }),
    updateWorkActivity: (activityId, update) => set((state) => ({ workLibrary: state.workLibrary.map((task) => ({ ...task, activities: task.activities.map((activity) => activity.id === activityId ? { ...activity, ...update } : activity) })), workLibraryConfirmed: false })),
    // taskId를 명시적으로 받을 수 있게 한다 - state.selectedWorkTaskId에만 의존하면 화면에 표시된
    // task(폴백 `|| store.workLibrary[0]`로 렌더링될 수 있음)와 실제로 Activity가 추가되는 task가
    // 어긋나 "추가를 눌러도 목록에 반영되지 않는 것처럼 보이는" 문제가 생길 수 있다.
    addWorkActivity: (taskId) => set((state) => {
        const targetTaskId = taskId ?? state.selectedWorkTaskId;
        return { workLibrary: state.workLibrary.map((task) => task.id !== targetTaskId ? task : { ...task, activities: [...task.activities, { id: `${task.id}-activity-${task.activities.length + 1}`, name: '새 주요 Activity', description: 'Activity 설명을 입력하세요.', skills: [] }] }), workLibraryConfirmed: false };
    }),
    deleteWorkActivity: (activityId) => set((state) => {
        const task = state.workLibrary.find((item) => item.id === state.selectedWorkTaskId);
        if (!task || task.activities.length === 1) return state;
        const activities = task.activities.filter((activity) => activity.id !== activityId);
        return { workLibrary: state.workLibrary.map((item) => item.id === task.id ? { ...item, activities } : item), selectedWorkActivityId: activities[0].id, workLibraryConfirmed: false };
    }),
    updateWorkSkill: (skillId, update) => set((state) => ({ workLibrary: state.workLibrary.map((task) => ({ ...task, activities: task.activities.map((activity) => ({ ...activity, skills: activity.skills.map((skill) => skill.id === skillId ? { ...skill, ...update } : skill) })) })), workLibraryConfirmed: false })),
    // activityId를 명시적으로 받을 수 있게 한다 - 이유는 addWorkActivity와 동일(화면에 표시된
    // activity와 selectedWorkActivityId가 어긋나면 "SKILL 추가"를 눌러도 목록에 반영되지 않는다).
    addWorkSkill: (activityId) => set((state) => {
        const targetActivityId = activityId ?? state.selectedWorkActivityId;
        return { workLibrary: state.workLibrary.map((task) => ({ ...task, activities: task.activities.map((activity) => activity.id !== targetActivityId ? activity : { ...activity, skills: [...activity.skills, { id: `${activity.id}-skill-${activity.skills.length + 1}`, name: '새 SKILL', description: 'SKILL 설명을 입력하세요.' }] }) })), workLibraryConfirmed: false };
    }),
    deleteWorkSkill: (skillId) => set((state) => ({ workLibrary: state.workLibrary.map((task) => ({ ...task, activities: task.activities.map((activity) => ({ ...activity, skills: activity.skills.filter((skill) => skill.id !== skillId) })) })), workLibraryConfirmed: false })),
    generate: () => {
        const state = get();
        const document = fixtureFor(state.scenario, state.preset);
        const task = state.workLibrary.find((item) => item.id === state.selectedWorkTaskId);
        const activity = task?.activities.find((item) => item.id === state.selectedWorkActivityId);
        const source = state.sopSourceType === 'task' ? task : activity;
        const skills = state.sopSourceType === 'task' ? task?.activities.flatMap((item) => item.skills) || [] : activity?.skills || [];
        if (source) document.title = `${source.name} SOP`;
        document.steps = document.steps.map((step) => step.id === 'screening' ? { ...step, requiredSkills: skills.slice(0, 5).map((skill) => ({ ...skill, source: 'work-library' as const, accepted: true })) } : step);
        set({ document, selectedStepId: null, selectedEdgeId: null, agentizationScope: 'workflow', agentizationStepModes: {}, agentizationStepIds: [], agentizationNote: '', agentizationConfirmedAt: null, history: [], future: [], lastSavedAt: new Date().toISOString() });
        return document;
    },
    loadFromQuery: (scenario, mode, preset) => {
        // 완성되지 않은 시나리오(purchasing/complaint)로의 직접 URL 진입도 recruiting으로 되돌린다 -
        // 제목과 실제 SOP 내용이 다른 상태를 어떤 경로로도 노출하지 않는다.
        const safeScenario = isDemoScenarioReady(scenario) ? scenario : 'recruiting';
        const document = fixtureFor(safeScenario, preset);
        set({ scenario: safeScenario, mode, preset, document, selectedStepId: null, selectedEdgeId: null, workLibraryConfirmed: true, agentizationScope: 'workflow', agentizationStepModes: {}, agentizationStepIds: [], agentizationNote: '', agentizationConfirmedAt: null, lastSavedAt: new Date().toISOString() });
    },
    selectStep: (selectedStepId) => set({ selectedStepId, selectedEdgeId: null }),
    selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedStepId: null }),
    updateStep: (id, update) => set((state) => {
        if (!state.document) return state;
        const before = clone(state.document);
        const steps = state.document.steps.map((step) => step.id === id ? { ...step, ...update, reviewStatus: 'ai-draft' as const } : step);
        return { document: { ...state.document, steps }, agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [], lastSavedAt: new Date().toISOString() };
    }),
    updateStepPosition: (id, position) => set((state) => {
        if (!state.document) return state;
        const steps = state.document.steps.map((step) => step.id === id ? { ...step, position } : step);
        return { document: { ...state.document, steps }, lastSavedAt: new Date().toISOString() };
    }),
    addStep: () => set((state) => {
        if (!state.document) return state;
        const before = clone(state.document);
        const number = state.document.steps.length + 1;
        const id = `custom-step-${number}`;
        const step: DemoStep = { id, title: '새 검토 단계', definition: '추가된 단계의 수행 목적과 기준을 입력합니다.', detailedInstructions: '필요한 입력과 산출물을 정의합니다.', responsibleRole: state.member.role, inputs: [], outputs: [], tools: [], cautions: [], decisionRules: [], requiredSkills: [], estimatedDuration: '30분', type: 'process', shape: 'process', terminalType: undefined, position: { x: 960, y: 720 }, reviewStatus: 'ai-draft' };
        return { document: { ...state.document, steps: [...state.document.steps, step] }, selectedStepId: id, agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [] };
    }),
    duplicateStep: (id) => set((state) => {
        if (!state.document) return state;
        const source = state.document.steps.find((step) => step.id === id); if (!source) return state;
        const before = clone(state.document); const copyId = `${id}-copy-${state.history.length + 1}`;
        const copy: DemoStep = { ...clone({ ...state.document, steps: [source] }).steps[0], id: copyId, title: `${source.title} (복제)`, position: { x: source.position.x + 45, y: source.position.y + 45 }, reviewStatus: 'ai-draft' };
        return { document: { ...state.document, steps: [...state.document.steps, copy], edges: [...state.document.edges, { id: `edge-${state.document.edges.length + 1}`, source: id, target: copyId, label: '검토 추가', branchType: 'default', condition: '추가 검토', sourceHandle: 'right', targetHandle: 'left' }] }, selectedStepId: copyId, agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [] };
    }),
    deleteStep: (id) => set((state) => {
        if (!state.document) return state;
        const before = clone(state.document);
        return { document: { ...state.document, steps: state.document.steps.filter((step) => step.id !== id), edges: state.document.edges.filter((edge) => edge.source !== id && edge.target !== id) }, selectedStepId: null, agentizationStepIds: state.agentizationStepIds.filter((stepId) => stepId !== id), agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [] };
    }),
    addEdge: (source, target) => set((state) => {
        if (!state.document || source === target || state.document.edges.some((edge) => edge.source === source && edge.target === target)) return state;
        const before = clone(state.document); const edge = { id: `edge-${state.document.edges.length + 1}`, source, target, label: '추가 연결', branchType: 'default' as const, condition: '사용자 추가 연결', sourceHandle: 'right', targetHandle: 'left' };
        return { document: { ...state.document, edges: [...state.document.edges, edge] }, agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [] };
    }),
    deleteEdge: (id) => set((state) => !state.document ? state : ({ document: { ...state.document, edges: state.document.edges.filter((edge) => edge.id !== id) }, selectedEdgeId: null, agentizationConfirmedAt: null })),
    setStepReviewed: (id) => set((state) => !state.document ? state : ({ document: { ...state.document, steps: state.document.steps.map((step) => step.id === id ? { ...step, reviewStatus: 'reviewed' } : step) } })),
    // AI 제안 SKILL을 수락/거절한다 - 수락은 accepted를 true로, 거절은 목록에서 완전히 제거한다.
    // 둘 다 "내용 편집"이므로 해당 단계를 다시 ai-draft로 되돌려 재검토를 요구한다(단계 편집과
    // 동일한 검토 상태 갱신 규칙을 공유한다).
    acceptAiSkill: (stepId, skillId) => set((state) => {
        if (!state.document) return state;
        const before = clone(state.document);
        const steps = state.document.steps.map((step) =>
            step.id !== stepId
                ? step
                : {
                      ...step,
                      requiredSkills: step.requiredSkills.map((skill) => (skill.id === skillId ? { ...skill, accepted: true } : skill)),
                      reviewStatus: 'ai-draft' as const,
                  }
        );
        return { document: { ...state.document, steps }, agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [], lastSavedAt: new Date().toISOString() };
    }),
    rejectAiSkill: (stepId, skillId) => set((state) => {
        if (!state.document) return state;
        const before = clone(state.document);
        const steps = state.document.steps.map((step) =>
            step.id !== stepId
                ? step
                : {
                      ...step,
                      requiredSkills: step.requiredSkills.filter((skill) => skill.id !== skillId),
                      reviewStatus: 'ai-draft' as const,
                  }
        );
        return { document: { ...state.document, steps }, agentizationConfirmedAt: null, history: [...state.history.slice(-19), before], future: [], lastSavedAt: new Date().toISOString() };
    }),
    toggleCustomerMode: () => set((state) => ({ customerMode: !state.customerMode })),
    setAgentizationScope: (agentizationScope) => set((state) => ({
        agentizationScope,
        // 전체 워크플로 확정 결과를 특정 단계 선택으로 오인하지 않도록, 범위를 전환할 때는 명시 선택을 새로 받는다.
        agentizationStepIds: agentizationScope === 'steps' && state.agentizationScope !== 'steps' ? [] : state.agentizationStepIds,
        agentizationConfirmedAt: null,
    })),
    setAgentizationDefaultMode: (mode) => set((state) => {
        const candidates = getAgentizableDemoStepIds(state.document);
        const targetIds = state.agentizationScope === 'workflow' ? candidates : state.agentizationStepIds;
        return {
            agentizationStepModes: { ...state.agentizationStepModes, ...Object.fromEntries(targetIds.map((id) => [id, mode])) },
            agentizationConfirmedAt: null,
        };
    }),
    setAgentizationStepMode: (stepId, mode) => set((state) => {
        if (!getAgentizableDemoStepIds(state.document).includes(stepId)) return state;
        const agentizationStepModes = { ...state.agentizationStepModes };
        if (mode) {
            agentizationStepModes[stepId] = mode;
        } else {
            delete agentizationStepModes[stepId];
        }
        return { agentizationStepModes, agentizationConfirmedAt: null };
    }),
    toggleAgentizationStep: (stepId) => set((state) => {
        const allowed = getAgentizableDemoStepIds(state.document);
        if (!allowed.includes(stepId)) return state;
        const selected = state.agentizationStepIds.includes(stepId)
            ? state.agentizationStepIds.filter((id) => id !== stepId)
            : [...state.agentizationStepIds, stepId];
        return { agentizationScope: 'steps', agentizationStepIds: selected, agentizationConfirmedAt: null };
    }),
    setAgentizationNote: (agentizationNote) => set({ agentizationNote, agentizationConfirmedAt: null }),
    confirmAgentization: () => {
        const state = get();
        const candidates = getAgentizableDemoStepIds(state.document);
        const selected = state.agentizationScope === 'workflow' ? candidates : state.agentizationStepIds.filter((id) => candidates.includes(id));
        if (selected.length === 0) {
            return { success: false, message: 'Agent화 가능 여부를 검토할 업무 단계를 최소 1개 선택해 주세요.' };
        }
        if (selected.some((id) => !state.agentizationStepModes[id])) {
            return { success: false, message: '선택한 각 단계에 AI 참여 방식을 지정해 주세요.' };
        }
        set({ agentizationStepIds: selected, agentizationConfirmedAt: new Date().toISOString() });
        const distinctModes = new Set(selected.map((id) => state.agentizationStepModes[id]));
        const modeLabel = distinctModes.size === 1
            ? AI_APPLICATION_MODES.find((item) => item.id === [...distinctModes][0])?.label
            : '단계별로 지정한';
        return {
            success: true,
            message: `${state.agentizationScope === 'workflow' ? '전체 워크플로' : `${selected.length}개 업무 단계`}의 ${modeLabel} 적용 방식을 확정했습니다.`,
        };
    },
    confirmAll: () => {
        const document = get().document;
        if (!document) return { success: false, message: '확정할 데모 문서가 없습니다.' };
        const pending = document.steps.filter((step) => step.reviewStatus !== 'reviewed');
        if (pending.length) return { success: false, message: `미검토 단계 ${pending.length}개를 먼저 검토 완료하세요.` };
        const unaccepted = document.steps.flatMap((step) => step.requiredSkills).filter((skill) => skill.source === 'ai-suggested' && !skill.accepted);
        if (unaccepted.length) return { success: false, message: '미처리된 AI 제안 SKILL이 있어 확정할 수 없습니다.' };
        set({ document: { ...document, steps: document.steps.map((step) => ({ ...step, reviewStatus: 'confirmed' })) } });
        return { success: true, message: '전체 SOP가 확정되었습니다.' };
    },
    undo: () => set((state) => {
        const previous = state.history.at(-1); if (!previous || !state.document) return state;
        return { document: clone(previous), agentizationConfirmedAt: null, history: state.history.slice(0, -1), future: [clone(state.document), ...state.future] };
    }),
    redo: () => set((state) => {
        const next = state.future[0]; if (!next || !state.document) return state;
        return { document: clone(next), agentizationConfirmedAt: null, history: [...state.history, clone(state.document)], future: state.future.slice(1) };
    }),
    resetDemo: () => set({ ...defaults(), document: fixtureFor('recruiting', 'branching'), selectedStepId: null, selectedEdgeId: null, customerMode: false, agentizationScope: 'workflow', agentizationStepModes: {}, agentizationStepIds: [], agentizationNote: '', agentizationConfirmedAt: null, history: [], future: [], lastSavedAt: new Date().toISOString() }),
}), {
    name: 'sop-demo-storage-v1',
    version: 3,
    storage: createJSONStorage(() => localStorage),
    migrate: (persisted) => {
        const previous = persisted as Partial<State> & { agentizationMode?: unknown };
        const agentizationStepIds = previous.agentizationStepIds || [];
        // Pre-v3 storage kept one global mode for the whole selection; fold it into
        // the new per-step map once, for every step it applied to at the time.
        const legacyMode = normalizeAgentizationMode(previous.agentizationMode);
        const agentizationStepModes = previous.agentizationStepModes
            || (legacyMode ? Object.fromEntries(agentizationStepIds.map((id) => [id, legacyMode])) : {});
        return {
            ...defaults(),
            ...previous,
            version: 3,
            agentizationScope: previous.agentizationScope || 'workflow',
            agentizationStepModes,
            agentizationStepIds,
            agentizationNote: previous.agentizationNote || '',
            agentizationConfirmedAt: previous.agentizationConfirmedAt || null,
        };
    },
    partialize: (state) => ({ ...state, history: [], future: [] }),
}));

export { scenarioInfo };
