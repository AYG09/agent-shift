'use client';

import { FlowNode, FlowEdge, UserContext, StrategyData } from './store';

// Liveblocks Presence 타입 - 실시간 임시 상태
export type Presence = {
    cursor: { x: number; y: number } | null;
    selectedNodeId: string | null;
    user: {
        name: string;
        color: string;
    };
};

// Liveblocks Storage 타입 - 영구 동기화 상태
export type Storage = {
    asIsNodes: FlowNode[];
    asIsEdges: FlowEdge[];
    toBeNodes: FlowNode[];
    toBeEdges: FlowEdge[];
    context: UserContext | null;
    strategy: StrategyData | null;
};

// 사용자 메타 정보
export type UserMeta = {
    id: string;
    info: {
        name: string;
        color: string;
        avatar?: string;
    };
};

// Room 이벤트 타입
export type RoomEvent = {
    type: 'NODE_SELECTED' | 'NODE_EDITED' | 'CURSOR_MOVED';
    nodeId?: string;
    userId?: string;
};

// 협업 사용자 색상 팔레트
export const USER_COLORS = [
    '#E57373', // Red
    '#64B5F6', // Blue
    '#81C784', // Green
    '#FFD54F', // Yellow
    '#BA68C8', // Purple
    '#4DB6AC', // Teal
    '#FF8A65', // Orange
    '#A1887F', // Brown
] as const;

// 랜덤 사용자 색상 생성
export function getRandomUserColor(): string {
    return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

// 랜덤 사용자 이름 생성 (익명 모드용)
export function getRandomUserName(): string {
    const adjectives = ['용감한', '빠른', '똑똑한', '창의적인', '열정적인'];
    const nouns = ['코끼리', '호랑이', '독수리', '돌고래', '판다'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
}
