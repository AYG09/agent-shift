'use client';

import { use } from 'react';
import Link from 'next/link';
import { RoomProvider } from '@/components/collaboration/RoomProvider';
import { CollaborativeFlowCanvas } from '@/components/flow/CollaborativeFlowCanvas';
import { UserAvatars } from '@/components/collaboration/UserAvatars';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';

interface RoomPageProps {
    params: Promise<{ roomId: string }>;
}

export default function RoomPage({ params }: RoomPageProps) {
    const { roomId } = use(params);
    const [copied, setCopied] = useState(false);

    const copyRoomLink = useCallback(async () => {
        const url = `${window.location.origin}/room/${roomId}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('클립보드 복사 실패:', err);
        }
    }, [roomId]);

    return (
        <RoomProvider roomId={roomId}>
            <div className="flex h-screen flex-col bg-gradient-to-br from-slate-50 to-blue-50">
                {/* 헤더 */}
                <header className="flex items-center justify-between border-b border-gray-200 bg-white/80 px-3 sm:px-4 py-2 sm:py-3 backdrop-blur-sm safe-area-top">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <Link href="/flow">
                            <Button variant="ghost" size="sm" className="gap-1 sm:gap-2 min-h-[44px] min-w-[44px] px-2 sm:px-3">
                                <ArrowLeft className="h-4 w-4" />
                                <span className="hidden sm:inline">돌아가기</span>
                            </Button>
                        </Link>
                        <div className="h-6 w-px bg-gray-200 hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-medium text-gray-700 hidden sm:inline">
                                협업 세션
                            </span>
                            <code className="rounded bg-gray-100 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs text-gray-600">
                                {roomId}
                            </code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={copyRoomLink}
                                className="h-11 w-11 sm:h-7 sm:w-7 p-0 active:scale-95"
                            >
                                {copied ? (
                                    <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-green-600" />
                                ) : (
                                    <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                )}
                            </Button>
                        </div>
                    </div>

                    <UserAvatars />
                </header>

                {/* 메인 캔버스 */}
                <main className="flex-1 overflow-hidden">
                    <CollaborativeFlowCanvas />
                </main>
            </div>
        </RoomProvider>
    );
}
