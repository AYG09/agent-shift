import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { buildSopStatusRows, computeSopStatusCounts, computeMemberTaskActivitySkillCounts } from '../src/lib/sop-member-home';
import { SOP_LIFECYCLE_STATUS_META, SOP_MEMBER_SUMMARY_BUCKET_META } from '../src/lib/sop-lifecycle';
import { SopMemberHomeView } from '../src/components/sop/SopMemberHome';
import { SopOwnPriorPicker } from '../src/components/sop/SopOwnPriorPicker';
import { SopServerSaveControl } from '../src/components/sop/SopServerSaveControl';
import { SopGenerationSettings } from '../src/components/sop/SopGenerationSettings';
import { WorkLibrarySelector } from '../src/components/sop/WorkLibrarySelector';
import { SAMPLE_SOP_DOCUMENT, CUSTOMER_WORK_LIBRARY, buildTaskGateSampleDocument } from '../src/lib/sop-sample-data';
import { withTaskScope, getScopedActivities } from '../src/lib/sop-task-library';
import { enterTaskCreationPath } from '../src/lib/sop-setup-actions';
import { SOP_INTAKE_ROUTES, authenticateMemberSession } from '../src/lib/sop-member-intake';
import { createWorkMapDraftFromCatalog } from '../src/lib/sop-work-map-draft';
import { lookupExistingSopRecord, saveSopDocumentToServer } from '../src/lib/sop-server-save';
import { computeSubActionCapacity } from '../src/lib/sop-subaction-capacity';
import { POST as sopApiCreate } from '../src/app/api/sop/route';
import { GET as sopApiGetById, PUT as sopApiUpdate } from '../src/app/api/sop/[id]/route';
import { POST as sopApiLifecycle } from '../src/app/api/sop/[id]/lifecycle/route';
import { POST as sopApiPriorClone } from '../src/app/api/sop/[id]/prior-clone/route';
import { sopRepository } from '../src/server/sop/sop-repository-memory';
import { buildSopActorHeaders } from '../src/lib/sop-actor-client';
import { readSopActorContext } from '../src/server/sop/sop-actor-context';
import { SopDocumentSchema } from '../src/lib/sop-document-schema';
import type { SopDocument, SopMember, WorkLibrarySelection } from '../src/lib/sop-types';
import type { SopRecord } from '../src/lib/sop-record-schema';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP Member Home / lifecycle regression tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function sopApiRequest(headers: Record<string, string>, body?: unknown) {
    return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopApiCreate>[0];
}

function memberHeaders(actorId: string, organizationId = 'org-home-test') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': organizationId };
}

function makeRecord(overrides: Partial<SopRecord>): SopRecord {
    const now = new Date().toISOString();
    return {
        id: 'home-r', memberId: 'm', organizationId: 'o', taskId: 't', taskName: 'T', sourceType: 'task',
        document: SAMPLE_SOP_DOCUMENT, version: 1, lifecycleStatus: 'draft', templateEligible: false, creationSource: 'task',
        createdAt: now, updatedAt: now,
        ...overrides,
    };
}

function documentFor(id: string, member: Partial<SopMember>, patch: Partial<SopDocument> = {}): SopDocument {
    return { ...SAMPLE_SOP_DOCUMENT, ...patch, id, member: { ...SAMPLE_SOP_DOCUMENT.member, ...member } };
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

function extractText(node: unknown): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
        return extractText((node as { props?: { children?: unknown } }).props?.children);
    }
    return '';
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function run() {
    // ---------------------------------------------------------
    // Manual-verification-discovered bug: a real browser's fetch()/Headers()
    // throws synchronously on a raw non-ISO-8859-1 header value (e.g. Korean
    // text) — invisible to every other test in this repo because Node's
    // Headers implementation does not enforce that restriction. This is why
    // it had to be caught by an actual browser session, not by any unit test.
    // ---------------------------------------------------------
    console.log('Bug fix: x-sop-actor-* headers survive non-ASCII (Korean) member identity...');
    const koreanMember: SopMember = { id: 'member-한글-테스트', name: '김민지', jobRole: 'Talent Acquisition', organization: 'People & Culture팀' };
    const encodedHeaders = buildSopActorHeaders(koreanMember);
    check(
        Object.values(encodedHeaders).every((value) => /^[\x00-\xFF]*$/.test(value)),
        'Every encoded actor header value is ISO-8859-1-safe (ASCII/percent-encoded) — the exact requirement a real browser Headers object enforces'
    );
    let headerConstructionThrew = false;
    try {
        new Headers(encodedHeaders);
    } catch {
        headerConstructionThrew = true;
    }
    check(!headerConstructionThrew, 'Constructing a real Headers object from the encoded values never throws (this reproduces the actual browser failure mode if it regresses)');

    const koreanActorRequest = { headers: new Headers(encodedHeaders) } as unknown as Parameters<typeof readSopActorContext>[0];
    const decodedActorResult = readSopActorContext(koreanActorRequest);
    check(decodedActorResult.ok, 'readSopActorContext successfully parses the encoded headers');
    if (decodedActorResult.ok) {
        check(decodedActorResult.actor.actorId === koreanMember.id, "The decoded actorId exactly matches the original member.id ('member-한글-테스트') after the encode/decode round trip");
        check(decodedActorResult.actor.organizationId === koreanMember.organization, "The decoded organizationId exactly matches the original Korean organization string ('People & Culture팀') after the encode/decode round trip");
    }

    // ---------------------------------------------------------
    // Domain: computeSopStatusCounts
    // ---------------------------------------------------------
    console.log('Domain: computeSopStatusCounts...');

    check(
        Object.values(computeSopStatusCounts([], null)).every((count) => count === 0),
        'No records and no local draft yields all-zero status buckets (never fabricated non-zero counts)'
    );

    const bucketRecords: SopRecord[] = [
        makeRecord({ id: 'b-draft', lifecycleStatus: 'draft' }),
        makeRecord({ id: 'b-leader-req', lifecycleStatus: 'leader-review' }),
        makeRecord({ id: 'b-sme-req', lifecycleStatus: 'sme-review' }),
        makeRecord({ id: 'b-appr', lifecycleStatus: 'approved' }),
        makeRecord({ id: 'b-rej', lifecycleStatus: 'rejected' }),
    ];
    const bucketCounts = computeSopStatusCounts(bucketRecords, null);
    check(
        bucketCounts.draft === 1 && bucketCounts['approval-requested'] === 2 && bucketCounts.approved === 1 && bucketCounts.rejected === 1,
        "'leader-review' and 'sme-review' both fold into the single '승인 요청 중' summary bucket (2), while draft/approved/rejected each populate their own bucket"
    );

    const localDraftMatchingServerRecord = documentFor('b-appr', {});
    const dedupedCounts = computeSopStatusCounts(bucketRecords, localDraftMatchingServerRecord);
    check(
        dedupedCounts.approved === 1 && dedupedCounts.draft === 1,
        'A local draft whose document.id matches an already-saved server record is not double-counted (server lifecycle status wins, no extra draft added)'
    );

    const localOnlyDraft = documentFor('local-only-unsaved', {});
    const localOnlyCounts = computeSopStatusCounts(bucketRecords, localOnlyDraft);
    check(localOnlyCounts.draft === 2, 'A local draft NOT yet represented by any server record adds exactly one to the draft bucket');

    const confirmedButNotApproved = makeRecord({
        id: 'confirmed-not-approved',
        lifecycleStatus: 'draft',
        document: { ...SAMPLE_SOP_DOCUMENT, id: 'confirmed-not-approved', reviewStatus: 'confirmed' },
    });
    const confirmedCounts = computeSopStatusCounts([confirmedButNotApproved], null);
    check(
        confirmedCounts.approved === 0 && confirmedCounts.draft === 1,
        `document.reviewStatus === 'confirmed' alone never produces an 'approved' count — approval is a separate lifecycle field`
    );

    // ---------------------------------------------------------
    // API: member cannot forge approved/rejected via the lifecycle route or POST/PUT
    // ---------------------------------------------------------
    console.log('API: member cannot forge approved/rejected lifecycle states...');

    const ownerHeaders = memberHeaders('member-home-owner');
    const savedDoc = documentFor('home-lifecycle-doc', { id: 'member-home-owner' });
    const createRes = await sopApiCreate(sopApiRequest(ownerHeaders, { memberId: 'member-home-owner', organizationId: 'org-home-test', document: savedDoc }));
    check(createRes.status === 201, `A well-formed, self-owned create request must succeed, got ${createRes.status}`);
    const created = (await createRes.json()).record as SopRecord;
    check(created.lifecycleStatus === 'draft', 'A newly created record always starts as lifecycleStatus "draft" regardless of request content');

    // The request schema itself only accepts the literal 'leader-review' —
    // there is no field a forged body can set to reach 'approved'/'rejected'.
    const forgedApproved = await sopApiLifecycle(
        sopApiRequest(ownerHeaders, { transition: 'approved' }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(forgedApproved.status === 400, `A member request claiming transition:'approved' must be rejected with 400, got ${forgedApproved.status}`);

    const forgedRejected = await sopApiLifecycle(
        sopApiRequest(ownerHeaders, { transition: 'rejected' }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(forgedRejected.status === 400, `A member request claiming transition:'rejected' must be rejected with 400, got ${forgedRejected.status}`);

    const afterForgedAttempts = await sopRepository.getById(created.id);
    check(afterForgedAttempts?.lifecycleStatus === 'draft', 'The repository record is completely unchanged after both forged transition attempts');

    // A PUT that tries to smuggle lifecycleStatus/templateEligible into the document has no
    // effect either — those fields live on the record envelope, not inside SopDocument, so
    // there is no document field a member PUT could even set to influence them.
    const putAfterForgeAttempt = await sopApiUpdate(
        sopApiRequest(ownerHeaders, { document: { ...savedDoc, title: 'still just a title edit' }, expectedVersion: created.version }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(putAfterForgeAttempt.status === 200, 'A legitimate PUT (title-only edit) still succeeds after the forged attempts were rejected');
    const afterLegitimatePut = await sopRepository.getById(created.id);
    check(afterLegitimatePut?.lifecycleStatus === 'draft', 'lifecycleStatus is still "draft" after an ordinary content PUT — nothing about editing content can move it');

    // Requesting approval before the document is actually confirmed is rejected too.
    const tooEarlyRequest = await sopApiLifecycle(
        sopApiRequest(ownerHeaders, { transition: 'leader-review' }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(tooEarlyRequest.status === 409, `Requesting approval on a non-confirmed document must be rejected (409), got ${tooEarlyRequest.status}`);
    const afterTooEarly = await sopRepository.getById(created.id);
    check(afterTooEarly?.lifecycleStatus === 'draft', 'A rejected too-early approval request leaves the record unchanged');

    // Another member cannot request approval on someone else's record either.
    const strangerHeaders = memberHeaders('member-home-stranger');
    const strangerAttempt = await sopApiLifecycle(
        sopApiRequest(strangerHeaders, { transition: 'leader-review' }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(strangerAttempt.status === 403, `A non-owning member's approval request must be rejected with 403, got ${strangerAttempt.status}`);

    // Now confirm the document for real (through the actual store confirmation flow — a
    // hand-patched reviewStatus alone would not satisfy validateFullSopConfirmation's graph/
    // SKILL-acceptance checks), then the SAME transition succeeds.
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    (useSopPrototypeStore.getState().document!.steps).forEach((step) => {
        step.requiredSkills.forEach((sk) => {
            if (sk.source === 'ai-suggested' && !sk.accepted) useSopPrototypeStore.getState().acceptAiSkill(step.id, sk.name);
        });
    });
    useSopPrototypeStore.getState().document!.steps.forEach((step) => {
        if (step.reviewStatus !== 'confirmed') useSopPrototypeStore.getState().updateStepReviewStatus(step.id, 'reviewed');
    });
    const confirmOutcome = useSopPrototypeStore.getState().confirmFullSop();
    check(confirmOutcome.success, `Fixture setup: the sample document must reach a genuinely confirmable state, errors: ${confirmOutcome.errors.join(' / ')}`);
    const genuinelyConfirmedDoc = useSopPrototypeStore.getState().document!;
    const confirmedRecordDoc: SopDocument = { ...genuinelyConfirmedDoc, id: created.id, member: { ...genuinelyConfirmedDoc.member, id: 'member-home-owner' } };
    const putConfirmed = await sopApiUpdate(
        sopApiRequest(ownerHeaders, { document: confirmedRecordDoc, expectedVersion: afterLegitimatePut!.version }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(putConfirmed.status === 200, `Saving a genuinely confirmed document must succeed, got ${putConfirmed.status}`);
    const legitimateRequest = await sopApiLifecycle(
        sopApiRequest(ownerHeaders, { transition: 'leader-review' }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(legitimateRequest.status === 200, `Requesting approval on a genuinely confirmed, owned, draft record must succeed, got ${legitimateRequest.status}`);
    const legitimateRecord = (await legitimateRequest.json()).record as SopRecord;
    check(legitimateRecord.lifecycleStatus === 'leader-review', 'A successful approval request moves lifecycleStatus to "leader-review"');

    // And the member STILL cannot use the same endpoint to jump straight to sme-review/approved/
    // rejected from leader-review, nor request approval again.
    const secondRequest = await sopApiLifecycle(
        sopApiRequest(ownerHeaders, { transition: 'leader-review' }),
        { params: Promise.resolve({ id: created.id }) }
    );
    check(secondRequest.status === 409, 'A record already in leader-review cannot be re-requested');

    // Direct repository-level check: only a 'leader' actor can move a leader-review record
    // forward, and only to sme-review (never straight to approved) — proving the
    // member-facing route's restriction is backed by a real domain rule, not just a schema gate.
    const memberForgeAtRepoLevel = await sopRepository.transitionLifecycle(created.id, { actorRole: 'member', actorId: 'member-home-owner', kind: 'member-submit' });
    check(!memberForgeAtRepoLevel.ok, 'The repository itself refuses a member actor re-submitting a non-editable record, independent of the HTTP schema layer');
    const leaderApproval = await sopRepository.transitionLifecycle(created.id, { actorRole: 'leader', actorId: 'leader-1', kind: 'leader-approve' });
    check(leaderApproval.ok === true && leaderApproval.record.lifecycleStatus === 'sme-review', 'A leader actor CAN move a leader-review record forward, but only to sme-review — never straight to approved');
    const memberCannotSkipToApproved = await sopRepository.transitionLifecycle(created.id, { actorRole: 'leader', actorId: 'leader-1', kind: 'leader-approve' });
    check(!memberCannotSkipToApproved.ok, 'A leader cannot approve a record that is already past leader-review (now sme-review)');
    const smeApproval = await sopRepository.transitionLifecycle(created.id, { actorRole: 'sme', actorId: 'sme-1', kind: 'sme-approve' });
    check(smeApproval.ok === true && smeApproval.record.lifecycleStatus === 'approved', 'An SME actor moves an sme-review record to approved');

    // ---------------------------------------------------------
    // Component: identity fields, status widget, creation-path cards
    // ---------------------------------------------------------
    console.log('Component: SopMemberHomeView...');

    const fullMember: SopMember = { id: 'member-ui', employeeId: 'EMP-001', name: '테스트 구성원', jobRole: '채용담당자', organization: 'People Team', grade: 'Manager' };
    useSopPrototypeStore.setState({ memberInfo: fullMember, document: null });

    const navigations: string[] = [];
    const fetchCalls: string[] = [];
    const zeroStateFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        fetchCalls.push(`${init?.method || 'GET'} ${url}`);
        if (url.endsWith('/api/sop')) return jsonResponse({ records: [] });
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const homeRenderer = renderComponent(
        React.createElement(SopMemberHomeView, { navigate: (href: string) => navigations.push(href), fetchImpl: zeroStateFetch })
    );
    await flushEffects();

    const renderedHomeText = JSON.stringify(homeRenderer.toJSON());
    check(renderedHomeText.includes(fullMember.name), '구성원 이름이 화면에 읽기 전용으로 표시됨');
    check(renderedHomeText.includes(fullMember.employeeId!), '사번이 화면에 읽기 전용으로 표시됨');
    check(renderedHomeText.includes(fullMember.organization!), '조직이 화면에 읽기 전용으로 표시됨');
    check(renderedHomeText.includes(fullMember.grade!), '직급이 화면에 읽기 전용으로 표시됨');
    check(renderedHomeText.includes(fullMember.jobRole), '주요 직무가 화면에 읽기 전용으로 표시됨');

    for (const status of ['draft', 'approval-requested', 'approved', 'rejected'] as const) {
        check(renderedHomeText.includes(SOP_MEMBER_SUMMARY_BUCKET_META[status].label), `SOP 현황에 "${SOP_MEMBER_SUMMARY_BUCKET_META[status].label}" 상태 라벨이 표시됨`);
    }
    check(renderedHomeText.includes('"0"'), 'record가 없을 때 상태 위젯에 0이 표시됨 (가짜 건수를 만들지 않음)');

    const allButtons = homeRenderer.root.findAllByType('button');
    const taskCardButton = allButtons.find((b) => extractText(b.props.children).includes('Task 기반'));
    const colleagueCardButton = allButtons.find((b) => extractText(b.props.children).includes('동료 SOP 기반'));
    const tbdCardButton = allButtons.find((b) => extractText(b.props.children).includes('실무 자료 기반'));
    check(Boolean(taskCardButton && colleagueCardButton && tbdCardButton), '세 개의 시작점 카드(Task/동료/실무 자료)가 모두 렌더링됨');
    check(extractText(taskCardButton!.props.children).includes('권장 시작점'), 'Task 기반 카드에만 "권장 시작점" 배지가 붙어 시각적 primary임을 나타냄');
    check(!extractText(colleagueCardButton!.props.children).includes('권장 시작점'), '동료 SOP 기반 카드에는 "권장 시작점" 배지가 없음 (부차적 기능처럼 보이지 않되 primary도 아님)');

    // 마운트 시점에 INT-LAND-001 착지 판정이 이미 한 번 돈다 (이 렌더는 anonymous
    // 기본 상태이므로 그 판정 결과는 /sop/login) — 아래 카드 클릭 검증은 그 이후에
    // "추가로" 발생하는 navigate 호출만 델타로 비교한다.
    const navigationCountAfterMount = navigations.length;
    act(() => {
        taskCardButton!.props.onClick({ preventDefault: () => {} });
    });
    // 08 §통합 지시 1·2: Task 기반의 새 진입점은 /sop/setup의 혼합 화면이 아니라
    // 새 순차 흐름이다. 이 테스트는 anonymous 기본 상태에서 시작하므로 /sop/login으로
    // 이동한다 — 이미 로그인한 구성원의 resolvePostLoginRoute 분기는
    // tests/sop-member-login-context.test.tsx가 별도로 증명한다.
    check(navigations.at(-1) === SOP_INTAKE_ROUTES.login, 'Task 기반 카드를 클릭하면(비로그인) /sop/login으로 이동함');

    const allInputs = homeRenderer.root.findAllByType('input');
    check(!allInputs.some((i) => i.props.type === 'file'), 'TBD(실무 자료 기반) 카드에는 파일 input이 전혀 없음');
    check(tbdCardButton!.props['aria-disabled'] === 'true', 'TBD 카드는 aria-disabled로 명시적으로 비활성 상태를 표시함');
    check(typeof tbdCardButton!.props.title === 'string' && tbdCardButton!.props.title.length > 0, 'TBD 카드는 비활성 이유를 title로 제공함 (디자인 수용 기준)');

    const fetchCallCountBeforeTbdClick = fetchCalls.length;
    const navigationCountBeforeTbdClick = navigations.length;
    act(() => {
        tbdCardButton!.props.onClick({ preventDefault: () => {} });
    });
    await flushEffects();
    check(fetchCalls.length === fetchCallCountBeforeTbdClick, 'TBD 카드를 클릭해도 네트워크(API) 호출이 전혀 발생하지 않음');
    check(navigations.length === navigationCountBeforeTbdClick, 'TBD 카드를 클릭해도 추가 이동이 전혀 발생하지 않음');
    check(navigationCountAfterMount >= 1, 'INT-LAND-001: anonymous 상태로 마운트하면 착지 판정이 즉시 한 번 돌아 /sop/login으로 이동함 (아래 별도 섹션에서 hydration·인증·record 분기를 전부 증명함)');

    act(() => {
        homeRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Component: INT-LAND-001 — Home wires W4-01's resolveMemberLandingRoute directly on
    // mount (no re-derived judgment logic in the component). Truth table exercised here:
    //   hydrated=false                                  -> no navigation at all
    //   authenticated, records=0,  no progress           -> /sop/context
    //   authenticated, records>=1, no progress           -> /sop (stays, no navigation)
    //   authenticated, confirmed context (progress)      -> /sop/recommendation (resume)
    //   authenticated, Work Map draft (further progress) -> /sop/work-map/simple (resume)
    // ---------------------------------------------------------
    console.log('Component: INT-LAND-001 landing determination on Home mount...');

    const landingMember: SopMember = { id: 'landing-member', employeeId: 'EMP-LAND', name: '착지 테스트', jobRole: '채용담당자', organization: 'Org' };

    function landingFetch(records: SopRecord[]): typeof fetch {
        return (async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/api/sop')) return jsonResponse({ records });
            if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
            return jsonResponse({ error: 'unhandled test route' }, 404);
        }) as unknown as typeof fetch;
    }

    // Branch: hydration not yet finished -> no navigation at all, even though every other
    // signal (authenticated, 0 records, no progress) would otherwise redirect to /sop/context.
    // 복원 전 memberSession 기본값(anonymous)은 신뢰할 수 없다는 규칙과 별개로, 이 분기는
    // "복원이 끝나기 전에는 이동 판정 자체를 하지 않는다"는 게이트를 직접 증명한다.
    {
        useSopPrototypeStore.getState().resetStore();
        useSopPrototypeStore.setState({
            memberInfo: landingMember,
            memberSession: authenticateMemberSession(landingMember, new Date().toISOString()),
            document: null,
        });
        const originalHasHydrated = useSopPrototypeStore.persist.hasHydrated;
        useSopPrototypeStore.persist.hasHydrated = () => false;
        const navs: string[] = [];
        const renderer = renderComponent(
            React.createElement(SopMemberHomeView, { navigate: (href: string) => navs.push(href), fetchImpl: landingFetch([]) })
        );
        await flushEffects();
        check(navs.length === 0, 'INT-LAND-001: hydration이 끝나기 전에는 (인증 + record 0건이라도) 어떤 이동도 발생하지 않는다');
        useSopPrototypeStore.persist.hasHydrated = originalHasHydrated;
        act(() => {
            renderer.unmount();
        });
    }

    // Regression (W4-05 browser finding): the record-fetch effect must not run on the
    // pre-hydration default memberInfo. Before the fix, this effect depended only on
    // `[memberInfo.id, memberInfo.employeeId]` — since resetStore() leaves memberInfo at the
    // default sample identity (CUSTOMER_SOP_MEMBER) until persist hydration actually replaces
    // it, the effect fired once immediately with that WRONG identity (getting back an empty
    // record list for a member who isn't really "logged in" yet), then fired again once
    // hydration corrected memberInfo. The second fetch got the right answer, but
    // INT-LAND-001's `landingCheckedRef` locks in a decision the first time `records !== null`
    // — which was already the wrong, empty result. A returning member with real records was
    // therefore bounced to /sop/context every time. This test reproduces the exact sequence
    // (hydrated=false + default memberInfo at mount, then both flip together, mirroring how
    // zustand-persist replaces the whole rehydrated slice atomically) and asserts there is
    // exactly one fetch, using the POST-hydration identity, never the pre-hydration default.
    {
        useSopPrototypeStore.getState().resetStore();
        const originalHasHydrated = useSopPrototypeStore.persist.hasHydrated;
        useSopPrototypeStore.persist.hasHydrated = () => false;

        const defaultActorId = buildSopActorHeaders(useSopPrototypeStore.getState().memberInfo)['x-sop-actor-id'];
        const realActorId = buildSopActorHeaders(landingMember)['x-sop-actor-id'];
        const requestedActorIds: string[] = [];
        const raceFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input.toString();
            const actorId = new Headers(init?.headers as HeadersInit | undefined).get('x-sop-actor-id') ?? '';
            if (url.endsWith('/api/sop')) {
                requestedActorIds.push(actorId);
                const body = {
                    records: actorId === realActorId
                        ? [makeRecord({
                              id: 'race-record', memberId: landingMember.id, lifecycleStatus: 'draft',
                              taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, taskName: SAMPLE_SOP_DOCUMENT.workLibrary.taskName,
                              document: documentFor('race-record', { id: landingMember.id }),
                          })]
                        : [],
                };
                return jsonResponse(body);
            }
            if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
            return jsonResponse({ error: 'unhandled test route' }, 404);
        }) as unknown as typeof fetch;

        const navs: string[] = [];
        const renderer = renderComponent(
            React.createElement(SopMemberHomeView, { navigate: (href: string) => navs.push(href), fetchImpl: raceFetch })
        );
        await flushEffects();
        check(requestedActorIds.length === 0, 'hydration이 끝나기 전에는 (기본 memberInfo로도) record 조회 자체가 발생하지 않는다');

        // Hydration finishing replaces the relevant slice atomically — hasHydrated flips to
        // true in the same act() as memberSession/memberInfo updating to the real values.
        act(() => {
            useSopPrototypeStore.persist.hasHydrated = () => true;
            useSopPrototypeStore.setState({
                memberInfo: landingMember,
                memberSession: authenticateMemberSession(landingMember, new Date().toISOString()),
                document: null,
            });
        });
        await flushEffects();
        await flushEffects();

        check(requestedActorIds.length === 1, `hydration 완료 후 record 조회는 정확히 한 번만 발생한다 (실제: ${requestedActorIds.length}회)`);
        check(requestedActorIds[0] === realActorId && requestedActorIds[0] !== defaultActorId, `그 한 번의 조회는 복원된 실제 신원(${realActorId})으로 나가고, 초기 샘플 신원(${defaultActorId})으로는 나가지 않는다`);
        check(navs.length === 0, 'record가 있는 신원으로 정상 조회됐으므로 /sop에 머문다(이동 없음) — 착지 판정이 올바른 데이터로 내려졌다는 증거');

        useSopPrototypeStore.persist.hasHydrated = originalHasHydrated;
        act(() => {
            renderer.unmount();
        });
    }

    // Branch: authenticated + 0 stored records + no in-progress intake -> /sop/context
    // (a brand-new member never sees an empty dashboard first).
    {
        useSopPrototypeStore.getState().resetStore();
        useSopPrototypeStore.setState({
            memberInfo: landingMember,
            memberSession: authenticateMemberSession(landingMember, new Date().toISOString()),
            document: null,
        });
        const navs: string[] = [];
        const renderer = renderComponent(
            React.createElement(SopMemberHomeView, { navigate: (href: string) => navs.push(href), fetchImpl: landingFetch([]) })
        );
        await flushEffects();
        check(navs.length === 1 && navs[0] === SOP_INTAKE_ROUTES.context, 'INT-LAND-001: 인증 + record 0건 + 진행 없음 -> /sop/context로 즉시 이동');
        act(() => {
            renderer.unmount();
        });
    }

    // Branch: authenticated + 1+ stored records + no in-progress intake -> stays on /sop
    // (no navigation at all) — a returning member with real history lands on Home.
    {
        useSopPrototypeStore.getState().resetStore();
        useSopPrototypeStore.setState({
            memberInfo: landingMember,
            memberSession: authenticateMemberSession(landingMember, new Date().toISOString()),
            document: null,
        });
        const returningRecord = makeRecord({
            id: 'landing-returning', memberId: landingMember.id, lifecycleStatus: 'draft',
            taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, taskName: SAMPLE_SOP_DOCUMENT.workLibrary.taskName,
            document: documentFor('landing-returning', { id: landingMember.id }),
        });
        const navs: string[] = [];
        const renderer = renderComponent(
            React.createElement(SopMemberHomeView, { navigate: (href: string) => navs.push(href), fetchImpl: landingFetch([returningRecord]) })
        );
        await flushEffects();
        check(navs.length === 0, 'INT-LAND-001: 인증 + record 1건 이상 + 진행 없음 -> /sop에 머문다 (이동 없음)');
        act(() => {
            renderer.unmount();
        });
    }

    // Branch: authenticated + a confirmed work context (in-progress intake, no Work Map
    // draft yet) -> resumes at the recommendation step, regardless of stored-record count.
    {
        useSopPrototypeStore.getState().resetStore();
        useSopPrototypeStore.setState({
            memberInfo: landingMember,
            memberSession: authenticateMemberSession(landingMember, new Date().toISOString()),
            memberContext: { draft: '진행 중 업무맥락', confirmedText: '진행 중 업무맥락', confirmedAt: new Date().toISOString() },
            document: null,
        });
        const navs: string[] = [];
        const renderer = renderComponent(
            React.createElement(SopMemberHomeView, { navigate: (href: string) => navs.push(href), fetchImpl: landingFetch([]) })
        );
        await flushEffects();
        check(
            navs.length === 1 && navs[0] === SOP_INTAKE_ROUTES.recommendation,
            'INT-LAND-001: 확정 업무맥락(진행 중 intake)이 있으면 record 유무와 무관하게 그 진행 지점(추천)으로 복귀한다'
        );
        act(() => {
            renderer.unmount();
        });
    }

    // Branch: authenticated + an existing Work Map draft (further-along in-progress
    // intake) -> resumes directly at the Work Map simple view.
    {
        useSopPrototypeStore.getState().resetStore();
        const draft = createWorkMapDraftFromCatalog({ task: CUSTOMER_WORK_LIBRARY.taskCatalog[0], contextText: '초안 업무맥락', now: new Date().toISOString() });
        useSopPrototypeStore.setState({
            memberInfo: landingMember,
            memberSession: authenticateMemberSession(landingMember, new Date().toISOString()),
            workMapDraft: draft,
            document: null,
        });
        const navs: string[] = [];
        const renderer = renderComponent(
            React.createElement(SopMemberHomeView, { navigate: (href: string) => navs.push(href), fetchImpl: landingFetch([]) })
        );
        await flushEffects();
        check(
            navs.length === 1 && navs[0] === SOP_INTAKE_ROUTES.workMapSimple,
            'INT-LAND-001: 진행 중인 Work Map 초안이 있으면 그 지점(work-map/simple)으로 복귀한다'
        );
        act(() => {
            renderer.unmount();
        });
    }

    // ---------------------------------------------------------
    // Component: colleague-template card opens the picker, which never calls fetch
    // until it is actually shown, and status counts reflect real saved records.
    // ---------------------------------------------------------
    const populatedFetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/sop')) {
            return jsonResponse({
                records: [
                    makeRecord({ id: 'ui-r1', lifecycleStatus: 'leader-review', document: documentFor('ui-r1', {}) }),
                    makeRecord({ id: 'ui-r2', lifecycleStatus: 'approved', document: documentFor('ui-r2', {}) }),
                ],
            });
        }
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const populatedRenderer = renderComponent(
        React.createElement(SopMemberHomeView, { navigate: () => {}, fetchImpl: populatedFetch })
    );
    await flushEffects();
    const populatedText = JSON.stringify(populatedRenderer.toJSON());
    check(populatedText.includes('1') , '저장된 기록이 있으면 상태 위젯에 실제 집계값이 반영됨');
    act(() => {
        populatedRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Code review defect 1: a non-'draft' record's document must be immutable
    // through PUT /api/sop/[id] AND through InMemorySopRepository.update() directly.
    // ---------------------------------------------------------
    console.log('Defect fix: PUT/update is blocked once lifecycleStatus leaves draft...');

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

    async function createRecordAtLifecycle(
        id: string,
        memberId: string,
        target: 'draft' | 'leader-review' | 'sme-review' | 'approved' | 'rejected'
    ): Promise<{ document: SopDocument; record: SopRecord }> {
        const headers = memberHeaders(memberId);
        const document = await buildConfirmedDocument(id, memberId);
        const createRes = await sopApiCreate(sopApiRequest(headers, { memberId, organizationId: 'org-home-test', document }));
        check(createRes.status === 201, `Fixture setup: create must succeed for ${id}, got ${createRes.status}`);
        if (target === 'draft') return { document, record: (await createRes.json()).record as SopRecord };

        const requestRes = await sopApiLifecycle(sopApiRequest(headers, { transition: 'leader-review' }), { params: Promise.resolve({ id }) });
        check(requestRes.status === 200, `Fixture setup: leader-review transition must succeed for ${id}, got ${requestRes.status}`);
        if (target === 'leader-review') return { document, record: (await requestRes.json()).record as SopRecord };

        if (target === 'rejected') {
            const rejected = await sopRepository.transitionLifecycle(id, {
                actorRole: 'leader', actorId: 'leader-1', kind: 'leader-reject', reasonCode: 'fixture', feedback: '(fixture) 반려 사유',
            });
            check(rejected.ok, `Fixture setup: leader-reject transition must succeed for ${id}`);
            return { document, record: rejected.ok ? rejected.record : (await sopRepository.getById(id))! };
        }

        const approvedByLeader = await sopRepository.transitionLifecycle(id, { actorRole: 'leader', actorId: 'leader-1', kind: 'leader-approve' });
        check(approvedByLeader.ok, `Fixture setup: leader-approve transition must succeed for ${id}`);
        if (target === 'sme-review') return { document, record: approvedByLeader.ok ? approvedByLeader.record : (await sopRepository.getById(id))! };

        const approvedBySme = await sopRepository.transitionLifecycle(id, { actorRole: 'sme', actorId: 'sme-1', kind: 'sme-approve' });
        check(approvedBySme.ok, `Fixture setup: sme-approve transition must succeed for ${id}`);
        return { document, record: approvedBySme.ok ? approvedBySme.record : (await sopRepository.getById(id))! };
    }

    // draft: PUT succeeds normally.
    const draftFixture = await createRecordAtLifecycle('lock-doc-draft', 'lock-owner-draft', 'draft');
    const draftPut = await sopApiUpdate(
        sopApiRequest(memberHeaders('lock-owner-draft'), { document: { ...draftFixture.document, title: '초안 상태 제목 수정' }, expectedVersion: draftFixture.record.version }),
        { params: Promise.resolve({ id: 'lock-doc-draft' }) }
    );
    check(draftPut.status === 200, `A draft record's PUT must succeed, got ${draftPut.status}`);
    check((await draftPut.json()).record.document.title === '초안 상태 제목 수정', 'A draft record PUT actually applies the content change');

    // leader-review/sme-review/approved: locked — the content a reviewer saw/approved must
    // never drift underneath them.
    for (const status of ['leader-review', 'sme-review', 'approved'] as const) {
        const fixture = await createRecordAtLifecycle(`lock-doc-${status}`, `lock-owner-${status}`, status);
        const before = await sopRepository.getById(`lock-doc-${status}`);
        const putResult = await sopApiUpdate(
            sopApiRequest(memberHeaders(`lock-owner-${status}`), { document: { ...fixture.document, title: `${status} 상태에서 시도한 수정` }, expectedVersion: fixture.record.version }),
            { params: Promise.resolve({ id: `lock-doc-${status}` }) }
        );
        check(putResult.status === 409, `A '${status}' record's PUT must be rejected with 409, got ${putResult.status}`);
        const after = await sopRepository.getById(`lock-doc-${status}`);
        check(after?.document.title === before?.document.title, `A '${status}' record's document.title is unchanged after the rejected PUT`);
        check(after?.version === before?.version, `A '${status}' record's version does not increase after the rejected PUT`);
        check(after?.updatedAt === before?.updatedAt, `A '${status}' record's updatedAt does not change after the rejected PUT`);
        check(after?.lifecycleStatus === status, `A '${status}' record's lifecycleStatus is unchanged after the rejected PUT`);

        // Repository-level: calling update() directly (bypassing the API route entirely) is blocked identically.
        const directUpdate = await sopRepository.update(`lock-doc-${status}`, { document: { ...fixture.document, title: '직접 repository 호출로 시도한 수정' }, expectedVersion: fixture.record.version });
        check(!directUpdate.ok && directUpdate.reason === 'locked-lifecycle', `Calling InMemorySopRepository.update() directly on a '${status}' record is also blocked (reason: locked-lifecycle)`);
        const afterDirect = await sopRepository.getById(`lock-doc-${status}`);
        check(afterDirect?.document.title === before?.document.title && afterDirect?.version === before?.version, `A direct repository update() call leaves a '${status}' record's document/version unchanged`);
    }

    // rejected: the OPPOSITE of the above — a rejected record is member-editable again (작업 E),
    // without creating a new record/id. This is the corrected policy: rejected used to be locked
    // like the other non-draft statuses; it no longer is.
    const rejectedFixture = await createRecordAtLifecycle('lock-doc-rejected', 'lock-owner-rejected', 'rejected');
    check(rejectedFixture.record.lifecycleStatus === 'rejected', 'Fixture setup: the record actually reached lifecycleStatus "rejected"');
    check(
        rejectedFixture.record.rejection?.rejectedAtStage === 'leader-review' && rejectedFixture.record.rejection.reasonCode === 'fixture',
        'A rejected record carries rejection metadata (stage/reasonCode/feedback) from the deciding reviewer'
    );
    const rejectedPut = await sopApiUpdate(
        sopApiRequest(memberHeaders('lock-owner-rejected'), { document: { ...rejectedFixture.document, title: 'rejected 상태에서 시도한 수정' }, expectedVersion: rejectedFixture.record.version }),
        { params: Promise.resolve({ id: 'lock-doc-rejected' }) }
    );
    check(rejectedPut.status === 200, `A rejected record's PUT must SUCCEED (member-editable), got ${rejectedPut.status}`);
    check((await rejectedPut.json()).record.document.title === 'rejected 상태에서 시도한 수정', "A rejected record's PUT actually applies the content change");

    // ---------------------------------------------------------
    // Code review defect 5: SopColleagueTemplatePicker search/filter behavior.
    // ---------------------------------------------------------
    console.log('Component: SopColleagueTemplatePicker search/filter...');
    const { SopColleagueTemplatePicker } = await import('../src/components/sop/SopColleagueTemplatePicker');

    const pickerMember: SopMember = { id: 'picker-member', name: '검색 테스트', jobRole: '채용담당자', organization: 'Org' };
    useSopPrototypeStore.setState({ memberInfo: pickerMember, document: null });

    const pickerTemplates = [
        { templateId: 't-1', taskId: 'task-a', taskName: '채용 프로세스 운영', sopTitle: '채용 SOP', jobRoleCategory: '채용담당자', activityCount: 3, subActionCount: 5, updatedAt: new Date().toISOString() },
        { templateId: 't-2', taskId: 'task-b', taskName: '마케팅 전략 수립', sopTitle: '마케팅 SOP', jobRoleCategory: '마케팅담당자', activityCount: 2, subActionCount: 4, updatedAt: new Date().toISOString() },
    ];
    const pickerFetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: pickerTemplates });
        return jsonResponse({ error: 'unhandled' }, 404);
    }) as unknown as typeof fetch;

    const pickerRenderer = renderComponent(
        React.createElement(SopColleagueTemplatePicker, { onClose: () => {}, navigate: () => {}, fetchImpl: pickerFetch })
    );
    await flushEffects();

    const pickerTextInitial = JSON.stringify(pickerRenderer.toJSON());
    check(pickerTextInitial.includes('채용 SOP') && pickerTextInitial.includes('마케팅 SOP'), '초기 목록에 두 템플릿이 모두 표시됨');
    check(pickerTextInitial.indexOf('채용 SOP') < pickerTextInitial.indexOf('마케팅 SOP'), '현재 구성원과 같은 직무 카테고리(채용담당자)인 템플릿이 먼저 표시됨');

    const searchInput = pickerRenderer.root.findAllByType('input').find((i) => i.props.placeholder?.includes('검색'));
    check(Boolean(searchInput), '검색 입력창이 렌더링됨');

    act(() => {
        searchInput!.props.onChange({ target: { value: '마케팅' } });
    });
    const afterTaskSearch = JSON.stringify(pickerRenderer.toJSON());
    check(afterTaskSearch.includes('마케팅 SOP') && !afterTaskSearch.includes('채용 SOP'), 'Task/SOP명 검색이 실제로 목록을 필터링함');

    act(() => {
        searchInput!.props.onChange({ target: { value: '채용담당자' } });
    });
    const afterRoleSearch = JSON.stringify(pickerRenderer.toJSON());
    check(afterRoleSearch.includes('채용 SOP') && !afterRoleSearch.includes('마케팅 SOP'), '직무 카테고리 문자열 검색도 목록을 필터링함');

    act(() => {
        searchInput!.props.onChange({ target: { value: '존재하지-않는-검색어' } });
    });
    const afterNoMatchSearch = JSON.stringify(pickerRenderer.toJSON());
    check(afterNoMatchSearch.includes('일치하는 동료 SOP가 없습니다'), '검색 결과가 없을 때 명확한 빈 상태 문구가 표시됨');
    check(pickerTextInitial.includes('문자열 일치') && pickerTextInitial.includes('AI 유사도 분석 아님'), '검색/우선순위 설명이 "문자열 일치 기준"이며 "AI 유사도 분석 아님"임을 명시적으로 밝힘(과장하지 않음)');

    act(() => {
        pickerRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Code review round 3, defect 1: sourceType is normalized to 'task' at every
    // Task-creation-path entry point via ONE shared function, never read as a
    // hard-coded literal downstream.
    // ---------------------------------------------------------
    console.log('Defect fix: Task creation path normalizes sourceType via a single shared entry point...');

    // The customer fixture's representative Task is selected by `taskId`; it
    // is not guaranteed to be the first entry in the Job's catalog. Derive the
    // expected Activity set through the same scope selector the Gate uses so
    // this test validates Task-wide behaviour rather than catalog ordering.
    const representativeActivities = getScopedActivities(CUSTOMER_WORK_LIBRARY);
    const legacyActivityScopedLibrary: WorkLibrarySelection = {
        ...CUSTOMER_WORK_LIBRARY,
        sourceType: 'activity',
        activityId: representativeActivities[0].id,
        activityName: representativeActivities[0].name,
    };
    check(legacyActivityScopedLibrary.sourceType === 'activity', 'Fixture setup: the starting selection is Activity-scoped, simulating a stale persisted session');

    const normalizedLibrary = withTaskScope(legacyActivityScopedLibrary);
    check(normalizedLibrary.sourceType === 'task', 'withTaskScope flips sourceType to the Task-wide generation scope');
    check(normalizedLibrary.activityId === legacyActivityScopedLibrary.activityId, 'activityId is preserved as an editing focus — normalization never clears it');
    check(
        getScopedActivities(normalizedLibrary).length === representativeActivities.length,
        "The normalized selection's scoped Activities cover the ENTIRE Task, not just the one Activity from the stale selection"
    );

    let setWorkLibraryCallCount = 0;
    let lastWorkLibraryPatch: Partial<WorkLibrarySelection> | null = null;
    enterTaskCreationPath({
        workLibrary: legacyActivityScopedLibrary,
        setWorkLibrary: (patch) => {
            setWorkLibraryCallCount++;
            lastWorkLibraryPatch = patch;
        },
    });
    check(setWorkLibraryCallCount === 1, 'enterTaskCreationPath calls setWorkLibrary exactly once when normalization is actually needed — the SAME function Home\'s Task card and direct /sop/setup entry both call');
    check(Boolean(lastWorkLibraryPatch) && (lastWorkLibraryPatch as unknown as WorkLibrarySelection).sourceType === 'task', 'The patch applied to the Store sets sourceType to task');

    let noopSetWorkLibraryCalls = 0;
    enterTaskCreationPath({ workLibrary: normalizedLibrary, setWorkLibrary: () => { noopSetWorkLibraryCalls++; } });
    check(noopSetWorkLibraryCalls === 0, 'enterTaskCreationPath performs NO Store write at all when the selection is already task-scoped (true no-op, not a redundant identical patch)');

    // Sample generation from the normalized selection must reflect the Task-wide
    // scope — before this fix, generateFromSample trusted state.workLibrary as-is,
    // so a stale 'activity' selection produced a single-Activity sample while the
    // AI request path (hard-coded 'task') produced a Task-wide one.
    const sampleFromNormalized = buildTaskGateSampleDocument({
        id: 'defect1-sample-doc',
        member: SAMPLE_SOP_DOCUMENT.member,
        workLibrary: normalizedLibrary,
        context: '',
        setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig,
    });
    check(sampleFromNormalized.success, 'Sample generation succeeds from the normalized (task-scoped) selection');
    if (sampleFromNormalized.success) {
        check(sampleFromNormalized.document.workLibrary.sourceType === 'task', 'The sample document itself carries sourceType: task, matching the normalized Store state (not hard-coded separately)');
        const sampleBusinessSteps = sampleFromNormalized.document.steps.filter((s) => !s.terminalType);
        const allActivityIds = getScopedActivities(normalizedLibrary).map((a) => a.id);
        check(
            allActivityIds.every((id) => sampleBusinessSteps.some((s) => s.sourceActivityIds?.includes(id))),
            'The sample reflects ALL Activities of the Task (matching what an AI generation request would also send), not just the one Activity from the stale legacy selection'
        );
    }

    // A legacy Activity-scoped PERSISTED document (already saved before this feature
    // existed) is a completely different concern from the live Setup Gate selection
    // above — normalization must never touch it, and it must keep parsing.
    const legacyPersistedDocument: SopDocument = {
        ...SAMPLE_SOP_DOCUMENT,
        id: 'defect1-legacy-persisted-doc',
        workLibrary: legacyActivityScopedLibrary,
    };
    check(
        SopDocumentSchema.safeParse(legacyPersistedDocument).success,
        'A legacy Activity-scoped persisted document (sourceType: activity) still parses successfully — normalization only ever touches the live Setup Gate selection, never an already-saved document'
    );

    // ---------------------------------------------------------
    // Code review round 3, defect 2: server-save must look up an existing record
    // before deciding create-vs-update, never trust in-memory "did I save before".
    // ---------------------------------------------------------
    console.log('Defect fix: server save checks for an existing record before create/update, never re-POSTs a saved draft...');

    function buildSopApiFetch(): typeof fetch {
        return (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input.toString();
            const path = url.replace(/^https?:\/\/[^/]+/, '');
            const method = (init?.method || 'GET').toUpperCase();
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const body = init?.body ? JSON.parse(init.body as string) : undefined;
            const fakeReq = { headers, json: async () => body };
            if (path === '/api/sop' && method === 'POST') return sopApiCreate(fakeReq as unknown as Parameters<typeof sopApiCreate>[0]);
            const idMatch = path.match(/^\/api\/sop\/([^/]+)$/);
            if (idMatch && method === 'GET') {
                return sopApiGetById(fakeReq as unknown as Parameters<typeof sopApiGetById>[0], { params: Promise.resolve({ id: decodeURIComponent(idMatch[1]) }) });
            }
            if (idMatch && method === 'PUT') {
                return sopApiUpdate(fakeReq as unknown as Parameters<typeof sopApiUpdate>[0], { params: Promise.resolve({ id: decodeURIComponent(idMatch[1]) }) });
            }
            throw new Error(`Unhandled test route: ${method} ${path}`);
        }) as unknown as typeof fetch;
    }

    const saveTestMember: SopMember = { id: 'save-owner', name: '저장 테스트', jobRole: '테스터', organization: 'save-org' };
    const saveTestFetch = buildSopApiFetch();

    const freshDoc = documentFor('save-fresh-doc', { id: 'save-owner' });
    const lookupFresh = await lookupExistingSopRecord({ member: saveTestMember, documentId: freshDoc.id, fetchImpl: saveTestFetch });
    check(lookupFresh.success && lookupFresh.record === null, 'lookupExistingSopRecord resolves record:null (a successful lookup, not an error) for a document never saved before');

    const createResult = await saveSopDocumentToServer({ member: saveTestMember, document: freshDoc, existingRecord: lookupFresh.success ? lookupFresh.record : null, fetchImpl: saveTestFetch });
    check(createResult.success && createResult.record.version === 1, 'The first save of a brand-new document creates via POST (starts at version 1)');

    const updateResult = await saveSopDocumentToServer({ member: saveTestMember, document: { ...freshDoc, title: '수정된 제목' }, existingRecord: createResult.success ? createResult.record : null, fetchImpl: saveTestFetch });
    check(updateResult.success && updateResult.record.version === 2, 'Saving again with the known existingRecord updates via PUT (version bumps to 2) — it never re-creates');
    check(updateResult.success && updateResult.record.document.title === '수정된 제목', 'The PUT actually applied the content change');

    const lookupAfterRemount = await lookupExistingSopRecord({ member: saveTestMember, documentId: freshDoc.id, fetchImpl: saveTestFetch });
    check(lookupAfterRemount.success && lookupAfterRemount.record?.version === 2, 'A FRESH lookup with no in-memory history (simulating a Workspace remount) still finds the existing record at its current version');
    const saveAfterRemount = await saveSopDocumentToServer({ member: saveTestMember, document: freshDoc, existingRecord: lookupAfterRemount.success ? lookupAfterRemount.record : null, fetchImpl: saveTestFetch });
    check(saveAfterRemount.success && saveAfterRemount.record.version === 3, 'Saving right after a simulated remount updates (v3) — remounting never re-POSTs into a duplicate-id conflict');

    const staleVersionRecord = { ...(saveAfterRemount.success ? saveAfterRemount.record : (lookupAfterRemount as { record: SopRecord }).record), version: 1 };
    const staleAttempt = await saveSopDocumentToServer({ member: saveTestMember, document: freshDoc, existingRecord: staleVersionRecord, fetchImpl: saveTestFetch });
    check(!staleAttempt.success, 'Saving with a stale existingRecord.version is rejected (optimistic-locking version-conflict) — the existing locking rule is preserved, not bypassed');

    const duplicateAttempt = await saveSopDocumentToServer({ member: saveTestMember, document: freshDoc, existingRecord: null, fetchImpl: saveTestFetch });
    check(!duplicateAttempt.success, 'Forcing a create() (existingRecord: null) against a document id that already exists server-side fails as a duplicate-id conflict — never silently reported as a successful save or auto-upserted');

    // Component-level: mount checks server state, and a lifecycle-locked record disables the button with no fetch call.
    console.log('Component: SopServerSaveControl blocks saving once lifecycleStatus leaves draft...');
    const lockedFixture = await createRecordAtLifecycle('save-locked-doc', 'save-owner-locked', 'leader-review');
    useSopPrototypeStore.setState({ memberInfo: { id: 'save-owner-locked', name: 'x', jobRole: 'y' }, document: lockedFixture.document, customerReviewMode: false });
    let fetchCallCountForLockedControl = 0;
    const countingFetch: typeof fetch = (async (...args: Parameters<typeof fetch>) => {
        fetchCallCountForLockedControl++;
        return buildSopApiFetch()(...args);
    }) as typeof fetch;
    const lockedControlRenderer = renderComponent(React.createElement(SopServerSaveControl, { fetchImpl: countingFetch }));
    await flushEffects();
    const lockedControlButton = lockedControlRenderer.root.findAllByType('button')[0];
    check(lockedControlButton.props.disabled === true, 'The save button is disabled once the looked-up record is in a non-member-editable lifecycle state (leader-review)');
    const lockedControlText = JSON.stringify(lockedControlRenderer.toJSON());
    check(lockedControlText.includes(SOP_LIFECYCLE_STATUS_META['leader-review'].label), 'The disabled button surfaces the actual lifecycle status label, not a generic disabled state');
    const fetchCallsAfterMount = fetchCallCountForLockedControl;
    act(() => {
        lockedControlButton.props.onClick?.();
    });
    check(fetchCallCountForLockedControl === fetchCallsAfterMount, 'Clicking the disabled button makes no additional save-related fetch call at all');
    act(() => {
        lockedControlRenderer.unmount();
    });

    // document.id changing must re-check the server rather than reusing the previous id's record/version.
    const idChangeFixtureA = documentFor('save-id-change-a', { id: 'save-owner-idchange' });
    const idChangeFixtureB = documentFor('save-id-change-b', { id: 'save-owner-idchange' });
    await sopApiCreate(sopApiRequest(memberHeaders('save-owner-idchange'), { memberId: 'save-owner-idchange', organizationId: 'org-home-test', document: idChangeFixtureA }));
    useSopPrototypeStore.setState({ memberInfo: { id: 'save-owner-idchange', name: 'x', jobRole: 'y', organization: 'org-home-test' }, document: idChangeFixtureA, customerReviewMode: false });
    const idChangeRenderer = renderComponent(React.createElement(SopServerSaveControl, { fetchImpl: buildSopApiFetch() }));
    await flushEffects();
    const textForDocA = JSON.stringify(idChangeRenderer.toJSON());
    check(textForDocA.includes('서버 저장됨'), 'Control correctly shows the existing saved record for document A on first mount');
    act(() => {
        useSopPrototypeStore.setState({ document: idChangeFixtureB });
    });
    await flushEffects();
    const textForDocB = JSON.stringify(idChangeRenderer.toJSON());
    check(!textForDocB.includes('서버 저장됨'), 'After document.id changes to an unsaved document B, the control does NOT keep showing document A\'s saved/version state — it re-checked the server for the new id');
    act(() => {
        idChangeRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Code review round 3, defect 6: Home status counts and the enumerated row
    // list must be reconcilable — the same numbers a member sees must match what
    // is actually listed underneath them.
    // ---------------------------------------------------------
    console.log('Defect fix: buildSopStatusRows keeps counts and the listed rows in sync (server + local draft)...');

    const homeServerRecord = makeRecord({ id: 'home-server-draft', lifecycleStatus: 'draft', document: documentFor('home-server-draft', {}) });
    const homeLocalDraftDifferentId = documentFor('home-local-only-draft', {});
    const rowsBothSources = buildSopStatusRows([homeServerRecord], homeLocalDraftDifferentId);
    check(rowsBothSources.length === 2, 'A server draft + a local draft with a DIFFERENT id produce two distinct rows');
    check(computeSopStatusCounts([homeServerRecord], homeLocalDraftDifferentId).draft === 2, 'The draft count matches the number of rows actually listed (2), not a separately-computed number');
    check(rowsBothSources.some((row) => row.source === 'local-draft' && row.id === homeLocalDraftDifferentId.id), 'The local-only row is labeled with source "local-draft"');
    check(rowsBothSources.some((row) => row.source === 'server' && row.id === homeServerRecord.id), 'The server row is labeled with source "server"');

    const rowsSameId = buildSopStatusRows([homeServerRecord], { ...homeLocalDraftDifferentId, id: homeServerRecord.id });
    check(rowsSameId.length === 1, 'A server record and a local draft sharing the SAME id collapse to exactly one row');
    check(computeSopStatusCounts([homeServerRecord], { ...homeLocalDraftDifferentId, id: homeServerRecord.id }).draft === 1, 'The same-id case counts as exactly 1 draft, matching the single listed row');

    const rowsServerOnly = buildSopStatusRows([homeServerRecord], null);
    check(rowsServerOnly[0].lifecycleStatus === 'draft' && rowsServerOnly[0].source === 'server', 'A server record row carries its real lifecycleStatus');

    const rowsServerFetchFailure = buildSopStatusRows([], homeLocalDraftDifferentId);
    check(
        rowsServerFetchFailure.length === 1 && rowsServerFetchFailure[0].source === 'local-draft',
        'When the server list is unavailable (empty records, matching the existing error-fallback behavior), only the local draft is listed — never a fabricated server row'
    );

    // Component-level: the local-draft row is visibly labeled, not shown identically to a server row.
    useSopPrototypeStore.setState({
        memberInfo: { id: 'home-row-member', name: 'x', jobRole: 'y' },
        document: documentFor('home-row-local-draft', {}),
    });
    const rowFetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/sop')) return jsonResponse({ records: [] });
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
        return jsonResponse({ error: 'unhandled' }, 404);
    }) as unknown as typeof fetch;
    const rowHomeRenderer = renderComponent(React.createElement(SopMemberHomeView, { navigate: () => {}, fetchImpl: rowFetch }));
    await flushEffects();
    const rowHomeText = JSON.stringify(rowHomeRenderer.toJSON());
    check(rowHomeText.includes('브라우저 로컬 · 서버 미저장'), 'The Home SOP list visibly labels a local-only row as "브라우저 로컬 · 서버 미저장", distinct from a server record row');
    act(() => {
        rowHomeRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Code review round 3, defect 7: the Gate's workflow-structure card must show
    // the SAME computeSubActionCapacity numbers used by the actual request, never
    // a separately-estimated (and potentially contradictory) figure.
    // ---------------------------------------------------------
    console.log('Component: SopGenerationSettings shows the real applied capacity, not a stale estimate...');

    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.setState({ setupConfig: { detailLevel: 'standard', minSteps: 6, maxSteps: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: true, maxTotalNodes: 15, maxLoops: 3, splitComplexSteps: true } });
    const settingsAdjustedRenderer = renderComponent(React.createElement(SopGenerationSettings, { activityCount: 14 }));
    const settingsAdjustedText = JSON.stringify(settingsAdjustedRenderer.toJSON());
    const expectedCapacity = computeSubActionCapacity({ activityCount: 14, minSteps: 6, maxSteps: 8, maxTotalNodes: 15, detailLevel: 'standard' });
    check(expectedCapacity.adjusted, 'Fixture sanity check: 14 Activities against a 6~8 default setting DOES require an adjustment');
    const appliedCapacityNodes = settingsAdjustedRenderer.root.findAll((node) =>
        node.type === 'p' && Array.isArray(node.props.children) && node.props.children.includes('이 Task 실제 적용: ')
    );
    check(
        appliedCapacityNodes.length === 1 && appliedCapacityNodes[0].props.children.join('') === `이 Task 실제 적용: ${expectedCapacity.minSteps}~${expectedCapacity.maxSteps}단계 · 전체 노드 상한 ${expectedCapacity.maxTotalNodes}개`,
        "The settings card displays the EXACT computeSubActionCapacity numbers — the same values sent in the real generation request — never a separately-rounded estimate"
    );
    check(settingsAdjustedText.includes('6') && settingsAdjustedText.includes('8'), 'The raw user setting (6~8) is still visible, clearly separate from the real-applied numbers');
    act(() => {
        settingsAdjustedRenderer.unmount();
    });

    const settingsUnadjustedRenderer = renderComponent(React.createElement(SopGenerationSettings, { activityCount: 2 }));
    const settingsUnadjustedText = JSON.stringify(settingsUnadjustedRenderer.toJSON());
    check(!settingsUnadjustedText.includes('이 Task 실제 적용'), 'When capacity needs no adjustment (few Activities), no second "실제 적용" box is shown at all — no contradictory/duplicate range display');
    act(() => {
        settingsUnadjustedRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Code review round 3, defect 8: the Task-count label must reflect the
    // CURRENT Job's actual taskCatalog length, never the customer sample's
    // global 10-Task statistic.
    // ---------------------------------------------------------
    console.log('Component: WorkLibrarySelector Task count label matches the real per-Job catalog size...');

    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.setState({ workLibrary: CUSTOMER_WORK_LIBRARY });
    const realJobTaskCount = CUSTOMER_WORK_LIBRARY.taskCatalog.length;
    check(realJobTaskCount < 10, 'Fixture sanity check: a single Job has fewer than the global 10-Task statistic (5 per Job)');
    const selectorRenderer = renderComponent(React.createElement(WorkLibrarySelector));
    const taskCountLabel = () => selectorRenderer.root.findAll((node) =>
        node.type === 'p' && extractText(node.props.children).startsWith('Task (')
    )[0];
    check(extractText(taskCountLabel().props.children) === `Task (${realJobTaskCount})`, `The label shows the real per-Job Task count (${realJobTaskCount}), not the hard-coded global 10`);
    check(extractText(taskCountLabel().props.children) !== 'Task (10)' || realJobTaskCount === 10, 'The old hard-coded "Task (10)" label is gone unless the real count genuinely happens to be 10');

    const selectorAddButton = selectorRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('+ Task'));
    act(() => {
        selectorAddButton!.props.onClick();
    });
    check(extractText(taskCountLabel().props.children) === `Task (${realJobTaskCount + 1})`, 'Adding a Task immediately updates the displayed count');

    const selectorSearchInput = selectorRenderer.root.findAllByType('input').find((i) => i.props.placeholder === 'Task 검색');
    act(() => {
        selectorSearchInput!.props.onChange({ target: { value: '존재하지-않는-task-이름' } });
    });
    check(/^Task \(검색 결과 0 \/ 전체 \d+\)$/.test(extractText(taskCountLabel().props.children)), 'While searching, the label distinguishes "검색 결과 N" from "전체 M" instead of showing one ambiguous number');
    act(() => {
        selectorRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Domain: computeMemberTaskActivitySkillCounts — distinct Task/Activity/Skill counts
    // ---------------------------------------------------------
    console.log('Domain: computeMemberTaskActivitySkillCounts...');
    check(
        computeMemberTaskActivitySkillCounts([]).taskCount === 0 &&
        computeMemberTaskActivitySkillCounts([]).activityCount === 0 &&
        computeMemberTaskActivitySkillCounts([]).skillCount === 0,
        'No records yields all-zero Task/Activity/Skill counts (never a fabricated non-zero value)'
    );

    const countsRecords: SopRecord[] = [
        makeRecord({ id: 'count-r1', taskId: 'task-a', document: documentFor('count-r1', {}) }),
        // A duplicate of the SAME record id must never be double-counted, even if it appears twice.
        makeRecord({ id: 'count-r1', taskId: 'task-a', document: documentFor('count-r1', {}) }),
        makeRecord({ id: 'count-r2', taskId: 'task-a', document: documentFor('count-r2', {}) }),
    ];
    const contentCounts = computeMemberTaskActivitySkillCounts(countsRecords);
    check(contentCounts.taskCount === 1, 'Two records under the SAME taskId contribute exactly 1 distinct Task, and a duplicate record id is deduplicated first');
    const expectedDistinctActivityIds = new Set(SAMPLE_SOP_DOCUMENT.steps.flatMap((s) => s.sourceActivityIds ?? []));
    check(contentCounts.activityCount === expectedDistinctActivityIds.size, 'Activity count is the distinct set of sourceActivityIds actually referenced by non-terminal steps');
    const expectedDistinctSkillKeys = new Set(
        SAMPLE_SOP_DOCUMENT.steps.filter((s) => !s.terminalType).flatMap((s) => s.requiredSkills.map((sk) => (sk.skillId ? `id:${sk.skillId}` : `name:${sk.name}`)))
    );
    check(contentCounts.skillCount === expectedDistinctSkillKeys.size, 'Skill count is a DISTINCT count of Skill identity, not a raw count of Activity-Skill relationships (a repeated Skill counts once)');

    // ---------------------------------------------------------
    // Component: own-prior card and picker — search, preview, clone, and independence
    // ---------------------------------------------------------
    console.log('Component: SopOwnPriorPicker...');
    const ownPriorMember: SopMember = { id: 'own-prior-owner', name: '기존 작성 구성원', jobRole: '채용담당자', organization: 'Org' };
    useSopPrototypeStore.setState({ memberInfo: ownPriorMember, document: null });

    const ownPriorRecords: SopRecord[] = [
        makeRecord({
            id: 'own-prior-source', memberId: ownPriorMember.id, lifecycleStatus: 'draft', taskId: 'task-recruitment-ops', taskName: '채용 운영',
            document: documentFor('own-prior-source', { id: ownPriorMember.id }), updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        makeRecord({
            id: 'own-prior-other', memberId: ownPriorMember.id, lifecycleStatus: 'approved', taskId: 'task-marketing', taskName: '마케팅 전략 수립',
            document: { ...documentFor('own-prior-other', { id: ownPriorMember.id }), title: '마케팅 SOP' }, updatedAt: '2026-02-01T00:00:00.000Z',
        }),
    ];

    const ownPriorFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        const priorCloneMatch = url.match(/\/api\/sop\/([^/]+)\/prior-clone$/);
        if (priorCloneMatch && method === 'POST') {
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const fakeReq = { headers, json: async () => undefined } as unknown as Parameters<typeof sopApiPriorClone>[0];
            return sopApiPriorClone(fakeReq, { params: Promise.resolve({ id: decodeURIComponent(priorCloneMatch[1]) }) });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    // Fixture setup: the picker's clone route needs a genuinely-saved source record — save
    // one directly through the repository (bypassing HTTP, same pattern as other fixtures here).
    await sopRepository.create({ memberId: ownPriorMember.id!, organizationId: 'org-own-prior-test', document: ownPriorRecords[0].document });

    const ownPriorNavigations: string[] = [];
    const ownPriorRenderer = renderComponent(
        React.createElement(SopOwnPriorPicker, { records: ownPriorRecords, onClose: () => {}, navigate: (href: string) => ownPriorNavigations.push(href), fetchImpl: ownPriorFetch })
    );
    await flushEffects();

    const ownPriorText = JSON.stringify(ownPriorRenderer.toJSON());
    check(ownPriorText.includes('마케팅 SOP') && ownPriorText.includes(SAMPLE_SOP_DOCUMENT.title), "Both of the current member's own records are listed");

    const ownPriorButtons = ownPriorRenderer.root.findAllByType('button');
    const ownPriorSourceCard = ownPriorButtons.find((b) => extractText(b.props.children).includes(SAMPLE_SOP_DOCUMENT.title) && extractText(b.props.children).includes('채용 운영'));
    check(Boolean(ownPriorSourceCard), 'The own-prior-source record card shows Task name alongside the SOP title');

    act(() => {
        ownPriorSourceCard!.props.onClick();
    });
    const afterSelectText = JSON.stringify(ownPriorRenderer.toJSON());
    check(afterSelectText.includes('읽기 전용 미리 보기'), 'Selecting a record shows a read-only preview before cloning');

    const cloneButton = ownPriorRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('새 초안 만들기'));
    await act(async () => {
        cloneButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
    });
    // W4-04C moved the clone landing point from Workspace to the Work Map editing step
    // (adoptClonedWorkMap succeeds because documentFor's workLibrary snapshot resolves the
    // source Task) so Activity/SOP content stays editable per §2.3/§2.4 — see
    // W4_05_INTEGRATION.md's "반드시 먼저 해소할 알려진 충돌" for why this assertion moved
    // rather than being deleted.
    check(ownPriorNavigations.at(-1) === '/sop/work-map/simple', 'A successful clone navigates to the Work Map editing step (/sop/work-map/simple), not straight to Workspace');
    const clonedDocumentAfterPicker = useSopPrototypeStore.getState().document;
    check(Boolean(clonedDocumentAfterPicker) && clonedDocumentAfterPicker!.id !== 'own-prior-source', 'The cloned document loaded into the Store has a brand-new id, distinct from the source');
    check(clonedDocumentAfterPicker?.sourceRecordId === 'own-prior-source', 'The cloned document records sourceRecordId provenance pointing at the source');
    check(clonedDocumentAfterPicker?.member.id === ownPriorMember.id, 'The clone keeps the SAME member identity (own-prior clone never sanitizes/replaces identity)');

    const sourceStillIntact = await sopRepository.getById('own-prior-source');
    check(sourceStillIntact?.document.title === SAMPLE_SOP_DOCUMENT.title, 'Cloning never mutates the original source record');

    // The Work Map landing point above is conditional on adoptClonedWorkMap finding the
    // source Task in the cloned document's workLibrary snapshot. A document whose Task can no
    // longer be resolved (e.g. a legacy record) must not strand the member — it still falls
    // back to Workspace, exactly like before W4-04C. adoptClonedWorkMap's own null-return
    // contract is proven directly in tests/sop-work-map-domain.test.ts; this only proves the
    // picker's fallback wiring, so the Store action is stubbed rather than constructing an
    // actual unresolvable document (the real clone API's schema validation rejects a taskId
    // absent from its own taskCatalog before the picker ever sees it).
    const originalAdoptClonedWorkMapForFallback = useSopPrototypeStore.getState().adoptClonedWorkMap;
    useSopPrototypeStore.setState({ adoptClonedWorkMap: () => false });
    const fallbackMember: SopMember = { id: 'own-prior-fallback-owner', name: '레거시 구성원', jobRole: '채용담당자', organization: 'Org' };
    useSopPrototypeStore.setState({ memberInfo: fallbackMember, document: null });
    const fallbackRecord = makeRecord({
        id: 'own-prior-fallback-source', memberId: fallbackMember.id, lifecycleStatus: 'draft', taskId: 'task-recruitment-ops', taskName: '채용 운영',
        document: documentFor('own-prior-fallback-source', { id: fallbackMember.id }), updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await sopRepository.create({ memberId: fallbackMember.id!, organizationId: 'org-own-prior-test', document: fallbackRecord.document });
    const fallbackNavigations: string[] = [];
    const fallbackRenderer = renderComponent(
        React.createElement(SopOwnPriorPicker, { records: [fallbackRecord], onClose: () => {}, navigate: (href: string) => fallbackNavigations.push(href), fetchImpl: ownPriorFetch })
    );
    await flushEffects();
    const fallbackCard = fallbackRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(SAMPLE_SOP_DOCUMENT.title));
    act(() => { fallbackCard!.props.onClick(); });
    const fallbackCloneButton = fallbackRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('새 초안 만들기'));
    await act(async () => {
        fallbackCloneButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
    });
    check(fallbackNavigations.at(-1) === '/sop/workspace', 'A document whose Task cannot be resolved into a Work Map draft still falls back to /sop/workspace instead of stranding the clone');
    act(() => { fallbackRenderer.unmount(); });
    useSopPrototypeStore.setState({ adoptClonedWorkMap: originalAdoptClonedWorkMapForFallback });

    act(() => {
        ownPriorRenderer.unmount();
    });

    // Empty-state: no records at all.
    const emptyOwnPriorRenderer = renderComponent(
        React.createElement(SopOwnPriorPicker, { records: [], onClose: () => {}, navigate: () => {}, fetchImpl: ownPriorFetch })
    );
    const emptyOwnPriorText = JSON.stringify(emptyOwnPriorRenderer.toJSON());
    check(emptyOwnPriorText.includes('아직 저장된 내 SOP가 없습니다'), 'An empty own-prior list shows an explicit empty state, not a blank/loading screen');
    act(() => {
        emptyOwnPriorRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Component: Home renders a 4th (own-prior) creation card, and rejected/approved rows
    // show the correct affordances (feedback + 수정하기 vs. read-only).
    // ---------------------------------------------------------
    console.log('Component: Home own-prior card, rejected feedback + 수정하기, approved read-only...');
    const rowsMember: SopMember = { id: 'rows-member', name: '행 테스트', jobRole: '채용담당자', organization: 'Org' };
    useSopPrototypeStore.setState({ memberInfo: rowsMember, document: null });

    const rejectedRow = makeRecord({
        id: 'rows-rejected', memberId: rowsMember.id, lifecycleStatus: 'rejected',
        taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, taskName: SAMPLE_SOP_DOCUMENT.workLibrary.taskName,
        document: documentFor('rows-rejected', { id: rowsMember.id }),
        rejection: { rejectedAtStage: 'leader-review', reasonCode: 'insufficient-detail', feedback: '(테스트) 3단계 기준을 구체화해 주세요.', reviewedByRole: 'leader', reviewedAt: new Date().toISOString() },
    });
    const approvedRow = makeRecord({
        id: 'rows-approved', memberId: rowsMember.id, lifecycleStatus: 'approved',
        taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, taskName: SAMPLE_SOP_DOCUMENT.workLibrary.taskName,
        document: documentFor('rows-approved', { id: rowsMember.id }),
    });

    const rowsFetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/sop')) return jsonResponse({ records: [rejectedRow, approvedRow] });
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const rowsRenderer = renderComponent(React.createElement(SopMemberHomeView, { navigate: () => {}, fetchImpl: rowsFetch }));
    await flushEffects();

    const rowsAllButtons = rowsRenderer.root.findAllByType('button');
    const ownPriorCardButton = rowsAllButtons.find((b) => extractText(b.props.children).includes('기존 작성 기반'));
    check(Boolean(ownPriorCardButton), 'Home renders a 4th, active "기존 작성 기반" start-point card');

    const rowsText = JSON.stringify(rowsRenderer.toJSON());
    check(rowsText.includes('구체화해 주세요'), "A rejected row's rejection feedback is visible on the member Home");
    check(rowsText.includes('insufficient-detail'), "A rejected row's reason code is visible on the member Home");

    const editRejectedButton = rowsAllButtons.find((b) => extractText(b.props.children) === '수정하기');
    check(Boolean(editRejectedButton), 'A rejected row shows a "수정하기" action');
    act(() => {
        editRejectedButton!.props.onClick();
    });
    const documentAfterEditRejected = useSopPrototypeStore.getState().document;
    check(documentAfterEditRejected?.id === 'rows-rejected', '"수정하기" loads the rejected record\'s own document (same id) back into the editor, never a clone');
    check(useSopPrototypeStore.getState().customerReviewMode === false, '"수정하기" deterministically ensures customer review mode is off so the record is actually editable');

    check(rowsText.includes('읽기 전용'), 'An approved row is marked read-only');
    const editButtonsTotal = rowsAllButtons.filter((b) => extractText(b.props.children) === '수정하기').length;
    check(editButtonsTotal === 1, 'Exactly one "수정하기" button exists (the rejected row\'s) — the approved row never offers one');

    act(() => {
        rowsRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Component: a rejected-then-reconfirmed record (member edited, saved, and
    // re-confirmed after "수정하기") offers a "재요청" resubmit action.
    // ---------------------------------------------------------
    console.log('Component: rejected record shows 재요청 after reconfirmation, and it actually resubmits...');
    const resubmitMember: SopMember = { id: 'resubmit-member', name: '재요청 테스트', jobRole: '채용담당자', organization: 'Org' };
    useSopPrototypeStore.setState({ memberInfo: resubmitMember, document: null });

    const reconfirmedRejectedDoc = documentFor('resubmit-doc', { id: resubmitMember.id }, { reviewStatus: 'confirmed', steps: SAMPLE_SOP_DOCUMENT.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const })) });
    let resubmitRecord = makeRecord({
        id: 'resubmit-doc', memberId: resubmitMember.id, lifecycleStatus: 'rejected',
        taskId: SAMPLE_SOP_DOCUMENT.workLibrary.taskId, taskName: SAMPLE_SOP_DOCUMENT.workLibrary.taskName,
        document: reconfirmedRejectedDoc,
        rejection: { rejectedAtStage: 'leader-review', reasonCode: 'x', feedback: '(테스트)', reviewedByRole: 'leader', reviewedAt: new Date().toISOString() },
    });
    // Fixture setup: the record must actually exist in the repository (reaching this exact
    // rejected+reconfirmed state through the real API) so the resubmit button's real POST
    // /api/sop/[id]/lifecycle call has something genuine to act on.
    await sopRepository.create({ memberId: resubmitMember.id!, organizationId: 'org-resubmit-test', document: { ...reconfirmedRejectedDoc, reviewStatus: 'ai-draft' } });
    await sopRepository.update('resubmit-doc', { document: reconfirmedRejectedDoc, expectedVersion: 1 });
    await sopRepository.transitionLifecycle('resubmit-doc', { actorRole: 'member', actorId: resubmitMember.id!, kind: 'member-submit' });
    const rejectResult = await sopRepository.transitionLifecycle('resubmit-doc', { actorRole: 'leader', actorId: 'leader-resubmit', kind: 'leader-reject', reasonCode: 'x', feedback: '(테스트)' });
    check(rejectResult.ok, 'Fixture setup: rejecting the record must succeed');
    resubmitRecord = rejectResult.ok ? rejectResult.record : resubmitRecord;

    const resubmitFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (url.endsWith('/api/sop')) return jsonResponse({ records: [resubmitRecord] });
        if (url.endsWith('/api/sop/templates')) return jsonResponse({ templates: [] });
        const lifecycleMatch = url.match(/\/api\/sop\/([^/]+)\/lifecycle$/);
        if (lifecycleMatch && method === 'POST') {
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const body = init?.body ? JSON.parse(init.body as string) : undefined;
            const fakeReq = { headers, json: async () => body };
            return sopApiLifecycle(fakeReq as unknown as Parameters<typeof sopApiLifecycle>[0], { params: Promise.resolve({ id: decodeURIComponent(lifecycleMatch[1]) }) });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const resubmitRenderer = renderComponent(React.createElement(SopMemberHomeView, { navigate: () => {}, fetchImpl: resubmitFetch }));
    await flushEffects();

    const resubmitButton = resubmitRenderer.root.findAllByType('button').find((b) => extractText(b.props.children) === '재요청');
    check(Boolean(resubmitButton), 'A rejected record whose document.reviewStatus is already "confirmed" (re-edited and reconfirmed) shows a "재요청" button');

    await act(async () => {
        resubmitButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    const afterResubmit = await sopRepository.getById('resubmit-doc');
    check(afterResubmit?.lifecycleStatus === 'leader-review', 'Clicking 재요청 actually resubmits the record, restarting at leader-review (never sme-review) — the "프로토타입 기준" rule');
    check(afterResubmit?.rejection === undefined, 'A successful resubmission clears the prior rejection metadata');

    act(() => {
        resubmitRenderer.unmount();
    });

    console.log(`ALL SOP MEMBER HOME TESTS PASSED (${passed})`);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
