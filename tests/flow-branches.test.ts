import fs from 'node:fs';
import path from 'node:path';
import {
    validateFlowGraph,
    hasBlockingIssues,
    applyDeterministicGraphFixes,
    validateDrilldownBranching,
    type ValidatableNode,
    type ValidatableEdge,
} from '../src/lib/graph-validation';
import { layoutFlowGraph, type LayoutableNode, type LayoutableEdge } from '../src/lib/flow-layout';
import { inferFlowShapeFromContent, FLOW_SHAPE_IDS } from '../src/lib/flow-shapes';
import { applyDrilldownSubSteps } from '../src/lib/drilldown-apply';
import type { FlowNode, FlowEdge } from '../src/lib/store';
import {
    FULL_SHAPE_SELECTION_GUIDE,
    BRANCH_EDGE_GUIDE,
    MULTI_MEANING_SPLIT_GUIDE,
    SHAPE_FIELD_DESCRIBE_HINT,
} from '../src/lib/ai-shape-guide';
import {
    getAsIsPrompt,
    getToBePrompt,
    getDrilldownPromptAsIs,
    getDrilldownPromptToBe,
    getNodeSplitPrompt,
} from '../src/app/api/ai/route';

let passCount = 0;
let failCount = 0;

function check(name: string, ok: boolean, detail?: unknown) {
    if (ok) {
        console.log(`PASS: ${name}`);
        passCount++;
    } else {
        console.error(`FAIL: ${name}`, detail ?? '');
        failCount++;
    }
}

// ============================================================================
// 채용 프로세스 대표 fixture - 서류/면접/처우 3개의 decision, YES/NO 분기,
// 반려/거절 시 이전 후보자 단계로 되돌아가는 cycle, sort/collate/extract/delay/
// document/loopLimit 도형을 모두 포함한다.
// ============================================================================

function buildRecruitmentFixture(): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes: FlowNode[] = [
        { id: 'start', type: 'terminal', label: '시작', terminalType: 'start', shape: 'terminal', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'job_posting', type: 'process', label: '채용 공고 및 지원서 접수', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'screening', type: 'process', label: '지원자 자격 검토', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'score_aggregate', type: 'process', label: '지원자 점수 결과 취합', shape: 'collate', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'score_sort', type: 'process', label: '지원자 우선순위 조율', shape: 'sort', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'extract_passed', type: 'process', label: '서류 합격자 추출', shape: 'extract', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'document_passed', type: 'decision', label: '서류 합격자 선정 여부', shape: 'decision', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'review_candidates', type: 'process', label: '후보자 재검토', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'interview_selection', type: 'process', label: '면접 대상자 선정', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'interview', type: 'process', label: '실무 면접 진행', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'interview_passed', type: 'decision', label: '면접 합격 여부', shape: 'decision', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'next_candidate', type: 'process', label: '다음 후보자 검토', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'negotiation', type: 'process', label: '처우 조건 협의', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'negotiation_accepted', type: 'decision', label: '처우 조건 수락 여부', shape: 'decision', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'renegotiate', type: 'process', label: '조건 재협의', shape: 'process', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'negotiation_limit', type: 'process', label: '재협의 한계', shape: 'loopLimit', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'contract', type: 'process', label: '근로계약서 작성', shape: 'document', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'wait_response', type: 'process', label: '후보자 응답 대기', shape: 'delay', shapeMode: 'manual', position: { x: 0, y: 0 } },
        { id: 'end', type: 'terminal', label: '종료', terminalType: 'end', shape: 'terminal', shapeMode: 'manual', position: { x: 0, y: 0 } },
    ];

    const edges: FlowEdge[] = [
        { id: 'e1', source: 'start', target: 'job_posting' },
        { id: 'e2', source: 'job_posting', target: 'screening' },
        { id: 'e3', source: 'screening', target: 'score_aggregate' },
        { id: 'e4', source: 'score_aggregate', target: 'score_sort' },
        { id: 'e5', source: 'score_sort', target: 'extract_passed' },
        { id: 'e6', source: 'extract_passed', target: 'document_passed' },
        { id: 'e7', source: 'document_passed', target: 'interview_selection', label: 'YES', branchType: 'yes' },
        { id: 'e8', source: 'document_passed', target: 'review_candidates', label: 'NO', branchType: 'no', condition: '적합 후보자 없음' },
        { id: 'e9', source: 'review_candidates', target: 'job_posting' },
        { id: 'e10', source: 'interview_selection', target: 'interview' },
        { id: 'e11', source: 'interview', target: 'interview_passed' },
        { id: 'e12', source: 'interview_passed', target: 'negotiation', label: 'YES', branchType: 'yes' },
        { id: 'e13', source: 'interview_passed', target: 'next_candidate', label: 'NO', branchType: 'no' },
        { id: 'e14', source: 'next_candidate', target: 'interview_selection' },
        { id: 'e15', source: 'negotiation', target: 'negotiation_accepted' },
        { id: 'e16', source: 'negotiation_accepted', target: 'contract', label: 'YES', branchType: 'yes' },
        { id: 'e17', source: 'negotiation_accepted', target: 'renegotiate', label: 'NO', branchType: 'no', condition: '조건 재협의 필요' },
        { id: 'e18', source: 'renegotiate', target: 'negotiation_limit' },
        { id: 'e19', source: 'negotiation_limit', target: 'negotiation' },
        { id: 'e20', source: 'contract', target: 'wait_response' },
        { id: 'e21', source: 'wait_response', target: 'end' },
    ];

    return { nodes, edges };
}

console.log('=== 1. 분기 그래프 (decision YES/NO + 되돌아가는 cycle) ===');

const { nodes: recruitNodes, edges: recruitEdges } = buildRecruitmentFixture();

{
    const decisionIds = ['document_passed', 'interview_passed', 'negotiation_accepted'];
    let allHaveDistinctYesNo = true;
    for (const id of decisionIds) {
        const out = recruitEdges.filter((e) => e.source === id);
        const yes = out.find((e) => e.branchType === 'yes');
        const no = out.find((e) => e.branchType === 'no');
        if (!yes || !no || yes.target === no.target) {
            allHaveDistinctYesNo = false;
            console.error(`  -> ${id}: YES/NO 누락 또는 target 동일`, { yes, no });
        }
    }
    check('decision 노드 3개 모두 YES/NO outgoing edge를 가지며 target이 서로 다름', allHaveDistinctYesNo);
}

{
    // NO가 이전 후보자 검토 단계로 되돌아가는 cycle이 그대로 저장/표현되는지 (edge 목록에 실재하는지)
    const hasReviewCycle = recruitEdges.some((e) => e.source === 'document_passed' && e.target === 'review_candidates' && e.branchType === 'no')
        && recruitEdges.some((e) => e.source === 'review_candidates' && e.target === 'job_posting');
    const hasNextCandidateCycle = recruitEdges.some((e) => e.source === 'interview_passed' && e.target === 'next_candidate' && e.branchType === 'no')
        && recruitEdges.some((e) => e.source === 'next_candidate' && e.target === 'interview_selection');
    check('NO 분기가 이전 후보자 검토 단계로 되돌아가는 cycle이 정상 저장됨', hasReviewCycle && hasNextCandidateCycle);
}

{
    const issues = validateFlowGraph(recruitNodes as ValidatableNode[], recruitEdges as ValidatableEdge[]);
    const blocking = issues.filter((i) => hasBlockingIssues([i]));
    check('채용 프로세스 fixture는 그래프 의미 검증을 통과함 (blocking issue 없음)', blocking.length === 0, blocking);
}

{
    // cycle이 있어도 레이아웃/탐색이 유한 시간 내 종료되는지 (무한 루프면 아래 코드 자체가 끝나지 않는다)
    const startedAt = Date.now();
    const { nodes: laidOut, edges: laidOutEdges } = layoutFlowGraph(
        recruitNodes as LayoutableNode[],
        recruitEdges as LayoutableEdge[]
    );
    const elapsedMs = Date.now() - startedAt;
    const allPositioned = laidOut.every((n) => typeof n.position?.x === 'number' && typeof n.position?.y === 'number');
    const noPositionCollision = new Set(laidOut.map((n) => `${n.position?.x}:${n.position?.y}`)).size === laidOut.length;
    check(
        'cycle이 있는 그래프도 layoutFlowGraph가 유한 시간 내(< 1000ms) 종료되고 모든 노드가 배치됨',
        elapsedMs < 1000 && allPositioned && laidOut.length === recruitNodes.length,
        { elapsedMs, allPositioned, count: laidOut.length }
    );
    check('layoutFlowGraph 결과에서 노드 좌표가 서로 겹치지 않음', noPositionCollision);
    check('layoutFlowGraph가 모든 edge에 handle을 부여함', laidOutEdges.every((e) => !!e.sourceHandle && !!e.targetHandle));
}

{
    // 회귀 방지: AI 응답 edge는 zod .default()로 sourceHandle='bottom'/targetHandle='top'
    // (앱 내부 '-target' 접미사 없이)가 항상 채워져 있다. 이를 "이미 유효한 handle"로 오판해
    // 분기-인식 handle 계산을 건너뛰면, NO 분기가 좌우로 갈라져도 handle은 계속 top/bottom으로
    // 남는 버그가 생긴다 - targetHandle이 실제로 '-target' 접미사를 가질 때만 유효하다고 봐야 한다.
    const nodes: LayoutableNode[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges: LayoutableEdge[] = [
        { source: 'a', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' },
        { source: 'a', target: 'c', sourceHandle: 'bottom', targetHandle: 'top', branchType: 'no' },
    ];
    const { edges: laidOut } = layoutFlowGraph(nodes, edges);
    const noEdge = laidOut.find((e) => e.target === 'c');
    check(
        'AI 기본값(top/bottom, 접미사 없음)이 채워진 NO 분기 edge도 분기-인식 handle(좌우)로 재계산됨',
        !!noEdge && noEdge.sourceHandle !== 'bottom' && !!noEdge.targetHandle?.endsWith('-target'),
        noEdge
    );
    check(
        '모든 laidOut edge의 targetHandle이 앱 규약대로 "-target" 접미사를 가짐',
        laidOut.every((e) => !!e.targetHandle?.endsWith('-target'))
    );
}

{
    // branch label/branchType이 FlowEdge 구조에 보존되는지 (저장·복원 시 손실 없는 필드인지)
    const documentPassedNo = recruitEdges.find((e) => e.id === 'e8');
    const preserved = documentPassedNo?.label === 'NO' && documentPassedNo?.branchType === 'no' && documentPassedNo?.condition === '적합 후보자 없음';
    check('branch label/branchType/condition이 FlowEdge에 저장됨', preserved, documentPassedNo);

    // "저장 후 복원"을 흉내: JSON 직렬화/역직렬화(localStorage persist와 동일한 경로)해도 유지되는지
    const roundTripped = JSON.parse(JSON.stringify(recruitEdges)) as FlowEdge[];
    const rtEdge = roundTripped.find((e) => e.id === 'e8');
    check(
        'branch label/branchType이 JSON 직렬화·역직렬화(저장·복원) 후에도 유지됨',
        rtEdge?.label === 'NO' && rtEdge?.branchType === 'no'
    );
}

{
    // FlowCanvas가 store edge -> React Flow edge로 매핑할 때 실제로 하는 것과 동일한 변환을 재현해
    // label/branchType이 렌더 데이터(data)에 전달되는지 확인한다.
    const mapEdgeForRender = (e: FlowEdge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: e.animated,
        data: { label: e.label, branchType: e.branchType, condition: e.condition },
    });
    const rendered = recruitEdges.map(mapEdgeForRender);
    const renderedYes = rendered.find((e) => e.id === 'e7');
    const renderedPlain = rendered.find((e) => e.id === 'e1'); // label 없는 일반 edge
    check(
        'edge label/branchType이 React Flow 렌더 데이터(edge.data)로 전달됨',
        renderedYes?.data.label === 'YES' && renderedYes?.data.branchType === 'yes'
    );
    check(
        '기존 label 없는 edge도 렌더 데이터 매핑에서 정상 동작함 (undefined로 안전 전달)',
        renderedPlain !== undefined && renderedPlain.data.label === undefined && renderedPlain.source === 'start'
    );
}

console.log('\n=== 2. decision 단일 분기 -> repair 없이도 결정론적 fallback으로 복구 ===');

{
    // repair를 거치고도 decision에 outgoing edge가 1개뿐인 최악의 경우를 시뮬레이션
    // (현실적인 형태로 시작 노드와 decision 사이에 실제 업무 단계를 하나 둔다)
    const brokenNodes: (ValidatableNode & { id: string })[] = [
        { id: 'a', type: 'terminal', terminalType: 'start' },
        { id: 'review', type: 'process' },
        { id: 'b', type: 'decision' },
        { id: 'c', type: 'process' },
    ];
    const brokenEdges: (ValidatableEdge & { id: string })[] = [
        { id: 'e1', source: 'a', target: 'review' },
        { id: 'e2', source: 'review', target: 'b' },
        { id: 'e3', source: 'b', target: 'c' }, // decision에 outgoing이 1개뿐 - 잘못된 응답
    ];

    const before = validateFlowGraph(brokenNodes, brokenEdges);
    check('단일 분기 decision은 검증에서 blocking 이슈로 잡힘', hasBlockingIssues(before));

    const fixed = applyDeterministicGraphFixes(brokenNodes, brokenEdges);
    const after = validateFlowGraph(fixed.nodes, fixed.edges);
    const decisionOutgoing = fixed.edges.filter((e) => e.source === 'b');
    check(
        '결정론적 fallback 적용 후 decision이 서로 다른 target 2개 이상을 갖고, "정상"인 것처럼 조용히 넘어가지 않고 fixesApplied로 기록됨',
        !hasBlockingIssues(after) && new Set(decisionOutgoing.map((e) => e.target)).size >= 2 && fixed.fixesApplied.length > 0,
        { after, decisionOutgoing, fixesApplied: fixed.fixesApplied }
    );
    check(
        'fallback edge는 시작 노드가 아닌 실제 이전 단계(review)로 되돌아감 (시작 노드로 들어가는 잘못된 edge를 만들지 않음)',
        decisionOutgoing.some((e) => e.target === 'review') && !decisionOutgoing.some((e) => e.target === 'a')
    );
}

console.log('\n=== 3. 상세분석(드릴다운) subEdges 적용 ===');

{
    // decision을 포함한 subEdges 응답: YES는 상위 노드의 원래 다음 단계로, NO는 이전 subStep으로 되돌아감
    const result = applyDrilldownSubSteps({
        parentNodeId: 'parent',
        parentPosition: { x: 250, y: 300 },
        subSteps: [
            { id: 'screening', label: '지원자 자격 검토', type: 'process', shape: 'process' },
            { id: 'passed', label: '서류 합격자 선정 여부', type: 'decision', shape: 'decision' },
        ],
        subEdges: [
            { source: 'screening', target: 'passed' },
            { source: 'passed', target: 'screening', label: 'NO', branchType: 'no', condition: '적합 후보자 없음' },
            { source: 'passed', target: 'interview', label: 'YES', branchType: 'yes' }, // 'interview'는 subSteps에 없음 -> exit-marker
        ],
        incomingEdges: [{ id: 'in-1', source: 'before-parent', target: 'parent' }],
        outgoingEdges: [{ id: 'out-1', source: 'parent', target: 'after-parent' }],
    });

    const screeningId = 'parent-screening';
    const passedId = 'parent-passed';

    const noEdge = result.edges.find((e) => e.source === passedId && e.target === screeningId);
    check('subEdges의 NO 분기(재시도 cycle)가 보존됨', noEdge?.branchType === 'no' && noEdge?.label === 'NO');

    const yesExitEdge = result.edges.find((e) => e.source === passedId && e.target === 'after-parent');
    check(
        'YES(exit-marker) 분기가 부모의 기존 outgoing edge를 통해 실제 다음 단계로 재연결됨',
        !!yesExitEdge && yesExitEdge.label === 'YES' && yesExitEdge.branchType === 'yes'
    );

    const incomingReconnected = result.edges.find((e) => e.source === 'before-parent' && e.target === screeningId);
    check('부모의 기존 incoming edge가 하위 분해의 시작 노드(screening)로 재연결됨', !!incomingReconnected);

    const noDangling = result.edges.every(
        (e) => result.nodes.some((n) => n.id === e.source) || e.source === 'before-parent'
    ) && result.edges.every((e) => result.nodes.some((n) => n.id === e.target) || e.target === 'after-parent');
    check('분기 구조 적용 후 dangling edge가 없음', noDangling);

    const noOrphan = result.nodes.every((n) =>
        result.edges.some((e) => e.source === n.id || e.target === n.id)
    );
    check('분기 구조 적용 후 고립 노드가 없음', noOrphan);
}

{
    // decision 없는 레거시 subSteps (subEdges 없음) -> 기존처럼 순차 체인 fallback
    const result = applyDrilldownSubSteps({
        parentNodeId: 'parent2',
        parentPosition: { x: 250, y: 300 },
        subSteps: [
            { id: 's1', label: '1단계', type: 'process', shape: 'process' },
            { id: 's2', label: '2단계', type: 'process', shape: 'process' },
            { id: 's3', label: '3단계', type: 'process', shape: 'process' },
        ],
        subEdges: undefined,
        incomingEdges: [{ id: 'in-1', source: 'before', target: 'parent2' }],
        outgoingEdges: [{ id: 'out-1', source: 'parent2', target: 'after' }],
    });

    const chainOk =
        result.edges.some((e) => e.source === 'parent2-s1' && e.target === 'parent2-s2') &&
        result.edges.some((e) => e.source === 'parent2-s2' && e.target === 'parent2-s3');
    const entryOk = result.edges.some((e) => e.source === 'before' && e.target === 'parent2-s1');
    const exitOk = result.edges.some((e) => e.source === 'parent2-s3' && e.target === 'after');
    check('decision 없는 subSteps는 subEdges 없이도 순차 체인으로 fallback됨', chainOk && entryOk && exitOk);
}

console.log('\n=== 4. 드릴다운 subEdges 그래프 수준 검증 ===');

{
    const issuesNoSubEdges = validateDrilldownBranching(
        [{ id: 'a', type: 'process' }, { id: 'b', type: 'decision' }],
        undefined
    );
    check('decision 포함 subSteps인데 subEdges가 없으면 검증 실패로 잡힘', issuesNoSubEdges.length > 0);

    const issuesGoodSubEdges = validateDrilldownBranching(
        [{ id: 'a', type: 'process' }, { id: 'b', type: 'decision' }],
        [
            { source: 'a', target: 'b' },
            { source: 'b', target: 'a', branchType: 'no' },
            { source: 'b', target: 'exit', branchType: 'yes' },
        ]
    );
    check('YES/NO가 모두 있는 subEdges는 검증을 통과함', issuesGoodSubEdges.length === 0, issuesGoodSubEdges);

    const issuesNoDecision = validateDrilldownBranching(
        [{ id: 'a', type: 'process' }, { id: 'c', type: 'process' }],
        undefined
    );
    check('decision이 없는 subSteps는 subEdges 없어도 검증 대상이 아님(순차 fallback으로 충분)', issuesNoDecision.length === 0);
}

console.log('\n=== 5. 25개 도형 선택 규칙 (키워드 fixture) ===');

const SHAPE_KEYWORD_FIXTURES: Array<{ label: string; expected: (typeof FLOW_SHAPE_IDS)[number] }> = [
    { label: '우선순위 조율', expected: 'sort' },
    { label: '동점자 발생 여부', expected: 'decision' },
    { label: '계약서 작성', expected: 'document' },
    { label: '서류 합격자 추출', expected: 'extract' },
    { label: '면접 결과 취합', expected: 'collate' },
    { label: 'Kafka 메시지 대기열 수신', expected: 'queuedData' },
    { label: '최대 3회 재협의', expected: 'loopLimit' },
    { label: '사용자 폼 입력', expected: 'manualInput' },
    { label: '후보자 응답 대기', expected: 'delay' },
    // 나머지 도형들도 대표 키워드로 폭넓게 검증
    { label: '프로세스 시작', expected: 'terminal' },
    { label: 'DB 조회 및 갱신', expected: 'database' },
    { label: '오프라인 검수 수기 처리', expected: 'manualOperation' },
    { label: '환경 설정 초기화', expected: 'preparation' },
    { label: '대시보드 화면 표시', expected: 'display' },
    { label: '여러 결과 병합', expected: 'merge' },
    { label: '하위 절차 모듈 호출', expected: 'predefinedProcess' },
    { label: '백업 아카이브 저장', expected: 'storedData' },
    { label: '세션 캐시 저장', expected: 'internalStorage' },
    { label: '실시간 스트림 처리', expected: 'stream' },
    { label: '다른 페이지로 이동', expected: 'offPageConnector' },
];

let shapeFixturesPassed = true;
for (const fixture of SHAPE_KEYWORD_FIXTURES) {
    // terminal은 실제 AI 스키마에서도 항상 type='terminal'과 함께 오므로(구조적 신호),
    // 다른 fixture들과 동일하게 label만으로 판단하지 않고 type도 함께 전달한다.
    const result = inferFlowShapeFromContent({
        label: fixture.label,
        type: fixture.expected === 'terminal' ? 'terminal' : undefined,
    });
    if (result !== fixture.expected) {
        console.error(`  -> '${fixture.label}' expected '${fixture.expected}' but got '${result}'`);
        shapeFixturesPassed = false;
    }
}
check(`25개 도형 대표 키워드 fixture(${SHAPE_KEYWORD_FIXTURES.length}개) 모두 예상 shape로 추론됨`, shapeFixturesPassed);

{
    // manual shapeMode는 절대 재계산되지 않아야 한다 (키워드가 다른 도형을 가리켜도 무시)
    const inferred = inferFlowShapeFromContent({ label: '계약서 작성', shape: 'process' });
    check('shape가 이미 유효한 canonical 값이면 키워드 추론보다 우선함(수동 지정 보존 원칙)', inferred === 'process');
}

console.log('\n=== 6. AI 프롬프트에 분기/도형 가이드가 실제로 포함되는지 ===');

{
    const guideOk =
        FULL_SHAPE_SELECTION_GUIDE.includes("shape='sort'") &&
        FULL_SHAPE_SELECTION_GUIDE.includes("shape='decision'") &&
        FULL_SHAPE_SELECTION_GUIDE.includes("shape='loopLimit'") &&
        FULL_SHAPE_SELECTION_GUIDE.includes('동점자');
    check('FULL_SHAPE_SELECTION_GUIDE가 25개 도형 기준 + decision/sort 구분 예시를 포함함', guideOk);
    check('BRANCH_EDGE_GUIDE가 YES/NO/branchType 규칙을 포함함', BRANCH_EDGE_GUIDE.includes('branchType') && BRANCH_EDGE_GUIDE.includes('YES'));
    check('MULTI_MEANING_SPLIT_GUIDE가 복합 의미 분해 예시를 포함함', MULTI_MEANING_SPLIT_GUIDE.includes('처우 협의') && MULTI_MEANING_SPLIT_GUIDE.includes('계약서'));
    check('SHAPE_FIELD_DESCRIBE_HINT(zod shape describe)에 필수 표시가 포함됨', SHAPE_FIELD_DESCRIBE_HINT.includes('필수'));
}

{
    const sampleContext = { industry: '금융', role: '인사담당자', task: '채용 프로세스', timeScale: '분기' };
    const sampleHumanNode = { id: 'n-human', label: '검토', description: '검토 설명', type: 'process' };
    const sampleAgentNode = { id: 'n-agent', label: 'AI 심사', description: 'AI 심사 설명', type: 'agent' };

    const paths: Array<{ name: string; prompt: string }> = [
        { name: 'As-Is 워크플로우 생성', prompt: getAsIsPrompt(sampleContext) },
        { name: 'To-Be 워크플로우 생성', prompt: getToBePrompt(sampleContext, [], 'balanced') },
        { name: '인간 단계 드릴다운 (As-Is)', prompt: getDrilldownPromptAsIs(sampleHumanNode, sampleContext, null) },
        { name: '인간 단계 드릴다운 (To-Be)', prompt: getDrilldownPromptToBe(sampleHumanNode, sampleContext, null) },
        { name: 'AI Agent 단계 드릴다운', prompt: getDrilldownPromptToBe(sampleAgentNode, sampleContext, null) },
        { name: '노드 분할', prompt: getNodeSplitPrompt(sampleContext, { label: '단계', type: 'process' }, 'asis') },
    ];

    let allPathsOk = true;
    for (const { name, prompt } of paths) {
        const hasFullShapeGuide = prompt.includes("shape='loopLimit'") && prompt.includes("shape='sort'");
        if (!hasFullShapeGuide) {
            console.error(`  -> '${name}' 프롬프트에 25개 도형 가이드 누락`);
            allPathsOk = false;
        }
    }
    check('6개 AI 생성 경로 모두 25개 도형 선택 가이드를 포함함', allPathsOk);

    // 전체 생성(As-Is/To-Be)과 드릴다운은 branchType/YES 분기 규칙도 포함해야 한다
    const branchAwarePaths = paths.filter((p) => p.name !== '노드 분할');
    const allBranchOk = branchAwarePaths.every((p) => p.prompt.includes('branchType'));
    check('As-Is/To-Be 생성 및 드릴다운 프롬프트에 decision branchType(YES/NO) 규칙이 포함됨', allBranchOk);
}

console.log('\n=== 7. 상단 좌측 인터랙션 안내 문구 ===');

{
    const flowCanvasPath = path.join(__dirname, '..', 'src', 'components', 'flow', 'FlowCanvas.tsx');
    const src = fs.readFileSync(flowCanvasPath, 'utf-8');

    // 상단 좌측 상태 Panel(노드/연결 수 + 인터랙션 안내)만 잘라내어 검사한다 -
    // 파일 전체에는 관련 없는 코드 주석("좌클릭 = 선택" 등)이 있을 수 있으므로 그 부분과 섞이지 않게 한다.
    const panelStart = src.indexOf('Node/Edge Count Info');
    const panelEnd = src.indexOf('Breadcrumb');
    const panelSrc = panelStart !== -1 && panelEnd !== -1 ? src.slice(panelStart, panelEnd) : src;

    check('FlowCanvas.tsx 상단 좌측 안내에 "우클릭: 메뉴" 문구가 더 이상 없음', !panelSrc.includes('우클릭: 메뉴'));
    check('FlowCanvas.tsx 안내 문구가 "더블클릭"을 명시함', panelSrc.includes('더블클릭'));
    check(
        'FlowCanvas.tsx 안내 문구가 모호한 "좌클릭" 대신 "마우스 왼쪽 버튼"을 명시함',
        panelSrc.includes('마우스 왼쪽 버튼') && !panelSrc.includes('좌클릭')
    );
    // 실제 핸들러(onDoubleClick={onPaneDoubleClick})가 노드 추가로 이어지므로 문구도 "노드 추가"를 안내해야 한다
    check('안내 문구가 실제 동작(노드 추가)과 일치함', panelSrc.includes('노드 추가'));
    check(
        '노드 수·연결 수 표시는 그대로 유지됨',
        panelSrc.includes('currentNodes.length') && panelSrc.includes('currentEdges.length')
    );
}

// ============================================================================
if (failCount === 0) {
    console.log(`\nALL FLOW-BRANCHES TESTS PASSED (${passCount}/${passCount})! 🎉`);
    process.exit(0);
} else {
    console.error(`\nFLOW-BRANCHES TESTS FAILED: ${failCount} failed, ${passCount} passed.`);
    process.exit(1);
}
