import { buildSopActorHeaders, buildDemoActorHeaders } from './sop-actor-client';
import { SopRecordResponseSchema, SopRecordListResponseSchema, SopApprovalQueueResponseSchema, SopAnalyticsResponseSchema } from './sop-response-schemas';
import { SopStandardDraftResponseSchema } from './sop-standard-draft-schemas';
import { SopTemplateListResponseSchema, type SopTemplateSummary } from './sop-template';
import { SopDocumentSchema } from './sop-document-schema';
import type { SopRecord } from './sop-record-schema';
import type { SopDocument, SopMember } from './sop-types';
import type { SopOrganizationProgress, SopTopTask, SopAgentizationEvidence, SopStandardCandidateGroup, SopApprovalRate } from './sop-analytics';
import type { SopRecordLifecycleStatus } from './sop-lifecycle';

type FetchImpl = typeof fetch;

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
    const data = await res.json().catch(() => null);
    return (data && typeof data.error === 'string' && data.error) || fallback;
}

function memberId(member: SopMember): string {
    return member.id || member.employeeId || 'unknown-member';
}

function organizationId(member: SopMember): string {
    return member.organization || 'unknown-org';
}

export type SopRecordClientResult<T> = { success: true; data: T } | { success: false; error: string };

/** All of a member's own saved SOP records (GET /api/sop, member-scoped by the actor header). */
export async function listMySopRecords(params: { member: SopMember; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopRecord[]>> {
    try {
        const res = await (params.fetchImpl ?? fetch)('/api/sop', { headers: buildSopActorHeaders(params.member) });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, 'SOP 목록을 불러오지 못했습니다.') };
        const parsed = SopRecordListResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: 'SOP 목록 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.records };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'SOP 목록 조회 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/**
 * Looks up a single saved SopRecord by id. A 404 resolves as `{success:true, data:null}` —
 * "no record exists yet" is a legitimate outcome for a save-flow existence check, not a
 * network/parse failure, and callers (e.g. deciding create-vs-update) must be able to tell
 * the two apart.
 */
export async function getSopRecord(params: { member: SopMember; documentId: string; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopRecord | null>> {
    try {
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/${encodeURIComponent(params.documentId)}`, { headers: buildSopActorHeaders(params.member) });
        if (res.status === 404) return { success: true, data: null };
        if (!res.ok) return { success: false, error: await readErrorMessage(res, 'SOP 조회에 실패했습니다.') };
        const parsed = SopRecordResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: 'SOP 조회 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.record };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'SOP 조회 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** Persists the current document as a brand-new SopRecord under the current member's identity. */
export async function createSopRecord(params: { member: SopMember; document: SopDocument; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopRecord>> {
    try {
        const res = await (params.fetchImpl ?? fetch)('/api/sop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildSopActorHeaders(params.member) },
            body: JSON.stringify({ memberId: memberId(params.member), organizationId: organizationId(params.member), document: params.document }),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, 'SOP 저장에 실패했습니다.') };
        const parsed = SopRecordResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: 'SOP 저장 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.record };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'SOP 저장 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** Updates an existing SopRecord with optimistic-locking `expectedVersion`. */
export async function updateSopRecord(params: { member: SopMember; document: SopDocument; expectedVersion: number; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopRecord>> {
    try {
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/${encodeURIComponent(params.document.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildSopActorHeaders(params.member) },
            body: JSON.stringify({ document: params.document, expectedVersion: params.expectedVersion }),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, 'SOP 갱신에 실패했습니다.') };
        const parsed = SopRecordResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: 'SOP 갱신 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.record };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'SOP 갱신 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** The ONLY lifecycle transition a member may request: draft/rejected -> leader-review. */
export async function requestSopApproval(params: { member: SopMember; recordId: string; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopRecord>> {
    try {
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/${encodeURIComponent(params.recordId)}/lifecycle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildSopActorHeaders(params.member) },
            body: JSON.stringify({ transition: 'leader-review' }),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '승인 요청에 실패했습니다.') };
        const parsed = SopRecordResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: '승인 요청 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.record };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '승인 요청 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** Clones one of the current member's own past records (any lifecycle status) into a new independent draft document (not yet saved). */
export async function cloneSopPriorRecord(params: { member: SopMember; recordId: string; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopDocument>> {
    try {
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/${encodeURIComponent(params.recordId)}/prior-clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildSopActorHeaders(params.member) },
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '기존 작성 SOP 복제에 실패했습니다.') };
        const parsed = SopDocumentSchema.safeParse((await res.json()).document);
        if (!parsed.success) return { success: false, error: '복제된 SOP 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '기존 작성 SOP 복제 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** Sanitized colleague-template candidates (GET /api/sop/templates) — never contains personal identifiers. */
export async function listSopTemplates(params: { member: SopMember; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopTemplateSummary[]>> {
    try {
        const res = await (params.fetchImpl ?? fetch)('/api/sop/templates', { headers: buildSopActorHeaders(params.member) });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '동료 SOP 템플릿 목록을 불러오지 못했습니다.') };
        const parsed = SopTemplateListResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: '동료 SOP 템플릿 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.templates };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '동료 SOP 템플릿 조회 중 알 수 없는 오류가 발생했습니다.' };
    }
}

export interface SopApprovalQueueFetchResult {
    records: SopRecord[];
    organizationProgress: SopOrganizationProgress[];
}

/** GET /api/sop/approvals — the role-scoped, filtered Inbox queue (leader-review for a leader actor, sme-review for an SME actor) plus system-wide organization progress. */
export async function listApprovalQueue(params: {
    actor: { actorId: string; role: 'leader' | 'sme'; organizationId: string };
    filters?: { organizationId?: string; jobRole?: string };
    fetchImpl?: FetchImpl;
}): Promise<SopRecordClientResult<SopApprovalQueueFetchResult>> {
    try {
        const query = new URLSearchParams();
        if (params.filters?.organizationId) query.set('organizationId', params.filters.organizationId);
        if (params.filters?.jobRole) query.set('jobRole', params.filters.jobRole);
        const queryString = query.toString();
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/approvals${queryString ? `?${queryString}` : ''}`, {
            headers: buildDemoActorHeaders(params.actor),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '승인 대기함을 불러오지 못했습니다.') };
        const parsed = SopApprovalQueueResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: '승인 대기함 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '승인 대기함 조회 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** POST /api/sop/[id]/lifecycle as a leader/SME reviewer — approve, or reject with a required reasonCode + free-text feedback. Used by both the single-row action and the bulk-action loop (each call goes through the exact same domain function server-side). */
export async function decideSopApproval(params: {
    actor: { actorId: string; role: 'leader' | 'sme'; organizationId: string };
    recordId: string;
    decision: { decision: 'approve' } | { decision: 'reject'; reasonCode: string; feedback: string };
    fetchImpl?: FetchImpl;
}): Promise<SopRecordClientResult<SopRecord>> {
    try {
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/${encodeURIComponent(params.recordId)}/lifecycle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildDemoActorHeaders(params.actor) },
            body: JSON.stringify(params.decision),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '승인/반려 처리에 실패했습니다.') };
        const parsed = SopRecordResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: '승인/반려 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data.record };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '승인/반려 처리 중 알 수 없는 오류가 발생했습니다.' };
    }
}

export interface SopAnalyticsFetchResult {
    records: SopRecord[];
    participatingMemberCount: number;
    recordCount: number;
    lifecycleDistribution: Record<SopRecordLifecycleStatus, number>;
    approvalRate: SopApprovalRate;
    topTasks: SopTopTask[];
    agentizationEvidence: SopAgentizationEvidence[];
    standardCandidates: SopStandardCandidateGroup[];
}

/** GET /api/sop/analytics — HR-only dashboard data, optionally organization-filtered. */
export async function fetchSopAnalytics(params: {
    actor: { actorId: string; organizationId: string };
    organizationId?: string;
    fetchImpl?: FetchImpl;
}): Promise<SopRecordClientResult<SopAnalyticsFetchResult>> {
    try {
        const query = params.organizationId ? `?organizationId=${encodeURIComponent(params.organizationId)}` : '';
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/analytics${query}`, {
            headers: buildDemoActorHeaders({ actorId: params.actor.actorId, role: 'hr', organizationId: params.actor.organizationId }),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, 'HR 대시보드 데이터를 불러오지 못했습니다.') };
        const parsed = SopAnalyticsResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: 'HR 대시보드 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'HR 대시보드 조회 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** POST /api/sop/standard-drafts — HR-only preview generation. Never persists the result. */
export async function requestStandardDraft(params: {
    actor: { actorId: string; organizationId: string };
    taskId: string;
    sourceRecordIds: string[];
    fetchImpl?: FetchImpl;
}): Promise<SopRecordClientResult<{ document: SopDocument; sourceRecordIds: string[]; taskId: string; generatedAt: string }>> {
    try {
        const res = await (params.fetchImpl ?? fetch)('/api/sop/standard-drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildDemoActorHeaders({ actorId: params.actor.actorId, role: 'hr', organizationId: params.actor.organizationId }) },
            body: JSON.stringify({ taskId: params.taskId, sourceRecordIds: params.sourceRecordIds }),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '대표 표준안 초안 생성에 실패했습니다.') };
        const parsed = SopStandardDraftResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { success: false, error: '대표 표준안 초안 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '대표 표준안 초안 생성 중 알 수 없는 오류가 발생했습니다.' };
    }
}

/** Clones an approved, template-eligible colleague SOP into a new independent draft document (not yet saved). */
export async function cloneSopTemplate(params: { member: SopMember; templateId: string; fetchImpl?: FetchImpl }): Promise<SopRecordClientResult<SopDocument>> {
    try {
        const res = await (params.fetchImpl ?? fetch)(`/api/sop/templates/${encodeURIComponent(params.templateId)}/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildSopActorHeaders(params.member) },
            // The route requires `member.id` specifically (not the employeeId fallback) as a
            // second, independent identity check against the actor header — a login-form
            // member has no `.id` (the form never collects one), so send the same resolved
            // identifier the actor header already carries rather than the raw, possibly
            // id-less member object.
            body: JSON.stringify({ member: { ...params.member, id: memberId(params.member) } }),
        });
        if (!res.ok) return { success: false, error: await readErrorMessage(res, '동료 SOP 템플릿 복제에 실패했습니다.') };
        const parsed = SopDocumentSchema.safeParse((await res.json()).document);
        if (!parsed.success) return { success: false, error: '복제된 SOP 응답 형식이 올바르지 않습니다.' };
        return { success: true, data: parsed.data };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '동료 SOP 템플릿 복제 중 알 수 없는 오류가 발생했습니다.' };
    }
}
