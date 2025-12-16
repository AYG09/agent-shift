'use client';

import { useEffect, useRef } from 'react';

interface ContextMenuProps {
    x: number;
    y: number;
    nodeLabel: string;
    onClose: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onSplit: () => void;
    onDrilldown: () => void;
    onDelete: () => void;
    isLoading?: boolean;
}

export default function NodeContextMenu({
    x,
    y,
    nodeLabel,
    onClose,
    onEdit,
    onDuplicate,
    onSplit,
    onDrilldown,
    onDelete,
    isLoading = false,
}: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const menuItems = [
        { icon: '✏️', label: '편집', action: onEdit, disabled: false },
        { icon: '📋', label: '복제', action: onDuplicate, disabled: false },
        { icon: '🔍', label: '상세 분석 (Drill-down)', action: onDrilldown, disabled: isLoading },
        { icon: '🔀', label: '세분화 (AI)', action: onSplit, disabled: isLoading },
        { divider: true },
        { icon: '🗑️', label: '삭제', action: onDelete, danger: true, disabled: false },
    ];

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[180px] bg-white/95 backdrop-blur-xl border border-[#E2E4E9] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{ left: x, top: y }}
        >
            {/* Header */}
            <div className="px-3 py-2 bg-[#F5F6F8] border-b border-[#E2E4E9]">
                <div className="text-xs text-[#71717A] truncate max-w-[160px]">{nodeLabel}</div>
            </div>

            {/* Menu Items */}
            <div className="py-1">
                {menuItems.map((item, idx) => {
                    if ('divider' in item && item.divider) {
                        return <div key={idx} className="border-t border-[#E2E4E9] my-1" />;
                    }

                    const menuItem = item as {
                        icon: string;
                        label: string;
                        action: () => void;
                        danger?: boolean;
                        disabled?: boolean;
                    };

                    return (
                        <button
                            key={idx}
                            onClick={() => {
                                if (!menuItem.disabled) {
                                    menuItem.action();
                                    if (menuItem.label !== '세분화 (AI)') {
                                        onClose();
                                    }
                                }
                            }}
                            disabled={menuItem.disabled}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                                ${menuItem.danger
                                    ? 'text-red-500 hover:bg-red-50'
                                    : 'text-[#18181B] hover:bg-[#F5F6F8]'
                                }
                                ${menuItem.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            <span>{menuItem.icon}</span>
                            <span>{menuItem.label}</span>
                            {menuItem.label === '세분화 (AI)' && isLoading && (
                                <span className="ml-auto animate-spin">⏳</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
