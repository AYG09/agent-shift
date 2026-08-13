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
            const repairPrompt = `${prompt}\n\n${buildRepairInstruction(issues)}\n\n## 직전 응답 (참고용 - 문제 있는 부분만 고치세요)\n${JSON.stringify(object)}`;
            object = normalizeSopGenerationObject(await generate(repairPrompt));
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
