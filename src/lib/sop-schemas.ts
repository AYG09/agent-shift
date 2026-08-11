import { z } from 'zod';
import { FLOW_SHAPE_IDS } from './flow-shapes';

export const SopRequiredSkillSchema = z.object({
    skillId: z.string().optional(),
    name: z.string().min(1),
    requiredLevel: z.enum(['basic', 'intermediate', 'advanced']).default('basic'),
    reason: z.string().optional(),
    source: z.enum(['work-library', 'ai-suggested']),
    accepted: z.boolean().default(false),
});

export const SopStepAiSchema = z
    .object({
        id: z.string(),
        title: z.string().min(1),
        definition: z.string().min(5),
        detailedInstructions: z.string().optional(),
        responsibleRole: z.string().optional(),
        inputs: z.array(z.string()).optional(),
        outputs: z.array(z.string()).optional(),
        tools: z.array(z.string()).optional(),
        cautions: z.array(z.string()).optional(),
        decisionRules: z.array(z.string()).optional(),
        requiredSkills: z.array(SopRequiredSkillSchema).default([]),
        estimatedDuration: z
            .object({
                value: z.number(),
                unit: z.enum(['minutes', 'hours', 'days', 'weeks']),
            })
            .optional(),
        type: z.string().optional(),
        shape: z.enum(FLOW_SHAPE_IDS as unknown as [string, ...string[]]).default('process'),
        terminalType: z.enum(['start', 'end']).optional(),
        ioType: z.enum(['input', 'output']).optional(),
        position: z
            .object({
                x: z.number(),
                y: z.number(),
            })
            .default({ x: 0, y: 0 }),
    })
    // shape 또는 type이 'terminal'이면 terminalType이 반드시 있어야 한다.
    // 배열 위치(idx===0 등)로 start/end를 추정하는 대신, 없는 값은 여기서 즉시 파싱 오류로 처리한다.
    .superRefine((val, ctx) => {
        const isTerminal = val.shape === 'terminal' || val.type === 'terminal';
        if (isTerminal && !val.terminalType) {
            ctx.addIssue({
                code: 'custom',
                path: ['terminalType'],
                message: `터미널 단계(id: ${val.id})는 terminalType("start" 또는 "end")이 필수입니다.`,
            });
        }
    });

export const SopEdgeAiSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional(),
    branchType: z.enum(['yes', 'no', 'condition', 'default']).optional(),
    condition: z.string().optional(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
});

export const SopGenerationResponseSchema = z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    steps: z.array(SopStepAiSchema).min(1),
    edges: z.array(SopEdgeAiSchema),
    _graphWarnings: z.array(z.string()).optional(),
})
    .passthrough()
    // 중복 step ID / edge ID는 이후 그래프 검증(도달성, decision 분기 등)을 왜곡시키므로
    // 파싱 단계에서 즉시 거부한다. graph-validation.ts의 duplicate-node-id/duplicate-edge-id는
    // 사용자가 Store에서 편집한 문서를 대상으로 같은 규칙을 다시 검사하는 런타임 안전망이다.
    .superRefine((val, ctx) => {
        const stepIdCounts = new Map<string, number>();
        val.steps.forEach((s) => stepIdCounts.set(s.id, (stepIdCounts.get(s.id) || 0) + 1));
        stepIdCounts.forEach((count, id) => {
            if (count > 1) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['steps'],
                    message: `단계 ID "${id}"가 ${count}번 중복되었습니다. 모든 단계 ID는 고유해야 합니다.`,
                });
            }
        });

        const edgeIdCounts = new Map<string, number>();
        val.edges.forEach((e) => edgeIdCounts.set(e.id, (edgeIdCounts.get(e.id) || 0) + 1));
        edgeIdCounts.forEach((count, id) => {
            if (count > 1) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['edges'],
                    message: `연결선 ID "${id}"가 ${count}번 중복되었습니다. 모든 연결선 ID는 고유해야 합니다.`,
                });
            }
        });
    });

export type SopGenerationResponse = z.infer<typeof SopGenerationResponseSchema>;
