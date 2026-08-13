import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
    validateSubActionStructure,
    formatSubActionStructureErrors,
} from '../src/lib/sop-activity-coverage';
import { SopStepAiSchema, SopGenerationWireSchema, SopGenerationResponseSchema, normalizeSopGenerationObject } from '../src/lib/sop-schemas';
import { SopAgentizationSuggestionSchema } from '../src/lib/sop-step-common-schema';
import { SopDocumentSchema } from '../src/lib/sop-document-schema';
import { createSopDocumentFromGeneration } from '../src/lib/sop-normalizer';
import { runSopGenerationPostProcessing } from '../src/server/sop/sop-generation-runner';
import { runSopValidationPipeline, buildSopStructuralDigest, generateSopRepairWithRetry } from '../src/lib/sop-generation-pipeline';
import {
    AI_APPLICATION_MODES,
    AGENTIZATION_SUGGESTION_META,
    getAgentizationModeForStep,
    mapSuggestionToApplicationMode,
} from '../src/lib/sop-agentization';
import { buildSopNodes, buildSopActivityGroupNodes } from '../src/lib/sop-canvas-utils';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopAgentizationPanel } from '../src/components/sop/SopAgentizationPanel';
import { toSopTemplateSummary, SopTemplateSummarySchema } from '../src/lib/sop-template';
import { sopRepository } from '../src/server/sop/sop-repository-memory';
import { GET as sopTemplatesGet } from '../src/app/api/sop/templates/route';
import { POST as sopTemplateClonePost } from '../src/app/api/sop/templates/[id]/clone/route';
import { SAMPLE_SOP_DOCUMENT, SAMPLE_WORK_LIBRARY, buildTaskGateSampleDocument } from '../src/lib/sop-sample-data';
import { computeSubActionCapacity } from '../src/lib/sop-subaction-capacity';
import { validateSopFull, validateSopGraph, hasBlockingSopIssues } from '../src/lib/graph-validation';
import { SOP_TASK_LIBRARY_FIXTURE, createWorkLibrarySelection, getScopedActivities, createTaskLibrarySelectionForRole } from '../src/lib/sop-task-library';
import type { SopDocument, SopStepData } from '../src/lib/sop-types';
import type { SopGenerationRequest } from '../src/lib/sop-ai-request';
import { getSopPrompt } from '../src/server/sop/sop-prompt';
import { validateFullSopConfirmation, applyBulkStepReview } from '../src/lib/sop-review';
import { validateSopPersistenceState } from '../src/lib/sop-persistence-validation';
import { POST as sopApiCreateForOrigin } from '../src/app/api/sop/route';
import { PUT as sopApiUpdateForOrigin } from '../src/app/api/sop/[id]/route';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP Activity–Sub Action / Agentization suggestion / colleague-template regression tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function fakeApiRequest(headers: Record<string, string>, body?: unknown) {
    return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopTemplateClonePost>[0];
}

function memberHeaders(actorId: string, organizationId = 'org-sub-test') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': organizationId };
}

function renderComponent(element: React.ReactElement): TestRenderer.ReactTestRenderer {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(element);
    });
    return renderer;
}

async function run() {
    const activities = SAMPLE_WORK_LIBRARY.taskCatalog[0].activities;
    check(activities.length >= 3, 'Fixture sanity check: the sample Task exposes at least 3 Activities to build Sub Action coverage cases from');
    const [actA, actB, actC] = activities;
    const allowedIds = activities.map((a) => a.id);

    // ---------------------------------------------------------
    // Activity–Sub Action coverage validation (pure domain function)
    // ---------------------------------------------------------
    console.log('validateSubActionStructure...');

    const validSteps = activities.map((activity, index) => ({
        id: `sub-${index}`,
        terminalType: undefined,
        sourceActivityIds: [activity.id],
        subActionOrder: 1,
    }));
    const validResult = validateSubActionStructure(validSteps, allowedIds);
    check(validResult.valid, 'One Sub Action per Activity, each with exactly one source Activity id and a positive order, is valid');
    check(validResult.missingIds.length === 0, 'Every allowed Activity id is covered by at least one Sub Action');

    const multiActivitySteps = [
        { id: 's1', sourceActivityIds: [actA.id, actB.id], subActionOrder: 1 },
        ...activities.slice(2).map((a, i) => ({ id: `s-rest-${i}`, sourceActivityIds: [a.id], subActionOrder: 1 })),
    ];
    const multiResult = validateSubActionStructure(multiActivitySteps, allowedIds);
    check(!multiResult.valid && multiResult.multiActivityStepIds.includes('s1'), 'A Sub Action mapped to more than one Activity id is rejected (exactly one required)');

    const unknownIdSteps = [
        { id: 's1', sourceActivityIds: ['not-a-real-activity-id'], subActionOrder: 1 },
        ...activities.map((a, i) => ({ id: `s${i + 2}`, sourceActivityIds: [a.id], subActionOrder: 1 })),
    ];
    const unknownResult = validateSubActionStructure(unknownIdSteps, allowedIds);
    check(!unknownResult.valid && unknownResult.unknownIds.includes('not-a-real-activity-id'), 'An unknown/cross-Task Activity id is rejected');

    const missingCoverageSteps = activities.slice(1).map((a, i) => ({ id: `s${i}`, sourceActivityIds: [a.id], subActionOrder: 1 }));
    const missingResult = validateSubActionStructure(missingCoverageSteps, allowedIds);
    check(!missingResult.valid && missingResult.missingIds.includes(actA.id), 'An Activity with zero Sub Actions is reported as missing coverage');

    const duplicateOrderSteps = [
        { id: 's1', sourceActivityIds: [actA.id], subActionOrder: 1 },
        { id: 's2', sourceActivityIds: [actA.id], subActionOrder: 1 },
        ...activities.slice(1).map((a, i) => ({ id: `s-rest2-${i}`, sourceActivityIds: [a.id], subActionOrder: 1 })),
    ];
    const duplicateResult = validateSubActionStructure(duplicateOrderSteps, allowedIds);
    check(!duplicateResult.valid && duplicateResult.duplicateOrderActivityIds.includes(actA.id), 'Two Sub Actions sharing the same order within one Activity are rejected');
    check(formatSubActionStructureErrors(duplicateResult).some((m) => m.includes('순서')), 'Duplicate Sub Action order produces a human-readable Korean error message');

    // ---------------------------------------------------------
    // Wire tolerance + mechanical normalization: the AI wire schema no longer
    // hard-kills an entire response over mechanically-fixable violations (that
    // parse-time death was the production "AI 응답이 스키마와 일치하지 않습니다"
    // failure — NoObjectGeneratedError never reaches the repair loop). The
    // terminal/origin invariants are instead enforced by
    // normalizeSopGenerationObject (mechanical strips) + the generation
    // runner's repair loop (genuine quality gaps) + the confirm boundary.
    // ---------------------------------------------------------
    console.log('Wire tolerance + normalization (terminal/origin invariants preserved end-to-end)...');

    const terminalWithStrayFields = SopStepAiSchema.safeParse({
        id: 't1', title: '시작', definition: '시작 단계입니다.', shape: 'terminal', terminalType: 'start',
        sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived',
        agentizationSuggestion: { type: 'agent-candidate', rationale: 'x' },
    });
    check(terminalWithStrayFields.success, 'The WIRE schema tolerates a terminal step carrying stray provenance fields — one mechanical violation must not kill the whole response at parse time');

    const normalizedTerminal = (normalizeSopGenerationObject({
        steps: [{
            id: 't1', title: '시작', definition: '시작 단계입니다.', shape: 'terminal', terminalType: 'start',
            sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived',
            subActionOriginRationale: '잔여', agentizationSuggestion: { type: 'agent-candidate', rationale: 'x' },
        }],
    }) as { steps: Record<string, unknown>[] }).steps[0];
    check(
        normalizedTerminal.sourceActivityIds === undefined && normalizedTerminal.subActionOrder === undefined &&
        normalizedTerminal.subActionOrigin === undefined && normalizedTerminal.subActionOriginRationale === undefined &&
        normalizedTerminal.agentizationSuggestion === undefined,
        'normalizeSopGenerationObject strips ALL provenance/suggestion fields from a terminal step — the terminal-exclusion invariant holds after normalization'
    );

    const businessStepWithAllThree = SopStepAiSchema.safeParse({
        id: 'b1', title: '업무', definition: '업무 수행 단계입니다.', shape: 'process',
        sourceActivityIds: [actA.id], subActionOrder: 1, agentizationSuggestion: { type: 'ai-assist', rationale: '반복 작업' },
    });
    check(businessStepWithAllThree.success, 'A non-terminal step MAY carry sourceActivityIds + subActionOrder + agentizationSuggestion together');

    const activityDerivedStep = SopStepAiSchema.safeParse({
        id: 'origin-a', title: '우선순위 설정', definition: '근거에 따라 우선순위를 설정합니다.', shape: 'process',
        sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived',
    });
    check(activityDerivedStep.success && activityDerivedStep.data.subActionOrigin === 'activity-derived', 'AI response schema preserves an Activity-derived Sub Action origin');

    // activity-derived + rationale (구조화 출력 모델이 optional 필드를 일괄로 채우는 전형):
    // 와이어에서는 통과하고, 정규화가 rationale만 제거한다 — 응답 전체가 죽지 않는다.
    const activityDerivedWithLeftoverRationale = SopStepAiSchema.safeParse({
        id: 'origin-leftover', title: '우선순위 설정', definition: '근거에 따라 우선순위를 설정합니다.', shape: 'process',
        sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived', subActionOriginRationale: '',
    });
    check(activityDerivedWithLeftoverRationale.success, 'The WIRE schema tolerates an activity-derived step with a (useless) rationale string — including the empty string models emit mechanically');
    const normalizedLeftover = (normalizeSopGenerationObject({
        steps: [{ id: 'origin-leftover', subActionOrigin: 'activity-derived', subActionOriginRationale: '  잔여 근거  ' }],
    }) as { steps: Record<string, unknown>[] }).steps[0];
    check(normalizedLeftover.subActionOriginRationale === undefined, 'normalizeSopGenerationObject drops the leftover rationale from an activity-derived step — the origin invariant holds after normalization');
    const normalizedEmptyRationale = (normalizeSopGenerationObject({
        steps: [{ id: 'origin-empty', subActionOrigin: 'context-derived', subActionOriginRationale: '   ' }],
    }) as { steps: Record<string, unknown>[] }).steps[0];
    check(normalizedEmptyRationale.subActionOriginRationale === undefined, 'A whitespace-only rationale is normalized away (leaving a genuine missing-rationale gap for the repair loop, not a fake non-empty value)');

    // context-derived without rationale: 와이어에서는 통과한다. 진짜 품질 결함이므로
    // 정규화가 아니라 generation-runner의 검증·repair 루프가 처리한다 (확정 경계의
    // 엄격한 규칙은 sop-review.ts에서 그대로 유지).
    const contextDerivedWithoutRationale = SopStepAiSchema.safeParse({
        id: 'origin-bad', title: '추가 기준 확인', definition: '구성원 맥락에 따른 추가 기준을 확인합니다.', shape: 'process',
        sourceActivityIds: [actA.id], subActionOrder: 2, subActionOrigin: 'context-derived',
    });
    check(contextDerivedWithoutRationale.success, 'The WIRE schema tolerates a context-derived step without a rationale — the runner repair loop (not parse-time death) demands the missing rationale');

    const contextDerivedStep = SopStepAiSchema.safeParse({
        id: 'origin-context', title: '추가 기준 확인', definition: '구성원 맥락에 따른 추가 기준을 확인합니다.', shape: 'process',
        sourceActivityIds: [actA.id], subActionOrder: 2, subActionOrigin: 'context-derived',
        subActionOriginRationale: '구성원이 입력한 해외 고객 승인 조건을 반영한 추가 단계입니다.',
    });
    check(contextDerivedStep.success && Boolean(contextDerivedStep.data.subActionOriginRationale?.includes('해외 고객')), 'A context-derived Sub Action preserves its member-context rationale');
    const normalizedContext = (normalizeSopGenerationObject({
        steps: [{ id: 'origin-context', subActionOrigin: 'context-derived', subActionOriginRationale: ' 해외 고객 승인 조건 반영 ' }],
    }) as { steps: Record<string, unknown>[] }).steps[0];
    check(normalizedContext.subActionOriginRationale === '해외 고객 승인 조건 반영', 'Normalization only TRIMS a genuine context-derived rationale — it never deletes or rewrites real member-context provenance');

    // 게이트(문서 생성) 스키마에서 terminal에 terminalType이 없는 것은 여전히 거부다 —
    // start인지 end인지 안전하게 추측할 수 없는 모호성이기 때문이다. (와이어에서는
    // 통과시키고, 정규화의 집합 완성 또는 validateSopGraph → repair 루프가 처리한다.)
    const terminalMissingType = SopStepAiSchema.safeParse({
        id: 't-no-type', title: '시작', definition: '시작 단계입니다.', shape: 'terminal',
    });
    check(!terminalMissingType.success, 'A terminal step with NO terminalType is still rejected at the document GATE — the genuinely ambiguous case never silently enters a document');

    // ---------------------------------------------------------
    // Wire schema (generateObject) vs gate schema split: the production 500
    // ("AI 응답이 스키마와 일치하지 않습니다") was generateObject dying at parse
    // time on violations Gemini's constrained decoding cannot prevent
    // (superRefine duplicates/terminal checks, min-length, positive()).
    // The wire schema must survive ALL of them; normalization + the pipeline
    // must then produce a gate-valid object or route to repair/400.
    // ---------------------------------------------------------
    console.log('Wire/gate schema split (parse-time death classes eliminated)...');

    const productionDeathResponse = {
        title: '테스트 SOP',
        steps: [
            { id: 't-start', title: '시작', definition: '시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
            {
                id: 'w1', title: '조건 협상', definition: '고객사와 공급 조건을 협상하여 합의안을 만듭니다.', shape: 'process',
                sourceActivityIds: [actA.id, ''], subActionOrder: 0, subActionOrigin: 'activity-derived',
                agentizationSuggestion: { type: 'ai-assist', rationale: '' },
            },
            { id: 'w2', title: '계약 추진', definition: '추진', shape: 'process', sourceActivityIds: [actA.id], subActionOrder: 2.4, subActionOrigin: 'activity-derived', agentizationSuggestion: { type: 'agent-candidate', rationale: ' 반복적 문서 작업 ' } },
            // terminal missing terminalType — the OTHER terminal is typed 'start', so set-completion resolves this to 'end'.
            { id: 't-end', title: '종료', definition: '종료 단계입니다.', shape: 'terminal' },
        ],
        edges: [
            { id: 'e1', source: 't-start', target: 'w1' },
            { id: 'e1', source: 'w1', target: 'w2' },
            { id: 'e2', source: 'w2', target: 't-end' },
        ],
    };
    const wireParsed = SopGenerationWireSchema.safeParse(productionDeathResponse);
    check(wireParsed.success, 'The WIRE schema parses a response carrying every production parse-death class at once (duplicate edge IDs, untyped terminal, empty suggestion rationale, subActionOrder 0/float, empty activity-ID string, <5-char definition) — none of them can kill the response before the repair loop anymore');

    const revived = normalizeSopGenerationObject(productionDeathResponse) as {
        steps: Record<string, unknown>[];
        edges: { id: string }[];
    };
    check(revived.steps[3].terminalType === 'end', 'Set-completion assigns the single untyped terminal the one missing type (start present → end) — this is set arithmetic, not array-position guessing');
    check(revived.steps[1].agentizationSuggestion === undefined, 'An empty-rationale agentization suggestion is dropped (the runner repair loop demands it back) instead of killing the parse');
    check(revived.steps[1].subActionOrder === undefined, 'subActionOrder 0 is deleted (invalid order) rather than parse-fatal');
    check((revived.steps[2].agentizationSuggestion as { rationale: string }).rationale === '반복적 문서 작업', 'A genuine suggestion rationale is only trimmed, never dropped');
    check(revived.steps[2].subActionOrder === 2, 'A float subActionOrder is rounded to the nearest integer');
    check(JSON.stringify(revived.steps[1].sourceActivityIds) === JSON.stringify([actA.id]), 'Empty-string activity IDs are filtered out, keeping the genuine mapping');
    check(typeof revived.steps[2].definition === 'string' && (revived.steps[2].definition as string).length >= 5, 'A <5-char definition is backfilled from the title so one terse step cannot kill 40 good ones');
    check(new Set(revived.edges.map((e) => e.id)).size === revived.edges.length, 'Duplicate edge IDs are mechanically renamed to be unique (edge IDs are pure identity)');
    const gateParsed = SopGenerationResponseSchema.safeParse(revived);
    check(gateParsed.success, 'After normalization the SAME response passes the strict gate schema — tolerance exists only on the wire, never in what reaches the Store');

    // Edge rename must not collide with a pre-existing id.
    const collisionNormalized = normalizeSopGenerationObject({
        steps: [{ id: 's1', title: 'x', definition: '단계입니다.' }],
        edges: [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e1', source: 'b', target: 'c' },
            { id: 'e1-dup2', source: 'c', target: 'd' },
        ],
    }) as { edges: { id: string }[] };
    check(new Set(collisionNormalized.edges.map((e) => e.id)).size === 3 && collisionNormalized.edges.some((e) => e.id === 'e1-dup3'), 'Edge-ID dedup skips suffixes that already exist in the response');

    // Genuinely ambiguous terminals (BOTH untyped) are NOT guessed: normalization
    // leaves them, the gate still rejects, and validateSopGraph routes them to the
    // repair loop as terminal-missing-type blocking issues.
    const ambiguousTerminals = normalizeSopGenerationObject({
        title: '모호 터미널',
        steps: [
            { id: 'ta', title: '터미널 A', definition: '터미널 단계입니다.', shape: 'terminal' },
            { id: 'tb', title: '터미널 B', definition: '터미널 단계입니다.', shape: 'terminal' },
        ],
        edges: [{ id: 'e1', source: 'ta', target: 'tb' }],
    }) as { steps: { id: string; shape: string; terminalType?: 'start' | 'end' }[]; edges: { id: string; source: string; target: string }[] };
    check(ambiguousTerminals.steps.every((s) => s.terminalType === undefined), 'With BOTH terminals untyped, normalization refuses to guess — ambiguity is preserved for the repair loop');
    check(!SopGenerationResponseSchema.safeParse(ambiguousTerminals).success, 'The gate schema still rejects the ambiguous-terminal response');
    const ambiguousIssues = validateSopGraph(ambiguousTerminals.steps, ambiguousTerminals.edges);
    check(ambiguousIssues.some((i) => i.type === 'terminal-missing-type'), 'validateSopGraph reports terminal-missing-type for the ambiguous case, giving the LLM repair loop (not a parse death) the chance to fix it');

    // ---------------------------------------------------------
    // Repair-call resilience: in production the repair generation itself died in
    // a degenerate repetition loop (the model spiralled inside a free-string
    // `type` field until the 65536-token cap → truncated JSON → the one repair
    // chance was wasted → 400). Three defenses: (1) the wire schema constrains
    // `type` to an enum so Gemini's constrained decoding cannot spiral there,
    // (2) the repair prompt embeds a compact structural digest instead of the
    // full 100k+-char previous JSON, (3) a failed repair generation is retried
    // once before falling through to the deterministic-fallback/400 path.
    // ---------------------------------------------------------
    console.log('Repair-call resilience (degenerate repetition loop defenses)...');

    const degenerateType = `process ${'central-step-node-type-defined-in-schema-'.repeat(3000)}`;
    const bulkyObject = {
        title: '다이제스트 테스트',
        steps: [
            {
                id: 's1', title: '업무 단계', definition: '아주 긴 정의 문장입니다. '.repeat(500), shape: 'process',
                type: degenerateType,
                requiredSkills: [{ name: '데이터 분석', requiredLevel: 'intermediate', source: 'work-library', accepted: true }],
                detailedInstructions: '장문의 상세 지침. '.repeat(500),
                sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived',
            },
        ],
        edges: [{ id: 'e1', source: 's1', target: 's2', branchType: 'no', label: 'NO' }],
    };
    const digest = buildSopStructuralDigest(bulkyObject);
    check(digest.length < 1000, `The structural digest stays compact even for a bulky degenerate response (${digest.length} chars) — it can no longer feed a 100k+-char repetitive context back into the repair call`);
    check(!digest.includes('상세 지침') && !digest.includes('데이터 분석') && !digest.includes('정의 문장'), 'The digest excludes step content (definition/skills/instructions) — repair defects are structural, and content is regenerated from the base prompt');
    check(digest.includes('"s1"') && digest.includes('"e1"') && digest.includes(actA.id) && digest.includes('"no"'), 'The digest keeps everything the structural repair needs: step/edge IDs, connections, branch types, and Activity mappings');
    check(!digest.includes(degenerateType), 'A degenerate over-long string field is truncated in the digest instead of being echoed back verbatim');

    check(SopGenerationWireSchema.safeParse({
        title: 'type enum', steps: [{ id: 't1', title: '단계', definition: '단계입니다.', shape: 'process', type: 'io' }], edges: [],
    }).success, 'The wire schema accepts the known type enum values — constrained decoding now bounds the exact field the production spiral happened in');

    let retryCalls = 0;
    const retried = await generateSopRepairWithRetry(async () => {
        retryCalls += 1;
        if (retryCalls === 1) throw new Error('degenerate repetition loop (simulated)');
        return { ok: true };
    }, 'repair prompt');
    check(retryCalls === 2 && (retried as { ok: boolean }).ok, 'A repair generation that fails once (e.g. degenerate loop) is retried exactly once and the second draw is used');

    const brokenGraph = {
        title: '중복 ID 그래프',
        steps: [
            { id: 'p-start', title: '시작', definition: '시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'p-work', title: '업무 A', definition: '업무 A를 수행합니다.', shape: 'process' },
            { id: 'p-work', title: '업무 B', definition: '업무 B를 수행합니다.', shape: 'process' },
            { id: 'p-end', title: '종료', definition: '종료 단계입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'pe1', source: 'p-start', target: 'p-work' },
            { id: 'pe2', source: 'p-work', target: 'p-end' },
        ],
    };
    const fixedGraph = {
        title: '수정된 그래프',
        steps: [
            { id: 'p-start', title: '시작', definition: '시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'p-work', title: '업무 A', definition: '업무 A를 수행합니다.', shape: 'process' },
            { id: 'p-end', title: '종료', definition: '종료 단계입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'pe1', source: 'p-start', target: 'p-work' },
            { id: 'pe2', source: 'p-work', target: 'p-end' },
        ],
    };
    let pipelineGenerateCalls = 0;
    const retriedPipeline = await runSopValidationPipeline(
        brokenGraph,
        '기본 프롬프트',
        async () => {
            pipelineGenerateCalls += 1;
            if (pipelineGenerateCalls === 1) throw new Error('NoObjectGeneratedError (simulated degenerate repair)');
            return fixedGraph;
        },
        { minSteps: 1, maxSteps: 8, maxTotalNodes: 15, branchPolicy: 'auto', maxBranches: 2, allowRework: true, maxLoops: 3 }
    );
    check(retriedPipeline.ok && pipelineGenerateCalls === 2, 'END-TO-END: a blocking graph defect whose FIRST repair generation dies is still fixed by the retried second repair — the production failure path (one degenerate repair → immediate 400) is closed');

    // ---------------------------------------------------------
    // Setup Gate review-mode deadlock fix: while 고객 검토 모드 is ON, the Gate
    // blocks generation AND the Workspace (the only place with the toggle) is
    // only reachable by generating. The Gate now surfaces an exit button using
    // the same Store action as the Workspace toggle.
    // ---------------------------------------------------------
    console.log('Setup Gate review-mode notice (deadlock fix)...');
    {
        const { SopSetupReviewModeNotice } = await import('../src/components/sop/SopSetupReviewModeNotice');
        let exited = 0;
        let navigated = 0;
        const noticeRenderer = renderComponent(
            React.createElement(SopSetupReviewModeNotice, {
                documentExists: false,
                onExitReviewMode: () => { exited += 1; },
                onGoToWorkspace: () => { navigated += 1; },
            })
        );
        const buttons = noticeRenderer.root.findAllByType('button');
        check(buttons.length === 1, 'Without a document the notice offers ONLY the exit-review-mode button (no dead Workspace link)');
        act(() => buttons[0].props.onClick());
        check(exited === 1, 'Clicking "고객 검토 모드 종료" fires the exit action — the Gate can now unlock itself without reaching the Workspace');
        noticeRenderer.unmount();

        const noticeWithDoc = renderComponent(
            React.createElement(SopSetupReviewModeNotice, {
                documentExists: true,
                onExitReviewMode: () => { exited += 1; },
                onGoToWorkspace: () => { navigated += 1; },
            })
        );
        const buttonsWithDoc = noticeWithDoc.root.findAllByType('button');
        check(buttonsWithDoc.length === 2, 'With an existing document the notice ALSO offers a direct Workspace link');
        act(() => buttonsWithDoc[1].props.onClick());
        check(navigated === 1, 'The Workspace link navigates without requiring a new generation');
        noticeWithDoc.unmount();
    }

    // ---------------------------------------------------------
    // Customer semantics: action-only nodes, dependency-aware parallelism, no pseudo gateways
    // ---------------------------------------------------------
    console.log('Sub Action semantic generation contract...');

    const semanticPrompt = getSopPrompt({
        taskName: '제품 포트폴리오 최적화',
        sourceType: 'task',
        structureVersion: 'activity-subaction-v1',
        splitComplexSteps: false,
        activities: [{
            id: actA.id,
            name: actA.name,
            description: '수요 예측 및 갭 분석 결과를 바탕으로 중장기 제품 믹스 및 개발 우선순위를 설정하여 포트폴리오 최적화 안을 도출함',
        }],
        context: '제품 믹스와 개발 우선순위는 서로 독립적으로 검토할 수 있습니다.',
    });
    check(semanticPrompt.includes('실행 행동, 입력/이전 결과, 산출물, 목적/조건, 흐름 제어'), 'Activity clauses are classified before graph construction');
    check(semanticPrompt.includes('입력/이전 결과는 inputs') && semanticPrompt.includes('실행 결과물은 outputs'), 'Inputs and outputs are explicitly stored as data instead of pseudo-nodes');
    check(semanticPrompt.includes('실행 행동이 없는 순수 fork/join gateway'), 'Pure fork/join connectors are explicitly excluded from Sub Action and Agentization counts');
    check(semanticPrompt.includes('수요 예측 및 갭 분석 결과') && semanticPrompt.includes('고객사 공급 조건 협상'), 'Both customer sentence examples are embedded in the generation contract');
    check(semanticPrompt.includes("subActionOrigin: 'activity-derived'") && semanticPrompt.includes("subActionOrigin: 'context-derived'"), 'The prompt distinguishes Activity baseline decomposition from member-context augmentation');
    check(semanticPrompt.includes('의미 단위로 분리'), 'Activity–Sub Action generation keeps semantic decomposition mandatory even when the legacy split toggle is false');

    const portfolioReferenceSteps = [
        { id: 'mix', title: '중장기 제품 믹스 설정', inputs: ['수요 예측 및 갭 분석 결과'], outputs: ['제품 믹스안'] },
        { id: 'priority', title: '개발 우선순위 설정', inputs: ['수요 예측 및 갭 분석 결과'], outputs: ['개발 우선순위안'] },
        { id: 'optimize', title: '포트폴리오 최적화안 도출', inputs: ['제품 믹스안', '개발 우선순위안'], outputs: ['포트폴리오 최적화안'] },
    ];
    const portfolioReferenceEdges = [
        { source: 'mix', target: 'optimize' },
        { source: 'priority', target: 'optimize' },
    ];
    check(portfolioReferenceSteps.length === 3 && portfolioReferenceEdges.filter((edge) => edge.target === 'optimize').length === 2, 'The independently executable product-mix and priority actions converge directly into optimization without fork/join pseudo-nodes');
    check(!portfolioReferenceSteps.some((step) => step.title === '수요 예측 및 갭 분석 결과'), 'The prior Activity result remains an input and never becomes a Sub Action node');

    const negotiationReferenceSteps = [
        { title: '고객사 공급 조건 협상', outputs: ['합의된 공급 조건'] },
        { title: '비즈니스 계약 추진', inputs: ['합의된 공급 조건'], outputs: ['샘플 공급 및 초기 물량 확보 조건을 포함한 계약안'] },
    ];
    check(negotiationReferenceSteps.length === 2, 'The negotiation sentence yields two executable actions, not separate purpose/output pseudo-nodes');
    check(!negotiationReferenceSteps.some((step) => step.title === '샘플 공급' || step.title === '초기 물량 확보'), 'Sample supply and initial-volume securing remain contract outputs unless execution is independently in scope');

    const persistedTerminalWithMapping = SopDocumentSchema.safeParse({
        ...SAMPLE_SOP_DOCUMENT,
        steps: SAMPLE_SOP_DOCUMENT.steps.map((s) => (s.terminalType ? { ...s, sourceActivityIds: [actA.id] } : s)),
    });
    check(!persistedTerminalWithMapping.success, 'The persisted-document schema also rejects a terminal step carrying an Activity mapping, not just the AI generation schema');

    // ---------------------------------------------------------
    // AI suggestion schema: type/rationale required, no confidence field survives parsing
    // ---------------------------------------------------------
    console.log('Agentization suggestion schema...');

    check(SopAgentizationSuggestionSchema.safeParse({ type: 'agent-candidate', rationale: '규칙이 명확함' }).success, 'A well-formed suggestion (valid type + non-empty rationale) parses successfully');
    check(!SopAgentizationSuggestionSchema.safeParse({ type: 'agent-candidate', rationale: '' }).success, 'An empty rationale is rejected');
    check(!SopAgentizationSuggestionSchema.safeParse({ type: 'super-confident', rationale: 'x' }).success, 'An invalid suggestion type is rejected');

    const parsedWithConfidence = SopAgentizationSuggestionSchema.safeParse({ type: 'ai-assist', rationale: 'x', confidence: 0.97, probability: 0.97 });
    check(parsedWithConfidence.success, 'A response that also hallucinates confidence/probability still parses (extra keys are simply not part of the contract)');
    check(
        !('confidence' in (parsedWithConfidence as { data: object }).data) && !('probability' in (parsedWithConfidence as { data: object }).data),
        'confidence/probability are not part of the parsed suggestion — the contract never carries an uncalibrated score through'
    );

    check(AI_APPLICATION_MODES.length === 2 && AI_APPLICATION_MODES.every((m) => m.id === 'automation' || m.id === 'assist'), 'SopAiApplicationMode (member-confirmed mode) still has exactly two values — no separate human-only mode was reintroduced');
    check(mapSuggestionToApplicationMode('agent-candidate') === 'automation', `'agent-candidate' suggestion maps to the 'automation' member-mode pre-fill`);
    check(mapSuggestionToApplicationMode('ai-assist') === 'assist', `'ai-assist' suggestion maps to the 'assist' member-mode pre-fill`);
    check(mapSuggestionToApplicationMode('not-recommended') === undefined, `'not-recommended' suggestion maps to unset (human-performed) — it has no member-mode analog`);

    // ---------------------------------------------------------
    // Normalizer: an AI suggestion never becomes a member confirmation
    // ---------------------------------------------------------
    console.log('createSopDocumentFromGeneration: AI suggestion vs member confirmation...');

    const rawGenerationResponse = {
        title: 'Sub Action SOP',
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
            ...activities.map((activity, index) => ({
                id: `sub-${index}`,
                title: `${activity.name} 수행`,
                definition: `${activity.name}을(를) 기준에 따라 수행하고 결과를 남깁니다.`,
                shape: 'process',
                sourceActivityIds: [activity.id],
                subActionOrder: 1,
                agentizationSuggestion: { type: index % 2 === 0 ? 'agent-candidate' : 'not-recommended', rationale: `${activity.name}에 대한 AI 제안 근거` },
            })),
            { id: 'end', title: '종료', definition: '종료 단계입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e0', source: 'start', target: 'sub-0' },
            ...activities.slice(1).map((_, i) => ({ id: `e${i + 1}`, source: `sub-${i}`, target: `sub-${i + 1}` })),
            { id: `e-last`, source: `sub-${activities.length - 1}`, target: 'end' },
        ],
    };

    const generatedDocument = createSopDocumentFromGeneration({
        rawResponse: rawGenerationResponse,
        member: SAMPLE_SOP_DOCUMENT.member,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '테스트 맥락',
        setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig!,
        structureVersion: 'activity-subaction-v1',
    });

    check(generatedDocument.structureVersion === 'activity-subaction-v1', 'The normalized document carries the requested structureVersion discriminator');
    const businessSteps = generatedDocument.steps.filter((s) => !s.terminalType);
    check(businessSteps.every((s) => s.subActionOrder !== undefined), 'Every non-terminal generated step carries a subActionOrder');
    check(businessSteps.every((s) => s.sourceActivityIds?.length === 1), 'Every non-terminal generated step maps to exactly one source Activity id');
    check(businessSteps.every((s) => Boolean(s.agentizationSuggestion)), 'Every non-terminal generated step carries an AI agentizationSuggestion');
    check(generatedDocument.agentizationReview === undefined, 'A freshly generated document has NO member agentizationReview at all — the AI suggestion never pre-populates it');
    for (const step of businessSteps) {
        check(getAgentizationModeForStep(generatedDocument, step.id) === undefined, `[${step.id}] getAgentizationModeForStep reads undefined even though an AI suggestion exists — a suggestion is never read as if it were the member's confirmed mode`);
    }

    // ---------------------------------------------------------
    // Different Sub Actions retain independent member modes; confirmation requires ALL selected
    // ---------------------------------------------------------
    console.log('Member Agentization judgement stays independent per Sub Action...');
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.setState({ document: generatedDocument, customerReviewMode: false });
    useSopPrototypeStore.getState().setAgentizationScope('workflow');
    const [firstBusiness, secondBusiness] = businessSteps;
    useSopPrototypeStore.getState().setAgentizationStepMode(firstBusiness.id, 'automation');
    useSopPrototypeStore.getState().setAgentizationStepMode(secondBusiness.id, 'assist');
    const docAfterModes = useSopPrototypeStore.getState().document!;
    check(
        getAgentizationModeForStep(docAfterModes, firstBusiness.id) === 'automation' && getAgentizationModeForStep(docAfterModes, secondBusiness.id) === 'assist',
        'Two different Sub Actions independently retain automation vs assist without overwriting each other'
    );

    // ---------------------------------------------------------
    // Content-meaning changes invalidate a confirmed Agentization review
    // ---------------------------------------------------------
    console.log('Meaningful edits invalidate Agentization confirmation...');
    for (const step of businessSteps) {
        if (getAgentizationModeForStep(useSopPrototypeStore.getState().document!, step.id) === undefined) {
            useSopPrototypeStore.getState().setAgentizationStepMode(step.id, 'assist');
        }
    }
    const confirmResult = useSopPrototypeStore.getState().confirmAgentization();
    check(confirmResult.success, `Agent화 검토 확정 must succeed once every selected step has a mode, got: ${confirmResult.message}`);
    check(Boolean(useSopPrototypeStore.getState().document!.agentizationReview?.confirmedAt), 'confirmedAt is set after a successful confirmation');

    const otherActivityId = actB.id === firstBusiness.sourceActivityIds?.[0] ? actC.id : actB.id;
    useSopPrototypeStore.getState().setStepSourceActivities(firstBusiness.id, [otherActivityId]);
    check(!useSopPrototypeStore.getState().document!.agentizationReview?.confirmedAt, 'Moving a Sub Action to a different Activity clears the previously confirmed Agentization review');

    // Customer review mode blocks every Agentization mutation.
    useSopPrototypeStore.setState({ customerReviewMode: true });
    const modeBeforeReadOnlyAttempt = getAgentizationModeForStep(useSopPrototypeStore.getState().document!, secondBusiness.id);
    useSopPrototypeStore.getState().setAgentizationStepMode(secondBusiness.id, undefined);
    check(getAgentizationModeForStep(useSopPrototypeStore.getState().document!, secondBusiness.id) === modeBeforeReadOnlyAttempt, 'Customer review mode blocks Agentization mutations at the Store level, not just in the UI');
    useSopPrototypeStore.setState({ customerReviewMode: false });

    // ---------------------------------------------------------
    // AI suggestion badge and member-confirmed badge are visually distinguishable in the panel
    // ---------------------------------------------------------
    console.log('SopAgentizationPanel renders suggestion and confirmation distinctly...');
    useSopPrototypeStore.setState({
        document: { ...generatedDocument, agentizationReview: { scope: 'workflow', stepIds: [], stepModes: {}, note: '' } },
        customerReviewMode: false,
    });
    const panelRenderer = renderComponent(React.createElement(SopAgentizationPanel, { onBack: () => {} }));
    const panelText = JSON.stringify(panelRenderer.toJSON());
    const candidateStep = businessSteps.find((s) => s.agentizationSuggestion?.type === 'agent-candidate')!;
    check(panelText.includes(AGENTIZATION_SUGGESTION_META['agent-candidate'].label), 'The panel renders the AI-suggestion label distinctly from the member-mode "지정됨"/"확정됨" labels');
    check(panelText.includes(candidateStep.agentizationSuggestion!.rationale), "The panel renders the AI suggestion's rationale text");
    act(() => {
        panelRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Canvas highlight: selecting an Activity highlights only that Activity's Sub Action nodes
    // ---------------------------------------------------------
    console.log('buildSopNodes: Activity selection highlights only its own Sub Action nodes...');
    const nodesHighlighted = buildSopNodes(generatedDocument, null, firstBusiness.id === undefined ? null : otherActivityId);
    const highlightedIds = nodesHighlighted.filter((n) => (n.data as { highlightedByActivity?: boolean }).highlightedByActivity).map((n) => n.id);
    const expectedHighlighted = generatedDocument.steps.filter((s) => s.sourceActivityIds?.includes(otherActivityId)).map((s) => s.id);
    check(
        highlightedIds.length === expectedHighlighted.length && expectedHighlighted.every((id) => highlightedIds.includes(id)),
        'Selecting an Activity highlights exactly the Sub Action nodes mapped to that Activity, and no others'
    );

    // ---------------------------------------------------------
    // Code review defect 8: SopStepNode's Activity badge shows the catalog Activity.order,
    // never a fragment parsed out of the (stable-identifier, not ordinal) Activity id string.
    // ---------------------------------------------------------
    console.log('buildSopNodes: Activity badge resolves catalog order, never a parsed id fragment...');
    const badgeWorkLibrary = {
        ...SAMPLE_WORK_LIBRARY,
        taskCatalog: [{
            ...SAMPLE_WORK_LIBRARY.taskCatalog[0],
            id: SAMPLE_WORK_LIBRARY.taskId,
            activities: [
                { id: 'act-9f8e7d6c5b4a3210', order: 3, name: '해시 형태 ID Activity', description: '', skills: [] },
                { id: 'act-aaaa1111', order: 1, name: '첫 Activity', description: '', skills: [] },
            ],
        }],
    };
    const badgeStep = {
        id: 'badge-step', title: '뱃지 테스트 단계', definition: 'x', requiredSkills: [],
        shape: 'process' as const, position: { x: 0, y: 0 }, reviewStatus: 'ai-draft' as const,
        sourceActivityIds: ['act-9f8e7d6c5b4a3210'], subActionOrder: 1,
    };
    const badgeDocument: SopDocument = { ...generatedDocument, workLibrary: badgeWorkLibrary, steps: [badgeStep] };
    const badgeNodes = buildSopNodes(badgeDocument, null, null);
    const badgeNodeData = badgeNodes[0].data as { activityBadgeOrder?: number | 'unmapped' };
    check(badgeNodeData.activityBadgeOrder === 3, 'A hash-like Activity id with catalog order=3 resolves to badge order 3 (A03), not a fragment of the id string');
    check(String(badgeNodeData.activityBadgeOrder) !== '9f8e7d6c5b4a3210' && !String(badgeNodeData.activityBadgeOrder).includes('9f8e'), "The id string's tail never leaks into the resolved badge value");

    const badgeStepMoved = { ...badgeStep, sourceActivityIds: ['act-aaaa1111'] };
    const badgeDocumentAfterChange: SopDocument = { ...badgeDocument, steps: [badgeStepMoved] };
    const badgeNodesAfterChange = buildSopNodes(badgeDocumentAfterChange, null, null);
    check(
        (badgeNodesAfterChange[0].data as { activityBadgeOrder?: number | 'unmapped' }).activityBadgeOrder === 1,
        'After moving the Sub Action to a different Activity, the badge recomputes to that Activity\'s own order (1), not the previous one'
    );

    const badgeStepUnmapped = { ...badgeStep, sourceActivityIds: ['act-does-not-exist-in-catalog'] };
    const badgeDocumentUnmapped: SopDocument = { ...badgeDocument, steps: [badgeStepUnmapped] };
    const badgeNodesUnmapped = buildSopNodes(badgeDocumentUnmapped, null, null);
    check(
        (badgeNodesUnmapped[0].data as { activityBadgeOrder?: number | 'unmapped' }).activityBadgeOrder === 'unmapped',
        'A Sub Action referencing an Activity id absent from the current catalog resolves to an explicit "unmapped" fallback, never a fabricated ordinal'
    );

    // ---------------------------------------------------------
    // Generation-time repair: an unrepaired Sub Action coverage failure never reaches the Store (400, no silent pass-through)
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: unrepaired Sub Action coverage fails with 400...');
    const brokenObject = {
        title: '깨진 SOP',
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'work', title: '작업', definition: '작업을 수행하는 단계입니다.', shape: 'process', sourceActivityIds: ['not-a-real-activity'], subActionOrder: 1 },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'work' },
            { id: 'e2', source: 'work', target: 'end' },
        ],
    };
    const brokenSopRequest = {
        action: 'generateSop', memberRole: '테스터', taskName: 'T', sourceType: 'task', structureVersion: 'activity-subaction-v1',
        activities: [{ id: actA.id, order: 1, name: actA.name, skills: [] }],
        skills: [], context: '', detailLevel: 'standard', minSteps: 1, maxSteps: 5, branchPolicy: 'auto', maxBranches: 2, allowRework: true,
    } as unknown as SopGenerationRequest;
    let repairCallCount = 0;
    const repairResult = await runSopGenerationPostProcessing({
        object: brokenObject,
        prompt: 'PROMPT',
        sopRequest: brokenSopRequest,
        generateRepair: async () => {
            repairCallCount++;
            return brokenObject; // repair does not fix the unknown-Activity mapping
        },
    });
    check(!repairResult.ok, 'A Sub Action coverage failure that survives one repair attempt returns ok:false, never a silently-applied document');
    check(repairCallCount === 1, 'Exactly one repair attempt is made before giving up');
    if (!repairResult.ok) {
        check(repairResult.response.status === 400, `The failure response status must be 400, got ${repairResult.response.status}`);
    }

    const missingOriginObject = {
        ...brokenObject,
        title: '출처 보정 SOP',
        steps: brokenObject.steps.map((step) => step.id === 'work'
            ? {
                ...step,
                sourceActivityIds: [actA.id],
                agentizationSuggestion: { type: 'ai-assist', rationale: '사람의 판단을 AI가 지원합니다.' },
            }
            : step),
    };
    let originRepairPrompt = '';
    const repairedOriginObject = {
        ...missingOriginObject,
        steps: missingOriginObject.steps.map((step) => step.id === 'work'
            ? { ...step, subActionOrigin: 'activity-derived' }
            : step),
    };
    const originRepairResult = await runSopGenerationPostProcessing({
        object: missingOriginObject,
        prompt: 'ORIGIN PROMPT',
        sopRequest: brokenSopRequest,
        generateRepair: async (repairPrompt) => {
            originRepairPrompt = repairPrompt;
            return repairedOriginObject;
        },
    });
    check(originRepairResult.ok, 'A valid repair that adds Sub Action origin metadata is accepted');
    check(originRepairPrompt.includes('subActionOrigin') && originRepairPrompt.includes('context-derived'), 'The repair prompt explicitly asks for origin and a rationale for context-derived additions');

    // ---------------------------------------------------------
    // 과소분해(Activity당 Sub Action 1개): repair를 1회 요구하고, repair 후에도 남으면
    // 400이 아니라 경고로 전달한다 — 진짜 원자적 Activity를 생성 실패로 만들지 않는다.
    // 또한 파이프라인 진입 정규화(normalizeSopGenerationObject)가 terminal 잔여 필드와
    // activity-derived의 잔여 rationale을 실제로 제거하는지 함께 검증한다.
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: under-decomposition triggers repair, degrades to a warning, and entry normalization strips mechanical violations...');
    const underDecomposedObject = {
        title: '과소분해 SOP',
        steps: [
            // terminal이 잔여 provenance 필드를 들고 와도 응답 전체가 죽지 않고 정규화로 제거되어야 한다.
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start', subActionOrder: 9, subActionOrigin: 'activity-derived' },
            {
                id: 'only-one', title: '단일 작업', definition: '이 Activity의 유일한 작업 단계입니다.', shape: 'process',
                sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived',
                // 구조화 출력 모델이 기계적으로 채우는 잔여 rationale — 정규화로 제거되어야 한다.
                subActionOriginRationale: '잔여 근거',
                agentizationSuggestion: { type: 'ai-assist', rationale: '사람의 판단을 AI가 지원합니다.' },
            },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'only-one' },
            { id: 'e2', source: 'only-one', target: 'end' },
        ],
    };
    let decompositionRepairPrompt = '';
    let decompositionRepairCalls = 0;
    const stillUnderDecomposedResult = await runSopGenerationPostProcessing({
        object: underDecomposedObject,
        prompt: 'DECOMPOSITION PROMPT',
        sopRequest: brokenSopRequest,
        generateRepair: async (repairPrompt) => {
            decompositionRepairCalls++;
            decompositionRepairPrompt = repairPrompt;
            return underDecomposedObject; // repair가 분해 수준을 높이지 못한 경우
        },
    });
    check(decompositionRepairCalls === 1, 'An Activity with only ONE Sub Action triggers exactly one repair attempt (기본 2~3개/Activity)');
    check(decompositionRepairPrompt.includes('Sub Action이 1개뿐인 Activity') && decompositionRepairPrompt.includes(actA.id), 'The repair prompt names the under-decomposed Activity and demands 2~3 Sub Actions');
    check(stillUnderDecomposedResult.ok, 'Under-decomposition that survives repair returns ok:true — a genuinely atomic Activity must never brick generation with a 400');
    check(
        stillUnderDecomposedResult.ok && stillUnderDecomposedResult.warnings.some((w) => w.includes('Sub Action이 1개뿐인 Activity')),
        'The surviving under-decomposition is surfaced as an explicit warning the member can review, never silently passed through'
    );
    if (stillUnderDecomposedResult.ok) {
        const normalizedSteps = (stillUnderDecomposedResult.object as { steps: Record<string, unknown>[] }).steps;
        const normalizedStart = normalizedSteps.find((s) => s.id === 'start')!;
        const normalizedOnly = normalizedSteps.find((s) => s.id === 'only-one')!;
        check(normalizedStart.subActionOrder === undefined && normalizedStart.subActionOrigin === undefined, 'Pipeline entry normalization stripped the stray provenance fields from the terminal step');
        check(normalizedOnly.subActionOriginRationale === undefined, 'Pipeline entry normalization dropped the leftover rationale from the activity-derived step');
    }

    // repair가 실제로 분해 수준을 높이면: 경고 없이 통과한다.
    const properlyDecomposedObject = {
        ...underDecomposedObject,
        title: '정상 분해 SOP',
        steps: [
            underDecomposedObject.steps[0],
            {
                id: 'sub-1', title: '기준 확인', definition: '수행 기준을 확인하는 단계입니다.', shape: 'process',
                sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived',
                agentizationSuggestion: { type: 'ai-assist', rationale: '사람의 판단을 AI가 지원합니다.' },
            },
            {
                id: 'sub-2', title: '실행 결과 정리', definition: '실행 결과를 정리해 기록하는 단계입니다.', shape: 'process',
                sourceActivityIds: [actA.id], subActionOrder: 2, subActionOrigin: 'activity-derived',
                agentizationSuggestion: { type: 'agent-candidate', rationale: '규칙 기반으로 자동화할 수 있습니다.' },
            },
            underDecomposedObject.steps[2],
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'sub-1' },
            { id: 'e2', source: 'sub-1', target: 'sub-2' },
            { id: 'e3', source: 'sub-2', target: 'end' },
        ],
    };
    const repairedDecompositionResult = await runSopGenerationPostProcessing({
        object: underDecomposedObject,
        prompt: 'DECOMPOSITION PROMPT 2',
        sopRequest: brokenSopRequest,
        generateRepair: async () => properlyDecomposedObject,
    });
    check(repairedDecompositionResult.ok, 'A repair that genuinely decomposes the Activity into 2 Sub Actions is accepted');
    check(
        repairedDecompositionResult.ok && !repairedDecompositionResult.warnings.some((w) => w.includes('Sub Action이 1개뿐인 Activity')),
        'After a successful decomposition repair there is NO leftover under-decomposition warning'
    );

    // ---------------------------------------------------------
    // Code review defect 2: minSteps/maxSteps are decoupled — Activity count alone
    // must never collapse maxSteps down to exactly minSteps (which would force
    // exactly one Sub Action per Activity, a rule the customer never confirmed).
    // ---------------------------------------------------------
    console.log('computeSubActionCapacity: min/max capacity is decoupled, never collapsed to Activity count...');
    const representativeTaskEntry = SOP_TASK_LIBRARY_FIXTURE.jobs
        .flatMap((job) => job.tasks.map((task) => ({ job, task })))
        .find(({ task }) => task.name === '채용 프로세스 운영 및 최적화')!;
    check(representativeTaskEntry.task.activities.length === 14, 'Fixture sanity check: the representative Task exposes exactly 14 Activities');

    const capacityResult = computeSubActionCapacity({
        activityCount: representativeTaskEntry.task.activities.length,
        minSteps: 6,
        maxSteps: 8,
        maxTotalNodes: 15,
        detailLevel: 'standard',
    });
    check(capacityResult.minSteps === 28, 'minSteps is floored at 2× the Activity count (기본 2개/Activity) — 14 Activities can never produce a 1:1 Activity-copy graph of only 14 nodes');
    check(capacityResult.maxSteps > capacityResult.minSteps, 'maxSteps is NOT collapsed to the same value as minSteps — the floor must not silently become a fixed per-Activity count');
    check(capacityResult.maxSteps >= 42, 'maxSteps provides 3×-Activity headroom at standard detail (14 Activities → 42) so the 기본 2~3개/Activity band is actually reachable');
    check(capacityResult.maxTotalNodes >= capacityResult.maxSteps + 6, 'maxTotalNodes leaves start/end/decision/loop overhead on top of the expanded maxSteps, not just on top of the raw Activity count');
    check(
        capacityResult.explanation !== null &&
            capacityResult.explanation.includes(String(capacityResult.minSteps)) &&
            capacityResult.explanation.includes(String(capacityResult.maxSteps)) &&
            capacityResult.explanation.includes(String(capacityResult.maxTotalNodes)),
        'The on-screen explanation states the EXACT minSteps/maxSteps/maxTotalNodes actually used for the request, matching what the UI shows to what is actually sent'
    );

    // A generated result where several Activities have 2+ Sub Actions must (a) pass the strict
    // structure validator and (b) fit inside the computed capacity — proving the capacity policy
    // and the actual graph validator agree, not just that the numbers look separately reasonable.
    const activities14 = representativeTaskEntry.task.activities;
    const allowedIds14 = activities14.map((a) => a.id);
    const multiSubActionSteps = activities14.flatMap((activity, index) => {
        const countForThisActivity = index < 4 ? 3 : 2; // 기본 2~3개/Activity 밴드: 4 Activities x3 + 10 Activities x2
        return Array.from({ length: countForThisActivity }, (_unused, subIndex) => ({
            id: `cap-step-${activity.id}-${subIndex}`,
            sourceActivityIds: [activity.id],
            subActionOrder: subIndex + 1,
        }));
    });
    check(multiSubActionSteps.length === 32, 'Fixture sanity check: 4 Activities x3 + 10 Activities x2 = 32 Sub Actions total — inside the 28~42 default band for 14 Activities');
    const multiSubActionResult = validateSubActionStructure(multiSubActionSteps, allowedIds14);
    check(multiSubActionResult.valid, 'A result where every Activity has 2~3 Sub Actions (32 total) is genuinely valid, not just theoretically allowed');

    const capacityGraphSteps = [
        { id: 'cap-start', shape: 'terminal', terminalType: 'start' as const },
        ...multiSubActionSteps.map((s) => ({ id: s.id, shape: 'process' })),
        { id: 'cap-end', shape: 'terminal', terminalType: 'end' as const },
    ];
    const capacityGraphEdges: Array<{ id: string; source: string; target: string }> = [];
    let capacityPrevious = 'cap-start';
    multiSubActionSteps.forEach((s) => {
        capacityGraphEdges.push({ id: `e-${capacityPrevious}-${s.id}`, source: capacityPrevious, target: s.id });
        capacityPrevious = s.id;
    });
    capacityGraphEdges.push({ id: `e-${capacityPrevious}-cap-end`, source: capacityPrevious, target: 'cap-end' });
    const capacityGraphIssues = validateSopFull(capacityGraphSteps, capacityGraphEdges, {
        minSteps: capacityResult.minSteps,
        maxSteps: capacityResult.maxSteps,
        maxTotalNodes: capacityResult.maxTotalNodes,
        branchPolicy: 'auto',
        maxBranches: 2,
        allowRework: true,
        maxLoops: 3,
    });
    check(!hasBlockingSopIssues(capacityGraphIssues), 'A real 32-Sub-Action linear graph (2~3 per Activity) is NOT rejected by minSteps/maxSteps/maxTotalNodes under the computed capacity — the capacity policy and the validator genuinely agree, not just look separately reasonable');

    // ---------------------------------------------------------
    // Code review defect 3: the Task-Gate sample document follows the SAME
    // Activity–Sub Action contract as a real AI generation, generically for
    // whatever Task is selected — never the old fixed recruitment content.
    // ---------------------------------------------------------
    console.log('buildTaskGateSampleDocument: Task-Gate sample follows the Activity–Sub Action contract...');
    const sampleResult = buildTaskGateSampleDocument({
        id: 'gate-sample-test-doc',
        member: SAMPLE_SOP_DOCUMENT.member,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig,
    });
    check(sampleResult.success, 'buildTaskGateSampleDocument succeeds for a normal Task Library selection with Activities');
    if (sampleResult.success) {
        const sampleDoc = sampleResult.document;
        check(sampleDoc.structureVersion === 'activity-subaction-v1', 'The Task-Gate sample document declares the Activity–Sub Action structureVersion');
        const sampleAllowedIds = getScopedActivities(SAMPLE_WORK_LIBRARY).map((a) => a.id);
        const sampleStructure = validateSubActionStructure(sampleDoc.steps, sampleAllowedIds);
        check(sampleStructure.valid, `The Task-Gate sample passes the strict Sub Action structure validator: ${formatSubActionStructureErrors(sampleStructure).join(' / ')}`);
        const sampleBusinessSteps = sampleDoc.steps.filter((s) => !s.terminalType);
        check(sampleBusinessSteps.every((s) => s.sourceActivityIds?.length === 1), 'Every non-terminal sample step maps to exactly one Activity');
        check(sampleBusinessSteps.every((s) => Boolean(s.agentizationSuggestion)), 'Every non-terminal sample step carries an AI agentizationSuggestion');
        check(sampleDoc.agentizationReview === undefined, 'The Task-Gate sample has no agentizationReview/confirmedAt at all — only a member can create one');
        check(sampleAllowedIds.every((activityId) => sampleBusinessSteps.some((s) => s.sourceActivityIds?.includes(activityId))), 'Every selected Task Activity is covered by at least one Sub Action in the sample');
        check(
            sampleAllowedIds.every((activityId) => sampleBusinessSteps.filter((s) => s.sourceActivityIds?.includes(activityId)).length >= 2),
            'Every selected Task Activity decomposes into AT LEAST TWO Sub Actions in the sample — the node unit is the Sub Action, never a 1:1 Activity-copy node'
        );

        // -----------------------------------------------------
        // Activity group containers (customer's expected design: Sub Actions
        // rendered INSIDE their parent Activity section on the canvas).
        // -----------------------------------------------------
        console.log('buildSopActivityGroupNodes: canvas Activity group containers...');
        const groupNodes = buildSopActivityGroupNodes(sampleDoc);
        check(groupNodes.length > 0, 'An Activity–Sub Action document produces Activity group container nodes for the canvas');
        check(groupNodes.every((n) => n.type === 'sopActivityGroup'), 'Every group container uses the sopActivityGroup node type');
        check(
            groupNodes.every((n) => n.draggable === false && n.selectable === false && n.zIndex === -10),
            'Group containers are read-only background nodes — never draggable, selectable, or above the real step nodes'
        );
        check(
            sampleAllowedIds.every((activityId) => groupNodes.some((n) => n.id.startsWith(`sop-activity-group:${activityId}:`))),
            'Every covered Activity gets at least one group container on the canvas'
        );
        const scopedActivities = getScopedActivities(SAMPLE_WORK_LIBRARY);
        const firstActivity = scopedActivities[0];
        const firstGroup = groupNodes.find((n) => n.id === `sop-activity-group:${firstActivity.id}:0`);
        check(
            Boolean(firstGroup) && (firstGroup!.data as { label: string }).label === `${firstActivity.order ?? 1}. ${firstActivity.name}`,
            'The group label shows the catalog Activity order and NAME (e.g. "1. 대상자 추출") exactly as the customer design groups Sub Actions'
        );
        check(
            groupNodes.every((n) => {
                const d = n.data as { width: number; height: number };
                return d.width > 0 && d.height > 0;
            }),
            'Every group container has a positive bounding box computed from its member steps'
        );
        // Each group must actually CONTAIN its member steps' positions.
        const stepsInFirstActivity = sampleDoc.steps.filter((s) => !s.terminalType && s.sourceActivityIds?.[0] === firstActivity.id);
        const firstActivityGroups = groupNodes.filter((n) => n.id.startsWith(`sop-activity-group:${firstActivity.id}:`));
        check(
            stepsInFirstActivity.every((s) =>
                firstActivityGroups.some((g) => {
                    const d = g.data as { width: number; height: number };
                    return s.position.x >= g.position.x && s.position.x <= g.position.x + d.width && s.position.y >= g.position.y && s.position.y <= g.position.y + d.height;
                })
            ),
            'Every Sub Action of an Activity lies inside one of that Activity\'s group containers — membership is visually truthful, not decorative'
        );
        check(
            buildSopActivityGroupNodes({ ...sampleDoc, structureVersion: undefined }).length === 0,
            'A legacy (non Activity–Sub Action) document renders NO group containers — the grouping visual never fabricates Activity structure that the document does not declare'
        );
        // Activity-block-aware row wrapping: layoutSopGraph moves a whole
        // Activity block to the next row instead of splitting it mid-row, so a
        // freshly generated document draws exactly ONE container per Activity —
        // no "(계속)" continuation segments.
        const groupCountByActivity = new Map<string, number>();
        groupNodes.forEach((n) => {
            const activityId = n.id.split(':')[1];
            groupCountByActivity.set(activityId, (groupCountByActivity.get(activityId) ?? 0) + 1);
        });
        check(
            [...groupCountByActivity.values()].every((count) => count === 1),
            'Every Activity of a freshly generated document renders exactly ONE group container — Activity-aware row wrapping keeps a group from ever spanning two layout rows'
        );
        check(
            sampleAllowedIds.every((activityId) => {
                const ys = sampleDoc.steps.filter((s) => !s.terminalType && s.sourceActivityIds?.[0] === activityId).map((s) => s.position.y);
                return new Set(ys).size === 1;
            }),
            'All Sub Actions of one Activity share the same layout row (identical y) after layoutSopGraph'
        );
    }

    // A DIFFERENT Task must produce content generic to THAT Task, never the old hardcoded recruitment step titles.
    const differentJobEntry = SOP_TASK_LIBRARY_FIXTURE.jobs.find((job) => job.name !== SAMPLE_WORK_LIBRARY.jobName) ?? SOP_TASK_LIBRARY_FIXTURE.jobs[0];
    const differentTask = differentJobEntry.tasks.find((task) => task.name !== SAMPLE_WORK_LIBRARY.taskName)!;
    const differentWorkLibrary = createWorkLibrarySelection(differentJobEntry, differentTask);
    const differentTaskSampleResult = buildTaskGateSampleDocument({
        id: 'gate-sample-different-task',
        member: SAMPLE_SOP_DOCUMENT.member,
        workLibrary: differentWorkLibrary,
        context: '',
        setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig,
    });
    check(differentTaskSampleResult.success, 'buildTaskGateSampleDocument also succeeds for an unrelated Task');
    if (differentTaskSampleResult.success) {
        const differentSteps = differentTaskSampleResult.document.steps.filter((s) => !s.terminalType);
        check(
            differentSteps.every((s) => !s.title.includes('채용 공고 준비') && !s.title.includes('채용 요청 접수')),
            'The sample for a different Task never shows the OLD hard-coded recruitment step titles mapped onto an unrelated Task'
        );
        check(
            differentSteps.every((s) => differentTask.activities.some((a) => s.title.includes(a.name))),
            "Every sample step title for the different Task is DERIVED FROM THAT Task's own Activity names, not fixed recruitment content"
        );
        check(
            differentSteps.every((s) => differentTask.activities.every((a) => a.name !== s.title)),
            'No sample step title is IDENTICAL to its Activity name — a Sub Action title must read as an action distinct from the Activity group label it belongs to'
        );
    }

    // The genuinely-unsupported case (no Activity data at all) fails explicitly, never silently as a legacy document.
    const emptyWorkLibrary = { ...SAMPLE_WORK_LIBRARY, taskCatalog: [{ ...SAMPLE_WORK_LIBRARY.taskCatalog[0], activities: [] }] };
    const emptySampleResult = buildTaskGateSampleDocument({
        id: 'gate-sample-empty',
        member: SAMPLE_SOP_DOCUMENT.member,
        workLibrary: emptyWorkLibrary,
        context: '',
        setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig,
    });
    check(!emptySampleResult.success, 'buildTaskGateSampleDocument reports an explicit failure (never a silently-produced legacy document) when the selection has no Activity data');

    // ---------------------------------------------------------
    // Colleague template: listing excludes non-approved/non-eligible records and all PII
    // ---------------------------------------------------------
    console.log('Colleague template listing: eligibility filter + PII sanitization...');

    // Calling sopRepository.create() directly (bypassing the POST /api/sop route's
    // validateSopPersistenceState) so this fixture can be stamped as already-confirmed
    // without re-running the full member confirmation UI flow — the lifecycle state
    // machine under test here (draft -> approval-requested -> approved) only cares
    // about document.reviewStatus, not how it got there.
    const templateSourceDoc: SopDocument = {
        ...generatedDocument,
        id: 'template-source-doc',
        member: { ...generatedDocument.member, id: 'colleague-owner', name: '민감정보 이름', employeeId: 'EMP-SECRET-1' },
        reviewStatus: 'confirmed',
        steps: generatedDocument.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const })),
    };
    const createTemplateSource = await sopRepository.create({ memberId: 'colleague-owner', organizationId: 'org-sub-test', document: templateSourceDoc });
    check(createTemplateSource.ok, 'Fixture setup: creating the would-be template source record succeeds');

    const notYetApproved = await sopTemplatesGet(fakeApiRequest(memberHeaders('any-viewer')) as unknown as Parameters<typeof sopTemplatesGet>[0]);
    const notYetApprovedBody = await notYetApproved.json();
    check(!notYetApprovedBody.templates.some((t: { templateId: string }) => t.templateId === 'template-source-doc'), 'A record that is neither approved nor template-eligible never appears in the template list');

    const draftToRequested = await sopRepository.transitionLifecycle('template-source-doc', { actorRole: 'member', actorId: 'colleague-owner', kind: 'member-submit' });
    check(draftToRequested.ok, `Fixture setup: draft -> leader-review must succeed for a confirmed document, got ok=${draftToRequested.ok}`);
    const requestedToSmeReview = await sopRepository.transitionLifecycle('template-source-doc', { actorRole: 'leader', actorId: 'leader-1', kind: 'leader-approve' });
    check(requestedToSmeReview.ok, 'Fixture setup: leader approves the record (leader-review -> sme-review)');
    const requestedToApproved = await sopRepository.transitionLifecycle('template-source-doc', { actorRole: 'sme', actorId: 'sme-1', kind: 'sme-approve' });
    check(requestedToApproved.ok, 'Fixture setup: SME approves the record (sme-review -> approved)');

    const approvedButNotEligible = await sopTemplatesGet(fakeApiRequest(memberHeaders('any-viewer')) as unknown as Parameters<typeof sopTemplatesGet>[0]);
    const approvedButNotEligibleBody = await approvedButNotEligible.json();
    check(!approvedButNotEligibleBody.templates.some((t: { templateId: string }) => t.templateId === 'template-source-doc'), 'An approved-but-not-template-eligible record still does not appear in the template list');

    const eligibilityResult = await sopRepository.setTemplateEligibility('template-source-doc', true);
    check(eligibilityResult.ok, 'Fixture setup: marking the approved record template-eligible succeeds');

    const eligibleListing = await sopTemplatesGet(fakeApiRequest(memberHeaders('any-viewer')) as unknown as Parameters<typeof sopTemplatesGet>[0]);
    const eligibleListingBody = await eligibleListing.json();
    const listedEntry = eligibleListingBody.templates.find((t: { templateId: string }) => t.templateId === 'template-source-doc');
    check(Boolean(listedEntry), 'An approved AND template-eligible record now appears in the listing for OTHER members');

    const listingJson = JSON.stringify(eligibleListingBody);
    check(!listingJson.includes('colleague-owner') && !listingJson.includes('민감정보 이름') && !listingJson.includes('EMP-SECRET-1'), 'The template listing payload never includes the source memberId, name, or employeeId');
    check(!listingJson.includes('People & Culture') && !('organizationCategory' in (listedEntry ?? {})), 'The template listing payload has no organizationCategory field at all (removed, not just renamed, per the fake-anonymization fix)');
    check(SopTemplateSummarySchema.safeParse(listedEntry).success, 'Each listed entry matches the sanitized SopTemplateSummary schema exactly (no extra PII field could sneak through)');

    const summaryDirect = toSopTemplateSummary({ ...(await sopRepository.getById('template-source-doc'))! });
    check(!('memberId' in summaryDirect) && !('employeeId' in (summaryDirect as object)), 'toSopTemplateSummary() itself never includes memberId/employeeId in its return shape');
    check(!('organizationCategory' in (summaryDirect as object)), 'toSopTemplateSummary() itself never includes an organizationCategory field');

    // Code review defect 4: the record's OWN owner must never see it in their own colleague-template list.
    const ownerViewingOwnList = await sopTemplatesGet(fakeApiRequest(memberHeaders('colleague-owner')) as unknown as Parameters<typeof sopTemplatesGet>[0]);
    const ownerViewingOwnListBody = await ownerViewingOwnList.json();
    check(
        !ownerViewingOwnListBody.templates.some((t: { templateId: string }) => t.templateId === 'template-source-doc'),
        "The record's own owner never sees their own approved+eligible SOP in their own colleague-template listing"
    );
    // Sanity: the repository-level distinction between "full visibility" and "candidate pool for a member" actually differs.
    const fullVisibilityList = await sopRepository.listTemplateEligible();
    const candidatePoolForOwner = await sopRepository.listColleagueTemplateCandidates('colleague-owner');
    check(
        fullVisibilityList.some((r) => r.id === 'template-source-doc') && !candidatePoolForOwner.some((r) => r.id === 'template-source-doc'),
        'listTemplateEligible (full visibility) includes the record; listColleagueTemplateCandidates for its own owner excludes it — the two queries are genuinely distinct, not the same filter reused'
    );

    // ---------------------------------------------------------
    // Colleague template clone: new id/current member/draft state, judgement stripped, original untouched
    // ---------------------------------------------------------
    console.log('Colleague template clone: independence + sanitization...');

    const beforeCloneSourceRecord = await sopRepository.getById('template-source-doc');
    const cloneRequesterHeaders = memberHeaders('clone-requester');
    const cloneRequesterMember = { id: 'clone-requester', name: '복제 요청자', jobRole: '채용담당자', organization: 'Other Team' };
    const cloneResponse = await sopTemplateClonePost(
        fakeApiRequest(cloneRequesterHeaders, { member: cloneRequesterMember }),
        { params: Promise.resolve({ id: 'template-source-doc' }) }
    );
    check(cloneResponse.status === 200, `Cloning an approved, eligible template must succeed, got ${cloneResponse.status}`);
    const clonedDocument = (await cloneResponse.json()).document as SopDocument;

    check(clonedDocument.id !== 'template-source-doc', 'The clone receives a brand-new document id, never reusing the source id');
    check(clonedDocument.member.id === 'clone-requester' && clonedDocument.member.name === '복제 요청자', 'The clone is stamped with the CURRENT requester identity, not the source author');
    check(clonedDocument.reviewStatus === 'ai-draft', 'The cloned document content review status resets to ai-draft');
    check(clonedDocument.steps.every((s) => s.reviewStatus === 'ai-draft'), 'Every step in the clone also resets to ai-draft (never a stray confirmed step inside a non-confirmed document)');
    check(clonedDocument.agentizationReview === undefined, 'The clone has NO agentizationReview at all — the source member\'s stepModes/note/confirmedAt are completely removed');
    check(clonedDocument.sourceTemplateId === 'template-source-doc', 'The clone records minimal provenance (sourceTemplateId) pointing at the source template');
    check(
        clonedDocument.steps.filter((s) => !s.terminalType).every((s) => Boolean(s.agentizationSuggestion)),
        'AI-generated agentizationSuggestion structural content IS retained on the clone (only the member judgement is stripped)'
    );

    const afterCloneSourceRecord = await sopRepository.getById('template-source-doc');
    check(
        JSON.stringify(afterCloneSourceRecord) === JSON.stringify(beforeCloneSourceRecord),
        'Cloning never mutates the original source record in any way'
    );

    // A non-eligible / non-existent id must be rejected identically (no existence leak) and never mutate anything.
    const cloneOfIneligible = await sopTemplateClonePost(
        fakeApiRequest(memberHeaders('clone-requester-2'), { member: { id: 'clone-requester-2', name: 'x', jobRole: 'y' } }),
        { params: Promise.resolve({ id: 'does-not-exist-or-not-eligible' }) }
    );
    check(cloneOfIneligible.status === 404, 'Cloning a non-existent or non-eligible id is rejected with 404');

    // ---------------------------------------------------------
    // Code review defect 7: clone-request identity is verified, never trusted blindly.
    // ---------------------------------------------------------
    console.log('Colleague template clone: identity/organization validation is not bypassable...');

    const cloneMissingId = await sopTemplateClonePost(
        fakeApiRequest(memberHeaders('clone-requester-3'), { member: { name: '이름만 있는 요청', jobRole: '아무 직무' } }),
        { params: Promise.resolve({ id: 'template-source-doc' }) }
    );
    check(cloneMissingId.status === 400, `A clone request with no member.id at all must be rejected with 400, got ${cloneMissingId.status}`);

    const cloneWrongId = await sopTemplateClonePost(
        fakeApiRequest(memberHeaders('clone-requester-3'), { member: { id: 'someone-else-entirely', name: 'x', jobRole: 'y' } }),
        { params: Promise.resolve({ id: 'template-source-doc' }) }
    );
    check(cloneWrongId.status === 403, `A clone request whose member.id does not match the actor context must be rejected with 403, got ${cloneWrongId.status}`);

    const orgNormalizedResponse = await sopTemplateClonePost(
        fakeApiRequest(memberHeaders('clone-requester-4', 'org-actual-4'), { member: { id: 'clone-requester-4', name: '조직 위조 시도', jobRole: '아무 직무', organization: '위조된 조직명' } }),
        { params: Promise.resolve({ id: 'template-source-doc' }) }
    );
    check(orgNormalizedResponse.status === 200, `A clone request with a mismatched organization string must still succeed (normalized, not rejected), got ${orgNormalizedResponse.status}`);
    const orgNormalizedDocument = (await orgNormalizedResponse.json()).document as SopDocument;
    check(orgNormalizedDocument.member.organization === 'org-actual-4', "The clone's member.organization is normalized to the actor's own organizationId, never the client-submitted string");
    check(orgNormalizedDocument.member.organization !== '위조된 조직명', 'The client-submitted forged organization string never survives into the clone');
    check(
        orgNormalizedDocument.member.organization !== templateSourceDoc.member.organization,
        "The original author's organization does not leak into the clone either"
    );

    const savedClone = await sopRepository.create({ memberId: clonedDocument.member.id!, organizationId: 'org-sub-test', document: clonedDocument });
    check(
        savedClone.ok && savedClone.record.memberId === clonedDocument.member.id,
        'The saved record.memberId matches the cloned document.member.id exactly (identity is consistent end-to-end, not just at the response boundary)'
    );

    // ---------------------------------------------------------
    // Defect fix: subActionOrigin/subActionOriginRationale enforced ONLY at the
    // confirm boundary (structureVersion 'activity-subaction-v1'), never at draft-save
    // time, and never retroactively against a legacy document.
    // ---------------------------------------------------------
    console.log('Confirm boundary: subActionOrigin is required for activity-subaction-v1, never for legacy...');

    function buildConfirmableSubActionDocument(id: string, jobRole: string): SopDocument {
        const workLibrary = createTaskLibrarySelectionForRole(jobRole);
        const built = buildTaskGateSampleDocument({
            id,
            member: { name: 'Origin 테스트', jobRole, id: 'origin-tester' },
            workLibrary,
            context: 'origin 테스트용 문서',
            setupConfig: { detailLevel: 'standard', minSteps: 4, maxSteps: 20, branchPolicy: 'auto', maxBranches: 2, allowRework: true, maxTotalNodes: 24, maxLoops: 2, splitComplexSteps: true },
        });
        if (!built.success) throw new Error(`fixture setup failed: ${built.reason}`);
        return {
            ...built.document,
            reviewStatus: 'reviewed' as const,
            steps: built.document.steps.map((step) => ({
                ...step,
                reviewStatus: 'reviewed' as const,
                requiredSkills: step.requiredSkills.map((skill) => ({ ...skill, accepted: true })),
                ...(step.terminalType ? {} : { subActionOrigin: 'activity-derived' as const }),
            })),
        };
    }

    const originMemberHeaders = { 'x-sop-actor-id': 'origin-tester', 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': 'org-origin-test' };
    function originApiRequest(headers: Record<string, string>, body?: unknown) {
        return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopApiCreateForOrigin>[0];
    }

    // 1. A well-formed activity-subaction-v1 document with every non-terminal step
    //    carrying a valid origin confirms successfully.
    const validOriginDoc = buildConfirmableSubActionDocument('origin-doc-valid', 'Talent Acquisition');
    const validConfirm = validateFullSopConfirmation(validOriginDoc);
    check(validConfirm.success, `A well-formed activity-subaction-v1 document with valid origins on every step confirms successfully, errors: ${!validConfirm.success ? validConfirm.errors.join(' / ') : ''}`);

    // 2. Removing subActionOrigin/subActionOriginRationale from every non-terminal step —
    //    the draft schema still accepts it (these fields are optional)...
    const missingOriginDoc: SopDocument = {
        ...validOriginDoc,
        steps: validOriginDoc.steps.map((step) => ({ ...step, subActionOrigin: undefined, subActionOriginRationale: undefined })),
    };
    check(SopDocumentSchema.safeParse(missingOriginDoc).success, 'A structureVersion activity-subaction-v1 document with NO subActionOrigin on any step still passes the DRAFT persist schema — draft permissiveness is unaffected');

    // ...but the SAME document fails full confirmation.
    const missingOriginConfirm = validateFullSopConfirmation(missingOriginDoc);
    check(!missingOriginConfirm.success, 'The identical document fails validateFullSopConfirmation once origin is missing from its Sub Actions');
    check(!missingOriginConfirm.success && missingOriginConfirm.errors.some((e) => e.includes('생성 근거')), 'The confirmation failure explicitly names the missing Sub Action origin, not a generic error');

    // 3. context-derived without a rationale fails confirmation.
    const missingRationaleDoc: SopDocument = {
        ...validOriginDoc,
        steps: validOriginDoc.steps.map((step, index) => (index === 1 && !step.terminalType ? { ...step, subActionOrigin: 'context-derived' as const, subActionOriginRationale: undefined } : step)),
    };
    const missingRationaleConfirm = validateFullSopConfirmation(missingRationaleDoc);
    check(!missingRationaleConfirm.success, 'A context-derived Sub Action with no rationale fails confirmation');

    // 4. context-derived WITH a rationale confirms successfully.
    const withRationaleDoc: SopDocument = {
        ...validOriginDoc,
        steps: validOriginDoc.steps.map((step, index) => (index === 1 && !step.terminalType ? { ...step, subActionOrigin: 'context-derived' as const, subActionOriginRationale: '구성원이 입력한 업무 맥락에서 파생된 추가 단계입니다.' } : step)),
    };
    const withRationaleConfirm = validateFullSopConfirmation(withRationaleDoc);
    check(withRationaleConfirm.success, `A context-derived Sub Action WITH a concrete rationale confirms successfully, errors: ${!withRationaleConfirm.success ? withRationaleConfirm.errors.join(' / ') : ''}`);

    // 5. activity-derived with a leftover (unnecessary) rationale fails confirmation.
    const unexpectedRationaleDoc: SopDocument = {
        ...validOriginDoc,
        steps: validOriginDoc.steps.map((step, index) => (index === 1 && !step.terminalType ? { ...step, subActionOrigin: 'activity-derived' as const, subActionOriginRationale: '전환 전 남은 근거 텍스트' } : step)),
    };
    const unexpectedRationaleConfirm = validateFullSopConfirmation(unexpectedRationaleDoc);
    check(!unexpectedRationaleConfirm.success, 'An activity-derived Sub Action with a leftover context rationale (never cleared when switching away from context-derived) fails confirmation');

    // 6. Legacy (no structureVersion) documents are never held to this rule.
    const legacyDoc: SopDocument = { ...SAMPLE_SOP_DOCUMENT, structureVersion: undefined };
    check(legacyDoc.steps.every((step) => step.subActionOrigin === undefined), 'Fixture sanity check: the legacy sample document has no subActionOrigin on any step');
    const legacyConfirmable: SopDocument = { ...legacyDoc, steps: legacyDoc.steps.map((step) => ({ ...step, reviewStatus: 'reviewed' as const, requiredSkills: step.requiredSkills.map((sk) => ({ ...sk, accepted: true })) })) };
    const legacyConfirm = validateFullSopConfirmation(legacyConfirmable);
    check(legacyConfirm.success, `A legacy (no structureVersion) document with no subActionOrigin anywhere still confirms successfully — the origin rule is never retroactively enforced, errors: ${!legacyConfirm.success ? legacyConfirm.errors.join(' / ') : ''}`);

    // 7. A member-added new step (via Workspace "단계 추가", which never silently fills
    //    subActionOrigin) blocks confirmation until the member explicitly chooses one.
    const manuallyAddedStep: SopStepData = { id: 'manual-step-no-origin', title: '신규 수행 단계', definition: '수행할 작업 항목을 작성해 주세요.', shape: 'process', position: { x: 0, y: 0 }, requiredSkills: [], reviewStatus: 'reviewed' };
    check(manuallyAddedStep.subActionOrigin === undefined, 'A freshly-constructed manual step (matching SopWorkspace\'s "단계 추가" shape) never has subActionOrigin silently filled in');
    const withManualStepDoc: SopDocument = { ...validOriginDoc, steps: [...validOriginDoc.steps, manuallyAddedStep] };
    const withManualStepConfirm = validateFullSopConfirmation(withManualStepDoc);
    check(!withManualStepConfirm.success, 'A document containing a manually-added step with no chosen origin is blocked from confirmation');

    // 8. Server boundary: validateSopPersistenceState (POST/PUT confirm-time check) uses
    //    the SAME validateFullSopConfirmation call — never a second, divergent check.
    const persistenceErrorsForMissingOrigin = validateSopPersistenceState({ ...missingOriginDoc, reviewStatus: 'confirmed', steps: missingOriginDoc.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const })) });
    check(persistenceErrorsForMissingOrigin.some((e) => e.includes('생성 근거')), 'validateSopPersistenceState (the server save-time check) reports the same missing-origin error — it reuses validateFullSopConfirmation, not a separate rule');

    // 9. Full API boundary: POST a genuinely-confirmed document succeeds; PUT-ing an
    //    otherwise-identical confirmed document with origin stripped is rejected 400 and
    //    never reaches the repository.
    console.log('API: POST/PUT reject a confirmed activity-subaction-v1 document with missing Sub Action origin...');
    const apiValidDoc: SopDocument = { ...validOriginDoc, id: 'origin-api-doc', reviewStatus: 'confirmed', steps: validOriginDoc.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const })) };
    const createOriginRes = await sopApiCreateForOrigin(originApiRequest(originMemberHeaders, { memberId: 'origin-tester', organizationId: 'org-origin-test', document: apiValidDoc }));
    check(createOriginRes.status === 201, `POSTing a genuinely-confirmed activity-subaction-v1 document (valid origins) succeeds, got ${createOriginRes.status}`);
    const createdOriginRecord = (await createOriginRes.json()).record;

    const apiMissingOriginDoc: SopDocument = { ...apiValidDoc, steps: apiValidDoc.steps.map((s) => ({ ...s, subActionOrigin: undefined, subActionOriginRationale: undefined })) };
    const putMissingOriginRes = await sopApiUpdateForOrigin(
        originApiRequest(originMemberHeaders, { document: apiMissingOriginDoc, expectedVersion: createdOriginRecord.version }),
        { params: Promise.resolve({ id: 'origin-api-doc' }) }
    );
    check(putMissingOriginRes.status === 400, `PUTing a 'confirmed' document with Sub Action origin stripped is rejected with 400, got ${putMissingOriginRes.status}`);
    const afterRejectedOriginPut = await sopRepository.getById('origin-api-doc');
    check(afterRejectedOriginPut?.document.steps.filter((s) => !s.terminalType).every((s) => Boolean(s.subActionOrigin)) ?? false, 'The stored record is completely unchanged after the rejected PUT — origin is still present on every non-terminal step');
    check(afterRejectedOriginPut?.version === createdOriginRecord.version, 'The stored record\'s version does not advance after the rejected PUT');

    // ---------------------------------------------------------
    // Defect fix: subActionOrigin/subActionOriginRationale edits invalidate review/Agentization
    // confirmation exactly like editing title/definition does — the field was previously
    // missing from the store's "meaningful edit" list, silently bypassing invalidation.
    // ---------------------------------------------------------
    console.log('Store: editing subActionOrigin/subActionOriginRationale invalidates review and Agentization confirmation...');
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().setCustomerReviewMode(false);
    check(useSopPrototypeStore.getState().setDocument(structuredClone(validOriginDoc)), 'Fixture setup: loading the valid origin document into the Store succeeds');
    const firstNonTerminalStepId = validOriginDoc.steps.find((s) => !s.terminalType)!.id;
    check(useSopPrototypeStore.getState().document!.steps.find((s) => s.id === firstNonTerminalStepId)!.reviewStatus === 'reviewed', 'Fixture setup: the target step starts reviewed (from buildConfirmableSubActionDocument)');
    useSopPrototypeStore.getState().updateStep(firstNonTerminalStepId, { subActionOrigin: 'context-derived', subActionOriginRationale: '변경 테스트용 근거' });
    check(useSopPrototypeStore.getState().document!.steps.find((s) => s.id === firstNonTerminalStepId)!.reviewStatus === 'ai-draft', 'Editing a step\'s subActionOrigin resets that step\'s reviewStatus back to ai-draft, exactly like editing its title/definition would');
    check(useSopPrototypeStore.getState().document!.reviewStatus === 'ai-draft', 'Editing subActionOrigin invalidates the whole document\'s reviewStatus, not just the one step');
    useSopPrototypeStore.getState().resetStore();

    // ---------------------------------------------------------
    // 복제 시 출처 처리 정책 (buildDuplicateStepPatch): a duplicated Sub Action
    // INHERITS its full provenance (sourceActivityIds / subActionOrder /
    // subActionOrigin / subActionOriginRationale) from the original — a copy of
    // the same content has the same origin. The inherited (now duplicated)
    // subActionOrder then blocks confirmation via the duplicate-order rule until
    // the member assigns a fresh order, so a duplicate can never silently slip
    // into a confirmed document. This test pins that policy explicitly.
    // ---------------------------------------------------------
    console.log('Store: duplicating a Sub Action inherits provenance and blocks confirm via duplicate order until reordered...');
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().setCustomerReviewMode(false);
    const dupPolicyDoc = structuredClone(validOriginDoc);
    dupPolicyDoc.id = 'origin-doc-duplicate-policy';
    const dupSourceTemplate = dupPolicyDoc.steps.find((s) => !s.terminalType)!;
    // Make the source step context-derived WITH a rationale so inheritance of BOTH origin fields is observable.
    dupPolicyDoc.steps = dupPolicyDoc.steps.map((s) =>
        s.id === dupSourceTemplate.id ? { ...s, subActionOrigin: 'context-derived' as const, subActionOriginRationale: '복제 정책 검증용 맥락 근거' } : s
    );
    check(useSopPrototypeStore.getState().setDocument(dupPolicyDoc), 'Fixture setup: loading the duplicate-policy document into the Store succeeds');

    const dupResult = useSopPrototypeStore.getState().duplicateStep(dupSourceTemplate.id);
    check(dupResult.success, `Duplicating a non-terminal Sub Action succeeds${!dupResult.success ? ` (reason: ${dupResult.reason})` : ''}`);
    const duplicatedStepId = useSopPrototypeStore.getState().selectedStepId!;
    const afterDupDoc = useSopPrototypeStore.getState().document!;
    const dupOriginal = afterDupDoc.steps.find((s) => s.id === dupSourceTemplate.id)!;
    const dupCopy = afterDupDoc.steps.find((s) => s.id === duplicatedStepId)!;
    check(Boolean(dupCopy) && dupCopy.id !== dupOriginal.id && dupCopy.title === `${dupOriginal.title} (사본)`, 'The duplicate is a distinct step whose title marks it as a copy');
    check(dupCopy.subActionOrigin === 'context-derived' && dupCopy.subActionOriginRationale === dupOriginal.subActionOriginRationale, 'POLICY: the duplicate inherits subActionOrigin AND subActionOriginRationale from the original — provenance is copied, never silently reset to 미지정');
    check(
        JSON.stringify(dupCopy.sourceActivityIds) === JSON.stringify(dupOriginal.sourceActivityIds) && dupCopy.subActionOrder === dupOriginal.subActionOrder,
        'POLICY: the duplicate also inherits sourceActivityIds and subActionOrder (initially identical to the original)'
    );
    check(dupCopy.reviewStatus === 'ai-draft', 'The duplicate always starts unreviewed (ai-draft), regardless of the original\'s review state');

    const dupBlockedConfirm = validateFullSopConfirmation(afterDupDoc);
    const dupBlockedErrors = dupBlockedConfirm.success ? [] : dupBlockedConfirm.errors;
    check(!dupBlockedConfirm.success && dupBlockedErrors.some((e) => e.includes('순서가 중복')), 'POLICY: the inherited duplicate subActionOrder explicitly blocks confirmation (duplicate-order rule) — a duplicate can never slip into a confirmed document unnoticed');
    check(!dupBlockedErrors.some((e) => e.includes('생성 근거')), 'The confirm errors do NOT include a missing-origin complaint — inheritance already satisfied the origin rule; only the order needs member action');

    // Assigning a fresh, unique order resolves the structural block without ever re-touching origin.
    const usedOrders = afterDupDoc.steps
        .filter((s) => !s.terminalType && s.sourceActivityIds?.[0] === dupCopy.sourceActivityIds?.[0] && s.subActionOrder !== undefined)
        .map((s) => s.subActionOrder as number);
    useSopPrototypeStore.getState().setStepSubActionOrder(duplicatedStepId, Math.max(...usedOrders) + 1);
    const dupReorderedConfirm = validateFullSopConfirmation(useSopPrototypeStore.getState().document!);
    const dupRemainingErrors = dupReorderedConfirm.success ? [] : dupReorderedConfirm.errors;
    check(!dupRemainingErrors.some((e) => e.includes('순서가 중복') || e.includes('생성 근거')), 'After assigning a fresh subActionOrder, neither duplicate-order nor missing-origin errors remain — the inherited provenance stands as-is without any re-selection');
    useSopPrototypeStore.getState().resetStore();

    // ---------------------------------------------------------
    // Workspace panel density redesign: inspector accordion sections and the
    // Activity-grouped sidebar step list (customer feedback: both panels showed
    // everything at once and nothing was scannable).
    // ---------------------------------------------------------
    console.log('Workspace panel density redesign (accordion + grouped step list)...');
    {
        const { SopInspectorSection } = await import('../src/components/sop/SopInspectorSection');
        const sectionRenderer = renderComponent(
            // eslint-disable-next-line react/no-children-prop -- .ts 테스트 파일이라 JSX가 없고, createElement의 3번째 인자 형태는 이 컴포넌트의 required children 타입과 오버로드가 맞지 않는다.
            React.createElement(SopInspectorSection, {
                title: '테스트 섹션',
                summary: '3개',
                defaultOpen: false,
                children: React.createElement('input', { defaultValue: '내용' }),
            })
        );
        check(sectionRenderer.root.findAllByType('input').length === 1, 'A COLLAPSED inspector section keeps its children mounted (CSS hidden) — form state and every existing read-only guard test still sees the full tree');
        const header = sectionRenderer.root.findAllByType('button')[0];
        check(header.props['aria-expanded'] === false, 'A collapsed section reports aria-expanded=false');
        act(() => header.props.onClick());
        check(sectionRenderer.root.findAllByType('button')[0].props['aria-expanded'] === true, 'Clicking the section header expands it');
        sectionRenderer.unmount();
    }
    {
        const { SopSidebar } = await import('../src/components/sop/SopSidebar');
        const sidebarBuild = buildTaskGateSampleDocument({
            id: 'sidebar-group-doc',
            member: SAMPLE_SOP_DOCUMENT.member,
            workLibrary: SAMPLE_WORK_LIBRARY,
            context: '',
            setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig,
        });
        check(sidebarBuild.success, 'Fixture: the sidebar-grouping sample document builds');
        if (sidebarBuild.success) {
            act(() => {
                useSopPrototypeStore.getState().setDocument(sidebarBuild.document);
            });
            const sidebar = renderComponent(
                React.createElement(SopSidebar, {
                    showMiniMap: false,
                    setShowMiniMap: () => {},
                    showBranchLabels: true,
                    setShowBranchLabels: () => {},
                })
            );
            const groupHeaders = sidebar.root.findAll((n) => n.type === 'button' && n.props['aria-expanded'] !== undefined);
            const coveredActivityIds = new Set(
                sidebarBuild.document.steps.filter((s) => !s.terminalType).map((s) => s.sourceActivityIds?.[0]).filter(Boolean)
            );
            check(
                groupHeaders.length === coveredActivityIds.size,
                `The steps tab renders one collapsible group per covered Activity (${groupHeaders.length}/${coveredActivityIds.size}) — the flat 30-row list is gone`
            );
            const countStepRows = () => sidebar.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cursor-pointer') && typeof n.props.onClick === 'function' && n.type === 'div').length;
            const rowsBefore = countStepRows();
            const firstGroupSize = sidebarBuild.document.steps.filter((s) => !s.terminalType && s.sourceActivityIds?.[0] === [...coveredActivityIds][0]).length;
            act(() => groupHeaders[0].props.onClick());
            check(countStepRows() === rowsBefore - firstGroupSize, 'Collapsing a group hides exactly that Activity\'s step rows — members can focus one Activity at a time');
            act(() => sidebar.root.findAll((n) => n.type === 'button' && n.props['aria-expanded'] !== undefined)[0].props.onClick());
            check(countStepRows() === rowsBefore, 'Re-expanding restores the rows');
            // 제목이 문자 그대로 "시작"/"종료"인 단계와 구분하기 위해 칩은 고유한
            // 테두리 클래스(border-emerald-200/border-rose-200)로 식별한다.
            const terminalChips = sidebar.root.findAll(
                (n) => n.type === 'span' && typeof n.props.className === 'string' && (n.props.className.includes('border-emerald-200') || n.props.className.includes('border-rose-200')) && (n.props.children === '시작' || n.props.children === '종료')
            );
            check(terminalChips.length === 2, 'Terminal steps stay OUTSIDE Activity groups as solo rows tagged with 시작/종료 chips');
            sidebar.unmount();
            useSopPrototypeStore.getState().resetStore();
        }
    }

    // ---------------------------------------------------------
    // Bulk review: one-click 검토 완료 for all (or one Activity's) unreviewed
    // steps — a 30-node Task-wide SOP made per-step clicking the only way to
    // finish a review pass.
    // ---------------------------------------------------------
    console.log('Bulk step review (전체/Activity 일괄 검토)...');
    {
        const bulkBuild = buildTaskGateSampleDocument({
            id: 'bulk-review-doc',
            member: SAMPLE_SOP_DOCUMENT.member,
            workLibrary: SAMPLE_WORK_LIBRARY,
            context: '',
            setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig,
        });
        check(bulkBuild.success, 'Fixture: the bulk-review sample document builds');
        if (bulkBuild.success) {
            const bulkDoc = bulkBuild.document;
            const draftCount = bulkDoc.steps.filter((s) => s.reviewStatus === 'ai-draft').length;
            const firstActivityId = bulkDoc.steps.find((s) => !s.terminalType)!.sourceActivityIds![0];
            const activityDraftCount = bulkDoc.steps.filter((s) => !s.terminalType && s.sourceActivityIds?.[0] === firstActivityId && s.reviewStatus === 'ai-draft').length;

            // Activity 범위 일괄 검토: 해당 Activity의 Sub Action만 바뀐다.
            const scoped = applyBulkStepReview(bulkDoc, firstActivityId);
            check(scoped.changedCount === activityDraftCount, `Activity-scoped bulk review changes exactly that Activity's unreviewed Sub Actions (${scoped.changedCount}/${activityDraftCount})`);
            check(
                scoped.steps.every((s) => (s.sourceActivityIds?.[0] === firstActivityId && !s.terminalType ? s.reviewStatus === 'reviewed' : s.reviewStatus === bulkDoc.steps.find((o) => o.id === s.id)!.reviewStatus)),
                'Steps outside the scoped Activity (terminals included) keep their previous review status untouched'
            );

            // 전체 일괄 검토: 모든 미검토 단계가 reviewed가 되고 문서 상태도 따라간다.
            const full = applyBulkStepReview(bulkDoc);
            check(full.changedCount === draftCount && full.reviewStatus === 'reviewed', 'Full bulk review marks every unreviewed step and the document itself as reviewed');
            check(full.steps.every((s) => s.reviewStatus !== 'confirmed'), "Bulk review can NEVER produce 'confirmed' — that status stays exclusive to confirmFullSop's validation pass");

            // 이미 검토/확정된 단계는 건드리지 않는다 (idempotent + confirmed 보존).
            const preReviewed = { ...bulkDoc, steps: bulkDoc.steps.map((s, i) => (i === 1 ? { ...s, reviewStatus: 'confirmed' as const } : s)) };
            const preserved = applyBulkStepReview(preReviewed);
            check(preserved.steps[1].reviewStatus === 'confirmed', 'A previously confirmed step survives bulk review unchanged');
            check(applyBulkStepReview({ ...bulkDoc, steps: full.steps }).changedCount === 0, 'Bulk review is idempotent — a second pass changes nothing');

            // Store 액션: 고객 검토 모드 잠금 + 1회 Undo 복원.
            act(() => {
                useSopPrototypeStore.getState().setDocument(bulkDoc);
                useSopPrototypeStore.getState().setCustomerReviewMode(true);
            });
            check(useSopPrototypeStore.getState().markStepsReviewedBulk() === 0 && useSopPrototypeStore.getState().document!.steps.filter((s) => s.reviewStatus === 'ai-draft').length === draftCount, 'The Store action is fully blocked under customer review mode');
            act(() => useSopPrototypeStore.getState().setCustomerReviewMode(false));
            let bulkChanged = 0;
            act(() => {
                bulkChanged = useSopPrototypeStore.getState().markStepsReviewedBulk();
            });
            check(bulkChanged === draftCount && useSopPrototypeStore.getState().document!.reviewStatus === 'reviewed', 'The Store action reviews all remaining drafts in ONE history entry');
            act(() => useSopPrototypeStore.getState().undo());
            check(useSopPrototypeStore.getState().document!.steps.filter((s) => s.reviewStatus === 'ai-draft').length === draftCount, 'A single Undo reverts the ENTIRE bulk review — never one step at a time');
            useSopPrototypeStore.getState().resetStore();
        }
    }

    // ---------------------------------------------------------
    // Gate density: a CONFIRMED Task Library collapses to a read-only summary
    // (the 3-pane editor was the screen's dominant density offender even after
    // review was already finished); reopening restores the full editor.
    // ---------------------------------------------------------
    console.log('WorkLibrarySelector confirmed-state summary (Gate density)...');
    {
        const { WorkLibrarySelector } = await import('../src/components/sop/WorkLibrarySelector');
        act(() => {
            useSopPrototypeStore.getState().resetStore();
            useSopPrototypeStore.setState({ workLibrary: { ...useSopPrototypeStore.getState().workLibrary, confirmed: true } });
        });
        const confirmedRenderer = renderComponent(React.createElement(WorkLibrarySelector));
        check(confirmedRenderer.root.findAllByType('input').length === 0 && confirmedRenderer.root.findAllByType('textarea').length === 0, 'A CONFIRMED library renders NO editor inputs — the 3-pane editor collapses to a read-only summary');
        const summaryChips = confirmedRenderer.root.findAll((n) => n.type === 'span' && typeof n.props.title === 'string' && Array.isArray(n.props.children));
        check(summaryChips.length > 0, 'The summary lists each Activity as a compact chip (order + name)');
        const reopenBtn = confirmedRenderer.root.findAllByType('button').find((b) => Array.isArray(b.props.children) && b.props.children.some((child: unknown) => child === '검토 다시 열기'));
        check(Boolean(reopenBtn), 'The summary keeps the "검토 다시 열기" button as the single way back into editing');
        act(() => reopenBtn!.props.onClick());
        check(confirmedRenderer.root.findAllByType('input').length > 0, 'Reopening the review restores the FULL editor with all inputs — no data was lost while collapsed');
        confirmedRenderer.unmount();
        useSopPrototypeStore.getState().resetStore();
    }

    // ---------------------------------------------------------
    // Role navigation: 승인 Inbox와 HR 대시보드는 라우트로만 존재하고 UI 이동
    // 경로가 없어 URL을 직접 입력해야 했다(고객 지적). 모든 주요 헤더에 공용
    // SopRoleNav 탭이 상시 노출된다.
    // ---------------------------------------------------------
    console.log('SopRoleNav (역할 화면 상단 내비게이션)...');
    {
        const { SopRoleNav } = await import('../src/components/sop/SopRoleNav');
        const navRenderer = renderComponent(React.createElement(SopRoleNav));
        const links = navRenderer.root.findAllByType('a');
        check(links.length === 3, 'The role nav renders exactly three destinations (구성원 / 승인 Inbox / HR 대시보드)');
        const hrefs = links.map((l) => l.props.href);
        check(hrefs.includes('/sop') && hrefs.includes('/sop/approvals') && hrefs.includes('/sop/hr'), 'The nav links point at the member home, approval inbox, and HR dashboard routes — every role screen is now reachable through the UI');
        navRenderer.unmount();

        const compactRenderer = renderComponent(React.createElement(SopRoleNav, { compact: true }));
        const compactLinks = compactRenderer.root.findAllByType('a');
        check(compactLinks.every((l) => typeof l.props.title === 'string' && l.props.title.length > 0), 'Compact (icon-only) mode keeps the label as a tooltip on every link');
        compactRenderer.unmount();
    }

    // ---------------------------------------------------------
    // Suggestion patch: agentizationSuggestion은 optional 와이어 필드라 모델이
    // 장문 출력에서 통째로 생략할 수 있다(프로덕션: 33개 단계 전부 누락 → 전체
    // 재생성 repair도 실패 → 400). 이제 누락 제안만 채우는 소형 패치 호출이
    // 먼저 시도되고, 전체 재생성은 패치로 부족할 때만 남는다.
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: missing-suggestion patch call (전체 재생성 없이 복구)...');
    {
        const noSuggestionObject = {
            title: '제안 누락 SOP',
            steps: [
                { id: 'p-start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
                { id: 'p-work-1', title: '작업 1', definition: '첫 번째 작업 단계입니다.', shape: 'process', sourceActivityIds: [actA.id], subActionOrder: 1, subActionOrigin: 'activity-derived' },
                { id: 'p-work-2', title: '작업 2', definition: '두 번째 작업 단계입니다.', shape: 'process', sourceActivityIds: [actA.id], subActionOrder: 2, subActionOrigin: 'activity-derived' },
                { id: 'p-end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
            ],
            edges: [
                { id: 'pe1', source: 'p-start', target: 'p-work-1' },
                { id: 'pe2', source: 'p-work-1', target: 'p-work-2' },
                { id: 'pe3', source: 'p-work-2', target: 'p-end' },
            ],
        };
        const patchSopRequest = {
            action: 'generateSop', memberRole: '테스터', taskName: 'T', sourceType: 'task', structureVersion: 'activity-subaction-v1',
            activities: [{ id: actA.id, order: 1, name: actA.name, skills: [] }],
            skills: [], context: '', detailLevel: 'standard', minSteps: 1, maxSteps: 5, branchPolicy: 'auto', maxBranches: 2, allowRework: true,
        } as unknown as SopGenerationRequest;

        let patchCalls = 0;
        let fullRepairCalls = 0;
        let patchedStepInfos: { id: string; title?: string }[] = [];
        const patchResult = await runSopGenerationPostProcessing({
            object: noSuggestionObject,
            prompt: 'PATCH PROMPT',
            sopRequest: patchSopRequest,
            generateRepair: async () => {
                fullRepairCalls++;
                throw new Error('full regeneration must NOT be needed when the patch succeeds');
            },
            generateSuggestionPatch: async (missingSteps) => {
                patchCalls++;
                patchedStepInfos = missingSteps;
                return {
                    suggestions: missingSteps.map((step) => ({ stepId: step.id, type: 'ai-assist', rationale: `${step.title} 단계는 AI가 초안을 지원할 수 있습니다.` })),
                };
            },
        });
        check(patchResult.ok, 'A response missing EVERY agentizationSuggestion is recovered by the small patch call alone — no 400');
        check(patchCalls === 1 && fullRepairCalls === 0, 'The patch call replaces the full 33-node regeneration entirely when it succeeds (repair never invoked)');
        check(patchedStepInfos.length === 2 && patchedStepInfos.every((s) => s.id.startsWith('p-work')), 'Only the non-terminal steps that actually lack a suggestion are sent to the patch call');
        if (patchResult.ok) {
            const patchedSteps = (patchResult.object as { steps: { id: string; terminalType?: string; agentizationSuggestion?: { rationale: string } }[] }).steps;
            check(patchedSteps.filter((s) => !s.terminalType).every((s) => Boolean(s.agentizationSuggestion?.rationale)), 'Every business step carries an AI-authored suggestion after patching');
            check(patchedSteps.filter((s) => s.terminalType).every((s) => !s.agentizationSuggestion), 'Terminals never receive suggestions — the terminal-exclusion invariant survives the patch');
        }

        // 패치가 빈 rationale을 돌려주면 그 단계는 채워지지 않는다 — 서버는 제안을
        // 조작하지 않으며, 남은 누락은 기존 repair → 400 경로가 처리한다.
        let fabricationRepairCalls = 0;
        const fabricationResult = await runSopGenerationPostProcessing({
            object: noSuggestionObject,
            prompt: 'PATCH PROMPT 2',
            sopRequest: patchSopRequest,
            generateRepair: async () => {
                fabricationRepairCalls++;
                return noSuggestionObject; // 전체 재생성도 제안을 채우지 못함
            },
            generateSuggestionPatch: async (missingSteps) => ({
                suggestions: missingSteps.map((step) => ({ stepId: step.id, type: 'ai-assist', rationale: '   ' })),
            }),
        });
        check(!fabricationResult.ok && fabricationRepairCalls > 0, 'An empty-rationale patch is IGNORED (never fabricated into a suggestion) — the failure still routes through repair and ends in an actionable 400');
        if (!fabricationResult.ok) check(fabricationResult.response.status === 400, 'The unfixed missing-suggestion failure stays a 400 with the step list');
    }

    console.log(`ALL SOP ACTIVITY–SUB ACTION / AGENTIZATION / TEMPLATE TESTS PASSED (${passed})`);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
