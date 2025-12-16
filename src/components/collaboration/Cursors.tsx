'use client';

import { motion } from 'framer-motion';
import { MousePointer2 } from 'lucide-react';

interface CursorData {
    cursor: { x: number; y: number } | null;
    user: { name: string; color: string };
}

interface CursorsProps {
    others: readonly { presence: CursorData }[];
}

export function Cursors({ others }: CursorsProps) {
    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {others.map((other, index) => {
                const { cursor, user } = other.presence;
                
                // 커서가 없으면 렌더링하지 않음
                if (!cursor) return null;

                return (
                    <motion.div
                        key={index}
                        className="absolute"
                        initial={false}
                        animate={{
                            x: cursor.x,
                            y: cursor.y,
                        }}
                        transition={{
                            type: 'spring',
                            damping: 30,
                            stiffness: 200,
                            mass: 0.5,
                        }}
                    >
                        {/* 커서 아이콘 */}
                        <MousePointer2
                            className="h-5 w-5 -rotate-12 drop-shadow-md"
                            style={{
                                color: user.color,
                                fill: user.color,
                            }}
                        />
                        
                        {/* 사용자 이름 태그 */}
                        <div
                            className="ml-4 mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-white shadow-sm"
                            style={{ backgroundColor: user.color }}
                        >
                            {user.name}
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

// 커서 아이콘 SVG 컴포넌트 (Lucide 아이콘 대안)
export function CursorIcon({ color }: { color: string }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
            className="drop-shadow-md"
        >
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z" />
        </svg>
    );
}
