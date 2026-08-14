import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveGenerationApiKey, resolveGenerationModel, buildReasoningProviderOptions } from '@/server/ai/model-factory';
import { SopActivityProposalRequestSchema, validateActivityProposalResponse } from '@/lib/sop-activity-proposal';

const ModelResponseSchema = z.object({
    proposals: z.array(z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        rationale: z.string().min(1),
        skills: z.array(z.object({ name: z.string().min(1), description: z.string().optional() })).min(1).max(5),
    })).max(5),
});

/**
 * "AI 제안 Activity" (subaction-semantics-contract.md §6.2). Finds actions
 * implied by the member's free-text work context that do not belong to any
 * currently confirmed Activity, and proposes them as brand-new Activities —
 * never force-mapped into an existing one, never a fabricated Activity ID.
 * The response is a preview only; nothing here writes to the Work Map. See
 * acceptActivityProposal (sop-activity-proposal.ts) for the only path that
 * turns a proposal into a real, catalog-backed Activity.
 */
export async function POST(request: Request) {
    try {
        const parsed = SopActivityProposalRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Activity 제안 요청이 유효하지 않습니다.', issues: parsed.error.issues }, { status: 400 });
        }
        const input = parsed.data;
        // 모델·키 해석은 model-factory(SSOT·프로바이더 교체 지점)가 담당한다.
        // 이 라우트는 키가 필수다 — BYOK도 환경변수도 없으면 400으로 안내한다.
        if (resolveGenerationApiKey(input.apiKey).source === 'none') {
            return NextResponse.json({ error: 'AI Activity 제안을 위해 API KEY를 등록해 주세요. Activity는 Work Map에서 직접 추가할 수 있습니다.' }, { status: 400 });
        }
        const model = resolveGenerationModel({ model: input.model, apiKey: input.apiKey });
        const reasoningOptions = buildReasoningProviderOptions(input.reasoning);
        const { object } = await generateObject({
            model,
            schema: ModelResponseSchema,
            prompt: `당신은 SOP Work Map 보강 도우미입니다. 구성원이 작성한 업무 맥락을 읽고, 아래 기존 Activity 목록 중 어디에도 의미상 속하지 않는 실행 행동이 있는지 찾으세요.

## Task
${input.taskName} (${input.taskDefinition || '정의 없음'})

## 기존 Activity 목록 (이미 Work Map에 있음 — 이 이름과 의미가 겹치면 절대 제안하지 마세요)
${input.existingActivityNames.map((name) => `- ${name}`).join('\n')}

## 구성원 업무 맥락
${input.context}

## 지침
- 위 맥락에서 기존 Activity 어디에도 속하지 않는 새로운 실행 행동을 찾으면 최대 5개까지 새 Activity로 제안하세요.
- 근거가 명확하지 않으면 제안하지 마세요 — 빈 배열도 정상 응답입니다.
- 각 제안은 name(Activity명), description(설명), rationale(맥락의 어느 부분에서 이 제안이 나왔는지 짧은 설명), skills(1~5개, name+description)를 포함해야 합니다.
- confidence/확률 수치는 절대 만들지 마세요.
- 담당 직무: ${input.member.jobRole}`,
            ...(reasoningOptions ? { providerOptions: reasoningOptions } : {}),
        });
        const result = validateActivityProposalResponse(object, {
            existingActivityNames: input.existingActivityNames,
            sourceTaskId: input.taskId,
            contextKey: input.context.trim(),
        });
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'AI Activity 제안 중 오류가 발생했습니다.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
