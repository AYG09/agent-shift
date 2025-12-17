'use client';

import { useState } from 'react';
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // 랜딩 페이지에서는 네비게이션 숨김
    if (pathname === '/') return null;

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm safe-area-top">
                <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                    {/* Logo */}
                    <Link
                        href="/"
                        className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent min-h-[44px] flex items-center"
                    >
                        Agent Shift
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden sm:flex items-center gap-1">
                        {navItems.map((item) => (
                            <Link key={item.href} href={item.href}>
                                <Button
                                    variant={pathname === item.href ? 'default' : 'ghost'}
                                    size="sm"
                                    className={
                                        pathname === item.href
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

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
                        aria-label="메뉴 열기"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {mobileMenuOpen ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 6h16M4 12h16M4 18h16"
                                />
                            )}
                        </svg>
                    </button>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div
                    className="sm:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Menu Panel */}
            <nav
                className={`sm:hidden fixed top-14 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-lg transition-transform duration-300 ease-out ${
                    mobileMenuOpen ? 'translate-y-0' : '-translate-y-full'
                }`}
            >
                <div className="p-4 space-y-2 safe-area-top">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <div
                                className={`flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl transition-colors active:scale-[0.98] ${
                                    pathname === item.href
                                        ? 'bg-indigo-50 text-indigo-600'
                                        : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                                }`}
                            >
                                <span className="text-xl">{item.icon}</span>
                                <span className="font-medium">{item.label}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </nav>
        </>
    );
}
