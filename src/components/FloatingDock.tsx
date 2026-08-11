'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
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
    isMobile,
}: {
    mouseX: MotionValue<number>;
    item: typeof navItems[0];
    isActive: boolean;
    isMobile: boolean;
}) {
    const ref = useRef<HTMLAnchorElement>(null);

    const distance = useTransform(mouseX, (val) => {
        const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
        return val - bounds.x - bounds.width / 2;
    });

    // 모바일에서는 애니메이션 효과 간소화
    const widthSync = useTransform(distance, [-150, 0, 150], isMobile ? [56, 56, 56] : [48, 72, 48]);
    const width = useSpring(widthSync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });

    const ySync = useTransform(distance, [-150, 0, 150], isMobile ? [0, 0, 0] : [0, -8, 0]);
    const y = useSpring(ySync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });

    return (
        <motion.div 
            style={{ width: isMobile ? 56 : width, y: isMobile ? 0 : y }} 
            className="aspect-square"
        >
            <Link
                ref={ref}
                href={item.href}
                className={`
                    relative flex flex-col items-center justify-center w-full h-full rounded-xl transition-colors
                    touch-target touch-feedback
                    ${isActive
                        ? 'bg-[#3B82F6] text-white shadow-lg'
                        : 'text-[#71717A] hover:bg-[#F5F6F8] hover:text-[#18181B] active:bg-[#E5E7EB]'
                    }
                `}
            >
                <item.Icon className={`${isMobile ? 'w-5 h-5' : 'w-5 h-5'}`} strokeWidth={2} />
                <span className={`font-medium mt-1 opacity-80 ${isMobile ? 'text-[10px]' : 'text-[9px]'}`}>
                    {item.label}
                </span>
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
    const [isMobile, setIsMobile] = useState(false);

    // 모바일 감지
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 랜딩 페이지에서는 Dock 숨김
    if (pathname === '/' || pathname.startsWith('/sop/demo')) return null;

    return (
        <motion.nav
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto z-50 safe-area-bottom"
            onMouseMove={(e) => !isMobile && mouseX.set(e.pageX)}
            onMouseLeave={() => mouseX.set(Infinity)}
        >
            {/* 모바일: 전체 너비, 데스크톱: 플로팅 */}
            <div className={`
                flex items-end justify-around md:justify-center 
                gap-1 md:gap-1 
                px-2 md:px-3 
                py-2 md:py-2 
                bg-white/90 md:bg-white/80 
                backdrop-blur-xl 
                border-t md:border border-[#E2E4E9] 
                md:rounded-2xl 
                shadow-lg md:shadow-xl
                w-full md:w-auto
            `}>
                {navItems.map((item) => (
                    <DockIcon
                        key={item.href}
                        mouseX={mouseX}
                        item={item}
                        isActive={pathname === item.href}
                        isMobile={isMobile}
                    />
                ))}
            </div>
        </motion.nav>
    );
}
