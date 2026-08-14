import type { SopReviewStatus } from './sop-types';

/**
 * Shared badge styling for a document-level review status pill. Used wherever
 * the SOP's overall reviewStatus is shown as a passive label (not a button
 * that changes it, which intentionally uses its own actionable styling).
 */
export const SOP_REVIEW_STATUS_BADGE_CLASS: Record<SopReviewStatus, string> = {
    confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    reviewed: 'bg-blue-100 text-blue-800 border border-blue-300',
    'ai-draft': 'bg-amber-100 text-amber-800 border border-amber-300',
};

/** 문서(document) 수준 검토 상태의 표시 라벨 (SSOT) — Workspace 헤더·사이드바 검토 탭 공용. */
export const SOP_DOCUMENT_REVIEW_STATUS_LABEL: Record<SopReviewStatus, string> = {
    confirmed: 'SOP 확정 완료',
    reviewed: '전체 검토 완료',
    'ai-draft': 'AI 초안 검토 중',
};

/**
 * 단계(step) 수준 검토 상태의 라벨+배지 클래스 (SSOT). 사이드바 단계 행 등
 * 개별 단계의 상태를 수동 라벨로 보여주는 모든 곳이 이걸 사용한다 — 화면마다
 * '확정'/'검토됨'/'초안' 문자열과 클래스 조합을 다시 조립하지 않는다
 * (docs/DESIGN_CONVENTIONS.md §5, verify:quality가 검사).
 */
export const SOP_STEP_REVIEW_STATUS_META: Record<SopReviewStatus, { label: string; badgeClass: string }> = {
    confirmed: { label: '확정', badgeClass: 'bg-emerald-100 text-emerald-800' },
    reviewed: { label: '검토됨', badgeClass: 'bg-blue-100 text-blue-800' },
    'ai-draft': { label: '초안', badgeClass: 'bg-amber-100 text-amber-800' },
};

/**
 * 시작/종료 터미널 칩의 라벨+클래스 (SSOT). 캔버스 노드 태그와 사이드바 단계
 * 행이 동일한 칩을 사용한다. 색 의미: emerald=시작(진입), rose=종료(완료) —
 * docs/DESIGN_CONVENTIONS.md §1.
 */
export const SOP_TERMINAL_CHIP_META: Record<'start' | 'end', { label: string; chipClass: string; title: string }> = {
    start: { label: '시작', chipClass: 'border border-emerald-200 bg-white text-emerald-700', title: '프로세스 시작 지점' },
    end: { label: '종료', chipClass: 'border border-rose-200 bg-white text-rose-700', title: '프로세스 종료 지점' },
};
