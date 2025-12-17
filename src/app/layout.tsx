import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import FloatingDock from '@/components/FloatingDock';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

// 모바일 최적화 Viewport 설정
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    viewportFit: 'cover', // iOS 노치/다이나믹 아일랜드 대응
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
        { media: '(prefers-color-scheme: dark)', color: '#18181b' },
    ],
};

export const metadata: Metadata = {
    title: 'Agent Shift - AI 기반 변화 관리 플랫폼',
    description: '업무 프로세스를 AI Agent로 전환하고, 변화 관리 전략을 수립하세요.',
    keywords: 'AI Agent, 변화 관리, RPA, 업무 자동화, 디지털 전환',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Agent Shift',
    },
    formatDetection: {
        telephone: false, // 전화번호 자동 링크 방지
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased pro-canvas text-[#18181B]`}
            >
                <main>{children}</main>
                <FloatingDock />
            </body>
        </html>
    );
}
