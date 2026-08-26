'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2, X } from 'lucide-react';
import { SOP_RECOMMENDATION_LOADING_TIPS, SOP_RECOMMENDATION_TIP_INTERVAL_MS } from '@/lib/sop-task-recommendation-meta';

/**
 * `prefers-reduced-motion` 구독. 이 화면 하나에서만 쓰는 아주 작은 로직이라
 * 별도 훅 파일로 분리하지 않았다 — Wave 1B는 이 파일들만 소유한다
 * (03_WAVE1B_RECOMMENDATION_LOADING.md 배타적 소유 파일 목록에 `src/hooks/**`가
 * 없다). useSyncExternalStore를 쓰는 이유는 이 저장소의 다른 media-query 구독
 * (useSopAiSettings의 localStorage 구독)과 같다: React 밖의 값이므로 effect+setState로
 * 흉내 내면 첫 렌더 직후 불필요한 재렌더와 초기값 경합이 생긴다.
 */
function subscribeReducedMotion(onChange: () => void) {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);
}

export interface SopRecommendationLoadingProps {
    /** 취소 버튼을 숨기려면 생략한다 — 화면에는 항상 취소·context 복귀 경로가 있어야 한다(SPEC §3.3). */
    onCancel: () => void;
}

/**
 * AI Task 추천 처리 중 화면. 숫자형 진행률이나 가짜 완료 단계는 만들지 않고
 * (NFR-LOAD-001), 프로그램 목적·추천의 한계·다음 단계를 설명하는 정적 도움말을
 * 순환한다(REQ-LOAD-002). 내용 전환에는 `prefers-reduced-motion`일 때 트랜지션을
 * 적용하지 않지만, 순환 자체는 애니메이션이 아니라 정보 순환이므로 계속 동작한다
 * (NFR-LOAD-003).
 */
export function SopRecommendationLoading({ onCancel }: SopRecommendationLoadingProps) {
    const [tipIndex, setTipIndex] = useState(0);
    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIndex((current) => (current + 1) % SOP_RECOMMENDATION_LOADING_TIPS.length);
        }, SOP_RECOMMENDATION_TIP_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    const tip = SOP_RECOMMENDATION_LOADING_TIPS[tipIndex];

    return (
        <section className="mx-auto flex max-w-xl flex-col items-center gap-6 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm" aria-label="AI Task 추천 처리 중">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Loader2 className={`h-7 w-7 ${reducedMotion ? '' : 'animate-spin'}`} aria-hidden="true" />
            </div>
            <div>
                <p className="text-sm font-bold text-zinc-900">AI가 Task를 추천하고 있습니다</p>
                <p className="mt-1 text-xs text-zinc-500">완료까지 남은 시간은 표시되지 않습니다. 처리하는 동안 아래 내용을 참고해 주세요.</p>
            </div>
            <p
                key={reducedMotion ? undefined : tip.id}
                className={`min-h-[2.5rem] max-w-md text-xs leading-relaxed text-zinc-700 ${reducedMotion ? '' : 'transition-opacity duration-300'}`}
            >
                {tip.text}
            </p>
            <div className="flex gap-1.5" aria-hidden="true">
                {SOP_RECOMMENDATION_LOADING_TIPS.map((item, index) => (
                    <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${index === tipIndex ? 'bg-indigo-500' : 'bg-zinc-200'}`} />
                ))}
            </div>
            <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
                <X className="h-3.5 w-3.5" /> 취소하고 업무맥락으로 돌아가기
            </button>
        </section>
    );
}
