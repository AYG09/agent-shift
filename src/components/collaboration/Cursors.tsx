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
