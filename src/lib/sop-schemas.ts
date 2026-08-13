import { z } from 'zod';
import { FLOW_SHAPE_IDS } from './flow-shapes';
import { SopRequiredSkillSchema, SopStepCommonFieldsSchema, SopEdgeCommonFieldsSchema, forbidDuplicateIds } from './sop-step-common-schema';

export { SopRequiredSkillSchema };

/**
 * Validates a raw AI generation response. This schema's job is to reject a
 * genuinely low-quality or malformed model output before it ever reaches the
 * Store — the minimum lengths and generation-friendly defaults here (a
 * missing shape/position silently becomes 'process'/{0,0} rather than
 * failing) exist for that purpose only. A persisted member document is a
 * different concern with its own, deliberately less strict schema — see
 * sop-document-schema.ts's docstring for why it does not reuse these
 * generation-only constraints.
 */
export const SopStepAiSchema = SopStepCommonFieldsSchema.extend({
    title: z.string().min(1),
    definition: z.string().min(5),
    shape: z.enum(FLOW_SHAPE_IDS).default('process'),
    position: z
        .object({
            x: z.number(),
            y: z.number(),
        })
        .default({ x: 0, y: 0 }),
})
    // shape 또는 type이 'terminal'이면 terminalType이 반드시 있어야 한다.
    // 배열 위치(idx===0 등)로 start/end를 추정하는 대신, 없는 값은 여기서 즉시 파싱 오류로 처리한다.
    // 이 완결성 검사는 AI 생성 시점 전용이다 - 편집 중인 저장 문서는 이 상태를 일시적으로
    // 가질 수 있어야 하므로 sop-document-schema.ts의 저장 schema에는 포함하지 않는다.
    .superRefine((val, ctx) => {
        const isTerminal = val.shape === 'terminal' || val.type === 'terminal';
        if (isTerminal && !val.terminalType) {
            ctx.addIssue({
                code: 'custom',
                path: ['terminalType'],
                message: `터미널 단계(id: ${val.id})는 terminalType("start" 또는 "end")이 필수입니다.`,
            });
        }
        if (val.terminalType && (val.sourceActivityIds?.length || val.subActionOrder !== undefined || val.subActionOrigin || val.subActionOriginRationale || val.agentizationSuggestion)) {
            ctx.addIssue({
                code: 'custom',
                path: ['terminalType'],
                message: `터미널 단계(id: ${val.id})에는 Activity 매핑, Sub Action 순서·출처, Agent화 제안을 넣을 수 없습니다.`,
            });
        }
        if (val.subActionOrigin === 'context-derived' && !val.subActionOriginRationale?.trim()) {
            ctx.addIssue({
                code: 'custom',
                path: ['subActionOriginRationale'],
                message: '직무 맥락에서 추가된 Sub Action에는 추가 근거가 필요합니다.',
            });
        }
        if (val.subActionOrigin === 'activity-derived' && val.subActionOriginRationale !== undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['subActionOriginRationale'],
                message: 'Activity 기본 분해 단계에는 직무 맥락 추가 근거를 넣지 않습니다.',
            });
        }
    });

export const SopEdgeAiSchema = SopEdgeCommonFieldsSchema;

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
        forbidDuplicateIds(val.steps, ctx, 'steps', '단계');
        forbidDuplicateIds(val.edges, ctx, 'edges', '연결선');
    });
