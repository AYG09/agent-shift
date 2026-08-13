'use client';

import { useEffect, useState } from 'react';
import { CloudUpload, Loader2 } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { lookupExistingSopRecord, saveSopDocumentToServer } from '@/lib/sop-server-save';
import { SOP_LIFECYCLE_STATUS_META, isMemberEditableLifecycleStatus } from '@/lib/sop-lifecycle';
import type { SopRecord } from '@/lib/sop-record-schema';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface SopServerSaveControlProps {
    fetchImpl?: typeof fetch;
}

/**
 * Persists the current Workspace document to the server-side SopRepository —
 * distinct from the existing "저장" button, which only writes to this browser's
 * localStorage draft. A SOP must exist as a saved SopRecord before the member
 * can request approval on it (see SopMemberHome's "승인 요청" action). The
 * in-memory reference repository is not durable; a save here can be lost on
 * server restart, which the button's own label/tooltip states rather than
 * implying a real persistent save.
 *
 * `existingRecord` is looked up from the server on every mount AND whenever
 * `document.id` changes (never assumed from a prior save this session) — a
 * component that only remembered "I successfully saved" in local state would
 * forget that on remount/navigation and re-POST an already-saved document,
 * producing a duplicate-id 409 with no way to recover into an update. See
 * lookupExistingSopRecord/saveSopDocumentToServer (sop-server-save.ts) for the
 * actual create-vs-update decision, kept here only as UI wiring.
 */
export function SopServerSaveControl({ fetchImpl }: SopServerSaveControlProps) {
    const memberInfo = useSopPrototypeStore((state) => state.memberInfo);
    const document = useSopPrototypeStore((state) => state.document);
    const customerReviewMode = useSopPrototypeStore((state) => state.customerReviewMode);

    const [loadState, setLoadState] = useState<LoadState>('idle');
    const [existingRecord, setExistingRecord] = useState<SopRecord | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const documentId = document?.id;

    useEffect(() => {
        if (!documentId) return;
        let cancelled = false;
        // A new document.id must never keep the previous id's record/version around —
        // reset to "unknown, checking" before the lookup resolves, not after.
        setLoadState('loading');
        setExistingRecord(null);
        setError(null);
        lookupExistingSopRecord({ member: memberInfo, documentId, fetchImpl }).then((result) => {
            if (cancelled) return;
            if (result.success) {
                setExistingRecord(result.record);
                setLoadState('loaded');
            } else {
                setError(result.error);
                setLoadState('error');
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    if (!document || !documentId) return null;

    const isLocked = existingRecord !== null && !isMemberEditableLifecycleStatus(existingRecord.lifecycleStatus);
    const isBusy = loadState === 'loading' || isSaving;

    const handleSave = async () => {
        if (customerReviewMode || isBusy || isLocked) return;
        setIsSaving(true);
        setError(null);
        // create-vs-update is decided ONLY by the server-confirmed existingRecord looked up
        // above — never by local "did I save before" memory, and a failure (including a
        // duplicate-id or version conflict) never flips this to a saved state.
        const result = await saveSopDocumentToServer({ member: memberInfo, document, existingRecord, fetchImpl });
        setIsSaving(false);
        if (!result.success) {
            setError(result.error);
            return;
        }
        setExistingRecord(result.record);
    };

    const lockedLabel = isLocked ? SOP_LIFECYCLE_STATUS_META[existingRecord!.lifecycleStatus].label : null;
    const buttonLabel = isLocked
        ? `${lockedLabel} · 수정 불가`
        : loadState === 'loading'
          ? '확인 중...'
          : existingRecord
            ? `서버 저장됨 v${existingRecord.version}`
            : '서버에 저장';

    const title = customerReviewMode
        ? '고객 검토 모드에서는 서버 저장을 사용할 수 없습니다.'
        : isLocked
          ? `'${lockedLabel}' 상태의 SOP는 승인 절차 중이라 내용을 다시 저장할 수 없습니다.`
          : loadState === 'loading'
            ? '서버에 이미 저장된 기록이 있는지 확인하는 중입니다.'
            : existingRecord
              ? `in-memory reference 저장소에 저장됨 (v${existingRecord.version}) — 다시 눌러 갱신합니다.`
              : 'in-memory reference 저장소에 이 SOP를 저장합니다. 서버 재시작 시 초기화될 수 있는 프로토타입 저장소입니다.';

    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={handleSave}
                disabled={customerReviewMode || isBusy || isLocked}
                title={title}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{buttonLabel}</span>
            </button>
            {error && (
                <span role="alert" title={error} className="max-w-[160px] truncate text-[10px] font-semibold text-rose-600">
                    {error}
                </span>
            )}
        </div>
    );
}
