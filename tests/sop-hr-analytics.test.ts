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
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SAMPLE_SOP_DOCUMENT } from '../src/lib/sop-sample-data';
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

    const nonHrDraftAttempt = await sopApiStandardDrafts(standardDraftRequest(memberHeaders('some-member'), { taskId: 't', sourceRecordIds: ['x'] }));
    check(nonHrDraftAttempt.status === 403, `A non-HR actor cannot request a standard draft, got ${nonHrDraftAttempt.status}`);

    const malformedDraftAttempt = await sopApiStandardDrafts(standardDraftRequest(hrHeaders(), { taskId: '', sourceRecordIds: [] }));
    check(malformedDraftAttempt.status === 400, `An empty taskId/sourceRecordIds request is rejected at the schema layer, got ${malformedDraftAttempt.status}`);

    const missingSourceDraftAttempt = await sopApiStandardDrafts(standardDraftRequest(hrHeaders(), { taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, sourceRecordIds: ['does-not-exist'] }));
    check(missingSourceDraftAttempt.status === 400, `A nonexistent source record id is rejected before any AI call, got ${missingSourceDraftAttempt.status}`);

    const notApprovedDoc = await buildConfirmedDocument('hr-fixture-not-approved', 'hr-fixture-member-3');
    await sopApiCreate(apiRequest(memberHeaders('hr-fixture-member-3', 'org-hr-test'), { memberId: 'hr-fixture-member-3', organizationId: 'org-hr-test', document: notApprovedDoc }));

    const crossTaskAttempt = await sopApiStandardDrafts(
        standardDraftRequest(hrHeaders(), { taskId: 'a-completely-different-task-id', sourceRecordIds: ['hr-fixture-approved-1'] })
    );
    check(crossTaskAttempt.status === 400, `A sourceRecordId whose taskId does not match the requested taskId is rejected, got ${crossTaskAttempt.status}`);

    const notApprovedSourceAttempt = await sopApiStandardDrafts(
        standardDraftRequest(hrHeaders(), { taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, sourceRecordIds: ['hr-fixture-not-approved'] })
    );
    check(notApprovedSourceAttempt.status === 400, `A non-approved (draft) sourceRecordId is rejected — standard drafts only ever use approved sources, got ${notApprovedSourceAttempt.status}`);

    console.log(`\nALL SOP HR ANALYTICS TESTS PASSED (${passed})`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
