'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/flow', label: 'Flow', icon: '📊' },
    { href: '/strategy', label: 'Strategy', icon: '📈' },
    { href: '/export', label: 'Export', icon: '📤' },
];

export default function FloatingDock() {
    const pathname = usePathname();

    // 랜딩 페이지에서는 Dock 숨김
    if (pathname === '/') return null;

    return (
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-1 px-2 py-2 bg-white/80 backdrop-blur-xl border border-[#E2E4E9] rounded-2xl shadow-lg">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`
                            flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all
                            ${pathname === item.href
                                ? 'bg-[#3B82F6] text-white shadow-md'
                                : 'text-[#71717A] hover:bg-[#F5F6F8] hover:text-[#18181B]'
                            }
                        `}
                    >
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
                    </Link>
                ))}
            </div>
        </nav>
    );
}
