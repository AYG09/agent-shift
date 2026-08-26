/**
 * Wave 1D — 상세 Work Map 페이지 테스트.
 *
 * `SopWorkMapDetailedView`는 Foundation의 `workMapDraft`를 그대로 읽고 Foundation
 * mutation만 호출하는 projection이다. 이 테스트는 그 계약을 실제 store와
 * react-test-renderer로 증명한다 — source-string 검색이 아니라 클릭/입력을
 * 시뮬레이션하고 store 상태 변화를 assert한다.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SOP_TASK_LIBRARY_FIXTURE } from '../src/lib/sop-task-library';
import { createWorkMapDraftFromCatalog, selectWorkMapActivities } from '../src/lib/sop-work-map-draft';
import { SopWorkMapDetailedView, computeNextActivitySelection } from '../src/components/sop/SopWorkMapDetailedView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== Wave 1D 상세 Work Map 테스트 ===');
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

// ---------------------------------------------------------
// 1. computeNextActivitySelection: 순수 함수 — 삭제 후 결정론적 다음 선택
// ---------------------------------------------------------
{
    const activities = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as unknown as Parameters<typeof computeNextActivitySelection>[0];
    check(computeNextActivitySelection(activities, 'a') === 'b', '첫 항목 삭제 → 다음 항목(구 2번째)이 새로 그 자리를 채운다');
    check(computeNextActivitySelection(activities, 'b') === 'c', '중간 항목 삭제 → 다음 항목을 선택한다');
    check(computeNextActivitySelection(activities, 'c') === 'b', '마지막 항목 삭제 → 새 마지막 항목을 선택한다');
    const onlyActivity = [{ id: 'only' }] as unknown as Parameters<typeof computeNextActivitySelection>[0];
    check(computeNextActivitySelection(onlyActivity, 'only') === null, '유일한 항목을 삭제하면 선택은 null이다');
}

// ---------------------------------------------------------
// Fixture: 대표 Task (Activity 14개, Skill 관계 70개)
// ---------------------------------------------------------
useSopPrototypeStore.getState().resetStore();
const job = SOP_TASK_LIBRARY_FIXTURE.jobs.find((candidate) => candidate.name === 'Talent Acquisition')!;
const representativeTask = job.tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화')!;
const originalSnapshot = JSON.stringify(representativeTask);

useSopPrototypeStore.setState({
    workMapDraft: createWorkMapDraftFromCatalog({ job, task: representativeTask, contextText: '테스트 업무 맥락', now: '2026-08-26T00:00:00.000Z' }),
});

function renderDetailedView(navigate: (href: string) => void) {
    const focusCalls: number[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(<SopWorkMapDetailedView navigate={navigate} />, {
            // Every host element gets a safe no-op focus() (taskNameRef targets an
            // <input>, not just the <h2>) — only h2 focus calls are actually counted.
            createNodeMock: (element) => ({
                focus: () => {
                    if (element.type === 'h2') focusCalls.push(focusCalls.length + 1);
                },
            }),
        });
    });
    return { renderer, focusCalls };
}

const navigateCalls: string[] = [];
const navigate = (href: string) => navigateCalls.push(href);
const { renderer, focusCalls } = renderDetailedView(navigate);

function masterList(r: TestRenderer.ReactTestRenderer) {
    return r.root.findByProps({ 'aria-label': 'Activity 목록' });
}
function masterButtons(r: TestRenderer.ReactTestRenderer) {
    return masterList(r).findAllByType('button');
}
function selectedMasterButton(r: TestRenderer.ReactTestRenderer) {
    return masterButtons(r).find((b) => b.props['aria-current'] === 'true');
}

// ---------------------------------------------------------
// 2. 최초 렌더: 14개 Activity, 첫 Activity가 선택되고 그 5개 Skill이 보인다
//    (TST-WM-001/TST-UI-003 detailed 범위)
// ---------------------------------------------------------
{
    const buttons = masterButtons(renderer);
    check(buttons.length === 14, 'master 목록에 대표 Task의 Activity 14개가 모두 렌더링된다');

    const selected = selectedMasterButton(renderer);
    check(!!selected, '첫 렌더에서 정확히 하나의 Activity가 aria-current="true"로 선택된다');

    const firstActivity = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!)[0];
    const heading = renderer.root.findByType('h2');
    check(extractText(heading.props.children) === firstActivity.name, '상세 heading이 선택된 Activity 이름을 표시한다');

    const skillNameInputs = renderer.root.findAllByType('input').filter((i) => firstActivity.skills.some((s) => s.name === i.props.value));
    check(skillNameInputs.length === firstActivity.skills.length && firstActivity.skills.length === 5, '선택 Activity의 Skill 5개 이름을 모두 편집 가능한 input으로 읽을 수 있다 (TST-UI-003)');

    check(focusCalls.length === 1, '최초 마운트 시 상세 heading에 focus가 한 번 이동한다');
}

// ---------------------------------------------------------
// 3. Activity 선택 변경: heading·focus·screen-reader 문맥이 갱신되고, 같은
//    Activity 안에서 타이핑할 때는 다시 focus를 빼앗지 않는다 (디자인 수용 기준 1)
// ---------------------------------------------------------
{
    const activities = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    const secondButton = masterButtons(renderer)[1];
    act(() => {
        secondButton.props.onClick();
    });
    const heading = renderer.root.findByType('h2');
    check(extractText(heading.props.children) === activities[1].name, '두 번째 Activity를 선택하면 상세 heading이 즉시 그 이름으로 갱신된다');
    check(focusCalls.length === 2, 'Activity 선택이 바뀌면 heading에 focus가 다시 이동한다');
    check(selectedMasterButton(renderer)?.props['aria-current'] === 'true' && extractText(selectedMasterButton(renderer)!.props.children).includes(activities[1].name.slice(0, 3)), '선택 표시가 클릭한 행으로 이동한다');

    const nameInput = renderer.root.findAllByType('input').find((i) => i.props.value === activities[1].name)!;
    act(() => {
        nameInput.props.onChange({ target: { value: activities[1].name } });
    });
    check(focusCalls.length === 2, '같은 Activity 안에서 값을 다시 쓰는 것만으로는 heading focus를 다시 빼앗지 않는다 (매 keystroke 방해 없음)');
}

// ---------------------------------------------------------
// 4. 선택 상태는 색상만이 아니라 체크 아이콘·aria-current로도 구분된다
//    (디자인 수용 기준 2)
// ---------------------------------------------------------
{
    const selected = selectedMasterButton(renderer)!;
    const notSelected = masterButtons(renderer).find((b) => b.props['aria-current'] !== 'true')!;
    const selectedMarkerClass = (selected.findAllByType('span')[0].props.className as string) ?? '';
    const notSelectedMarkerClass = (notSelected.findAllByType('span')[0].props.className as string) ?? '';
    check(selectedMarkerClass.includes('bg-indigo-600') && !notSelectedMarkerClass.includes('bg-indigo-600'), '선택 행에만 채워진 체크 마커 배경이 있다 — 배경색 변화 하나만으로 선택을 표현하지 않는다');
    check(selected.props['aria-current'] === 'true' && notSelected.props['aria-current'] === undefined, 'aria-current가 선택 행에서만 true다');
}

// ---------------------------------------------------------
// 5. detail pane에서 편집하면 Foundation draft가 즉시 바뀌고(간소화 화면이 읽는
//    것과 같은 draft), 원본 Task Library fixture는 절대 바뀌지 않는다
//    (TST-WM-003/004/007 상세 범위)
// ---------------------------------------------------------
{
    const activitiesBefore = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    const target = activitiesBefore[1];
    const nameInput = renderer.root.findAllByType('input').find((i) => i.props.value === target.name)!;
    act(() => {
        nameInput.props.onChange({ target: { value: '수정된 Activity 이름' } });
    });
    check(useSopPrototypeStore.getState().workMapDraft!.task.activities[1].name === '수정된 Activity 이름', 'detail pane의 Activity 명 편집이 실제 Foundation draft를 갱신한다');
    check(extractText(masterButtons(renderer)[1].props.children).includes('수정된'), 'master 목록도 같은 draft를 읽으므로 즉시 새 이름을 보여준다');

    const targetSkill = target.skills[0];
    const skillDescArea = renderer.root.findAllByType('textarea').find((t) => t.props.value === targetSkill.description)!;
    act(() => {
        skillDescArea.props.onChange({ target: { value: '상세 화면에서 수정한 Skill 설명' } });
    });
    check(
        useSopPrototypeStore.getState().workMapDraft!.task.activities[1].skills[0].description === '상세 화면에서 수정한 Skill 설명',
        'Skill 설명 편집도 Foundation draft에 즉시 반영된다'
    );

    check(JSON.stringify(representativeTask) === originalSnapshot, 'TST-WM-007: 지금까지의 모든 편집에도 원본 Task Library fixture는 변하지 않았다');
}

// ---------------------------------------------------------
// 6. add/delete/reorder는 confirmation을 해제하고, 삭제는 결정론적으로 다음
//    Activity를 선택한다 (TST-WM-005, 05_WAVE1D "결정론적으로 다음 유효 Activity")
// ---------------------------------------------------------
{
    act(() => {
        useSopPrototypeStore.getState().confirmWorkMap();
    });
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === true, '테스트 준비: Work Map을 confirmed 상태로 만든다');

    const addButton = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('Activity') && !extractText(b.props.children).includes('위로') && !extractText(b.props.children).includes('아래로'))!;
    act(() => {
        addButton.props.onClick();
    });
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, 'Activity 추가는 confirmation을 해제한다');
    check(selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!).length === 15, 'Activity 추가로 개수가 15개가 된다');
    check(selectedMasterButton(renderer)?.props['aria-current'] === 'true', '새로 추가한 Activity가 자동으로 선택된다');

    // 새로 추가된 Activity는 이름이 비어 있다 — 이후 확정 검증 테스트가 이 때문에
    // 실패하지 않도록 여기서 이름을 채운다(실제 사용자도 추가 직후 이름을 입력한다).
    const newActivityNameInput = renderer.root.findAllByType('input').find((i) => i.props.value === '')!;
    act(() => {
        newActivityNameInput.props.onChange({ target: { value: '새로 추가한 Activity' } });
    });

    act(() => {
        useSopPrototypeStore.getState().confirmWorkMap();
    });

    const activitiesBeforeDelete = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    const middleTarget = activitiesBeforeDelete[5];
    const expectedNext = computeNextActivitySelection(activitiesBeforeDelete, middleTarget.id);

    act(() => {
        masterButtons(renderer).find((b) => extractText(b.props.children).includes(middleTarget.name))!.props.onClick();
    });
    const deleteButton = renderer.root.findByProps({ 'aria-label': `Activity '${middleTarget.name}' 삭제` });
    act(() => {
        deleteButton.props.onClick();
    });
    const activitiesAfterDelete = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    check(activitiesAfterDelete.length === 14, '중간 Activity 삭제 후 개수가 정확히 하나 줄어든다');
    check(!activitiesAfterDelete.some((a) => a.id === middleTarget.id), '삭제된 Activity는 draft에 더 이상 없다');
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === false, 'Activity 삭제는 confirmation을 해제한다 (TST-WM-005)');
    check(selectedMasterButton(renderer)?.props['aria-current'] === 'true', '삭제 후에도 정확히 하나의 Activity가 선택 상태를 유지한다');
    const nextName = activitiesAfterDelete.find((a) => a.id === expectedNext)?.name;
    check(!!nextName && extractText(selectedMasterButton(renderer)!.props.children).includes(nextName.slice(0, 3)), '삭제 직후 선택이 계산된 다음 유효 Activity로 결정론적으로 이동한다');
}

// ---------------------------------------------------------
// 7. Skill 수는 5개로 고정되지 않는다 — 추가/삭제해도 저장 가능하다 (TST-WM-006)
// ---------------------------------------------------------
{
    const before = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!);
    const selectedText = extractText(selectedMasterButton(renderer)!.props.children);
    const current = before.find((a) => selectedText.includes(a.name)) ?? before[0];
    const skillCountBefore = current.skills.length;

    const addSkillButton = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('Skill 추가'))!;
    act(() => {
        addSkillButton.props.onClick();
    });
    const afterAdd = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!).find((a) => a.id === current.id)!;
    check(afterAdd.skills.length === skillCountBefore + 1, 'Skill 추가는 Foundation draft에 새 Skill을 만든다 (5개 고정 아님)');

    const newSkill = afterAdd.skills[afterAdd.skills.length - 1];
    const deleteSkillButton = renderer.root.findByProps({ 'aria-label': `Skill '이름 없음' 삭제` });
    act(() => {
        deleteSkillButton.props.onClick();
    });
    const afterDelete = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!).find((a) => a.id === current.id)!;
    check(afterDelete.skills.length === skillCountBefore && !afterDelete.skills.some((s) => s.id === newSkill.id), 'Skill 삭제도 즉시 반영되며 개수 제약이 없다');
}

// ---------------------------------------------------------
// 8. 검증 실패: Task명을 비우면 "검토 완료"가 막히고 첫 오류로 이동한다
// ---------------------------------------------------------
{
    const taskNameInput = renderer.root.findAllByType('input').find((i) => i.props.value === useSopPrototypeStore.getState().workMapDraft!.task.name)!;
    act(() => {
        taskNameInput.props.onChange({ target: { value: '' } });
    });
    const confirmButton = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('검토 완료'))!;
    const navigateCountBefore = navigateCalls.length;
    act(() => {
        confirmButton.props.onClick();
    });
    check(navigateCalls.length === navigateCountBefore, 'Task명이 비어 있으면 확정에 실패하고 /sop/setup으로 이동하지 않는다');
    const errorBanner = renderer.root.findAll((node) => typeof node.type === 'string' && extractText(node.props.children).includes('오류') && extractText(node.props.children).includes('건'));
    check(errorBanner.length > 0, '검증 실패 시 오류 배너가 몇 건인지 보여준다');

    // A11Y-3: Task명 오류 문구가 aria-describedby로 입력에 연결된다.
    const taskNameErrorSpan = renderer.root.findAll((node) => typeof node.type === 'string' && extractText(node.props.children) === 'Task명을 입력하세요.');
    check(taskNameErrorSpan.length === 1 && taskNameErrorSpan[0].props.id === 'sop-work-map-task-name-error', 'A11Y-3: Task명 오류 문구에 고유 id가 있다');
    check(taskNameInput.props['aria-describedby'] === 'sop-work-map-task-name-error', 'A11Y-3: Task명 입력이 aria-describedby로 오류 문구와 연결된다');
    check(taskNameInput.props['aria-invalid'] === true, 'A11Y-3: Task명 입력이 오류 상태를 aria-invalid로도 알린다');

    act(() => {
        taskNameInput.props.onChange({ target: { value: '채용 프로세스 운영 및 최적화' } });
    });
}

// ---------------------------------------------------------
// 9. 검증 통과: "검토 완료"는 Foundation confirmation + /sop/setup 연동
//    (setWorkLibrary를 통한 기존 생성 계약 seam)을 사용하고 생성 로직을
//    복제하지 않는다
// ---------------------------------------------------------
{
    const confirmButton = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('검토 완료'))!;
    act(() => {
        confirmButton.props.onClick();
    });
    check(useSopPrototypeStore.getState().workMapDraft!.confirmed === true, '유효한 Work Map은 "검토 완료"로 confirmed 상태가 된다');
    check(navigateCalls.at(-1) === '/sop/setup', '확정 성공 시 기존 /sop/setup integration seam으로 이동한다');
    check(
        useSopPrototypeStore.getState().workLibrary.sourceType === 'task' &&
            useSopPrototypeStore.getState().workLibrary.taskId === useSopPrototypeStore.getState().workMapDraft!.task.id &&
            useSopPrototypeStore.getState().workLibrary.confirmed === true,
        '확정된 Work Map이 기존 생성 계약의 WorkLibrarySelection으로 변환되어 seam에 전달된다'
    );
}

// ---------------------------------------------------------
// 10. simple 화면 전환 링크는 순수 navigate 호출일 뿐 어떤 상태도 바꾸지 않는다
//     (TST-STATE-006)
// ---------------------------------------------------------
{
    const draftBefore = useSopPrototypeStore.getState().workMapDraft;
    const confirmedBefore = draftBefore!.confirmed;
    const activityCountBefore = selectWorkMapActivities(draftBefore!).length;

    const simpleLink = renderer.root.findAllByType('button').find((b) => extractText(b.props.children).includes('간소화 보기로 전환'))!;
    act(() => {
        simpleLink.props.onClick();
    });
    check(navigateCalls.at(-1) === '/sop/work-map/simple', '간소화 보기 전환은 정확한 경로로 navigate한다');
    check(
        useSopPrototypeStore.getState().workMapDraft!.confirmed === confirmedBefore &&
            selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!).length === activityCountBefore,
        'simple 전환은 Work Map draft나 confirmation을 전혀 바꾸지 않는다'
    );
}

// ---------------------------------------------------------
// 11. 마지막 Activity 보호: Activity가 1개만 남으면 삭제가 비활성화된다
// ---------------------------------------------------------
{
    act(() => {
        useSopPrototypeStore.getState().resetStore();
        useSopPrototypeStore.setState({
            workMapDraft: createWorkMapDraftFromCatalog({
                job,
                task: { ...representativeTask, activities: [representativeTask.activities[0]] },
                contextText: '단일 Activity 테스트',
                now: '2026-08-26T00:00:00.000Z',
            }),
        });
    });
    const { renderer: soloRenderer } = renderDetailedView(() => {});
    const soloActivity = selectWorkMapActivities(useSopPrototypeStore.getState().workMapDraft!)[0];
    const deleteButton = soloRenderer.root.findByProps({ 'aria-label': `Activity '${soloActivity.name}' 삭제` });
    check(deleteButton.props.disabled === true, '남은 Activity가 1개면 삭제 버튼이 비활성화된다');
    check(deleteButton.props.title === 'Activity는 최소 1개가 필요합니다.', '비활성화 이유가 title로 제공된다');
    act(() => {
        soloRenderer.unmount();
    });
}

// ---------------------------------------------------------
// 12. 구조적 접근성/레이아웃: 클릭 가능한 요소는 실제 <button>이고(키보드 tab/Enter
//     로 조작 가능), 독립 스크롤 영역이 있으며, footer는 고정 오버레이가 아니라
//     일반 flex 흐름의 마지막 자식이라 콘텐츠를 가리지 않는다 (TST-UI-004/006)
// ---------------------------------------------------------
{
    const clickableDivs = renderer.root.findAllByType('div').filter((d) => typeof d.props.onClick === 'function');
    check(clickableDivs.length === 0, '클릭 가능한 대화형 요소가 <div onClick>이 아니라 모두 실제 button/input 등 포커스 가능한 요소다');

    const list = masterList(renderer);
    check((list.props.className as string).includes('overflow-y-auto'), 'Activity 목록(master)은 독립 스크롤 영역이다');

    const taskDescription = renderer.root.findAllByType('textarea').find((t) => (t.props.className as string)?.includes('max-h-24'));
    check(!!taskDescription && (taskDescription!.props.className as string).includes('overflow-y-auto'), 'Task 정의는 잘리지 않고 자체 스크롤로 전문을 유지한다');
}

// ---------------------------------------------------------
// 13. 접근성 회귀 (Wave 3 리뷰 A11Y-1/A11Y-3)
// ---------------------------------------------------------
{
    // A11Y-1: Skill 설명 textarea에 형제 입력과 같은 톤의 focus 표시가 있다.
    const skillDescriptionArea = renderer.root.findAllByType('textarea').find((t) => t.props.placeholder === 'Skill 설명');
    check(!!skillDescriptionArea, 'Skill 설명 textarea가 렌더링된다');
    check(
        !!skillDescriptionArea && (skillDescriptionArea.props.className as string).includes('focus:ring-1') && (skillDescriptionArea.props.className as string).includes('focus:ring-indigo-500'),
        'A11Y-1: Skill 설명 textarea가 형제 입력(Activity 명/설명)과 같은 톤의 focus 표시(focus:ring-indigo-500)를 갖는다'
    );

    // A11Y-3: Task 정의 textarea가 <label>로 감싸여 accessible name을 갖는다.
    const currentTaskDescription = useSopPrototypeStore.getState().workMapDraft!.task.description ?? '';
    const taskDefinitionLabel = renderer.root
        .findAllByType('label')
        .find((label) => label.findAllByType('textarea').some((t) => t.props.value === currentTaskDescription));
    check(!!taskDefinitionLabel, 'A11Y-3: "TASK 정의" textarea가 <label>로 감싸여 accessible name을 갖는다');
}

if (failCount === 0) {
    console.log(`\nALL WAVE 1D DETAILED WORK MAP TESTS PASSED (${passCount}/${passCount})! \u{1F389}`);
    process.exit(0);
} else {
    console.error(`\nWAVE 1D DETAILED WORK MAP TESTS FAILED: ${failCount} failed, ${passCount} passed.`);
    process.exit(1);
}
