'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DEFAULT_GEMINI_MODEL,
    DEFAULT_REASONING_LEVEL,
    FALLBACK_MODEL_PRIORITY,
    MODEL_STORAGE_KEY,
    MODEL_UPDATED_EVENT,
    REASONING_LEVELS,
    REASONING_LEVEL_LABELS,
    REASONING_STORAGE_KEY,
    REASONING_UPDATED_EVENT,
    resolveModelId,
    sanitizeReasoningLevel,
    type GeminiModelListResult,
    type ReasoningLevel,
} from '@/lib/gemini-models';

const API_KEY_STORAGE_KEY = 'agent-shift-api-key';

// localStorage 안전 접근 헬퍼
function safeGetStorageItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('[Storage] Access denied:', e);
        return null;
    }
}

function safeSetStorageItem(key: string, value: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn('[Storage] Write denied:', e);
        return false;
    }
}

function safeRemoveStorageItem(key: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.warn('[Storage] Remove denied:', e);
        return false;
    }
}

// 커스텀 이벤트 발생 함수
function dispatchApiKeyUpdate() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('apikey-updated'));
    }
}

function dispatchModelUpdate() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(MODEL_UPDATED_EVENT));
    }
}

function dispatchReasoningUpdate() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(REASONING_UPDATED_EVENT));
    }
}

// 모델 목록 조회가 fallback으로 떨어진 이유를 사용자 문구로 변환
function resolveModelListWarning(result: GeminiModelListResult): string {
    switch (result.reason) {
        case 'missing-api-key':
            return 'API 키가 없어 모델 목록을 조회하지 못했습니다. 기본 목록을 표시합니다.';
        case 'api-error':
            return '저장된 API 키로 Google 모델 목록 조회에 실패했습니다. 기본 목록을 표시합니다.';
        case 'empty-api-result':
            return 'Google API가 모델 목록을 반환하지 않았습니다. 기본 목록을 표시합니다.';
        case 'filter-empty':
            return 'Google 응답은 있었지만 생성 가능한 Gemini 모델을 찾지 못했습니다.';
        default:
            return '모델 목록을 조회할 수 없어 기본 목록을 표시합니다.';
    }
}

interface ApiKeySettingsProps {
    trigger?: React.ReactNode;
}

function useApiKey() {
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(() => typeof window !== 'undefined');

    const loadApiKey = () => {
        const stored = safeGetStorageItem(API_KEY_STORAGE_KEY);
        setApiKey(stored);
        setIsLoaded(true);
        return stored;
    };

    const saveApiKey = (key: string) => {
        if (safeSetStorageItem(API_KEY_STORAGE_KEY, key)) {
            setApiKey(key);
            setIsLoaded(true);
            dispatchApiKeyUpdate(); // 다른 훅에게 알림
        }
    };

    const clearApiKey = () => {
        if (safeRemoveStorageItem(API_KEY_STORAGE_KEY)) {
            setApiKey(null);
            setIsLoaded(true);
            dispatchApiKeyUpdate(); // 다른 훅에게 알림
        }
    };

    return { apiKey, isLoaded, loadApiKey, saveApiKey, clearApiKey };
}

export default function ApiKeySettings({ trigger }: ApiKeySettingsProps) {
    const { apiKey, loadApiKey, saveApiKey, clearApiKey } = useApiKey();
    const [inputKey, setInputKey] = useState('');
    const [open, setOpen] = useState(false);
    const [showKey, setShowKey] = useState(false);

    // 모델 선택 상태
    const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_GEMINI_MODEL);
    const [availableModels, setAvailableModels] = useState<string[]>([...FALLBACK_MODEL_PRIORITY]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelWarning, setModelWarning] = useState<string | null>(null);

    // 추론 깊이 (Gemini 3.x thinking_level)
    const [reasoning, setReasoning] = useState<ReasoningLevel>(DEFAULT_REASONING_LEVEL);

    // Google에서 현재 사용 가능한 모델 목록을 조회한다.
    // 키를 넘기지 않으면 서버가 환경 변수 키로 조회한다.
    const loadModels = useCallback(async (keyForLookup?: string) => {
        setIsLoadingModels(true);
        setModelWarning(null);
        try {
            const response = await fetch('/api/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyForLookup?.trim() || undefined }),
            });
            const result: GeminiModelListResult = await response.json();

            setAvailableModels(result.models);
            // 저장된 모델이 목록에 없으면 alias → 기본값 순으로 이동시킨다
            setSelectedModel((prev) => resolveModelId(prev, result.models));

            if (result.source === 'fallback') {
                setModelWarning(resolveModelListWarning(result));
            }
        } catch (e) {
            console.warn('[ApiKeySettings] 모델 목록 로드 실패:', e);
            setModelWarning('모델 목록을 불러오지 못해 기본 목록을 표시합니다.');
        } finally {
            setIsLoadingModels(false);
        }
    }, []);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            const stored = loadApiKey();
            setInputKey(stored ?? apiKey ?? '');
            setSelectedModel(safeGetStorageItem(MODEL_STORAGE_KEY) ?? DEFAULT_GEMINI_MODEL);
            setReasoning(sanitizeReasoningLevel(safeGetStorageItem(REASONING_STORAGE_KEY)));
            // 설정창을 열 때마다 최신 목록을 다시 조회한다
            void loadModels(stored ?? apiKey ?? undefined);
            return;
        }
        setInputKey('');
        setShowKey(false);
        setModelWarning(null);
    };

    const handleSave = () => {
        const trimmed = inputKey.trim();
        if (trimmed) {
            saveApiKey(trimmed);
        }
        if (safeSetStorageItem(MODEL_STORAGE_KEY, selectedModel)) {
            dispatchModelUpdate();
        }
        if (safeSetStorageItem(REASONING_STORAGE_KEY, reasoning)) {
            dispatchReasoningUpdate();
        }
        setOpen(false);
    };

    const handleClear = () => {
        clearApiKey();
        setInputKey('');
    };

    const maskKey = (key: string) => {
        if (key.length <= 8) return '****';
        return key.slice(0, 4) + '****' + key.slice(-4);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-slate-400 hover:text-white"
                    >
                        🔑 API 설정
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle>🔑 Google AI API 키 설정</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        개인 Google AI API 키를 저장하고 현재 프로젝트에서 사용합니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-slate-300">
                                BYOK (Bring Your Own Key)
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500">
                                자신의 Google AI API 키를 사용하여 AI 기능을 이용할 수 있습니다.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-2">
                                <Label className="text-sm text-slate-400">API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type={showKey ? 'text' : 'password'}
                                        value={inputKey}
                                        onChange={(e) => setInputKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="bg-slate-800 border-slate-600 font-mono text-sm"
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowKey(!showKey)}
                                        className="border-slate-600 shrink-0"
                                    >
                                        {showKey ? '🙈' : '👁️'}
                                    </Button>
                                </div>
                            </div>

                            {apiKey && (
                                <div className="text-xs text-green-400 flex items-center gap-2">
                                    ✅ 저장됨: {maskKey(apiKey)}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-slate-300">AI 모델 선택</CardTitle>
                            <CardDescription className="text-xs text-slate-500">
                                현재 Google에서 지원하는 Gemini 모델 중에서 고를 수 있습니다.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm text-slate-400">
                                        모델
                                        {isLoadingModels && (
                                            <span className="ml-2 text-xs text-slate-500">
                                                조회 중...
                                            </span>
                                        )}
                                    </Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void loadModels(inputKey || undefined)}
                                        disabled={isLoadingModels}
                                        className="h-7 border-slate-600 text-xs"
                                    >
                                        🔄 목록 새로고침
                                    </Button>
                                </div>
                                <Select
                                    value={selectedModel}
                                    onValueChange={setSelectedModel}
                                    disabled={isLoadingModels}
                                >
                                    <SelectTrigger className="w-full bg-slate-800 border-slate-600 font-mono text-sm">
                                        <SelectValue placeholder="모델을 선택하세요" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                        {availableModels.map((model) => (
                                            <SelectItem
                                                key={model}
                                                value={model}
                                                className="font-mono text-sm"
                                            >
                                                {model}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {modelWarning && (
                                <p className="text-xs text-amber-400">⚠️ {modelWarning}</p>
                            )}

                            <div className="space-y-2">
                                <Label className="text-sm text-slate-400">추론 깊이</Label>
                                <Select
                                    value={reasoning}
                                    onValueChange={(v) => setReasoning(v as ReasoningLevel)}
                                >
                                    <SelectTrigger className="w-full bg-slate-800 border-slate-600 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                        {REASONING_LEVELS.map((level) => (
                                            <SelectItem
                                                key={level}
                                                value={level}
                                                className="text-sm"
                                            >
                                                {REASONING_LEVEL_LABELS[level]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500">
                                    깊게 둘수록 분석 품질이 오르지만 응답이 느려지고 토큰을 더
                                    씁니다.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="text-xs text-slate-500 space-y-1">
                        <p>• API 키와 선택한 모델은 브라우저 로컬 스토리지에 저장됩니다.</p>
                        <p>
                            • AI 생성 요청은 이 앱의 서버 라우트를 거치므로, 저장한 키는 요청마다
                            서버로 전달됩니다. (외부에 저장되지는 않습니다)
                        </p>
                        <p>
                            •{' '}
                            <a
                                href="https://aistudio.google.com/apikey"
                                target="_blank"
                                rel="noopener"
                                className="text-indigo-400 underline"
                            >
                                Google AI Studio
                            </a>
                            에서 키를 발급받을 수 있습니다.
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex justify-between">
                    {apiKey && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClear}
                            className="mr-auto"
                        >
                            🗑️ 삭제
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            className="border-slate-600 bg-white text-slate-900 hover:bg-slate-100"
                        >
                            취소
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!inputKey.trim() && !apiKey}
                            className="bg-indigo-600 hover:bg-indigo-500"
                        >
                            저장
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
