import { NextResponse } from 'next/server';
import { runSopValidationPipeline, generateSopRepairWithRetry } from '@/lib/sop-generation-pipeline';
import { SopSuggestionPatchSchema } from '@/lib/sop-schemas';
import type { SopStructuralConstraints } from '@/lib/graph-validation';
import type { SopGenerationRequest } from '@/lib/sop-ai-request';
import {
    formatSopActivityCoverageErrors,
    validateGeneratedActivityCoverage,
    formatSubActionStructureErrors,
    validateSubActionStructure,
    type SopActivityCoverageResult,
    type SopSubActionStructureResult,
} from '@/lib/sop-activity-coverage';
import {
    validateSopNodeAuthoring,
    formatSopNodeQualityIssues,
    EMPTY_TOOL_REGISTRY,
    type SopAgentInstructionSpec,
    type SopNodeExecutionSpec,
    type SopNodeAuthoringStepInput,
} from '@/lib/sop-node-authoring-contract';

type GeneratedStep = {
    id: string;
    title?: string;
    definition?: string;
    shape?: string;
    type?: string;
    terminalType?: 'start' | 'end';
    sourceActivityIds?: string[];
    subActionOrder?: number;
    subActionOrigin?: 'activity-derived' | 'context-derived';
    subActionOriginRationale?: string;
    agentizationSuggestion?: { type: string; rationale: string };
    executionSpec?: SopNodeExecutionSpec;
};

type GeneratedDocumentShape = { agentInstruction?: SopAgentInstructionSpec; steps?: GeneratedStep[] };

/**
 * 수치·기준 근거 판정에 쓰는 원문 모음 — Task 정의, Activity 설명, 업무맥락.
 * getSopPrompt가 모델에게 보여준 것과 같은 원문이어야 "입력에 실제로 등장하는
 * 값만 사용하라"는 지시와 검증 기준이 어긋나지 않는다.
 */
function buildGroundingTexts(sopRequest: SopGenerationRequest): string[] {
    const texts: string[] = [];
    if (sopRequest.taskDefinition) texts.push(sopRequest.taskDefinition);
    sopRequest.activities.forEach((activity) => {
        if (activity.description) texts.push(activity.description);
        activity.skills.forEach((skill) => {
            if (skill.description) texts.push(skill.description);
        });
    });
    sopRequest.skills.forEach((skill) => {
        if (skill.description) texts.push(skill.description);
    });
    if (sopRequest.context) texts.push(sopRequest.context);
    return texts;
}

function toAuthoringSteps(steps: GeneratedStep[]): SopNodeAuthoringStepInput[] {
    return steps.map((step) => ({
        id: step.id,
        title: step.title ?? '',
        definition: step.definition ?? '',
        shape: step.shape,
        type: step.type,
        terminalType: step.terminalType,
        executionSpec: step.executionSpec,
    }));
}

/** 패치 호출에 넘기는 누락 단계 요약 — 제안 판단에 필요한 최소 정보만. */
export type SopSuggestionPatchStepInfo = { id: string; title?: string; definition?: string };

/**
 * 소형 패치 호출의 응답을 검증해 누락 단계에만 병합한다. stepId가 현재 누락
 * 목록에 없는 항목, rationale이 비어 있는 항목은 조용히 무시된다 — 서버가
 * 제안을 조작·기본값 처리하는 일은 절대 없고, 채워지지 않은 단계는 기존
 * 검증·repair·400 경로가 그대로 처리한다.
 */
function applySuggestionPatch(object: unknown, missingIds: string[], rawPatch: unknown): unknown {
    const parsed = SopSuggestionPatchSchema.safeParse(rawPatch);
    if (!parsed.success) return object;
    const patchById = new Map(parsed.data.suggestions.map((item) => [item.stepId, item]));
    const missing = new Set(missingIds);
    const rec = object as { steps?: GeneratedStep[] };
    if (!Array.isArray(rec.steps)) return object;
    const steps = rec.steps.map((step) => {
        if (!missing.has(step.id)) return step;
        const patchItem = patchById.get(step.id);
        const rationale = patchItem?.rationale.trim();
        if (!patchItem || !rationale) return step;
        return { ...step, agentizationSuggestion: { type: patchItem.type, rationale } };
    });
    return { ...(object as object), steps };
}

/** Every non-terminal Sub Action must carry an AI Agent화 suggestion in the new structure — never silently optional. */
function findMissingSuggestionStepIds(steps: GeneratedStep[]): string[] {
    return steps.filter((step) => !step.terminalType && !step.agentizationSuggestion?.type).map((step) => step.id);
}

/** New Sub Actions must remain traceable to either the accepted Activity or the member's additional context. */
function findInvalidOriginStepIds(steps: GeneratedStep[]): string[] {
    return steps
        .filter((step) => {
            if (step.terminalType) return false;
            if (!step.subActionOrigin) return true;
            return step.subActionOrigin === 'context-derived' && !step.subActionOriginRationale?.trim();
        })
        .map((step) => step.id);
}

/**
 * Activities decomposed into only ONE Sub Action — the node unit is the Sub
 * Action, and the default expectation is 2~3 per Activity (see
 * computeSubActionCapacity / subaction-semantics-contract.md §4). This is a
 * GENERATION-time repair trigger and, if repair still leaves some, a warning —
 * never a hard 400 and never a confirm-boundary rule, because a genuinely
 * atomic Activity may legitimately stay at 1 (the semantic contract forbids
 * force-splitting unified actions).
 */
function findUnderDecomposedActivityIds(steps: GeneratedStep[], allowedIds: string[]): string[] {
    const counts = new Map<string, number>();
    steps.forEach((step) => {
        if (step.terminalType) return;
        const activityId = step.sourceActivityIds?.[0];
        if (activityId) counts.set(activityId, (counts.get(activityId) ?? 0) + 1);
    });
    // 0개는 coverage 오류(별도 차단)이므로 여기서는 정확히 1개인 Activity만 본다.
    return allowedIds.filter((id) => (counts.get(id) ?? 0) === 1);
}

function checkCoverage(steps: GeneratedStep[], allowedIds: string[], structureVersion: SopGenerationRequest['structureVersion']): SopActivityCoverageResult | SopSubActionStructureResult {
    return structureVersion === 'activity-subaction-v1'
        ? validateSubActionStructure(steps, allowedIds)
        : validateGeneratedActivityCoverage(steps, allowedIds);
}

function formatCoverageErrors(result: SopActivityCoverageResult | SopSubActionStructureResult): string[] {
    return 'multiActivityStepIds' in result ? formatSubActionStructureErrors(result) : formatSopActivityCoverageErrors(result);
}

export type SopGenerationRunResult =
    | { ok: true; object: unknown; warnings: string[] }
    | { ok: false; response: NextResponse };

/**
 * Runs the generate -> validate -> repair -> fallback -> revalidate pipeline for
 * a raw SOP generation object. `sopRequest` is the already-schema-validated request
 * (see parseSopGenerationRequest / SopGenerationRequestSchema) — every field here is
 * already correctly typed, so no field-by-field cast of a raw request body is needed.
 * Defaults (minSteps, branchPolicy, etc.) are applied with the same fallback values as
 * the client's DEFAULT_SETUP_CONFIG so a missing value never silently diverges between
 * what the prompt asked for and what the pipeline validates against.
 */
export async function runSopGenerationPostProcessing(params: {
    object: unknown;
    prompt: string;
    sopRequest: SopGenerationRequest;
    generateRepair: (repairPrompt: string) => Promise<unknown>;
    /**
     * 누락된 Agent화 제안만 채우는 소형 AI 호출 (SopSuggestionPatchSchema 응답).
     * 없으면 기존의 전체 재생성 repair 경로만 사용한다.
     */
    generateSuggestionPatch?: (missingSteps: SopSuggestionPatchStepInfo[]) => Promise<unknown>;
}): Promise<SopGenerationRunResult> {
    const { object, prompt, sopRequest, generateRepair, generateSuggestionPatch } = params;
    // minSteps/maxSteps/branchPolicy/maxBranches/allowRework are required by
    // SopGenerationRequestSchema, so they need no fallback here — only
    // maxTotalNodes/maxLoops are genuinely optional in that schema, and their
    // defaults match DEFAULT_SETUP_CONFIG (the same defaults getSopPrompt used
    // to build the prompt this object was generated from).
    const sopConstraints: SopStructuralConstraints = {
        minSteps: sopRequest.minSteps,
        maxSteps: sopRequest.maxSteps,
        maxTotalNodes: sopRequest.maxTotalNodes ?? 15,
        branchPolicy: sopRequest.branchPolicy,
        maxBranches: sopRequest.maxBranches,
        allowRework: sopRequest.allowRework,
        maxLoops: sopRequest.maxLoops ?? 3,
    };

    let pipelineResult = await runSopValidationPipeline(object, prompt, generateRepair, sopConstraints);

    if (!pipelineResult.ok) {
        return {
            ok: false,
            response: NextResponse.json({ error: pipelineResult.error, issues: pipelineResult.issues }, { status: 400 }),
        };
    }
    const sourceActivityIds = sopRequest.activities.map((activity) => activity.id).filter((id): id is string => Boolean(id));
    const structureVersion = sopRequest.structureVersion;
    const readSteps = (obj: unknown) => (obj as { steps?: GeneratedStep[] }).steps ?? [];

    // Agent-ready 5대 node 작성 규칙(RULE-NODE-01~05) + Mission/tool policy/HITL 검증
    // (REQ-NODE-001~005, REQ-AOP-001~004). 새 Activity–Sub Action 구조에서만 실행한다 —
    // 이 규칙은 executionSpec 필드를 요구하는 새 계약 전용이며, legacy Activity-scope
    // 생성은 이 필드를 요청받지 않으므로 여기서도 검증하지 않는다 (구 경로 무회귀).
    // 이 검사는 별도 repair round를 만들지 않는다 — 아래 coverage/suggestion/origin/
    // decomposition 검사와 같은 단일 repair round에 합류한다(1E-1 보완 지시서 항목 2).
    // 28~42 노드 문서에서 결함마다 별도 전체 재생성을 쌓으면 지연·토큰 비용이 커지고
    // repair 예산을 다 쓴 뒤 400으로 끝날 확률만 높인다.
    const groundingTexts = structureVersion === 'activity-subaction-v1' ? buildGroundingTexts(sopRequest) : [];
    const runAuthoringCheck = (obj: unknown) => {
        if (structureVersion !== 'activity-subaction-v1') return null;
        const doc = obj as GeneratedDocumentShape;
        return validateSopNodeAuthoring({
            agentInstruction: doc.agentInstruction,
            steps: toAuthoringSteps(readSteps(obj)),
            groundingTexts,
            toolRegistry: EMPTY_TOOL_REGISTRY,
            requireExecutionSpec: true,
        });
    };

    // agentizationSuggestion은 optional 필드라 모델이 장문 출력에서 통째로 생략할
    // 수 있다(프로덕션에서 33개 단계 전부 누락 사례). 33노드 전체를 다시 생성하는
    // repair는 실패 확률이 높으므로, 누락 제안만 요청하는 소형 패치 호출을 먼저
    // 시도한다 — 성공하면 전체 재생성 없이 통과하고, 실패하거나 일부만 채워지면
    // 기존 repair → 400 경로가 그대로 이어받는다.
    const tryPatchSuggestions = async (obj: unknown): Promise<unknown> => {
        if (!generateSuggestionPatch || structureVersion !== 'activity-subaction-v1') return obj;
        const missing = findMissingSuggestionStepIds(readSteps(obj));
        if (missing.length === 0) return obj;
        const missingSet = new Set(missing);
        const missingStepInfos = readSteps(obj)
            .filter((step) => missingSet.has(step.id))
            .map((step) => ({ id: step.id, title: step.title, definition: step.definition }));
        try {
            const rawPatch = await generateSuggestionPatch(missingStepInfos);
            const patched = applySuggestionPatch(obj, missing, rawPatch);
            const remaining = findMissingSuggestionStepIds(readSteps(patched));
            console.log(`[SOP Runner] Agent화 제안 패치: ${missing.length}개 누락 중 ${missing.length - remaining.length}개 보충`);
            return patched;
        } catch (patchError) {
            console.error('[SOP Runner] Agent화 제안 패치 생성 실패:', patchError instanceof Error ? patchError.message : String(patchError));
            return obj;
        }
    };

    pipelineResult = { ...pipelineResult, object: await tryPatchSuggestions(pipelineResult.object) };
    const coverage = checkCoverage(readSteps(pipelineResult.object), sourceActivityIds, structureVersion);
    const missingSuggestions = structureVersion === 'activity-subaction-v1' ? findMissingSuggestionStepIds(readSteps(pipelineResult.object)) : [];
    const invalidOrigins = structureVersion === 'activity-subaction-v1' ? findInvalidOriginStepIds(readSteps(pipelineResult.object)) : [];
    const underDecomposed = structureVersion === 'activity-subaction-v1' ? findUnderDecomposedActivityIds(readSteps(pipelineResult.object), sourceActivityIds) : [];
    let authoringReport = runAuthoringCheck(pipelineResult.object);
    const needsCoverageRepair =
        (sourceActivityIds.length > 0 && (!coverage.valid || missingSuggestions.length > 0 || invalidOrigins.length > 0 || underDecomposed.length > 0)) ||
        Boolean(authoringReport && !authoringReport.ok);
    if (needsCoverageRepair) {
        const suggestionGuidance = missingSuggestions.length
            ? `\nAgent화 제안(agentizationSuggestion)이 누락된 단계: ${missingSuggestions.join(', ')} — 모든 비-terminal 단계에 type과 rationale을 채워 넣으세요.`
            : '';
        const originGuidance = invalidOrigins.length
            ? `\nSub Action 출처가 없거나 불완전한 단계: ${invalidOrigins.join(', ')} — 모든 비-terminal 단계에 subActionOrigin을 넣고, context-derived에는 구체적인 subActionOriginRationale을 추가하세요.`
            : '';
        const decompositionGuidance = underDecomposed.length
            ? `\nSub Action이 1개뿐인 Activity: ${underDecomposed.join(', ')} — 각 Activity는 기본적으로 2~3개의 Sub Action으로 분해해야 합니다. 해당 Activity 설명을 실행 행동 단위로 다시 분해하세요 (하나의 통합 행동으로만 성립하는 경우에만 1개 유지).`
            : '';
        // Agent-ready 작성 품질 blocking 이슈는 별도 repair 호출을 만들지 않고 이
        // 라운드의 같은 prompt·같은 generateRepair 호출 하나에 합류한다(1E-1 항목 2).
        const authoringGuidance = authoringReport && !authoringReport.ok
            ? `\n## Agent-ready 작성 품질 보정\n다음 blocking 이슈를 모두 해소하세요. 입력에 없는 수치·SLA·tool 권한을 추가하지 말고, 근거가 없으면 값을 만들지 말고 정성적 기준이나 escalationRules로 사람 확인을 요청하세요.\n${formatSopNodeQualityIssues(authoringReport.blockingIssues).join('\n')}`
            : '';
        const repairGuidance = structureVersion === 'activity-subaction-v1'
            ? `${formatCoverageErrors(coverage).join('\n')}\n각 업무 단계(시작/종료 제외)는 정확히 1개의 sourceActivityIds를 가져야 하며, 같은 Activity 안에서 subActionOrder가 겹치면 안 됩니다. 선택된 모든 Activity ID를 빠짐없이 한 번 이상 Sub Action으로 반영하세요.${suggestionGuidance}${originGuidance}${decompositionGuidance}${authoringGuidance}`
            : `${formatCoverageErrors(coverage).join('\n')}\n각 업무 단계의 sourceActivityIds를 수정하고, 선택된 모든 Activity ID를 빠짐없이 한 번 이상 반영하세요.`;
        try {
            // 퇴행 반복 루프 등 확률적 생성 실패에 대비해 coverage repair도 1회 재시도한다.
            // 이 한 번의 호출이 coverage/suggestion/origin/decomposition/authoring 결함을
            // 전부 함께 요구한다 — 결함 종류별로 별도 전체 재생성을 쌓지 않는다.
            const repaired = await generateSopRepairWithRetry(generateRepair, `${prompt}\n\n## Activity 연결 보정\n${repairGuidance}`);
            pipelineResult = await runSopValidationPipeline(repaired, prompt, generateRepair, sopConstraints);
        } catch {
            // The final validation below returns a 400 with the actionable coverage issue.
        }
        if (!pipelineResult.ok) {
            return { ok: false, response: NextResponse.json({ error: pipelineResult.error, issues: pipelineResult.issues }, { status: 400 }) };
        }
        // 전체 repair 결과에도 제안이 빠져 있으면 400으로 가기 전에 패치를 한 번 더 시도한다.
        pipelineResult = { ...pipelineResult, object: await tryPatchSuggestions(pipelineResult.object) };
        const repairedCoverage = checkCoverage(readSteps(pipelineResult.object), sourceActivityIds, structureVersion);
        const repairedMissingSuggestions = structureVersion === 'activity-subaction-v1' ? findMissingSuggestionStepIds(readSteps(pipelineResult.object)) : [];
        const repairedInvalidOrigins = structureVersion === 'activity-subaction-v1' ? findInvalidOriginStepIds(readSteps(pipelineResult.object)) : [];
        authoringReport = runAuthoringCheck(pipelineResult.object);
        if (!repairedCoverage.valid || repairedMissingSuggestions.length > 0 || repairedInvalidOrigins.length > 0 || (authoringReport && !authoringReport.ok)) {
            const suggestionError = repairedMissingSuggestions.length ? ` / Agent화 제안 누락 단계: ${repairedMissingSuggestions.join(', ')}` : '';
            const originError = repairedInvalidOrigins.length ? ` / Sub Action 출처 누락·불완전 단계: ${repairedInvalidOrigins.join(', ')}` : '';
            const authoringError = authoringReport && !authoringReport.ok
                ? ` / SOP 노드 작성 품질 위반: ${formatSopNodeQualityIssues(authoringReport.blockingIssues).join(' / ')}`
                : '';
            return {
                ok: false,
                response: NextResponse.json(
                    {
                        error: `Task Library Activity 반영 검증에 실패했습니다: ${formatCoverageErrors(repairedCoverage).join(' / ')}${suggestionError}${originError}${authoringError}`,
                        ...(authoringReport && !authoringReport.ok ? { issues: authoringReport.blockingIssues } : {}),
                    },
                    { status: 400 }
                ),
            };
        }
    }

    // 과소분해(Activity당 Sub Action 1개)는 repair까지 요구한 뒤에도 남아 있으면
    // 경고로만 전달한다 — 진짜 원자적 Activity를 400으로 막으면 의미 계약("통합
    // 행동은 억지로 쪼개지 않는다")을 어기게 된다. 경고는 _graphWarnings로 클라이언트에
    // 노출되어 구성원이 해당 Activity의 분해 수준을 직접 검토할 수 있다.
    const finalUnderDecomposed = structureVersion === 'activity-subaction-v1' && sourceActivityIds.length > 0
        ? findUnderDecomposedActivityIds(readSteps(pipelineResult.object), sourceActivityIds)
        : [];
    let warnings = finalUnderDecomposed.length > 0
        ? [...pipelineResult.warnings, `Sub Action이 1개뿐인 Activity가 ${finalUnderDecomposed.length}개 있습니다 (${finalUnderDecomposed.join(', ')}). 기본 기대치는 Activity당 2~3개입니다 — 해당 Activity가 실제로 하나의 통합 행동인지 검토해 주세요.`]
        : pipelineResult.warnings;
    // authoringReport already reflects the final object here — either the single check made
    // above when no repair round ran, or the post-repair recheck inside that round.
    if (authoringReport && authoringReport.warningIssues.length > 0) {
        warnings = [...warnings, ...formatSopNodeQualityIssues(authoringReport.warningIssues)];
    }
    return { ok: true, object: pipelineResult.object, warnings };
}
