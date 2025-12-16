'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Palette, Zap, ZapOff, ArrowLeftRight } from 'lucide-react';

interface EdgeContextMenuProps {
    x: number;
    y: number;
    edgeId: string;
    onClose: () => void;
    onDelete: () => void;
    onToggleAnimation?: () => void;
    isAnimated?: boolean;
    onReverseDirection?: () => void;
}

export default function EdgeContextMenu({
    x,
    y,
    edgeId,
    onClose,
    onDelete,
    onToggleAnimation,
    isAnimated = false,
    onReverseDirection,
}: EdgeContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    // 메뉴가 화면 밖으로 나가지 않도록 위치 조정
    const adjustedX = Math.min(x, window.innerWidth - 200);
    const adjustedY = Math.min(y, window.innerHeight - 150);

    return (
        <AnimatePresence>
            <motion.div
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.9, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -5 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="fixed z-[9999] bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200/80 overflow-hidden min-w-[180px]"
                style={{ left: adjustedX, top: adjustedY }}
            >
                {/* 헤더 */}
                <div className="px-3 py-2 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        연결선 옵션
                    </span>
                </div>

                {/* 메뉴 아이템들 */}
                <div className="py-1">
                    {/* 방향 뒤집기 */}
                    {onReverseDirection && (
                        <button
                            onClick={() => {
                                onReverseDirection();
                                onClose();
                            }}
                            className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors group"
                        >
                            <ArrowLeftRight size={16} className="text-gray-400 group-hover:text-indigo-500" />
                            <span>방향 뒤집기</span>
                            <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                R
                            </span>
                        </button>
                    )}

                    {/* 애니메이션 토글 */}
                    {onToggleAnimation && (
                        <>
                            <button
                                onClick={() => {
                                    onToggleAnimation();
                                    onClose();
                                }}
                                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors group"
                            >
                                {isAnimated ? (
                                    <ZapOff size={16} className="text-gray-400 group-hover:text-indigo-500" />
                                ) : (
                                    <Zap size={16} className="text-gray-400 group-hover:text-indigo-500" />
                                )}
                                <span>{isAnimated ? '애니메이션 끄기' : '애니메이션 켜기'}</span>
                            </button>

                            {/* 구분선 */}
                            <div className="h-px bg-gray-100 my-1" />
                        </>
                    )}

                    {/* 삭제 */}
                    <button
                        onClick={() => {
                            onDelete();
                            onClose();
                        }}
                        className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-red-600 hover:bg-red-50 transition-colors group"
                    >
                        <Trash2 size={16} className="text-red-400 group-hover:text-red-500" />
                        <span>연결선 삭제</span>
                        <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            Del
                        </span>
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
