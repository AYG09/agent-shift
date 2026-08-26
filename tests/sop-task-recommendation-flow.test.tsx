/**
 * Wave 1B — Task 추천·로딩 흐름 회귀 테스트.
 *
 * 핵심 주장:
 * 1. 확정 context 한 번에 추천 API는 정확히 한 번만 호출된다(TST-STATE-003).
 * 2. pending 동안 정적 도움말은 보이지만 confidence·가짜 진행률은 없다(TST-REC-006).
 * 3. unknown/duplicate ID, rank gap, 4개 초과 응답은 적용되지 않고 오류로 표면화된다(TST-REC-002).
 * 4. 추천 성공만으로 Task가 확정되거나 Work Map이 만들어지지 않는다(TST-REC-003).
 * 5. 명시적 "이 Task로 계속" 뒤에만 Work Map 초안이 생기고 다음 화면으로 이동한다(TST-REC-004).
 * 6. 실패 후에도 context가 보존되고 수동 검색으로 같은 확정 경로를 쓸 수 있다(TST-REC-005).
 * 7. 취소 이후 늦게 도착하는 응답이 현재 상태를 덮지 않는다.
 * 8. 새 context로 갱신된 뒤 도착하는 stale 응답이 새 상태를 덮지 않는다.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopTaskRecommendationFlowView } from '../src/components/sop/SopTaskRecommendationFlow';
import { SopRecommendationLoading } from '../src/components/sop/SopRecommendationLoading';
import { SOP_TASK_LIBRARY_FIXTURE } from '../src/lib/sop-task-library';
import { CUSTOMER_SOP_MEMBER } from '../src/lib/sop-sample-data';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP Task 추천·로딩 흐름 회귀 테스트 ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderComponent(element: React.ReactElement): TestRenderer.ReactTestRenderer {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(element);
    });
    return renderer;
}

/**
 * 각 시나리오가 끝나면 반드시 unmount한다. store가 zustand 싱글턴(모듈 전역)이라
 * unmount하지 않은 이전 렌더러가 다음 시나리오의 `setupSubmittedContext`(같은
 * store를 mutate)에 반응해 자신의(다른 시나리오의) fetchImpl로 경쟁 요청을 보내는
 * 오염을 막기 위함이다.
 */
function unmount(renderer: TestRenderer.ReactTestRenderer) {
    act(() => {
        renderer.unmount();
    });
}

async function flushEffects() {
    await act(async () => {
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
}

/**
 * `TestInstance.props.children`(React element 트리, children이 props 안에 있음)과
 * `renderer.toJSON()`(children이 최상위 필드로 분리된 직렬화 트리) 두 형태를 모두
 * 받아들인다 — 화면 전체 텍스트를 훑을 때는 toJSON()을, 특정 버튼을 찾을 때는
 * TestInstance.props.children을 쓰기 때문이다.
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

const job = SOP_TASK_LIBRARY_FIXTURE.jobs.find((candidate) => candidate.name === 'Talent Acquisition')!;
const [taskA, taskB] = job.tasks;

/** 매 시나리오를 로그인 + context 제출 직후 상태(= /sop/recommendation 진입 직전)로 되돌린다. */
function setupSubmittedContext(contextText: string) {
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().submitMemberIdentity({
        employeeId: CUSTOMER_SOP_MEMBER.employeeId,
        name: CUSTOMER_SOP_MEMBER.name,
        organization: CUSTOMER_SOP_MEMBER.organization,
        jobRole: CUSTOMER_SOP_MEMBER.jobRole,
    });
    useSopPrototypeStore.getState().setMemberContextDraft(contextText);
    const submitted = useSopPrototypeStore.getState().submitMemberContext();
    if (!submitted) throw new Error('setup: submitMemberContext returned null');
    return submitted.contextKey;
}

async function run() {
    // ---------------------------------------------------------
    // 1. 단일 호출 + pending 도움말(가짜 진행률 없음) + 성공만으로는 미확정
    // ---------------------------------------------------------
    {
        let callCount = 0;
        const navigations: string[] = [];
        const successFetch = (async () => {
            callCount += 1;
            return jsonResponse({
                candidates: [
                    { taskId: taskA.id, rank: 1, reason: '업무 설명과 핵심 Activity가 일치합니다.' },
                    { taskId: taskB.id, rank: 2, reason: '관련 보조 업무를 포함합니다.' },
                ],
            });
        }) as unknown as typeof fetch;

        setupSubmittedContext('채용 공고를 등록하고 지원자를 서류·면접으로 선발하는 업무를 수행합니다.');
        const renderer = renderComponent(
            React.createElement(SopTaskRecommendationFlowView, { navigate: (href) => navigations.push(href), fetchImpl: successFetch })
        );

        const pendingText = extractText(renderer.toJSON());
        check(useSopPrototypeStore.getState().taskRecommendation.status === 'pending', 'mount 직후 상태는 pending이다.');
        check(!pendingText.includes('%'), 'pending 화면에 숫자형 진행률(%)이 없다(NFR-LOAD-001).');
        check(!/confidence|신뢰도/i.test(pendingText), 'pending 화면에 confidence/신뢰도 표현이 없다.');
        check(pendingText.includes('AI가 Task를 추천하고 있습니다'), 'pending 화면에 처리 중 상태 문구가 보인다.');

        await flushEffects();
        check(callCount === 1, 'TST-STATE-003: context 제출 한 번에 추천 API 호출은 정확히 한 번이다.');
        check(useSopPrototypeStore.getState().taskRecommendation.status === 'ready', '성공 응답 후 상태는 ready다.');
        check(useSopPrototypeStore.getState().workMapDraft === null, 'TST-REC-003: 추천 성공만으로 Work Map이 만들어지지 않는다.');

        const readyText = extractText(renderer.toJSON());
        check(readyText.includes(taskA.name) && readyText.includes(taskB.name), '두 추천 후보의 Task명이 모두 표시된다.');
        check(readyText.includes('가장 관련성 높은 추천'), '1순위 후보가 "가장 관련성 높은 추천"으로 강조된다.');

        // A11Y-5: "Task 직접 찾기" 토글 버튼은 상태를 aria-expanded로 알린다(DESIGN_CONVENTIONS.md §6).
        const manualSearchToggle = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('Task 직접 찾기'))!;
        check(manualSearchToggle.props['aria-expanded'] === false, 'A11Y-5: 닫힌 상태에서 "Task 직접 찾기" 버튼은 aria-expanded=false다.');
        act(() => {
            manualSearchToggle.props.onClick();
        });
        const manualSearchToggleOpen = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('Task 직접 찾기'))!;
        check(manualSearchToggleOpen.props['aria-expanded'] === true, 'A11Y-5: 연 뒤에는 같은 버튼이 aria-expanded=true로 바뀐다.');
        act(() => {
            manualSearchToggleOpen.props.onClick();
        });

        // TST-REC-004: 명시적 확인 후에만 Work Map이 생성되고 다음 화면으로 이동한다.
        const confirmButtons = renderer.root.findAllByType('button').filter((b) => extractText(b.props.children).includes('이 Task로 계속'));
        check(confirmButtons.length === 2, '후보마다 별도의 "이 Task로 계속" 버튼이 있다(hover만으로 선택되지 않음).');
        act(() => {
            confirmButtons[0].props.onClick();
        });
        check(useSopPrototypeStore.getState().workMapDraft?.sourceTaskId === taskA.id, '명시적 확인 후 1순위 Task로 Work Map 초안이 생성된다.');
        check(navigations.at(-1) === '/sop/work-map/simple', '확정 후 /sop/work-map/simple로 이동한다.');
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 2. 잘못된 응답(중복 ID)은 부분 적용되지 않고 오류로 표면화된다
    // ---------------------------------------------------------
    {
        const duplicateFetch = (async () =>
            jsonResponse({
                candidates: [
                    { taskId: taskA.id, rank: 1, reason: 'r1' },
                    { taskId: taskA.id, rank: 2, reason: 'r2' },
                ],
            })) as unknown as typeof fetch;

        setupSubmittedContext('중복 ID 응답을 검증하기 위한 업무 설명입니다.');
        const renderer = renderComponent(React.createElement(SopTaskRecommendationFlowView, { navigate: () => {}, fetchImpl: duplicateFetch }));
        await flushEffects();

        check(useSopPrototypeStore.getState().taskRecommendation.status === 'error', 'TST-REC-002: 중복 ID 응답은 적용되지 않고 error 상태가 된다.');
        check(useSopPrototypeStore.getState().taskRecommendation.candidates.length === 0, '중복 ID 응답의 candidates는 저장되지 않는다.');
        check(extractText(renderer.toJSON()).includes('받아오지 못했습니다'), '오류 화면 문구가 표시된다.');
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 3. rank가 1부터 연속되지 않으면 적용되지 않는다
    // ---------------------------------------------------------
    {
        const rankGapFetch = (async () =>
            jsonResponse({
                candidates: [
                    { taskId: taskA.id, rank: 1, reason: 'r1' },
                    { taskId: taskB.id, rank: 3, reason: 'r2' },
                ],
            })) as unknown as typeof fetch;

        setupSubmittedContext('연속되지 않는 rank 응답을 검증하기 위한 업무 설명입니다.');
        const renderer = renderComponent(React.createElement(SopTaskRecommendationFlowView, { navigate: () => {}, fetchImpl: rankGapFetch }));
        await flushEffects();

        check(useSopPrototypeStore.getState().taskRecommendation.status === 'error', 'TST-REC-002: 비연속 rank 응답은 적용되지 않고 error 상태가 된다.');
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 4. 4개 초과 응답은 적용되지 않는다 (zod .max(3) 스키마에서 거부)
    // ---------------------------------------------------------
    {
        const [taskC, taskD] = job.tasks.slice(2, 4);
        const tooManyFetch = (async () =>
            jsonResponse({
                candidates: [
                    { taskId: taskA.id, rank: 1, reason: 'r1' },
                    { taskId: taskB.id, rank: 2, reason: 'r2' },
                    { taskId: taskC.id, rank: 3, reason: 'r3' },
                    { taskId: taskD.id, rank: 4, reason: 'r4' },
                ],
            })) as unknown as typeof fetch;

        setupSubmittedContext('4개 초과 추천 응답을 검증하기 위한 업무 설명입니다.');
        const renderer = renderComponent(React.createElement(SopTaskRecommendationFlowView, { navigate: () => {}, fetchImpl: tooManyFetch }));
        await flushEffects();

        check(useSopPrototypeStore.getState().taskRecommendation.status === 'error', 'TST-REC-002: 4개 초과 응답은 적용되지 않고 error 상태가 된다.');
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 5. 실패 후에도 context가 보존되고, 수동 검색으로 같은 확정 경로를 쓸 수 있다
    // ---------------------------------------------------------
    {
        const navigations: string[] = [];
        const rejectingFetch = (async () => {
            throw new Error('네트워크 오류로 추천을 받아오지 못했습니다.');
        }) as unknown as typeof fetch;

        const contextText = '실패 뒤 수동 선택을 검증하기 위한 업무 설명입니다.';
        setupSubmittedContext(contextText);
        const renderer = renderComponent(
            React.createElement(SopTaskRecommendationFlowView, { navigate: (href) => navigations.push(href), fetchImpl: rejectingFetch })
        );
        await flushEffects();

        check(useSopPrototypeStore.getState().taskRecommendation.status === 'error', 'API 실패 시 상태는 error다.');
        check(
            useSopPrototypeStore.getState().memberContext.confirmedText === contextText,
            'TST-REC-005: 실패 후에도 확정 업무맥락 원문이 보존된다.'
        );

        const manualSearchButton = findButtonByText(renderer, 'Task 직접 찾기');
        check(!!manualSearchButton, '실패 화면에 "Task 직접 찾기" 진입점이 있다.');
        act(() => {
            manualSearchButton!.props.onClick();
        });

        const manualTarget = job.tasks[2];
        const searchInput = renderer.root.findByProps({ id: 'sop-manual-task-search' });
        act(() => {
            // 전체 이름으로 검색해 다른 Task와 겹치지 않는 유일한 결과를 만든다
            // (이 fixture의 Task명은 모두 '채용'으로 시작해 짧은 접두어는 여러 건과 겹친다).
            searchInput.props.onChange({ target: { value: manualTarget.name } });
        });

        const manualConfirmButtons = renderer.root.findAllByType('button').filter((b) => extractText(b.props.children).includes('이 Task로 계속'));
        check(manualConfirmButtons.length >= 1, '수동 검색 결과에도 명시적 확정 버튼이 있다.');
        act(() => {
            manualConfirmButtons[0].props.onClick();
        });
        check(useSopPrototypeStore.getState().workMapDraft?.sourceTaskId === manualTarget.id, 'TST-REC-005: 수동 선택도 같은 명시적 확정 경로로 Work Map을 만든다.');
        check(navigations.at(-1) === '/sop/work-map/simple', '수동 확정 후에도 /sop/work-map/simple로 이동한다.');
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 6. 취소 후 늦게 도착하는 응답이 현재 상태를 덮지 않는다
    // ---------------------------------------------------------
    {
        const navigations: string[] = [];
        let capturedSignal: AbortSignal | undefined;
        const neverResolvingFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                capturedSignal = init?.signal ?? undefined;
                capturedSignal?.addEventListener('abort', () => reject(new DOMException('The user aborted a request.', 'AbortError')));
            })) as unknown as typeof fetch;

        setupSubmittedContext('취소 시나리오를 검증하기 위한 업무 설명입니다.');
        const renderer = renderComponent(
            React.createElement(SopTaskRecommendationFlowView, { navigate: (href) => navigations.push(href), fetchImpl: neverResolvingFetch })
        );
        await flushEffects();
        check(!!capturedSignal, '요청에 abort signal이 전달된다.');
        check(useSopPrototypeStore.getState().taskRecommendation.status === 'pending', '응답 도착 전에는 여전히 pending이다.');

        const cancelButton = findButtonByText(renderer, '취소하고 업무맥락으로 돌아가기');
        check(!!cancelButton, '취소 버튼이 렌더링된다.');
        act(() => {
            cancelButton!.props.onClick();
        });
        await flushEffects();

        check(navigations.at(-1) === '/sop/context', '취소하면 /sop/context로 이동한다.');
        check(useSopPrototypeStore.getState().taskRecommendation.status === 'idle', '취소 후 추천 상태는 idle로 되돌아간다.');
        check(
            useSopPrototypeStore.getState().taskRecommendation.candidates.length === 0,
            '취소 후 늦게 도착한(중단된) 응답이 candidates를 채우지 않는다.'
        );
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 7. 새 context로 갱신된 뒤 도착하는 stale 응답이 새 상태를 덮지 않는다
    //
    // 새 contextKey로 store가 바뀌면 컴포넌트의 useEffect도 그 contextKey로
    // 다시 실행되어 정당한 두 번째 요청을 보낸다(실제 앱에서도 맞는 동작). 그래서
    // resolver를 하나만 두면 안 되고, 호출 순서대로 resolver를 모아 **첫 번째
    // (stale) 요청만** 나중에 응답시켜야 진짜 stale-drop 경로를 검증할 수 있다.
    // ---------------------------------------------------------
    {
        const resolvers: Array<(value: Response) => void> = [];
        const deferredFetch = (async () =>
            new Promise<Response>((resolve) => {
                resolvers.push(resolve);
            })) as unknown as typeof fetch;

        setupSubmittedContext('첫 번째 업무맥락입니다.');
        const staleContextKey = useSopPrototypeStore.getState().taskRecommendation.contextKey!;
        const renderer = renderComponent(React.createElement(SopTaskRecommendationFlowView, { navigate: () => {}, fetchImpl: deferredFetch }));
        await flushEffects();
        check(useSopPrototypeStore.getState().taskRecommendation.status === 'pending', '아직 응답 전이므로 pending 상태다.');
        check(resolvers.length === 1, '첫 번째(곧 stale이 될) 요청이 시작된다.');

        // 사용자가 업무맥락을 다시 확정해 새 contextKey로 넘어간 상황을 흉내낸다
        // (context 페이지는 Session A 소유이므로 여기서는 도메인 상태만 직접 재현한다).
        // 이 자체가 컴포넌트의 useEffect를 새 contextKey로 다시 실행시켜 두 번째
        // (정당한) 요청을 만든다.
        act(() => {
            useSopPrototypeStore.setState({
                taskRecommendation: { status: 'pending', candidates: [], contextKey: 'ctx-newer-simulated' },
            });
        });
        await flushEffects();
        check(resolvers.length === 2, '새 contextKey에 대한 두 번째 요청이 별도로 시작된다.');

        // 이제 **먼저 보낸(stale) 요청**만 뒤늦게 응답시킨다. 두 번째(현재) 요청은 아직 pending이다.
        act(() => {
            resolvers[0](jsonResponse({ candidates: [{ taskId: taskA.id, rank: 1, reason: 'stale reason' }] }));
        });
        await flushEffects();

        const finalState = useSopPrototypeStore.getState().taskRecommendation;
        check(finalState.contextKey === 'ctx-newer-simulated', '새 contextKey 상태가 유지된다.');
        check(finalState.status === 'pending', '새 contextKey의 요청은 아직 응답 전이므로 pending 그대로다.');
        check(finalState.candidates.length === 0, 'stale 응답(이전 contextKey)이 새 contextKey의 상태를 덮지 않는다.');
        check(finalState.contextKey !== staleContextKey, 'sanity: 두 contextKey는 실제로 다르다.');
        unmount(renderer);
    }

    // ---------------------------------------------------------
    // 8. A11Y-4: 로딩 스피너는 prefers-reduced-motion을 따른다(NFR-LOAD-003).
    //
    // 이 저장소의 테스트 환경에는 실제 window가 없다(react-test-renderer, jsdom
    // 없음) - usePrefersReducedMotion은 그 경우 항상 reducedMotion=false로
    // fallback한다. 이 시나리오만 최소 matchMedia stub으로 실제 window를
    // 흉내내 reduced-motion 분기를 실행 가능하게 증명하고, 끝나면 즉시 지운다.
    // SopRecommendationLoading을 직접 렌더링한다 - 부모(SopTaskRecommendationFlowView)의
    // useSopAiSettings는 이 stub이 흉내내지 않는 별개의 window API(localStorage,
    // addEventListener)를 읽으므로, 이 컴포넌트만 독립적으로 검증하는 편이 그
    // 무관한 hook까지 stub해야 하는 결합을 피할 수 있다.
    // ---------------------------------------------------------
    {
        const originalWindow = (globalThis as { window?: unknown }).window;
        const mediaQueryList = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
        (globalThis as { window?: unknown }).window = { matchMedia: () => mediaQueryList };
        try {
            const renderer = renderComponent(React.createElement(SopRecommendationLoading, { onCancel: () => {} }));
            const spinner = renderer.root.findAllByType('svg').find((svg) => (svg.props.className as string)?.includes('lucide-loader'));
            check(!!spinner, '로딩 화면에 스피너(Loader2)가 렌더링된다.');
            check(!!spinner && !(spinner.props.className as string).includes('animate-spin'), 'A11Y-4: prefers-reduced-motion에서는 스피너의 animate-spin 클래스가 빠진다.');
            unmount(renderer);
        } finally {
            if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
            else (globalThis as { window?: unknown }).window = originalWindow;
        }
    }

    console.log(`\n${passed} checks passed.`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
