'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
    mode?: 'fade' | 'slide' | 'scale' | 'fadeSlide';
    duration?: number;
    delay?: number;
}

const variants = {
    fade: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
    },
    slide: {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
    },
    scale: {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
    },
    fadeSlide: {
        initial: { opacity: 0, y: 30, filter: 'blur(4px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -20, filter: 'blur(4px)' },
    },
};

export function PageTransition({
    children,
    className = '',
    mode = 'fadeSlide',
    duration = 0.4,
    delay = 0,
}: PageTransitionProps) {
    return (
        <motion.div
            initial={variants[mode].initial}
            animate={variants[mode].animate}
            exit={variants[mode].exit}
            transition={{
                duration,
                delay,
                ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

interface StaggerContainerProps {
    children: ReactNode;
    className?: string;
    staggerDelay?: number;
    initialDelay?: number;
}

export function StaggerContainer({
    children,
    className = '',
    staggerDelay = 0.08,
    initialDelay = 0.1,
}: StaggerContainerProps) {
    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={{
                hidden: { opacity: 0 },
                visible: {
                    opacity: 1,
                    transition: {
                        delayChildren: initialDelay,
                        staggerChildren: staggerDelay,
                    },
                },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

interface StaggerItemProps {
    children: ReactNode;
    className?: string;
}

export function StaggerItem({ children, className = '' }: StaggerItemProps) {
    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
                visible: {
                    opacity: 1,
                    y: 0,
                    filter: 'blur(0px)',
                    transition: {
                        duration: 0.4,
                        ease: [0.25, 0.46, 0.45, 0.94],
                    },
                },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

interface AnimatedPresenceWrapperProps {
    children: ReactNode;
    mode?: 'wait' | 'sync' | 'popLayout';
}

export function AnimatedPresenceWrapper({
    children,
    mode = 'wait',
}: AnimatedPresenceWrapperProps) {
    return <AnimatePresence mode={mode}>{children}</AnimatePresence>;
}
