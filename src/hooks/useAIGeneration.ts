'use client';

import { useState, useCallback, useEffect } from 'react';
import { type AsIsFlowResponse, type ToBeFlowResponse } from '@/lib/ai-schemas';

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

export function useAIGeneration() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState<string | null>(null);

    // 로컬 스토리지에서 API 키 로드 (클라이언트에서만)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
            setApiKey(stored);
        }
    }, []);

    const generateAsIsFlow = useCallback(async (context: WorkContext): Promise<AsIsFlowResponse | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateAsIsFlow',
                    context,
                    apiKey: apiKey || undefined, // BYOK 키 전송
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI 생성 실패');
            }

            return await response.json();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI 생성 중 오류 발생';
            setError(message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [apiKey]);

    const generateToBeFlow = useCallback(async (
        context: WorkContext,
        asIsNodes: AsIsFlowResponse['nodes'],
        scenario: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
    ): Promise<ToBeFlowResponse | null> => {
        setIsLoading(true);
        setError(null);
        try {
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

            return await response.json();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI 생성 중 오류 발생';
            setError(message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [apiKey]);

    const generateChangeStrategy = useCallback(async (
        context: WorkContext,
        framework: 'kotter' | 'adkar' | 'lewin'
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateChangeStrategy',
                    context,
                    framework,
                    apiKey: apiKey || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI 생성 실패');
            }

            return await response.json();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI 생성 중 오류 발생';
            setError(message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [apiKey]);

    const generateDrilldown = useCallback(async (
        context: { industry: string; role: string; task: string },
        node: { id: string; label: string; description?: string; type: string },
        flowType: 'as-is' | 'to-be'
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateDrilldown',
                    context,
                    node,
                    flowType,
                    apiKey: apiKey || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI 생성 실패');
            }

            return await response.json();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI 생성 중 오류 발생';
            setError(message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [apiKey]);

    // 노드 분할 (세분화) - 해당 노드를 4~5개 하위 노드로 분할
    const generateNodeSplit = useCallback(async (
        context: { industry: string; role: string; task: string },
        node: { id: string; label: string; description?: string; type: string },
        flowType: 'asis' | 'tobe'
    ): Promise<{ nodes: Array<{ id: string; label: string; description?: string; type: string; stressLevel?: string }>; summary: string } | null> => {
        setIsLoading(true);
        setError(null);
        try {
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

            return await response.json();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI 생성 중 오류 발생';
            setError(message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [apiKey]);

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

