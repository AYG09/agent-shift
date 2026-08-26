import { z } from 'zod';
import { FLOW_SHAPE_IDS } from './flow-shapes';
import { SopRequiredSkillSchema, SopStepCommonFieldsSchema, SopEdgeCommonFieldsSchema, forbidDuplicateIds, SOP_AGENTIZATION_SUGGESTION_TYPES } from './sop-step-common-schema';
import { SopAgentInstructionSpecSchema, SopAgentInstructionSpecWireSchema, SopNodeExecutionSpecWireSchema } from './sop-node-authoring-contract';

export { SopRequiredSkillSchema };

/**
 * 와이어(generateObject) 전용 단계 스키마 — 게이트(SopStepAiSchema)보다 한 단계 더
 * 관대하다. Gemini 구조화 출력은 enum/타입은 강제하지만 superRefine·min-length·
 * positive() 따위는 강제하지 못하므로, 그 규칙들을 generateObject에 넘기는 스키마에
 * 남겨 두면 단계 하나의 기계적 위반(빈 rationale, subActionOrder 0, 빈 Activity ID
 * 문자열, 5자 미만 definition)이 응답 전체를 파싱 시점에 죽인다
 * (NoObjectGeneratedError는 repair 루프에 도달하지 못한다 — 프로덕션의
 * "AI 응답이 스키마와 일치하지 않습니다" 500이 바로 이 경로였다).
 *
 * 여기서 관대해진 항목은 전부 파이프라인 진입 정규화(normalizeSopGenerationObject)가
 * 기계적으로 고치거나(순서 반올림/삭제, 빈 문자열 제거, 짧은 definition 백필),
 * 생성 후처리 검증·repair 루프가 다시 요구한다(제안 누락, coverage). 따라서 서버가
 * 클라이언트로 내보내는 응답은 언제나 엄격한 게이트(SopGenerationResponseSchema)를
 * 통과하는 상태다 — 관용은 와이어에서만 존재한다.
 */
const SopStepWireSchema = SopStepCommonFieldsSchema.extend({
    title: z.string().min(1),
    definition: z.string(),
    shape: z.enum(FLOW_SHAPE_IDS).default('process'),
    // 공용 스키마의 type은 자유 문자열이지만, 와이어에서는 enum으로 제한한다.
    // Gemini 구조화 출력의 제약 디코딩은 enum을 강제하므로, 모델이 자유 문자열
    // 필드 안에서 퇴행 반복 루프(같은 구절을 토큰 한도까지 반복 → JSON 절단 →
    // NoObjectGeneratedError)에 빠지는 것을 이 필드에서는 원천 차단한다 —
    // 프로덕션 repair 호출이 실제로 type 필드 안에서 이 방식으로 죽었다.
    // classifySopStepType은 'terminal'/'decision'만 구별하므로 의미는 동일하다.
    type: z.enum(['process', 'decision', 'terminal', 'io', 'data', 'task', 'agent']).optional(),
    subActionOriginRationale: z.string().optional(),
    subActionOrder: z.number().optional(),
    sourceActivityIds: z.array(z.string()).optional(),
    // 실행 명세도 같은 이유로 와이어에서만 관대하다: 필드 하나의 누락이 응답 전체를
    // 파싱 시점에 죽이면 repair 루프가 돌 기회 자체가 사라진다. 완결성은
    // validateSopNodeAuthoring의 blocking issue → repair 루프가 요구한다.
    executionSpec: SopNodeExecutionSpecWireSchema.optional(),
    agentizationSuggestion: z
        .object({
            type: z.enum(SOP_AGENTIZATION_SUGGESTION_TYPES),
            // 빈 문자열 rationale은 여기서 통과시키고 정규화가 제안 자체를 제거한다.
            // 그러면 runner의 findMissingSuggestionStepIds가 repair로 다시 요구한다.
            rationale: z.string(),
        })
        .optional(),
    position: z
        .object({
            x: z.number(),
            y: z.number(),
        })
        .default({ x: 0, y: 0 }),
});

/**
 * generateObject에 넘기는 SOP 응답 와이어 스키마. 중복 step/edge ID 검사와 terminal
 * completeness 검사를 여기 두지 않는 것이 핵심이다 — 두 검사 모두 graph-validation의
 * validateSopGraph(duplicate-node-id / duplicate-edge-id / terminal-missing-type)가
 * blocking issue로 다시 수행하고, 그 경로는 LLM repair 1회 → 결정론적 fallback →
 * 400을 제공한다. 와이어 파싱 거부는 그 어떤 복구 경로도 제공하지 못한다.
 * 클라이언트 문서 생성 게이트(sop-normalizer.ts)는 계속 엄격한
 * SopGenerationResponseSchema를 사용하므로 이중 방어는 유지된다.
 */
export const SopGenerationWireSchema = z
    .object({
        title: z.string().min(1),
        summary: z.string().optional(),
        agentInstruction: SopAgentInstructionSpecWireSchema.optional(),
        steps: z.array(SopStepWireSchema),
        edges: z.array(SopEdgeCommonFieldsSchema),
        _graphWarnings: z.array(z.string()).optional(),
    })
    .passthrough();

/**
 * Validates a raw AI generation response at the GATE (document creation in
 * sop-normalizer.ts) — NOT on the wire. generateObject receives the tolerant
 * SopGenerationWireSchema above; by the time a response reaches this schema it
 * has passed the pipeline's normalization + graph validation, so the strict
 * rules here (min lengths, terminal completeness, duplicate-ID rejection) act
 * as the client-side double defense they were designed to be, without ever
 * being able to kill a response at parse time before the repair loop runs.
 * A persisted member document is a different concern with its own,
 * deliberately less strict schema — see sop-document-schema.ts's docstring
 * for why it does not reuse these generation-only constraints.
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
 *  4. agentizationSuggestion의 rationale이 빈 문자열이면 제안 자체를 제거
 *     (runner의 repair 루프가 누락 제안으로 다시 요구한다)
 *  5. subActionOrder 비정수 반올림, 1 미만·비유한 값은 필드 제거
 *  6. sourceActivityIds의 빈 문자열 항목 제거, 결과가 비면 필드 제거
 *  7. 5자 미만 definition을 title 기반 문장으로 백필 (한 단계의 부실 정의가
 *     응답 전체를 죽이지 않게 — sop-normalizer의 기존 백필 패턴과 동일)
 *  8. terminal 중 정확히 1개만 terminalType이 없고 start/end 중 정확히 하나가
 *     비어 있으면 그 값으로 보완 (집합 완성 — 배열 위치 추정이 아니다.
 *     모호한 경우는 손대지 않고 validateSopGraph의 terminal-missing-type
 *     blocking issue → repair 루프로 넘긴다)
 *  9. 중복 edge ID를 고유하게 개명 (edge ID는 순수 식별자라 의미 변화가 없다.
 *     중복 step ID는 edge 참조가 모호해 기계적으로 고칠 수 없으므로
 *     validateSopGraph의 duplicate-node-id → repair 루프가 처리한다)
 *
 * 정답이 자명하지 않은 결함(출처 자체 누락, context-derived의 근거 누락, Activity
 * 매핑 오류)은 여기서 손대지 않는다 — sop-generation-runner의 검증·repair 루프가
 * 모델에게 다시 요구한다. 이 함수는 순수 함수이며 스키마 변환(zod→JSON schema)에
 * 관여하지 않으므로 구조화 출력 계약을 바꾸지 않는다.
 */
export function normalizeSopGenerationObject(object: unknown): unknown {
    if (!object || typeof object !== 'object') return object;
    const rec = object as { steps?: unknown; edges?: unknown };
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

        const suggestion = next.agentizationSuggestion;
        if (suggestion && typeof suggestion === 'object') {
            const rationale = (suggestion as Record<string, unknown>).rationale;
            const trimmedRationale = typeof rationale === 'string' ? rationale.trim() : '';
            if (trimmedRationale) {
                next.agentizationSuggestion = { ...(suggestion as Record<string, unknown>), rationale: trimmedRationale };
            } else {
                delete next.agentizationSuggestion;
            }
        }

        if (typeof next.subActionOrder === 'number') {
            const rounded = Math.round(next.subActionOrder);
            if (Number.isFinite(rounded) && rounded >= 1) next.subActionOrder = rounded;
            else delete next.subActionOrder;
        } else if ('subActionOrder' in next && typeof next.subActionOrder !== 'number') {
            delete next.subActionOrder;
        }

        if (Array.isArray(next.sourceActivityIds)) {
            const filtered = next.sourceActivityIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
            if (filtered.length > 0) next.sourceActivityIds = filtered;
            else delete next.sourceActivityIds;
        }

        if (typeof next.definition === 'string' && next.definition.trim().length < 5 && typeof next.title === 'string' && next.title.trim()) {
            next.definition = `${next.title.trim()} 단계를 수행합니다.`;
        }

        const isTerminal = next.terminalType === 'start' || next.terminalType === 'end' || next.shape === 'terminal' || next.type === 'terminal';
        if (isTerminal) {
            delete next.sourceActivityIds;
            delete next.subActionOrder;
            delete next.subActionOrigin;
            delete next.subActionOriginRationale;
            delete next.agentizationSuggestion;
            // terminal은 업무 실행 단계가 아니다 — 실행 명세가 남으면 Agent화·품질
            // 검증이 시작/종료 노드를 업무 노드로 오인한다.
            delete next.executionSpec;
        }
        return next;
    });

    // terminalType 집합 완성: terminal 단계 중 정확히 1개만 타입이 없고,
    // 이미 지정된 타입들에 start/end 중 정확히 하나가 빠져 있을 때만 그 값을 채운다.
    // (둘 다 없거나 여러 개가 비어 있으면 모호하므로 손대지 않는다 — 그 경우는
    // validateSopGraph가 terminal-missing-type으로 막고 repair 루프가 처리한다.)
    const terminals = steps.filter(
        (s) => s && typeof s === 'object' && ((s as Record<string, unknown>).shape === 'terminal' || (s as Record<string, unknown>).type === 'terminal')
    ) as Record<string, unknown>[];
    const untyped = terminals.filter((t) => t.terminalType !== 'start' && t.terminalType !== 'end');
    if (untyped.length === 1) {
        const typedSet = new Set(terminals.map((t) => t.terminalType).filter((t) => t === 'start' || t === 'end'));
        if (typedSet.has('start') && !typedSet.has('end')) untyped[0].terminalType = 'end';
        else if (typedSet.has('end') && !typedSet.has('start')) untyped[0].terminalType = 'start';
    }

    let edges = rec.edges;
    if (Array.isArray(edges)) {
        const seenIds = new Set<string>();
        edges.forEach((e) => {
            if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).id === 'string') seenIds.add((e as Record<string, unknown>).id as string);
        });
        const usedIds = new Set<string>();
        edges = edges.map((edge) => {
            if (!edge || typeof edge !== 'object') return edge;
            const rawId = (edge as Record<string, unknown>).id;
            if (typeof rawId !== 'string') return edge;
            if (!usedIds.has(rawId)) {
                usedIds.add(rawId);
                return edge;
            }
            let suffix = 2;
            let candidate = `${rawId}-dup${suffix}`;
            while (seenIds.has(candidate) || usedIds.has(candidate)) {
                suffix += 1;
                candidate = `${rawId}-dup${suffix}`;
            }
            usedIds.add(candidate);
            return { ...(edge as Record<string, unknown>), id: candidate };
        });
    }

    return { ...(object as object), steps, ...(Array.isArray(edges) ? { edges } : {}) };
}

export const SopEdgeAiSchema = SopEdgeCommonFieldsSchema;

/**
 * Agent화 제안 전용 패치 응답 스키마. agentizationSuggestion은 와이어에서
 * optional이라 모델이 (특히 28~42노드 장문 출력에서) 통째로 생략할 수 있는데,
 * 그때 33노드 전체를 다시 생성하게 하면 실패 확률만 높다. 누락된 단계 목록만
 * 넘겨 제안만 돌려받는 소형 호출(출력 수천 토큰)로 복구한다 — 제안은 반드시
 * AI가 생성한 판단이어야 하므로 서버가 기본값을 조작해 채우는 일은 없다.
 */
export const SopSuggestionPatchSchema = z.object({
    suggestions: z.array(
        z.object({
            stepId: z.string(),
            type: z.enum(SOP_AGENTIZATION_SUGGESTION_TYPES),
            rationale: z.string(),
        })
    ),
});

export const SopGenerationResponseSchema = z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    /** 문서 수준 Mission. 게이트에서는 완결된 형태만 통과한다 (와이어는 관대). */
    agentInstruction: SopAgentInstructionSpecSchema.optional(),
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
