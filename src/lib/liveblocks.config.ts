'use client';

// Liveblocks Presence 타입 - 실시간 임시 상태
export type Presence = {
    cursor: { x: number; y: number } | null;
    selectedNodeId: string | null;
    user: {
        name: string;
        color: string;
    };
};

// 협업 사용자 색상 팔레트
const USER_COLORS = [
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
