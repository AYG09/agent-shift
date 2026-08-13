'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';

/**
 * Setup Gate notice shown while 고객 검토 모드 is ON.
 *
 * Without this, the Gate deadlocks: generation (and sample loading) are
 * locked by review mode, but the Workspace toggle that ends review mode is
 * only reachable BY generating — so a member arriving at the Gate with
 * review mode persisted from an earlier session had no way out. The notice
 * surfaces the lock BEFORE the member clicks anything and offers the same
 * Store action the Workspace toggle uses (setCustomerReviewMode(false)),
 * plus a direct Workspace link when a document exists.
 *
 * Presentational only — the Gate wires the Store and router in, so tests
 * can render this without a Next.js router context.
 */
export const SopSetupReviewModeNotice: React.FC<{
    documentExists: boolean;
    onExitReviewMode: () => void;
    onGoToWorkspace: () => void;
}> = ({ documentExists, onExitReviewMode, onGoToWorkspace }) => (
    <div
        role="status"
        className="lg:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-medium text-violet-900"
    >
        <ShieldAlert className="h-5 w-5 shrink-0 text-violet-600" />
        <span className="min-w-60 flex-1">
            고객 검토 모드가 켜져 있어 새 SOP 생성과 샘플 열기가 잠겨 있습니다. 여기에서 바로 검토 모드를 종료할 수 있습니다.
        </span>
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onExitReviewMode}
                className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-violet-700"
            >
                고객 검토 모드 종료
            </button>
            {documentExists && (
                <button
                    type="button"
                    onClick={onGoToWorkspace}
                    className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-2xs transition-colors hover:bg-violet-100"
                >
                    Workspace로 이동
                </button>
            )}
        </div>
    </div>
);
