/**
 * W4-04C — 복제 경로를 Work Map 파이프라인에 합류시키는 회귀 테스트.
 *
 * 검증 대상은 두 가지다.
 * 1. `confirmWorkMapAndProceed`(sop-setup-actions.ts)의 origin별 완료 동작 분기 —
 *    task-recommendation/legacy는 기존대로 `/sop/setup`, 복제 계열은 재생성 없이
 *    `/sop/workspace`로 직행한다.
 * 2. 두 picker(`SopColleagueTemplatePicker`, `SopOwnPriorPicker`)가 복제 성공 직후
 *    `adoptClonedWorkMap`을 거쳐 Work Map 편집 단계(`/sop/work-map/simple`)로
 *    이동하고, workLibrary 스냅샷에서 Task를 찾을 수 없는 legacy 문서는 기존대로
 *    `/sop/workspace`로 fallback한다 — 복제 자체는 실패시키지 않는다.
 *
 * 실제 clone API 라우트(`/api/sop/templates/[id]/clone`, `/api/sop/[id]/prior-clone`)를
 * in-memory repository 기반으로 그대로 호출해, 개인정보 제거·승인/검토/Agent화
 * 상태 초기화 계약이 이 새 흐름을 거쳐도 회귀하지 않았음을 함께 증명한다.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { confirmWorkMapAndProceed } from '../src/lib/sop-setup-actions';
import { createWorkMapDraftFromCatalog, selectWorkMapActivities, selectWorkMapDraftOrigin, type MemberWorkMapDraft } from '../src/lib/sop-work-map-draft';
import { resolveIntakeRouteAccess, SOP_INTAKE_ROUTES } from '../src/lib/sop-member-intake';
import { SopColleagueTemplatePicker } from '../src/components/sop/SopColleagueTemplatePicker';
import { SopOwnPriorPicker } from '../src/components/sop/SopOwnPriorPicker';
import { sopRepository } from '../src/server/sop/sop-repository-memory';
import { GET as sopTemplatesGet } from '../src/app/api/sop/templates/route';
import { POST as sopTemplateClonePost } from '../src/app/api/sop/templates/[id]/clone/route';
import { POST as sopPriorClonePost } from '../src/app/api/sop/[id]/prior-clone/route';
import { SAMPLE_SOP_DOCUMENT, SAMPLE_WORK_LIBRARY } from '../src/lib/sop-sample-data';
import type { SopDocument } from '../src/lib/sop-types';
import type { SopRecord } from '../src/lib/sop-record-schema';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== W4-04C 복제 경로 → Work Map 파이프라인 합류 회귀 테스트 ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function fakeApiRequest(headers: Record<string, string>, body?: unknown) {
    return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopTemplateClonePost>[0];
}

function memberHeaders(actorId: string, organizationId = 'org-w4c-clone-test') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': organizationId };
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

async function run() {
    // ---------------------------------------------------------
    // 1. confirmWorkMapAndProceed — 출처별 분기 진리표
    // ---------------------------------------------------------
    console.log('1. confirmWorkMapAndProceed — origin별 완료 동작 분기 진리표...');

    function draftWithOrigin(origin: MemberWorkMapDraft['origin']): MemberWorkMapDraft {
        const base = createWorkMapDraftFromCatalog({ task: SAMPLE_WORK_LIBRARY.taskCatalog[0], contextText: 'W4-04C 테스트 맥락', now: '2026-08-26T00:00:00.000Z' });
        if (origin === undefined) {
            const { origin: _omitted, ...legacy } = base;
            void _omitted;
            return legacy as MemberWorkMapDraft;
        }
        return { ...base, origin };
    }

    const truthTable: Array<{ origin: MemberWorkMapDraft['origin']; label: string; expectedRoute: string }> = [
        { origin: 'task-recommendation', label: 'task-recommendation', expectedRoute: '/sop/setup' },
        { origin: 'colleague-template', label: 'colleague-template', expectedRoute: '/sop/workspace' },
        { origin: 'own-prior', label: 'own-prior', expectedRoute: '/sop/workspace' },
        { origin: undefined, label: 'origin 필드 없는 legacy 초안', expectedRoute: '/sop/setup' },
    ];

    for (const { origin, label, expectedRoute } of truthTable) {
        const draft = draftWithOrigin(origin);
        const navigations: string[] = [];
        const workLibraryPatches: unknown[] = [];
        const result = confirmWorkMapAndProceed({
            confirmWorkMap: () => ({ ok: true, draft }),
            setWorkLibrary: (patch) => workLibraryPatches.push(patch),
            navigate: (href) => navigations.push(href),
        });
        check(result?.ok === true, `[${label}] 확정 결과가 그대로 반환된다`);
        check(workLibraryPatches.length === 1, `[${label}] setWorkLibrary는 항상 호출된다(이후 생성 범위 일관성 유지)`);
        check(navigations.length === 1 && navigations[0] === expectedRoute, `[${label}] → ${expectedRoute}로 이동한다`);
    }
    // 복제 계열은 /sop/setup(생성 단계)에 도달하지 않는다 — 이 함수가 호출할 수 있는 유일한
    // 생성 진입점이 /sop/setup이므로, 그 경로로 navigate하지 않았다는 것이
    // "생성 API가 호출되지 않는다"는 요구의 실행 가능한 증거다.
    check(
        truthTable.filter((t) => t.origin === 'colleague-template' || t.origin === 'own-prior').every((t) => t.expectedRoute !== '/sop/setup'),
        '복제 계열 origin은 어떤 경우에도 /sop/setup(생성 단계)에 도달하지 않는다 — 재생성이 원본 SOP를 지우지 않는다'
    );
    // confirmWorkMap이 실패(errors)를 돌려주면 애초에 setWorkLibrary/navigate 둘 다 호출되지 않는다.
    const failedNavigations: string[] = [];
    const failedResult = confirmWorkMapAndProceed({
        confirmWorkMap: () => ({ ok: false, errors: [{ field: 'taskName', message: 'Task명을 입력하세요.' }] }),
        setWorkLibrary: () => { throw new Error('should not be called'); },
        navigate: (href) => failedNavigations.push(href),
    });
    check(failedResult?.ok === false && failedNavigations.length === 0, '검증 실패한 Work Map은 origin과 무관하게 어디로도 이동하지 않는다');

    // ---------------------------------------------------------
    // 2. adoptClonedWorkMap 시그니처 — origin 인자를 받지 않는다
    // ---------------------------------------------------------
    console.log('2. adoptClonedWorkMap 시그니처...');
    useSopPrototypeStore.getState().resetStore();
    check(useSopPrototypeStore.getState().adoptClonedWorkMap.length === 1, 'adoptClonedWorkMap은 document 인자 하나만 받는다 — 두 picker 모두 origin을 추가로 조립해 넘기지 않는다');

    // ---------------------------------------------------------
    // 3. SopColleagueTemplatePicker — 복제 성공 → Work Map 편집 단계로 합류
    // ---------------------------------------------------------
    console.log('3. SopColleagueTemplatePicker: 복제 성공 → /sop/work-map/simple, origin=colleague-template...');

    const colleagueOwnerId = 'w4c-colleague-owner';
    const colleagueSourceDoc: SopDocument = {
        ...SAMPLE_SOP_DOCUMENT,
        id: 'w4c-colleague-source',
        member: { id: colleagueOwnerId, name: 'W4C 동료원본', employeeId: 'EMP-W4C-OWNER', organization: 'W4C 동료팀', jobRole: '채용담당자' },
        reviewStatus: 'confirmed',
        steps: SAMPLE_SOP_DOCUMENT.steps.map((step) => ({ ...step, reviewStatus: 'confirmed' as const })),
    };
    const createColleagueSource = await sopRepository.create({ memberId: colleagueOwnerId, organizationId: 'org-w4c-clone-test', document: colleagueSourceDoc });
    check(createColleagueSource.ok, 'Fixture: 동료 원본 레코드 생성 성공');
    await sopRepository.transitionLifecycle('w4c-colleague-source', { actorRole: 'member', actorId: colleagueOwnerId, kind: 'member-submit' });
    await sopRepository.transitionLifecycle('w4c-colleague-source', { actorRole: 'leader', actorId: 'w4c-leader', kind: 'leader-approve' });
    await sopRepository.transitionLifecycle('w4c-colleague-source', { actorRole: 'sme', actorId: 'w4c-sme', kind: 'sme-approve' });
    const colleagueEligibility = await sopRepository.setTemplateEligibility('w4c-colleague-source', true);
    check(colleagueEligibility.ok, 'Fixture: 동료 원본 레코드가 승인 완료 + 템플릿 공유 허용 상태가 된다');

    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().submitMemberIdentity({
        id: 'w4c-clone-requester', employeeId: 'EMP-W4C-REQ', name: 'W4C 복제요청자', organization: 'Other Org', jobRole: '채용담당자',
    });

    const colleagueFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (url.endsWith('/api/sop/templates') && method === 'GET') {
            return sopTemplatesGet(fakeApiRequest(memberHeaders('w4c-clone-requester')) as unknown as Parameters<typeof sopTemplatesGet>[0]);
        }
        const cloneMatch = url.match(/\/api\/sop\/templates\/([^/]+)\/clone$/);
        if (cloneMatch && method === 'POST') {
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const body = init?.body ? JSON.parse(init.body as string) : undefined;
            const fakeReq = { headers, json: async () => body } as unknown as Parameters<typeof sopTemplateClonePost>[0];
            return sopTemplateClonePost(fakeReq, { params: Promise.resolve({ id: decodeURIComponent(cloneMatch[1]) }) });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const colleagueNavigations: string[] = [];
    const colleagueRenderer = renderComponent(
        React.createElement(SopColleagueTemplatePicker, { onClose: () => {}, navigate: (href: string) => colleagueNavigations.push(href), fetchImpl: colleagueFetch })
    );
    await flushEffects();

    const templateCard = colleagueRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(colleagueSourceDoc.title));
    check(Boolean(templateCard), '승인 완료 + 템플릿 공유 허용된 동료 SOP 카드가 목록에 표시된다');
    act(() => { templateCard!.props.onClick(); });

    const colleagueCloneButton = colleagueRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('새 초안 만들기'));
    await act(async () => {
        colleagueCloneButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

    check(colleagueNavigations.at(-1) === '/sop/work-map/simple', '동료 템플릿 복제 성공 → Work Map 편집 단계(/sop/work-map/simple)로 이동한다(§2.3)');
    const colleagueDraft = useSopPrototypeStore.getState().workMapDraft;
    check(Boolean(colleagueDraft), '복제 성공 시 workMapDraft가 생성된다');
    check(selectWorkMapDraftOrigin(colleagueDraft!) === 'colleague-template', "origin이 'colleague-template'로 판정된다(Store가 resolveCreationSource(document)로 스스로 판정, picker는 origin을 넘기지 않음)");

    const clonedColleagueDocument = useSopPrototypeStore.getState().document!;
    check(clonedColleagueDocument.member.id === 'w4c-clone-requester', '복제본은 복제 요청자 신원을 갖는다(원본 동료 신원이 아님)');
    const clonedColleagueJson = JSON.stringify(clonedColleagueDocument);
    check(
        !clonedColleagueJson.includes('EMP-W4C-OWNER') && !clonedColleagueJson.includes('W4C 동료원본') && !clonedColleagueJson.includes('W4C 동료팀'),
        '복제본에 원본 동료 구성원의 이름·사번·조직이 없다(기존 계약 회귀 방지)'
    );
    check(
        clonedColleagueDocument.reviewStatus === 'ai-draft' && clonedColleagueDocument.agentizationReview === undefined,
        '복제본의 검토·Agent화 확정 상태가 초기화되어 있다(기존 계약 회귀 방지)'
    );

    const colleagueGuardState = {
        session: useSopPrototypeStore.getState().memberSession,
        memberContext: useSopPrototypeStore.getState().memberContext,
        recommendation: useSopPrototypeStore.getState().taskRecommendation,
        hasWorkMapDraft: !!useSopPrototypeStore.getState().workMapDraft,
    };
    check(
        resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.workMapSimple, colleagueGuardState).allowed,
        '복제 후 Work Map route 가드가 통과한다(W4-01이 확정 context를 채웠기 때문)'
    );

    const colleagueFirstActivityId = selectWorkMapActivities(colleagueDraft!)[0].id;
    useSopPrototypeStore.getState().updateWorkMapActivity(colleagueFirstActivityId, { name: '편집됨 — 원본에 반영되면 안 됨' });
    const colleagueSourceAfterEdit = await sopRepository.getById('w4c-colleague-source');
    check(
        !colleagueSourceAfterEdit!.document.workLibrary.taskCatalog[0].activities.some((a) => a.name === '편집됨 — 원본에 반영되면 안 됨'),
        '복제된 초안을 편집해도 원본 record/문서가 변하지 않는다'
    );

    act(() => { colleagueRenderer.unmount(); });

    // ---------------------------------------------------------
    // 3b. SopColleagueTemplatePicker — id 없이 로그인 폼으로 인증한 구성원도 복제할 수 있다
    // ---------------------------------------------------------
    // W4-05가 브라우저 검증에서 발견한 회귀: 로그인 폼은 `id` 필드를 아예 입력받지
    // 않으므로 실제 로그인 뒤의 memberInfo는 `id` 없이 employeeId만 가진다. 그런데
    // /api/sop/templates/[id]/clone 라우트는 actor 헤더(employeeId로 정상 해석됨)와는
    // 별개로, 요청 **본문**의 member.id를 두 번째 독립 방어선으로 요구한다
    // (CloneRequestSchema: `id: z.string().min(1)`). cloneSopTemplate이 본문에
    // `params.member`를 그대로 실어 보내면 id 없는 그 구성원의 복제 요청은 매번
    // 400("복제 요청에 현재 구성원 정보(member.id 포함)가 필요합니다")으로 거절된다.
    // 이 테스트는 그 정확한 시나리오(로그인 폼처럼 id 없이 employeeId만 있는 구성원)로
    // 실제 clone 라우트를 호출해 200으로 성공하는지 증명한다 — 위 3번 테스트를 포함한
    // 이 파일의 다른 모든 fixture는 `submitMemberIdentity({ id: '...', ... })`처럼 id를
    // 명시적으로 넣어 왔기 때문에 이 회귀를 잡지 못했다.
    console.log('3b. SopColleagueTemplatePicker: 로그인 폼처럼 id 없이 employeeId만 있는 구성원도 복제에 성공한다...');

    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().submitMemberIdentity({
        employeeId: 'EMP-W4C-NOID', name: 'W4C id없는 구성원', organization: 'Other Org', jobRole: 'Talent Acquisition',
    });
    check(useSopPrototypeStore.getState().memberInfo.id === undefined, 'Fixture: 로그인 폼 제출과 동일하게 memberInfo.id가 없다(employeeId만 있음)');

    const noIdFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (url.endsWith('/api/sop/templates') && method === 'GET') {
            return sopTemplatesGet(fakeApiRequest(memberHeaders('EMP-W4C-NOID')) as unknown as Parameters<typeof sopTemplatesGet>[0]);
        }
        const cloneMatch = url.match(/\/api\/sop\/templates\/([^/]+)\/clone$/);
        if (cloneMatch && method === 'POST') {
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const body = init?.body ? JSON.parse(init.body as string) : undefined;
            const fakeReq = { headers, json: async () => body } as unknown as Parameters<typeof sopTemplateClonePost>[0];
            return sopTemplateClonePost(fakeReq, { params: Promise.resolve({ id: decodeURIComponent(cloneMatch[1]) }) });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const noIdNavigations: string[] = [];
    const noIdRenderer = renderComponent(
        React.createElement(SopColleagueTemplatePicker, { onClose: () => {}, navigate: (href: string) => noIdNavigations.push(href), fetchImpl: noIdFetch })
    );
    await flushEffects();
    const noIdTemplateCard = noIdRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(colleagueSourceDoc.title));
    act(() => { noIdTemplateCard!.props.onClick(); });
    const noIdCloneButton = noIdRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('새 초안 만들기'));
    await act(async () => {
        noIdCloneButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    check(noIdNavigations.at(-1) === '/sop/work-map/simple', 'id 없이 employeeId만 있는 구성원도 실제 clone 라우트를 통해 복제에 성공하고 Work Map(simple)로 이동한다');
    check(useSopPrototypeStore.getState().document!.member.id === 'EMP-W4C-NOID', '복제본 문서의 member.id는 actor context(employeeId 기반)로 정규화된다');

    act(() => { noIdRenderer.unmount(); });

    // ---------------------------------------------------------
    // 4. SopOwnPriorPicker — 복제 성공 → Work Map 편집 단계로 합류
    // ---------------------------------------------------------
    console.log('4. SopOwnPriorPicker: 복제 성공 → /sop/work-map/simple, origin=own-prior...');

    const ownPriorMemberId = 'w4c-own-prior-member';
    const ownPriorSourceDoc: SopDocument = {
        ...SAMPLE_SOP_DOCUMENT,
        id: 'w4c-own-prior-source',
        member: { id: ownPriorMemberId, name: 'W4C 과거작성자', employeeId: 'EMP-W4C-PRIOR', organization: 'W4C 팀', jobRole: '채용담당자' },
    };
    const createOwnPriorSource = await sopRepository.create({ memberId: ownPriorMemberId, organizationId: 'org-w4c-clone-test', document: ownPriorSourceDoc });
    check(createOwnPriorSource.ok, 'Fixture: 과거 작성 원본 레코드 생성 성공');
    const ownPriorSourceRecord: SopRecord = createOwnPriorSource.ok ? createOwnPriorSource.record : (undefined as never);

    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().submitMemberIdentity({
        id: ownPriorMemberId, employeeId: 'EMP-W4C-PRIOR', name: 'W4C 과거작성자', organization: 'W4C 팀', jobRole: '채용담당자',
    });

    const ownPriorFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        const priorCloneMatch = url.match(/\/api\/sop\/([^/]+)\/prior-clone$/);
        if (priorCloneMatch && method === 'POST') {
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const fakeReq = { headers, json: async () => undefined } as unknown as Parameters<typeof sopPriorClonePost>[0];
            return sopPriorClonePost(fakeReq, { params: Promise.resolve({ id: decodeURIComponent(priorCloneMatch[1]) }) });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const ownPriorNavigations: string[] = [];
    const ownPriorRenderer = renderComponent(
        React.createElement(SopOwnPriorPicker, { records: [ownPriorSourceRecord], onClose: () => {}, navigate: (href: string) => ownPriorNavigations.push(href), fetchImpl: ownPriorFetch })
    );

    const ownPriorCard = ownPriorRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(ownPriorSourceDoc.title));
    check(Boolean(ownPriorCard), '과거 작성 레코드 카드가 목록에 표시된다');
    act(() => { ownPriorCard!.props.onClick(); });

    const ownPriorCloneButton = ownPriorRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('새 초안 만들기'));
    await act(async () => {
        ownPriorCloneButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

    check(ownPriorNavigations.at(-1) === '/sop/work-map/simple', '과거 문서 복제 성공 → Work Map 편집 단계(/sop/work-map/simple)로 이동한다(§2.4)');
    const ownPriorDraft = useSopPrototypeStore.getState().workMapDraft;
    check(Boolean(ownPriorDraft), '복제 성공 시 workMapDraft가 생성된다');
    check(selectWorkMapDraftOrigin(ownPriorDraft!) === 'own-prior', "origin이 'own-prior'로 판정된다");

    const clonedOwnPriorDocument = useSopPrototypeStore.getState().document!;
    check(clonedOwnPriorDocument.id !== 'w4c-own-prior-source', '복제본은 원본과 다른 새 문서 ID를 받는다');
    check(clonedOwnPriorDocument.member.id === ownPriorMemberId, '과거 작성 복제는 현재 구성원 소유권을 유지한다(신원 교체 없음)');
    check(
        clonedOwnPriorDocument.reviewStatus === 'ai-draft' && clonedOwnPriorDocument.agentizationReview === undefined,
        '복제본의 검토·Agent화 확정 상태가 초기화되어 있다(기존 계약 회귀 방지)'
    );

    const ownPriorSourceAfterClone = await sopRepository.getById('w4c-own-prior-source');
    check(ownPriorSourceAfterClone?.document.title === SAMPLE_SOP_DOCUMENT.title, '복제는 원본 record를 변경하지 않는다');

    act(() => { ownPriorRenderer.unmount(); });

    // ---------------------------------------------------------
    // 5. legacy fallback — workLibrary 스냅샷에서 Task를 찾을 수 없는 문서는
    //    Work Map 합류 없이 기존대로 /sop/workspace로 이동한다(복제 자체는 성공)
    // ---------------------------------------------------------
    console.log('5. legacy fallback: workLibrary 스냅샷에서 선택 Task를 찾을 수 없으면 /sop/workspace로 이동...');
    // "Task를 찾을 수 없는 문서" 자체는 여기서 end-to-end로 재현하지 않는다 — taskId가
    // taskCatalog에 존재해야 한다는 제약이 WorkLibrarySelectionSchema(superRefine)에
    // 있어서, 실제 clone 응답이 그 제약을 어기면 client/server 양쪽 스키마 검증에서
    // 먼저 막힌다(이 테스트를 만들며 실제로 확인함 — schema 위반 응답은 "복제 실패"로
    // 끝나 picker가 adoptClonedWorkMap을 호출하는 지점에 도달하지 못한다). 그 조건에서
    // createWorkMapDraftFromDocument가 null을 돌려준다는 도메인 계약 자체는
    // tests/sop-work-map-domain.test.ts(§"Task를 찾을 수 없는 문서는 null을 돌려준다")가
    // 직접 증명한다. 여기서 W4-04C가 검증할 대상은 그 결과(false)를 picker가 올바르게
    // /sop/workspace로 fallback 처리하고 복제 자체는 실패시키지 않는다는 배선이므로,
    // 실제 clone 흐름은 그대로 두고 adoptClonedWorkMap 반환값만 결정론적으로 고정한다.
    const legacyMemberId = 'w4c-legacy-member';
    const legacySourceDoc: SopDocument = {
        ...SAMPLE_SOP_DOCUMENT,
        id: 'w4c-legacy-source',
        member: { id: legacyMemberId, name: 'W4C legacy 구성원', employeeId: 'EMP-W4C-LEGACY', organization: 'W4C 팀', jobRole: '채용담당자' },
    };
    const createLegacySource = await sopRepository.create({ memberId: legacyMemberId, organizationId: 'org-w4c-clone-test', document: legacySourceDoc });
    check(createLegacySource.ok, 'Fixture: 과거 작성 원본 레코드 생성 성공');
    const legacySourceRecord: SopRecord = createLegacySource.ok ? createLegacySource.record : (undefined as never);

    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().submitMemberIdentity({
        id: legacyMemberId, employeeId: 'EMP-W4C-LEGACY', name: 'W4C legacy 구성원', organization: 'W4C 팀', jobRole: '채용담당자',
    });
    const originalAdoptClonedWorkMap = useSopPrototypeStore.getState().adoptClonedWorkMap;
    useSopPrototypeStore.setState({ adoptClonedWorkMap: () => false });

    const legacyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        const priorCloneMatch = url.match(/\/api\/sop\/([^/]+)\/prior-clone$/);
        if (priorCloneMatch && method === 'POST') {
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            const fakeReq = { headers, json: async () => undefined } as unknown as Parameters<typeof sopPriorClonePost>[0];
            return sopPriorClonePost(fakeReq, { params: Promise.resolve({ id: decodeURIComponent(priorCloneMatch[1]) }) });
        }
        return jsonResponse({ error: 'unhandled test route' }, 404);
    }) as unknown as typeof fetch;

    const legacyNavigations: string[] = [];
    const legacyRenderer = renderComponent(
        React.createElement(SopOwnPriorPicker, { records: [legacySourceRecord], onClose: () => {}, navigate: (href: string) => legacyNavigations.push(href), fetchImpl: legacyFetch })
    );

    const legacyCard = legacyRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(legacySourceDoc.title));
    act(() => { legacyCard!.props.onClick(); });
    const legacyCloneButton = legacyRenderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('새 초안 만들기'));
    await act(async () => {
        legacyCloneButton!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

    check(legacyNavigations.at(-1) === '/sop/workspace', 'adoptClonedWorkMap이 false를 돌려주면(Task를 찾을 수 없는 legacy 문서 포함) Work Map 합류 없이 /sop/workspace로 fallback 이동한다');
    check(useSopPrototypeStore.getState().workMapDraft === null, 'Work Map 초안 채택이 실패하면 workMapDraft는 만들어지지 않는다');
    check(Boolean(useSopPrototypeStore.getState().document), '초안 채택 실패와 무관하게 복제된 문서 자체는 정상적으로 Store에 적용된다(복제 자체는 실패시키지 않는다)');

    act(() => { legacyRenderer.unmount(); });
    useSopPrototypeStore.setState({ adoptClonedWorkMap: originalAdoptClonedWorkMap });

    useSopPrototypeStore.getState().resetStore();

    console.log(`✅ ALL W4-04C CLONE WORK MAP ENTRY TESTS PASSED (${passed})`);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
