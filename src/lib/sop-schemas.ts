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
    // 와이어 관용성: 구조화 출력 모델은 optional 문자열 필드를 모든 항목에 일괄로
    // 채우는 경향이 있어(빈 문자열 포함), min(1)을 여기서 강제하면 단계 하나의
    // 빈 rationale이 응답 전체를 파싱 단계에서 죽인다(NoObjectGeneratedError는
    // repair 루프에 도달하지 못한다). 빈/불필요 rationale은 파싱 이후
    // normalizeSopGenerationObject가 기계적으로 정규화하고, 진짜 품질 결함
    // (context-derived인데 근거 없음)은 sop-generation-runner의 repair 루프가
    // 처리한다. 확정 경계(validateFullSopConfirmation)의 엄격한 규칙은 그대로다.
    subActionOriginRationale: z.string().optional(),
    position: z
        .object({
            x: z.number(),
            y: z.number(),
        })
        .default({ x: 0, y: 0 }),
})
    // shape 또는 type이 'terminal'이면 terminalType이 반드시 있어야 한다.
    // 배열 위치(idx===0 등)로 start/end를 추정하는 대신, 없는 값은 여기서 즉시 파싱 오류로 처리한다.
    // (start인지 end인지 안전하게 추측할 수 없는, 정규화 불가능한 진짜 모호성이므로
    // 이것만은 관용 없이 파싱 거부를 유지한다.)
    // 이 완결성 검사는 AI 생성 시점 전용이다 - 편집 중인 저장 문서는 이 상태를 일시적으로
    // 가질 수 있어야 하므로 sop-document-schema.ts의 저장 schema에는 포함하지 않는다.
    //
    // 과거에는 terminal의 잔여 provenance 필드, activity-derived의 rationale 동반,
    // context-derived의 rationale 누락도 여기서 파싱 거부했다. 그 규칙들은 모델이
    // 기계적으로 위반하기 쉬워 응답 전체를 즉사시키는 주요 원인이었고, 지금은
    // normalizeSopGenerationObject(기계적 정규화)와 generation-runner의 repair
    // 루프(품질 결함 보정)로 옮겨져 END-TO-END 불변식은 동일하게 유지된다.
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

/**
 * 파싱 직후의 기계적 정규화 — AI 응답에서 "정답이 자명한" 위반만 고친다:
 *  1. subActionOriginRationale 공백 정리, 빈 문자열은 필드 제거
 *  2. activity-derived 단계의 잔여 rationale 제거 (기본 분해에는 근거 필드가 없다)
 *  3. terminal(시작/종료) 단계의 provenance/Agent화 필드 일괄 제거
 *
 * 정답이 자명하지 않은 결함(출처 자체 누락, context-derived의 근거 누락, Activity
 * 매핑 오류)은 여기서 손대지 않는다 — sop-generation-runner의 검증·repair 루프가
 * 모델에게 다시 요구한다. 이 함수는 순수 함수이며 스키마 변환(zod→JSON schema)에
 * 관여하지 않으므로 구조화 출력 계약을 바꾸지 않는다.
 */
export function normalizeSopGenerationObject(object: unknown): unknown {
    if (!object || typeof object !== 'object') return object;
    const rec = object as { steps?: unknown };
    if (!Array.isArray(rec.steps)) return object;

    const steps = rec.steps.map((step) => {
        if (!step || typeof step !== 'object') return step;
        const next = { ...(step as Record<string, unknown>) };

        if (typeof next.subActionOriginRationale === 'string') {
            const trimmed = next.subActionOriginRationale.trim();
            if (trimmed) next.subActionOriginRationale = trimmed;
            else delete next.subActionOriginRationale;
        }
        if (next.subActionOrigin === 'activity-derived') {
            delete next.subActionOriginRationale;
        }

        const isTerminal = next.terminalType === 'start' || next.terminalType === 'end' || next.shape === 'terminal' || next.type === 'terminal';
        if (isTerminal) {
            delete next.sourceActivityIds;
            delete next.subActionOrder;
            delete next.subActionOrigin;
            delete next.subActionOriginRationale;
            delete next.agentizationSuggestion;
        }
        return next;
    });
    return { ...(object as object), steps };
}

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
