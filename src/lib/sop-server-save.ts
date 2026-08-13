import { createSopRecord, getSopRecord, updateSopRecord } from './sop-record-client';
import type { SopDocument, SopMember } from './sop-types';
import type { SopRecord } from './sop-record-schema';

export type SopServerSaveResult =
    | { success: true; record: SopRecord }
    | { success: false; error: string };

/**
 * Looks up whether `documentId` already exists as a saved SopRecord. Must be
 * called on mount AND whenever `document.id` changes — a component that only
 * tracks "did I successfully save this session" in local state loses that
 * knowledge on remount/navigation and re-POSTs an already-saved document,
 * hitting a 409 duplicate-id conflict with no way to recover into an update.
 */
export async function lookupExistingSopRecord(params: {
    member: SopMember;
    documentId: string;
    fetchImpl?: typeof fetch;
}): Promise<{ success: true; record: SopRecord | null } | { success: false; error: string }> {
    const result = await getSopRecord({ member: params.member, documentId: params.documentId, fetchImpl: params.fetchImpl });
    return result.success ? { success: true, record: result.data } : result;
}

/**
 * Saves the current document as exactly one of create-or-update, decided
 * SOLELY by whether `existingRecord` (from a prior lookupExistingSopRecord)
 * is present — never by retrying a failed create as an update, or treating a
 * 409 as success. A caller must have already blocked this call for a
 * non-'draft' existingRecord.lifecycleStatus (see sop-repository's
 * 'locked-lifecycle' rule) — this function does not re-check that itself, so
 * it stays a plain create-or-update primitive other flows can reuse.
 */
export async function saveSopDocumentToServer(params: {
    member: SopMember;
    document: SopDocument;
    existingRecord: SopRecord | null;
    fetchImpl?: typeof fetch;
}): Promise<SopServerSaveResult> {
    const result = params.existingRecord
        ? await updateSopRecord({ member: params.member, document: params.document, expectedVersion: params.existingRecord.version, fetchImpl: params.fetchImpl })
        : await createSopRecord({ member: params.member, document: params.document, fetchImpl: params.fetchImpl });
    return result.success ? { success: true, record: result.data } : { success: false, error: result.error };
}
