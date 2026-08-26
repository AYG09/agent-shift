/**
 * Wave 0 Foundation — 공용 node 작성 품질 계약 테스트.
 *
 * 개인 SOP(Session E)와 대표 표준안(Session F)이 **같은** validator를 쓰기 때문에,
 * 여기서 통과/차단되는 fixture는 두 생성 경로 모두에 동일하게 적용된다. 규칙별로
 * blocking과 warning을 구분해 검증한다 — 자연어 lint를 blocking으로 만들면 정상
 * 생성이 과차단되고, 근거 없는 수치나 미등록 tool을 warning으로 두면 계약이
 * 무의미해진다.
 */
import assert from 'node:assert/strict';
import {
    SOP_NODE_INSTRUCTION_CONTRACT_VERSION,
    SopAgentInstructionSpecSchema,
    SopNodeExecutionSpecSchema,
    createToolRegistry,
    formatSopNodeQualityIssues,
    validateSopNodeAuthoring,
    type SopAgentInstructionSpec,
    type SopNodeAuthoringStepInput,
    type SopNodeExecutionSpec,
    type SopNodeQualityIssueCode,
} from '../src/lib/sop-node-authoring-contract';
import { renderSopNodeMarkdown } from '../src/lib/sop-node-markdown';
import { SopDocumentSchema } from '../src/lib/sop-document-schema';
import { SopGenerationWireSchema, normalizeSopGenerationObject } from '../src/lib/sop-schemas';

void (async () => {

const registry = createToolRegistry([
    { id: 'ats.read_application', label: '지원서 조회', allowedScopes: ['read'], highImpact: false },
    { id: 'ats.write_review', label: '검토 결과 기록', allowedScopes: ['read', 'write'], highImpact: false },
    { id: 'mail.send_offer', label: '처우 안내 발송', allowedScopes: ['read', 'send'], highImpact: true },
]);

const GROUNDING = [
    'Task 정의: 채용 요청 접수부터 최종 합격 통보까지의 채용 프로세스를 운영한다.',
    'Activity 설명: 지원자 제출서류를 필수항목 목록과 대조하고 누락 시 보완을 요청한다.',
    '업무맥락: 서류 보완 요청은 접수일 기준 3일 이내에 처리한다.',
];

const mission: SopAgentInstructionSpec = {
    objective: '채용 요청 접수부터 최종 합격 통보까지를 누락 없이 수행한다.',
    successCriteria: ['모든 지원자의 서류 검토 결과가 기록된다.'],
    globalConstraints: ['지원자 개인정보를 외부 저장소에 복사하지 않는다.'],
    glossary: [{ term: 'ATS', definition: '채용관리 시스템' }],
};

const goodSpec: SopNodeExecutionSpec = {
    actorRole: '채용 운영 담당자',
    action: { verb: '대조한다', object: '지원자 제출서류를 필수항목 목록과' },
    completionCriteria: ['누락 항목과 충족 항목이 구분된 검토 결과가 기록된다.'],
    decisionCriteria: [],
    toolPolicy: { allowedToolIds: ['ats.read_application', 'ats.write_review'], forbiddenActions: ['지원자 원본 서류 외부 반출'], dataAccessScope: ['read', 'write'], requiresHumanApproval: false },
    escalationRules: [{ trigger: '필수항목 판정 기준이 없는 서류가 접수됨', targetRole: '채용 운영 책임자', requiredEvidence: ['접수 서류 목록'], agentMayContinue: false }],
};

const goodStep: SopNodeAuthoringStepInput = {
    id: 'S-001',
    title: '지원자 제출서류를 필수항목 목록과 대조',
    definition: '접수된 제출서류의 각 항목을 필수항목 목록과 대조해 누락 여부가 구분된 검토 결과를 남긴다.',
    shape: 'process',
    executionSpec: goodSpec,
};

const terminalStart: SopNodeAuthoringStepInput = { id: 'T-start', title: '채용 프로세스 시작', definition: '시작', shape: 'terminal', terminalType: 'start' };
const terminalEnd: SopNodeAuthoringStepInput = { id: 'T-end', title: '채용 프로세스 종료', definition: '종료', shape: 'terminal', terminalType: 'end' };

const codesOf = (issues: { code: SopNodeQualityIssueCode }[]) => issues.map((issue) => issue.code);

console.log('TST-NODE-001/007: 잘 작성된 노드는 통과하고 계약 필드가 보존된다...');
const goodReport = validateSopNodeAuthoring({ agentInstruction: mission, steps: [terminalStart, goodStep, terminalEnd], groundingTexts: GROUNDING, toolRegistry: registry });
assert.equal(goodReport.ok, true, `정상 fixture는 blocking이 없어야 한다: ${formatSopNodeQualityIssues(goodReport.blockingIssues).join(' / ')}`);
assert.equal(goodReport.contractVersion, SOP_NODE_INSTRUCTION_CONTRACT_VERSION);
assert.equal(goodReport.warningIssues.length, 0, `정상 fixture에는 warning도 없어야 한다: ${formatSopNodeQualityIssues(goodReport.warningIssues).join(' / ')}`);

const parsedSpec = SopNodeExecutionSpecSchema.parse(goodSpec);
assert.equal(parsedSpec.actorRole, goodSpec.actorRole, 'responsibleRole/actorRole이 schema를 통과해도 보존된다.');
assert.deepEqual(parsedSpec.toolPolicy.allowedToolIds, goodSpec.toolPolicy.allowedToolIds);
assert.equal(parsedSpec.escalationRules[0].agentMayContinue, false, 'HITL 의미가 보존된다.');
assert.equal(SopAgentInstructionSpecSchema.parse(mission).glossary[0].term, 'ATS');

console.log('TST-NODE-008: terminal은 실행 명세 대상이 아니다...');
const terminalOnly = validateSopNodeAuthoring({ agentInstruction: mission, steps: [terminalStart, terminalEnd], groundingTexts: GROUNDING, toolRegistry: registry });
assert.equal(terminalOnly.ok, true, 'terminal만 있는 문서에서 실행 명세를 요구하지 않는다.');
const terminalWithSpec = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ ...terminalStart, executionSpec: goodSpec }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(terminalWithSpec.blockingIssues).includes('terminal-has-execution-spec'), 'terminal에 실행 명세가 남아 있으면 blocking이다.');

console.log('TST-NODE-002/005/006: 피동·복합 행동·미정의 약어·title 반복은 사람 검토 대상(warning)...');
const lintReport = validateSopNodeAuthoring({
    agentInstruction: { ...mission, glossary: [] },
    steps: [
        {
            id: 'S-lint',
            title: '서류를 확인하고 결과를 기록하고 담당자에게 전달',
            definition: '서류를 확인하고 결과를 기록하고 담당자에게 전달',
            shape: 'process',
            executionSpec: { ...goodSpec, completionCriteria: [] },
        },
        {
            id: 'S-passive',
            title: '지원서 검토',
            definition: '지원서는 담당자에 의해 검토되어야 한다. ATS에 결과를 남긴다.',
            shape: 'process',
            executionSpec: goodSpec,
        },
    ],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
const lintCodes = codesOf(lintReport.warningIssues);
assert(lintCodes.includes('compound-action'), 'TST-NODE-006: 여러 행동이 한 노드에 들어간 title은 검출된다.');
assert(lintCodes.includes('definition-repeats-title'), 'title을 반복하는 definition은 검출된다.');
assert(lintCodes.includes('unobservable-completion-criteria'), '완료 기준이 없으면 검출된다.');
assert(lintCodes.includes('passive-voice'), 'TST-NODE-002: 책임자가 사라지는 피동 표현은 검출된다.');
assert(lintCodes.includes('undefined-abbreviation'), 'TST-NODE-005: glossary에 없는 약어는 검출된다.');
assert.equal(lintReport.ok, true, '문장 품질 이슈만으로 생성을 차단하지 않는다 — 정규식은 후보 탐색 수단이다.');

console.log('TST-NODE-003: 관찰 불가능한 분기 조건은 확정 rule로 통과하지 못한다...');
const ambiguousDecision = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [
        {
            id: 'S-decide',
            title: '보완 요청 여부 판단',
            definition: '접수 서류의 누락 여부에 따라 보완 요청 단계로 보낼지 판단한다.',
            shape: 'decision',
            executionSpec: {
                ...goodSpec,
                decisionCriteria: [{ condition: '필요 시 적절히', outcome: '보완 요청', sourceType: 'member-context' }],
            },
        },
    ],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(ambiguousDecision.blockingIssues).includes('unobservable-decision-condition'), '"필요 시 적절히"만 있는 조건은 blocking이다.');
assert.equal(ambiguousDecision.ok, false);

const observableAmbiguous = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [
        {
            id: 'S-decide2',
            title: '보완 요청 여부 판단',
            definition: '필수항목 누락 여부로 보완 요청 단계 진입을 판단한다.',
            shape: 'decision',
            executionSpec: { ...goodSpec, decisionCriteria: [{ condition: '필수항목이 하나라도 누락', outcome: '보완 요청 단계로 이동', sourceType: 'work-map' }] },
        },
    ],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert.equal(observableAmbiguous.ok, true, '관찰 가능한 조건은 통과한다.');

const decisionWithoutCriteria = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ id: 'S-decide3', title: '진행 여부 판단', definition: '다음 단계 진행 여부를 판단한다.', shape: 'decision', executionSpec: { ...goodSpec, decisionCriteria: [] } }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(decisionWithoutCriteria.blockingIssues).includes('decision-missing-criteria'), '분기 조건이 없는 판단 노드는 blocking이다.');

console.log('TST-NODE-004: 입력에 없는 수치 기준은 blocking이다...');
const inventedThreshold = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [
        {
            id: 'S-threshold',
            title: '서류 적합도 판정',
            definition: '서류 적합도를 판정한다.',
            shape: 'decision',
            executionSpec: { ...goodSpec, decisionCriteria: [{ condition: '적합도 80% 이상', outcome: '면접 단계로 이동', sourceType: 'policy' }] },
        },
    ],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(inventedThreshold.blockingIssues).includes('ungrounded-threshold'), '입력에 없는 80% 기준은 sourceType 라벨이 있어도 통과하지 않는다.');

const groundedThreshold = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [
        {
            id: 'S-threshold2',
            title: '보완 요청 기한 확인',
            definition: '보완 요청 처리 기한을 확인한다.',
            shape: 'decision',
            executionSpec: { ...goodSpec, decisionCriteria: [{ condition: '접수일 기준 3일 이내 미보완', outcome: '재안내', sourceType: 'member-context' }] },
        },
    ],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert.equal(groundedThreshold.ok, true, '입력 원문에 실제로 있는 "3일" 기준은 통과한다.');

console.log('TST-AOP-001/002/003: tool 권한과 HITL...');
const unknownTool = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ ...goodStep, executionSpec: { ...goodSpec, toolPolicy: { ...goodSpec.toolPolicy, allowedToolIds: ['hr.master.delete_record'] } } }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(unknownTool.blockingIssues).includes('unknown-tool-id'), 'TST-AOP-001: registry에 없는 tool ID는 blocking이다.');

const excessScope = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ ...goodStep, executionSpec: { ...goodSpec, toolPolicy: { ...goodSpec.toolPolicy, allowedToolIds: ['ats.read_application'], dataAccessScope: ['read', 'send'] } } }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(excessScope.blockingIssues).includes('data-access-scope-not-allowed'), 'TST-AOP-002: read 전용 tool이 send 권한을 얻지 못한다.');

const highImpactWithoutApproval = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ ...goodStep, executionSpec: { ...goodSpec, toolPolicy: { allowedToolIds: ['mail.send_offer'], forbiddenActions: [], dataAccessScope: ['send'], requiresHumanApproval: false } } }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(highImpactWithoutApproval.blockingIssues).includes('high-impact-tool-without-approval'), 'TST-AOP-003: 고영향 tool은 승인 없이 실행 가능 상태가 될 수 없다.');

const contradiction = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ ...goodStep, executionSpec: { ...goodSpec, toolPolicy: { ...goodSpec.toolPolicy, forbiddenActions: ['ats.write_review'] } } }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
assert(codesOf(contradiction.blockingIssues).includes('forbidden-action-allowed'), '금지 행동을 동시에 허용하는 policy는 blocking이다.');

console.log('TST-AOP-004: 근거가 없는 대상 역할·자료는 발명하지 않고 미해소로 남긴다...');
const unresolved = validateSopNodeAuthoring({
    agentInstruction: mission,
    steps: [{ ...goodStep, executionSpec: { ...goodSpec, escalationRules: [{ trigger: '판정 기준 부재', requiredEvidence: [], agentMayContinue: false }] } }],
    groundingTexts: GROUNDING,
    toolRegistry: registry,
});
const unresolvedCodes = codesOf(unresolved.warningIssues);
assert(unresolvedCodes.includes('unresolved-escalation-role'), '대상 역할이 없으면 임의 역할을 만들지 않고 미해소 이슈로 남긴다.');
assert(unresolvedCodes.includes('missing-escalation-evidence'));

console.log('실행 명세 누락과 Mission 누락의 severity 구분...');
const missingSpec = validateSopNodeAuthoring({ agentInstruction: mission, steps: [{ id: 'S-x', title: '서류 확인', definition: '서류를 확인한다.', shape: 'process' }], groundingTexts: GROUNDING, toolRegistry: registry });
assert(codesOf(missingSpec.blockingIssues).includes('missing-execution-spec'));
const legacyMode = validateSopNodeAuthoring({ steps: [{ id: 'S-x', title: '서류 확인', definition: '서류를 확인한다.', shape: 'process' }], groundingTexts: GROUNDING, toolRegistry: registry, requireExecutionSpec: false });
assert.equal(legacyMode.ok, true, '계약 도입 이전 문서를 검사할 때는 실행 명세 부재가 blocking이 아니다.');
assert(codesOf(legacyMode.warningIssues).includes('missing-mission'), 'Mission 부재는 warning으로 표면화된다.');

console.log('TST-AOP-006: 같은 구조 객체는 안정적인 Markdown으로 투영된다...');
const markdown = renderSopNodeMarkdown({
    title: '채용 프로세스 운영 SOP',
    agentInstruction: mission,
    steps: [
        { id: terminalStart.id, title: terminalStart.title, terminalType: 'start' },
        {
            id: goodStep.id,
            title: goodStep.title,
            definition: goodStep.definition,
            inputs: ['지원자 제출서류', '필수항목 목록'],
            outputs: ['서류 검토 결과'],
            sourceActivityOrder: 3,
            executionSpec: goodSpec,
        },
        { id: terminalEnd.id, title: terminalEnd.title, terminalType: 'end' },
    ],
});
assert(markdown.includes('# Mission'), 'Mission 섹션이 문서 수준에 한 번 나온다.');
assert(markdown.includes('## Glossary'));
assert(markdown.includes('- ATS: 채용관리 시스템'));
assert(markdown.includes('## Step S-01 — 지원자 제출서류를 필수항목 목록과 대조'), '단계 번호 포맷은 sop-format의 SSOT를 따른다.');
assert(markdown.includes('- Actor: 채용 운영 담당자'), '책임 역할이 투영에 보존된다.');
assert(markdown.includes('- Source Activity: A03'), 'Activity 코드 포맷도 SSOT를 따른다.');
assert(markdown.includes('- Allowed tools: ats.read_application, ats.write_review'));
assert(markdown.includes('- Escalation: 필수항목 판정 기준이 없는 서류가 접수됨 → 채용 운영 책임자'));
assert(!markdown.includes('## Step S-02'), 'terminal은 업무 단계 번호를 소비하지 않는다.');
assert.equal(markdown, renderSopNodeMarkdown({
    title: '채용 프로세스 운영 SOP',
    agentInstruction: mission,
    steps: [
        { id: terminalStart.id, title: terminalStart.title, terminalType: 'start' },
        { id: goodStep.id, title: goodStep.title, definition: goodStep.definition, inputs: ['지원자 제출서류', '필수항목 목록'], outputs: ['서류 검토 결과'], sourceActivityOrder: 3, executionSpec: goodSpec },
        { id: terminalEnd.id, title: terminalEnd.title, terminalType: 'end' },
    ],
}), '같은 입력은 항상 같은 Markdown을 만든다(결정론적).');

console.log('Wire → normalize → document: 실행 명세와 Mission이 계층을 건너 보존된다...');
const wireResponse = {
    title: '채용 프로세스 운영 SOP',
    agentInstruction: { objective: mission.objective, successCriteria: mission.successCriteria, globalConstraints: mission.globalConstraints, glossary: mission.glossary },
    steps: [
        { id: 'T-start', title: '시작', definition: '프로세스 시작', shape: 'terminal', terminalType: 'start', requiredSkills: [], executionSpec: goodSpec },
        { id: 'S-001', title: goodStep.title, definition: goodStep.definition, shape: 'process', requiredSkills: [], sourceActivityIds: ['activity-1'], subActionOrder: 1, subActionOrigin: 'activity-derived', executionSpec: goodSpec },
        { id: 'T-end', title: '종료', definition: '프로세스 종료', shape: 'terminal', terminalType: 'end', requiredSkills: [] },
    ],
    edges: [
        { id: 'e1', source: 'T-start', target: 'S-001' },
        { id: 'e2', source: 'S-001', target: 'T-end' },
    ],
};
const wireParsed = SopGenerationWireSchema.parse(wireResponse);
assert.equal(wireParsed.agentInstruction?.objective, mission.objective, '와이어 스키마가 Mission을 수용한다.');
const normalized = normalizeSopGenerationObject(wireParsed) as { steps: Record<string, unknown>[] };
assert.equal(normalized.steps[0].executionSpec, undefined, 'terminal에 남은 실행 명세는 정규화가 제거한다.');
assert((normalized.steps[1].executionSpec as SopNodeExecutionSpec).actorRole, '업무 단계의 실행 명세는 정규화 후에도 남는다.');

const persisted = SopDocumentSchema.safeParse({
    id: 'doc-1',
    title: '채용 프로세스 운영 SOP',
    member: { name: '김구성', jobRole: 'Talent Acquisition' },
    workLibrary: {
        taskId: 'task-1',
        taskName: '채용 프로세스 운영 및 최적화',
        taskCatalog: [{ id: 'task-1', name: '채용 프로세스 운영 및 최적화', activities: [{ id: 'activity-1', order: 1, name: '서류 검토', skills: [] }] }],
        skills: [],
        sourceType: 'task',
        confirmed: true,
    },
    context: '채용 업무 맥락',
    steps: [
        { id: 'S-001', title: goodStep.title, definition: goodStep.definition, shape: 'process', position: { x: 0, y: 0 }, reviewStatus: 'ai-draft', requiredSkills: [], sourceActivityIds: ['activity-1'], subActionOrder: 1, subActionOrigin: 'activity-derived', executionSpec: goodSpec },
    ],
    edges: [],
    reviewStatus: 'ai-draft',
    agentInstruction: mission,
    instructionContractVersion: SOP_NODE_INSTRUCTION_CONTRACT_VERSION,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
});
assert.equal(persisted.success, true, `저장 스키마가 Mission·실행 명세를 수용해야 한다: ${persisted.success ? '' : persisted.error.message}`);
if (persisted.success) {
    assert.equal(persisted.data.steps[0].executionSpec?.actorRole, goodSpec.actorRole, 'TST-NODE-007: 실행 명세가 저장 계층까지 보존된다.');
    assert.equal(persisted.data.instructionContractVersion, SOP_NODE_INSTRUCTION_CONTRACT_VERSION);
}

const terminalRejected = SopDocumentSchema.safeParse({
    ...(persisted.success ? persisted.data : {}),
    steps: [{ id: 'T-start', title: '시작', definition: '시작', shape: 'terminal', terminalType: 'start', position: { x: 0, y: 0 }, reviewStatus: 'ai-draft', requiredSkills: [], executionSpec: goodSpec }],
});
assert.equal(terminalRejected.success, false, '저장 스키마도 terminal의 실행 명세를 거부한다(이중 방어).');

console.log('✅ SOP node 작성 계약 도메인 테스트 통과.');
})();
