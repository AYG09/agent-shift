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

// 드릴다운에 전달할 그래프 컨텍스트용 간소화된 타입
interface FlowNodeBasic {
    id: string;
    label: string;
    description?: string;
    type: string;
    collaborationType?: string;
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
    timeScale: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project';
    teamSize?: string;
    budget?: string;
    tooling?: string;
    painPoints?: string;
}

const API_KEY_STORAGE_KEY = 'agent-shift-api-key';

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

// 수직 플로우를 위한 엣지 핸들 보정 (AI가 handle 누락 시 기본값 적용)
function normalizeEdgeHandles<T extends { edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }> }>(data: T): T {
    return {
        ...data,
        edges: data.edges.map(edge => ({
            ...edge,
            sourceHandle: edge.sourceHandle || 'bottom',
            targetHandle: edge.targetHandle || 'top',
        })),
    };
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



    const generateAsIsFlow = useCallback(
        async (context: WorkContext): Promise<AsIsFlowResponse | null> => {
            setIsLoading(true);
            setError(null);

            try {
                // 1. Check Cache
                const cacheKey = await generateCacheKey('generateAsIsFlow', context);
                const cached = getCachedData<AsIsFlowResponse>(cacheKey);
                if (cached) {
                    console.log('⚡ Cache Hit: AsIsFlow');
                    return cached;
                }

                // 2. API Call
                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generateAsIsFlow',
                        context,
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const rawData = await response.json();
                // 엣지 핸들 보정 (수직 플로우용 bottom→top)
                const data = normalizeEdgeHandles(rawData);

                // 3. Save Cache
                setCachedData(cacheKey, data);

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

    const generateToBeFlow = useCallback(
        async (
            context: WorkContext,
            asIsNodes: AsIsFlowResponse['nodes'],
            scenario: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
        ): Promise<ToBeFlowResponse | null> => {
            setIsLoading(true);
            setError(null);
            try {
                // 1. Check Cache
                const cacheKey = await generateCacheKey('generateToBeFlow', { context, asIsNodes: asIsNodes.map(n => n.id), scenario }); // Optimize key payload
                const cached = getCachedData<ToBeFlowResponse>(cacheKey);
                if (cached) {
                    console.log('⚡ Cache Hit: ToBeFlow');
                    return cached;
                }

                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generateToBeFlow',
                        context,
                        asIsNodes,
                        scenario,
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const rawData = await response.json();
                // 엣지 핸들 보정 (수직 플로우용 bottom→top)
                const data = normalizeEdgeHandles(rawData);
                setCachedData(cacheKey, data);
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

    const generateChangeStrategy = useCallback(
        async (context: WorkContext, framework: 'kotter' | 'adkar' | 'lewin', totalWeeks: number = 12) => {
            setIsLoading(true);
            setError(null);
            try {
                const cacheKey = await generateCacheKey('generateChangeStrategy', { context, framework, totalWeeks });
                const cached = getCachedData<ChangeStrategyResponse>(cacheKey);
                if (cached) {
                    console.log('⚡ Cache Hit: ChangeStrategy');
                    return cached;
                }

                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generateChangeStrategy',
                        context,
                        framework,
                        totalWeeks,
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const data = await response.json();
                setCachedData(cacheKey, data);
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

    const generateDrilldown = useCallback(
        async (
            context: { industry: string; role: string; task: string },
            node: { id: string; label: string; description?: string; type: string; collaborationType?: string },
            flowType: 'as-is' | 'to-be',
            allNodes?: FlowNodeBasic[],
            allEdges?: FlowEdgeBasic[]
        ) => {
            setIsLoading(true);
            setError(null);
            try {
                // 캐시 키에 그래프 컨텍스트 크기 포함 (노드/엣지 개수가 달라지면 다른 캐시)
                const cacheKey = await generateCacheKey('generateDrilldown', { 
                    context, 
                    nodeId: node.id, 
                    flowType,
                    nodeCount: allNodes?.length ?? 0,
                    edgeCount: allEdges?.length ?? 0
                });
                const cached = getCachedData<DrilldownResponse>(cacheKey);
                if (cached) {
                    console.log('⚡ Cache Hit: Drilldown');
                    return cached;
                }

                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generateDrilldown',
                        context,
                        node,
                        flowType,
                        allNodes,
                        allEdges,
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const data = await response.json();
                setCachedData(cacheKey, data);
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

    // 노드 분할 (세분화) - 해당 노드를 4~5개 하위 노드로 분할
    const generateNodeSplit = useCallback(
        async (
            context: { industry: string; role: string; task: string },
            node: { id: string; label: string; description?: string; type: string },
            flowType: 'asis' | 'tobe'
        ): Promise<{
            nodes: Array<{
                id: string;
                label: string;
                description?: string;
                type: string;
                stressLevel?: string;
            }>;
            summary: string;
        } | null> => {
            setIsLoading(true);
            setError(null);
            try {
                const cacheKey = await generateCacheKey('generateNodeSplit', { context, nodeId: node.id, flowType });
                const cached = getCachedData<NodeSplitResponse>(cacheKey);
                if (cached) {
                    console.log('⚡ Cache Hit: NodeSplit');
                    return cached;
                }

                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generateNodeSplit',
                        context,
                        node,
                        flowType: flowType === 'asis' ? 'as-is' : 'to-be',
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const data = await response.json();
                setCachedData(cacheKey, data);
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
