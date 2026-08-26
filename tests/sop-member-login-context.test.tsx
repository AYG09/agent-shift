/**
 * Wave 1A — 로그인 게이트와 업무맥락 입력 화면 회귀 테스트.
 *
 * 02_WAVE1A_LOGIN_CONTEXT.md 수용 검증 목록을 실행 가능한 컴포넌트 테스트로
 * 증명한다: source-string 검색이 아니라 실제 Store 상태 전이와 navigate 호출을
 * 검증한다.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopMemberLoginGateView } from '../src/components/sop/SopMemberLoginGate';
import { SopMemberContextFormView } from '../src/components/sop/SopMemberContextForm';
import { SopMemberRouteGuard } from '../src/components/sop/SopMemberRouteGuard';
import { SOP_INTAKE_ROUTES, isAuthenticated } from '../src/lib/sop-member-intake';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP 구성원 로그인·업무맥락 화면 (Wave 1A) ===');
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

function extractText(node: unknown): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
        return extractText((node as { props?: { children?: unknown } }).props?.children);
    }
    return '';
}

function fillValidIdentity(renderer: TestRenderer.ReactTestRenderer) {
    const inputs = renderer.root.findAllByType('input');
    const byId = (id: string) => inputs.find((i) => i.props.id === id);
    act(() => {
        byId('sop-login-employeeId')!.props.onChange({ target: { value: '20231045' } });
        byId('sop-login-name')!.props.onChange({ target: { value: '김지훈' } });
        byId('sop-login-organization')!.props.onChange({ target: { value: '인사기획팀' } });
        byId('sop-login-jobRole')!.props.onChange({ target: { value: '채용 운영' } });
    });
    const form = renderer.root.findByType('form');
    act(() => {
        form.props.onSubmit({ preventDefault: () => {} });
    });
}

/** 이후 업무맥락 테스트가 authenticated 상태에서 시작하도록 로그인만 수행하고, 렌더러는 즉시 정리한다
 *  (구독을 남겨 두면 이후 act() 밖 Store 갱신마다 "not wrapped in act" 경고가 새어 나온다). */
function loginAsValidMember() {
    const renderer = renderComponent(React.createElement(SopMemberLoginGateView, { navigate: () => {} }));
    fillValidIdentity(renderer);
    act(() => renderer.unmount());
}

async function run() {
    // --- TST-STATE-001: anonymous가 /sop/context에 직접 접근하면 login으로 이동한다 ---
    useSopPrototypeStore.getState().resetStore();
    {
        const navigateCalls: string[] = [];
        const renderer = renderComponent(
            <SopMemberRouteGuard route={SOP_INTAKE_ROUTES.context} navigate={(href: string) => navigateCalls.push(href)}>
                <SopMemberContextFormView navigate={() => {}} />
            </SopMemberRouteGuard>
        );
        await flushEffects();
        check(navigateCalls.includes(SOP_INTAKE_ROUTES.login), 'TST-STATE-001: anonymous의 /sop/context 직접 접근은 /sop/login으로 리다이렉트된다');
        check(renderer.root.findAllByType('textarea').length === 0, '리다이렉트되는 동안 업무맥락 폼(children)은 렌더되지 않는다 — 가드가 화면 redirect만 하는 장식이 아니라 실제로 children을 막는다');
        act(() => renderer.unmount());
    }

    // --- 필수 identity 누락은 session을 만들지 않는다 ---
    useSopPrototypeStore.getState().resetStore();
    {
        const navigateCalls: string[] = [];
        const renderer = renderComponent(React.createElement(SopMemberLoginGateView, { navigate: (href: string) => navigateCalls.push(href) }));
        const form = renderer.root.findByType('form');
        act(() => {
            form.props.onSubmit({ preventDefault: () => {} });
        });
        check(!isAuthenticated(useSopPrototypeStore.getState().memberSession), '필수 필드가 비어 있는 제출은 authenticated session을 만들지 않는다 (REQ-AUTH-002)');
        check(navigateCalls.length === 0, '거부된 제출은 어떤 navigate도 호출하지 않는다');
        const errorAlerts = renderer.root.findAll((node) => node.props.role === 'alert');
        check(errorAlerts.length === 4, '4개 필수 필드(사번·이름·조직·주요 직무) 모두에 field-level 오류가 표시된다');
        act(() => renderer.unmount());
    }

    // --- 유효 identity는 context route로 전이한다 ---
    useSopPrototypeStore.getState().resetStore();
    {
        const navigateCalls: string[] = [];
        const renderer = renderComponent(React.createElement(SopMemberLoginGateView, { navigate: (href: string) => navigateCalls.push(href) }));
        fillValidIdentity(renderer);
        check(isAuthenticated(useSopPrototypeStore.getState().memberSession), '4개 필수 필드를 채운 제출은 authenticated session을 만든다');
        check(navigateCalls[navigateCalls.length - 1] === SOP_INTAKE_ROUTES.context, 'INT-AUTH-002: 유효 제출 후 /sop/context로 이동한다');
        act(() => renderer.unmount());

        // --- 이미 로그인된 상태에서 /sop/login에 다시 들어오면 접근은 막지 않되 화면이 안내한다 ---
        const secondNavigateCalls: string[] = [];
        const secondRenderer = renderComponent(React.createElement(SopMemberLoginGateView, { navigate: (href: string) => secondNavigateCalls.push(href) }));
        check(secondRenderer.root.findAllByType('form').length === 0, '이미 인증된 구성원에게는 로그인 폼 대신 안내 배너가 보인다');
        const switchButton = secondRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('다른 구성원으로 로그인'));
        check(Boolean(switchButton), '다른 구성원으로 로그인 액션이 제공된다');
        act(() => {
            switchButton!.props.onClick();
        });
        check(!isAuthenticated(useSopPrototypeStore.getState().memberSession), '다른 구성원으로 로그인을 누르면 session이 anonymous로 돌아간다 (signOutMember)');
        act(() => secondRenderer.unmount());
    }

    // --- 공백 context는 recommendation 상태·navigation을 만들지 않는다 ---
    useSopPrototypeStore.getState().resetStore();
    loginAsValidMember();
    {
        const navigateCalls: string[] = [];
        const renderer = renderComponent(React.createElement(SopMemberContextFormView, { navigate: (href: string) => navigateCalls.push(href) }));
        const textarea = renderer.root.findByType('textarea');

        // A11Y-2: 업무맥락 textarea는 이 흐름의 유일한 주 과업이므로 accessible name을 가져야 한다.
        const labelledById = textarea.props['aria-labelledby'] as string | undefined;
        check(!!labelledById, 'A11Y-2: 업무맥락 textarea에 aria-labelledby가 있다');
        const labellingHeading = renderer.root.findAll((node) => typeof node.type === 'string' && node.props.id === labelledById);
        check(labellingHeading.length === 1 && extractText(labellingHeading[0].props.children).length > 0, 'A11Y-2: aria-labelledby가 실제 존재하는, 텍스트가 있는 제목 요소를 가리킨다');

        act(() => {
            textarea.props.onChange({ target: { value: '   ' } });
        });
        const form = renderer.root.findByType('form');
        act(() => {
            form.props.onSubmit({ preventDefault: () => {} });
        });
        check(useSopPrototypeStore.getState().taskRecommendation.status === 'idle', 'TST-REC-001: 공백만 있는 업무맥락 제출은 추천 상태를 pending으로 만들지 않는다');
        check(navigateCalls.length === 0, '공백만 있는 제출은 /sop/recommendation으로 이동하지 않는다');
        const errorAlerts = renderer.root.findAll((node) => node.props.role === 'alert');
        check(
            errorAlerts.some((n) => extractText(n.props.children).includes('공백만 있는 입력은 제출할 수 없습니다')),
            '공백만 있는 제출에 인라인 검증 메시지가 표시된다'
        );
        act(() => renderer.unmount());
    }

    // --- 유효 context는 단일 authoritative field에 저장되고 recommendation-pending과 navigation을 만든다 ---
    // --- 이 세션 UI는 추천 API를 직접 호출하지 않는다 ---
    useSopPrototypeStore.getState().resetStore();
    loginAsValidMember();
    {
        const navigateCalls: string[] = [];
        const originalFetch = globalThis.fetch;
        let fetchCalled = false;
        globalThis.fetch = (() => {
            fetchCalled = true;
            throw new Error('SopMemberContextForm은 추천 API를 직접 호출하지 않아야 한다 — 그 책임은 /sop/recommendation(Session B)에 있다.');
        }) as unknown as typeof fetch;

        const renderer = renderComponent(React.createElement(SopMemberContextFormView, { navigate: (href: string) => navigateCalls.push(href) }));
        const sampleContext = '채용 공고를 등록하고 지원자 서류를 검토한다. 1차 합격자에게 면접 일정을 안내한다.';
        const textarea = renderer.root.findByType('textarea');
        act(() => {
            textarea.props.onChange({ target: { value: sampleContext } });
        });
        const form = renderer.root.findByType('form');
        act(() => {
            form.props.onSubmit({ preventDefault: () => {} });
        });

        const state = useSopPrototypeStore.getState();
        check(state.memberContext.confirmedText === sampleContext, 'REQ-CTX-004/TST-STATE-004: 확정된 업무맥락이 사용자가 입력한 원문과 정확히 같다 — 추천과 생성이 읽을 단일 원본');
        check(state.taskRecommendation.status === 'pending', '유효 제출은 추천 상태를 pending으로 전이시킨다');
        check(navigateCalls[navigateCalls.length - 1] === SOP_INTAKE_ROUTES.recommendation, '유효 제출 후 /sop/recommendation으로 이동한다');
        check(!fetchCalled, '이 화면은 fetch를 직접 호출하지 않는다 (추천 API 호출 없음)');

        globalThis.fetch = originalFetch;
        act(() => renderer.unmount());
    }

    // --- 보조 예시 칩은 최대 3개 그룹으로 접혀 있고, 클릭하면 draft에 삽입된다 ---
    useSopPrototypeStore.getState().resetStore();
    loginAsValidMember();
    {
        const renderer = renderComponent(React.createElement(SopMemberContextFormView, { navigate: () => {} }));
        const helpToggle = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('참고 예시 보기'));
        check(Boolean(helpToggle), 'INT-CTX-001: 보조 예시로 이동하는 접힌 토글이 존재한다 (기본 접힘 progressive disclosure)');
        act(() => {
            helpToggle!.props.onClick();
        });
        const snippetChip = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('선행 조건'));
        check(Boolean(snippetChip), '예시 칩(예: 선행 조건)이 펼친 뒤 보인다');
        act(() => {
            snippetChip!.props.onClick();
        });
        check(useSopPrototypeStore.getState().memberContext.draft.includes('[선행 조건]'), '예시 칩을 누르면 해당 스니펫이 draft에 삽입된다');
        act(() => renderer.unmount());
    }

    // --- 새로고침·재마운트 후에도 작성 중 draft가 보존된다 (Store가 단일 원본이므로 컴포넌트 로컬 상태로 유실되지 않음) ---
    useSopPrototypeStore.getState().resetStore();
    loginAsValidMember();
    {
        const firstRenderer = renderComponent(React.createElement(SopMemberContextFormView, { navigate: () => {} }));
        act(() => {
            firstRenderer.root.findByType('textarea').props.onChange({ target: { value: '작성 중인 임시 내용' } });
        });
        act(() => firstRenderer.unmount());

        const secondRenderer = renderComponent(React.createElement(SopMemberContextFormView, { navigate: () => {} }));
        check(secondRenderer.root.findByType('textarea').props.value === '작성 중인 임시 내용', '컴포넌트를 재마운트해도(새로고침 시나리오 근사) 작성 중이던 draft가 Store에서 그대로 보존된다');
        act(() => secondRenderer.unmount());
    }

    console.log(`\nALL SOP MEMBER LOGIN/CONTEXT TESTS PASSED (${passed})`);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
