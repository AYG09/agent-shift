import { SAMPLE_SOP_MEMBER, SAMPLE_WORK_LIBRARY, SAMPLE_SOP_DOCUMENT } from '../src/lib/sop-sample-data';
import { SopDocument, SopSetupConfig, SopStepData, SopDisplayMode } from '../src/lib/sop-types';
import { createSopDocumentFromGeneration } from '../src/lib/sop-normalizer';
import {
    validateSopGraph,
    validateSopDecisionBranches,
    validateSopStructuralConstraints,
    findReworkEdges,
    normalizeStepShapeChange,
    validateFlowGraph,
    hasBlockingSopIssues,
    classifySopStepType,
    type SopStructuralConstraints,
    type ValidatableNode,
    type ValidatableEdge,
} from '../src/lib/graph-validation';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { buildSopNodes, buildSopEdges, syncSopCanvasNodes } from '../src/lib/sop-canvas-utils';
import { buildSopGenerationRequestBody } from '../src/lib/sop-ai-request';
import { generateSopViaApi } from '../src/lib/sop-ai-generation';
import { runSopValidationPipeline } from '../src/lib/sop-generation-pipeline';
import { getSopPrompt } from '../src/app/api/ai/route';
import { sanitizeModelId, DEFAULT_GEMINI_MODEL } from '../src/lib/gemini-models';
import { validateSopSetupConfig } from '../src/lib/sop-setup-validation';

type SopCanvasNodeData = { step: SopStepData; index: number; displayMode: SopDisplayMode };

const BASE_SETUP_CONFIG: SopSetupConfig = {
    sourceType: 'task',
    detailLevel: 'standard',
    minSteps: 2,
    maxSteps: 5,
    branchPolicy: 'auto',
    maxBranches: 2,
    allowRework: true,
};

// Test 10(파이프라인)용 permissive 제약 - 그래프 구조(repair/fallback) 검증에만 집중하고
// 구조 설정 제약(단계 수 범위 등)이 우발적으로 걸리지 않게 한다. 구조 제약 자체는 Test 12에서 별도 검증.
const PERMISSIVE_CONSTRAINTS: SopStructuralConstraints = {
    minSteps: 0,
    maxSteps: 100,
    branchPolicy: 'auto',
    maxBranches: 100,
    allowRework: true,
};

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ ASSERTION FAILED: ${message}`);
        process.exit(1);
    }
}

console.log('🧪 Running Comprehensive SOP Prototype Verification & Regression Suite...\n');

// ---------------------------------------------------------
// 0. Work Library hierarchy: one Task owns multiple Activities
// ---------------------------------------------------------
console.log('Test 0: Work Library Task → Activity → SKILL hierarchy...');
const sampleTask = SAMPLE_WORK_LIBRARY.taskCatalog.find((task) => task.id === SAMPLE_WORK_LIBRARY.taskId);
assert(!!sampleTask, 'Selected sample Task must exist in the Work Library catalog');
assert(sampleTask!.activities.length >= 4, 'A Task must contain multiple major Activities, never a single fixed Activity');
assert(sampleTask!.activities.every((activity) => activity.skills.length > 0), 'Every sample Activity must own its related SKILL data');
assert(SAMPLE_WORK_LIBRARY.skills.length >= sampleTask!.activities.length, 'Task-scope skills must be derived from the Task Activity set');
console.log('  ✅Task includes multiple editable Activities and Activity-specific SKILLs.');

// ---------------------------------------------------------
// 1. 시작·종료 노드 판정 및 방향 검증 테스트 (Item 1)
// ---------------------------------------------------------
console.log('Test 1: Start and End node strict validation...');
// End-only step -> must fail start node missing
const endOnlyIssues = validateSopGraph(
    [{ id: 's-end', shape: 'terminal', terminalType: 'end' }],
    []
);
assert(hasBlockingSopIssues(endOnlyIssues), 'End-only step graph must have blocking issues');
assert(endOnlyIssues.some((i) => i.type === 'missing-start-node'), 'Must report a dedicated missing-start-node error for end-only graph');

// Start-only step -> must fail end node missing
const startOnlyIssues = validateSopGraph(
    [{ id: 's-start', shape: 'terminal', terminalType: 'start' }],
    []
);
assert(hasBlockingSopIssues(startOnlyIssues), 'Start-only step graph must have blocking issues');
assert(startOnlyIssues.some((i) => i.type === 'missing-end-node'), 'Must report a dedicated missing-end-node error for start-only graph');

// Terminal step without terminalType -> must fail with its OWN issue type (not reused invalid-start-incoming)
const missingTerminalTypeIssues = validateSopGraph(
    [
        { id: 's1', shape: 'terminal' }, // missing terminalType!
        { id: 's2', shape: 'terminal', terminalType: 'end' },
    ],
    [{ id: 'e1', source: 's1', target: 's2' }]
);
assert(missingTerminalTypeIssues.some((i) => i.type === 'terminal-missing-type'), 'Must report a dedicated terminal-missing-type issue (not reuse invalid-start-incoming)');
assert(missingTerminalTypeIssues.some((i) => i.message.includes('terminalType')), 'Must report missing terminalType error');

// Start incoming edge -> must fail
const startIncomingIssues = validateSopGraph(
    [
        { id: 's1', shape: 'process' },
        { id: 's2', shape: 'terminal', terminalType: 'start' },
        { id: 's3', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 's1', target: 's2' }, // Edge into start node!
        { id: 'e2', source: 's2', target: 's3' },
    ]
);
assert(startIncomingIssues.some((i) => i.type === 'invalid-start-incoming'), 'Must block incoming edge to start node');

// End outgoing edge -> must fail
const endOutgoingIssues = validateSopGraph(
    [
        { id: 's1', shape: 'terminal', terminalType: 'start' },
        { id: 's2', shape: 'terminal', terminalType: 'end' },
        { id: 's3', shape: 'process' },
    ],
    [
        { id: 'e1', source: 's1', target: 's2' },
        { id: 'e2', source: 's2', target: 's3' }, // Edge out of end node!
    ]
);
assert(endOutgoingIssues.some((i) => i.type === 'invalid-end-outgoing'), 'Must block outgoing edge from end node');
console.log('  ✅ Start/End node strict validation passed.');

// 1b. terminalType 없는 terminal 응답 -> Zod 스키마 단계에서 즉시 거부 (배열 위치로 추정 안 함)
console.log('Test 1b: Terminal step missing terminalType is rejected (no index-based inference)...');
const missingTerminalTypeAiResponse = {
    title: 'terminalType 누락 테스트',
    steps: [
        { id: 't1', title: '터미널1', definition: '터미널 단계인데 terminalType이 없는 응답입니다.', shape: 'terminal' }, // no terminalType!
        { id: 't2', title: '중간 단계', definition: '중간 처리를 수행하는 일반 단계입니다.', shape: 'process' },
    ],
    edges: [{ id: 'e1', source: 't1', target: 't2' }],
};
let missingTerminalTypeThrew = false;
try {
    createSopDocumentFromGeneration({
        rawResponse: missingTerminalTypeAiResponse,
        member: SAMPLE_SOP_MEMBER,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: BASE_SETUP_CONFIG,
    });
} catch (err: unknown) {
    missingTerminalTypeThrew = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes('terminalType'), 'Schema rejection message must mention terminalType');
}
assert(missingTerminalTypeThrew, 'terminal step without terminalType must be rejected by the schema, never silently inferred');
console.log('  ✅ terminalType-less terminal step rejected at the schema layer.');

// 1c. start/end는 오직 선언된 terminalType으로만 결정된다 - 배열 순서를 뒤집어도 결과가 바뀌지 않는다
console.log('Test 1c: Start/end determined strictly by declared terminalType, never array position...');
const reversedOrderResponse = {
    title: '순서 역전 테스트',
    steps: [
        { id: 'z-end', title: '종료 단계', definition: '배열의 첫 번째 원소지만 실제로는 종료 단계입니다.', shape: 'terminal', terminalType: 'end' },
        { id: 'mid', title: '중간 단계', definition: '시작과 종료 사이의 일반 처리 단계입니다.', shape: 'process' },
        { id: 'a-start', title: '시작 단계', definition: '배열의 마지막 원소지만 실제로는 시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
    ],
    edges: [
        { id: 'e1', source: 'a-start', target: 'mid' },
        { id: 'e2', source: 'mid', target: 'z-end' },
    ],
};
const reversedDoc = createSopDocumentFromGeneration({
    rawResponse: reversedOrderResponse,
    member: SAMPLE_SOP_MEMBER,
    workLibrary: SAMPLE_WORK_LIBRARY,
    context: '',
    setupConfig: BASE_SETUP_CONFIG,
});
const zEndStep = reversedDoc.steps.find((s) => s.id === 'z-end')!;
const aStartStep = reversedDoc.steps.find((s) => s.id === 'a-start')!;
assert(zEndStep.terminalType === 'end', 'idx===0 element declared as "end" must stay "end" (no idx-based flip to start)');
assert(aStartStep.terminalType === 'start', 'Last array element declared as "start" must stay "start" (no idx-based flip to end)');
assert(zEndStep.type === 'terminal' && aStartStep.type === 'terminal', 'Normalized SopStepData.type for terminal steps must always be "terminal", never legacy "start"/"end" strings');
assert(classifySopStepType(zEndStep) === 'terminal' && classifySopStepType(aStartStep) === 'terminal', 'classifySopStepType must classify both consistently as terminal');
console.log('  ✅ Start/end come strictly from terminalType regardless of array order; normalized type is always "terminal".');

// 1d. SOP 프롬프트가 더 이상 type: 'start'/'end' 예전 지침을 담고 있지 않다
console.log("Test 1d: SOP prompt no longer instructs type: 'start'/'end' for terminal steps...");
const samplePrompt = getSopPrompt({ taskName: '신입 채용' });
assert(!samplePrompt.includes(`type: 'start'`), "Prompt must not instruct type: 'start'");
assert(!samplePrompt.includes(`type: 'end'`), "Prompt must not instruct type: 'end'");
assert(samplePrompt.includes('terminalType'), 'Prompt must explicitly reference terminalType');
console.log('  ✅ SOP prompt terminal guidance is terminalType-based.');

// ---------------------------------------------------------
// 2. SOP 전용 Blocking Issue 검증 정책 & 시작/종료 개수 테스트 (Item 2)
// ---------------------------------------------------------
console.log('Test 2: SOP Blocking Issues Policy (hasBlockingSopIssues) + start/end count enforcement...');
const orphanIssues = validateSopGraph(
    [
        { id: 's1', shape: 'terminal', terminalType: 'start' },
        { id: 's2', shape: 'process' }, // Orphan node
        { id: 's3', shape: 'terminal', terminalType: 'end' },
    ],
    [{ id: 'e1', source: 's1', target: 's3' }]
);
assert(hasBlockingSopIssues(orphanIssues) === true, 'Orphan node must be treated as a blocking issue for SOP');
console.log('  ✅ SOP blocking issues policy correctly flags structural flaws.');

// 2b. 시작 노드가 2개 -> multiple-start-nodes (missing-start-node 등 다른 타입으로 재사용하지 않음)
console.log('Test 2b: Duplicate start nodes are rejected with a dedicated issue type...');
const duplicateStartIssues = validateSopGraph(
    [
        { id: 'a', shape: 'terminal', terminalType: 'start' },
        { id: 'b', shape: 'terminal', terminalType: 'start' },
        { id: 'c', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'a', target: 'c' },
        { id: 'e2', source: 'b', target: 'c' },
    ]
);
assert(hasBlockingSopIssues(duplicateStartIssues), 'Two start nodes must be a blocking issue');
assert(duplicateStartIssues.some((i) => i.type === 'multiple-start-nodes'), 'Must report multiple-start-nodes specifically');
assert(!duplicateStartIssues.some((i) => i.type === 'missing-start-node'), 'Must NOT also report missing-start-node when a start node exists');

// 2c. 종료 노드가 2개 -> multiple-end-nodes
console.log('Test 2c: Duplicate end nodes are rejected with a dedicated issue type...');
const duplicateEndIssues = validateSopGraph(
    [
        { id: 'a', shape: 'terminal', terminalType: 'start' },
        { id: 'b', shape: 'terminal', terminalType: 'end' },
        { id: 'c', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
    ]
);
assert(hasBlockingSopIssues(duplicateEndIssues), 'Two end nodes must be a blocking issue');
assert(duplicateEndIssues.some((i) => i.type === 'multiple-end-nodes'), 'Must report multiple-end-nodes specifically');

// 2d. 시작/종료 모두 없음 -> missing-start-node + missing-end-node (기존 invalid-start-incoming 재사용 안 함)
console.log('Test 2d: Missing start/end nodes use dedicated issue types...');
const noTerminalIssues = validateSopGraph(
    [
        { id: 'a', shape: 'process' },
        { id: 'b', shape: 'process' },
    ],
    [{ id: 'e1', source: 'a', target: 'b' }]
);
assert(noTerminalIssues.some((i) => i.type === 'missing-start-node'), 'Must report missing-start-node when no start terminal exists');
assert(noTerminalIssues.some((i) => i.type === 'missing-end-node'), 'Must report missing-end-node when no end terminal exists');

// 2e. confirmFullSop()도 중복 start/end를 그래프 검증을 통해 차단한다
console.log('Test 2e: confirmFullSop() blocks documents with duplicate start/end nodes...');
useSopPrototypeStore.getState().resetStore();
useSopPrototypeStore.getState().generateFromSample();
const dupStartDoc: SopDocument = {
    ...useSopPrototypeStore.getState().document!,
    steps: [
        { id: 'dup-a', title: '시작 A', definition: '중복 시작 노드 A입니다.', shape: 'terminal', terminalType: 'start', requiredSkills: [], position: { x: 0, y: 0 }, reviewStatus: 'reviewed' },
        { id: 'dup-b', title: '시작 B', definition: '중복 시작 노드 B입니다.', shape: 'terminal', terminalType: 'start', requiredSkills: [], position: { x: 100, y: 0 }, reviewStatus: 'reviewed' },
        { id: 'dup-c', title: '종료', definition: '유일한 종료 노드입니다.', shape: 'terminal', terminalType: 'end', requiredSkills: [], position: { x: 200, y: 0 }, reviewStatus: 'reviewed' },
    ],
    edges: [
        { id: 'de1', source: 'dup-a', target: 'dup-c' },
        { id: 'de2', source: 'dup-b', target: 'dup-c' },
    ],
};
useSopPrototypeStore.getState().setDocument(dupStartDoc);
const dupConfirmRes = useSopPrototypeStore.getState().confirmFullSop();
assert(dupConfirmRes.success === false, 'confirmFullSop() must fail for a document with duplicate start nodes');
assert(dupConfirmRes.errors.some((e) => e.includes('시작 노드는 정확히 1개')), 'confirmFullSop() error must explain the duplicate start node problem');
console.log('  ✅ Start/end count enforcement (missing/duplicate) verified at both graph-validation and store confirmation levels.');

// ---------------------------------------------------------
// 3. 의미 있는 모든 편집 시 상태 무효화 테스트 (Item 3)
// ---------------------------------------------------------
console.log('Test 3: Review status invalidation on ALL meaningful edits...');
useSopPrototypeStore.getState().resetStore();
useSopPrototypeStore.getState().generateFromSample();
const store = useSopPrototypeStore.getState();

// Helper to set all steps to reviewed and confirm SOP
const docForConfirm: SopDocument = {
    ...store.document!,
    steps: store.document!.steps.map((s) => ({
        ...s,
        reviewStatus: 'reviewed' as const,
        requiredSkills: s.requiredSkills.map((sk) => ({ ...sk, accepted: true })),
    })),
};
store.setDocument(docForConfirm);
const confirmRes = store.confirmFullSop();
assert(confirmRes.success === true, 'Full SOP confirmation must succeed');
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'confirmed', 'Doc must be confirmed');

// 3.1 Step title edit -> step & document both revert to ai-draft
const step1Id = store.document!.steps[0].id;
store.updateStep(step1Id, { title: '새 단계 제목' });
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'ai-draft', 'Doc must revert to ai-draft on step title edit');
assert(useSopPrototypeStore.getState().document!.steps[0].reviewStatus === 'ai-draft', 'Step must revert to ai-draft on title edit');

// 3.2 Reset & Confirm again to test Document Title edit
store.setDocument(docForConfirm);
store.confirmFullSop();
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'confirmed', 'Confirmed again');
store.updateDocumentTitle('수정된 SOP 문서 제목');
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'ai-draft', 'Doc title edit must revert doc to ai-draft');

// 3.3 Reset & Confirm again to test Step Deletion
// (a non-terminal step - deleting the start/end terminal itself is now blocked by design, see Test B2)
store.setDocument(docForConfirm);
store.confirmFullSop();
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'confirmed', 'Confirmed again');
const nonTerminalStepId = store.document!.steps.find((s) => !s.terminalType)!.id;
const deleteRes33 = store.deleteStep(nonTerminalStepId);
assert(deleteRes33.success === true, 'Deleting a non-terminal step must succeed');
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'ai-draft', 'Step deletion must revert doc to ai-draft');

// 3.4 Reset & Confirm again to test Edge Edit
store.setDocument(docForConfirm);
store.confirmFullSop();
const edge1Id = store.document!.edges[0].id;
store.updateEdge(edge1Id, { label: '수정된 연결선 라벨' });
assert(useSopPrototypeStore.getState().document!.reviewStatus === 'ai-draft', 'Edge edit must revert doc to ai-draft');

// 3.5 Test Work Library edit resets confirmed flag
store.confirmWorkLibrary();
assert(useSopPrototypeStore.getState().workLibrary.confirmed === true, 'Work Library confirmed');
store.setWorkLibrary({ taskName: '수정된 업무 Task' });
assert(useSopPrototypeStore.getState().workLibrary.confirmed === false, 'Work Library edit must reset confirmed to false');
console.log('  ✅ All meaningful edits correctly invalidate review and confirmation status.');

// ---------------------------------------------------------
// 3.6 AI Agent화 검토는 전체/선택 단계와 확정 상태를 문서에 보존한다.
// ---------------------------------------------------------
console.log('Test 3.6: agentization review selection and confirmation...');
store.generateFromSample();
const agentizableStepIds = useSopPrototypeStore.getState().document!.steps
    .filter((step) => step.terminalType !== 'start' && step.terminalType !== 'end')
    .map((step) => step.id);
store.setAgentizationScope('workflow');
store.setAgentizationDefaultMode('human-review');
const workflowAgentization = store.confirmAgentization();
assert(workflowAgentization.success === true, 'Workflow-wide agentization review must be confirmable');
assert(useSopPrototypeStore.getState().document!.agentizationReview?.stepIds.length === agentizableStepIds.length, 'Workflow review must include every non-terminal step');
assert(agentizableStepIds.every((id) => useSopPrototypeStore.getState().document!.agentizationReview?.stepModes[id] === 'human-review'), 'The batch default must be stored for every selected workflow step');
assert(Boolean(useSopPrototypeStore.getState().document!.agentizationReview?.confirmedAt), 'Agentization review must record confirmation time');
store.setAgentizationScope('steps');
assert(useSopPrototypeStore.getState().document!.agentizationReview?.stepIds.length === 0, 'Switching to selected steps must require an explicit step choice');
store.toggleAgentizationStep(agentizableStepIds[0]);
store.setAgentizationStepMode(agentizableStepIds[0], 'automation');
assert(useSopPrototypeStore.getState().document!.agentizationReview?.stepModes[agentizableStepIds[0]] === 'automation', 'A selected step must support its own AI application mode');
store.toggleAgentizationStep(agentizableStepIds[1]);
store.setAgentizationStepMode(agentizableStepIds[1], 'collaboration');
assert(useSopPrototypeStore.getState().document!.agentizationReview?.stepModes[agentizableStepIds[1]] === 'collaboration', 'Different selected steps must retain independent AI application modes');
const stepAgentization = store.confirmAgentization();
assert(stepAgentization.success === true, 'Selected-step agentization review must be confirmable');
store.updateStep(agentizableStepIds[0], { title: '수정된 Agent화 후보 단계' });
assert(!useSopPrototypeStore.getState().document!.agentizationReview?.confirmedAt, 'A meaningful step edit must return agentization confirmation to review');
console.log('  ✅ Workflow/step agentization review preserves selections and requires re-review after content edits.');

// ---------------------------------------------------------
// 4. 단계별 UI에서 confirmed 직접 설정 금지 테스트 (Item 4)
// ---------------------------------------------------------
console.log('Test 4: Step UI direct confirmed setting bypass prevention...');
store.generateFromSample();
const targetStepId = store.document!.steps[0].id;

// Attempt to pass 'confirmed' directly to updateStepReviewStatus
store.updateStepReviewStatus(targetStepId, 'confirmed');
const stepAfterBypassAttempt = useSopPrototypeStore.getState().document!.steps[0];
assert(stepAfterBypassAttempt.reviewStatus !== 'confirmed', 'updateStepReviewStatus must NOT allow setting confirmed directly');
assert(stepAfterBypassAttempt.reviewStatus === 'reviewed', 'updateStepReviewStatus clamps confirmed to reviewed');
assert(useSopPrototypeStore.getState().document!.reviewStatus !== 'confirmed', 'Document reviewStatus must NOT become confirmed via step UI');
console.log('  ✅ Step UI bypass prevention verified.');

// ---------------------------------------------------------
// 5. AI 응답 Zod 검증 우회 제거 테스트 (Item 5)
// ---------------------------------------------------------
console.log('Test 5: Zod validation error throwing (NO raw object fallback)...');
const invalidAiResponseBadShape = {
    title: '유효하지 않은 SOP',
    steps: [
        { id: 's1', title: '단계 1', definition: '짧음', shape: 'not-a-valid-shape' },
    ],
    edges: [],
};

let didThrowError = false;
try {
    createSopDocumentFromGeneration({
        rawResponse: invalidAiResponseBadShape,
        member: SAMPLE_SOP_MEMBER,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: { sourceType: 'task', detailLevel: 'standard', minSteps: 2, maxSteps: 5, branchPolicy: 'auto', maxBranches: 2, allowRework: true },
    });
} catch (err: unknown) {
    didThrowError = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes('AI SOP 응답 형식이 유효하지 않습니다'), 'Error message must specify Zod format issue');
}
assert(didThrowError === true, 'Must throw error on invalid Zod schema input');
console.log('  ✅ Zod schema validation strictly throws error on malformed AI response.');

// ---------------------------------------------------------
// 6. AI 설정을 SOP 생성 요청에 전달 테스트 (Item 6)
// ---------------------------------------------------------
console.log('Test 6: Connecting model, reasoning, and apiKey to SOP request body (with sanitization)...');
const baseRequestParams = {
    memberRole: '채용담당자',
    taskName: '신입 채용',
    skills: [] as Array<{ id?: string; name: string; description?: string }>,
    context: '맥락',
    detailLevel: 'standard',
    minSteps: 6,
    maxSteps: 8,
    branchPolicy: 'auto',
    maxBranches: 2,
    allowRework: true,
};

// 6a. 유효한 model/reasoning('high')은 그대로 전달된다
const requestBody = buildSopGenerationRequestBody({
    ...baseRequestParams,
    apiKey: 'test-api-key-12345',
    model: 'gemini-3.6-flash',
    reasoning: 'high',
});
assert(requestBody.apiKey === 'test-api-key-12345', 'apiKey must be included in request body');
assert(requestBody.model === 'gemini-3.6-flash', 'model must be included in request body');
assert(requestBody.reasoning === 'high', "valid reasoning level 'high' must be passed through unchanged");

const taskScopeActivities = [
    { name: '채용 요청 검토', description: '요청과 직무 요건을 확정합니다.', skills: [{ name: '직무 요건 정의' }] },
    { name: '후보자 소싱', description: '후보자 풀을 구축합니다.', skills: [{ name: '후보자 소싱' }] },
];
const taskScopeRequest = buildSopGenerationRequestBody({ ...baseRequestParams, activities: taskScopeActivities });
assert(taskScopeRequest.activities?.length === 2, 'Task-scope request must preserve every selected Activity, not just one activity name');
const taskScopePrompt = getSopPrompt({ taskName: '채용 운영', activities: taskScopeActivities });
assert(taskScopePrompt.includes('Task 전체 (2개 주요 Activity)'), 'Task-scope prompt must explicitly identify the full Task scope');
assert(taskScopePrompt.includes('채용 요청 검토') && taskScopePrompt.includes('후보자 소싱'), 'Task-scope prompt must include every selected Activity');

// 6b. reasoning='default'는 그대로 'default'로 처리된다 (필드 자체는 항상 포함)
const requestBodyDefault = buildSopGenerationRequestBody({ ...baseRequestParams, reasoning: 'default' });
assert(requestBodyDefault.reasoning === 'default', "reasoning='default' must be handled correctly, not dropped or mangled");

// 6c. UI 구버전 기본값('standard')이나 스키마에 없는 임의 문자열('detailed', 'garbage')은
//     그대로 서버에 전송되지 않고 반드시 'default'로 정규화된다 (더 이상 서버가 조용히
//     'standard'/'detailed'를 'default'로 바꿔치기하는 것에 클라이언트가 무지하지 않다)
const requestBodyStandard = buildSopGenerationRequestBody({ ...baseRequestParams, reasoning: 'standard' });
assert(requestBodyStandard.reasoning === 'default', "invalid legacy value 'standard' must be sanitized to 'default', never sent raw");
const requestBodyDetailed = buildSopGenerationRequestBody({ ...baseRequestParams, reasoning: 'detailed' });
assert(requestBodyDetailed.reasoning === 'default', "invalid legacy value 'detailed' must be sanitized to 'default', never sent raw");
const requestBodyGarbage = buildSopGenerationRequestBody({ ...baseRequestParams, reasoning: 'not-a-real-level' });
assert(requestBodyGarbage.reasoning === 'default', 'arbitrary invalid reasoning strings must be sanitized to default');

// 6d. reasoning 미지정(null/undefined) -> 'default'
const requestBodyNoReasoning = buildSopGenerationRequestBody({ ...baseRequestParams, reasoning: null });
assert(requestBodyNoReasoning.reasoning === 'default', 'missing reasoning must default to "default"');

// 6e. apiKey를 안 주면 body에 아예 포함되지 않는다 (BYOK 원칙 - 빈 값을 서버로 보내지 않음)
const requestBodyNoKey = buildSopGenerationRequestBody({ ...baseRequestParams, reasoning: 'high' });
assert(!('apiKey' in requestBodyNoKey), 'apiKey must be omitted from body when not provided');
console.log('  ✅ Selected AI model/reasoning/API key are sanitized and built into the request body; invalid values never pass through raw.');

// ---------------------------------------------------------
// 7. Real Store -> Canvas Integration Node & Edge Mapping Tests (Item 7)
// ---------------------------------------------------------
console.log('Test 7: Real Store -> Canvas Node and Edge Mapping Integration Tests...');
store.generateFromSample();
const currentDoc = store.document!;

// 7.1 Store step title edit updates Canvas node data
const initialNodes = buildSopNodes(currentDoc, null);
assert(initialNodes.length > 0, 'Initial nodes built from store document');
store.updateStep(currentDoc.steps[0].id, { title: '캔버스 연동 테스트 제목' });
const updatedNodes = buildSopNodes(useSopPrototypeStore.getState().document!, null);
assert((updatedNodes[0].data as SopCanvasNodeData).step.title === '캔버스 연동 테스트 제목', 'Canvas node data title must update');

// 7.2 Step addition updates Canvas node list
const origNodeCount = updatedNodes.length;
store.addStep({
    id: 's-canvas-new',
    title: '새 캔버스 노드',
    definition: '정의',
    shape: 'process',
    position: { x: 300, y: 300 },
    requiredSkills: [],
    reviewStatus: 'ai-draft',
});
const nodesAfterAdd = buildSopNodes(useSopPrototypeStore.getState().document!, null);
assert(nodesAfterAdd.length === origNodeCount + 1, 'Canvas node count must increase');

// 7.3 Edge modification updates Canvas edge list
const initialEdges = buildSopEdges(useSopPrototypeStore.getState().document!, null);
assert(initialEdges.length > 0, 'Initial edges built from store document');
const firstEdgeId = useSopPrototypeStore.getState().document!.edges[0].id;
store.updateEdge(firstEdgeId, { label: '캔버스 연결선' });
const edgesAfterEdit = buildSopEdges(useSopPrototypeStore.getState().document!, null);
assert(edgesAfterEdit[0].label === '캔버스 연결선', 'Canvas edge label must update');

// 7.4 Canvas nodes always use the compact workflow display
const compactNodes = buildSopNodes(useSopPrototypeStore.getState().document!, null);
assert((compactNodes[0].data as SopCanvasNodeData).displayMode === 'compact', 'SOP canvas must always use the compact workflow display');

// 7.5 Undo reflects in document & node list
store.undo();
const nodesAfterUndo = buildSopNodes(useSopPrototypeStore.getState().document!, null);
assert(nodesAfterUndo.length === nodesAfterAdd.length, 'Undo reflects previous document nodes');
console.log('  ✅ Store -> Canvas real node/edge mapping integration tests passed.');

// 7.6 syncSopCanvasNodes: this is the EXACT function SopCanvas's useEffect calls to merge
// store updates into React Flow state. Testing buildSopNodes() alone (as before) never exercised
// the drag-position-preserving merge logic that only lives inside this function.
console.log('Test 7.6: syncSopCanvasNodes preserves dragging node position and reflects selection changes...');
const docForSync = useSopPrototypeStore.getState().document!;
const draggedNodeId = docForSync.steps[0].id;
const prevNodesWithDrag = buildSopNodes(docForSync, null).map((n) =>
    n.id === draggedNodeId ? { ...n, dragging: true, position: { x: 9999, y: 9999 } } : n
);
const syncedNodes = syncSopCanvasNodes(docForSync, null, prevNodesWithDrag);
const draggedSynced = syncedNodes.find((n) => n.id === draggedNodeId)!;
assert(
    draggedSynced.position.x === 9999 && draggedSynced.position.y === 9999,
    'A node currently being dragged must keep its live drag position, not snap back to the store position'
);

const otherStepId = docForSync.steps[1]?.id;
if (otherStepId) {
    const otherSynced = syncedNodes.find((n) => n.id === otherStepId)!;
    const otherStoreStep = docForSync.steps.find((s) => s.id === otherStepId)!;
    assert(
        otherSynced.position.x === (otherStoreStep.position?.x ?? otherSynced.position.x),
        'A non-dragging node must follow the current store position'
    );
}

const syncedWithSelection = syncSopCanvasNodes(docForSync, draggedNodeId, []);
assert(syncedWithSelection.find((n) => n.id === draggedNodeId)!.selected === true, 'Selected step id must mark the matching node as selected');
assert(
    syncedWithSelection.filter((n) => n.id !== draggedNodeId).every((n) => !n.selected),
    'Non-selected nodes must not be marked selected'
);
console.log('  ✅ syncSopCanvasNodes (the exact function SopCanvas useEffect uses) preserves drag state and reflects selection.');

// 7.7 buildSopEdges preserves explicit sourceHandle/targetHandle set via store actions (no silent override)
console.log('Test 7.7: Edge sourceHandle/targetHandle set via store are preserved on the canvas...');
const edgeToHandle = useSopPrototypeStore.getState().document!.edges[0];
useSopPrototypeStore.getState().updateEdge(edgeToHandle.id, { sourceHandle: 'right', targetHandle: 'left-target' });
const edgesWithHandles = buildSopEdges(useSopPrototypeStore.getState().document!, null);
const updatedHandleEdge = edgesWithHandles.find((e) => e.id === edgeToHandle.id)!;
assert(updatedHandleEdge.sourceHandle === 'right', 'Explicit sourceHandle set on an edge must be preserved by buildSopEdges');
assert(updatedHandleEdge.targetHandle === 'left-target', 'Explicit targetHandle set on an edge must be preserved by buildSopEdges');
console.log('  ✅ Explicit edge handle IDs survive the store -> canvas edge mapping.');

// 7.8 자동 연결선은 저장된 과거 bottom/top 기본값보다 실제 노드 중심 좌표를 우선한다.
// 수평 노드인데도 위·아래로 크게 우회하던 워크스페이스 회귀를 막는다.
console.log('Test 7.8: SOP canvas edges use coordinate-aware shortest handles and smooth routing...');
const coordinateRouteDoc = {
    ...SAMPLE_SOP_DOCUMENT,
    displayMode: 'standard' as const,
    steps: [
        { ...SAMPLE_SOP_DOCUMENT.steps[0], id: 'route-left', position: { x: 100, y: 200 } },
        { ...SAMPLE_SOP_DOCUMENT.steps[1], id: 'route-right', position: { x: 620, y: 200 } },
        { ...SAMPLE_SOP_DOCUMENT.steps[2], id: 'route-down', position: { x: 620, y: 520 } },
    ],
    edges: [
        // 기존 AI가 저장한 bottom/top 기본값은 수평 좌표에 맞춰 right/left로 재계산되어야 한다.
        { id: 'route-horizontal', source: 'route-left', target: 'route-right', sourceHandle: 'bottom', targetHandle: 'top-target' },
        { id: 'route-vertical', source: 'route-right', target: 'route-down' },
    ],
};
const coordinateRoutes = buildSopEdges(coordinateRouteDoc, null);
const horizontalRoute = coordinateRoutes.find((edge) => edge.id === 'route-horizontal')!;
const verticalRoute = coordinateRoutes.find((edge) => edge.id === 'route-vertical')!;
assert(horizontalRoute.sourceHandle === 'right' && horizontalRoute.targetHandle === 'left-target', 'horizontal SOP nodes must use right -> left handles even when legacy bottom/top defaults exist');
assert(verticalRoute.sourceHandle === 'bottom' && verticalRoute.targetHandle === 'top-target', 'vertical SOP nodes must use bottom -> top handles');
assert(horizontalRoute.type === 'smoothstep' && verticalRoute.type === 'smoothstep', 'SOP edges must use obstacle-friendly orthogonal smoothstep routing');
console.log('  ✅ Coordinate-aware shortest handles and smoothstep routing are applied to SOP canvas edges.');

// ---------------------------------------------------------
// 8. 명시적 좌표 보존 및 중첩 시 자동 배치 테스트 (Item 8)
// ---------------------------------------------------------
console.log('Test 8: Preserving explicit AI coordinates vs layout for overlap...');
const validAiResponseWithPositions = {
    title: '좌표 보존 테스트',
    steps: [
        { id: 's1', title: '단계 1', definition: '단계 1의 상세 수행 정의입니다.', shape: 'terminal', terminalType: 'start', position: { x: 150, y: 200 } },
        { id: 's2', title: '단계 2', definition: '단계 2의 상세 수행 정의입니다.', shape: 'terminal', terminalType: 'end', position: { x: 450, y: 200 } },
    ],
    edges: [{ id: 'e1', source: 's1', target: 's2' }],
};

const preservedDoc = createSopDocumentFromGeneration({
    rawResponse: validAiResponseWithPositions,
    member: SAMPLE_SOP_MEMBER,
    workLibrary: SAMPLE_WORK_LIBRARY,
    context: '',
    setupConfig: { sourceType: 'task', detailLevel: 'standard', minSteps: 2, maxSteps: 5, branchPolicy: 'auto', maxBranches: 2, allowRework: true },
});

assert(preservedDoc.steps[0].position.x !== 150 || preservedDoc.steps[0].position.y !== 200, 'AI coordinates must not be trusted as final canvas geometry');
assert(new Set(preservedDoc.steps.map((step) => `${step.position.x}:${step.position.y}`)).size === preservedDoc.steps.length, 'Normalized layout must not overlap nodes');
assert(preservedDoc.edges[0].sourceHandle === 'right' && preservedDoc.edges[0].targetHandle === 'left-target', 'Normalized layout must assign the shortest visible connection handles');
const multiRowLayoutDoc = createSopDocumentFromGeneration({
    rawResponse: { ...SAMPLE_SOP_DOCUMENT, steps: SAMPLE_SOP_DOCUMENT.steps, edges: SAMPLE_SOP_DOCUMENT.edges },
    member: SAMPLE_SOP_MEMBER,
    workLibrary: SAMPLE_WORK_LIBRARY,
    context: '',
    setupConfig: { sourceType: 'task', detailLevel: 'standard', minSteps: 2, maxSteps: 16, branchPolicy: 'auto', maxBranches: 3, allowRework: true },
});
assert(new Set(multiRowLayoutDoc.steps.map((step) => step.position.y)).size >= 3, 'Long generated SOPs must use multiple rows instead of one long line');
const routedReworkEdges = buildSopEdges(multiRowLayoutDoc, null).filter((edge) => edge.type === 'sopRework');
assert(routedReworkEdges.length >= 2, 'Loop-closing NO/condition branches must use dedicated rework routes');
assert(
    routedReworkEdges.every((edge) => {
        const route = edge.data?.reworkRoute as { points?: Array<{ x: number; y: number }> } | undefined;
        return ['top', 'right', 'bottom', 'left'].includes(edge.sourceHandle || '') &&
            ['top-target', 'right-target', 'bottom-target', 'left-target'].includes(edge.targetHandle || '') &&
            (route?.points?.length || 0) >= 4;
    }),
    'Rework routes must join visible connection points with an explicit multi-segment route'
);
const sampleRoutesById = new Map(
    routedReworkEdges.map((edge) => [
        edge.id,
        (edge.data?.reworkRoute as { points: Array<{ x: number; y: number }> }).points,
    ])
);
const sampleStepById = new Map(multiRowLayoutDoc.steps.map((step) => [step.id, step]));
const routeMaxY = (id: string) => Math.max(...sampleRoutesById.get(id)!.map((point) => point.y));
const routeMinY = (id: string) => Math.min(...sampleRoutesById.get(id)!.map((point) => point.y));
const routeMaxX = (id: string) => Math.max(...sampleRoutesById.get(id)!.map((point) => point.x));
assert(
    routeMinY('e5-3-rework') < Math.min(sampleStepById.get('step-5')!.position.y, sampleStepById.get('step-3')!.position.y) &&
        routeMaxX('e5-3-rework') > sampleStepById.get('step-5')!.position.x + 190,
    'A return from the right side of an upper row must use one clean top/right rail, not cross the primary flow'
);
assert(
    routeMinY('e8-6-rework') < sampleStepById.get('step-8')!.position.y &&
        routeMinY('e8-6-rework') > sampleStepById.get('step-3')!.position.y + 74,
    'A same-row return to the right must use the nearby inter-row channel, not the canvas perimeter'
);
assert(
    routeMaxY('e10-9-loop') <= sampleStepById.get('step-10')!.position.y + 74 + 72 &&
        routeMaxY('e10-6-fallback') < sampleStepById.get('step-10')!.position.y + 74,
    'Lower-row rework paths must stay in their local lower or inter-row channels instead of stacking on one outer lane'
);
const manualReworkId = routedReworkEdges[0].id;
const manuallyRoutedDoc = {
    ...multiRowLayoutDoc,
    edges: multiRowLayoutDoc.edges.map((edge) =>
        edge.id === manualReworkId
            ? { ...edge, sourceHandle: 'bottom', targetHandle: 'bottom-target', manualRouting: true }
            : edge
    ),
};
const manuallyRoutedCanvasEdge = buildSopEdges(manuallyRoutedDoc, null).find((edge) => edge.id === manualReworkId)!;
assert(
    manuallyRoutedCanvasEdge.type === 'smoothstep' && manuallyRoutedCanvasEdge.sourceHandle === 'bottom' && manuallyRoutedCanvasEdge.targetHandle === 'bottom-target',
    'A member-selected connection point must never be replaced by automatic rework routing'
);
console.log('  ✅ AI coordinates are replaced with a collision-free multi-row layout and rework loops use dedicated outer lanes.');

// ---------------------------------------------------------
// 9(구). SAMPLE_SOP_DOCUMENT 회귀: 새 decision 분기 검증 규칙 아래서도 여전히 완전히 유효하다.
// (step-10은 yes 1개 + condition 1개 + no 1개인 실제 3갈래 재작업 패턴 - 새 규칙이 이를 깨지 않는지 직접 확인)
// ---------------------------------------------------------
console.log('Test 9(prep): SAMPLE_SOP_DOCUMENT remains fully valid under the new decision-branch rules...');
const sampleGraphIssues = validateSopGraph(SAMPLE_SOP_DOCUMENT.steps, SAMPLE_SOP_DOCUMENT.edges);
assert(sampleGraphIssues.length === 0, `SAMPLE_SOP_DOCUMENT must have zero validation issues (found: ${JSON.stringify(sampleGraphIssues)})`);
console.log('  ✅ SAMPLE_SOP_DOCUMENT (including its yes/condition/no 3-way rework branch at step-10) still validates cleanly.');

// ---------------------------------------------------------
// 11. YES/NO 이진 판단과 다중 condition 분기 검증 분리 테스트
// ---------------------------------------------------------
console.log('Test 11: Binary YES/NO vs multi-condition decision branch validation...');

function decisionNodes(ids: string[]): ValidatableNode[] {
    return ids.map((id) => ({ id, type: id === 'd' ? 'decision' : 'process' }));
}

// 11a. 정상 YES/NO 2분기 -> 통과
const validBinary = validateSopDecisionBranches(decisionNodes(['d', 'a', 'b']), [
    { source: 'd', target: 'a', branchType: 'yes', label: 'YES' },
    { source: 'd', target: 'b', branchType: 'no', label: 'NO' },
]);
assert(validBinary.length === 0, '정상 YES/NO 2분기는 통과해야 합니다 (found: ' + JSON.stringify(validBinary) + ')');

// 11b. 정상 condition 2분기 -> 통과 (이전 버그: decision-missing-yes-no로 잘못 거부됨)
const validCondition2 = validateSopDecisionBranches(decisionNodes(['d', 'a', 'b']), [
    { source: 'd', target: 'a', branchType: 'condition', label: '조건A', condition: '금액 100만원 이상' },
    { source: 'd', target: 'b', branchType: 'condition', label: '조건B', condition: '금액 100만원 미만' },
]);
assert(validCondition2.length === 0, '정상 condition 2분기는 통과해야 합니다 (found: ' + JSON.stringify(validCondition2) + ')');

// 11c. 정상 condition 3분기 -> 통과
const validCondition3 = validateSopDecisionBranches(decisionNodes(['d', 'a', 'b', 'c']), [
    { source: 'd', target: 'a', branchType: 'condition', label: '조건A', condition: '금액 100만원 이상' },
    { source: 'd', target: 'b', branchType: 'condition', label: '조건B', condition: '금액 10~100만원' },
    { source: 'd', target: 'c', branchType: 'condition', label: '조건C', condition: '금액 10만원 미만' },
]);
assert(validCondition3.length === 0, '정상 condition 3분기는 통과해야 합니다 (found: ' + JSON.stringify(validCondition3) + ')');

// 11d. 라벨·branchType 없는 3분기 -> 실패 (이전 버그: []로 통과됨)
const untypedTriple = validateSopDecisionBranches(decisionNodes(['d', 'a', 'b', 'c']), [
    { source: 'd', target: 'a' },
    { source: 'd', target: 'b' },
    { source: 'd', target: 'c' },
]);
assert(hasBlockingSopIssues(untypedTriple), '라벨·branchType 없는 3분기는 실패해야 합니다');
assert(untypedTriple.some((i) => i.type === 'decision-untyped-branch'), 'branchType 미지정은 decision-untyped-branch로 보고되어야 합니다');

// 11e. condition 설명(label/condition) 누락 -> 실패
const missingConditionDetail = validateSopDecisionBranches(decisionNodes(['d', 'a', 'b']), [
    { source: 'd', target: 'a', branchType: 'condition', label: '조건A' /* condition 누락 */ },
    { source: 'd', target: 'b', branchType: 'condition', label: '조건B', condition: '금액 미달' },
]);
assert(missingConditionDetail.some((i) => i.type === 'decision-condition-missing'), 'condition 설명 누락은 decision-condition-missing으로 실패해야 합니다');

// 11f. 동일 target으로 향하는 분기 -> 실패
const sameTargetBranch = validateSopDecisionBranches(decisionNodes(['d', 'a']), [
    { source: 'd', target: 'a', branchType: 'yes', label: 'YES' },
    { source: 'd', target: 'a', branchType: 'no', label: 'NO' },
]);
assert(hasBlockingSopIssues(sameTargetBranch), '동일 target으로 향하는 분기는 실패해야 합니다');
assert(sameTargetBranch.some((i) => i.type === 'decision-insufficient-edges'), '동일 target 중복 분기는 decision-insufficient-edges로 보고되어야 합니다');

// 11g. YES/NO와 조건부 재시도가 섞인 실제 3갈래(샘플 step-10 패턴)는 여전히 유효해야 한다
const mixedRealistic = validateSopDecisionBranches(decisionNodes(['d', 'accept', 'retry', 'reject']), [
    { source: 'd', target: 'accept', branchType: 'yes', label: '수락' },
    { source: 'd', target: 'retry', branchType: 'condition', label: '조건부 재협의', condition: '최대 2회 재시도' },
    { source: 'd', target: 'reject', branchType: 'no', label: '최종 거절' },
]);
assert(mixedRealistic.length === 0, '수락(yes)/조건부 재시도(condition)/최종 거절(no) 3갈래는 유효해야 합니다 (found: ' + JSON.stringify(mixedRealistic) + ')');

// 11h. YES가 2개(중복) -> 실패
const duplicateYes = validateSopDecisionBranches(decisionNodes(['d', 'a', 'b', 'c']), [
    { source: 'd', target: 'a', branchType: 'yes', label: 'YES' },
    { source: 'd', target: 'b', branchType: 'yes', label: 'YES' },
    { source: 'd', target: 'c', branchType: 'condition', label: '조건', condition: '기타' },
]);
assert(duplicateYes.some((i) => i.type === 'decision-duplicate-branch-type'), 'YES가 2개 이상이면 decision-duplicate-branch-type으로 실패해야 합니다');
console.log('  ✅ Binary YES/NO and multi-condition decision branches are validated correctly and independently.');

// ---------------------------------------------------------
// 12. 워크플로우 구조 설정(minSteps/maxSteps/maxTotalNodes/branchPolicy/maxBranches/allowRework/maxLoops) 검증
// ---------------------------------------------------------
console.log('Test 12: Structural constraints (step count, node cap, branch policy, rework loops)...');

const threeMajorSteps = [
    { id: 'start', shape: 'terminal', terminalType: 'start' as const },
    { id: 's1', shape: 'process' },
    { id: 's2', shape: 'process' },
    { id: 's3', shape: 'process' },
    { id: 'end', shape: 'terminal', terminalType: 'end' as const },
];

// 12a. 주요 단계 수가 범위를 벗어나면 실패
const outOfRangeIssues = validateSopStructuralConstraints(threeMajorSteps, [], {
    minSteps: 5,
    maxSteps: 8,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
});
assert(outOfRangeIssues.some((i) => i.type === 'step-count-out-of-range'), '주요 단계 수(3개)가 minSteps(5) 미만이면 step-count-out-of-range로 실패해야 합니다');

// 주요 단계 수가 범위 안이면 통과
const inRangeIssues = validateSopStructuralConstraints(threeMajorSteps, [], {
    minSteps: 2,
    maxSteps: 5,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
});
assert(!inRangeIssues.some((i) => i.type === 'step-count-out-of-range'), '주요 단계 수가 범위 안이면 통과해야 합니다');

// 12b. 전체 노드 상한 초과 -> 실패
const totalNodeIssues = validateSopStructuralConstraints(threeMajorSteps, [], {
    minSteps: 0,
    maxSteps: 10,
    maxTotalNodes: 3,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
});
assert(totalNodeIssues.some((i) => i.type === 'total-node-limit-exceeded'), `전체 노드 수(5개)가 maxTotalNodes(3)를 초과하면 실패해야 합니다`);

// 12c. branchPolicy='none' + decision 존재 -> 실패
const stepsWithDecision = [
    { id: 'start', shape: 'terminal', terminalType: 'start' as const },
    { id: 'd', shape: 'decision' },
    { id: 'end', shape: 'terminal', terminalType: 'end' as const },
];
const noneWithDecisionIssues = validateSopStructuralConstraints(stepsWithDecision, [], {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'none',
    maxBranches: 5,
    allowRework: true,
});
assert(noneWithDecisionIssues.some((i) => i.type === 'decision-not-allowed'), "branchPolicy='none'인데 decision이 있으면 실패해야 합니다");

// branchPolicy='none' + decision 없음 -> 통과
const noneWithoutDecisionIssues = validateSopStructuralConstraints(threeMajorSteps, [], {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'none',
    maxBranches: 5,
    allowRework: true,
});
assert(!noneWithoutDecisionIssues.some((i) => i.type === 'decision-not-allowed'), "branchPolicy='none'이고 decision이 없으면 통과해야 합니다");

// 12d. branchPolicy='max' + decision 상한 초과 -> 실패
const stepsWithThreeDecisions = [
    { id: 'start', shape: 'terminal', terminalType: 'start' as const },
    { id: 'd1', shape: 'decision' },
    { id: 'd2', shape: 'decision' },
    { id: 'd3', shape: 'decision' },
    { id: 'end', shape: 'terminal', terminalType: 'end' as const },
];
const maxExceededIssues = validateSopStructuralConstraints(stepsWithThreeDecisions, [], {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'max',
    maxBranches: 2,
    allowRework: true,
});
assert(maxExceededIssues.some((i) => i.type === 'decision-limit-exceeded'), 'decision 3개가 maxBranches(2)를 초과하면 decision-limit-exceeded로 실패해야 합니다');

// branchPolicy='max' + decision 수가 상한 이하 -> 통과
const maxWithinLimitIssues = validateSopStructuralConstraints(stepsWithDecision, [], {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'max',
    maxBranches: 2,
    allowRework: true,
});
assert(!maxWithinLimitIssues.some((i) => i.type === 'decision-limit-exceeded'), 'decision 수가 상한 이하이면 통과해야 합니다');

// 12e. allowRework=false + cycle 존재 -> 실패
const stepsForCycle = [
    { id: 'start', shape: 'terminal', terminalType: 'start' as const },
    { id: 'a', shape: 'process' },
    { id: 'b', shape: 'process' },
    { id: 'end', shape: 'terminal', terminalType: 'end' as const },
];
const edgesWithCycle = [
    { source: 'start', target: 'a' },
    { source: 'a', target: 'b' },
    { source: 'b', target: 'a' }, // 되돌아가는 재작업 경로
    { source: 'b', target: 'end' },
];
const reworkNotAllowedIssues = validateSopStructuralConstraints(stepsForCycle, edgesWithCycle, {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: false,
});
assert(reworkNotAllowedIssues.some((i) => i.type === 'rework-not-allowed'), 'allowRework=false인데 순환 경로가 있으면 rework-not-allowed로 실패해야 합니다');

// allowRework=false + cycle 없음 -> 통과
const noCycleIssues = validateSopStructuralConstraints(threeMajorSteps, [], {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: false,
});
assert(!noCycleIssues.some((i) => i.type === 'rework-not-allowed'), 'allowRework=false여도 순환이 없으면 통과해야 합니다');

// 12f. maxLoops 초과 -> 실패
const stepsForTwoCycles = [
    { id: 'start', shape: 'terminal', terminalType: 'start' as const },
    { id: 'a', shape: 'process' },
    { id: 'b', shape: 'process' },
    { id: 'c', shape: 'process' },
    { id: 'end', shape: 'terminal', terminalType: 'end' as const },
];
const edgesWithTwoCycles = [
    { source: 'start', target: 'a' },
    { source: 'a', target: 'b' },
    { source: 'b', target: 'a' }, // cycle 1: a<->b
    { source: 'b', target: 'c' },
    { source: 'c', target: 'b' }, // cycle 2: b<->c
    { source: 'c', target: 'end' },
];
const loopLimitIssues = validateSopStructuralConstraints(stepsForTwoCycles, edgesWithTwoCycles, {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
    maxLoops: 1,
});
assert(loopLimitIssues.some((i) => i.type === 'loop-limit-exceeded'), '순환이 2개인데 maxLoops(1)를 초과하면 loop-limit-exceeded로 실패해야 합니다');

// maxLoops 이내 -> 통과
const withinLoopLimitIssues = validateSopStructuralConstraints(stepsForCycle, edgesWithCycle, {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
    maxLoops: 3,
});
assert(!withinLoopLimitIssues.some((i) => i.type === 'loop-limit-exceeded'), '순환 수가 maxLoops 이내이면 통과해야 합니다');
console.log('  ✅ Structural constraints (step count / total node cap / branch policy / rework loops) are all enforced.');

// 12g. splitComplexSteps 설정이 실제 프롬프트에 반영되는지
console.log('Test 12g: splitComplexSteps setting is reflected in the SOP prompt...');
const promptWithSplit = getSopPrompt({ taskName: '테스트', splitComplexSteps: true });
const promptWithoutSplit = getSopPrompt({ taskName: '테스트', splitComplexSteps: false });
assert(promptWithSplit.includes('의미 단위로 분리'), 'splitComplexSteps=true이면 MULTI_MEANING_SPLIT_GUIDE(의미 단위 분리 지침)가 프롬프트에 포함되어야 합니다');
assert(!promptWithoutSplit.includes('의미 단위로 분리'), 'splitComplexSteps=false이면 의미 단위 분리 지침이 프롬프트에서 빠져야 합니다');
assert(promptWithoutSplit.includes('강제로 쪼개지 말고'), 'splitComplexSteps=false이면 강제 분리 금지 지침이 명시되어야 합니다');
assert(promptWithSplit.includes('전체 노드 수 상한: 15개'), '기본 maxTotalNodes(15)가 프롬프트에 반영되어야 합니다');
const promptWithCustomLimits = getSopPrompt({ taskName: '테스트', maxTotalNodes: 20, maxLoops: 5, branchPolicy: 'max', maxBranches: 4 });
assert(promptWithCustomLimits.includes('20개'), 'maxTotalNodes 값이 프롬프트에 반영되어야 합니다');
assert(promptWithCustomLimits.includes('최대 4개까지만'), "branchPolicy='max'일 때 maxBranches 값이 프롬프트에 반영되어야 합니다");
const promptWithNonePolicy = getSopPrompt({ taskName: '테스트', branchPolicy: 'none' });
assert(promptWithNonePolicy.includes('절대 생성하지 마세요'), "branchPolicy='none'이면 decision을 만들지 말라는 지침이 프롬프트에 있어야 합니다");
const promptWithSimpleStructure = getSopPrompt({ taskName: '테스트', detailLevel: 'simple' });
const promptWithDetailedStructure = getSopPrompt({ taskName: '테스트', detailLevel: 'detailed' });
assert(promptWithSimpleStructure.includes('큰 단계 중심'), 'simple 업무 분해 수준은 핵심 흐름 중심 생성 지침을 포함해야 합니다');
assert(promptWithDetailedStructure.includes('Agent화 가능성을 검토할 수 있는 하나의 실행 단위'), 'detailed 업무 분해 수준은 Agent화 검토가 가능한 실행 단위 지침을 포함해야 합니다');
console.log('  ✅ maxTotalNodes/branchPolicy/maxBranches/splitComplexSteps settings are all reflected in the generated prompt.');

// ---------------------------------------------------------
// 13. AI 모델 배지와 실제 요청 모델 일치 (저장된 모델이 손상/부재여도 배지·요청 모두 기본 모델로)
// ---------------------------------------------------------
console.log('Test 13: Model sanitization keeps badge and request body in sync...');
assert(sanitizeModelId('gemini-3.6-flash') === 'gemini-3.6-flash', '유효한 모델 문자열은 그대로 유지되어야 합니다');
assert(sanitizeModelId('not-a-real-model-xyz') === DEFAULT_GEMINI_MODEL, '손상/잘못된 모델 문자열은 기본 모델로 대체되어야 합니다');
assert(sanitizeModelId(null) === DEFAULT_GEMINI_MODEL, '저장된 모델이 없으면(null) 기본 모델이어야 합니다');
assert(sanitizeModelId(undefined) === DEFAULT_GEMINI_MODEL, '저장된 모델이 없으면(undefined) 기본 모델이어야 합니다');

// useSopAiSettings 훅은 이 sanitizeModelId를 그대로 사용하므로(useSyncExternalStore의 getSnapshot),
// 배지에 표시되는 값과 buildSopGenerationRequestBody가 보내는 값이 항상 같은 정규화 결과를 공유한다.
const requestBodyWithBadModel = buildSopGenerationRequestBody({
    ...baseRequestParams,
    model: 'not-a-real-model-xyz',
    reasoning: 'default',
});
assert(requestBodyWithBadModel.model === DEFAULT_GEMINI_MODEL, '잘못된 저장 모델은 요청 본문에서도 기본 모델로 정규화되어야 합니다 (배지와 동일한 값)');

const requestBodyWithGoodModel = buildSopGenerationRequestBody({
    ...baseRequestParams,
    model: 'gemini-3.6-flash',
    reasoning: 'default',
});
assert(requestBodyWithGoodModel.model === 'gemini-3.6-flash', '유효한 모델은 그대로 요청 본문에 전달되어야 합니다');
console.log('  ✅ Model sanitization is shared between the badge (useSopAiSettings) and the request body (buildSopGenerationRequestBody) - both always resolve to DEFAULT_GEMINI_MODEL for a corrupted/missing stored model.');

// ---------------------------------------------------------
// 14. 그래프 연결성 검증: 중복 ID, 시작에서 도달 불가, 종료로 도달 불가
// ---------------------------------------------------------
console.log('Test 14: Graph connectivity - unreachable-from-start / cannot-reach-end / duplicate IDs...');

// 14a. start->end 와 완전히 분리된 x->y 부분 그래프 -> x, y 모두 unreachable-from-start이자 cannot-reach-end
const disconnectedGraphIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
        { id: 'x', shape: 'process' },
        { id: 'y', shape: 'process' },
    ],
    [
        { id: 'e1', source: 'start', target: 'end' },
        { id: 'e2', source: 'x', target: 'y' },
    ]
);
assert(hasBlockingSopIssues(disconnectedGraphIssues), 'start->end 와 분리된 x->y 그래프는 반드시 blocking issue를 내야 합니다 (이전에는 0개였음)');
assert(
    disconnectedGraphIssues.some((i) => i.type === 'unreachable-from-start' && i.nodeId === 'x') &&
        disconnectedGraphIssues.some((i) => i.type === 'unreachable-from-start' && i.nodeId === 'y'),
    'x, y 모두 unreachable-from-start로 보고되어야 합니다'
);
assert(
    disconnectedGraphIssues.some((i) => i.type === 'cannot-reach-end' && i.nodeId === 'x') &&
        disconnectedGraphIssues.some((i) => i.type === 'cannot-reach-end' && i.nodeId === 'y'),
    'x, y 모두 cannot-reach-end로 보고되어야 합니다'
);

// 14b. 종료로 가는 경로가 막힌 부분 그래프(정상적인 재작업 순환이지만 탈출구가 없는 경우) -> cannot-reach-end
const deadEndLoopIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'a', shape: 'process' },
        { id: 'b', shape: 'process' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'a' },
        { id: 'e2', source: 'a', target: 'b' },
        { id: 'e3', source: 'b', target: 'a', branchType: 'condition', label: '재시도', condition: '재시도 필요' }, // a<->b 순환, end로 나가는 길이 전혀 없음
    ]
);
assert(
    deadEndLoopIssues.some((i) => i.type === 'cannot-reach-end' && i.nodeId === 'a') &&
        deadEndLoopIssues.some((i) => i.type === 'cannot-reach-end' && i.nodeId === 'b'),
    '종료로 나가는 길이 없는 막힌 순환은 a, b 모두 cannot-reach-end로 보고되어야 합니다'
);

// 14c. 정상 선형 그래프는 도달성 이슈가 없어야 한다
const healthyLinearIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'a', shape: 'process' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'a' },
        { id: 'e2', source: 'a', target: 'end' },
    ]
);
assert(
    !healthyLinearIssues.some((i) => i.type === 'unreachable-from-start' || i.type === 'cannot-reach-end'),
    '정상적인 선형 그래프는 도달성 이슈가 없어야 합니다'
);

// 14d. 중복 step ID -> duplicate-node-id
const duplicateNodeIdIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'dup', shape: 'process' },
        { id: 'dup', shape: 'process' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'dup' },
        { id: 'e2', source: 'dup', target: 'end' },
    ]
);
assert(duplicateNodeIdIssues.some((i) => i.type === 'duplicate-node-id'), '중복 step ID는 duplicate-node-id로 거부되어야 합니다');

// 14e. 중복 edge ID -> duplicate-edge-id
const duplicateEdgeIdIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'a', shape: 'process' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e-dup', source: 'start', target: 'a' },
        { id: 'e-dup', source: 'a', target: 'end' },
    ]
);
assert(duplicateEdgeIdIssues.some((i) => i.type === 'duplicate-edge-id'), '중복 edge ID는 duplicate-edge-id로 거부되어야 합니다');

// 14f. AI 응답 스키마 레벨에서도 중복 step/edge ID를 거부한다 (런타임 그래프 검증과 이중 방어)
console.log('Test 14f: AI response schema rejects duplicate step/edge IDs...');
const duplicateIdAiResponse = {
    title: '중복 ID 테스트',
    steps: [
        { id: 's1', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
        { id: 's1', title: '중복', definition: '동일 ID를 가진 두 번째 단계입니다.', shape: 'process' },
        { id: 's2', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
    ],
    edges: [
        { id: 'e1', source: 's1', target: 's2' },
    ],
};
let duplicateIdThrew = false;
try {
    createSopDocumentFromGeneration({
        rawResponse: duplicateIdAiResponse,
        member: SAMPLE_SOP_MEMBER,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: BASE_SETUP_CONFIG,
    });
} catch (err: unknown) {
    duplicateIdThrew = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes('중복'), 'Schema rejection message must mention duplication');
}
assert(duplicateIdThrew, '중복 step ID를 가진 AI 응답은 Zod 스키마 단계에서 거부되어야 합니다');
console.log('  ✅ Graph connectivity + duplicate ID checks pass at both the graph-validation and Zod schema layers.');

// ---------------------------------------------------------
// 15. SOP 전용 재작업 순환 검증 (validateSopReworkCycles / unbounded-cycle)
// ---------------------------------------------------------
console.log('Test 15: SOP-only rework cycle validation rejects unconditioned loops...');

// 15a. label + branchType='default'만 있는 순환 -> unbounded-cycle (재현된 결함: 예전에는 label만 있어도 통과)
const unboundedDefaultCycleIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'a', shape: 'process' },
        { id: 'b', shape: 'process' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'a' },
        { id: 'e2', source: 'a', target: 'b' },
        { id: 'e3', source: 'b', target: 'a', label: '다시', branchType: 'default' },
        { id: 'e4', source: 'b', target: 'end' },
    ]
);
assert(
    unboundedDefaultCycleIssues.some((i) => i.type === 'unbounded-cycle'),
    "label + branchType='default'만 있는 순환은 unbounded-cycle로 차단되어야 합니다"
);

// 15b. 순환을 닫는 edge에 condition이 명시된 정상 재작업 -> 통과
const validConditionCycleIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'a', shape: 'process' },
        { id: 'check', shape: 'decision' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'a' },
        { id: 'e2', source: 'a', target: 'check' },
        { id: 'e3', source: 'check', target: 'a', branchType: 'no', label: 'NO', condition: '조건 미충족 시 재검토' },
        { id: 'e4', source: 'check', target: 'end', branchType: 'yes', label: 'YES' },
    ]
);
assert(
    !validConditionCycleIssues.some((i) => i.type === 'unbounded-cycle'),
    '되돌아가는 edge에 조건(condition)이 명시된 정상 재작업 순환은 통과해야 합니다'
);

// 15c. loopLimit 도형이 순환 구간에 포함된 정상 순환 -> 통과 (되돌아가는 edge 자체는 무조건이어도 됨)
const validLoopLimitCycleIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'offer', shape: 'loopLimit' },
        { id: 'check', shape: 'decision' },
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'offer' },
        { id: 'e2', source: 'offer', target: 'check' },
        { id: 'e3', source: 'check', target: 'offer', label: '재협의', branchType: 'default' },
        { id: 'e4', source: 'check', target: 'end', branchType: 'yes', label: 'YES' },
    ]
);
assert(
    !validLoopLimitCycleIssues.some((i) => i.type === 'unbounded-cycle'),
    'loopLimit 도형이 순환 구간에 있으면 되돌아가는 edge가 default여도 정상 재작업 루프로 인정되어야 합니다'
);

// 15d. /flow(validateFlowGraph)의 기존 느슨한 판정은 그대로 유지된다 (SOP 전용 규칙으로 분리했을 뿐,
// /flow의 의미를 바꾸지 않는다)
const flowGraphSameCycle = validateFlowGraph(
    [
        { id: 'start', type: 'terminal', terminalType: 'start' },
        { id: 'a', type: 'process' },
        { id: 'b', type: 'process' },
        { id: 'end', type: 'terminal', terminalType: 'end' },
    ],
    [
        { source: 'start', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a', label: '다시', branchType: 'default' },
        { source: 'b', target: 'end' },
    ]
);
assert(
    !flowGraphSameCycle.some((i: { type: string }) => i.type === 'unbounded-cycle'),
    '/flow의 validateFlowGraph()는 label만 있어도 여전히 순환을 정상으로 간주해야 한다(기존 동작 보존)'
);
console.log('  ✅ SOP-only rework cycle validation correctly rejects unconditioned loops while /flow keeps its existing looser rule.');

// ---------------------------------------------------------
// 16. maxLoops(재작업 루프 수) 계산의 배열 순서 무관성
// ---------------------------------------------------------
console.log('Test 16: findReworkEdges (maxLoops basis) is invariant to node/edge array order...');
const orderedNodeIds = ['start', 'a', 'b', 'c', 'end'];
const orderedEdges: ValidatableEdge[] = [
    { source: 'start', target: 'a' },
    { source: 'a', target: 'b' },
    { source: 'b', target: 'a' }, // rework edge 1
    { source: 'b', target: 'c' },
    { source: 'c', target: 'b' }, // rework edge 2
    { source: 'c', target: 'end' },
];
const reworkCountOriginalOrder = findReworkEdges(orderedNodeIds, orderedEdges, 'start').length;

const shuffledNodeIds = ['end', 'c', 'a', 'start', 'b'];
const shuffledEdges: ValidatableEdge[] = [
    { source: 'c', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'end' },
    { source: 'start', target: 'a' },
    { source: 'b', target: 'a' },
    { source: 'a', target: 'b' },
];
const reworkCountShuffledOrder = findReworkEdges(shuffledNodeIds, shuffledEdges, 'start').length;

assert(reworkCountOriginalOrder === 2, `기준 순서에서 재작업 edge는 2개여야 합니다 (found: ${reworkCountOriginalOrder})`);
assert(
    reworkCountOriginalOrder === reworkCountShuffledOrder,
    `노드/edge 배열 순서를 바꿔도 재작업 루프 수는 동일해야 합니다 (원래: ${reworkCountOriginalOrder}, 순서 변경 후: ${reworkCountShuffledOrder})`
);

// validateSopStructuralConstraints도 동일한 카운트 기준(findReworkEdges)을 쓰는지 end-to-end로 확인
const stepsForOrderTest = orderedNodeIds.map((id) => ({
    id,
    shape: id === 'start' ? 'terminal' : id === 'end' ? 'terminal' : 'process',
    terminalType: id === 'start' ? ('start' as const) : id === 'end' ? ('end' as const) : undefined,
}));
const structuralIssuesOriginal = validateSopStructuralConstraints(stepsForOrderTest, orderedEdges, {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
    maxLoops: 2,
});
const structuralIssuesShuffled = validateSopStructuralConstraints([...stepsForOrderTest].reverse(), shuffledEdges, {
    minSteps: 0,
    maxSteps: 10,
    branchPolicy: 'auto',
    maxBranches: 5,
    allowRework: true,
    maxLoops: 2,
});
assert(
    !structuralIssuesOriginal.some((i) => i.type === 'loop-limit-exceeded') &&
        !structuralIssuesShuffled.some((i) => i.type === 'loop-limit-exceeded'),
    'maxLoops=2, 재작업 edge 2개는 노드/edge 순서와 무관하게 통과해야 합니다'
);
console.log('  ✅ maxLoops calculation is invariant to node/edge array ordering.');

// ---------------------------------------------------------
// 17. 단계 추가(insertStepBeforeEnd) - 종료 노드 뒤에 붙는 결함 수정 검증
// ---------------------------------------------------------
console.log('Test 17: insertStepBeforeEnd inserts before the end terminal, never after it...');
useSopPrototypeStore.getState().resetStore();
useSopPrototypeStore.getState().generateFromSample();

const beforeInsertDoc = useSopPrototypeStore.getState().document!;
const newStepForInsert: SopStepData = {
    id: 'inserted-step',
    title: '삽입된 단계',
    definition: '테스트로 삽입된 단계입니다.',
    shape: 'process',
    position: { x: 0, y: 0 },
    requiredSkills: [],
    reviewStatus: 'ai-draft',
};
const insertResult = useSopPrototypeStore.getState().insertStepBeforeEnd(newStepForInsert);
assert(insertResult.success === true, '종료 노드로 들어오는 edge가 있으면 자동 삽입이 성공해야 합니다');

const docAfterInsert = useSopPrototypeStore.getState().document!;
const insertIssues = validateSopGraph(docAfterInsert.steps, docAfterInsert.edges);
assert(!insertIssues.some((i) => i.type === 'invalid-end-outgoing'), '단계 추가 후 invalid-end-outgoing이 없어야 합니다');
assert(
    docAfterInsert.steps.filter((s) => s.terminalType === 'start').length === 1 &&
        docAfterInsert.steps.filter((s) => s.terminalType === 'end').length === 1,
    '단계 추가 후에도 시작·종료 노드는 각각 정확히 1개여야 합니다'
);
const endStepAfterInsert = docAfterInsert.steps.find((s) => s.terminalType === 'end')!;
assert(
    docAfterInsert.edges.some((e) => e.source === 'inserted-step' && e.target === endStepAfterInsert.id),
    '삽입된 단계는 종료 노드로 이어져야 합니다'
);
assert(
    !docAfterInsert.edges.some((e) => e.source === endStepAfterInsert.id),
    '종료 노드에서 나가는 edge가 자동 생성되면 안 됩니다'
);
assert(
    docAfterInsert.steps.find((s) => s.id === 'inserted-step')!.reviewStatus === 'ai-draft',
    '새로 삽입된 단계는 ai-draft여야 합니다'
);
assert(docAfterInsert.reviewStatus === 'ai-draft', '단계 추가 직후 문서 전체 확정 상태는 해제되어야 합니다');
console.log('  ✅ insertStepBeforeEnd correctly splices the new step before the end terminal with zero invalid-end-outgoing edges.');
void beforeInsertDoc;

// ---------------------------------------------------------
// 18. 도형-terminalType 정규화 및 시작·종료 삭제/복제 정책
// ---------------------------------------------------------
console.log('Test 18: Shape/terminalType normalization + start/end delete/duplicate protection...');

// 18a. terminal -> process 변경 시 terminalType이 제거된다
const terminalToProcess = normalizeStepShapeChange({ shape: 'terminal', type: 'terminal', terminalType: 'start' }, 'process');
assert(terminalToProcess.terminalType === undefined, 'terminal에서 process로 바꾸면 terminalType이 제거되어야 합니다');
assert(terminalToProcess.type === 'process', 'process로 바꾸면 type도 process여야 합니다');

// 18b. process -> terminal 전환 시 terminalType은 비어 있는 채로(=미확정) 유지된다 (자동으로 start/end를 추정하지 않음)
const processToTerminal = normalizeStepShapeChange({ shape: 'process', type: 'process' }, 'terminal');
assert(processToTerminal.terminalType === undefined, 'process에서 terminal로 바꾸면 사용자가 명시적으로 start/end를 선택하기 전까지 terminalType이 비어 있어야 합니다');
assert(processToTerminal.type === 'terminal', 'terminal로 바꾸면 type도 terminal이어야 합니다');

// 18b-2. terminalType이 미확정인 상태로는 그래프 검증을 통과할 수 없다(=confirmFullSop에서 정상 확정 불가)
const untypedTerminalIssues = validateSopGraph(
    [
        { id: 'start', shape: 'terminal', terminalType: 'start' },
        { id: 'mid', shape: 'terminal' }, // 방금 terminal로 바뀌었지만 start/end 미선택
        { id: 'end', shape: 'terminal', terminalType: 'end' },
    ],
    [
        { id: 'e1', source: 'start', target: 'mid' },
        { id: 'e2', source: 'mid', target: 'end' },
    ]
);
assert(untypedTerminalIssues.some((i) => i.type === 'terminal-missing-type'), 'start/end 미선택 상태의 terminal 노드는 terminal-missing-type으로 확정을 막아야 합니다');

// 18c. decision으로 변경 시 type도 decision으로 맞춰진다
const toDecision = normalizeStepShapeChange({ shape: 'process', type: 'process' }, 'decision');
assert(toDecision.type === 'decision' && toDecision.shape === 'decision', 'decision으로 바꾸면 shape/type이 모두 decision이어야 합니다');

// 18d. 시작/종료 노드는 삭제할 수 없다
useSopPrototypeStore.getState().resetStore();
useSopPrototypeStore.getState().generateFromSample();
const docForTerminalGuard = useSopPrototypeStore.getState().document!;
const startId18 = docForTerminalGuard.steps.find((s) => s.terminalType === 'start')!.id;
const endId18 = docForTerminalGuard.steps.find((s) => s.terminalType === 'end')!.id;
const deleteStartResult = useSopPrototypeStore.getState().deleteStep(startId18);
assert(deleteStartResult.success === false, '시작 노드는 삭제할 수 없어야 합니다');
const deleteEndResult = useSopPrototypeStore.getState().deleteStep(endId18);
assert(deleteEndResult.success === false, '종료 노드는 삭제할 수 없어야 합니다');
assert(
    useSopPrototypeStore.getState().document!.steps.some((s) => s.id === startId18) &&
        useSopPrototypeStore.getState().document!.steps.some((s) => s.id === endId18),
    '삭제 시도가 거부된 시작·종료 노드는 여전히 문서에 남아 있어야 합니다'
);

// 18e. 시작/종료 노드는 복제로 중복 생성될 수 없다
const duplicateStartResult = useSopPrototypeStore.getState().duplicateStep(startId18);
assert(duplicateStartResult.success === false, '시작 노드는 복제할 수 없어야 합니다');
assert(
    useSopPrototypeStore.getState().document!.steps.filter((s) => s.terminalType === 'start').length === 1,
    '시작 노드 복제 시도 후에도 시작 노드는 여전히 1개여야 합니다(중복 생성 금지)'
);
console.log('  ✅ Shape/terminalType normalization is consistent, and start/end nodes are protected from delete/duplicate.');

// ---------------------------------------------------------
// 19. Canvas 노드는 키보드/UI로 직접 삭제할 수 없다 (Store와의 불일치 방지)
// ---------------------------------------------------------
console.log('Test 19: Canvas nodes built from the store are never directly deletable (deleteStep is the only path)...');
const docForCanvasDeleteCheck = useSopPrototypeStore.getState().document!;
const canvasNodesForDeleteCheck = buildSopNodes(docForCanvasDeleteCheck, null);
assert(
    canvasNodesForDeleteCheck.length > 0 && canvasNodesForDeleteCheck.every((n) => n.deletable === false),
    'Store에서 만들어진 모든 Canvas 노드는 deletable:false여야 합니다(키보드 Backspace 등으로 화면에서만 사라지고 Store에는 남는 불일치를 원천 차단)'
);
console.log('  ✅ Canvas nodes cannot silently diverge from the store via direct React Flow deletion.');

// ---------------------------------------------------------
// 20. 워크플로우 구조 설정 검증 (validateSopSetupConfig)
// ---------------------------------------------------------
console.log('Test 20: validateSopSetupConfig rejects invalid workflow structure settings...');

// 20a. maxLoops=0은 유효한 값으로 보존되어야 한다 (||였다면 3으로 덮어써졌을 값)
const zeroLoopsIssues = validateSopSetupConfig({
    minSteps: 4,
    maxSteps: 8,
    maxTotalNodes: 10,
    branchPolicy: 'auto',
    maxBranches: 2,
    allowRework: true,
    maxLoops: 0,
});
assert(zeroLoopsIssues.length === 0, 'maxLoops=0은 유효한 설정이어야 합니다(재작업 루프를 전혀 허용하지 않는다는 뜻)');

// 20b. 음수/소수/NaN(공란) 거부
assert(validateSopSetupConfig({ minSteps: -1, maxSteps: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).some((i) => i.field === 'minSteps'), '음수 minSteps는 거부되어야 합니다');
assert(validateSopSetupConfig({ minSteps: 4.5, maxSteps: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).some((i) => i.field === 'minSteps'), '소수 minSteps는 거부되어야 합니다');
assert(validateSopSetupConfig({ minSteps: NaN, maxSteps: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).some((i) => i.field === 'minSteps'), '공란(NaN) minSteps는 거부되어야 합니다');
assert(validateSopSetupConfig({ minSteps: 8, maxSteps: 4, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).some((i) => i.field === 'maxSteps'), 'minSteps >= maxSteps(역전)는 거부되어야 합니다');
assert(validateSopSetupConfig({ minSteps: 4, maxSteps: 4, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).some((i) => i.field === 'maxSteps'), 'minSteps === maxSteps(역전 포함)는 거부되어야 합니다');

// 20c. maxTotalNodes < minSteps + 2 거부
assert(
    validateSopSetupConfig({ minSteps: 6, maxSteps: 8, maxTotalNodes: 7, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).some((i) => i.field === 'maxTotalNodes'),
    'maxTotalNodes(7)가 minSteps+2(8) 미만이면 거부되어야 합니다'
);
assert(
    validateSopSetupConfig({ minSteps: 6, maxSteps: 8, maxTotalNodes: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: true }).length === 0,
    'maxTotalNodes(8)가 minSteps+2(8)와 같으면 통과해야 합니다'
);

// 20d. 잘못된 branchPolicy 거부
assert(
    validateSopSetupConfig({ minSteps: 4, maxSteps: 8, branchPolicy: 'invalid-policy', maxBranches: 2, allowRework: true }).some((i) => i.field === 'branchPolicy'),
    "허용되지 않은 branchPolicy 값은 거부되어야 합니다"
);

// 20e. allowRework=false면 maxLoops가 무엇이든(심지어 음수여도) 검증 대상에서 제외된다("적용되지 않음")
assert(
    validateSopSetupConfig({ minSteps: 4, maxSteps: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: false, maxLoops: -5 }).length === 0,
    'allowRework=false면 maxLoops는 검증하지 않아야 합니다(UI에서 "적용되지 않음"으로 표시)'
);

// 20f. maxLoops=0이 getSopPrompt에도 그대로 반영된다(||였다면 3으로 바뀌었을 것)
const promptWithZeroLoops = getSopPrompt({ taskName: '테스트', allowRework: true, maxLoops: 0 });
assert(promptWithZeroLoops.includes('최대 0개까지'), 'maxLoops=0은 프롬프트에도 0 그대로 반영되어야 합니다(?? 사용, || 아님)');
console.log('  ✅ validateSopSetupConfig rejects negative/fractional/blank/inverted-range values and preserves a valid 0.');

async function runAsyncTests() {
    // ---------------------------------------------------------
    // 9. AI 생성 orchestration이 실패를 문서/샘플/라우팅 변경 없이 처리하는지 테스트
    // ---------------------------------------------------------
    console.log('Test 9: generateSopViaApi isolates fetch failures/throws from the store...');
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    const docBeforeFailedGeneration = useSopPrototypeStore.getState().document;

    // 9a. non-2xx response -> success:false, store untouched
    const failingFetch = (async () => ({
        ok: false,
        json: async () => ({ error: '테스트용 AI 생성 실패' }),
    })) as unknown as typeof fetch;

    const failedResult = await generateSopViaApi({
        requestBody: { action: 'generateSop' },
        member: SAMPLE_SOP_MEMBER,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: BASE_SETUP_CONFIG,
        fetchImpl: failingFetch,
    });
    assert(failedResult.success === false, 'generateSopViaApi must report failure for a non-2xx response');
    assert(!failedResult.success && failedResult.error === '테스트용 AI 생성 실패', 'generateSopViaApi must surface the server-provided error message');
    // generateSopViaApi never references setDocument/generateFromSample/router - it cannot call them.
    // Confirming the store document reference is untouched proves the failure path has zero store side effects.
    assert(
        useSopPrototypeStore.getState().document === docBeforeFailedGeneration,
        'A failed AI generation must NOT mutate the store document (no setDocument, no implicit sample fallback, no navigation)'
    );

    // 9b. network-level throw (not just non-2xx) must also be caught, not propagated
    const throwingFetch = (async () => {
        throw new Error('네트워크 오류');
    }) as unknown as typeof fetch;
    const throwResult = await generateSopViaApi({
        requestBody: { action: 'generateSop' },
        member: SAMPLE_SOP_MEMBER,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: BASE_SETUP_CONFIG,
        fetchImpl: throwingFetch,
    });
    assert(throwResult.success === false, 'generateSopViaApi must catch network-level throws, not propagate them');
    assert(!throwResult.success && throwResult.error === '네트워크 오류', 'Thrown fetch errors must surface their message');
    assert(
        useSopPrototypeStore.getState().document === docBeforeFailedGeneration,
        'A thrown network error must also leave the store document untouched'
    );

    // 9c. success path -> normalized SopDocument, never silently marked as sample data
    const successFetch = (async () => ({
        ok: true,
        json: async () => ({
            title: '성공 응답 SOP',
            steps: [
                { id: 's1', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
                { id: 's2', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
            ],
            edges: [{ id: 'e1', source: 's1', target: 's2' }],
        }),
    })) as unknown as typeof fetch;
    const successResult = await generateSopViaApi({
        requestBody: { action: 'generateSop' },
        member: SAMPLE_SOP_MEMBER,
        workLibrary: SAMPLE_WORK_LIBRARY,
        context: '',
        setupConfig: BASE_SETUP_CONFIG,
        fetchImpl: successFetch,
    });
    assert(successResult.success === true, 'generateSopViaApi must succeed for a valid AI response');
    assert(!!successResult.success && successResult.document.isSampleData === false, 'A real AI-generated document must never be marked isSampleData');
    console.log('  ✅ generateSopViaApi isolates fetch failures/throws from the store and normalizes successful responses correctly.');

    // ---------------------------------------------------------
    // 10. API 생성->검증->repair->fallback->재검증 파이프라인 테스트
    // ---------------------------------------------------------
    console.log('Test 10: runSopValidationPipeline (generate -> validate -> repair -> fallback -> revalidate)...');

    const validSopObject = {
        title: '유효한 SOP',
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'work', title: '작업', definition: '작업을 수행하는 단계입니다.', shape: 'process' },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'work' },
            { id: 'e2', source: 'work', target: 'end' },
        ],
    };

    // 10a. 첫 응답 오류(시작 노드 중복) -> repair 응답 정상 -> 정상 반환
    const twoStartsObject = {
        title: '시작 2개 SOP',
        steps: [
            { id: 'start1', title: '시작1', definition: '중복된 시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'start2', title: '시작2', definition: '중복된 시작 단계입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'work', title: '작업', definition: '작업을 수행하는 단계입니다.', shape: 'process' },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start1', target: 'work' },
            { id: 'e2', source: 'start2', target: 'work' },
            { id: 'e3', source: 'work', target: 'end' },
        ],
    };
    let generateCallCount1 = 0;
    const pipeline1 = await runSopValidationPipeline(
        twoStartsObject,
        'PROMPT',
        async () => {
            generateCallCount1++;
            return { ...validSopObject, title: 'Repaired SOP' };
        },
        PERMISSIVE_CONSTRAINTS
    );
    assert(pipeline1.ok === true, 'Case 1: a successful repair response must yield ok:true');
    assert(generateCallCount1 === 1, 'Case 1: repair generate() must be called exactly once');

    // 10b. 첫 응답 오류(단일 분기 decision) -> repair도 여전히 오류 -> 결정론적 fallback으로 복구
    const singleBranchDecisionObject = {
        title: '단일 분기 decision SOP',
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'intake', title: '접수', definition: '요청을 접수하는 단계입니다.', shape: 'process' },
            { id: 'check', title: '검토', definition: '조건을 판단하는 단계입니다.', shape: 'decision' },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'intake' },
            { id: 'e2', source: 'intake', target: 'check' },
            { id: 'e3', source: 'check', target: 'end' }, // decision has only ONE outgoing edge
        ],
    };
    let generateCallCount2 = 0;
    const pipeline2 = await runSopValidationPipeline(
        singleBranchDecisionObject,
        'PROMPT',
        async () => {
            generateCallCount2++;
            return singleBranchDecisionObject; // repair fails to fix it - simulates a weak model
        },
        PERMISSIVE_CONSTRAINTS
    );
    assert(pipeline2.ok === true, 'Case 2: deterministic fallback must recover a still-broken single-branch decision after a failed repair');
    assert(generateCallCount2 === 1, 'Case 2: repair generate() must be attempted exactly once before falling back');
    assert(pipeline2.ok && pipeline2.warnings.length > 0, 'Case 2: the deterministic fallback must report what it fixed via warnings');

    // 10c. repair도, fallback도 못 고치는 결함(시작 노드 중복은 fallback이 다루지 않음) -> 400에 해당하는 실패 반환
    let generateCallCount3 = 0;
    const pipeline3 = await runSopValidationPipeline(
        twoStartsObject,
        'PROMPT',
        async () => {
            generateCallCount3++;
            return twoStartsObject; // repair also fails to fix the duplicate start nodes
        },
        PERMISSIVE_CONSTRAINTS
    );
    assert(pipeline3.ok === false, 'Case 3: an unrecoverable structural defect must yield ok:false (mapped to HTTP 400 by the route)');
    assert(!pipeline3.ok && pipeline3.issues.some((i) => i.type === 'multiple-start-nodes'), 'Case 3: the failure must report the specific unresolved issue');
    assert(generateCallCount3 === 1, 'Case 3: repair must still be attempted exactly once even though it cannot fix the problem');

    // 10d. 정상 응답 -> repair 자체가 호출되지 않음
    let generateCallCount4 = 0;
    const pipeline4 = await runSopValidationPipeline(
        validSopObject,
        'PROMPT',
        async () => {
            generateCallCount4++;
            return validSopObject;
        },
        PERMISSIVE_CONSTRAINTS
    );
    assert(pipeline4.ok === true, 'Case 4: a valid initial response must pass through as ok:true');
    assert(generateCallCount4 === 0, 'Case 4: a valid initial response must NOT trigger any repair call');
    console.log('  ✅ runSopValidationPipeline correctly covers repair-success, fallback-recovery, unrecoverable-failure, and no-repair-needed paths.');

    // 10e. 구조 설정(branchPolicy='none')이 파이프라인 전체(검증 -> repair -> 여전히 위반 -> 400)를
    // 통해 실제로 강제되는지 end-to-end로 확인한다 (validateSopStructuralConstraints 단위 테스트와 별개로,
    // runSopValidationPipeline이 그 결과를 실제로 사용하는지까지 검증).
    console.log('Test 10e: structural constraints (branchPolicy=none) are enforced through the full pipeline...');
    const decisionWhenNoneObject = {
        title: '분기 없음 정책 위반 SOP',
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'check', title: '검토', definition: '조건을 판단하는 단계입니다.', shape: 'decision' },
            { id: 'a', title: '경로 A', definition: '경로 A 처리 단계입니다.', shape: 'process' },
            { id: 'b', title: '경로 B', definition: '경로 B 처리 단계입니다.', shape: 'process' },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'check' },
            { id: 'e2', source: 'check', target: 'a', branchType: 'yes', label: 'YES' },
            { id: 'e3', source: 'check', target: 'b', branchType: 'no', label: 'NO' },
            { id: 'e4', source: 'a', target: 'end' },
            { id: 'e5', source: 'b', target: 'end' },
        ],
    };
    const noneConstraints: SopStructuralConstraints = { ...PERMISSIVE_CONSTRAINTS, branchPolicy: 'none' };
    let generateCallCount5 = 0;
    const pipeline5 = await runSopValidationPipeline(
        decisionWhenNoneObject,
        'PROMPT',
        async () => {
            generateCallCount5++;
            return decisionWhenNoneObject; // repair also fails to remove the decision node
        },
        noneConstraints
    );
    assert(pipeline5.ok === false, 'branchPolicy=none with a decision node present must fail through the full pipeline');
    assert(!pipeline5.ok && pipeline5.issues.some((i) => i.type === 'decision-not-allowed'), 'Pipeline failure must report decision-not-allowed');
    assert(generateCallCount5 === 1, 'Pipeline must still attempt exactly one repair before failing');
    console.log('  ✅ Structural constraints (branchPolicy) are enforced end-to-end through the real pipeline, not just as an isolated pure function.');
}

runAsyncTests()
    .then(() => {
        console.log('\n🎉 ALL COMPREHENSIVE REPRODUCTION & REGRESSION TESTS PASSED SUCCESSFULLY!\n');
    })
    .catch((err) => {
        console.error('❌ ASYNC TEST FAILED:', err);
        process.exit(1);
    });
