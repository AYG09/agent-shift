/**
 * 표시 포맷 규칙의 단일 원천 (SSOT).
 *
 * Activity 코드(`A01`)와 단계 번호(`01`) 포맷은 캔버스 노드·사이드바·인스펙터·
 * 게이트 등 9개 이상 컴포넌트에 인라인 `padStart`로 복사되어 있었다. 자릿수나
 * 접두사 정책이 바뀌면 전부 어긋나므로 여기서만 정의한다 —
 * `npm run verify:quality`가 컴포넌트 내 인라인 padStart를 금지한다.
 */

/** Task Library Activity의 표시 코드. 예: order 3 → "A03". order가 없으면 "A00". */
export function formatActivityCode(order?: number): string {
    return `A${String(order ?? 0).padStart(2, '0')}`;
}

/** 1부터 시작하는 단계 표시 번호. 예: 7 → "07". */
export function formatStepNumber(stepNumber: number): string {
    return String(stepNumber).padStart(2, '0');
}

/** 로컬 저장 표시용 시:분:초. 예: "14:35:38". */
export function formatClockTime(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
