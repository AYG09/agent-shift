import { fixtureFor, recruitingFixture } from '../src/lib/sop-demo-fixtures';
import { getAgentizableDemoStepIds, getDemoAgentizationModeForStep, useSopDemoStore } from '../src/lib/sop-demo-store';
import { AI_APPLICATION_MODES } from '../src/lib/sop-agentization';

let failed = 0;
function check(name: string, condition: boolean) {
    if (condition) console.log(`✓ ${name}`);
    else { failed += 1; console.error(`✗ ${name}`); }
}

const fixture = recruitingFixture('branching');
const ids = new Set(fixture.steps.map((step) => step.id));
const starts = fixture.steps.filter((step) => step.terminalType === 'start');
const ends = fixture.steps.filter((step) => step.terminalType === 'end');
const decisions = fixture.steps.filter((step) => step.shape === 'decision');

check('채용 Branching fixture는 시작 노드가 정확히 1개', starts.length === 1);
check('채용 Branching fixture는 종료 노드가 정확히 1개', ends.length === 1);
check('모든 연결선이 존재하는 노드를 가리킴', fixture.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
check('고립 노드가 없음', fixture.steps.every((step) => fixture.edges.some((edge) => edge.source === step.id || edge.target === step.id)));
check('decision 노드가 3개', decisions.length === 3);
check('각 decision은 YES와 NO 분기를 가짐', decisions.every((step) => {
    const branches = fixture.edges.filter((edge) => edge.source === step.id).map((edge) => edge.branchType);
    return branches.includes('yes') && branches.includes('no');
}));
check('loopLimit 단계가 포함됨', fixture.steps.some((step) => step.shape === 'loopLimit'));
check('모든 단계에 요청된 fixture 필드가 존재함', fixture.steps.every((step) => ['id', 'title', 'definition', 'detailedInstructions', 'responsibleRole', 'inputs', 'outputs', 'tools', 'cautions', 'decisionRules', 'requiredSkills', 'estimatedDuration', 'type', 'shape', 'terminalType', 'position', 'reviewStatus'].every((key) => key in step)));
check('모든 연결선에 요청된 fixture 필드가 존재함', fixture.edges.every((edge) => ['id', 'source', 'target', 'label', 'branchType', 'condition', 'sourceHandle', 'targetHandle'].every((key) => key in edge)));
check('같은 입력은 같은 fixture를 반환함', JSON.stringify(recruitingFixture('branching')) === JSON.stringify(recruitingFixture('branching')));
check('모든 preset은 dangling edge 없이 표시됨', (['simple', 'standard', 'branching'] as const).every((preset) => { const item = recruitingFixture(preset); const itemIds = new Set(item.steps.map((step) => step.id)); return item.edges.every((edge) => itemIds.has(edge.source) && itemIds.has(edge.target)); }));
check('보조 시나리오 fixture도 네트워크 호출 없이 생성됨', fixtureFor('purchasing', 'standard').steps.length > 0 && fixtureFor('complaint', 'simple').steps.length > 0);
check('보조 시나리오는 고유한 업무 문구를 표시함', fixtureFor('purchasing', 'branching').steps.some((step) => step.title === '발주서 작성 및 구매 등록') && fixtureFor('complaint', 'branching').steps.some((step) => step.title === '고객 불만 접수'));

// Agent화 검토는 화면 장식이 아니라, 선택 범위와 확정 결과가 상태에 남고 SOP 편집 시 재확정되어야 한다.
const demoStore = useSopDemoStore.getState();
demoStore.resetDemo();
const agentizableIds = getAgentizableDemoStepIds(useSopDemoStore.getState().document);
check('Agent화 후보에서 시작·종료 terminal을 제외함', agentizableIds.length > 0 && !agentizableIds.includes('start') && !agentizableIds.includes('end'));
check('AI 참여 방식 미지정 상태에서는 전체 워크플로도 확정할 수 없음', !useSopDemoStore.getState().confirmAgentization().success);
useSopDemoStore.getState().setAgentizationDefaultMode('assist');
const workflowAgentization = useSopDemoStore.getState().confirmAgentization();
check('전체 워크플로 Agent화 가능 여부를 확정할 수 있음', workflowAgentization.success && useSopDemoStore.getState().agentizationStepIds.length === agentizableIds.length && !!useSopDemoStore.getState().agentizationConfirmedAt);
useSopDemoStore.getState().setAgentizationScope('steps');
check('특정 단계 모드에서 미선택 상태는 확정할 수 없음', !useSopDemoStore.getState().confirmAgentization().success);
useSopDemoStore.getState().toggleAgentizationStep(agentizableIds[0]);
// The earlier workflow-scope batch assign already left every step's mode set; clear this
// one explicitly so the check below exercises "selected but unassigned", not leftover state.
useSopDemoStore.getState().setAgentizationStepMode(agentizableIds[0], undefined);
check('선택했지만 AI 참여 방식을 지정하지 않은 단계는 확정할 수 없음', !useSopDemoStore.getState().confirmAgentization().success);
useSopDemoStore.getState().setAgentizationStepMode(agentizableIds[0], 'automation');
const stepAgentization = useSopDemoStore.getState().confirmAgentization();
check('특정 업무 단계를 AI Agent 후보로 확정할 수 있음', stepAgentization.success && useSopDemoStore.getState().agentizationStepIds.length === 1 && useSopDemoStore.getState().agentizationStepModes[agentizableIds[0]] === 'automation');
useSopDemoStore.getState().toggleAgentizationStep(agentizableIds[1]);
useSopDemoStore.getState().setAgentizationStepMode(agentizableIds[1], 'assist');
check('서로 다른 단계가 독립적인 AI 참여 방식을 유지함', useSopDemoStore.getState().agentizationStepModes[agentizableIds[0]] === 'automation' && useSopDemoStore.getState().agentizationStepModes[agentizableIds[1]] === 'assist');
useSopDemoStore.getState().setAgentizationStepMode(agentizableIds[1], undefined);
check('AI 참여 방식을 미지정으로 되돌리면 키 자체가 사라짐', !(agentizableIds[1] in useSopDemoStore.getState().agentizationStepModes));
useSopDemoStore.getState().updateStep(agentizableIds[0], { title: '수정된 Agent 후보 단계' });
check('SOP 내용을 수정하면 Agent화 확정이 재검토 상태로 돌아감', useSopDemoStore.getState().agentizationConfirmedAt === null);

// Demo와 실제 SOP는 같은 두 Agent화 mode(AI_APPLICATION_MODES)와 노드별 stepModes 조회 규칙을 공유해야 한다.
check('Demo는 실제와 동일한 두 Agent화 mode를 사용함', AI_APPLICATION_MODES.map((item) => item.id).join(',') === 'automation,assist');
demoStore.resetDemo();
const sharedModeIds = getAgentizableDemoStepIds(useSopDemoStore.getState().document);
demoStore.setAgentizationScope('workflow');
demoStore.setAgentizationDefaultMode('assist');
check(
    'Demo의 노드별 조회는 실제와 동일하게 명시적 stepModes만 읽고 시작·종료는 제외함',
    sharedModeIds.every((id) => getDemoAgentizationModeForStep(useSopDemoStore.getState(), id) === 'assist')
        && getDemoAgentizationModeForStep(useSopDemoStore.getState(), 'start') === undefined
);

if (failed) process.exit(1);
console.log('ALL SOP DEMO FIXTURE TESTS PASSED');
