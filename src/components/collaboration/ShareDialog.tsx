'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Share2, Users, Check, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export function ShareDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [joinRoomId, setJoinRoomId] = useState('');

    // 로컬 스토어에서 현재 작업 데이터 가져오기
    const { asIsNodes, asIsEdges, toBeNodes, toBeEdges, context, strategy } = useAppStore();

    // 새 Room ID 생성 (8자리 랜덤 문자열)
    const [roomId] = useState(() => {
        if (typeof crypto !== 'undefined') {
            return crypto.randomUUID().slice(0, 8);
        }
        return Math.random().toString(36).substring(2, 10);
    });

    // 공유 URL 생성
    const shareUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/room/${roomId}`
        : '';

    // 클립보드에 복사
    const copyToClipboard = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('클립보드 복사 실패:', err);
        }
    }, [shareUrl]);

    // 새 협업 세션 시작
    const startNewSession = () => {
        // 로컬 스토어 데이터를 sessionStorage에 저장 (room 페이지에서 로드)
        if (typeof window !== 'undefined') {
            const hasData = asIsNodes.length > 0 || toBeNodes.length > 0 || context;
            if (hasData) {
                const localData = { asIsNodes, asIsEdges, toBeNodes, toBeEdges, context, strategy };
                sessionStorage.setItem('collab-initial-data', JSON.stringify(localData));
            }
        }
        router.push(`/room/${roomId}`);
        setOpen(false);
    };

    // 기존 세션 참여
    const joinSession = () => {
        if (joinRoomId.trim()) {
            router.push(`/room/${joinRoomId.trim()}`);
            setOpen(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="gap-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                >
                    <Users className="h-4 w-4" />
                    협업 시작
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5 text-blue-600" />
                        실시간 협업
                    </DialogTitle>
                    <DialogDescription>
                        팀원들과 함께 실시간으로 업무 프로세스를 분석하고 개선하세요.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* 새 세션 시작 */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">새 협업 세션 시작</Label>
                        <div className="flex gap-2">
                            <Input
                                value={shareUrl}
                                readOnly
                                className="flex-1 bg-gray-50 text-sm"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={copyToClipboard}
                                className="shrink-0"
                            >
                                {copied ? (
                                    <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                        <Button
                            onClick={startNewSession}
                            className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                            <ExternalLink className="h-4 w-4" />
                            새 세션 시작하기
                        </Button>
                        <p className="text-xs text-gray-500">
                            이 링크를 팀원에게 공유하면 함께 편집할 수 있습니다.
                        </p>
                    </div>

                    {/* 구분선 */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-gray-500">또는</span>
                        </div>
                    </div>

                    {/* 기존 세션 참여 */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">기존 세션 참여</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Room ID 입력 (예: abc12345)"
                                value={joinRoomId}
                                onChange={(e) => setJoinRoomId(e.target.value)}
                                className="flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') joinSession();
                                }}
                            />
                            <Button
                                onClick={joinSession}
                                disabled={!joinRoomId.trim()}
                                variant="outline"
                            >
                                참여
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
