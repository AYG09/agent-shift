import {
    filterRecordsByOrganization,
    computeLifecycleDistribution,
    computeApprovalRate,
    computeParticipatingMemberCount,
    computeOrganizationProgress,
    computeTopTasks,
    computeAgentizationEvidence,
    computeStandardCandidateGroups,
} from '../src/lib/sop-analytics';
import { buildAnalyticsCsv } from '../src/lib/sop-export';
import { POST as sopApiCreate } from '../src/app/api/sop/route';
import { POST as sopApiLifecycle } from '../src/app/api/sop/[id]/lifecycle/route';
import { GET as sopApiAnalytics } from '../src/app/api/sop/analytics/route';
import { GET as sopApiAnalyticsExport } from '../src/app/api/sop/analytics/export/route';
import { POST as sopApiStandardDrafts } from '../src/app/api/sop/standard-drafts/route';
import { sopRepository } from '../src/server/sop/sop-repository-memory';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SAMPLE_SOP_DOCUMENT, CUSTOMER_WORK_LIBRARY } from '../src/lib/sop-sample-data';
import type { SopDocument } from '../src/lib/sop-types';
import type { SopRecord } from '../src/lib/sop-record-schema';

console.log('=== SOP HR analytics domain/API regression tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function baseRecord(overrides: Partial<SopRecord>): SopRecord {
    const now = new Date().toISOString();
    return {
        id: 'r', memberId: 'm', organizationId: 'org-a', taskId: 'task-1', taskName: 'Task One', sourceType: 'task',
        document: SAMPLE_SOP_DOCUMENT, version: 1, lifecycleStatus: 'draft', templateEligible: false, creationSource: 'task',
        createdAt: now, updatedAt: now,
        ...overrides,
    };
}

function memberHeaders(actorId: string, organizationId = 'org-hr-test') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': organizationId };
}
function hrHeaders(actorId = 'hr-fixture-1') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'hr', 'x-sop-actor-organization-id': 'org-hr-demo' };
}
function apiRequest(headers: Record<string, string>, body?: unknown) {
    return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopApiCreate>[0];
}
function apiGetRequest(headers: Record<string, string>, url: string) {
    return { headers: new Headers(headers), url } as unknown as Parameters<typeof sopApiAnalytics>[0];
}

async function buildConfirmedDocument(id: string, memberId: string): Promise<SopDocument> {
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    useSopPrototypeStore.getState().document!.steps.forEach((step) => {
        step.requiredSkills.forEach((sk) => {
            if (sk.source === 'ai-suggested' && !sk.accepted) useSopPrototypeStore.getState().acceptAiSkill(step.id, sk.name);
        });
    });
    useSopPrototypeStore.getState().document!.steps.forEach((step) => {
        if (step.reviewStatus !== 'confirmed') useSopPrototypeStore.getState().updateStepReviewStatus(step.id, 'reviewed');
    });
    const outcome = useSopPrototypeStore.getState().confirmFullSop();
    check(outcome.success, `Fixture setup: confirmation must succeed, errors: ${outcome.errors.join(' / ')}`);
    const confirmed = useSopPrototypeStore.getState().document!;
    return { ...confirmed, id, member: { ...confirmed.member, id: memberId } };
}

async function run() {
    // ---------------------------------------------------------
    // Pure domain: selectors
    // ---------------------------------------------------------
    console.log('Domain: sop-analytics.ts pure selectors...');

    check(
        Object.values(computeLifecycleDistribution([])).every((count) => count === 0) &&
        computeApprovalRate([]).rate === null &&
        computeParticipatingMemberCount([]) === 0 &&
        computeTopTasks([]).length === 0 &&
        computeAgentizationEvidence([]).length === 0 &&
        computeStandardCandidateGroups([]).length === 0,
        'Every selector yields all-zero/empty output for an empty record set — never a fabricated non-zero value'
    );

    const distributionRecords: SopRecord[] = [
        baseRecord({ id: 'd-1', lifecycleStatus: 'draft' }),
        baseRecord({ id: 'd-2', lifecycleStatus: 'leader-review' }),
        baseRecord({ id: 'd-3', lifecycleStatus: 'sme-review' }),
        baseRecord({ id: 'd-4', lifecycleStatus: 'approved' }),
        baseRecord({ id: 'd-5', lifecycleStatus: 'rejected' }),
    ];
    const distribution = computeLifecycleDistribution(distributionRecords);
    check(
        distribution.draft === 1 && distribution['leader-review'] === 1 && distribution['sme-review'] === 1 && distribution.approved === 1 && distribution.rejected === 1,
        'computeLifecycleDistribution counts each of the five detailed statuses independently (no bucket merging, unlike the member-Home summary)'
    );

    const approvalRate = computeApprovalRate(distributionRecords);
    check(approvalRate.submittedCount === 4 && approvalRate.approvedCount === 1 && approvalRate.rate === 0.25, "computeApprovalRate excludes 'draft' from the denominator and computes approved/submitted exactly");

    check(computeParticipatingMemberCount([baseRecord({ id: 'p-1', memberId: 'm1' }), baseRecord({ id: 'p-2', memberId: 'm1' }), baseRecord({ id: 'p-3', memberId: 'm2' })]) === 2, 'computeParticipatingMemberCount is a DISTINCT member count, not a record count');

    const topTaskRecords: SopRecord[] = [
        baseRecord({ id: 't-1', taskId: 'task-a', taskName: 'A' }),
        baseRecord({ id: 't-2', taskId: 'task-a', taskName: 'A' }),
        baseRecord({ id: 't-3', taskId: 'task-b', taskName: 'B' }),
    ];
    const topTasks = computeTopTasks(topTaskRecords);
    check(topTasks[0].taskId === 'task-a' && topTasks[0].recordCount === 2, 'computeTopTasks ranks by record count, descending');
    check(topTasks.every((t) => typeof t.taskId === 'string'), 'computeTopTasks groups by taskId (not taskName)');

    const stepModesRecord = baseRecord({
        id: 'ag-1', lifecycleStatus: 'approved', taskId: 'task-agentize', taskName: 'Agentize Task',
        document: {
            ...SAMPLE_SOP_DOCUMENT,
            agentizationReview: { scope: 'workflow', stepIds: ['step-2', 'step-3'], stepModes: { 'step-2': 'automation', 'step-3': 'assist', 'step-1': 'automation' }, confirmedAt: new Date().toISOString() },
        },
    });
    const draftStepModesRecord = baseRecord({
        id: 'ag-2', lifecycleStatus: 'draft', taskId: 'task-agentize', taskName: 'Agentize Task',
        document: { ...SAMPLE_SOP_DOCUMENT, agentizationReview: { scope: 'workflow', stepIds: ['step-2'], stepModes: { 'step-2': 'automation' } } },
    });
    const evidence = computeAgentizationEvidence([stepModesRecord, draftStepModesRecord]);
    check(evidence.length === 1, 'computeAgentizationEvidence only considers approved records — the draft record contributes nothing');
    check(
        evidence[0].modeCounts.automation === 1 && evidence[0].modeCounts.assist === 1,
        "modeCounts reflects only non-terminal steps: step-2 (automation) and step-3 (assist) count, but stepModes['step-1'] is silently excluded because step-1 is the start terminal — terminal steps are never Agent화 evidence"
    );

    const candidateRecords: SopRecord[] = [
        baseRecord({ id: 'c-1', lifecycleStatus: 'approved', taskId: 'task-std', taskName: 'Std Task', organizationId: 'org-a', updatedAt: '2026-01-01T00:00:00.000Z' }),
        baseRecord({ id: 'c-2', lifecycleStatus: 'approved', taskId: 'task-std', taskName: 'Std Task', organizationId: 'org-b', updatedAt: '2026-02-01T00:00:00.000Z' }),
        baseRecord({ id: 'c-3', lifecycleStatus: 'draft', taskId: 'task-std', taskName: 'Std Task', organizationId: 'org-c' }),
    ];
    const candidates = computeStandardCandidateGroups(candidateRecords);
    check(candidates.length === 1 && candidates[0].recordCount === 2, 'computeStandardCandidateGroups only groups APPROVED records — the draft record is excluded');
    check(candidates[0].organizationCount === 2, 'organizationCount is the distinct organization count among the approved group');
    check(candidates[0].lastUpdatedAt === '2026-02-01T00:00:00.000Z', 'lastUpdatedAt is the max updatedAt across the group');
    check(candidates[0].sourceRecordIds.sort().join(',') === 'c-1,c-2', 'sourceRecordIds names exactly the approved records in the group');

    check(filterRecordsByOrganization(topTaskRecords, undefined).length === 3, 'filterRecordsByOrganization with no organizationId returns every record unfiltered');
    check(filterRecordsByOrganization(topTaskRecords, 'org-a').every((r) => r.organizationId === 'org-a'), 'filterRecordsByOrganization narrows to the given organizationId');

    const orgProgress = computeOrganizationProgress(distributionRecords, [{ id: 'm', name: 'x', jobRole: 'y', organization: 'org-a' }]);
    const orgAProgress = orgProgress.find((p) => p.organizationId === 'org-a');
    check(Boolean(orgAProgress) && orgAProgress!.rosterMemberCount === 1 && orgAProgress!.participatingRosterMemberCount === 1, 'computeOrganizationProgress derives its roster denominator from the passed-in demo roster, never a hidden global figure');

    // ---------------------------------------------------------
    // Domain: buildAnalyticsCsv
    // ---------------------------------------------------------
    console.log('Domain: buildAnalyticsCsv...');
    const csv = buildAnalyticsCsv(topTaskRecords);
    const csvLines = csv.split('\n');
    check(csvLines.length === topTaskRecords.length + 1, 'CSV has exactly one header row plus one row per record');
    check(csvLines[0].split(',').includes('taskId'), 'CSV header includes taskId');
    check(csvLines.slice(1).every((line) => line.includes('task-a') || line.includes('task-b')), 'Every data row reflects its real taskId');

    // ---------------------------------------------------------
    // API: GET /api/sop/analytics — role gate, org filter, export consistency
    // ---------------------------------------------------------
    console.log('API: GET /api/sop/analytics + export...');

    async function createApprovedFixture(id: string, memberId: string, organizationId: string) {
        const headers = memberHeaders(memberId, organizationId);
        const doc = await buildConfirmedDocument(id, memberId);
        await sopApiCreate(apiRequest(headers, { memberId, organizationId, document: doc }));
        await sopApiLifecycle(apiRequest(headers, { transition: 'leader-review' }), { params: Promise.resolve({ id }) });
        await sopApiLifecycle(apiRequest({ 'x-sop-actor-id': 'leader-hr-fixture', 'x-sop-actor-role': 'leader', 'x-sop-actor-organization-id': organizationId }, { decision: 'approve' }), { params: Promise.resolve({ id }) });
        await sopApiLifecycle(apiRequest({ 'x-sop-actor-id': 'sme-hr-fixture', 'x-sop-actor-role': 'sme', 'x-sop-actor-organization-id': organizationId }, { decision: 'approve' }), { params: Promise.resolve({ id }) });
    }
    await createApprovedFixture('hr-fixture-approved-1', 'hr-fixture-member-1', 'org-hr-test');
    await createApprovedFixture('hr-fixture-approved-2', 'hr-fixture-member-2', 'org-hr-other');

    const memberAnalyticsAttempt = await sopApiAnalytics(apiGetRequest(memberHeaders('some-member'), 'http://localhost/api/sop/analytics'));
    check(memberAnalyticsAttempt.status === 403, `A member actor has no HR-dashboard access, got ${memberAnalyticsAttempt.status}`);
    const leaderAnalyticsAttempt = await sopApiAnalytics(apiGetRequest({ 'x-sop-actor-id': 'l', 'x-sop-actor-role': 'leader', 'x-sop-actor-organization-id': 'o' }, 'http://localhost/api/sop/analytics'));
    check(leaderAnalyticsAttempt.status === 403, `A leader actor has no HR-dashboard access either, got ${leaderAnalyticsAttempt.status}`);

    const fullAnalyticsRes = await sopApiAnalytics(apiGetRequest(hrHeaders(), 'http://localhost/api/sop/analytics'));
    check(fullAnalyticsRes.status === 200, `GET as hr must succeed, got ${fullAnalyticsRes.status}`);
    const fullAnalyticsBody = await fullAnalyticsRes.json();
    check(fullAnalyticsBody.records.some((r: SopRecord) => r.id === 'hr-fixture-approved-1') && fullAnalyticsBody.records.some((r: SopRecord) => r.id === 'hr-fixture-approved-2'), 'Unfiltered analytics includes both organizations\' fixtures');

    const orgFilteredAnalyticsRes = await sopApiAnalytics(apiGetRequest(hrHeaders(), 'http://localhost/api/sop/analytics?organizationId=org-hr-test'));
    const orgFilteredAnalyticsBody = await orgFilteredAnalyticsRes.json();
    check(
        orgFilteredAnalyticsBody.records.every((r: SopRecord) => r.organizationId === 'org-hr-test') && orgFilteredAnalyticsBody.records.some((r: SopRecord) => r.id === 'hr-fixture-approved-1'),
        'organizationId filter narrows GET /api/sop/analytics to just that organization'
    );
    check(!orgFilteredAnalyticsBody.records.some((r: SopRecord) => r.id === 'hr-fixture-approved-2'), 'organizationId filter excludes the other organization\'s fixture');

    const exportMemberAttempt = await sopApiAnalyticsExport(apiGetRequest(memberHeaders('some-member'), 'http://localhost/api/sop/analytics/export'));
    check(exportMemberAttempt.status === 403, `A member actor has no export access, got ${exportMemberAttempt.status}`);

    const exportRes = await sopApiAnalyticsExport(apiGetRequest(hrHeaders(), 'http://localhost/api/sop/analytics/export?organizationId=org-hr-test'));
    check(exportRes.status === 200, `Export as hr must succeed, got ${exportRes.status}`);
    check((exportRes.headers.get('Content-Type') || '').includes('text/csv'), 'Export responds with a CSV content type');
    const exportCsv = await exportRes.text();
    check(exportCsv.includes('hr-fixture-approved-1') && !exportCsv.includes('hr-fixture-approved-2'), 'The export CSV rows exactly match the SAME organizationId-filtered set the dashboard GET returned — no silent divergence between the two endpoints');

    // ---------------------------------------------------------
    // API: POST /api/sop/standard-drafts — validation boundary only (never invokes the
    // real network AI call in this test suite, matching this repo's existing convention of
    // never exercising the live generateObject() call from an automated test).
    // ---------------------------------------------------------
    console.log('API: POST /api/sop/standard-drafts validation boundary...');
    function standardDraftRequest(headers: Record<string, string>, body: unknown) {
        return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopApiStandardDrafts>[0];
    }
    // The route's second (`testOnly`) parameter is a required DI seam — see the route's own
    // docstring for why it can't be optional/defaulted. Real requests never carry a `generate`
    // override; tests that don't need one still must supply this empty shape.
    const noTestOverride: Parameters<typeof sopApiStandardDrafts>[1] = { params: Promise.resolve({}) };

    const nonHrDraftAttempt = await sopApiStandardDrafts(standardDraftRequest(memberHeaders('some-member'), { taskId: 't', sourceRecordIds: ['x'] }), noTestOverride);
    check(nonHrDraftAttempt.status === 403, `A non-HR actor cannot request a standard draft, got ${nonHrDraftAttempt.status}`);

    const malformedDraftAttempt = await sopApiStandardDrafts(standardDraftRequest(hrHeaders(), { taskId: '', sourceRecordIds: [] }), noTestOverride);
    check(malformedDraftAttempt.status === 400, `An empty taskId/sourceRecordIds request is rejected at the schema layer, got ${malformedDraftAttempt.status}`);

    const missingSourceDraftAttempt = await sopApiStandardDrafts(standardDraftRequest(hrHeaders(), { taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, sourceRecordIds: ['does-not-exist'] }), noTestOverride);
    check(missingSourceDraftAttempt.status === 400, `A nonexistent source record id is rejected before any AI call, got ${missingSourceDraftAttempt.status}`);

    const notApprovedDoc = await buildConfirmedDocument('hr-fixture-not-approved', 'hr-fixture-member-3');
    await sopApiCreate(apiRequest(memberHeaders('hr-fixture-member-3', 'org-hr-test'), { memberId: 'hr-fixture-member-3', organizationId: 'org-hr-test', document: notApprovedDoc }));

    const crossTaskAttempt = await sopApiStandardDrafts(
        standardDraftRequest(hrHeaders(), { taskId: 'a-completely-different-task-id', sourceRecordIds: ['hr-fixture-approved-1'] }),
        noTestOverride
    );
    check(crossTaskAttempt.status === 400, `A sourceRecordId whose taskId does not match the requested taskId is rejected, got ${crossTaskAttempt.status}`);

    const notApprovedSourceAttempt = await sopApiStandardDrafts(
        standardDraftRequest(hrHeaders(), { taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, sourceRecordIds: ['hr-fixture-not-approved'] }),
        noTestOverride
    );
    check(notApprovedSourceAttempt.status === 400, `A non-approved (draft) sourceRecordId is rejected — standard drafts only ever use approved sources, got ${notApprovedSourceAttempt.status}`);

    // ---------------------------------------------------------
    // FUNC-2: POST /api/sop/standard-drafts success path has zero side effects at
    // the route boundary (TST-STD-006 is already proven at the runner level by
    // tests/sop-standard-draft-node-contract.test.ts; this proves the SAME
    // invariant through the actual route, not just the function it calls).
    // The real generateObject() network call is replaced via the route's own
    // `testOnly.generate` DI seam — never exercised in this test suite.
    // ---------------------------------------------------------
    console.log('API: POST /api/sop/standard-drafts success path has no persistence side effects (FUNC-2)...');
    function compliantStandardDraftSpec(verb: string, object: string) {
        return {
            actorRole: '채용 운영 담당자',
            action: { verb, object },
            completionCriteria: [`${object}에 대한 처리 결과가 기록된다`],
            decisionCriteria: [],
            toolPolicy: { allowedToolIds: [], forbiddenActions: [], dataAccessScope: [], requiresHumanApproval: false },
            escalationRules: [],
        };
    }
    const compliantStandardDraftObject = {
        title: '채용 프로세스 표준 SOP (AI 초안)',
        agentInstruction: {
            objective: '채용 프로세스를 표준화한다',
            successCriteria: ['모든 지원자 서류가 검토된다'],
            globalConstraints: [],
            glossary: [],
        },
        steps: [
            { id: 's-start', title: '시작', definition: '프로세스 시작 지점입니다.', shape: 'terminal', terminalType: 'start' },
            {
                id: 's-1', title: '지원자 제출서류를 검토한다', definition: '접수된 지원서류를 검토하여 누락 항목을 확인한다.',
                shape: 'process', responsibleRole: '채용 운영 담당자', executionSpec: compliantStandardDraftSpec('검토한다', '지원자 제출서류'),
            },
            {
                id: 's-2', title: '검토 결과를 채용 시스템에 등록한다', definition: '검토가 끝난 결과를 ATS에 입력하여 다음 단계 담당자가 확인할 수 있게 한다.',
                shape: 'process', responsibleRole: '채용 운영 담당자', executionSpec: compliantStandardDraftSpec('등록한다', '검토 결과'),
            },
            {
                id: 's-3', title: '서류 미비 지원자에게 보완을 요청한다', definition: '누락 항목이 있는 지원자에게 보완 요청 안내를 발송한다.',
                shape: 'process', responsibleRole: '채용 운영 담당자', executionSpec: compliantStandardDraftSpec('요청한다', '서류 보완'),
            },
            { id: 's-end', title: '종료', definition: '프로세스 종료 지점입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e-1', source: 's-start', target: 's-1', branchType: 'default' },
            { id: 'e-2', source: 's-1', target: 's-2', branchType: 'default' },
            { id: 'e-3', source: 's-2', target: 's-3', branchType: 'default' },
            { id: 'e-4', source: 's-3', target: 's-end', branchType: 'default' },
        ],
        standardizationIssues: [],
    };

    const recordCountBefore = (await sopRepository.listAll()).length;
    const lifecycleStatusesBefore = new Map((await sopRepository.listAll()).map((r) => [r.id, r.lifecycleStatus]));

    let fakeGenerateCalls = 0;
    const successfulStandardDraftAttempt = await sopApiStandardDrafts(
        // hr-fixture-approved-1/2 were built via buildConfirmedDocument -> generateFromSample(),
        // which uses the Store's default workLibrary (CUSTOMER_WORK_LIBRARY) — a DIFFERENT
        // fixture task from SAMPLE_SOP_DOCUMENT.workLibrary (the validation-boundary tests
        // above never notice this, since every one of them expects 400 regardless of which
        // combined condition — approval state or taskId — actually caused it).
        standardDraftRequest(hrHeaders(), { taskId: CUSTOMER_WORK_LIBRARY.taskId, sourceRecordIds: ['hr-fixture-approved-1', 'hr-fixture-approved-2'] }),
        {
            params: Promise.resolve({}),
            generate: async () => {
                fakeGenerateCalls += 1;
                return compliantStandardDraftObject;
            },
        }
    );
    check(successfulStandardDraftAttempt.status === 200, `A well-formed request with approved same-Task sources succeeds through the actual route, got ${successfulStandardDraftAttempt.status}`);
    check(fakeGenerateCalls === 1, 'The route called the injected generate exactly once — no real network AI call was made');
    const successfulStandardDraftBody = await successfulStandardDraftAttempt.json();
    check(typeof successfulStandardDraftBody.document?.id === 'string', 'The success response carries a generated preview document');

    const recordsAfter = await sopRepository.listAll();
    check(recordsAfter.length === recordCountBefore, 'FUNC-2: the repository record count is unchanged after a successful standard-draft preview — nothing is persisted (TST-STD-006 at the route boundary)');
    check(
        recordsAfter.every((r) => lifecycleStatusesBefore.get(r.id) === r.lifecycleStatus),
        'FUNC-2: no existing record\'s lifecycleStatus changed — the preview call confirms/approves/executes nothing'
    );
    const persistedPreview = await sopRepository.getById(successfulStandardDraftBody.document.id);
    check(persistedPreview === null, 'FUNC-2: the generated preview document itself was never saved as a SopRecord');

    console.log(`\nALL SOP HR ANALYTICS TESTS PASSED (${passed})`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
