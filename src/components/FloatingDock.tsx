'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, MotionValue } from 'framer-motion';
import { Home, GitBranch, Target, Download } from 'lucide-react';

const navItems = [
    { href: '/', label: 'Home', Icon: Home },
    { href: '/flow', label: 'Flow', Icon: GitBranch },
    { href: '/strategy', label: 'Strategy', Icon: Target },
    { href: '/export', label: 'Export', Icon: Download },
];

function DockIcon({
    mouseX,
    item,
    isActive,
}: {
    mouseX: MotionValue<number>;
    item: typeof navItems[0];
    isActive: boolean;
}) {
    const ref = useRef<HTMLAnchorElement>(null);

    const distance = useTransform(mouseX, (val) => {
        const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
        return val - bounds.x - bounds.width / 2;
    });

    const widthSync = useTransform(distance, [-150, 0, 150], [48, 72, 48]);
    const width = useSpring(widthSync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });

    const ySync = useTransform(distance, [-150, 0, 150], [0, -8, 0]);
    const y = useSpring(ySync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });

    return (
        <motion.div style={{ width, y }} className="aspect-square">
            <Link
                ref={ref}
                href={item.href}
                className={`
                    relative flex flex-col items-center justify-center w-full h-full rounded-xl transition-colors
                    ${isActive
                        ? 'bg-[#3B82F6] text-white shadow-lg'
                        : 'text-[#71717A] hover:bg-[#F5F6F8] hover:text-[#18181B]'
                    }
                `}
            >
                <item.Icon className="w-5 h-5" strokeWidth={2} />
                <span className="text-[9px] font-medium mt-1 opacity-80">{item.label}</span>
                {isActive && (
                    <motion.div
                        layoutId="dock-indicator"
                        className="absolute -bottom-1.5 w-1.5 h-1.5 bg-white rounded-full"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                )}
            </Link>
        </motion.div>
    );
}

export default function FloatingDock() {
    const pathname = usePathname();
    const mouseX = useMotionValue(Infinity);

    // 랜딩 페이지에서는 Dock 숨김
    if (pathname === '/') return null;

    return (
        <motion.nav
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            onMouseMove={(e) => mouseX.set(e.pageX)}
            onMouseLeave={() => mouseX.set(Infinity)}
        >
            <div className="flex items-end gap-1 px-3 py-2 bg-white/80 backdrop-blur-xl border border-[#E2E4E9] rounded-2xl shadow-xl">
                {navItems.map((item) => (
                    <DockIcon
                        key={item.href}
                        mouseX={mouseX}
                        item={item}
                        isActive={pathname === item.href}
                    />
                ))}
            </div>
        </motion.nav>
    );
}
