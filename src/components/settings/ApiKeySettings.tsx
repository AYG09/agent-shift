'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog';

const API_KEY_STORAGE_KEY = 'agent-shift-api-key';

interface ApiKeySettingsProps {
    trigger?: React.ReactNode;
}

export function useApiKey() {
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(() => typeof window !== 'undefined');

    const loadApiKey = () => {
        if (typeof window === 'undefined') return null;
        const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
        setApiKey(stored ?? null);
        setIsLoaded(true);
        return stored;
    };

    const saveApiKey = (key: string) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(API_KEY_STORAGE_KEY, key);
            setApiKey(key);
            setIsLoaded(true);
        }
    };

    const clearApiKey = () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(API_KEY_STORAGE_KEY);
            setApiKey(null);
            setIsLoaded(true);
        }
    };

    return { apiKey, isLoaded, loadApiKey, saveApiKey, clearApiKey };
}

export default function ApiKeySettings({ trigger }: ApiKeySettingsProps) {
    const { apiKey, loadApiKey, saveApiKey, clearApiKey } = useApiKey();
    const [inputKey, setInputKey] = useState('');
    const [open, setOpen] = useState(false);
    const [showKey, setShowKey] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            const stored = loadApiKey();
            setInputKey(stored ?? apiKey ?? '');
            return;
        }
        setInputKey('');
        setShowKey(false);
    };

    const handleSave = () => {
        if (inputKey.trim()) {
            saveApiKey(inputKey.trim());
            setOpen(false);
        }
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

                    <div className="text-xs text-slate-500 space-y-1">
                        <p>• API 키는 브라우저 로컬 스토리지에 저장됩니다.</p>
                        <p>• 서버로 전송되지 않으며 브라우저에서만 사용됩니다.</p>
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
                            disabled={!inputKey.trim()}
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
