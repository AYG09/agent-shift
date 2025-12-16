'use client';

import { createClient } from '@liveblocks/client';

// Liveblocks 클라이언트 인스턴스 생성
// publicApiKey는 클라이언트에서 안전하게 사용 가능
export const liveblocksClient = createClient({
    publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!,
});

// Room 상태 타입
export type RoomStatus = 'initial' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

// 기본 Room 옵션
export const defaultRoomOptions = {
    initialPresence: {
        cursor: null,
        selectedNodeId: null,
        user: {
            name: '익명 사용자',
            color: '#888888',
        },
    },
    initialStorage: {
        asIsNodes: [],
        asIsEdges: [],
        toBeNodes: [],
        toBeEdges: [],
        context: null,
        strategy: null,
    },
};
