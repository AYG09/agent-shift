import { z } from 'zod';
import type { SopMember, WorkLibraryActivity, WorkLibrarySelection } from './sop-types';
import { getScopedSkills } from './sop-task-library';

/**
 * "AI 제안 Activity" (subaction-semantics-contract.md §6.2 / work order 작업 C-2):
 * when the member's free-text work context implies an action that does not
 * belong to ANY currently confirmed Activity, the AI proposes a brand-new
 * Activity instead of forcing that action into an unrelated one or
 * inventing a fake Activity ID. A proposal is never part of the authoritative
 * Work Map until the member explicitly accepts it — see acceptActivityProposal,
 * the ONLY function that may add one to `workLibrary.taskCatalog`.
 */
export const SopActivityProposalSkillSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});

/** The shape the AI model itself returns — no id/provenance, since a proposal has no catalog identity or origin context until validated. */
const SopActivityProposalModelSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    rationale: z.string().min(1),
    skills: z.array(SopActivityProposalSkillSchema).min(1).max(5),
});

/**
 * The shape used everywhere ONCE validated. `id` is a stable local id
 * (never trusted from the model). `sourceTaskId`/`contextKey` are provenance
 * stamped at validation time — the ONLY defense against a proposal that was
 * generated against Task A / context X being accepted after the member has
 * since switched to Task B or rewritten the context. `acceptActivityProposal`
 * re-checks both before ever touching the Work Map.
 */
export const SopActivityProposalSchema = SopActivityProposalModelSchema.extend({
    id: z.string().min(1),
    sourceTaskId: z.string().min(1),
    contextKey: z.string().min(1),
});
export type SopActivityProposal = z.infer<typeof SopActivityProposalSchema>;

export const SopActivityProposalRequestSchema = z.object({
    member: z.object({ jobRole: z.string().min(1) }),
    taskId: z.string().min(1),
    taskName: z.string().min(1),
    taskDefinition: z.string().optional(),
    existingActivityNames: z.array(z.string().min(1)).min(1),
    context: z.string().trim().min(1),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    reasoning: z.string().optional(),
});

const SopActivityProposalModelResponseSchema = z.object({
    proposals: z.array(SopActivityProposalModelSchema).max(5),
});
export const SopActivityProposalResponseSchema = z.object({
    proposals: z.array(SopActivityProposalSchema).max(5),
});
export type SopActivityProposalResponse = z.infer<typeof SopActivityProposalResponseSchema>;

/**
 * Validates a raw model response and assigns stable local ids + provenance —
 * never trusts an id from the model (it doesn't return one). Two dedup passes:
 * 1. WITHIN the response itself — two proposals whose names only differ by
 *    whitespace/case are the same idea; keep the first occurrence only.
 * 2. Against `existingActivityNames` — a proposal that duplicates an Activity
 *    already in the catalog is not a gap, so it is dropped rather than kept
 *    as a redundant "duplicate" for the member to accept.
 * `sourceTaskId`/`contextKey` (the exact trimmed context this request used)
 * are stamped onto every surviving proposal so acceptActivityProposal can
 * later refuse a stale one.
 */
export function validateActivityProposalResponse(
    response: unknown,
    params: { existingActivityNames: string[]; sourceTaskId: string; contextKey: string }
): SopActivityProposalResponse {
    const parsed = SopActivityProposalModelResponseSchema.safeParse(response);
    if (!parsed.success) throw new Error('AI Activity 제안 응답 형식이 올바르지 않습니다.');

    const existingNormalized = new Set(params.existingActivityNames.map((name) => name.trim().toLowerCase()));
    const seenWithinResponse = new Set<string>();
    const proposals: SopActivityProposal[] = [];
    parsed.data.proposals.forEach((proposal, index) => {
        const normalizedName = proposal.name.trim().toLowerCase();
        if (existingNormalized.has(normalizedName)) return;
        if (seenWithinResponse.has(normalizedName)) return;
        seenWithinResponse.add(normalizedName);
        proposals.push({
            ...proposal,
            id: `proposal-${index}-${proposal.name.replace(/\s+/g, '-').toLowerCase()}`,
            sourceTaskId: params.sourceTaskId,
            contextKey: params.contextKey,
        });
    });
    return { proposals };
}

export async function proposeActivitiesViaApi(params: {
    member: Pick<SopMember, 'jobRole'>;
    taskId: string;
    taskName: string;
    taskDefinition?: string;
    existingActivityNames: string[];
    context: string;
    apiKey?: string | null;
    model?: string | null;
    reasoning?: string | null;
}): Promise<SopActivityProposalResponse> {
    const contextKey = params.context.trim();
    const request = SopActivityProposalRequestSchema.parse({
        member: { jobRole: params.member.jobRole },
        taskId: params.taskId,
        taskName: params.taskName,
        taskDefinition: params.taskDefinition,
        existingActivityNames: params.existingActivityNames,
        context: params.context,
        ...(params.apiKey ? { apiKey: params.apiKey } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...(params.reasoning ? { reasoning: params.reasoning } : {}),
    });
    const response = await fetch('/api/sop/activity-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
        const message = typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : 'AI Activity 제안을 요청하지 못했습니다.';
        throw new Error(message);
    }
    return validateActivityProposalResponse(payload, { existingActivityNames: params.existingActivityNames, sourceTaskId: params.taskId, contextKey });
}

export type AcceptActivityProposalResult =
    | { ok: true; patch: Pick<WorkLibrarySelection, 'taskCatalog' | 'skills'> }
    | { ok: false; reason: 'stale-task' | 'stale-context' | 'task-not-found' | 'duplicate-name' | 'already-accepted' };

/**
 * The ONLY function that may turn an unaccepted proposal into a real,
 * catalog-backed Activity. Re-validates provenance and duplication at this
 * domain boundary — never trusts that the UI already checked:
 *
 *  - `stale-task`: the proposal was generated against a different Task than
 *    the one currently selected (member switched Tasks while the proposal
 *    card was still on screen).
 *  - `stale-context`: the member's context text has changed since the
 *    proposal was generated (the proposal's rationale may no longer apply).
 *  - `duplicate-name`: an Activity with this name (trim + case-insensitive)
 *    already exists in the current Task — accepting would create a
 *    redundant entry.
 *  - `already-accepted`: THIS EXACT proposal was already accepted earlier
 *    (idempotent id match) — refused explicitly rather than silently
 *    creating a second copy.
 *
 * On success, returns a PARTIAL patch (`taskCatalog`/`skills` only) —
 * deliberately never a full `WorkLibrarySelection` (which would carry the
 * stale `confirmed: true` along with it). The caller must pass this patch
 * directly to `setWorkLibrary(patch)`; because the patch has no `confirmed`
 * key, `setWorkLibrary`'s existing "any T-A-S mutation clears confirmation"
 * branch fires naturally — the same central invalidation every other Work
 * Map edit already goes through, not a special case for proposals.
 *
 * The accepted Activity's id is derived deterministically from
 * `proposal.id` (not `crypto.randomUUID()`) specifically so accepting the
 * same proposal object twice is detectable and idempotent-safe.
 */
export function acceptActivityProposal(workLibrary: WorkLibrarySelection, proposal: SopActivityProposal, currentContext: string): AcceptActivityProposalResult {
    if (proposal.sourceTaskId !== workLibrary.taskId) return { ok: false, reason: 'stale-task' };
    if (proposal.contextKey !== currentContext.trim()) return { ok: false, reason: 'stale-context' };

    const task = workLibrary.taskCatalog.find((item) => item.id === workLibrary.taskId);
    if (!task) return { ok: false, reason: 'task-not-found' };

    const activityId = `activity-proposed-${proposal.id}`;
    if (task.activities.some((activity) => activity.id === activityId)) return { ok: false, reason: 'already-accepted' };

    const normalizedName = proposal.name.trim().toLowerCase();
    if (task.activities.some((activity) => activity.name.trim().toLowerCase() === normalizedName)) return { ok: false, reason: 'duplicate-name' };

    const maxOrder = task.activities.reduce((max, activity) => Math.max(max, activity.order ?? 0), 0);
    const newActivity: WorkLibraryActivity = {
        id: activityId,
        order: maxOrder + 1,
        name: proposal.name,
        description: proposal.description,
        skills: proposal.skills.map((skill, index) => ({ id: `${activityId}-skill-${index}`, name: skill.name, description: skill.description })),
    };

    const updatedCatalog = workLibrary.taskCatalog.map((item) => (item.id === task.id ? { ...item, activities: [...item.activities, newActivity] } : item));
    const updatedSelection: WorkLibrarySelection = { ...workLibrary, taskCatalog: updatedCatalog };
    return { ok: true, patch: { taskCatalog: updatedCatalog, skills: getScopedSkills(updatedSelection) } };
}
