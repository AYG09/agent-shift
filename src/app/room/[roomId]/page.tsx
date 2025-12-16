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
                <header className="flex items-center justify-between border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <Link href="/flow">
                            <Button variant="ghost" size="sm" className="gap-2">
                                <ArrowLeft className="h-4 w-4" />
                                돌아가기
                            </Button>
                        </Link>
                        <div className="h-6 w-px bg-gray-200" />
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">
                                협업 세션
                            </span>
                            <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                {roomId}
                            </code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={copyRoomLink}
                                className="h-7 w-7 p-0"
                            >
                                {copied ? (
                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
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
