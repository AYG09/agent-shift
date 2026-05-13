'use client';

import { useEffect, ReactNode } from 'react';
import { useCollabStore } from '@/lib/collaboration-store';
import { getRandomUserColor, getRandomUserName } from '@/lib/liveblocks.config';
import { Spinner } from '@/components/ui/spinner';

const isDev = process.env.NODE_ENV === 'development';

interface RoomProviderProps {
    roomId: string;
    children: ReactNode;
}

export function RoomProvider({ roomId, children }: RoomProviderProps) {
    const enterRoom = useCollabStore((state) => state.liveblocks.enterRoom);
    const leaveRoom = useCollabStore((state) => state.liveblocks.leaveRoom);
    const connectionStatus = useCollabStore((state) => state.liveblocks.status);
    const setUser = useCollabStore((state) => state.setUser);
    const syncFromLocalStore = useCollabStore((state) => state.syncFromLocalStore);

    useEffect(() => {
        // 1. sessionStorage에서 초기 데이터 로드 (새 세션 시작 시)
        if (typeof window !== 'undefined') {
            const savedData = sessionStorage.getItem('collab-initial-data');
            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    syncFromLocalStore(parsed);
                    sessionStorage.removeItem('collab-initial-data'); // 일회용
                    if (isDev) {
                        console.log('[RoomProvider] 로컬 데이터 동기화 완료');
                    }
                } catch (e) {
                    if (isDev) {
                        console.error('[RoomProvider] 초기 데이터 파싱 실패:', e);
                    }
                }
            }
        }

        // 2. 사용자 정보 초기화 (랜덤 이름 및 색상)
        const userName = localStorage.getItem('collab-user-name') || getRandomUserName();
        const userColor = localStorage.getItem('collab-user-color') || getRandomUserColor();
        
        // 사용자 정보 저장 (다음 접속 시 재사용)
        localStorage.setItem('collab-user-name', userName);
        localStorage.setItem('collab-user-color', userColor);
        
        setUser({ name: userName, color: userColor });

        enterRoom(roomId);

        // 클린업: Room 퇴장
        return () => {
            leaveRoom();
        };
    }, [roomId, enterRoom, leaveRoom, setUser, syncFromLocalStore]);

    // 연결 중 상태
    if (connectionStatus === 'initial' || connectionStatus === 'connecting') {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="flex flex-col items-center gap-4">
                    <Spinner className="h-8 w-8" />
                    <p className="text-sm text-gray-600">협업 세션에 연결 중...</p>
                    <p className="text-xs text-gray-400">Room: {roomId}</p>
                </div>
            </div>
        );
    }

    if (connectionStatus === 'reconnecting') {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 to-amber-50">
                <div className="flex flex-col items-center gap-4">
                    <Spinner className="h-8 w-8" />
                    <p className="text-sm text-gray-600">연결을 다시 시도하는 중...</p>
                    <p className="text-xs text-gray-400">Room: {roomId}</p>
                </div>
            </div>
        );
    }

    // 에러 상태
    if (connectionStatus === 'disconnected') {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 to-red-50">
                <div className="flex flex-col items-center gap-4 rounded-lg bg-white/80 p-8 shadow-lg backdrop-blur-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <svg
                            className="h-6 w-6 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">연결 실패</h2>
                    <p className="text-sm text-gray-600">협업 세션에 연결할 수 없습니다.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    // 연결 성공 - children 렌더링
    return <>{children}</>;
}
