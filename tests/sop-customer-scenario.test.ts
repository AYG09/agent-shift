import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopMemberHomeView } from '../src/components/sop/SopMemberHome';
import { SopMemberLoginGateView } from '../src/components/sop/SopMemberLoginGate';
import { SopMemberContextFormView } from '../src/components/sop/SopMemberContextForm';
import { SopTaskRecommendationFlowView } from '../src/components/sop/SopTaskRecommendationFlow';
import { SopWorkMapSimpleView } from '../src/components/sop/SopWorkMapSimpleView';
import { SopWorkMapDetailedView } from '../src/components/sop/SopWorkMapDetailedView';
import { runSopSetupGeneration } from '../src/lib/sop-setup-actions';
import { isAuthenticated, SOP_INTAKE_ROUTES } from '../src/lib/sop-member-intake';
import { SOP_TASK_LIBRARY_FIXTURE } from '../src/lib/sop-task-library';
import { selectWorkMapActivities } from '../src/lib/sop-work-map-draft';
import { SAMPLE_SOP_DOCUMENT } from '../src/lib/sop-sample-data';
import { POST as sopApiCreate, GET as sopApiList } from '../src/app/api/sop/route';
import { POST as sopApiLifecycle } from '../src/app/api/sop/[id]/lifecycle/route';
import { PUT as sopApiUpdate } from '../src/app/api/sop/[id]/route';
import { GET as sopApiApprovals } from '../src/app/api/sop/approvals/route';
import { GET as sopApiAnalytics } from '../src/app/api/sop/analytics/route';
import type { SopDocument, SopMember } from '../src/lib/sop-types';
import type { SopGenerationRequestBodyParams } from '../src/lib/sop-ai-request';
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
        // 추천 흐름은 fetchImpl → response.json() → 컴포넌트 .then 콜백까지 여러 단계의
        // microtask를 거친다(tests/sop-task-recommendation-flow.test.tsx와 동일한 값).
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
}
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
/**
 * `TestInstance.props.children`(React element 트리, children이 props 안에 있음)와
 * `renderer.toJSON()`(children이 최상위 필드로 분리된 직렬화 트리) 두 형태를 모두 받아들인다.
 */
function extractText(node: unknown): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (typeof node === 'object') {
        const record = node as { children?: unknown; props?: { children?: unknown } };
        if ('children' in record) return extractText(record.children);
        if (record.props && 'children' in record.props) return extractText(record.props.children);
    }
    return '';
}
function findButtonByText(renderer: TestRenderer.ReactTestRenderer, text: string) {
    return renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(text));
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

/**
 * 08_WAVE2_INTEGRATION.md §실행 가능한 수용 시나리오 (1~12).
 *
 * `run()` 위쪽 함수는 이미 승인/반려/HR 흐름을 실제 API 호출로 증명한다 — 이는
 * 시나리오 12("기존 colleague/own-prior/approval/HR 시나리오 회귀 없음")의 근거이며,
 * colleague/own-prior 자체는 tests/sop-member-home.test.ts가 별도로 증명한다.
 *
 * 이 함수는 나머지 1~11번을 **하나의 연속된 구성원 세션**으로 증명한다 — 각 화면을
 * 격리해서 검증하는 Wave 1 테스트들과 달리, 한 화면의 Store 변경이 실제로 다음
 * 화면에 그대로 이어지는지(로그인 → 업무맥락 → 추천 → Work Map → 생성)를 실제
 * 컴포넌트 렌더링으로 순서대로 실행해 증명한다. source-string 검색을 쓰지 않는다.
 */
async function runMemberIntakeScenarios() {
    console.log('\n=== 08 §실행 가능한 수용 시나리오 (1~11, 새 구성원 진입 흐름) ===');

    const job = SOP_TASK_LIBRARY_FIXTURE.jobs.find((candidate) => candidate.name === 'Talent Acquisition')!;
    const representativeTask = job.tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화')!;
    const originalFixtureSnapshot = JSON.stringify(representativeTask);

    // ---------------------------------------------------------
    // 1. anonymous → login validation → context
    // ---------------------------------------------------------
    console.log('1. anonymous → login validation → context...');
    useSopPrototypeStore.getState().resetStore();
    check(!isAuthenticated(useSopPrototypeStore.getState().memberSession), '세션은 anonymous로 시작한다');

    const loginNav: string[] = [];
    let loginRenderer = renderComponent(React.createElement(SopMemberLoginGateView, { navigate: (href: string) => loginNav.push(href) }));
    act(() => {
        loginRenderer.root.findByType('form').props.onSubmit({ preventDefault: () => {} });
    });
    check(!isAuthenticated(useSopPrototypeStore.getState().memberSession), '필수 필드가 비어 있는 로그인 제출은 세션을 만들지 않는다(검증)');
    check(loginNav.length === 0, '거부된 로그인 제출은 어떤 곳으로도 이동하지 않는다');
    act(() => loginRenderer.unmount());

    loginRenderer = renderComponent(React.createElement(SopMemberLoginGateView, { navigate: (href: string) => loginNav.push(href) }));
    const loginInputs = loginRenderer.root.findAllByType('input');
    const byLoginId = (id: string) => loginInputs.find((i) => i.props.id === id);
    act(() => {
        byLoginId('sop-login-employeeId')!.props.onChange({ target: { value: 'E2E-0001' } });
        byLoginId('sop-login-name')!.props.onChange({ target: { value: 'E2E 시나리오 구성원' } });
        byLoginId('sop-login-organization')!.props.onChange({ target: { value: '인사기획팀' } });
        byLoginId('sop-login-jobRole')!.props.onChange({ target: { value: 'Talent Acquisition' } });
    });
    act(() => {
        loginRenderer.root.findByType('form').props.onSubmit({ preventDefault: () => {} });
    });
    check(isAuthenticated(useSopPrototypeStore.getState().memberSession), '유효한 4개 필수 필드 제출은 authenticated 세션을 만든다');
    check(loginNav.at(-1) === SOP_INTAKE_ROUTES.context, '로그인 성공 후 /sop/context로 이동한다');
    act(() => loginRenderer.unmount());

    // ---------------------------------------------------------
    // 2. context submit → recommendation request 정확히 1회
    // ---------------------------------------------------------
    console.log('2. context submit → recommendation request 정확히 1회...');
    const contextText = '채용 공고를 등록하고 지원자를 서류·면접으로 선발하는 업무를 수행합니다.';
    const contextNav: string[] = [];
    const contextRenderer = renderComponent(React.createElement(SopMemberContextFormView, { navigate: (href: string) => contextNav.push(href) }));
    act(() => {
        contextRenderer.root.findByType('textarea').props.onChange({ target: { value: contextText } });
    });
    act(() => {
        contextRenderer.root.findByType('form').props.onSubmit({ preventDefault: () => {} });
    });
    check(useSopPrototypeStore.getState().memberContext.confirmedText === contextText, '확정된 업무맥락이 입력한 원문과 정확히 같다(REQ-CTX-004)');
    check(useSopPrototypeStore.getState().taskRecommendation.status === 'pending', '업무맥락 제출은 추천 상태를 pending으로 전이시킨다');
    check(contextNav.at(-1) === SOP_INTAKE_ROUTES.recommendation, '업무맥락 제출 후 /sop/recommendation으로 이동한다');
    act(() => contextRenderer.unmount());

    // ---------------------------------------------------------
    // 3. loading → validated recommendations
    // 4. 추천 성공만으로 Task 미확정
    // ---------------------------------------------------------
    console.log('3~4. loading → validated recommendations, 추천 성공만으로 Task 미확정...');
    let recommendationCallCount = 0;
    let sentBriefWorkDescription = '';
    const recommendationFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        recommendationCallCount += 1;
        const body = JSON.parse(String(init?.body ?? '{}'));
        sentBriefWorkDescription = body.briefWorkDescription;
        return jsonResponse({
            candidates: [{ taskId: representativeTask.id, rank: 1, reason: '업무 설명과 핵심 Activity가 일치합니다.' }],
        });
    }) as unknown as typeof fetch;

    const recommendationNav: string[] = [];
    const recommendationRenderer = renderComponent(
        React.createElement(SopTaskRecommendationFlowView, { navigate: (href: string) => recommendationNav.push(href), fetchImpl: recommendationFetch })
    );
    check(useSopPrototypeStore.getState().taskRecommendation.status === 'pending', '마운트 직후에는 여전히 pending(로딩) 상태다');
    await flushEffects();
    check(recommendationCallCount === 1, 'TST-STATE-003: 업무맥락 제출 한 번에 추천 API 호출은 정확히 한 번이다');
    check(useSopPrototypeStore.getState().taskRecommendation.status === 'ready', '성공 응답 후 상태는 ready다');
    check(useSopPrototypeStore.getState().workMapDraft === null, 'TST-REC-003: 추천 성공만으로는 Work Map이 만들어지지 않는다(Task 미확정)');
    const readyText = extractText(recommendationRenderer.toJSON());
    check(readyText.includes(representativeTask.name), '추천된 Task명이 화면에 표시된다');

    // ---------------------------------------------------------
    // 5. 명시적 confirm → member-owned Work Map snapshot
    // ---------------------------------------------------------
    console.log('5. 명시적 confirm → member-owned Work Map snapshot...');
    const confirmButton = findButtonByText(recommendationRenderer, '이 Task로 계속');
    check(Boolean(confirmButton), '추천 결과에 명시적 확정 버튼이 있다');
    act(() => {
        confirmButton!.props.onClick();
    });
    check(useSopPrototypeStore.getState().workMapDraft?.sourceTaskId === representativeTask.id, '명시적 확인 후 추천 Task로 구성원 소유 Work Map 초안이 생성된다');
    check(recommendationNav.at(-1) === SOP_INTAKE_ROUTES.workMapSimple, '확정 후 /sop/work-map/simple로 이동한다');
    act(() => recommendationRenderer.unmount());

    // ---------------------------------------------------------
    // 6. simple 편집 → detailed 반영, detailed 편집 → simple drawer 반영
    // ---------------------------------------------------------
    console.log('6. simple 편집 → detailed 반영, detailed 편집 → simple drawer 반영...');
    const firstActivityBefore = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!)[0];
    const editedNameFromSimple = 'E2E 수정된 Activity명 (simple)';
    const editedDescriptionFromDetailed = 'E2E 수정된 설명 (detailed)';

    let simpleRenderer = renderComponent(React.createElement(SopWorkMapSimpleView, { navigate: () => {} }));
    act(() => {
        simpleRenderer.root.findByProps({ 'aria-label': `${firstActivityBefore.name} 편집` }).props.onClick();
    });
    const simpleNameInput = simpleRenderer.root.findAllByType('input').find((i) => i.props.value === firstActivityBefore.name)!;
    act(() => {
        simpleNameInput.props.onChange({ target: { value: editedNameFromSimple } });
    });
    act(() => simpleRenderer.unmount());

    const detailedRenderer = renderComponent(React.createElement(SopWorkMapDetailedView, { navigate: () => {} }));
    const detailedText = extractText(detailedRenderer.toJSON());
    check(detailedText.includes(editedNameFromSimple), 'simple에서 편집한 Activity명이 detailed 화면에도 즉시 반영된다(같은 Foundation draft)');
    const editedActivityInput = detailedRenderer.root.findAllByType('input').find((i) => i.props.value === editedNameFromSimple)!;
    const descriptionArea = detailedRenderer.root
        .findAllByType('textarea')
        .find((t) => t.props.value === firstActivityBefore.description);
    check(Boolean(editedActivityInput) && Boolean(descriptionArea), 'detailed 화면에서 같은 Activity의 이름·설명 필드를 편집할 수 있다');
    act(() => {
        descriptionArea!.props.onChange({ target: { value: editedDescriptionFromDetailed } });
    });
    act(() => detailedRenderer.unmount());

    simpleRenderer = renderComponent(React.createElement(SopWorkMapSimpleView, { navigate: () => {} }));
    act(() => {
        simpleRenderer.root.findByProps({ 'aria-label': `${editedNameFromSimple} 편집` }).props.onClick();
    });
    const simpleDescriptionArea = simpleRenderer.root.findAllByType('textarea').find((t) => t.props.value === editedDescriptionFromDetailed);
    check(Boolean(simpleDescriptionArea), 'detailed에서 편집한 설명이 simple의 편집 drawer에도 즉시 반영된다');

    // ---------------------------------------------------------
    // 7. Task Library 원본 불변
    // ---------------------------------------------------------
    console.log('7. Task Library 원본 불변...');
    check(JSON.stringify(representativeTask) === originalFixtureSnapshot, 'TST-WM-007: 모든 편집 이후에도 원본 Task Library fixture는 변하지 않는다');

    // ---------------------------------------------------------
    // 8. Work Map confirm → 모든 Activity를 포함한 generation request
    // 9. 동일 context 문자열이 recommendation과 generation에 사용됨
    // ---------------------------------------------------------
    console.log('8~9. Work Map confirm → 모든 Activity 포함, 동일 context 문자열 사용...');
    const orderedActivityIds = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!).map((a) => a.id);
    act(() => {
        findButtonByText(simpleRenderer, '검토 완료')!.props.onClick();
    });
    // handleReviewComplete/confirmWorkMapAndProceed의 navigate는 렌더러에 주입되지 않고
    // 이 화면 자체의 navigate prop(무시됨)을 쓰므로, 실제 확정 결과는 Store에서 직접 검증한다.
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === true, '유효한 Work Map은 확정된다');
    const confirmedWorkLibrary = useSopPrototypeStore.getState().workLibrary;
    check(confirmedWorkLibrary.sourceType === 'task' && confirmedWorkLibrary.confirmed === true, '확정된 Work Map이 기존 생성 계약(workLibrary)에 연결된다(REQ-WM-006)');
    const generationActivityIds = confirmedWorkLibrary.taskCatalog.find((t) => t.id === confirmedWorkLibrary.taskId)!.activities.map((a) => a.id);
    check(JSON.stringify(generationActivityIds) === JSON.stringify(orderedActivityIds), 'TST-WM-008: 생성 request가 확정 Work Map의 모든 Activity를 원본 순서대로 포함한다');
    check(
        useSopPrototypeStore.getState().context === sentBriefWorkDescription,
        '동일 context 문자열이 추천 request(briefWorkDescription)와 생성 request(context 미러)에 모두 사용된다(REQ-CTX-004/TST-STATE-004)'
    );
    act(() => simpleRenderer.unmount());

    // ---------------------------------------------------------
    // 10. generation success → Workspace
    // ---------------------------------------------------------
    console.log('10. generation success → Workspace...');
    const memberInfo = useSopPrototypeStore.getState().memberInfo;
    const setupConfig = useSopPrototypeStore.getState().setupConfig;
    const context = useSopPrototypeStore.getState().context;
    const selectedTask = confirmedWorkLibrary.taskCatalog.find((t) => t.id === confirmedWorkLibrary.taskId)!;
    const activitiesForGeneration = [...selectedTask.activities]
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .map((activity) => ({ id: activity.id, order: activity.order, name: activity.name, description: activity.description, skills: activity.skills }));

    // FUNC-1: Activity 순서·완전성(TST-WM-008)뿐 아니라, 각 Activity에 중첩된 Skill 관계도
    // 생성 request에 그대로 보존되는지 검증한다(implementation-contract.md §1 "반복
    // Activity-Skill 관계를 전역에서 평탄화하지 않는다").
    const confirmedDraftActivities = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    const draftSkillIdsByActivity = confirmedDraftActivities.map((a) => a.skills.map((s) => s.id));
    const generationSkillIdsByActivity = activitiesForGeneration.map((a) => a.skills.map((s) => s.id));
    check(
        JSON.stringify(generationSkillIdsByActivity) === JSON.stringify(draftSkillIdsByActivity),
        'FUNC-1: 생성 request의 Activity별 Skill ID 배열이 확정 Work Map draft의 것과 정확히 같다(중첩 관계 보존, 전역 평탄화 없음)'
    );

    const requestParams: SopGenerationRequestBodyParams = {
        memberRole: memberInfo.jobRole,
        sourceJobId: confirmedWorkLibrary.sourceJobId || 'legacy-job',
        jobName: confirmedWorkLibrary.jobName || memberInfo.jobRole,
        taskId: confirmedWorkLibrary.taskId,
        taskName: confirmedWorkLibrary.taskName,
        taskDefinition: selectedTask.description || '구성원이 정의한 Task',
        sourceType: confirmedWorkLibrary.sourceType,
        structureVersion: 'activity-subaction-v1',
        activities: activitiesForGeneration,
        skills: confirmedWorkLibrary.skills,
        context,
        ...setupConfig,
    };
    const workspaceNav: string[] = [];
    let generateCalls = 0;
    const generationResult = await runSopSetupGeneration({
        customerReviewMode: useSopPrototypeStore.getState().customerReviewMode,
        requestParams,
        apiParams: { member: memberInfo, workLibrary: confirmedWorkLibrary, context, setupConfig, structureVersion: 'activity-subaction-v1' },
        setDocument: useSopPrototypeStore.getState().setDocument,
        navigate: (href) => workspaceNav.push(href),
        setIsGenerating: () => {},
        setValidationError: () => {},
        setAiError: () => {},
        generate: async () => {
            generateCalls += 1;
            return { success: true, document: SAMPLE_SOP_DOCUMENT };
        },
    });
    check(generationResult.success && generateCalls === 1, `Work Map 확정 후 생성 요청은 정확히 한 번의 AI 호출로 성공한다, got: ${!generationResult.success ? generationResult.message : ''}`);
    check(workspaceNav.at(-1) === '/sop/workspace', '생성 성공 후 /sop/workspace로 이동한다');
    check(useSopPrototypeStore.getState().document !== null, '생성 성공 후 문서가 Store에 반영된다');

    // ---------------------------------------------------------
    // 11. recommendation/generation failure 후 입력 보존·재시도
    // ---------------------------------------------------------
    console.log('11. recommendation/generation failure 후 입력 보존·재시도...');

    // 11a. 추천 실패는 확정 업무맥락을 지우지 않는다 — 재시도·수동 검색 경로는
    // tests/sop-task-recommendation-flow.test.tsx가 이미 상세히 증명한다.
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().submitMemberIdentity({ employeeId: 'E2E-0002', name: 'E2E 재시도 구성원', organization: '인사기획팀', jobRole: 'Talent Acquisition' });
    useSopPrototypeStore.getState().setMemberContextDraft(contextText);
    useSopPrototypeStore.getState().submitMemberContext();
    const failingFetch = (async () => {
        throw new Error('네트워크 오류로 추천을 받아오지 못했습니다.');
    }) as unknown as typeof fetch;
    const retryRenderer = renderComponent(React.createElement(SopTaskRecommendationFlowView, { navigate: () => {}, fetchImpl: failingFetch }));
    await flushEffects();
    check(useSopPrototypeStore.getState().taskRecommendation.status === 'error', '추천 API 실패 시 상태는 error다');
    check(useSopPrototypeStore.getState().memberContext.confirmedText === contextText, '추천 실패 후에도 확정 업무맥락 원문이 그대로 보존된다(재시도 가능)');
    act(() => retryRenderer.unmount());

    // 11b. 생성 실패는 이미 확정된 Work Map/workLibrary를 전혀 건드리지 않는다.
    const workMapDraftBeforeFailure = JSON.stringify(useSopPrototypeStore.getState().workMapDraft);
    const workLibraryBeforeFailure = JSON.stringify(useSopPrototypeStore.getState().workLibrary);
    const failedGenerationResult = await runSopSetupGeneration({
        customerReviewMode: false,
        requestParams,
        apiParams: { member: memberInfo, workLibrary: confirmedWorkLibrary, context, setupConfig, structureVersion: 'activity-subaction-v1' },
        setDocument: useSopPrototypeStore.getState().setDocument,
        navigate: (href) => workspaceNav.push(href),
        setIsGenerating: () => {},
        setValidationError: () => {},
        setAiError: () => {},
        generate: async () => ({ success: false, error: 'AI 생성 요청이 실패했습니다 (E2E 시뮬레이션).' }),
    });
    check(!failedGenerationResult.success, '생성 실패는 실패로 보고된다');
    check(workspaceNav.length === 1, '생성 실패는 추가로 어떤 곳으로도 이동시키지 않는다(직전 성공 1건만 유지)');
    check(
        JSON.stringify(useSopPrototypeStore.getState().workMapDraft) === workMapDraftBeforeFailure &&
            JSON.stringify(useSopPrototypeStore.getState().workLibrary) === workLibraryBeforeFailure,
        '생성 실패 후에도 확정된 Work Map/workLibrary 입력이 전혀 손실되지 않아 재시도할 수 있다'
    );

    useSopPrototypeStore.getState().resetStore();
    console.log(`\nALL 08 §MEMBER INTAKE SCENARIO TESTS PASSED (${passed})`);
}

async function main() {
    await run();
    await runMemberIntakeScenarios();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
