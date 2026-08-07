import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Throttle 함수 - 지정된 시간 간격으로 함수 호출 제한
export function throttle<T extends (...args: Parameters<T>) => void>(
    fn: T,
    ms: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        const now = Date.now();
        const remaining = ms - (now - lastCall);

        if (remaining <= 0) {
            // 즉시 실행
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCall = now;
            fn(...args);
        } else if (!timeoutId) {
            // 남은 시간 후 실행 예약
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                fn(...args);
            }, remaining);
        }
    };
}
