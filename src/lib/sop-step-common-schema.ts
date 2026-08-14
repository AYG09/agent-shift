import { z } from 'zod';

/**
 * Structural step/edge fields with identical requirements whether the data
 * comes from an AI generation response (sop-schemas.ts) or a member's
 * persisted, possibly in-progress document (sop-document-schema.ts). Each of
 * those two schemas extends this with its own generation-only or
 * persistence-only constraints — see their file docstrings for why they
 * differ on title/definition length, shape/position defaults, and the
 * terminal-completeness check.
 */
export const SopRequiredSkillSchema = z.object({
    skillId: z.string().optional(),
    name: z.string().min(1),
    requiredLevel: z.enum(['basic', 'intermediate', 'advanced']).default('basic'),
    reason: z.string().optional(),
    source: z.enum(['work-library', 'ai-suggested']),
    accepted: z.boolean().default(false),
});

/**
 * Agent화 제안 타입의 단일 원천 (SSOT). zod 스키마(z.enum)와 TS 타입
 * (SopAgentizationSuggestionType, sop-types.ts)이 모두 이 배열에서 파생된다 —
 * `z.enum(['agent-candidate', ...])` 리터럴 재나열은 `npm run verify:quality`가
 * 금지한다.
 */
export const SOP_AGENTIZATION_SUGGESTION_TYPES = ['agent-candidate', 'ai-assist', 'not-recommended'] as const;

export const SopAgentizationSuggestionSchema = z.object({
    type: z.enum(SOP_AGENTIZATION_SUGGESTION_TYPES),
    rationale: z.string().min(1),
});

export const SopStepCommonFieldsSchema = z.object({
    id: z.string(),
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
    terminalType: z.enum(['start', 'end']).optional(),
    ioType: z.enum(['input', 'output']).optional(),
    sourceActivityIds: z.array(z.string().min(1)).optional(),
    subActionOrder: z.number().int().positive().optional(),
    subActionOrigin: z.enum(['activity-derived', 'context-derived']).optional(),
    subActionOriginRationale: z.string().min(1).optional(),
    agentizationSuggestion: SopAgentizationSuggestionSchema.optional(),
});

export const SopEdgeCommonFieldsSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional(),
    branchType: z.enum(['yes', 'no', 'condition', 'default']).optional(),
    condition: z.string().optional(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
});

/** Shared by both response and document schemas: no two steps/edges may share an id. */
export function forbidDuplicateIds<
    T extends { id: string }
>(items: T[], ctx: z.RefinementCtx, path: string, label: string) {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(item.id, (counts.get(item.id) || 0) + 1));
    counts.forEach((count, id) => {
        if (count > 1) {
            ctx.addIssue({
                code: 'custom',
                path: [path],
                message: `${label} ID "${id}"가 ${count}번 중복되었습니다. 모든 ${label} ID는 고유해야 합니다.`,
            });
        }
    });
}
