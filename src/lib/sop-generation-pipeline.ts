import {
    validateSopFull,
    hasBlockingSopIssues,
    buildRepairInstruction,
    applyDeterministicGraphFixes,
    classifySopStepType,
    type ValidatableNode,
    type ValidatableEdge,
    type ValidatableSopStep,
    type GraphValidationIssue,
    type SopStructuralConstraints,
} from './graph-validation';
import { normalizeSopGenerationObject } from './sop-schemas';

export interface SopPipelineSuccess {
    ok: true;
    object: unknown;
    warnings: string[];
}

export interface SopPipelineFailure {
    ok: false;
    error: string;
    issues: GraphValidationIssue[];
    warnings: string[];
}

export type SopPipelineResult = SopPipelineSuccess | SopPipelineFailure;

/**
 * Repair 프롬프트에 첨부하는 직전 응답의 구조 요약.
 *
 * 전체 JSON.stringify를 그대로 붙이면 (28~42노드 한국어 리치 필드 기준 10만+ 자)
 * 길고 반복적인 컨텍스트가 모델의 퇴행 반복 루프(자유 문자열 필드 안에서 같은
 * 구절을 출력 토큰 한도까지 반복 → JSON 절단 → repair 자체가
 * NoObjectGeneratedError로 실패)를 유발할 수 있다 — 프로덕션 repair 호출이 실제로
 * 이 방식으로 죽었다. 그래프 검증이 지적하는 결함은 전부 구조(steps/edges의
 * id·연결·분기·루프·Activity 매핑) 수준이므로 repair에는 구조 요약이면 충분하고,
 * 단계 내용(definition, SKILL, 상세 지침 등)은 기본 프롬프트가 이미 전부 담고
 * 있어 모델이 다시 생성할 수 있다.
 */
export function buildSopStructuralDigest(object: unknown): string {
    const rec = (object ?? {}) as { steps?: unknown; edges?: unknown };
    const truncate = (v: unknown) => (typeof v === 'string' && v.length > 80 ? `${v.slice(0, 80)}…` : v);
    const steps = (Array.isArray(rec.steps) ? rec.steps : []).map((s) => {
        const step = (s ?? {}) as Record<string, unknown>;
        return {
            id: step.id,
            title: truncate(step.title),
            shape: step.shape,
            type: truncate(step.type),
            terminalType: step.terminalType,
            sourceActivityIds: step.sourceActivityIds,
            subActionOrder: step.subActionOrder,
            subActionOrigin: step.subActionOrigin,
        };
    });
    const edges = (Array.isArray(rec.edges) ? rec.edges : []).map((e) => {
        const edge = (e ?? {}) as Record<string, unknown>;
        return { id: edge.id, source: edge.source, target: edge.target, branchType: edge.branchType, label: truncate(edge.label) };
    });
    return JSON.stringify({ steps, edges });
}

/**
 * Repair 생성 1회 재시도 래퍼. 퇴행 반복 루프 같은 생성 실패는 확률적이므로,
 * 같은 프롬프트로 한 번 더 시도하면 대부분 정상 응답을 얻는다. 두 번째 시도도
 * 실패하면 그대로 throw하여 호출부의 기존 fallback/오류 경로를 태운다.
 */
export async function generateSopRepairWithRetry(
    generate: (repairPrompt: string) => Promise<unknown>,
    repairPrompt: string
): Promise<unknown> {
    try {
        return await generate(repairPrompt);
    } catch (firstError) {
        console.error(
            '[SOP Pipeline] repair 생성 1차 실패, 1회 재시도:',
            firstError instanceof Error ? firstError.message : String(firstError)
        );
        return generate(repairPrompt);
    }
}

/**
 * SOP 생성 결과의 그래프 검증(+구조 설정 준수) -> (필요시) 1회 LLM repair -> 결정론적 fallback ->
 * 재검증 파이프라인.
 *
 * route.ts에서 그대로 인라인으로 있던 로직을 순수 함수로 분리했다 - `generate`를 주입받으므로
 * 실제 generateObject/LLM 호출 없이도 "1차 실패 -> repair 성공", "repair도 실패 -> 결정론적
 * fallback", "fallback도 실패 -> 400" 세 경로를 전부 테스트할 수 있다.
 *
 * constraints(주요 단계 수 범위, 전체 노드 상한, 분기 정책, 재작업 루프 상한)는 결정론적
 * fallback으로 고칠 수 없는 종류의 결함이다(단계를 몇 개 지울지/추가할지는 안전하게 자동
 * 결정할 수 없음) - 그래서 repair 1회 시도 후에도 위반이 남으면 fallback을 거치더라도
 * 결국 최종 오류로 반환된다(조용히 통과시키지 않는다).
 */
export async function runSopValidationPipeline(
    initialObject: unknown,
    prompt: string,
    generate: (repairPrompt: string) => Promise<unknown>,
    constraints: SopStructuralConstraints
): Promise<SopPipelineResult> {
    // 파이프라인 진입점이 정규화의 단일 관문이다: 최초 생성 결과와 (runner가 다시 이
    // 함수로 넘기는) coverage-repair 결과 모두 여기를 지나므로, 기계적으로 정답이
    // 자명한 위반(빈 rationale, terminal의 잔여 provenance 필드 등)은 어느 경로로
    // 들어와도 검증 전에 정규화된다 - normalizeSopGenerationObject docstring 참고.
    let object: unknown = normalizeSopGenerationObject(initialObject);
    const warnings: string[] = [];

    const rec = object as { steps?: ValidatableSopStep[]; edges?: ValidatableEdge[] };
    let issues = validateSopFull(rec.steps || [], rec.edges || [], constraints);

    if (hasBlockingSopIssues(issues)) {
        console.log('[SOP Pipeline] SOP 그래프 검증 실패, 1회 repair 시도:', issues.map((i) => i.type));
        try {
            // 직전 응답은 전체 JSON이 아니라 구조 요약만 첨부한다 — buildSopStructuralDigest
            // docstring 참고 (전체 JSON 첨부는 프로덕션에서 repair 생성의 퇴행 반복 루프를
            // 유발해 repair 기회 자체를 날렸다).
            const repairPrompt = `${prompt}\n\n${buildRepairInstruction(issues)}\n\n## 직전 응답의 구조 요약 (참고용 - 이 구조를 유지하되 지적된 결함만 고쳐 전체 응답을 다시 생성하세요)\n${buildSopStructuralDigest(object)}`;
            object = normalizeSopGenerationObject(await generateSopRepairWithRetry(generate, repairPrompt));
            const repairedRec = object as { steps?: ValidatableSopStep[]; edges?: ValidatableEdge[] };
            issues = validateSopFull(repairedRec.steps || [], repairedRec.edges || [], constraints);
        } catch (repairError) {
            console.error('[SOP Pipeline] SOP 그래프 repair 요청 실패:', repairError);
        }
    }

    if (hasBlockingSopIssues(issues)) {
        const finalRec = object as {
            steps: (ValidatableSopStep & { id: string })[];
            edges: (ValidatableEdge & { id: string })[];
        };
        const mappedNodes: (ValidatableNode & { id: string })[] = (finalRec.steps || []).map((s) => ({
            id: s.id,
            type: classifySopStepType(s),
            terminalType: s.terminalType,
            shape: s.shape,
        }));
        const fixed = applyDeterministicGraphFixes(mappedNodes, finalRec.edges || []);
        object = { ...(object as object), edges: fixed.edges };
        warnings.push(...fixed.fixesApplied);

        const revalidatedRec = object as { steps?: ValidatableSopStep[]; edges?: ValidatableEdge[] };
        const finalIssues = validateSopFull(revalidatedRec.steps || [], revalidatedRec.edges || [], constraints);
        if (hasBlockingSopIssues(finalIssues)) {
            return {
                ok: false,
                error: `AI SOP 생성 오류: 그래프에 복구 불가능한 결함(${finalIssues.map((i) => i.message).join(', ')})이 존재합니다.`,
                issues: finalIssues,
                warnings,
            };
        }
    }

    return { ok: true, object, warnings };
}
