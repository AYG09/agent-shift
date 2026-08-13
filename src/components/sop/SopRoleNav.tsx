'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserRound, Inbox, BarChart3 } from 'lucide-react';

/**
 * 역할 화면 간 상단 내비게이션 — 구성원 Home / 승인 Inbox(직책자·SME) /
 * HR 대시보드.
 *
 * 이 세 화면은 각각 별도 라우트로 구현되어 있었지만 서로를 잇는 UI 경로가
 * 전혀 없어 URL을 직접 입력해야만 도달할 수 있었다(고객 지적 사항). 모든
 * 주요 화면의 헤더 우측에 이 탭을 상시 노출해 역할 전환 이동을 UI로
 * 보장한다. 프로토타입의 데모 역할 이동일 뿐 실제 인증/권한 전환이 아니다 —
 * 각 화면이 자체적으로 표기하는 역할 안내 문구는 그대로 유지된다.
 */
const NAV_ITEMS: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isActive: (pathname: string) => boolean;
}[] = [
    {
        href: '/sop',
        label: '구성원',
        icon: UserRound,
        // 구성원 역할의 하위 화면(Home·Gate·Workspace·데모)은 모두 구성원 탭이 활성.
        isActive: (pathname) => pathname === '/sop' || pathname.startsWith('/sop/setup') || pathname.startsWith('/sop/workspace') || pathname.startsWith('/sop/demo'),
    },
    { href: '/sop/approvals', label: '승인 Inbox', icon: Inbox, isActive: (pathname) => pathname.startsWith('/sop/approvals') },
    { href: '/sop/hr', label: 'HR 대시보드', icon: BarChart3, isActive: (pathname) => pathname.startsWith('/sop/hr') },
];

export const SopRoleNav: React.FC<{
    /** 좁은 헤더(Workspace 등)용 아이콘 전용 표시. 라벨은 title 툴팁으로 제공된다. */
    compact?: boolean;
}> = ({ compact = false }) => {
    const pathname = usePathname() ?? '';

    return (
        <nav aria-label="역할 화면 이동" className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.isActive(pathname);
                return (
                    // next/link 대신 일반 앵커를 쓴다: 역할 화면은 각각 독립 최상위
                    // 라우트이고 상태는 localStorage persist로 보존되므로 전체 내비게이션으로
                    // 충분하며, next/link의 클라이언트 런타임은 Node 테스트 환경에서
                    // 로드되지 않는다(self is not defined).
                    <a
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={compact ? item.label : item.label}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            active ? 'bg-white text-indigo-700 shadow-2xs' : 'text-zinc-500 hover:bg-white hover:text-zinc-900'
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {!compact && item.label}
                    </a>
                );
            })}
        </nav>
    );
};
