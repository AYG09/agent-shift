'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    type AsIsFlowResponse,
    type ToBeFlowResponse,
    type ChangeStrategyResponse,
    type DrilldownResponse,
    type NodeSplitResponse,
} from '@/lib/ai-schemas';
import { generateCacheKey, getCachedData, setCachedData } from '@/lib/cache-utils';
import { normalizeEdgeHandlesByNodePositions } from '@/lib/edge-handles';
import { useAppStore } from '@/lib/store';

// 드릴다운에 전달할 그래프 컨텍스트용 간소화된 타입
interface FlowNodeBasic {
    id: string;
    label: string;
    description?: string;
    type: string;
    collaborationType?: string;
    metrics?: {
        timeMinutes?: number;
    };
}

interface FlowEdgeBasic {
    id: string;
    source: string;
    target: string;
}

interface WorkContext {
    industry: string;
    role: string;
    task: string;
    timeScale?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project';
    teamSize?: string;
    budget?: string;
    tooling?: string;
    painPoints?: string;
    platforms?: string[];  // 사용자가 선택한 AI 플랫폼
}

function normalizeFlowPayloadHandles<
    T extends {
        nodes: Array<{ id: string; position: { x: number; y: number } }>;
        edges: Array<{
            id: string;
            source: string;
            target: string;
            sourceHandle?: string;
            targetHandle?: string;
        }>;
    },
>(payload: T): T {
    return {
        ...payload,
        edges: normalizeEdgeHandlesByNodePositions(payload.nodes, payload.edges),
    };
}

const API_KEY_STORAGE_KEY = 'agent-shift-api-key';
const isDev = process.env.NODE_ENV === 'development';

function devLog(message: string, ...args: unknown[]) {
    if (!isDev) return;
    console.debug(message, ...args);
}

// localStorage 안전 접근 헬퍼
function safeGetStorageItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(key);
    } catch (e) {
        // Vercel/Safari 등 일부 환경에서 storage 접근 차단 시
        console.warn('[Storage] Access denied:', e);
        return null;
    }
}

export function useAIGeneration() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState<string | null>(null);

    // 로컬 스토리지에서 API 키 로드 (클라이언트에서만)
    useEffect(() => {
        const stored = safeGetStorageItem(API_KEY_STORAGE_KEY);
        setApiKey(stored);
        
        // storage 이벤트 리스너로 다른 탭/컴포넌트에서 변경 감지
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === API_KEY_STORAGE_KEY) {
                setApiKey(e.newValue);
            }
        };
        
        // 커스텀 이벤트로 같은 탭에서 변경 감지
        const handleApiKeyUpdate = () => {
            const updated = safeGetStorageItem(API_KEY_STORAGE_KEY);
            setApiKey(updated);
        };
        
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('apikey-updated', handleApiKeyUpdate);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('apikey-updated', handleApiKeyUpdate);
        };
    }, []);

    const callAi = useCallback(
        async <TRequest extends Record<string, unknown>, TResponse,>(options: {
            action: string;
            body: TRequest;
            cache?: {
                keyInput: unknown;
                logLabel: string;
            };
            readCache?: () => TResponse | null;
            onCacheHit?: (cached: TResponse) => void;
            transform?: (raw: TResponse) => TResponse;
            afterSuccess?: (data: TResponse) => void;
        }): Promise<TResponse | null> => {
            setIsLoading(true);
            setError(null);

            try {
                const localCached = options.readCache?.();
                if (localCached) {
                    options.onCacheHit?.(localCached);
                    return localCached;
                }

                let cacheKey: string | null = null;
                if (options.cache) {
                    cacheKey = await generateCacheKey(options.action, options.cache.keyInput);
                    const sessionCached = getCachedData<TResponse>(cacheKey);
                    if (sessionCached) {
                        devLog(`[AI Generation] Cache hit: ${options.cache.logLabel}`);
                        options.onCacheHit?.(sessionCached);
                        return sessionCached;
                    }
                }

                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: options.action,
                        ...options.body,
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const rawData = (await response.json()) as TResponse;
                const data = options.transform ? options.transform(rawData) : rawData;

                if (cacheKey) {
                    setCachedData(cacheKey, data);
                }

                options.afterSuccess?.(data);
                return data;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'AI 생성 중 오류 발생';
                setError(message);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [apiKey]
    );



    const generateAsIsFlow = useCallback(
        async (context: WorkContext): Promise<AsIsFlowResponse | null> => {
            return callAi<
                { context: WorkContext },
                AsIsFlowResponse
            >({
                action: 'generateAsIsFlow',
                body: { context },
                cache: {
                    keyInput: context,
                    logLabel: 'AsIsFlow',
                },
                transform: (rawData) => normalizeFlowPayloadHandles(rawData),
            });
        },
        [callAi]
    );

    const generateToBeFlow = useCallback(
        async (
            context: WorkContext,
            asIsNodes: AsIsFlowResponse['nodes'],
            scenario: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
        ): Promise<ToBeFlowResponse | null> => {
            return callAi<
                {
                    context: WorkContext;
                    asIsNodes: AsIsFlowResponse['nodes'];
                    scenario: 'conservative' | 'balanced' | 'aggressive';
                },
                ToBeFlowResponse
            >({
                action: 'generateToBeFlow',
                body: { context, asIsNodes, scenario },
                cache: {
                    // Cache key payload를 최소화해 키 안정성을 높인다.
                    keyInput: { context, asIsNodes: asIsNodes.map((n) => n.id), scenario },
                    logLabel: 'ToBeFlow',
                },
                transform: (rawData) => normalizeFlowPayloadHandles(rawData),
            });
        },
        [callAi]
    );

    const generateChangeStrategy = useCallback(
        async (
            context: WorkContext,
            framework: 'kotter' | 'adkar' | 'lewin',
            totalWeeks: number = 12
        ): Promise<ChangeStrategyResponse | null> => {
            return callAi<
                {
                    context: WorkContext;
                    framework: 'kotter' | 'adkar' | 'lewin';
                    totalWeeks: number;
                },
                ChangeStrategyResponse
            >({
                action: 'generateChangeStrategy',
                body: { context, framework, totalWeeks },
                cache: {
                    keyInput: { context, framework, totalWeeks },
                    logLabel: 'ChangeStrategy',
                },
            });
        },
        [callAi]
    );

    const generateDrilldown = useCallback(
        async (
            context: WorkContext,
            node: { id: string; label: string; description?: string; type: string; collaborationType?: string; metrics?: { timeMinutes?: number } },
            flowType: 'as-is' | 'to-be',
            allNodes?: FlowNodeBasic[],
            allEdges?: FlowEdgeBasic[],
            asIsNodes?: FlowNodeBasic[]  // AS-IS 원본 노드들 (시간 비교용)
        ): Promise<DrilldownResponse | null> => {
            const storeNodeId = `${flowType}-${node.id}`;

            return callAi<
                {
                    context: WorkContext;
                    node: {
                        id: string;
                        label: string;
                        description?: string;
                        type: string;
                        collaborationType?: string;
                        metrics?: { timeMinutes?: number };
                    };
                    flowType: 'as-is' | 'to-be';
                    allNodes?: FlowNodeBasic[];
                    allEdges?: FlowEdgeBasic[];
                    asIsNodes?: FlowNodeBasic[];
                },
                DrilldownResponse
            >({
                action: 'generateDrilldown',
                body: {
                    context,
                    node,
                    flowType,
                    allNodes,
                    allEdges,
                    asIsNodes,
                },
                cache: {
                    keyInput: {
                        context,
                        nodeId: node.id,
                        flowType,
                        nodeCount: allNodes?.length ?? 0,
                        edgeCount: allEdges?.length ?? 0,
                        asIsNodeCount: asIsNodes?.length ?? 0,
                    },
                    logLabel: 'Drilldown',
                },
                readCache: () => {
                    // Zustand store에서 영구 캐시 확인 (변화관리/내보내기용)
                    const storedResult = useAppStore.getState().getDrilldownResult(storeNodeId);
                    if (storedResult) {
                        devLog('[AI Generation] Store cache hit: Drilldown', storeNodeId);
                        return storedResult;
                    }
                    return null;
                },
                onCacheHit: (cached) => {
                    // 세션 캐시/스토어 캐시 모두 store에 동기화해 후속 화면에서 재사용
                    useAppStore.getState().setDrilldownResult(storeNodeId, cached);
                },
                afterSuccess: (data) => {
                    useAppStore.getState().setDrilldownResult(storeNodeId, data);
                    devLog('[AI Generation] Drilldown saved to store', storeNodeId);
                },
            });
        },
        [callAi]
    );

    // 노드 분할 (세분화) - 해당 노드를 4~5개 하위 노드로 분할
    const generateNodeSplit = useCallback(
        async (
            context: WorkContext,
            node: { id: string; label: string; description?: string; type: string; metrics?: { duration?: number; durationUnit?: string } },
            flowType: 'asis' | 'tobe'
        ): Promise<NodeSplitResponse | null> => {
            return callAi<
                {
                    context: WorkContext;
                    node: { id: string; label: string; description?: string; type: string; metrics?: { duration?: number; durationUnit?: string } };
                    flowType: 'as-is' | 'to-be';
                },
                NodeSplitResponse
            >({
                action: 'generateNodeSplit',
                body: {
                    context,
                    node,
                    flowType: flowType === 'asis' ? 'as-is' : 'to-be',
                },
                cache: {
                    keyInput: { context, nodeId: node.id, flowType },
                    logLabel: 'NodeSplit',
                },
            });
        },
        [callAi]
    );

    // API 키 갱신 함수
    const refreshApiKey = useCallback(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
            setApiKey(stored);
        }
    }, []);

    return {
        isLoading,
        error,
        hasApiKey: !!apiKey,
        generateAsIsFlow,
        generateToBeFlow,
        generateChangeStrategy,
        generateDrilldown,
        generateNodeSplit,
        refreshApiKey,
    };
}
