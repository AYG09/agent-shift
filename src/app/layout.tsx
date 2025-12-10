import type { Metadata } from 'next';
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

export const metadata: Metadata = {
    title: 'Agent Shift - AI 기반 변화 관리 플랫폼',
    description: '업무 프로세스를 AI Agent로 전환하고, 변화 관리 전략을 수립하세요.',
    keywords: 'AI Agent, 변화 관리, RPA, 업무 자동화, 디지털 전환',
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
