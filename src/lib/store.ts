import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DrilldownResponse } from './ai-schemas';
import {
    getReversedEdgeHandles as getReversedEdgeHandlesFromLib,
    normalizeEdgeHandlesByNodePositions,
} from './edge-handles';

// 시나리오 정보 (프론트엔드 + API 공유)
export const SCENARIO_INFO = {
    conservative: {
        label: '보수적',
        desc: 'AI는 보조 역할만 수행, 인간이 최종 의사결정',
        details: [
            'collaborationType: monitor(인간 감독) 또는 copilot(협력)',
            '자동화 비율: 20~30%',
            '고위험/고가치 작업은 인간이 수행',
            'AI는 데이터 수집, 초안 작성, 알림 등 보조 업무',
        ],
    },
    balanced: {
        label: '균형',
        desc: 'AI와 인간이 협력하여 업무 수행',
        details: [
            'collaborationType 혼합: copilot(주), monitor, autonomous',
            '자동화 비율: 40~60%',
            '반복적/규칙적 작업은 autonomous로 자동화',
            '판단이 필요한 작업은 copilot으로 협력',
        ],
    },
    aggressive: {
        label: '적극적',
        desc: 'AI가 대부분의 업무를 자율적으로 수행',
        details: [
            '대부분 collaborationType: autonomous(독립 수행)',
            '자동화 비율: 70~90%',
            '인간은 예외 처리, 최종 승인, 전략적 의사결정만',
            'AI가 전체 워크플로우를 오케스트레이션',
        ],
    },
} as const;

export type ScenarioType = keyof typeof SCENARIO_INFO;

// 역량별 시간 승수 (기본값)
export const DEFAULT_SKILL_MULTIPLIERS = {
    junior: 1.5,
    mid: 1.0,
    senior: 0.7,
} as const;

export interface SkillMultipliers {
    junior: number;
    mid: number;
    senior: number;
}

// 노드 타입 정의 - 다양한 시간 단위 지원 (분/시간/일/주/월)
export type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

export interface NodeMetrics {
    timeMinutes?: number; // 하위 호환성 (기존 분 단위)
    duration?: number;    // 새 필드: 숫자 값
    durationUnit?: DurationUnit; // 새 필드: 단위
    skillMultipliers?: SkillMultipliers; // 역량별 시간 승수
}

export interface FlowNode {
    id: string;
    type: 'terminal' | 'process' | 'decision' | 'io' | 'agent' | 'task' | 'subprocess';
    terminalType?: 'start' | 'end';
    ioType?: 'input' | 'output';
    label: string;
    description?: string;
    shape?: 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'parallelogram' | 'hexagon';
    stressLevel?: 'low' | 'medium' | 'high';
    position: { x: number; y: number };
    children?: FlowNode[];
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    agentDescription?: string;
    metrics?: NodeMetrics;
}

export interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    animated?: boolean;
}

export const getReversedEdgeHandles = getReversedEdgeHandlesFromLib;

// 액션 아이템 정보
export interface ActionItem {
    action: string;
    rationale: string;
    value: string;
}

// 전략 단계 정보
export interface StrategyPhase {
    id: string;
    name: string;
    duration: string;
    startWeek: number;
    endWeek: number;
    actions: (string | ActionItem)[];
    color: string;
}

// 전략 데이터
export interface StrategyData {
    framework: 'kotter' | 'adkar' | 'lewin';
    phases: StrategyPhase[];
    totalWeeks: number;
}

// 컨텍스트 정보
export interface UserContext {
    industry: string;
    role: string;
    task: string;
    timeScale: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project';
    // Additional Context
    teamSize?: string;
    budget?: string;
    tooling?: string; // e.g. "Jira, Slack, Excel"
    painPoints?: string; // User input text
    platforms?: string[]; // 선택된 AI 플랫폼 value 배열 (신규)
}

// 프로젝트 정보
export interface Project {
    id: string;
    name: string;
    createdAt: string; // ISO 날짜 문자열
    updatedAt: string; // ISO 날짜 문자열
    context: UserContext | null;
    asIsNodes: FlowNode[];
    asIsEdges: FlowEdge[];
    toBeNodes: FlowNode[];
    toBeEdges: FlowEdge[];
    strategy: StrategyData | null;
}

// 스토어 상태 타입
interface AppState {
    // 프로젝트 관리
    projects: Project[];
    currentProjectId: string | null;
    createProject: (name: string) => string; // 생성된 프로젝트 ID 반환
    loadProject: (id: string) => void;
    updateCurrentProject: () => void;
    deleteProject: (id: string) => void;
    renameProject: (id: string, name: string) => void;
    getCurrentProject: () => Project | null;

    // 사용자 컨텍스트
    context: UserContext | null;
    setContext: (context: UserContext) => void;

    // 변화 전략
    strategy: StrategyData | null;
    setStrategy: (strategy: StrategyData | null) => void;

    // As-Is 플로우
    asIsNodes: FlowNode[];
    asIsEdges: FlowEdge[];
    setAsIsFlow: (nodes: FlowNode[], edges: FlowEdge[]) => void;

    // To-Be 플로우
    toBeNodes: FlowNode[];
    toBeEdges: FlowEdge[];
    setToBeFlow: (nodes: FlowNode[], edges: FlowEdge[]) => void;

    // 현재 드릴다운 경로
    drilldownPath: string[];
    pushDrilldown: (nodeId: string) => void;
    popDrilldown: () => void;
    resetDrilldown: () => void;

    // 현재 뷰 모드
    viewMode: 'asis' | 'tobe' | 'split';
    setViewMode: (mode: 'asis' | 'tobe' | 'split') => void;

    // 로딩 상태
    isGenerating: boolean;
    setIsGenerating: (loading: boolean) => void;

    // 전략 범위 선택
    strategyScope: 'full' | 'selected';
    selectedToBeNodeId: string | null;
    setStrategyScope: (scope: 'full' | 'selected') => void;
    setSelectedToBeNodeId: (nodeId: string | null) => void;

    // 노드 CRUD 액션
    addNode: (node: FlowNode, target: 'asis' | 'tobe') => void;
    updateNode: (id: string, updates: Partial<FlowNode>, target: 'asis' | 'tobe') => void;
    deleteNode: (id: string, target: 'asis' | 'tobe') => void;
    updateNodePosition: (
        id: string,
        position: { x: number; y: number },
        target: 'asis' | 'tobe'
    ) => void;

    // 엣지 CRUD 액션
    addEdge: (edge: FlowEdge, target: 'asis' | 'tobe') => void;
    deleteEdge: (id: string, target: 'asis' | 'tobe') => void;
    updateEdge: (id: string, updates: Partial<FlowEdge>, target: 'asis' | 'tobe') => void;
    reverseEdge: (id: string, target: 'asis' | 'tobe') => void;

    // 상세분석(Drilldown) 캐싱
    drilldownResults: Record<string, DrilldownResponse>;
    setDrilldownResult: (nodeId: string, result: DrilldownResponse) => void;
    getDrilldownResult: (nodeId: string) => DrilldownResponse | undefined;
    clearDrilldownResults: () => void;

    // 초기화
    clearAll: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            // 초기 상태
            projects: [],
            currentProjectId: null,
            context: null,
            strategy: null,
            asIsNodes: [],
            asIsEdges: [],
            toBeNodes: [],
            toBeEdges: [],
            drilldownPath: [],
            viewMode: 'asis',
            isGenerating: false,
            strategyScope: 'full',
            selectedToBeNodeId: null,
            drilldownResults: {},

            // 프로젝트 CRUD 액션
            createProject: (name) => {
                const id = crypto.randomUUID();
                const now = new Date().toISOString();
                const newProject: Project = {
                    id,
                    name,
                    createdAt: now,
                    updatedAt: now,
                    context: null,
                    asIsNodes: [],
                    asIsEdges: [],
                    toBeNodes: [],
                    toBeEdges: [],
                    strategy: null,
                };
                set((state) => ({
                    projects: [...state.projects, newProject],
                    currentProjectId: id,
                    // 새 프로젝트이므로 현재 상태 초기화
                    context: null,
                    asIsNodes: [],
                    asIsEdges: [],
                    toBeNodes: [],
                    toBeEdges: [],
                    strategy: null,
                    drilldownPath: [],
                    viewMode: 'asis',
                    strategyScope: 'full',
                    selectedToBeNodeId: null,
                }));
                return id;
            },

            loadProject: (id) => {
                const state = get();
                const project = state.projects.find((p) => p.id === id);
                if (project) {
                    // 기존 저장된 엣지의 handle을 노드 위치 기반으로 재계산
                    const normalizedAsIsEdges = normalizeEdgeHandlesByNodePositions(project.asIsNodes, project.asIsEdges);
                    const normalizedToBeEdges = normalizeEdgeHandlesByNodePositions(project.toBeNodes, project.toBeEdges);
                    
                    set({
                        currentProjectId: id,
                        context: project.context,
                        asIsNodes: project.asIsNodes,
                        asIsEdges: normalizedAsIsEdges,
                        toBeNodes: project.toBeNodes,
                        toBeEdges: normalizedToBeEdges,
                        strategy: project.strategy,
                        drilldownPath: [],
                        viewMode: 'asis',
                        strategyScope: 'full',
                        selectedToBeNodeId: null,
                    });
                }
            },

            updateCurrentProject: () => {
                const state = get();
                if (!state.currentProjectId) return;
                
                set((s) => ({
                    projects: s.projects.map((p) =>
                        p.id === s.currentProjectId
                            ? {
                                  ...p,
                                  updatedAt: new Date().toISOString(),
                                  context: s.context,
                                  asIsNodes: s.asIsNodes,
                                  asIsEdges: s.asIsEdges,
                                  toBeNodes: s.toBeNodes,
                                  toBeEdges: s.toBeEdges,
                                  strategy: s.strategy,
                              }
                            : p
                    ),
                }));
            },

            deleteProject: (id) => {
                set((state) => {
                    const newProjects = state.projects.filter((p) => p.id !== id);
                    // 현재 프로젝트가 삭제되면 초기화
                    if (state.currentProjectId === id) {
                        return {
                            projects: newProjects,
                            currentProjectId: null,
                            context: null,
                            asIsNodes: [],
                            asIsEdges: [],
                            toBeNodes: [],
                            toBeEdges: [],
                            strategy: null,
                            drilldownPath: [],
                            viewMode: 'asis',
                        };
                    }
                    return { projects: newProjects };
                });
            },

            renameProject: (id, name) => {
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p
                    ),
                }));
            },

            getCurrentProject: () => {
                const state = get();
                return state.projects.find((p) => p.id === state.currentProjectId) || null;
            },

            // 기본 액션
            setContext: (context) => set({ context }),
            setStrategy: (strategy) => set({ strategy }),
            
            // 엣지에 handle이 없으면 노드 위치 기반으로 최적 handle 자동 계산
            setAsIsFlow: (nodes, edges) => {
                const normalizedEdges = normalizeEdgeHandlesByNodePositions(nodes, edges);
                set({ asIsNodes: nodes, asIsEdges: normalizedEdges });
            },
            setToBeFlow: (nodes, edges) => {
                const normalizedEdges = normalizeEdgeHandlesByNodePositions(nodes, edges);
                set({ toBeNodes: nodes, toBeEdges: normalizedEdges });
            },

            pushDrilldown: (nodeId) =>
                set((state) => ({
                    drilldownPath: [...state.drilldownPath, nodeId],
                })),

            popDrilldown: () =>
                set((state) => ({
                    drilldownPath: state.drilldownPath.slice(0, -1),
                })),

            resetDrilldown: () => set({ drilldownPath: [] }),
            setViewMode: (mode) => set({ viewMode: mode }),
            setIsGenerating: (loading) => set({ isGenerating: loading }),
            setStrategyScope: (scope) => set({ strategyScope: scope }),
            setSelectedToBeNodeId: (nodeId) => set({ selectedToBeNodeId: nodeId }),

            // 노드 추가
            addNode: (node, target) =>
                set((state) => ({
                    [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: [
                        ...(target === 'asis' ? state.asIsNodes : state.toBeNodes),
                        node,
                    ],
                })),

            // 노드 수정
            updateNode: (id, updates, target) =>
                set((state) => {
                    const nodes = target === 'asis' ? state.asIsNodes : state.toBeNodes;
                    return {
                        [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: nodes.map((node) =>
                            node.id === id ? { ...node, ...updates } : node
                        ),
                    };
                }),

            // 노드 삭제
            deleteNode: (id, target) =>
                set((state) => {
                    const nodes = target === 'asis' ? state.asIsNodes : state.toBeNodes;
                    const edges = target === 'asis' ? state.asIsEdges : state.toBeEdges;
                    return {
                        [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: nodes.filter(
                            (node) => node.id !== id
                        ),
                        [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: edges.filter(
                            (edge) => edge.source !== id && edge.target !== id
                        ),
                    };
                }),

            // 노드 위치 업데이트
            updateNodePosition: (id, position, target) =>
                set((state) => {
                    const nodes = target === 'asis' ? state.asIsNodes : state.toBeNodes;
                    return {
                        [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: nodes.map((node) =>
                            node.id === id ? { ...node, position } : node
                        ),
                    };
                }),

            // 엣지 추가
            addEdge: (edge, target) =>
                set((state) => ({
                    [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: [
                        ...(target === 'asis' ? state.asIsEdges : state.toBeEdges),
                        edge,
                    ],
                })),

            // 엣지 삭제
            deleteEdge: (id, target) =>
                set((state) => {
                    const edges = target === 'asis' ? state.asIsEdges : state.toBeEdges;
                    return {
                        [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: edges.filter(
                            (edge) => edge.id !== id
                        ),
                    };
                }),

            // 엣지 업데이트
            updateEdge: (id, updates, target) =>
                set((state) => {
                    const edges = target === 'asis' ? state.asIsEdges : state.toBeEdges;
                    return {
                        [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: edges.map((edge) =>
                            edge.id === id ? { ...edge, ...updates } : edge
                        ),
                    };
                }),

            // 엣지 방향 뒤집기 (source ↔ target 교환)
            reverseEdge: (id, target) =>
                set((state) => {
                    const edges = target === 'asis' ? state.asIsEdges : state.toBeEdges;
                    return {
                        [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: edges.map((edge) => {
                            if (edge.id !== id) return edge;

                            const reversedHandles = getReversedEdgeHandles(edge);
                            const handleSuffix = reversedHandles.sourceHandle && reversedHandles.targetHandle
                                ? `-${reversedHandles.sourceHandle}-${reversedHandles.targetHandle}`
                                : '';
                            const newId = `edge-${edge.target}-${edge.source}${handleSuffix}`;
                            return {
                                ...edge,
                                id: newId,
                                source: edge.target,
                                target: edge.source,
                                sourceHandle: reversedHandles.sourceHandle,
                                targetHandle: reversedHandles.targetHandle,
                            };
                        }),
                    };
                }),

            // 상세분석(Drilldown) 캐싱 함수들
            setDrilldownResult: (nodeId, result) =>
                set((state) => ({
                    drilldownResults: { ...state.drilldownResults, [nodeId]: result },
                })),
            getDrilldownResult: (nodeId) => get().drilldownResults[nodeId],
            clearDrilldownResults: () => set({ drilldownResults: {} }),

            // 초기화
            clearAll: () =>
                set({
                    context: null,
                    strategy: null,
                    asIsNodes: [],
                    asIsEdges: [],
                    toBeNodes: [],
                    toBeEdges: [],
                    drilldownPath: [],
                    viewMode: 'asis',
                    strategyScope: 'full',
                    selectedToBeNodeId: null,
                    currentProjectId: null,
                    drilldownResults: {},
                }),
        }),
        {
            name: 'agent-shift-storage',
            storage: createJSONStorage(() => {
                // SSR 안전하게 처리
                if (typeof window === 'undefined') {
                    return {
                        getItem: () => null,
                        setItem: () => {},
                        removeItem: () => {},
                    };
                }
                // localStorage 접근 차단 환경 (Vercel/Safari 등) 안전 처리
                return {
                    getItem: (name: string) => {
                        try {
                            return localStorage.getItem(name);
                        } catch (e) {
                            console.warn('[Store] Storage getItem denied:', e);
                            return null;
                        }
                    },
                    setItem: (name: string, value: string) => {
                        try {
                            localStorage.setItem(name, value);
                        } catch (e) {
                            console.warn('[Store] Storage setItem denied:', e);
                        }
                    },
                    removeItem: (name: string) => {
                        try {
                            localStorage.removeItem(name);
                        } catch (e) {
                            console.warn('[Store] Storage removeItem denied:', e);
                        }
                    },
                };
            }),
            // 저장할 필드만 선택 (isGenerating은 제외)
            partialize: (state) => ({
                projects: state.projects,
                currentProjectId: state.currentProjectId,
                context: state.context,
                strategy: state.strategy,
                asIsNodes: state.asIsNodes,
                asIsEdges: state.asIsEdges,
                toBeNodes: state.toBeNodes,
                toBeEdges: state.toBeEdges,
                viewMode: state.viewMode,
                strategyScope: state.strategyScope,
                selectedToBeNodeId: state.selectedToBeNodeId,
                drilldownResults: state.drilldownResults,
            }),
        }
    )
);
