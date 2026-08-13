import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopMemberHomeView } from '../src/components/sop/SopMemberHome';
import { POST as sopApiCreate, GET as sopApiList } from '../src/app/api/sop/route';
import { POST as sopApiLifecycle } from '../src/app/api/sop/[id]/lifecycle/route';
import { PUT as sopApiUpdate } from '../src/app/api/sop/[id]/route';
import { GET as sopApiApprovals } from '../src/app/api/sop/approvals/route';
import { GET as sopApiAnalytics } from '../src/app/api/sop/analytics/route';
import type { SopDocument, SopMember } from '../src/lib/sop-types';
import type { SopRecord } from '../src/lib/sop-record-schema';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP final customer scenario — full end-to-end orchestration ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function memberHeaders(actorId: string, organizationId: string) {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': organizationId };
}
function reviewerHeaders(role: 'leader' | 'sme', actorId: string, organizationId: string) {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': role, 'x-sop-actor-organization-id': organizationId };
}
function apiRequest(headers: Record<string, string>, body?: unknown) {
    return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopApiCreate>[0];
}
function apiGetRequest(headers: Record<string, string>, url: string) {
    return { headers: new Headers(headers), url } as unknown as Parameters<typeof sopApiApprovals>[0];
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

function renderComponent(element: React.ReactElement): TestRenderer.ReactTestRenderer {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(element);
    });
    return renderer;
}
async function flushEffects() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function run() {
    const ORG = 'org-scenario-e2e';
    const memberId = 'e2e-member';
    const memberHeaderSet = memberHeaders(memberId, ORG);

    // ---------------------------------------------------------
    // 1. Member creates, confirms, and submits a real Task-wide SOP.
    // ---------------------------------------------------------
    console.log('1. Member creates and submits a confirmed SOP...');
    const doc = await buildConfirmedDocument('e2e-doc-1', memberId);
    const createRes = await sopApiCreate(apiRequest(memberHeaderSet, { memberId, organizationId: ORG, document: doc }));
    check(createRes.status === 201, `Create must succeed, got ${createRes.status}`);
    const created = (await createRes.json()).record as SopRecord;
    check(created.lifecycleStatus === 'draft', 'A newly created record starts as draft');

    const submitRes = await sopApiLifecycle(apiRequest(memberHeaderSet, { transition: 'leader-review' }), { params: Promise.resolve({ id: created.id }) });
    check(submitRes.status === 200, `Submit must succeed, got ${submitRes.status}`);

    // ---------------------------------------------------------
    // 2. The exact same record appears in the leader inbox.
    // ---------------------------------------------------------
    console.log('2. The submitted record appears in the leader Inbox...');
    const leaderQueueRes = await sopApiApprovals(apiGetRequest(reviewerHeaders('leader', 'e2e-leader', ORG), 'http://localhost/api/sop/approvals'));
    const leaderQueueBody = await leaderQueueRes.json();
    const leaderQueueEntry = leaderQueueBody.records.find((r: SopRecord) => r.id === created.id);
    check(Boolean(leaderQueueEntry) && leaderQueueEntry.lifecycleStatus === 'leader-review', 'The member\'s submitted record is visible to the leader, at leader-review');

    // ---------------------------------------------------------
    // 3. Leader approves — the SAME record now appears in the SME inbox, never approved yet.
    // ---------------------------------------------------------
    console.log('3. Leader approval moves the record to the SME Inbox...');
    const leaderApproveRes = await sopApiLifecycle(apiRequest(reviewerHeaders('leader', 'e2e-leader', ORG), { decision: 'approve' }), { params: Promise.resolve({ id: created.id }) });
    check(leaderApproveRes.status === 200, `Leader approve must succeed, got ${leaderApproveRes.status}`);
    const afterLeaderApprove = (await leaderApproveRes.json()).record as SopRecord;
    check(afterLeaderApprove.lifecycleStatus === 'sme-review', 'Leader approval moves the record to sme-review, not straight to approved');

    const smeQueueRes = await sopApiApprovals(apiGetRequest(reviewerHeaders('sme', 'e2e-sme', ORG), 'http://localhost/api/sop/approvals'));
    const smeQueueBody = await smeQueueRes.json();
    check(smeQueueBody.records.some((r: SopRecord) => r.id === created.id), 'The SAME record (same id) now appears in the SME Inbox');

    // ---------------------------------------------------------
    // 4. SME approves — member Home status and HR analytics both reflect it.
    // ---------------------------------------------------------
    console.log('4. SME approval reflects in member Home and HR analytics...');
    const smeApproveRes = await sopApiLifecycle(apiRequest(reviewerHeaders('sme', 'e2e-sme', ORG), { decision: 'approve' }), { params: Promise.resolve({ id: created.id }) });
    check(smeApproveRes.status === 200, `SME approve must succeed, got ${smeApproveRes.status}`);
    const afterSmeApprove = (await smeApproveRes.json()).record as SopRecord;
    check(afterSmeApprove.lifecycleStatus === 'approved', 'SME approval finalizes the record as approved');

    const memberListRes = await sopApiList(apiGetRequest(memberHeaderSet, 'http://localhost/api/sop'));
    const memberListBody = await memberListRes.json();
    check(memberListBody.records.some((r: SopRecord) => r.id === created.id && r.lifecycleStatus === 'approved'), 'Member Home\'s own record list (GET /api/sop) reflects the approval');

    const hrAnalyticsRes = await sopApiAnalytics(apiGetRequest({ 'x-sop-actor-id': 'e2e-hr', 'x-sop-actor-role': 'hr', 'x-sop-actor-organization-id': ORG }, `http://localhost/api/sop/analytics?organizationId=${ORG}`));
    const hrAnalyticsBody = await hrAnalyticsRes.json();
    check(hrAnalyticsBody.records.some((r: SopRecord) => r.id === created.id), 'HR analytics (org-filtered) includes the newly approved record');
    check(hrAnalyticsBody.lifecycleDistribution.approved >= 1, 'HR lifecycle distribution counts the approval');

    // ---------------------------------------------------------
    // 5. Second SOP: leader rejects -> member sees feedback -> edits -> reconfirms -> resubmits.
    // ---------------------------------------------------------
    console.log('5. Reject -> member sees feedback -> edits -> reconfirms -> resubmits...');
    const doc2 = await buildConfirmedDocument('e2e-doc-2', memberId);
    const createRes2 = await sopApiCreate(apiRequest(memberHeaderSet, { memberId, organizationId: ORG, document: doc2 }));
    const created2 = (await createRes2.json()).record as SopRecord;
    await sopApiLifecycle(apiRequest(memberHeaderSet, { transition: 'leader-review' }), { params: Promise.resolve({ id: created2.id }) });

    const rejectRes = await sopApiLifecycle(
        apiRequest(reviewerHeaders('leader', 'e2e-leader', ORG), { decision: 'reject', reasonCode: 'insufficient-detail', feedback: '(E2E) 3단계 기준을 더 구체적으로 작성해 주세요.' }),
        { params: Promise.resolve({ id: created2.id }) }
    );
    check(rejectRes.status === 200, `Reject must succeed, got ${rejectRes.status}`);
    const rejectedRecord = (await rejectRes.json()).record as SopRecord;
    check(rejectedRecord.lifecycleStatus === 'rejected' && Boolean(rejectedRecord.rejection?.feedback.includes('구체적')), 'The record is rejected and carries the leader\'s exact feedback');

    // Member Home component: the feedback must be visibly shown.
    const memberInfo: SopMember = { id: memberId, name: '시나리오 구성원', jobRole: '채용담당자', organization: ORG };
    useSopPrototypeStore.setState({ memberInfo, document: null });
    const homeFetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/sop')) return jsonResponse({ records: [rejectedRecord] });
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
        return jsonResponse({ error: 'unhandled' }, 404);
    }) as unknown as typeof fetch;
    const homeRenderer = renderComponent(React.createElement(SopMemberHomeView, { navigate: () => {}, fetchImpl: homeFetch }));
    await flushEffects();
    const homeText = JSON.stringify(homeRenderer.toJSON());
    check(homeText.includes('구체적으로 작성해 주세요'), 'Member Home visibly shows the rejection feedback');
    check(homeText.includes('재시작 시 초기화될 수 있습니다'), 'Member Home states the non-persistence caveat explicitly (재시작 시 초기화 안내)');
    const editButton = homeRenderer.root.findAllByType('button').find((b) => {
        const text = JSON.stringify(b.props.children);
        return text.includes('수정하기');
    });
    check(Boolean(editButton), 'Member Home offers a "수정하기" action for the rejected record');
    act(() => {
        editButton!.props.onClick();
    });
    check(useSopPrototypeStore.getState().document?.id === 'e2e-doc-2', '"수정하기" loads the rejected record\'s own document back into the editor');
    check(useSopPrototypeStore.getState().customerReviewMode === false, '"수정하기" deterministically unlocks customer review mode');
    act(() => {
        homeRenderer.unmount();
    });

    // Member edits (title change) and re-saves — allowed because 'rejected' is member-editable.
    const editedDoc: SopDocument = { ...doc2, title: '수정된 제목 (E2E)' };
    const editPutRes = await sopApiUpdate(apiRequest(memberHeaderSet, { document: editedDoc, expectedVersion: rejectedRecord.version }), { params: Promise.resolve({ id: created2.id }) });
    check(editPutRes.status === 200, `Editing a rejected record's content must succeed, got ${editPutRes.status}`);

    const resubmitRes = await sopApiLifecycle(apiRequest(memberHeaderSet, { transition: 'leader-review' }), { params: Promise.resolve({ id: created2.id }) });
    check(resubmitRes.status === 200, `Resubmission after reconfirmation must succeed, got ${resubmitRes.status}`);
    const resubmitted = (await resubmitRes.json()).record as SopRecord;
    check(resubmitted.lifecycleStatus === 'leader-review' && resubmitted.rejection === undefined, 'Resubmission restarts at leader-review and clears the prior rejection — visible to the leader again');

    const leaderQueueAfterResubmit = await sopApiApprovals(apiGetRequest(reviewerHeaders('leader', 'e2e-leader', ORG), 'http://localhost/api/sop/approvals'));
    const leaderQueueAfterResubmitBody = await leaderQueueAfterResubmit.json();
    check(leaderQueueAfterResubmitBody.records.some((r: SopRecord) => r.id === created2.id && r.document.title === '수정된 제목 (E2E)'), 'The resubmitted, edited record is visible to the leader again with the member\'s actual edit');

    console.log(`\nALL SOP CUSTOMER SCENARIO E2E TESTS PASSED (${passed})`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
