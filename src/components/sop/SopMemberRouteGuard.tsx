'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { resolveIntakeRouteAccess, type SopIntakeRoute } from '@/lib/sop-member-intake';

/**
 * 재설계 구성원 흐름(`/sop/login` → `/sop/context` → `/sop/recommendation` →
 * `/sop/work-map/*`)의 진입 가드.
 *
 * 판정 자체는 이 컴포넌트가 하지 않는다 — 순수 도메인 함수
 * `resolveIntakeRouteAccess`(sop-member-intake.ts)가 하고, 여기서는 **언제 판정해도
 * 되는지**와 이동만 책임진다. 그래서 "URL만 바꿔 로그인 상태를 위조"할 수 없고,
 * 같은 규칙을 브라우저 없이 테스트할 수 있다 (SPEC §2.2).
 *
 * hydration 처리가 이 컴포넌트의 존재 이유다: zustand persist는 첫 렌더 직후에
 * localStorage를 복원하므로, 복원 전에 판정하면 이미 로그인한 구성원도 매 새로고침마다
 * 로그인 화면으로 튕긴다. 복원이 끝나기 전에는 어떤 이동도 하지 않는다.
 *
 * `navigate`를 prop으로 받는 이유는 이 저장소의 기존 SOP 컴포넌트 규칙과 같다
 * (SopColleagueTemplatePicker 참고): App Router 밖에서도 렌더 가능해야 테스트에서
 * 라우터를 흉내 낼 수 있다.
 */
export function useSopStoreHydrated(): boolean {
    // useSyncExternalStore를 쓰는 이유: 복원 완료 여부는 React 밖(zustand persist)의
    // 상태다. effect에서 setState로 흉내 내면 구독 등록과 복원 완료 사이에 경합이
    // 생기고, 첫 렌더 직후 불필요한 재렌더가 한 번 더 일어난다. 구독·현재값·SSR값을
    // 함께 넘기면 그 경합 자체가 사라진다.
    return useSyncExternalStore(
        (onStoreChange) => useSopPrototypeStore.persist.onFinishHydration(onStoreChange),
        () => useSopPrototypeStore.persist.hasHydrated(),
        // 서버 렌더에는 브라우저 저장소가 없으므로 언제나 "복원 전"이다.
        () => false
    );
}

export interface SopMemberRouteGuardProps {
    route: SopIntakeRoute;
    navigate: (path: string) => void;
    children: ReactNode;
    /** 복원 중이거나 이동 대기 중에 보여줄 내용. 기본은 아무것도 그리지 않는다. */
    fallback?: ReactNode;
}

export function SopMemberRouteGuard({ route, navigate, children, fallback = null }: SopMemberRouteGuardProps) {
    const hydrated = useSopStoreHydrated();
    const memberSession = useSopPrototypeStore((state) => state.memberSession);
    const memberContext = useSopPrototypeStore((state) => state.memberContext);
    const taskRecommendation = useSopPrototypeStore((state) => state.taskRecommendation);
    const hasWorkMapDraft = useSopPrototypeStore((state) => !!state.workMapDraft);

    const decision = resolveIntakeRouteAccess(route, { session: memberSession, memberContext, recommendation: taskRecommendation, hasWorkMapDraft });
    const redirectTo = decision.allowed ? null : decision.redirectTo;

    useEffect(() => {
        if (!hydrated || !redirectTo) return;
        navigate(redirectTo);
    }, [hydrated, redirectTo, navigate]);

    if (!hydrated || redirectTo) return <>{fallback}</>;
    return <>{children}</>;
}
