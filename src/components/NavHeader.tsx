'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

const navItems = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/flow', label: 'Flow', icon: '📊' },
    { href: '/strategy', label: 'Strategy', icon: '📈' },
    { href: '/export', label: 'Export', icon: '📤' },
];

export default function NavHeader() {
    const pathname = usePathname();

    // 랜딩 페이지에서는 네비게이션 숨김
    if (pathname === '/') return null;

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                {/* Logo */}
                <Link
                    href="/"
                    className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"
                >
                    Agent Shift
                </Link>

                {/* Navigation */}
                <nav className="flex items-center gap-1">
                    {navItems.map((item) => (
                        <Link key={item.href} href={item.href}>
                            <Button
                                variant={pathname === item.href ? 'default' : 'ghost'}
                                size="sm"
                                className={pathname === item.href
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                }
                            >
                                <span className="mr-1">{item.icon}</span>
                                {item.label}
                            </Button>
                        </Link>
                    ))}
                </nav>
            </div>
        </header>
    );
}
