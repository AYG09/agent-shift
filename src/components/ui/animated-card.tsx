'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
    children: React.ReactNode;
    className?: string;
    hoverScale?: number;
    hoverElevation?: 'sm' | 'md' | 'lg' | 'xl';
    glowColor?: string;
    borderGlow?: boolean;
    pressEffect?: boolean;
    delay?: number;
}

const shadowMap = {
    sm: 'shadow-md',
    md: 'shadow-lg',
    lg: 'shadow-xl',
    xl: 'shadow-2xl',
};

export function AnimatedCard({
    children,
    className = '',
    hoverScale = 1.02,
    hoverElevation = 'lg',
    glowColor,
    borderGlow = false,
    pressEffect = true,
    delay = 0,
    ...props
}: AnimatedCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.4,
                delay,
                ease: [0.25, 0.46, 0.45, 0.94],
            }}
            whileHover={{
                scale: hoverScale,
                transition: { duration: 0.2, ease: 'easeOut' },
            }}
            whileTap={pressEffect ? { scale: 0.98 } : undefined}
            className={cn(
                'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm',
                'transition-shadow duration-300',
                `hover:${shadowMap[hoverElevation]}`,
                borderGlow && 'hover:border-primary/50',
                glowColor && `hover:shadow-[0_0_30px_${glowColor}]`,
                className
            )}
            {...props}
        >
            {children}
        </motion.div>
    );
}

interface AnimatedCardHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export function AnimatedCardHeader({ children, className }: AnimatedCardHeaderProps) {
    return (
        <div
            data-slot="card-header"
            className={cn(
                '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
                className
            )}
        >
            {children}
        </div>
    );
}

interface AnimatedCardContentProps {
    children: React.ReactNode;
    className?: string;
}

export function AnimatedCardContent({ children, className }: AnimatedCardContentProps) {
    return (
        <div data-slot="card-content" className={cn('px-6', className)}>
            {children}
        </div>
    );
}

interface AnimatedCardTitleProps {
    children: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
}

export function AnimatedCardTitle({ children, className, icon }: AnimatedCardTitleProps) {
    return (
        <div
            data-slot="card-title"
            className={cn('leading-none font-semibold flex items-center gap-2', className)}
        >
            {icon && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                >
                    {icon}
                </motion.span>
            )}
            {children}
        </div>
    );
}

interface AnimatedCardDescriptionProps {
    children: React.ReactNode;
    className?: string;
}

export function AnimatedCardDescription({ children, className }: AnimatedCardDescriptionProps) {
    return (
        <motion.div
            data-slot="card-description"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className={cn('text-muted-foreground text-sm', className)}
        >
            {children}
        </motion.div>
    );
}

interface GlowCardProps extends AnimatedCardProps {
    glowIntensity?: 'subtle' | 'medium' | 'strong';
    gradientFrom?: string;
    gradientTo?: string;
}

export function GlowCard({
    children,
    className,
    glowIntensity = 'medium',
    gradientFrom = 'from-primary/20',
    gradientTo = 'to-secondary/20',
    ...props
}: GlowCardProps) {
    const intensityMap = {
        subtle: 'opacity-30',
        medium: 'opacity-50',
        strong: 'opacity-70',
    };

    return (
        <div className="relative group">
            <motion.div
                className={cn(
                    'absolute -inset-0.5 rounded-xl bg-gradient-to-r blur-lg transition-opacity duration-300',
                    gradientFrom,
                    gradientTo,
                    intensityMap[glowIntensity],
                    'group-hover:opacity-100'
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                whileHover={{ opacity: 0.7 }}
            />
            <AnimatedCard className={cn('relative', className)} {...props}>
                {children}
            </AnimatedCard>
        </div>
    );
}
