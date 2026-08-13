'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, XCircle } from 'lucide-react';

/**
 * Prototype rejection-reason codes. The customer has not confirmed a final
 * reason-code list (member-home-subaction-contract.md §3) — this is the
 * smallest reversible prototype set, explicitly labeled as such in the UI.
 */
export const SOP_REJECTION_REASON_CODES: { code: string; label: string }[] = [
    { code: 'insufficient-detail', label: '내용/기준 구체화 필요' },
    { code: 'coverage-gap', label: 'Activity 반영 누락' },
    { code: 'policy-mismatch', label: '사내 정책/규정 불일치' },
    { code: 'agentization-review-needed', label: 'Agent화 판단 재검토 필요' },
    { code: 'other', label: '기타 (자유 서술 참고)' },
];

export function SopRejectionModal({
    onCancel,
    onConfirm,
    isSubmitting,
    error,
}: {
    onCancel: () => void;
    onConfirm: (input: { reasonCode: string; feedback: string }) => void;
    isSubmitting: boolean;
    error?: string | null;
}) {
    const [reasonCode, setReasonCode] = useState(SOP_REJECTION_REASON_CODES[0].code);
    const [feedback, setFeedback] = useState('');

    const trimmedFeedback = feedback.trim();
    const canSubmit = trimmedFeedback.length > 0 && !isSubmitting;

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="sop-rejection-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
                <div className="flex items-center gap-2 border-b border-zinc-200 pb-3">
                    <XCircle className="h-5 w-5 text-rose-600" />
                    <h3 id="sop-rejection-modal-title" className="text-sm font-bold text-zinc-900">반려 사유 입력</h3>
                </div>

                <label className="mt-3 block text-[11px] font-semibold text-zinc-600" htmlFor="sop-rejection-reason-code">사유 (프로토타입 값)</label>
                <select
                    id="sop-rejection-reason-code"
                    value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-xs focus:border-rose-500 focus:outline-none"
                >
                    {SOP_REJECTION_REASON_CODES.map((option) => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                </select>

                <label className="mt-3 block text-[11px] font-semibold text-zinc-600" htmlFor="sop-rejection-feedback">자유 서술 피드백 (필수)</label>
                <textarea
                    id="sop-rejection-feedback"
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    rows={4}
                    placeholder="구성원이 수정할 때 참고할 구체적인 피드백을 작성해 주세요."
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-xs focus:border-rose-500 focus:outline-none"
                />
                {trimmedFeedback.length === 0 && <p className="mt-1 text-[10px] text-zinc-400">피드백을 입력해야 반려를 확정할 수 있습니다.</p>}
                {error && (
                    <p role="alert" className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-rose-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                    </p>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                    <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                        취소
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() => onConfirm({ reasonCode, feedback: trimmedFeedback })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
                    >
                        {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} 반려 확정
                    </button>
                </div>
            </div>
        </div>
    );
}
