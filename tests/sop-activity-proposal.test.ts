import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopActivityProposalPanel } from '../src/components/sop/SopActivityProposalPanel';
import { CUSTOMER_WORK_LIBRARY } from '../src/lib/sop-sample-data';
import type { SopMember, WorkLibrarySelection } from '../src/lib/sop-types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP Activity Proposal Panel component regression tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
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

function extractText(node: unknown): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
        return extractText((node as { props?: { children?: unknown } }).props?.children);
    }
    return '';
}

const PROPOSAL_MEMBER: SopMember = { id: 'proposal-member', name: '제안 테스트', jobRole: 'Talent Acquisition', organization: 'Org' };

function baseWorkLibrary(): WorkLibrarySelection {
    return { ...CUSTOMER_WORK_LIBRARY, sourceType: 'task', confirmed: true };
}

function buildProposeFetch(proposals: unknown[]): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/sop/activity-proposals') && (init?.method || 'GET').toUpperCase() === 'POST') {
            return jsonResponse({ proposals });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;
}

async function run() {
    // ---------------------------------------------------------
    // Empty context: client-side validation blocks the request, zero fetch calls.
    // ---------------------------------------------------------
    console.log('Empty context blocks the request before any fetch call...');
    let fetchCallCount = 0;
    const countingOriginalFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        fetchCallCount++;
        return buildProposeFetch([])(...args);
    }) as unknown as typeof fetch;

    useSopPrototypeStore.setState({ memberInfo: PROPOSAL_MEMBER, workLibrary: baseWorkLibrary(), context: '', customerReviewMode: false });
    const emptyContextRenderer = renderComponent(React.createElement(SopActivityProposalPanel));
    const findButton = () => emptyContextRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('부족한 Activity 찾기'))!;
    act(() => {
        findButton().props.onClick();
    });
    await flushEffects();
    check(fetchCallCount === 0, 'Requesting proposals with empty context makes zero API calls');
    check(JSON.stringify(emptyContextRenderer.toJSON()).includes('업무 맥락을 먼저 입력'), 'An explicit client-side error is shown for empty context');
    act(() => emptyContextRenderer.unmount());
    globalThis.fetch = countingOriginalFetch;

    // ---------------------------------------------------------
    // Successful propose + accept: patch applied, confirmed cleared, badge flips.
    // ---------------------------------------------------------
    console.log('Successful propose + accept applies the patch and clears confirmed...');
    const context = '해외 신규 응용처 대응 업무를 처리합니다.';
    const rawProposals = [
        { name: '해외 규제 대응 검토', description: '해외 진출 시 현지 규제 요건을 사전 검토합니다.', rationale: '맥락에 해외 대응이 언급됨', skills: [{ name: '해외 규제 리서치' }] },
    ];
    useSopPrototypeStore.setState({ memberInfo: PROPOSAL_MEMBER, workLibrary: baseWorkLibrary(), context, customerReviewMode: false });
    check(useSopPrototypeStore.getState().workLibrary.confirmed === true, 'Fixture setup: workLibrary starts confirmed');

    // This component reads fetch globally (mirrors SopTaskRecommendationPanel's real usage —
    // neither takes a fetchImpl prop), so stub globalThis.fetch for the scenarios that need it.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = buildProposeFetch(rawProposals);
    const proposeRenderer = renderComponent(React.createElement(SopActivityProposalPanel));
    act(() => {
        findButtonIn(proposeRenderer).props.onClick();
    });
    await flushEffects();
    const afterProposeText = JSON.stringify(proposeRenderer.toJSON());
    check(afterProposeText.includes('해외 규제 대응 검토') && afterProposeText.includes('AI 제안 · 미수락'), 'A successful proposal renders as an unaccepted card with its rationale/skills');

    const acceptButton = proposeRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('수락하고 Work Map에 추가'));
    check(Boolean(acceptButton), 'An unaccepted proposal card shows an accept button');
    act(() => {
        acceptButton!.props.onClick();
    });
    check(useSopPrototypeStore.getState().workLibrary.confirmed === false, 'Accepting a proposal clears workLibrary.confirmed — the exact defect this contract fixes');
    check(
        useSopPrototypeStore.getState().workLibrary.taskCatalog.find((t) => t.id === baseWorkLibrary().taskId)!.activities.some((a) => a.name === '해외 규제 대응 검토'),
        'Accepting a proposal actually adds the new Activity to the Store\'s Work Map'
    );
    const afterAcceptText = JSON.stringify(proposeRenderer.toJSON());
    check(afterAcceptText.includes('수락됨 · Work Map 반영') && !afterAcceptText.includes('AI 제안 · 미수락'), 'An accepted card shows ONLY the accepted label, never both "미수락" and "수락됨" at once');
    act(() => proposeRenderer.unmount());
    globalThis.fetch = originalFetch;

    // ---------------------------------------------------------
    // Task switch clears stale proposals from the panel.
    // ---------------------------------------------------------
    console.log('Switching Task clears any proposals still on screen...');
    const otherTask = CUSTOMER_WORK_LIBRARY.taskCatalog.find((t) => t.id !== CUSTOMER_WORK_LIBRARY.taskId) ?? CUSTOMER_WORK_LIBRARY.taskCatalog[1];
    useSopPrototypeStore.setState({ memberInfo: PROPOSAL_MEMBER, workLibrary: baseWorkLibrary(), context, customerReviewMode: false });
    globalThis.fetch = buildProposeFetch(rawProposals);
    const switchRenderer = renderComponent(React.createElement(SopActivityProposalPanel));
    act(() => {
        findButtonIn(switchRenderer).props.onClick();
    });
    await flushEffects();
    check(JSON.stringify(switchRenderer.toJSON()).includes('해외 규제 대응 검토'), 'Fixture setup: a proposal is visible before the Task switch');
    act(() => {
        useSopPrototypeStore.getState().setWorkLibrary({ taskId: otherTask.id, taskName: otherTask.name });
    });
    check(!JSON.stringify(switchRenderer.toJSON()).includes('해외 규제 대응 검토'), 'Switching Task clears the previously-shown proposal from the panel');
    act(() => switchRenderer.unmount());
    globalThis.fetch = originalFetch;

    // ---------------------------------------------------------
    // Context change clears stale proposals from the panel.
    // ---------------------------------------------------------
    console.log('Changing context clears any proposals still on screen...');
    useSopPrototypeStore.setState({ memberInfo: PROPOSAL_MEMBER, workLibrary: baseWorkLibrary(), context, customerReviewMode: false });
    globalThis.fetch = buildProposeFetch(rawProposals);
    const contextRenderer = renderComponent(React.createElement(SopActivityProposalPanel));
    act(() => {
        findButtonIn(contextRenderer).props.onClick();
    });
    await flushEffects();
    check(JSON.stringify(contextRenderer.toJSON()).includes('해외 규제 대응 검토'), 'Fixture setup: a proposal is visible before the context change');
    act(() => {
        useSopPrototypeStore.getState().setContext('완전히 다른 새 맥락입니다.');
    });
    check(!JSON.stringify(contextRenderer.toJSON()).includes('해외 규제 대응 검토'), 'Changing the context text clears the previously-shown proposal from the panel');
    act(() => contextRenderer.unmount());
    globalThis.fetch = originalFetch;

    // ---------------------------------------------------------
    // Customer review mode blocks both propose and accept.
    // ---------------------------------------------------------
    console.log('Customer review mode blocks propose and accept...');
    useSopPrototypeStore.setState({ memberInfo: PROPOSAL_MEMBER, workLibrary: baseWorkLibrary(), context, customerReviewMode: true });
    let lockedFetchCalls = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        lockedFetchCalls++;
        return buildProposeFetch(rawProposals)(...args);
    }) as unknown as typeof fetch;
    const lockedRenderer = renderComponent(React.createElement(SopActivityProposalPanel));
    const lockedButton = findButtonIn(lockedRenderer);
    check(lockedButton.props.disabled === true, 'The "부족한 Activity 찾기" button is disabled under customer review mode');
    act(() => {
        lockedButton.props.onClick();
    });
    await flushEffects();
    check(lockedFetchCalls === 0, 'Clicking the disabled button under customer review mode triggers no API call');
    act(() => lockedRenderer.unmount());
    globalThis.fetch = originalFetch;
    useSopPrototypeStore.setState({ customerReviewMode: false });

    console.log(`\nALL SOP ACTIVITY PROPOSAL PANEL TESTS PASSED (${passed})`);
}

function findButtonIn(renderer: TestRenderer.ReactTestRenderer) {
    const button = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('부족한 Activity 찾기'));
    if (!button) throw new Error('부족한 Activity 찾기 button not found');
    return button;
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
