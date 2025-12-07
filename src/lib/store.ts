import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 노드 타입 정의
export interface NodeMetrics {
    timeMinutes?: number;     // 소요 시간 (분)
    costKRW?: number;         // 비용 (원)
    peopleCount?: number;     // 관련 인원
    errorRate?: number;       // 오류율 (%)
}

export interface FlowNode {
    id: string;
    type: 'task' | 'decision' | 'subprocess' | 'agent';
    label: string;
    description?: string;
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
}

// 스토어 상태 타입
interface AppState {
    // 사용자 컨텍스트
    context: UserContext | null;
    setContext: (context: UserContext) => void;

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

    // 노드 CRUD 액션
    addNode: (node: FlowNode, target: 'asis' | 'tobe') => void;
    updateNode: (id: string, updates: Partial<FlowNode>, target: 'asis' | 'tobe') => void;
    deleteNode: (id: string, target: 'asis' | 'tobe') => void;
    updateNodePosition: (id: string, position: { x: number; y: number }, target: 'asis' | 'tobe') => void;

    // 엣지 CRUD 액션
    addEdge: (edge: FlowEdge, target: 'asis' | 'tobe') => void;
    deleteEdge: (id: string, target: 'asis' | 'tobe') => void;

    // 초기화
    clearAll: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            // 초기 상태
            context: null,
            asIsNodes: [],
            asIsEdges: [],
            toBeNodes: [],
            toBeEdges: [],
            drilldownPath: [],
            viewMode: 'asis',
            isGenerating: false,

            // 기본 액션
            setContext: (context) => set({ context }),
            setAsIsFlow: (nodes, edges) => set({ asIsNodes: nodes, asIsEdges: edges }),
            setToBeFlow: (nodes, edges) => set({ toBeNodes: nodes, toBeEdges: edges }),

            pushDrilldown: (nodeId) => set((state) => ({
                drilldownPath: [...state.drilldownPath, nodeId]
            })),

            popDrilldown: () => set((state) => ({
                drilldownPath: state.drilldownPath.slice(0, -1)
            })),

            resetDrilldown: () => set({ drilldownPath: [] }),
            setViewMode: (mode) => set({ viewMode: mode }),
            setIsGenerating: (loading) => set({ isGenerating: loading }),

            // 노드 추가
            addNode: (node, target) => set((state) => ({
                [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: [
                    ...(target === 'asis' ? state.asIsNodes : state.toBeNodes),
                    node
                ]
            })),

            // 노드 수정
            updateNode: (id, updates, target) => set((state) => {
                const nodes = target === 'asis' ? state.asIsNodes : state.toBeNodes;
                return {
                    [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: nodes.map(node =>
                        node.id === id ? { ...node, ...updates } : node
                    )
                };
            }),

            // 노드 삭제
            deleteNode: (id, target) => set((state) => {
                const nodes = target === 'asis' ? state.asIsNodes : state.toBeNodes;
                const edges = target === 'asis' ? state.asIsEdges : state.toBeEdges;
                return {
                    [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: nodes.filter(node => node.id !== id),
                    [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: edges.filter(edge => edge.source !== id && edge.target !== id)
                };
            }),

            // 노드 위치 업데이트
            updateNodePosition: (id, position, target) => set((state) => {
                const nodes = target === 'asis' ? state.asIsNodes : state.toBeNodes;
                return {
                    [target === 'asis' ? 'asIsNodes' : 'toBeNodes']: nodes.map(node =>
                        node.id === id ? { ...node, position } : node
                    )
                };
            }),

            // 엣지 추가
            addEdge: (edge, target) => set((state) => ({
                [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: [
                    ...(target === 'asis' ? state.asIsEdges : state.toBeEdges),
                    edge
                ]
            })),

            // 엣지 삭제
            deleteEdge: (id, target) => set((state) => {
                const edges = target === 'asis' ? state.asIsEdges : state.toBeEdges;
                return {
                    [target === 'asis' ? 'asIsEdges' : 'toBeEdges']: edges.filter(edge => edge.id !== id)
                };
            }),

            // 초기화
            clearAll: () => set({
                context: null,
                asIsNodes: [],
                asIsEdges: [],
                toBeNodes: [],
                toBeEdges: [],
                drilldownPath: [],
                viewMode: 'asis',
            }),
        }),
        {
            name: 'agent-shift-storage',
            storage: createJSONStorage(() => {
                // SSR 안전하게 처리
                if (typeof window === 'undefined') {
                    return {
                        getItem: () => null,
                        setItem: () => { },
                        removeItem: () => { },
                    };
                }
                return localStorage;
            }),
            // 저장할 필드만 선택 (isGenerating은 제외)
            partialize: (state) => ({
                context: state.context,
                asIsNodes: state.asIsNodes,
                asIsEdges: state.asIsEdges,
                toBeNodes: state.toBeNodes,
                toBeEdges: state.toBeEdges,
                viewMode: state.viewMode,
            }),
        }
    )
);
