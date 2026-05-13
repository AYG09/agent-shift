'use client';

import { create } from 'zustand';
import { liveblocks } from '@liveblocks/zustand';
import type { WithLiveblocks } from '@liveblocks/zustand';
import { liveblocksClient } from './liveblocks-client';
import type { Presence } from './liveblocks.config';
import {
    FlowNode,
    FlowEdge,
    UserContext,
    StrategyData,
} from './store';
import { normalizeEdgeHandlesByNodePositions } from './edge-handles';

// 협업 Store 상태 타입
interface CollabState {
    // Storage (Liveblocks 동기화)
    asIsNodes: FlowNode[];
    asIsEdges: FlowEdge[];
    toBeNodes: FlowNode[];
    toBeEdges: FlowEdge[];
    context: UserContext | null;
    strategy: StrategyData | null;

    // Local Only (동기화 제외)
    viewMode: 'asis' | 'tobe' | 'split';
    isGenerating: boolean;
    drilldownPath: string[];

    // Presence (실시간 임시 상태)
    cursor: { x: number; y: number } | null;
    selectedNodeId: string | null;
    user: { name: string; color: string };

    // 기본 액션
    setContext: (context: UserContext) => void;
    setStrategy: (strategy: StrategyData | null) => void;
    setAsIsFlow: (nodes: FlowNode[], edges: FlowEdge[]) => void;
    setToBeFlow: (nodes: FlowNode[], edges: FlowEdge[]) => void;
    setViewMode: (mode: 'asis' | 'tobe' | 'split') => void;
    setIsGenerating: (loading: boolean) => void;

    // 드릴다운 액션
    pushDrilldown: (nodeId: string) => void;
    popDrilldown: () => void;
    resetDrilldown: () => void;

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

    // Presence 액션
    setCursor: (cursor: { x: number; y: number } | null) => void;
    setSelectedNodeId: (nodeId: string | null) => void;
    setUser: (user: { name: string; color: string }) => void;

    // 로컬 스토어에서 데이터 일괄 동기화
    syncFromLocalStore: (localData: {
        asIsNodes: FlowNode[];
        asIsEdges: FlowEdge[];
        toBeNodes: FlowNode[];
        toBeEdges: FlowEdge[];
        context: UserContext | null;
        strategy: StrategyData | null;
    }) => void;

    // 초기화
    clearAll: () => void;
}

// 협업 전용 Zustand Store with Liveblocks 미들웨어
export const useCollabStore = create<WithLiveblocks<CollabState, Presence>>()(
    liveblocks(
        (set) => ({
            // 초기 상태
            asIsNodes: [],
            asIsEdges: [],
            toBeNodes: [],
            toBeEdges: [],
            context: null,
            strategy: null,
            viewMode: 'asis',
            isGenerating: false,
            drilldownPath: [],
            cursor: null,
            selectedNodeId: null,
            user: { name: '익명 사용자', color: '#888888' },

            // 기본 액션
            setContext: (context) => set({ context }),
            setStrategy: (strategy) => set({ strategy }),
            setAsIsFlow: (nodes, edges) => {
                const normalizedEdges = normalizeEdgeHandlesByNodePositions(nodes, edges);
                set({ asIsNodes: nodes, asIsEdges: normalizedEdges });
            },
            setToBeFlow: (nodes, edges) => {
                const normalizedEdges = normalizeEdgeHandlesByNodePositions(nodes, edges);
                set({ toBeNodes: nodes, toBeEdges: normalizedEdges });
            },
            setViewMode: (mode) => set({ viewMode: mode }),
            setIsGenerating: (loading) => set({ isGenerating: loading }),

            // 드릴다운 액션
            pushDrilldown: (nodeId) =>
                set((state) => ({
                    drilldownPath: [...state.drilldownPath, nodeId],
                })),
            popDrilldown: () =>
                set((state) => ({
                    drilldownPath: state.drilldownPath.slice(0, -1),
                })),
            resetDrilldown: () => set({ drilldownPath: [] }),

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

            // Presence 액션
            setCursor: (cursor) => set({ cursor }),
            setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
            setUser: (user) => set({ user }),

            // 로컬 스토어에서 데이터 일괄 동기화 (협업 세션 시작 시)
            syncFromLocalStore: (localData) => {
                const normalizedAsIsEdges = normalizeEdgeHandlesByNodePositions(localData.asIsNodes, localData.asIsEdges);
                const normalizedToBeEdges = normalizeEdgeHandlesByNodePositions(localData.toBeNodes, localData.toBeEdges);
                set({
                    asIsNodes: localData.asIsNodes,
                    asIsEdges: normalizedAsIsEdges,
                    toBeNodes: localData.toBeNodes,
                    toBeEdges: normalizedToBeEdges,
                    context: localData.context,
                    strategy: localData.strategy,
                });
            },

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
                }),
        }),
        {
            client: liveblocksClient,
            // Storage 매핑 - Liveblocks에 동기화할 상태
            storageMapping: {
                asIsNodes: true,
                asIsEdges: true,
                toBeNodes: true,
                toBeEdges: true,
                context: true,
                strategy: true,
            },
            // Presence 매핑 - 실시간 임시 상태
            presenceMapping: {
                cursor: true,
                selectedNodeId: true,
                user: true,
            },
        }
    )
);

// 협업 상태 타입 export
export type { CollabState };
