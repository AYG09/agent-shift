import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeModelId, sanitizeReasoningLevel } from '@/lib/gemini-models';
import { SopTaskRecommendationRequestSchema, validateTaskRecommendationResponse } from '@/lib/sop-task-recommendation';

const ModelResponseSchema = z.object({
    candidates: z.array(z.object({
        taskId: z.string(),
        rank: z.number().int(),
        reason: z.string().min(1),
    })).max(3),
});

export async function POST(request: Request) {
    try {
        const parsed = SopTaskRecommendationRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Task 추천 요청이 유효하지 않습니다.', issues: parsed.error.issues }, { status: 400 });
        }
        const input = parsed.data;
        const apiKey = input.apiKey?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
        if (!apiKey) {
            return NextResponse.json({ error: 'AI Task 추천을 위해 API KEY를 등록해 주세요. Task는 직접 검색해 선택할 수 있습니다.' }, { status: 400 });
        }
        const model = createGoogleGenerativeAI({ apiKey })(sanitizeModelId(input.model));
        const reasoning = sanitizeReasoningLevel(input.reasoning);
        const { object } = await generateObject({
            model,
            schema: ModelResponseSchema,
            prompt: `당신은 SOP Task Library 추천 도우미입니다. 구성원이 작성한 짧은 업무 설명에 가장 관련 있는 Task만 최대 3개 추천하세요. 확률·confidence를 만들지 말고, 제공된 Task ID 이외에는 절대 반환하지 마세요.\n\n구성원 직무: ${input.member.jobRole}\nJob: ${input.job.name} (${input.job.sourceJobId})\n업무 설명: ${input.briefWorkDescription}\n\n후보 Task:\n${input.candidates.map((task) => `- ${task.taskId}: ${task.name} — ${task.description}`).join('\n')}`,
            ...(reasoning === 'default' ? {} : { providerOptions: { google: { thinkingConfig: { thinkingLevel: reasoning } } } }),
        });
        const result = validateTaskRecommendationResponse(object, input.candidates.map((task) => ({ id: task.taskId })));
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'AI Task 추천 중 오류가 발생했습니다.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
