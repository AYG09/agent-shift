import { z } from 'zod';
import type { SopMember, WorkLibraryTask } from './sop-types';

export const SopTaskRecommendationCandidateSchema = z.object({
    taskId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
});

export const SopTaskRecommendationRequestSchema = z.object({
    member: z.object({
        id: z.string().optional(),
        employeeId: z.string().optional(),
        name: z.string().min(1),
        jobRole: z.string().min(1),
        organization: z.string().optional(),
    }),
    job: z.object({ id: z.string().min(1), sourceJobId: z.string().min(1), name: z.string().min(1) }),
    briefWorkDescription: z.string().trim().min(1),
    candidates: z.array(SopTaskRecommendationCandidateSchema).min(1),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    reasoning: z.string().optional(),
});

export const SopTaskRecommendationResponseSchema = z.object({
    candidates: z.array(z.object({
        taskId: z.string().min(1),
        rank: z.number().int().min(1).max(3),
        reason: z.string().min(1),
    })).max(3),
});

export type SopTaskRecommendationRequest = z.infer<typeof SopTaskRecommendationRequestSchema>;
export type SopTaskRecommendationResponse = z.infer<typeof SopTaskRecommendationResponseSchema>;

export function validateTaskRecommendationResponse(
    response: unknown,
    catalog: Pick<WorkLibraryTask, 'id'>[]
): SopTaskRecommendationResponse {
    const parsed = SopTaskRecommendationResponseSchema.safeParse(response);
    if (!parsed.success) throw new Error('AI Task 추천 응답 형식이 올바르지 않습니다.');
    const allowedIds = new Set(catalog.map((task) => task.id));
    const ids = parsed.data.candidates.map((candidate) => candidate.taskId);
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowedIds.has(id))) {
        throw new Error('AI가 Task Library에 없는 또는 중복된 추천 결과를 반환했습니다.');
    }
    const sorted = [...parsed.data.candidates].sort((left, right) => left.rank - right.rank);
    if (sorted.some((candidate, index) => candidate.rank !== index + 1)) {
        throw new Error('AI Task 추천 순위가 올바르지 않습니다.');
    }
    return { candidates: sorted };
}

export async function recommendTasksViaApi(params: {
    member: SopMember;
    job: { id?: string; sourceJobId?: string; name?: string };
    briefWorkDescription: string;
    candidates: WorkLibraryTask[];
    apiKey?: string | null;
    model?: string | null;
    reasoning?: string | null;
}): Promise<SopTaskRecommendationResponse> {
    const request = SopTaskRecommendationRequestSchema.parse({
        member: params.member,
        job: params.job,
        briefWorkDescription: params.briefWorkDescription,
        candidates: params.candidates.map((task) => ({ id: task.id, taskId: task.id, name: task.name, description: task.description ?? '' })),
        ...(params.apiKey ? { apiKey: params.apiKey } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...(params.reasoning ? { reasoning: params.reasoning } : {}),
    });
    const response = await fetch('/api/sop/task-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
        const message = typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : 'AI Task 추천을 요청하지 못했습니다.';
        throw new Error(message);
    }
    return validateTaskRecommendationResponse(payload, params.candidates);
}
