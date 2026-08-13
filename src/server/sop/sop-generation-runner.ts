import { NextResponse } from 'next/server';
import { runSopValidationPipeline } from '@/lib/sop-generation-pipeline';
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

type GeneratedStep = {
    id: string;
    terminalType?: 'start' | 'end';
    sourceActivityIds?: string[];
    subActionOrder?: number;
    subActionOrigin?: 'activity-derived' | 'context-derived';
    subActionOriginRationale?: string;
    agentizationSuggestion?: { type: string; rationale: string };
};

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
}): Promise<SopGenerationRunResult> {
    const { object, prompt, sopRequest, generateRepair } = params;
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
    const coverage = checkCoverage(readSteps(pipelineResult.object), sourceActivityIds, structureVersion);
    const missingSuggestions = structureVersion === 'activity-subaction-v1' ? findMissingSuggestionStepIds(readSteps(pipelineResult.object)) : [];
    const invalidOrigins = structureVersion === 'activity-subaction-v1' ? findInvalidOriginStepIds(readSteps(pipelineResult.object)) : [];
    const needsCoverageRepair = sourceActivityIds.length > 0 && (!coverage.valid || missingSuggestions.length > 0 || invalidOrigins.length > 0);
    if (needsCoverageRepair) {
        const suggestionGuidance = missingSuggestions.length
            ? `\nAgent화 제안(agentizationSuggestion)이 누락된 단계: ${missingSuggestions.join(', ')} — 모든 비-terminal 단계에 type과 rationale을 채워 넣으세요.`
            : '';
        const originGuidance = invalidOrigins.length
            ? `\nSub Action 출처가 없거나 불완전한 단계: ${invalidOrigins.join(', ')} — 모든 비-terminal 단계에 subActionOrigin을 넣고, context-derived에는 구체적인 subActionOriginRationale을 추가하세요.`
            : '';
        const repairGuidance = structureVersion === 'activity-subaction-v1'
            ? `${formatCoverageErrors(coverage).join('\n')}\n각 업무 단계(시작/종료 제외)는 정확히 1개의 sourceActivityIds를 가져야 하며, 같은 Activity 안에서 subActionOrder가 겹치면 안 됩니다. 선택된 모든 Activity ID를 빠짐없이 한 번 이상 Sub Action으로 반영하세요.${suggestionGuidance}${originGuidance}`
            : `${formatCoverageErrors(coverage).join('\n')}\n각 업무 단계의 sourceActivityIds를 수정하고, 선택된 모든 Activity ID를 빠짐없이 한 번 이상 반영하세요.`;
        try {
            const repaired = await generateRepair(`${prompt}\n\n## Activity 연결 보정\n${repairGuidance}`);
            pipelineResult = await runSopValidationPipeline(repaired, prompt, generateRepair, sopConstraints);
        } catch {
            // The final validation below returns a 400 with the actionable coverage issue.
        }
        if (!pipelineResult.ok) {
            return { ok: false, response: NextResponse.json({ error: pipelineResult.error, issues: pipelineResult.issues }, { status: 400 }) };
        }
        const repairedCoverage = checkCoverage(readSteps(pipelineResult.object), sourceActivityIds, structureVersion);
        const repairedMissingSuggestions = structureVersion === 'activity-subaction-v1' ? findMissingSuggestionStepIds(readSteps(pipelineResult.object)) : [];
        const repairedInvalidOrigins = structureVersion === 'activity-subaction-v1' ? findInvalidOriginStepIds(readSteps(pipelineResult.object)) : [];
        if (!repairedCoverage.valid || repairedMissingSuggestions.length > 0 || repairedInvalidOrigins.length > 0) {
            const suggestionError = repairedMissingSuggestions.length ? ` / Agent화 제안 누락 단계: ${repairedMissingSuggestions.join(', ')}` : '';
            const originError = repairedInvalidOrigins.length ? ` / Sub Action 출처 누락·불완전 단계: ${repairedInvalidOrigins.join(', ')}` : '';
            return {
                ok: false,
                response: NextResponse.json({ error: `Task Library Activity 반영 검증에 실패했습니다: ${formatCoverageErrors(repairedCoverage).join(' / ')}${suggestionError}${originError}` }, { status: 400 }),
            };
        }
    }
    return { ok: true, object: pipelineResult.object, warnings: pipelineResult.warnings };
}
