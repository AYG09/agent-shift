import { z } from 'zod';
import type { SopRecord } from './sop-record-schema';

/**
 * Approval workflow status for a saved SopRecord — deliberately separate from
 * SopDocument.reviewStatus (sop-review.ts), which only means "is the editing
 * content complete enough to confirm." This lifecycle instead answers "where is
 * this record in the leader/SME/HR approval process." A member may only ever
 * move their own record from 'draft' (or an editable 'rejected' record) to
 * 'leader-review'; every later stage is a leader/SME-only outcome with no
 * member-facing write path in this contract.
 *
 * Legacy single-stage records may still carry the old value
 * 'approval-requested' wherever raw/unparsed data is read — see
 * `normalizeLifecycleStatus` below, which is the one explicit migration point.
 */
export const SopRecordLifecycleStatusSchema = z.preprocess(
    (value) => (typeof value === 'string' ? normalizeLifecycleStatus(value) : value),
    z.enum(['draft', 'leader-review', 'sme-review', 'approved', 'rejected'])
);
export type SopRecordLifecycleStatus = z.infer<typeof SopRecordLifecycleStatusSchema>;

/**
 * The single explicit migration point for the legacy single-stage lifecycle.
 * The old 'approval-requested' status meant "submitted, awaiting a leader
 * decision" — under the 2-stage model that is 'leader-review'. Every other
 * legacy value already matches a current status literally. An unrecognized
 * string is passed through unchanged so zod's own enum check produces the
 * real validation error, instead of this function silently swallowing it.
 */
export function normalizeLifecycleStatus(raw: string): string {
    return raw === 'approval-requested' ? 'leader-review' : raw;
}

/** The only transition a member may request through the API — never a leader/SME/approved/rejected outcome. */
export const SopMemberLifecycleTransitionSchema = z.object({
    transition: z.literal('leader-review'),
});

/** Reviewer transitions require a structured reason plus non-empty free-text feedback on rejection — never on approval. */
export const SopReviewerLifecycleTransitionSchema = z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve') }),
    z.object({
        decision: z.literal('reject'),
        reasonCode: z.string().min(1),
        feedback: z.string().trim().min(1),
    }),
]);
export type SopReviewerLifecycleTransition = z.infer<typeof SopReviewerLifecycleTransitionSchema>;

export const SOP_LIFECYCLE_STATUS_META: Record<SopRecordLifecycleStatus, { label: string; badgeClass: string }> = {
    draft: { label: '작성 중', badgeClass: 'border-zinc-300 bg-zinc-50 text-zinc-700' },
    'leader-review': { label: '직책자 검토 중', badgeClass: 'border-amber-300 bg-amber-50 text-amber-800' },
    'sme-review': { label: 'SME 검토 중', badgeClass: 'border-amber-300 bg-amber-50 text-amber-800' },
    approved: { label: '승인 완료', badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
    rejected: { label: '반려', badgeClass: 'border-rose-300 bg-rose-50 text-rose-800' },
};

/** The member-facing summary bucket label — 'leader-review' and 'sme-review' both aggregate under this on the Home widget. */
export const SOP_APPROVAL_REQUESTED_LABEL = '승인 요청 중';

/** A stage-aware summary bucket key used by the member Home status widget. */
export type SopMemberSummaryBucket = 'draft' | 'approval-requested' | 'approved' | 'rejected';

/** Meta for the four coarse Home-widget buckets — distinct from SOP_LIFECYCLE_STATUS_META, which is keyed by the five detailed statuses shown on individual rows. */
export const SOP_MEMBER_SUMMARY_BUCKET_META: Record<SopMemberSummaryBucket, { label: string; badgeClass: string }> = {
    draft: SOP_LIFECYCLE_STATUS_META.draft,
    'approval-requested': { label: SOP_APPROVAL_REQUESTED_LABEL, badgeClass: 'border-amber-300 bg-amber-50 text-amber-800' },
    approved: SOP_LIFECYCLE_STATUS_META.approved,
    rejected: SOP_LIFECYCLE_STATUS_META.rejected,
};

/** Maps a detailed lifecycle status to the coarser member-facing summary bucket (leader-review + sme-review merge into 'approval-requested'). */
export function toMemberSummaryBucket(status: SopRecordLifecycleStatus): SopMemberSummaryBucket {
    if (status === 'leader-review' || status === 'sme-review') return 'approval-requested';
    return status;
}

/**
 * Every stage a record can be *sitting in* for a reviewer's inbox. Deliberately
 * excludes 'draft'/'approved'/'rejected' — those are never a reviewer decision
 * target.
 */
export type SopReviewStage = 'leader-review' | 'sme-review';

/** Which reviewer role owns which stage. There is no assignment/skip policy in this prototype — every actor with the matching role may act on every record at that stage. */
export const SOP_REVIEW_STAGE_ROLE: Record<SopReviewStage, 'leader' | 'sme'> = {
    'leader-review': 'leader',
    'sme-review': 'sme',
};

/**
 * A record is editable by its owning member only while it is 'draft' or
 * 'rejected' — a rejected record becomes editable again the moment a member
 * opens "수정하기", without creating a new record/id. Every other status
 * (leader-review/sme-review/approved) is read-only to the member: the content
 * a reviewer saw (or the officially approved content) must never drift
 * underneath them. This is the single source of truth for that policy — both
 * the repository's PUT lock check and any UI affordance must call this, never
 * re-derive the status list themselves.
 */
export function isMemberEditableLifecycleStatus(status: SopRecordLifecycleStatus): boolean {
    return status === 'draft' || status === 'rejected';
}

/** Rejection metadata — latest decision only, never an audit array. Present only while lifecycleStatus === 'rejected'; cleared on a successful resubmission. */
export const SopRejectionSchema = z.object({
    rejectedAtStage: z.enum(['leader-review', 'sme-review']),
    reasonCode: z.string().min(1),
    feedback: z.string().min(1),
    reviewedByRole: z.enum(['leader', 'sme']),
    reviewedAt: z.string(),
});
export type SopRejection = z.infer<typeof SopRejectionSchema>;

export type SopLifecycleTransitionInput =
    | { kind: 'member-submit'; actorId: string }
    | { kind: 'leader-approve'; actorId: string }
    | { kind: 'leader-reject'; actorId: string; reasonCode: string; feedback: string }
    | { kind: 'sme-approve'; actorId: string }
    | { kind: 'sme-reject'; actorId: string; reasonCode: string; feedback: string };

export type SopLifecycleTransitionPatch = {
    lifecycleStatus: SopRecordLifecycleStatus;
    /** `null` means "clear any existing rejection metadata"; `undefined` means "leave it as-is" (never happens for this transition set — every branch either sets or clears it). */
    rejection: SopRejection | null;
};

export type SopLifecycleTransitionResult =
    | { ok: true; patch: SopLifecycleTransitionPatch }
    | { ok: false; reason: 'forbidden'; message: string }
    | { ok: false; reason: 'invalid-transition'; message: string }
    | { ok: false; reason: 'invalid-request'; message: string };

/**
 * The single shared state-transition function for the approval lifecycle.
 * Pure and side-effect-free — it never mutates `current` or touches storage,
 * so every failure branch is automatically "no repository change" and every
 * caller (repository, tests) exercises the exact same rule set. A caller
 * still owns document-level checks that aren't about the *lifecycle* itself
 * (e.g. `document.reviewStatus === 'confirmed'` before allowing member-submit)
 * — see `sop-repository-memory.ts`'s wrapper for where that lives.
 */
export function computeSopLifecycleTransition(
    current: Pick<SopRecord, 'memberId' | 'lifecycleStatus'>,
    input: SopLifecycleTransitionInput
): SopLifecycleTransitionResult {
    switch (input.kind) {
        case 'member-submit': {
            if (current.memberId !== input.actorId) {
                return { ok: false, reason: 'forbidden', message: '이 SOP는 작성한 구성원만 승인 요청을 할 수 있습니다.' };
            }
            if (!isMemberEditableLifecycleStatus(current.lifecycleStatus)) {
                return {
                    ok: false,
                    reason: 'invalid-transition',
                    message: `이미 '${current.lifecycleStatus}' 상태인 SOP는 승인 요청으로 전환할 수 없습니다.`,
                };
            }
            return { ok: true, patch: { lifecycleStatus: 'leader-review', rejection: null } };
        }
        case 'leader-approve': {
            if (current.lifecycleStatus !== 'leader-review') {
                return {
                    ok: false,
                    reason: 'invalid-transition',
                    message: `'직책자 검토 중'이 아닌 SOP는 직책자가 승인할 수 없습니다 (현재: ${current.lifecycleStatus}).`,
                };
            }
            return { ok: true, patch: { lifecycleStatus: 'sme-review', rejection: null } };
        }
        case 'leader-reject': {
            if (current.lifecycleStatus !== 'leader-review') {
                return {
                    ok: false,
                    reason: 'invalid-transition',
                    message: `'직책자 검토 중'이 아닌 SOP는 직책자가 반려할 수 없습니다 (현재: ${current.lifecycleStatus}).`,
                };
            }
            if (!input.reasonCode.trim() || !input.feedback.trim()) {
                return { ok: false, reason: 'invalid-request', message: '반려에는 사유 코드와 자유 서술 피드백이 모두 필요합니다.' };
            }
            return {
                ok: true,
                patch: {
                    lifecycleStatus: 'rejected',
                    rejection: {
                        rejectedAtStage: 'leader-review',
                        reasonCode: input.reasonCode,
                        feedback: input.feedback,
                        reviewedByRole: 'leader',
                        reviewedAt: new Date().toISOString(),
                    },
                },
            };
        }
        case 'sme-approve': {
            if (current.lifecycleStatus !== 'sme-review') {
                return {
                    ok: false,
                    reason: 'invalid-transition',
                    message: `'SME 검토 중'이 아닌 SOP는 SME가 승인할 수 없습니다 (현재: ${current.lifecycleStatus}).`,
                };
            }
            return { ok: true, patch: { lifecycleStatus: 'approved', rejection: null } };
        }
        case 'sme-reject': {
            if (current.lifecycleStatus !== 'sme-review') {
                return {
                    ok: false,
                    reason: 'invalid-transition',
                    message: `'SME 검토 중'이 아닌 SOP는 SME가 반려할 수 없습니다 (현재: ${current.lifecycleStatus}).`,
                };
            }
            if (!input.reasonCode.trim() || !input.feedback.trim()) {
                return { ok: false, reason: 'invalid-request', message: '반려에는 사유 코드와 자유 서술 피드백이 모두 필요합니다.' };
            }
            return {
                ok: true,
                patch: {
                    lifecycleStatus: 'rejected',
                    rejection: {
                        rejectedAtStage: 'sme-review',
                        reasonCode: input.reasonCode,
                        feedback: input.feedback,
                        reviewedByRole: 'sme',
                        reviewedAt: new Date().toISOString(),
                    },
                },
            };
        }
    }
}
