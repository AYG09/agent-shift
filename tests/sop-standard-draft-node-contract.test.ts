/**
 * Domain/pipeline tests for the HR 대표 표준안 초안 node-quality contract
 * (작업지시서 07, NODE_AUTHORING_AND_AGENT_CONTROL.md §6, TST-STD-001~006,
 * TST-GEN-004~006). Follows this repo's established convention (see
 * tests/sop-hr-analytics.test.ts) of NEVER exercising the live network AI
 * call: `generateStandardDraftDocument` accepts an injectable `generate`
 * function, so every pipeline/repair-path test below drives it with a
 * deterministic fake instead of a real generateObject() call.
 */
import {
    sanitizeStandardDraftSource,
    redactKnownIdentifiers,
    getStandardDraftPrompt,
} from '../src/server/sop/sop-standard-draft-prompt';
import { generateStandardDraftDocument } from '../src/server/sop/sop-standard-draft-runner';
import {
    SopStandardDraftResponseSchema,
    SopStandardizationIssueSchema,
} from '../src/lib/sop-standard-draft-schemas';
import { sopRepository } from '../src/server/sop/sop-repository-memory';
import { SAMPLE_WORK_LIBRARY } from '../src/lib/sop-sample-data';
import type { SopRecord } from '../src/lib/sop-record-schema';
import type { SopDocument } from '../src/lib/sop-types';

console.log('=== SOP standard-draft node-authoring contract tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function baseDocument(overrides: Partial<SopDocument>): SopDocument {
    const now = new Date().toISOString();
    return {
        id: 'doc-fixture',
        title: '채용 운영 SOP',
        member: { id: 'm-1', name: '김철수', employeeId: 'E12345', jobRole: '채용 운영 담당자', organization: '영업1팀' },
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '채용 운영 업무',
        reviewStatus: 'ai-draft',
        createdAt: now,
        updatedAt: now,
        edges: [],
        steps: [],
        ...overrides,
    };
}

function baseRecord(document: SopDocument): SopRecord {
    const now = new Date().toISOString();
    return {
        id: 'rec-fixture', memberId: document.member.id ?? 'm-1', organizationId: 'org-a',
        taskId: SAMPLE_WORK_LIBRARY.taskId, taskName: SAMPLE_WORK_LIBRARY.taskName, sourceType: 'task',
        document, version: 1, lifecycleStatus: 'approved', templateEligible: false, creationSource: 'task',
        createdAt: now, updatedAt: now,
    };
}

async function run() {
    // ---------------------------------------------------------
    // Domain: redactKnownIdentifiers
    // ---------------------------------------------------------
    console.log('Domain: redactKnownIdentifiers...');
    check(
        redactKnownIdentifiers('김철수 담당자가 서류를 검토한다', ['김철수']) === '[비식별] 담당자가 서류를 검토한다',
        'redactKnownIdentifiers replaces an exact identifier substring, case-sensitively matched text intact around it'
    );
    check(
        redactKnownIdentifiers('Contact abc123 for approval', ['ABC123']).includes('[비식별]'),
        'redactKnownIdentifiers matches case-insensitively'
    );
    check(redactKnownIdentifiers('변경 없음', []) === '변경 없음', 'redactKnownIdentifiers is a no-op with no identifiers');

    // ---------------------------------------------------------
    // Domain: sanitizeStandardDraftSource — TST-STD-001 / TST-GEN-004
    // ---------------------------------------------------------
    console.log('Domain: sanitizeStandardDraftSource...');
    const piiDocument = baseDocument({
        steps: [
            { id: 's-start', title: '시작', definition: '시작', shape: 'terminal', terminalType: 'start', requiredSkills: [], position: { x: 0, y: 0 }, reviewStatus: 'ai-draft' },
            {
                id: 's-1', title: '서류 검토', definition: '김철수 팀장의 지시에 따라 지원자 서류를 검토한다.',
                responsibleRole: '김철수 팀장', inputs: ['지원자 제출서류 (문의: E12345)'], outputs: ['서류 검토 결과'],
                tools: ['ATS'], cautions: ['영업1팀 공유 폴더에만 저장'], decisionRules: ['필수 서류 누락 시 반려'],
                requiredSkills: [], shape: 'process', position: { x: 0, y: 0 }, reviewStatus: 'ai-draft',
                executionSpec: {
                    actorRole: '채용 운영 담당자',
                    action: { verb: '검토한다', object: '지원자 서류' },
                    completionCriteria: ['검토 결과가 기록된다'],
                    decisionCriteria: [{ condition: '필수 서류 누락', outcome: '반려', sourceType: 'approved-sop' }],
                    toolPolicy: { allowedToolIds: ['ats.read'], forbiddenActions: [], dataAccessScope: ['read'], requiresHumanApproval: false },
                    escalationRules: [],
                },
            },
            { id: 's-end', title: '종료', definition: '종료', shape: 'terminal', terminalType: 'end', requiredSkills: [], position: { x: 0, y: 0 }, reviewStatus: 'ai-draft' },
        ],
    });
    const sanitized = sanitizeStandardDraftSource(baseRecord(piiDocument), 0);
    check(sanitized.label === '원본 1', 'sanitizeStandardDraftSource assigns an opaque, index-based label');
    check(sanitized.steps.length === 1, 'sanitizeStandardDraftSource excludes terminal (start/end) steps from the summary');

    const sanitizedText = JSON.stringify(sanitized);
    check(!sanitizedText.includes('김철수'), 'sanitizeStandardDraftSource redacts the member name from every field, not just title/definition');
    check(!sanitizedText.includes('E12345'), 'sanitizeStandardDraftSource redacts the member employeeId even when embedded inside a free-text input');
    check(!sanitizedText.includes('영업1팀'), 'sanitizeStandardDraftSource redacts the member organization even when embedded inside cautions');

    const step = sanitized.steps[0];
    check(!!step.responsibleRoleCategory && step.responsibleRoleCategory.includes('팀장'), 'responsible role CATEGORY meaning ("팀장") survives redaction even though the name is stripped');
    check(!!step.inputs?.some((v) => v.includes('지원자 제출서류')), 'input meaning is preserved after redaction');
    check(!!step.outputs?.some((v) => v.includes('서류 검토 결과')), 'output meaning is preserved');
    check(!!step.tools?.includes('ATS'), 'descriptive tool meaning is preserved');
    check(!!step.decisionRules?.some((v) => v.includes('반려')), 'decision-rule meaning is preserved');
    check(
        !!step.toolPolicy && step.toolPolicy.allowedToolIds.includes('ats.read') && step.toolPolicy.dataAccessScope.includes('read'),
        'de-identified execution-spec fields (toolPolicy) are carried through unchanged — they are already opaque tool ids/scopes, never PII'
    );
    check(
        !!step.decisionCriteria?.[0] && step.decisionCriteria[0].sourceType === 'approved-sop',
        'de-identified execution-spec decision criteria (condition/outcome/sourceType) are carried through'
    );

    const noSpecDocument = baseDocument({
        steps: [
            { id: 's-1', title: '단순 단계', definition: '실행 명세가 없는 원본 단계입니다.', requiredSkills: [], shape: 'process', position: { x: 0, y: 0 }, reviewStatus: 'ai-draft' },
        ],
    });
    const noSpecSummary = sanitizeStandardDraftSource(baseRecord(noSpecDocument), 1);
    check(noSpecSummary.label === '원본 2', 'label index increments per source, independent of record id');
    check(noSpecSummary.steps[0].toolPolicy === undefined, 'a source predating the node-authoring contract has no toolPolicy — never backfilled with fabricated data');

    // ---------------------------------------------------------
    // Domain: getStandardDraftPrompt carries the strengthened contract
    // ---------------------------------------------------------
    console.log('Domain: getStandardDraftPrompt content...');
    const prompt = getStandardDraftPrompt({ taskName: '채용 운영', taskDefinition: '채용 요청부터 입사 확정까지의 업무', sources: [sanitized] });
    check(prompt.includes('채용 요청부터 입사 확정까지의 업무'), 'prompt grounds Mission in the Task Library Task definition');
    check(prompt.includes('standardizationIssues'), 'prompt instructs the model to name its conflict-report field standardizationIssues');
    check(prompt.includes('하나를 고르거나 평균 내지 마세요'), 'prompt explicitly forbids arbitrarily resolving cross-source conflicts');
    check(prompt.includes('executionSpec') && prompt.includes('actorRole'), 'prompt names the executionSpec field and its required sub-fields (actorRole etc.) explicitly');
    check(prompt.includes('실행 허용으로 승격'), 'prompt forbids promoting conflicting tool permissions to auto-execution');

    // ---------------------------------------------------------
    // Domain: SopStandardizationIssueSchema
    // ---------------------------------------------------------
    console.log('Domain: SopStandardizationIssueSchema...');
    check(
        SopStandardizationIssueSchema.safeParse({
            targetStepLabel: '보완 요청 기한',
            issueType: 'threshold',
            conflictingValues: [{ sourceLabel: '원본 1', value: '3일' }, { sourceLabel: '원본 2', value: '명시 없음' }],
            humanDecisionNeeded: '표준 기한 결정 필요',
        }).success,
        'a well-formed standardization issue passes the strict schema'
    );
    check(
        !SopStandardizationIssueSchema.safeParse({ targetStepLabel: 'x', issueType: 'threshold', conflictingValues: [{ sourceLabel: '원본 1', value: 'a' }], humanDecisionNeeded: 'y' }).success,
        'a standardization issue with fewer than 2 conflicting values is rejected — a single value is not a conflict'
    );
    check(
        !SopStandardizationIssueSchema.safeParse({ targetStepLabel: 'x', issueType: 'not-a-real-type', conflictingValues: [{ sourceLabel: 'a', value: 'b' }, { sourceLabel: 'c', value: 'd' }], humanDecisionNeeded: 'y' }).success,
        'an unknown issueType is rejected'
    );

    // ---------------------------------------------------------
    // Pipeline: generateStandardDraftDocument with an injected fake generate
    // (never calls the real network AI) — TST-STD-002/003/005/006, TST-GEN-006
    // ---------------------------------------------------------
    console.log('Pipeline: generateStandardDraftDocument (fake generate, no network)...');

    function compliantSpec(verb: string, object: string, requiresHumanApproval = false) {
        return {
            actorRole: '채용 운영 담당자',
            action: { verb, object },
            completionCriteria: [`${object}에 대한 처리 결과가 기록된다`],
            decisionCriteria: [],
            toolPolicy: { allowedToolIds: [], forbiddenActions: [], dataAccessScope: [], requiresHumanApproval },
            escalationRules: [],
        };
    }

    function compliantObject(includeExecutionSpecOnStep1: boolean) {
        return {
            title: '채용 프로세스 표준 SOP (AI 초안)',
            agentInstruction: {
                objective: '채용 프로세스를 표준화하여 담당자 전환에도 품질을 유지한다',
                successCriteria: ['모든 지원자 서류가 필수항목 기준으로 검토된다'],
                globalConstraints: ['지원자 개인정보를 외부로 유출하지 않는다'],
                glossary: [{ term: 'ATS', definition: '채용관리 시스템' }],
            },
            steps: [
                { id: 's-start', title: '시작', definition: '프로세스 시작 지점입니다.', shape: 'terminal', terminalType: 'start' },
                {
                    id: 's-1', title: '지원자 제출서류를 필수항목 목록과 대조한다',
                    definition: '접수된 지원서류를 채용팀 체크리스트와 대조하여 누락 항목을 확인한다.',
                    shape: 'process', responsibleRole: '채용 운영 담당자',
                    inputs: ['지원자 제출서류'], outputs: ['서류 검토 결과'],
                    ...(includeExecutionSpecOnStep1 ? { executionSpec: compliantSpec('대조한다', '지원자 제출서류') } : {}),
                },
                {
                    id: 's-2', title: '서류 검토 결과를 채용 시스템에 등록한다',
                    definition: '검토가 끝난 결과를 ATS에 입력하여 다음 단계 담당자가 확인할 수 있게 한다.',
                    shape: 'process', responsibleRole: '채용 운영 담당자',
                    inputs: ['서류 검토 결과'], outputs: ['ATS 등록 결과'],
                    executionSpec: compliantSpec('등록한다', '서류 검토 결과'),
                },
                {
                    id: 's-3', title: '서류 미비 지원자에게 보완을 요청한다',
                    definition: '누락 항목이 있는 지원자에게 보완 요청 메일을 발송하여 재제출을 안내한다.',
                    shape: 'process', responsibleRole: '채용 운영 담당자',
                    inputs: ['서류 검토 결과'], outputs: ['보완 요청 안내'],
                    executionSpec: compliantSpec('요청한다', '서류 보완', true),
                },
                { id: 's-end', title: '종료', definition: '프로세스 종료 지점입니다.', shape: 'terminal', terminalType: 'end' },
            ],
            edges: [
                { id: 'e-1', source: 's-start', target: 's-1', branchType: 'default' },
                { id: 'e-2', source: 's-1', target: 's-2', branchType: 'default' },
                { id: 'e-3', source: 's-2', target: 's-3', branchType: 'default' },
                { id: 'e-4', source: 's-3', target: 's-end', branchType: 'default' },
            ],
            standardizationIssues: [
                {
                    targetStepLabel: '서류 보완 요청 완료 기한',
                    issueType: 'threshold',
                    conflictingValues: [
                        { sourceLabel: '원본 1', value: '3영업일 이내 재제출 요청' },
                        { sourceLabel: '원본 2', value: '기한 명시 없음' },
                    ],
                    humanDecisionNeeded: '보완 요청 기한을 표준으로 정할지 결정 필요',
                },
            ],
        };
    }

    const commonRunParams = {
        id: 'sop-standard-draft-test',
        taskName: SAMPLE_WORK_LIBRARY.taskName,
        taskDefinition: '채용 요청부터 입사 확정까지의 전체 채용 운영 업무입니다.',
        sources: [sanitized],
        workLibrary: SAMPLE_WORK_LIBRARY,
    };

    // --- Case 1: compliant on the first attempt — no repair round should fire ---
    let callCount = 0;
    const happyResult = await generateStandardDraftDocument({
        ...commonRunParams,
        generate: async () => {
            callCount += 1;
            return compliantObject(true);
        },
    });
    check(happyResult.ok, `A compliant generation response succeeds, got: ${!happyResult.ok ? happyResult.error : ''}`);
    if (happyResult.ok) {
        check(callCount === 1, `A compliant first response never triggers a repair round (exactly 1 generate call, got ${callCount})`);
        check(happyResult.qualityReport.ok && happyResult.qualityReport.blockingIssues.length === 0, 'qualityReport.ok is true with zero blocking issues for a fully compliant draft');
        check(happyResult.document.instructionContractVersion === 'node-authoring-v1', 'the resulting document is stamped with the node-authoring contract version');
        check(!!happyResult.document.agentInstruction && happyResult.document.agentInstruction.objective.length > 0, 'document-level Mission (agentInstruction) is preserved from the generation response onto the final document');
        const s1 = happyResult.document.steps.find((s) => s.id === 's-1');
        check(!!s1?.executionSpec && s1.executionSpec.actorRole === '채용 운영 담당자', 'a business step\'s executionSpec survives all the way from the generation response into the final SopDocument (the sop-normalizer.ts plumbing gap this work order fixes)');
        check(happyResult.standardizationIssues.length === 1 && happyResult.standardizationIssues[0].issueType === 'threshold', 'a well-formed standardizationIssues entry from the model is preserved in the response');

        const persisted = await sopRepository.getById(happyResult.document.id);
        check(persisted === null, 'generateStandardDraftDocument never persists its result via SopRepository — TST-STD-006/TST-GEN-006');

        const responsePayload = {
            document: happyResult.document,
            sourceRecordIds: ['rec-fixture'],
            taskId: SAMPLE_WORK_LIBRARY.taskId,
            generatedAt: new Date().toISOString(),
            qualityReport: happyResult.qualityReport,
            standardizationIssues: happyResult.standardizationIssues,
        };
        check(SopStandardDraftResponseSchema.safeParse(responsePayload).success, 'the full response payload (document + qualityReport + standardizationIssues) passes SopStandardDraftResponseSchema — TST-STD-005');
    }

    // --- Case 2: missing executionSpec on one step triggers exactly one repair round, then succeeds ---
    let repairCallCount = 0;
    const repairedResult = await generateStandardDraftDocument({
        ...commonRunParams,
        generate: async () => {
            repairCallCount += 1;
            return compliantObject(repairCallCount >= 2);
        },
    });
    check(repairedResult.ok, `A response missing one step's executionSpec still succeeds after repair, got: ${!repairedResult.ok ? repairedResult.error : ''}`);
    if (repairedResult.ok) {
        check(repairCallCount === 2, `A single node-quality defect triggers exactly one repair round (2 total generate calls, got ${repairCallCount})`);
        check(repairedResult.qualityReport.ok, 'after repair, the quality report is clean');
    }

    // --- Case 3: the defect survives repair — must surface as an explicit issue, never a hard failure ---
    const stillBrokenResult = await generateStandardDraftDocument({
        ...commonRunParams,
        generate: async () => compliantObject(false), // s-1 never gets an executionSpec, even on repair
    });
    check(stillBrokenResult.ok, 'a node-quality defect that survives the repair round is returned as an explicit issue, NOT a hard failure — "통과하거나 명시적 issue를 반환한다"');
    if (stillBrokenResult.ok) {
        check(!stillBrokenResult.qualityReport.ok, 'qualityReport.ok is false when a blocking issue survives the repair round');
        check(
            stillBrokenResult.qualityReport.blockingIssues.some((i) => i.code === 'missing-execution-spec' && i.stepId === 's-1'),
            'the specific surviving blocking issue (missing-execution-spec on s-1) is named in the response — never silently dropped'
        );
    }

    // --- Case 4: graph-invalid response (no steps at all) is a genuine hard failure ---
    const graphInvalidResult = await generateStandardDraftDocument({ ...commonRunParams, generate: async () => ({ title: 'x', steps: [], edges: [] }) });
    check(!graphInvalidResult.ok, 'a structurally invalid graph (no steps) is a hard failure — this is a DIFFERENT failure mode than a node-quality defect');

    // --- Case 5: the underlying generate call itself fails (network/model error) ---
    const networkFailureResult = await generateStandardDraftDocument({ ...commonRunParams, generate: async () => { throw new Error('model unavailable'); } });
    check(!networkFailureResult.ok, 'a thrown error from the generate call surfaces as a failure result rather than throwing out of generateStandardDraftDocument');

    // --- Case 6: a malformed standardizationIssues entry degrades to an empty list, never fails the draft ---
    const malformedIssuesResult = await generateStandardDraftDocument({
        ...commonRunParams,
        generate: async () => ({ ...compliantObject(true), standardizationIssues: [{ targetStepLabel: 'x' /* missing required fields */ }] }),
    });
    check(malformedIssuesResult.ok, 'a malformed standardizationIssues entry never fails the overall generation');
    if (malformedIssuesResult.ok) {
        check(malformedIssuesResult.standardizationIssues.length === 0, 'a malformed standardizationIssues entry is dropped rather than surfaced half-parsed');
    }

    console.log(`\nALL SOP STANDARD-DRAFT NODE CONTRACT TESTS PASSED (${passed})`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
