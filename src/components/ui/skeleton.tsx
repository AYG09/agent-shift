'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    variant?: 'default' | 'circular' | 'rectangular' | 'text';
    width?: string | number;
    height?: string | number;
    animated?: boolean;
}

export function Skeleton({
    className,
    variant = 'default',
    width,
    height,
    animated = true,
    ...props
}: SkeletonProps) {
    const variantStyles = {
        default: 'rounded-md',
        circular: 'rounded-full',
        rectangular: 'rounded-none',
        text: 'rounded-sm h-4',
    };

    const style: React.CSSProperties = {
        width: width,
        height: height,
    };

    if (animated) {
        return (
            <motion.div
                className={cn(
                    'bg-muted relative overflow-hidden',
                    variantStyles[variant],
                    className
                )}
                style={style}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    ease: 'easeInOut',
                }}
            >
                <motion.div
                    className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{ translateX: ['-100%', '100%'] }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
            </motion.div>
        );
    }

    return (
        <div
            className={cn(
                'bg-muted animate-pulse',
                variantStyles[variant],
                className
            )}
            style={style}
            {...props}
        />
    );
}

interface SkeletonTextProps {
    lines?: number;
    className?: string;
    lineClassName?: string;
    lastLineWidth?: string;
}

export function SkeletonText({
    lines = 3,
    className,
    lineClassName,
    lastLineWidth = '60%',
}: SkeletonTextProps) {
    return (
        <div className={cn('space-y-2', className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    variant="text"
                    className={cn('h-4', lineClassName)}
                    style={{
                        width: i === lines - 1 ? lastLineWidth : '100%',
                    }}
                />
            ))}
        </div>
    );
}

interface SkeletonCardProps {
    className?: string;
    hasHeader?: boolean;
    hasImage?: boolean;
    imageHeight?: string | number;
    lines?: number;
}

export function SkeletonCard({
    className,
    hasHeader = true,
    hasImage = false,
    imageHeight = 120,
    lines = 3,
}: SkeletonCardProps) {
    return (
        <motion.div
            className={cn(
                'bg-card rounded-xl border p-6 space-y-4',
                className
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {hasImage && (
                <Skeleton
                    variant="rectangular"
                    className="w-full rounded-lg"
                    height={imageHeight}
                />
            )}
            {hasHeader && (
                <div className="space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            )}
            <SkeletonText lines={lines} />
        </motion.div>
    );
}

interface SkeletonAvatarProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export function SkeletonAvatar({ size = 'md', className }: SkeletonAvatarProps) {
    const sizeMap = {
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-12 w-12',
        xl: 'h-16 w-16',
    };

    return (
        <Skeleton
            variant="circular"
            className={cn(sizeMap[size], className)}
        />
    );
}

interface SkeletonButtonProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function SkeletonButton({ size = 'md', className }: SkeletonButtonProps) {
    const sizeMap = {
        sm: 'h-8 w-20',
        md: 'h-10 w-24',
        lg: 'h-12 w-32',
    };

    return (
        <Skeleton
            className={cn('rounded-md', sizeMap[size], className)}
        />
    );
}

interface SkeletonTableProps {
    rows?: number;
    columns?: number;
    className?: string;
}

export function SkeletonTable({
    rows = 5,
    columns = 4,
    className,
}: SkeletonTableProps) {
    return (
        <div className={cn('space-y-3', className)}>
            {/* Header */}
            <div className="flex gap-4 pb-2 border-b">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton
                        key={`header-${i}`}
                        className="h-4 flex-1"
                    />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <div key={`row-${rowIdx}`} className="flex gap-4">
                    {Array.from({ length: columns }).map((_, colIdx) => (
                        <Skeleton
                            key={`cell-${rowIdx}-${colIdx}`}
                            className="h-4 flex-1"
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

interface LoadingOverlayProps {
    isLoading: boolean;
    children: React.ReactNode;
    className?: string;
    blur?: boolean;
}

export function LoadingOverlay({
    isLoading,
    children,
    className,
    blur = true,
}: LoadingOverlayProps) {
    return (
        <div className={cn('relative', className)}>
            {children}
            {isLoading && (
                <motion.div
                    className={cn(
                        'absolute inset-0 bg-background/60 flex items-center justify-center z-50',
                        blur && 'backdrop-blur-sm'
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="flex flex-col items-center gap-3"
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                    >
                        <motion.div
                            className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: 'linear',
                            }}
                        />
                        <span className="text-sm text-muted-foreground">로딩 중...</span>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
}
