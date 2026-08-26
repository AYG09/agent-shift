/**
 * Wave 1C — 간소화 Work Map(`/sop/work-map/simple`) 컴포넌트 테스트.
 *
 * 순수 도메인(clone/projection/validation)은 이미
 * tests/sop-work-map-domain.test.ts가 증명한다. 이 파일은 그 위에서
 * "화면이 Foundation controller만 호출하는가", "간소화 화면 자체의 mutation이
 * 실제 Store에 반영되는가", "뷰 전환이 상태를 바꾸지 않는가(TST-STATE-006)"를
 * 실제 컴포넌트 렌더링으로 증명한다.
 *
 * react-test-renderer(jsdom 없음)로 순수 JS 트리를 렌더링하는 이 저장소의 기존
 * 관행을 따른다(tests/sop-readonly-inspectors.test.tsx 참고). 그래서 drawer의
 * 실제 focus trap·Tab 순환·Escape·focus 복귀는 여기서 검증하지 않는다 — 이는
 * 실제 DOM이 필요한 브라우저 수준 동작이며 HANDOFF에 별도로 브라우저 검증
 * 결과로 남긴다. 여기서는 drawer의 접근성 "구조"(role/aria-modal/aria-labelledby/
 * 닫기 버튼 라벨)만 검증한다.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SOP_TASK_LIBRARY_FIXTURE } from '../src/lib/sop-task-library';
import { SOP_INTAKE_ROUTES } from '../src/lib/sop-member-intake';
import { createWorkMapDraftFromCatalog, selectWorkMapActivities, selectWorkMapRelationCount } from '../src/lib/sop-work-map-draft';
import { SopWorkMapSimpleView } from '../src/components/sop/SopWorkMapSimpleView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== Wave 1C: 간소화 Work Map 화면 검증 ===');
let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string) {
    if (condition) {
        console.log(`PASS: ${label}`);
        passCount++;
    } else {
        console.error(`FAIL: ${label}`);
        failCount++;
    }
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

function findButtonByText(renderer: TestRenderer.ReactTestRenderer, text: string) {
    return renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes(text));
}

function renderComponent(element: React.ReactElement): TestRenderer.ReactTestRenderer {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(element);
    });
    return renderer;
}

const job = SOP_TASK_LIBRARY_FIXTURE.jobs.find((candidate) => candidate.name === 'Talent Acquisition')!;
const representativeTask = job.tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화')!;
const originalFixtureSnapshot = JSON.stringify(representativeTask);

function seedWorkMapReadyState() {
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.setState({
        memberSession: {
            status: 'authenticated',
            member: { name: '김테스트', jobRole: 'Talent Acquisition', organization: 'HR실' },
            authenticatedAt: '2026-08-26T00:00:00.000Z',
        },
        memberContext: { draft: '채용 업무 맥락', confirmedText: '채용 업무 맥락', confirmedAt: '2026-08-26T00:00:00.000Z' },
        workMapDraft: createWorkMapDraftFromCatalog({
            job,
            task: representativeTask,
            contextText: '채용 업무 맥락',
            now: '2026-08-26T00:00:00.000Z',
        }),
    });
}

// ---------------------------------------------------------
// 1. Route guard: Work Map draft가 없으면(추천 단계로) redirect하고, 본문 액션을
//    렌더링하지 않는다.
// ---------------------------------------------------------
{
    useSopPrototypeStore.getState().resetStore();
    const navigateCalls: string[] = [];
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={(path) => navigateCalls.push(path)} />);
    // resetStore()는 memberSession을 anonymous로 되돌린다 — 미인증 상태이므로
    // Work Map draft 유무와 무관하게 로그인 게이트로 먼저 리다이렉트된다.
    check(navigateCalls.includes(SOP_INTAKE_ROUTES.login), 'Route guard: 미인증 상태로 접근하면 로그인 게이트로 이동한다');
    check(!findButtonByText(renderer, '검토 완료'), 'Route guard: 가드가 막은 상태에서는 주 action이 렌더링되지 않는다');
    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 1b. 인증되었지만 Work Map draft가 없으면 추천 단계로 이동한다.
// ---------------------------------------------------------
{
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.setState({
        memberSession: { status: 'authenticated', member: { name: '김테스트', jobRole: 'Talent Acquisition' }, authenticatedAt: '2026-08-26T00:00:00.000Z' },
        memberContext: { draft: '채용 업무 맥락', confirmedText: '채용 업무 맥락', confirmedAt: '2026-08-26T00:00:00.000Z' },
    });
    const navigateCalls: string[] = [];
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={(path) => navigateCalls.push(path)} />);
    check(navigateCalls.includes(SOP_INTAKE_ROUTES.recommendation), 'Route guard: 인증되었지만 Work Map draft가 없으면 추천 단계로 이동한다');
    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 2. 손실 없는 렌더링: 대표 Task의 Activity 14개, Skill 관계 70개, 원본 순서.
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    const draft = useSopPrototypeStore.getState().workMapDraft!;
    const activities = selectWorkMapActivities(draft);
    check(activities.length === 14, 'TST-WM-001: 대표 Task는 Activity 14개를 갖는다');
    check(selectWorkMapRelationCount(draft) === 70, 'TST-WM-001: Skill 관계는 70개다');

    const renderer = renderComponent(<SopWorkMapSimpleView navigate={() => {}} />);
    const renderedJson = JSON.stringify(renderer.toJSON());
    check(activities.every((activity) => renderedJson.includes(activity.name)), 'TST-WM-001: 14개 Activity 이름이 모두 화면에 렌더링된다');
    check(renderedJson.includes('14') && renderedJson.includes('70'), '헤더에 Activity 수(14)와 Skill 관계 수(70)가 표시된다');
    check(renderedJson.includes(draft.task.name), 'Task명이 헤더에 표시된다');

    const orderBadges = activities.map((_, index) => `A${String(index + 1).padStart(2, '0')}`);
    check(orderBadges.every((code) => renderedJson.includes(code)), '간소화 projection은 원본 순서(A01..A14)를 유지한다(TST-WM 순서 불변식)');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 3. drawer 편집: Activity명·Skill명·Skill 설명 수정이 즉시 Foundation draft에
//    반영되고, 확정 상태를 해제한다(INT-WM-003 / TST-WM-005).
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    useSopPrototypeStore.getState().confirmWorkMap();
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === true, '사전 조건: confirmWorkMap 직후 confirmed=true');

    const firstActivity = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!)[0];
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={() => {}} />);

    const editButton = renderer.root.findByProps({ 'aria-label': `${firstActivity.name} 편집` });
    act(() => editButton.props.onClick());

    const dialog = renderer.root.findByProps({ role: 'dialog' });
    check(dialog.props['aria-modal'] === 'true', 'drawer: role=dialog에 aria-modal="true"가 설정된다');
    check(typeof dialog.props['aria-labelledby'] === 'string' && dialog.props['aria-labelledby'].length > 0, 'drawer: aria-labelledby가 설정된다');
    const closeButton = renderer.root.findByProps({ 'aria-label': '편집 닫기' });
    check(Boolean(closeButton), 'drawer: 접근 가능한 이름을 가진 닫기 버튼이 있다');

    const nameInput = renderer.root.findAllByType('input').find((i) => i.props.value === firstActivity.name);
    check(Boolean(nameInput), 'drawer: Activity명 입력 필드가 현재 값으로 채워진다');
    act(() => nameInput!.props.onChange({ target: { value: '새 Activity 이름' } }));
    check(
        useSopPrototypeStore.getState().workMapDraft!.task.activities.find((a) => a.id === firstActivity.id)!.name === '새 Activity 이름',
        'drawer: Activity명 수정이 Foundation draft에 즉시 반영된다'
    );
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, 'INT-WM-003: mutation은 confirmed를 해제한다');

    const firstSkill = firstActivity.skills[0];
    const skillNameInput = renderer.root.findAllByType('input').find((i) => i.props.value === firstSkill.name);
    check(Boolean(skillNameInput), 'drawer: Skill명 입력 필드가 렌더링된다');
    act(() => skillNameInput!.props.onChange({ target: { value: '새 Skill 이름' } }));
    const updatedActivity = useSopPrototypeStore.getState().workMapDraft!.task.activities.find((a) => a.id === firstActivity.id)!;
    check(updatedActivity.skills.find((s) => s.id === firstSkill.id)!.name === '새 Skill 이름', 'drawer: Skill명 수정이 즉시 반영된다');

    // Skill 삭제: 목표와 영향을 보여주는 확인 UI를 거친 뒤에만 삭제된다.
    const skillDeleteButtons = renderer.root.findAllByProps({ 'aria-label': 'Skill 삭제' });
    const beforeSkillCount = updatedActivity.skills.length;
    act(() => skillDeleteButtons[0].props.onClick());
    const confirmSkillDeleteButton = findButtonByText(renderer, '삭제');
    check(Boolean(confirmSkillDeleteButton), 'drawer: Skill 삭제는 확인 UI를 먼저 보여준다(destructive delete 확인)');
    act(() => confirmSkillDeleteButton!.props.onClick());
    const afterSkillDeleteActivity = useSopPrototypeStore.getState().workMapDraft!.task.activities.find((a) => a.id === firstActivity.id)!;
    check(afterSkillDeleteActivity.skills.length === beforeSkillCount - 1, 'drawer: 확인 후 Skill이 실제로 삭제된다');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 4. Task 편집: 헤더의 "편집"이 Task 모드 drawer를 열고, 수정 결과가 헤더에도
//    즉시 반영된다(간소화·상세가 같은 draft를 공유한다는 것과 같은 종류의 증명).
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={() => {}} />);
    const taskEditButton = findButtonByText(renderer, '편집');
    act(() => taskEditButton!.props.onClick());

    const taskNameInput = renderer.root.findAllByType('input').find((i) => i.props.value === useSopPrototypeStore.getState().workMapDraft!.task.name);
    act(() => taskNameInput!.props.onChange({ target: { value: '새 Task 이름' } }));
    check(useSopPrototypeStore.getState().workMapDraft!.task.name === '새 Task 이름', 'Task drawer: Task명 수정이 즉시 반영된다');
    check(JSON.stringify(renderer.toJSON()).includes('새 Task 이름'), 'Task drawer 편집 결과가 같은 렌더 트리(헤더)에도 즉시 보인다');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 5. 순서 변경(reorder)·삭제(delete)·추가(add)가 Foundation mutation을 통해
//    이뤄지고 confirmed를 해제한다(TST-WM-005).
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    useSopPrototypeStore.getState().confirmWorkMap();
    const before = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    const [firstId, secondId] = [before[0].id, before[1].id];

    const renderer = renderComponent(<SopWorkMapSimpleView navigate={() => {}} />);
    const moveDownButton = renderer.root.findByProps({ 'aria-label': `${before[0].name} 아래로 이동` });
    act(() => moveDownButton.props.onClick());
    const afterMove = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    check(afterMove[0].id === secondId && afterMove[1].id === firstId, 'Reorder: 아래로 이동 시 첫 두 Activity 순서가 바뀐다');
    check(afterMove[0].order === 1 && afterMove[1].order === 2, 'Reorder: order 필드가 배열 위치로 재정규화된다');
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, 'TST-WM-005: reorder는 confirmation을 해제한다');

    act(() => void useSopPrototypeStore.getState().confirmWorkMap());
    const targetActivity = afterMove[2];
    const targetSkillCount = targetActivity.skills.length;
    act(() => renderer.root.findByProps({ 'aria-label': `${targetActivity.name} 삭제` }).props.onClick());
    const confirmBar = JSON.stringify(renderer.toJSON());
    check(confirmBar.includes(String(targetSkillCount)), '삭제 확인 UI가 영향받는 Skill 개수를 보여준다(대상·영향 고지)');
    act(() => findButtonByText(renderer, '삭제 확정')!.props.onClick());
    const afterDelete = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    check(afterDelete.length === 13 && !afterDelete.some((a) => a.id === targetActivity.id), 'Delete: 확인 후 해당 Activity가 제거된다');
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, 'TST-WM-005: delete는 confirmation을 해제한다');

    act(() => void useSopPrototypeStore.getState().confirmWorkMap());
    act(() => findButtonByText(renderer, 'Activity 추가')!.props.onClick());
    const afterAdd = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    check(afterAdd.length === 14, 'Add: 새 Activity가 draft에 추가된다');
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, 'TST-WM-005: add는 confirmation을 해제한다');
    check(Boolean(renderer.root.findByProps({ role: 'dialog' })), 'Add: 새 Activity 추가 직후 편집 drawer가 자동으로 열린다');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 6. 뷰 전환은 Store를 바꾸지 않는다(TST-STATE-006).
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    const beforeSnapshot = JSON.stringify(useSopPrototypeStore.getState().workMapDraft);
    const navigateCalls: string[] = [];
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={(path) => navigateCalls.push(path)} />);

    act(() => findButtonByText(renderer, '상세 보기로 전환')!.props.onClick());
    check(navigateCalls.includes(SOP_INTAKE_ROUTES.workMapDetailed), '뷰 전환 링크는 상세 Work Map 경로로 navigate한다');
    check(JSON.stringify(useSopPrototypeStore.getState().workMapDraft) === beforeSnapshot, 'TST-STATE-006: 뷰 전환은 Work Map draft를 변경하지 않는다');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 7. 검토 완료: 유효한 draft는 Foundation validation을 통과해 confirm되고,
//    기존 Task-wide 생성 seam(workLibrary)에 원본 순서 그대로 연결된 뒤
//    /sop/setup으로 이동한다(REQ-WM-006, TST-WM-008 계열).
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    const orderedActivityIds = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!).map((a) => a.id);
    const navigateCalls: string[] = [];
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={(path) => navigateCalls.push(path)} />);

    act(() => findButtonByText(renderer, '검토 완료')!.props.onClick());

    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === true, '검토 완료: 유효한 draft는 confirmed=true가 된다');
    const workLibrary = useSopPrototypeStore.getState().workLibrary;
    check(workLibrary.sourceType === 'task', '검토 완료: 기존 생성 seam은 sourceType=task로 연결된다(REQ-WM-006)');
    check(workLibrary.confirmed === true, '검토 완료: workLibrary도 확정 상태로 연결된다');
    const generationActivityIds = workLibrary.taskCatalog.find((t) => t.id === workLibrary.taskId)!.activities.map((a) => a.id);
    check(JSON.stringify(generationActivityIds) === JSON.stringify(orderedActivityIds), 'TST-WM-008: 생성 request가 확정 Work Map의 모든 Activity를 원본 순서대로 포함한다');
    check(navigateCalls.includes('/sop/setup'), '검토 완료: 기존 /sop/setup integration seam으로 이동한다');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 8. 검토 완료: 무효 draft는 확정되지 않고 생성으로 넘어가지 않는다. 첫 오류
//    항목(Task명)으로 편집 진입도 확인한다(SPEC §3.8 "오류가 있는 첫 항목으로 이동").
// ---------------------------------------------------------
{
    seedWorkMapReadyState();
    useSopPrototypeStore.getState().updateWorkMapTask({ name: '' });
    const navigateCalls: string[] = [];
    const renderer = renderComponent(<SopWorkMapSimpleView navigate={(path) => navigateCalls.push(path)} />);

    act(() => findButtonByText(renderer, '검토 완료')!.props.onClick());

    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, '검토 완료: Task명이 비어 있으면 확정되지 않는다');
    check(!navigateCalls.includes('/sop/setup'), '검토 완료: 검증 실패 시 생성 단계로 이동하지 않는다');
    check(renderer.root.findByProps({ role: 'alert' }).props.children.length > 0, '검토 완료: 실패 사유가 접근 가능한 상태 메시지로 노출된다');
    check(Boolean(renderer.root.findByProps({ role: 'dialog' })), '검토 완료: 오류가 있는 Task 항목의 편집 drawer가 자동으로 열린다');

    act(() => renderer.unmount());
}

// ---------------------------------------------------------
// 9. 원본 Task Library fixture는 어떤 편집으로도 변하지 않는다(TST-WM-007).
// ---------------------------------------------------------
check(JSON.stringify(representativeTask) === originalFixtureSnapshot, 'TST-WM-007: 모든 편집 시나리오 이후에도 원본 Task Library fixture는 변하지 않는다');

useSopPrototypeStore.getState().resetStore();

if (failCount === 0) {
    console.log(`\nALL SIMPLE WORK MAP TESTS PASSED (${passCount}/${passCount})! \u{1F389}`);
    process.exit(0);
} else {
    console.error(`\nSIMPLE WORK MAP TESTS FAILED: ${failCount} failed, ${passCount} passed.`);
    process.exit(1);
}
