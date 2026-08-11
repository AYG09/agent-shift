import {
    normalizeFlowShape,
    FLOW_SHAPE_IDS,
    FLOW_SHAPES,
    SHAPE_HANDLE_ANCHORS,
    SHAPE_CONTENT_BOUNDS,
    getRecommendedShapeForType,
    getFlowShapePolicy,
} from '../src/lib/flow-shapes';
import {
    aiNodeToFlowNode,
    normalizeFlowNode,
    flowNodeToAiContext,
    FlowNode,
} from '../src/lib/store';
import { getNodeContentState } from '../src/components/flow/CustomNodes';

console.log('=== Step 1: Verification of 25 Canonical Shape IDs (including queuedData & loopLimit) ===');
let passCount = 0;
let failCount = 0;

for (const id of FLOW_SHAPE_IDS) {
    const result = normalizeFlowShape(id);
    if (result === id) {
        passCount++;
    } else {
        console.error(`FAIL: canonical shape '${id}' returned '${result}'`);
        failCount++;
    }
}
console.log(`Canonical shapes test: ${passCount}/${FLOW_SHAPE_IDS.length} passed.`);

console.log('\n=== Step 2: Verification of CamelCase Shape IDs (queuedData, loopLimit, etc.) ===');
const camelCaseIds = [
    'predefinedProcess',
    'internalStorage',
    'storedData',
    'manualInput',
    'manualOperation',
    'offPageConnector',
    'queuedData',
    'loopLimit',
];

for (const id of camelCaseIds) {
    const result = normalizeFlowShape(id);
    if (result === id) {
        console.log(`PASS: camelCase '${id}' === '${result}'`);
        passCount++;
    } else {
        console.error(`FAIL: camelCase '${id}' returned '${result}'`);
        failCount++;
    }
}

console.log('\n=== Step 3: Verification of Catalog Key Set Equality across Dictionaries ===');
const canonicalSet = new Set<string>(FLOW_SHAPE_IDS);
const shapeKeys = Object.keys(FLOW_SHAPES);
const anchorKeys = Object.keys(SHAPE_HANDLE_ANCHORS);
const boundKeys = Object.keys(SHAPE_CONTENT_BOUNDS);

let catalogSetValid = true;
if (shapeKeys.length !== FLOW_SHAPE_IDS.length || !shapeKeys.every((k) => canonicalSet.has(k))) {
    console.error('FAIL: FLOW_SHAPES keys do not match FLOW_SHAPE_IDS!');
    catalogSetValid = false;
}
if (anchorKeys.length !== FLOW_SHAPE_IDS.length || !anchorKeys.every((k) => canonicalSet.has(k))) {
    console.error('FAIL: SHAPE_HANDLE_ANCHORS keys do not match FLOW_SHAPE_IDS!');
    catalogSetValid = false;
}
if (boundKeys.length !== FLOW_SHAPE_IDS.length || !boundKeys.every((k) => canonicalSet.has(k))) {
    console.error('FAIL: SHAPE_CONTENT_BOUNDS keys do not match FLOW_SHAPE_IDS!');
    catalogSetValid = false;
}

if (catalogSetValid) {
    console.log(`PASS: All dictionaries (FLOW_SHAPE_IDS, FLOW_SHAPES, SHAPE_HANDLE_ANCHORS, SHAPE_CONTENT_BOUNDS) have exact 25-key equality!`);
    passCount++;
} else {
    failCount++;
}

console.log('\n=== Step 4: Verification of Pure Policy Function getFlowShapePolicy ===');
const compactShapes = ['connector', 'merge', 'extract', 'sort', 'collate', 'or', 'queuedData'];
let compactPolicyPassed = true;

for (const s of compactShapes) {
    const policy = getFlowShapePolicy(s);
    if (policy.compact === true && policy.maxLines === 1) {
        console.log(`PASS: getFlowShapePolicy('${s}') returns compact=true and maxLines=1.`);
    } else {
        console.error(`FAIL: getFlowShapePolicy('${s}') policy invalid:`, policy);
        compactPolicyPassed = false;
    }
}

if (compactPolicyPassed) {
    passCount++;
} else {
    failCount++;
}

console.log('\n=== Step 5: Verification of Legacy Aliases ===');
const aliasTests = [
    { input: 'rectangle', expected: 'process' },
    { input: 'diamond', expected: 'decision' },
    { input: 'parallelogram', expected: 'data' },
    { input: 'hexagon', expected: 'preparation' },
    { input: 'pill', expected: 'terminal' },
    { input: 'rounded', terminalType: 'end', expected: 'terminal' },
    { input: 'rounded', expected: 'process' },
];

for (const test of aliasTests) {
    const result = normalizeFlowShape(test.input, undefined, test.terminalType);
    if (result === test.expected) {
        console.log(`PASS: alias '${test.input}' -> '${result}'`);
        passCount++;
    } else {
        console.error(`FAIL: alias '${test.input}' expected '${test.expected}' but got '${result}'`);
        failCount++;
    }
}

console.log('\n=== Step 6: Prototype Pollution Resistance ===');
const specialTests = [
    { input: 'constructor', type: 'io', expected: 'data' },
    { input: '__proto__', type: 'decision', expected: 'decision' },
    { input: 'toString', type: 'terminal', expected: 'terminal' },
    { input: 'unknown-shape', type: 'io', expected: 'data' },
    { input: '', type: 'decision', expected: 'decision' },
    { input: '   ', type: 'terminal', expected: 'terminal' },
    { input: 'prototype', type: 'process', expected: 'process' },
    { input: 'hasOwnProperty', type: 'io', expected: 'data' },
];

for (const test of specialTests) {
    const result = normalizeFlowShape(test.input, test.type);
    if (result === test.expected && typeof result === 'string') {
        console.log(`PASS: normalizeFlowShape('${test.input}', '${test.type}') === '${result}'`);
        passCount++;
    } else {
        console.error(
            `FAIL: normalizeFlowShape('${test.input}', '${test.type}') expected '${test.expected}' but got '${String(
                result
            )}'`
        );
        failCount++;
    }
}

console.log('\n=== Step 7: Manual Shape Selection & Auto Recommended Mode Update ===');
// 수동 모드 보존
const manualShapeNode: FlowNode = {
    id: 'node-manual-1',
    type: 'process',
    label: '수동 지정 DB 도형',
    shape: 'database',
    shapeMode: 'manual',
    position: { x: 0, y: 0 },
};
const normManual = normalizeFlowNode(manualShapeNode);
if (normManual.shape === 'database' && normManual.shapeMode === 'manual') {
    console.log('PASS: Manual shape choice database preserved with shapeMode=manual!');
    passCount++;
} else {
    console.error('FAIL: Manual shape choice not preserved:', normManual);
    failCount++;
}

// 자동 추천 연동
const recDecision = getRecommendedShapeForType('decision');
const recIo = getRecommendedShapeForType('io', undefined, 'input');
const recQueued = getRecommendedShapeForType('queuedData');
const recLoop = getRecommendedShapeForType('loopLimit');

if (
    recDecision === 'decision' &&
    recIo === 'data' &&
    recQueued === 'queuedData' &&
    recLoop === 'loopLimit'
) {
    console.log('PASS: getRecommendedShapeForType updated shapes dynamically on type changes!');
    passCount++;
} else {
    console.error('FAIL: Recommended shape calculation failed:', { recDecision, recIo, recQueued, recLoop });
    failCount++;
}

console.log('\n=== Step 8: Drilldown SubStep & To-Be Context Field Preservation ===');
const drilldownSubStep = {
    id: 'substep-1',
    label: '대기열 메시지 수신',
    description: 'RabbitMQ / Kafka 큐 데이터 추출',
    type: 'io',
    shape: 'queuedData',
    ioType: 'input' as const,
    stressLevel: 'low' as const,
    duration: { value: 5, unit: 'minutes' as const },
};
const drilldownFlowNode = aiNodeToFlowNode({
    ...drilldownSubStep,
    duration: drilldownSubStep.duration.value,
    durationUnit: drilldownSubStep.duration.unit,
});

if (
    drilldownFlowNode.type === 'io' &&
    drilldownFlowNode.shape === 'queuedData' &&
    drilldownFlowNode.ioType === 'input' &&
    drilldownFlowNode.label === '대기열 메시지 수신'
) {
    console.log('PASS: Drilldown SubStep converted to FlowNode with exact shape queuedData!');
    passCount++;
} else {
    console.error('FAIL: Drilldown SubStep conversion failed:', drilldownFlowNode);
    failCount++;
}

const fullAsIsNode: FlowNode = {
    id: 'asis-1',
    label: '반복 한계 검증',
    description: '최대 5회 시도 루프 한계',
    type: 'process',
    shape: 'loopLimit',
    shapeMode: 'manual',
    terminalType: undefined,
    ioType: undefined,
    stressLevel: 'high',
    collaborationType: 'autonomous',
    agentDescription: '루프 임계점 자동 모니터링',
    position: { x: 100, y: 200 },
    metrics: { duration: 10, durationUnit: 'minutes' },
};

const aiContext = flowNodeToAiContext(fullAsIsNode);
if (
    aiContext.id === 'asis-1' &&
    aiContext.shape === 'loopLimit' &&
    aiContext.shapeMode === 'manual' &&
    aiContext.agentDescription === '루프 임계점 자동 모니터링'
) {
    console.log('PASS: flowNodeToAiContext preserved loopLimit semantic context!');
    passCount++;
} else {
    console.error('FAIL: flowNodeToAiContext field preservation failed:', aiContext);
    failCount++;
}

console.log('\n=== Step 9: Verification of Component Content Policy & Render State Decisions ===');

// 1. shape='connector'인 ProcessNode
const test1 = getNodeContentState(
    { label: '연결 지점 A', shape: 'connector', metrics: { duration: 10 }, description: '상세설명' },
    'process'
);
if (
    test1.compact === true &&
    test1.maxLines === 1 &&
    test1.showDurationInNode === false &&
    test1.showDetailHint === false &&
    test1.canShowPopover === true
) {
    console.log("PASS 1: shape='connector' ProcessNode: compact=true, maxLines=1, time/detail hint hidden, popover accessible");
    passCount++;
} else {
    console.error("FAIL 1: shape='connector' ProcessNode state check failed:", test1);
    failCount++;
}

// 2. shape='queuedData'인 IONode
const test2 = getNodeContentState(
    { label: '메시지 큐 수신', shape: 'queuedData', ioType: 'input', metrics: { duration: 5 } },
    'io'
);
if (
    test2.compact === true &&
    test2.maxLines === 1 &&
    test2.showIcon === false &&
    test2.showDurationInNode === false
) {
    console.log("PASS 2: shape='queuedData' IONode: icon hidden, time hidden, maxLines=1");
    passCount++;
} else {
    console.error("FAIL 2: shape='queuedData' IONode state check failed:", test2);
    failCount++;
}

// 3. shape='or'인 AgentNode
const test3 = getNodeContentState(
    { label: '조건 분기 에이전트', shape: 'or', collaborationType: 'copilot', metrics: { duration: 20 } },
    'agent'
);
if (
    test3.compact === true &&
    test3.showIcon === false &&
    test3.showCollabBadge === false &&
    test3.showDurationInNode === false
) {
    console.log("PASS 3: shape='or' AgentNode: AI icon hidden, collab badge hidden, time hidden, label only");
    passCount++;
} else {
    console.error("FAIL 3: shape='or' AgentNode state check failed:", test3);
    failCount++;
}

// 4. shape='process'인 ProcessNode
const test4 = getNodeContentState(
    { label: '일반 처리 과업', shape: 'process', metrics: { duration: 30 }, description: '일반 설명' },
    'process'
);
if (
    test4.compact === false &&
    test4.maxLines === 2 &&
    test4.showDurationInNode === true &&
    test4.showDetailHint === true
) {
    console.log("PASS 4: shape='process' ProcessNode: compact=false, time & detail hint displayed");
    passCount++;
} else {
    console.error("FAIL 4: shape='process' ProcessNode state check failed:", test4);
    failCount++;
}

// 5. compact 도형도 설명/시간 있으면 popover 열림 (canShowPopover === true)
const test5 = getNodeContentState(
    { label: '병합 지점', shape: 'merge', description: '병합 상세 설명' },
    'process'
);
if (test5.compact === true && test5.canShowPopover === true) {
    console.log("PASS 5: compact shape with description/duration has canShowPopover=true");
    passCount++;
} else {
    console.error("FAIL 5: compact shape popover check failed:", test5);
    failCount++;
}

// Step 10 (AI 생성 경로의 queuedData/loopLimit 선택 기준 노출 검증)은
// tests/flow-branches.test.ts로 이동 및 25개 전체 도형 검증으로 확장됨 (npm run test:flow-branches)

if (failCount === 0) {
    console.log('\nALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
} else {
    console.error(`\nVERIFICATION FAILED: ${failCount} tests failed.`);
    process.exit(1);
}
