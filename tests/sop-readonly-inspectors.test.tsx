import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SopStepCoreEditor } from '../src/components/sop/SopStepCoreEditor';
import { SopSkillEditor } from '../src/components/sop/SopSkillEditor';
import { SopExecutionEditor } from '../src/components/sop/SopExecutionEditor';
import { SopEdgeInspector } from '../src/components/sop/SopEdgeInspector';
import type { SopStepData } from '../src/lib/sop-types';
import { buildTaskGateSampleDocument } from '../src/lib/sop-sample-data';
import { createTaskLibrarySelectionForRole } from '../src/lib/sop-task-library';

// react-test-renderer의 act() 경고 억제 (jsdom 없이 순수 JS 트리로 렌더링하는 테스트 환경임을 명시)
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== customerReviewMode(고객 검토 모드): 단계/SKILL/실행/연결선 편집기 읽기전용화 검증 ===');
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

function setReadOnly(value: boolean) {
    useSopPrototypeStore.setState({ customerReviewMode: value });
}

/** Extracts the visible text under a TestInstance's children, ignoring icon components with no text. */
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

// --- Fixture setup: a real generated document, exercised through the real store (not mocks) ---
useSopPrototypeStore.getState().resetStore();
useSopPrototypeStore.getState().generateFromSample();
const doc = useSopPrototypeStore.getState().document!;
const nonTerminalIndex = doc.steps.findIndex((s) => !s.terminalType);
const targetStep = doc.steps[nonTerminalIndex] as SopStepData;
const aiSuggestedSkillName = targetStep.requiredSkills.find((sk) => sk.source === 'ai-suggested' && !sk.accepted)?.name;
let selectedEdgeIdForTest: string;

// ---------------------------------------------------------
// 1. SopStepCoreEditor: title input / definition textarea / review-status toggle /
//    duplicate / delete are all disabled when customerReviewMode is on, and content
//    (the step title, still-visible fields) remains readable and navigable.
// ---------------------------------------------------------
{
    setReadOnly(true);
    const renderer = renderComponent(
        <SopStepCoreEditor step={targetStep} stepIndex={nonTerminalIndex} allSteps={doc.steps} onOpenAgentization={() => {}} />
    );

    const titleInput = renderer.root.findAllByType('input').find((i) => i.props.value === targetStep.title);
    check(titleInput?.props.disabled === true, 'SopStepCoreEditor: title input is disabled in customer review mode');

    const definitionTextarea = renderer.root.findAllByType('textarea')[0];
    check(definitionTextarea?.props.disabled === true, 'SopStepCoreEditor: definition textarea is disabled in customer review mode');

    const reviewToggleButton = findButtonByText(renderer, '검토');
    check(reviewToggleButton?.props.disabled === true, 'SopStepCoreEditor: review-status toggle button is disabled in customer review mode');

    const duplicateButton = findButtonByText(renderer, '이 단계 복제');
    check(duplicateButton?.props.disabled === true, 'SopStepCoreEditor: duplicate-step button is disabled in customer review mode');

    const deleteButton = findButtonByText(renderer, '이 단계 삭제');
    check(deleteButton?.props.disabled === true, 'SopStepCoreEditor: delete-step button is disabled in customer review mode');

    const renderedText = JSON.stringify(renderer.toJSON());
    check(renderedText.includes(targetStep.title), 'SopStepCoreEditor: step content (title) still renders while in customer review mode');

    const closeButton = renderer.root.findByProps({ 'aria-label': '단계 편집 닫기' });
    check(closeButton.props.disabled !== true, 'SopStepCoreEditor: navigation (close) stays usable in customer review mode');

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 2. SopStepCoreEditor: with customerReviewMode off, existing edit behavior (title edit)
//    still works exactly as before - not disabled, and the store is actually updated.
// ---------------------------------------------------------
{
    setReadOnly(false);
    const renderer = renderComponent(
        <SopStepCoreEditor step={targetStep} stepIndex={nonTerminalIndex} allSteps={doc.steps} onOpenAgentization={() => {}} />
    );

    const titleInput = renderer.root.findAllByType('input').find((i) => i.props.value === targetStep.title);
    check(titleInput?.props.disabled !== true, 'SopStepCoreEditor: title input is enabled when customer review mode is off');

    act(() => {
        titleInput!.props.onChange({ target: { value: '읽기전용 해제 후 수정된 제목' } });
    });
    check(
        useSopPrototypeStore.getState().document!.steps[nonTerminalIndex].title === '읽기전용 해제 후 수정된 제목',
        'SopStepCoreEditor: title edit still reaches the store when customer review mode is off'
    );

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 3. SopSkillEditor: add / accept / reject / remove are all blocked when
//    customerReviewMode is on.
// ---------------------------------------------------------
{
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    setReadOnly(true);
    const stepWithSkills = useSopPrototypeStore.getState().document!.steps[nonTerminalIndex];
    const renderer = renderComponent(<SopSkillEditor step={stepWithSkills} />);

    const addButton = findButtonByText(renderer, 'SKILL 연결');
    check(addButton?.props.disabled === true, 'SopSkillEditor: "SKILL 연결" (add) button is disabled in customer review mode');

    const acceptButton = findButtonByText(renderer, '수락');
    const rejectButton = findButtonByText(renderer, '거절');
    check(acceptButton?.props.disabled === true, 'SopSkillEditor: accept (수락) button is disabled in customer review mode');
    check(rejectButton?.props.disabled === true, 'SopSkillEditor: reject (거절) button is disabled in customer review mode');

    const removeButtons = renderer.root.findAllByProps({ 'aria-label': 'SKILL 삭제' });
    check(removeButtons.length > 0 && removeButtons.every((b) => b.props.disabled === true), 'SopSkillEditor: every remove (SKILL 삭제) button is disabled in customer review mode');

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 4. SopSkillEditor: with customerReviewMode off, accepting an AI-suggested SKILL still
//    works exactly as before.
// ---------------------------------------------------------
{
    setReadOnly(false);
    const stepWithSkills = useSopPrototypeStore.getState().document!.steps[nonTerminalIndex];
    const renderer = renderComponent(<SopSkillEditor step={stepWithSkills} />);

    const acceptButton = findButtonByText(renderer, '수락');
    check(acceptButton?.props.disabled !== true, 'SopSkillEditor: accept button is enabled when customer review mode is off');
    check(!!aiSuggestedSkillName, 'SopSkillEditor: fixture step has an ai-suggested, not-yet-accepted skill to exercise');

    act(() => {
        acceptButton!.props.onClick();
    });
    const skillAfterAccept = useSopPrototypeStore.getState().document!.steps[nonTerminalIndex].requiredSkills.find((sk) => sk.name === aiSuggestedSkillName);
    check(skillAfterAccept?.accepted === true, 'SopSkillEditor: accepting an AI-suggested skill still reaches the store when customer review mode is off');

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 5. SopExecutionEditor: detailed instructions / inputs / outputs / tools are all
//    disabled when customerReviewMode is on.
// ---------------------------------------------------------
{
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    setReadOnly(true);
    const execStep = useSopPrototypeStore.getState().document!.steps[nonTerminalIndex];
    const renderer = renderComponent(<SopExecutionEditor step={execStep} />);

    const textarea = renderer.root.findAllByType('textarea')[0];
    check(textarea?.props.disabled === true, 'SopExecutionEditor: detailed-instructions textarea is disabled in customer review mode');

    const inputs = renderer.root.findAllByType('input');
    check(inputs.length >= 3 && inputs.every((i) => i.props.disabled === true), 'SopExecutionEditor: inputs/outputs/tools fields are all disabled in customer review mode');

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 6. SopExecutionEditor: with customerReviewMode off, editing detailed instructions
//    still works exactly as before.
// ---------------------------------------------------------
{
    setReadOnly(false);
    const execStep = useSopPrototypeStore.getState().document!.steps[nonTerminalIndex];
    const renderer = renderComponent(<SopExecutionEditor step={execStep} />);

    const textarea = renderer.root.findAllByType('textarea')[0];
    check(textarea?.props.disabled !== true, 'SopExecutionEditor: detailed-instructions textarea is enabled when customer review mode is off');

    act(() => {
        textarea!.props.onChange({ target: { value: '읽기전용 해제 후 수정된 상세 수행 방법' } });
    });
    check(
        useSopPrototypeStore.getState().document!.steps[nonTerminalIndex].detailedInstructions === '읽기전용 해제 후 수정된 상세 수행 방법',
        'SopExecutionEditor: detailed-instructions edit still reaches the store when customer review mode is off'
    );

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 7. SopEdgeInspector: label / branch-type / condition / delete are all disabled when
//    customerReviewMode is on, and the edge's endpoints still render.
// ---------------------------------------------------------
{
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    const freshDoc = useSopPrototypeStore.getState().document!;
    selectedEdgeIdForTest = freshDoc.edges[0].id;
    useSopPrototypeStore.getState().selectEdge(selectedEdgeIdForTest);
    setReadOnly(true);
    const renderer = renderComponent(<SopEdgeInspector onOpenAgentization={() => {}} />);

    const labelInput = renderer.root.findAllByType('input')[0];
    check(labelInput?.props.disabled === true, 'SopEdgeInspector: label input is disabled in customer review mode');

    const conditionTextarea = renderer.root.findAllByType('textarea')[0];
    check(conditionTextarea?.props.disabled === true, 'SopEdgeInspector: condition textarea is disabled in customer review mode');

    const yesBranchButton = findButtonByText(renderer, 'YES (통과)');
    const noBranchButton = findButtonByText(renderer, 'NO (반려/미통과)');
    check(yesBranchButton?.props.disabled === true && noBranchButton?.props.disabled === true, 'SopEdgeInspector: branch-type buttons are disabled in customer review mode');

    const deleteEdgeButton = findButtonByText(renderer, '이 연결선 삭제하기');
    check(deleteEdgeButton?.props.disabled === true, 'SopEdgeInspector: delete-edge button is disabled in customer review mode');

    const renderedText = JSON.stringify(renderer.toJSON());
    const sourceStep = freshDoc.steps.find((s) => s.id === freshDoc.edges[0].source);
    check(!!sourceStep && renderedText.includes(sourceStep.title), 'SopEdgeInspector: edge endpoint content still renders while in customer review mode');

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 8. SopEdgeInspector: with customerReviewMode off, editing the edge label still works
//    exactly as before.
// ---------------------------------------------------------
{
    setReadOnly(false);
    const renderer = renderComponent(<SopEdgeInspector onOpenAgentization={() => {}} />);

    const labelInput = renderer.root.findAllByType('input')[0];
    check(labelInput?.props.disabled !== true, 'SopEdgeInspector: label input is enabled when customer review mode is off');

    act(() => {
        labelInput!.props.onChange({ target: { value: '읽기전용 해제 후 수정된 라벨' } });
    });
    const updatedEdge = useSopPrototypeStore.getState().document!.edges.find((e) => e.id === selectedEdgeIdForTest);
    check(updatedEdge?.label === '읽기전용 해제 후 수정된 라벨', 'SopEdgeInspector: label edit still reaches the store when customer review mode is off');

    act(() => {
        renderer.unmount();
    });
}

// ---------------------------------------------------------
// 9. SopStepCoreEditor: the Sub Action origin selector (activity-subaction-v1 only) —
//    unset shows the "미지정 · SOP 확정 차단" badge, is disabled under customer review
//    mode, and the rationale textarea only appears for context-derived.
// ---------------------------------------------------------
{
    const originWorkLibrary = createTaskLibrarySelectionForRole('Talent Acquisition');
    const originBuild = buildTaskGateSampleDocument({
        id: 'origin-ui-doc',
        member: { name: 'Origin UI 테스트', jobRole: 'Talent Acquisition' },
        workLibrary: originWorkLibrary,
        context: 'origin selector 테스트',
        setupConfig: { detailLevel: 'standard', minSteps: 4, maxSteps: 20, branchPolicy: 'auto', maxBranches: 2, allowRework: true, maxTotalNodes: 24, maxLoops: 2, splitComplexSteps: true },
    });
    if (!originBuild.success) throw new Error(`origin UI fixture failed: ${originBuild.reason}`);
    const originDoc = { ...originBuild.document, steps: originBuild.document.steps.map((s) => (s.terminalType ? s : { ...s, subActionOrigin: undefined })) };
    setReadOnly(false);
    useSopPrototypeStore.getState().setDocument(originDoc);
    const originStepIndex = originDoc.steps.findIndex((s) => !s.terminalType);
    const originStep = useSopPrototypeStore.getState().document!.steps[originStepIndex];

    setReadOnly(true);
    const lockedRenderer = renderComponent(
        <SopStepCoreEditor step={originStep} stepIndex={originStepIndex} allSteps={useSopPrototypeStore.getState().document!.steps} onOpenAgentization={() => {}} />
    );
    const lockedText = JSON.stringify(lockedRenderer.toJSON());
    check(lockedText.includes('미지정'), 'SopStepCoreEditor: an unset Sub Action origin shows the "미지정" badge');
    const lockedSelect = lockedRenderer.root.findAllByType('select').find((s) => s.props.value === '');
    check(lockedSelect?.props.disabled === true, 'SopStepCoreEditor: the Sub Action origin selector is disabled in customer review mode');
    act(() => lockedRenderer.unmount());

    setReadOnly(false);
    const editableRenderer = renderComponent(
        <SopStepCoreEditor step={originStep} stepIndex={originStepIndex} allSteps={useSopPrototypeStore.getState().document!.steps} onOpenAgentization={() => {}} />
    );
    const editableSelect = editableRenderer.root.findAllByType('select').find((s) => s.props.value === '');
    check(editableSelect?.props.disabled !== true, 'SopStepCoreEditor: the origin selector is enabled when customer review mode is off');
    check(editableRenderer.root.findAllByType('textarea').every((t) => t.props.placeholder?.includes('직무 맥락') !== true), 'SopStepCoreEditor: no rationale textarea is shown while origin is unset');

    act(() => {
        editableSelect!.props.onChange({ target: { value: 'context-derived' } });
    });
    check(useSopPrototypeStore.getState().document!.steps[originStepIndex].subActionOrigin === 'context-derived', 'SopStepCoreEditor: choosing "직무 맥락 보강" updates the step\'s subActionOrigin through the real Store action');
    const afterContextRenderer = renderComponent(
        <SopStepCoreEditor step={useSopPrototypeStore.getState().document!.steps[originStepIndex]} stepIndex={originStepIndex} allSteps={useSopPrototypeStore.getState().document!.steps} onOpenAgentization={() => {}} />
    );
    const rationaleTextarea = afterContextRenderer.root.findAllByType('textarea').find((t) => t.props.placeholder?.includes('직무 맥락'));
    check(Boolean(rationaleTextarea), 'SopStepCoreEditor: selecting context-derived reveals the required rationale textarea');
    act(() => {
        rationaleTextarea!.props.onChange({ target: { value: '테스트용 근거 텍스트' } });
    });
    check(useSopPrototypeStore.getState().document!.steps[originStepIndex].subActionOriginRationale === '테스트용 근거 텍스트', 'SopStepCoreEditor: typing a rationale updates the step through the real Store action');

    act(() => {
        editableRenderer.unmount();
        afterContextRenderer.unmount();
    });
    useSopPrototypeStore.getState().resetStore();
}

setReadOnly(false);

if (failCount === 0) {
    console.log(`\nALL READONLY INSPECTOR TESTS PASSED (${passCount}/${passCount})! \u{1F389}`);
    process.exit(0);
} else {
    console.error(`\nREADONLY INSPECTOR TESTS FAILED: ${failCount} failed, ${passCount} passed.`);
    process.exit(1);
}
