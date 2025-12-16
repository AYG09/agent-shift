'use client';

import { cn } from '@/lib/utils';

interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
    return (
        <svg
            className={cn('animate-spin', sizeClasses[size], className)}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
        </svg>
    );
}

// AI 생성용 특별한 로딩 컴포넌트
export function AILoadingIndicator({ text = 'AI가 분석 중...' }: { text?: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="relative">
                <Spinner size="sm" className="text-white" />
                <div className="absolute inset-0 animate-ping">
                    <Spinner size="sm" className="text-white/30" />
                </div>
            </div>
            <span className="text-sm animate-pulse">{text}</span>
        </div>
    );
}

// 스켈레톤 노드 (캔버스용)
export function SkeletonNode() {
    return (
        <div className="w-40 h-20 rounded-lg bg-gradient-to-r from-[#E2E4E9] via-[#F5F6F8] to-[#E2E4E9] animate-pulse border border-[#E2E4E9]">
            <div className="p-3 space-y-2">
                <div className="h-3 bg-[#D4D4D8] rounded w-3/4" />
                <div className="h-2 bg-[#D4D4D8] rounded w-1/2" />
            </div>
        </div>
    );
}

export function CanvasSkeletonLoader() {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-6">
                {/* 스켈레톤 노드들 */}
                <div className="flex gap-4">
                    <SkeletonNode />
                    <SkeletonNode />
                    <SkeletonNode />
                </div>
                <div className="flex gap-4">
                    <SkeletonNode />
                    <SkeletonNode />
                </div>
                
                {/* 로딩 텍스트 */}
                <div className="flex items-center gap-3 mt-4 px-4 py-2 bg-white/80 backdrop-blur-xl rounded-full border border-[#E2E4E9] shadow-lg">
                    <Spinner size="sm" className="text-[#3B82F6]" />
                    <span className="text-sm text-[#71717A] font-medium">AI가 플로우를 생성하고 있습니다...</span>
                </div>
            </div>
        </div>
    );
}
