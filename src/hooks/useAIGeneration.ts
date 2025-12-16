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

// 유효한 target handle ID인지 확인 (신규 체계: xxx-target 형식)
function isValidTargetHandle(handle: string | undefined): boolean {
    if (!handle) return false;
    return handle.endsWith('-target');
}

// 수직 플로우를 위한 엣지 핸들 보정 - 노드 위치 기반으로 최적의 연결점 계산
function normalizeEdgeHandles<T extends { 
    nodes: Array<{ id: string; position: { x: number; y: number } }>; 
    edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }> 
}>(data: T): T {
    const nodeMap = new Map(data.nodes.map(n => [n.id, n.position]));
    
    return {
        ...data,
        edges: data.edges.map(edge => {
            // 새 체계의 handle이 제대로 지정되어 있으면 그대로 사용
            if (edge.sourceHandle && isValidTargetHandle(edge.targetHandle)) {
                return edge;
            }
            
            const sourcePos = nodeMap.get(edge.source);
            const targetPos = nodeMap.get(edge.target);
            
            if (!sourcePos || !targetPos) {
                // 노드를 찾을 수 없으면 기본값 (위→아래 흐름)
                return {
                    ...edge,
                    sourceHandle: 'bottom',
                    targetHandle: 'top-target',
                };
            }
            
            const dx = targetPos.x - sourcePos.x;
            const dy = targetPos.y - sourcePos.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            let sourceHandle: string;
            let targetHandle: string;
            
            // 수직 이동이 더 큰 경우
            if (absDy > absDx * 0.5) {
                if (dy > 0) {
                    // target이 아래에 있음: source의 bottom → target의 top
                    sourceHandle = 'bottom';
                    targetHandle = 'top-target';
                } else {
                    // target이 위에 있음: source의 top → target의 bottom
                    sourceHandle = 'top';
                    targetHandle = 'bottom-target';
                }
            } else {
                // 수평 이동이 더 큰 경우
                if (dx > 0) {
                    // target이 오른쪽: source의 right → target의 left
                    sourceHandle = 'right';
                    targetHandle = 'left-target';
                } else {
                    // target이 왼쪽: source의 left → target의 right
                    sourceHandle = 'left';
                    targetHandle = 'right-target';
                }
            }
            
            return {
                ...edge,
                sourceHandle,
                targetHandle,
            };
        }),
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
            context: WorkContext,
            node: { id: string; label: string; description?: string; type: string; collaborationType?: string; metrics?: { timeMinutes?: number } },
            flowType: 'as-is' | 'to-be',
            allNodes?: FlowNodeBasic[],
            allEdges?: FlowEdgeBasic[],
            asIsNodes?: FlowNodeBasic[]  // AS-IS 원본 노드들 (시간 비교용)
        ) => {
            setIsLoading(true);
            setError(null);
            try {
                // 1. Zustand store에서 영구 캐시 확인 (변화관리/내보내기용)
                const storeNodeId = `${flowType}-${node.id}`;
                const storedResult = useAppStore.getState().getDrilldownResult(storeNodeId);
                if (storedResult) {
                    console.log('⚡ Store Cache Hit: Drilldown', storeNodeId);
                    setIsLoading(false);
                    return storedResult;
                }

                // 2. 세션 캐시 확인
                const cacheKey = await generateCacheKey('generateDrilldown', { 
                    context, 
                    nodeId: node.id, 
                    flowType,
                    nodeCount: allNodes?.length ?? 0,
                    edgeCount: allEdges?.length ?? 0,
                    asIsNodeCount: asIsNodes?.length ?? 0
                });
                const cached = getCachedData<DrilldownResponse>(cacheKey);
                if (cached) {
                    console.log('⚡ Session Cache Hit: Drilldown');
                    // 세션 캐시에서 찾으면 Zustand에도 저장
                    useAppStore.getState().setDrilldownResult(storeNodeId, cached);
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
                        asIsNodes,  // AS-IS 원본 노드들 (시간 비교용)
                        apiKey: apiKey || undefined,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'AI 생성 실패');
                }

                const data = await response.json();
                
                // 세션 캐시 저장
                setCachedData(cacheKey, data);
                
                // Zustand store에 영구 저장 (변화관리/내보내기용)
                useAppStore.getState().setDrilldownResult(storeNodeId, data);
                console.log('💾 Drilldown saved to store:', storeNodeId);
                
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
            context: WorkContext,
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
