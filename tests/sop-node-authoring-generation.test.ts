/**
 * Wave 1E — 개인 SOP 생성 파이프라인의 Agent-ready node 작성 품질 계약 테스트.
 *
 * docs/sop-member-context-redesign/work-orders/06_WAVE1E_MEMBER_NODE_GENERATION.md의
 * 수용 기준대로, prompt 문자열 존재 확인에 그치지 않고 runner의
 * wire(raw object) → normalize → validate(그래프 + node authoring) → document(영속 문서)
 * 전 구간을 실제로 실행한다. Foundation의 공용 validator(sop-node-authoring-contract.ts)는
 * 이미 tests/sop-node-authoring-domain.test.ts가 순수 함수 수준에서 검증하므로, 여기서는
 * getSopPrompt가 그 계약을 실제로 요청하는지, 그리고 sop-generation-runner.ts가 그 결과를
 * 생성 파이프라인(그래프 검증·Activity coverage·repair 예산·문서 변환)과 올바르게
 * 결합하는지에 집중한다.
 */
import { getSopPrompt } from '../src/server/sop/sop-prompt';
import { runSopGenerationPostProcessing } from '../src/server/sop/sop-generation-runner';
import { createSopDocumentFromGeneration } from '../src/lib/sop-normalizer';
import { SOP_NODE_INSTRUCTION_CONTRACT_VERSION } from '../src/lib/sop-node-authoring-contract';
import { SAMPLE_WORK_LIBRARY, SAMPLE_SOP_DOCUMENT } from '../src/lib/sop-sample-data';
import type { SopGenerationRequest } from '../src/lib/sop-ai-request';

console.log('=== SOP Wave 1E — node authoring generation pipeline tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

// 단일 Activity로 고정해 Activity coverage / under-decomposition repair 경로가
// node-authoring repair와 뒤섞이지 않게 한다 (호출 횟수 단언을 깨끗하게 유지).
const activity = SAMPLE_WORK_LIBRARY.taskCatalog[0].activities[0];
// 1E-1 항목 2: authoring과 coverage 결함이 "동시에" 있는 fixture를 만들 때만 사용한다.
const secondActivity = SAMPLE_WORK_LIBRARY.taskCatalog[0].activities[1];
const taskDefinition = SAMPLE_WORK_LIBRARY.taskCatalog[0].description!;
// "3일"은 아래 groundingTexts(context)에 그대로 등장해 근거가 있는 수치다.
const memberContext = '채용 요청서는 접수 후 3일 이내 1차 검토를 완료합니다. 구매성 지출은 500만원을 초과하면 팀장 승인을 받습니다.';

function buildSopRequest(overrides: Partial<SopGenerationRequest> = {}): SopGenerationRequest {
    return {
        action: 'generateSop',
        memberRole: '채용담당자',
        taskName: SAMPLE_WORK_LIBRARY.taskName,
        taskDefinition,
        sourceType: 'task',
        structureVersion: 'activity-subaction-v1',
        activities: [{ id: activity.id, order: 1, name: activity.name, description: activity.description, skills: [] }],
        skills: [],
        context: memberContext,
        detailLevel: 'standard',
        minSteps: 2,
        maxSteps: 4,
        branchPolicy: 'auto',
        maxBranches: 2,
        allowRework: true,
        ...overrides,
    } as unknown as SopGenerationRequest;
}

type StepOverrides = Record<string, unknown>;

function cleanExecutionSpec(overrides: StepOverrides = {}) {
    return {
        actorRole: '채용담당자',
        action: { verb: '검토한다', object: '채용 요청서를' },
        completionCriteria: ['채용 요청서 검토 결과가 기록된다.'],
        decisionCriteria: [],
        toolPolicy: { allowedToolIds: [], forbiddenActions: [], dataAccessScope: [], requiresHumanApproval: false },
        escalationRules: [],
        ...overrides,
    };
}

function cleanStep(id: string, order: number, overrides: StepOverrides = {}) {
    return {
        id,
        title: '채용 요청서 검토',
        definition: '채용담당자가 채용 요청서의 필수 항목을 검토해 진행 여부를 판단한다.',
        shape: 'process',
        sourceActivityIds: [activity.id],
        subActionOrder: order,
        subActionOrigin: 'activity-derived',
        agentizationSuggestion: { type: 'ai-assist', rationale: '사람의 판단을 AI가 지원할 수 있습니다.' },
        executionSpec: cleanExecutionSpec(),
        ...overrides,
    };
}

function buildObject(step1Overrides: StepOverrides = {}, step2Overrides: StepOverrides = {}, docOverrides: StepOverrides = {}) {
    return {
        title: '채용 요청서 처리 SOP',
        agentInstruction: {
            objective: '채용 요청을 접수해 승인된 채용 안건으로 전환한다.',
            successCriteria: ['모든 채용 요청서가 검토·기록된다.'],
            globalConstraints: [],
            glossary: [{ term: 'ATS', definition: '채용관리 시스템' }],
        },
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
            cleanStep('step-1', 1, step1Overrides),
            cleanStep('step-2', 2, step2Overrides),
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'step-1' },
            { id: 'e2', source: 'step-1', target: 'step-2' },
            { id: 'e3', source: 'step-2', target: 'end' },
        ],
        ...docOverrides,
    };
}

async function run() {
    // ---------------------------------------------------------
    // Prompt: Mission·execution spec·tool/HITL 지침이 실제로 요청된다 (source-string
    // 확인은 아래 파이프라인 실행 테스트의 보조 증거일 뿐, 그 자체로 완료를 주장하지 않는다).
    // ---------------------------------------------------------
    console.log('getSopPrompt: agent-ready Mission/execution spec instructions...');
    const subActionPrompt = getSopPrompt({
        taskName: SAMPLE_WORK_LIBRARY.taskName,
        taskDefinition,
        sourceType: 'task',
        structureVersion: 'activity-subaction-v1',
        activities: [{ id: activity.id, order: 1, name: activity.name, description: activity.description }],
        context: memberContext,
    });
    check(subActionPrompt.includes('Mission 작성 지침') && subActionPrompt.includes('agentInstruction'), 'The prompt requests a document-level Mission (agentInstruction)');
    check(subActionPrompt.includes('actorRole') && subActionPrompt.includes('completionCriteria') && subActionPrompt.includes('decisionCriteria'), 'The prompt requests actorRole, completionCriteria, and decisionCriteria on every business node');
    check(subActionPrompt.includes('toolPolicy') && subActionPrompt.includes('등록된 tool registry가 없습니다') && subActionPrompt.includes('발명하지'), 'The prompt forbids inventing tool IDs/permissions when no registry is provided');
    check(subActionPrompt.includes('targetRole') && subActionPrompt.includes('임의로'), 'The prompt forbids inventing an escalation targetRole not present in the input');
    check(subActionPrompt.includes('80%') && subActionPrompt.includes('SLA') && subActionPrompt.includes('입력에 없는 수치를 새로 만들지'), 'The prompt explicitly forbids fabricating thresholds/SLAs absent from the input');
    check(subActionPrompt.includes('피동 표현'), 'The prompt requires active voice over passive constructions');
    check(subActionPrompt.includes('terminal(시작/종료) 단계에는 executionSpec을 절대 넣지 마세요'), 'The prompt explicitly exempts terminal nodes from the execution spec requirement');

    const legacyPrompt = getSopPrompt({
        taskName: SAMPLE_WORK_LIBRARY.taskName,
        taskDefinition,
        sourceType: 'activity',
        activityName: activity.name,
        activities: [{ id: activity.id, order: 1, name: activity.name, description: activity.description }],
        context: memberContext,
    });
    check(!legacyPrompt.includes('Mission 작성 지침') && !legacyPrompt.includes('Agent-ready 실행 명세'), 'A legacy Activity-scope prompt (no structureVersion) is NOT asked for Mission/execution spec — no regression on the old generation path');

    // ---------------------------------------------------------
    // Good fixture: action/role/completion-criteria/tool-HITL semantics survive
    // wire -> normalize -> validate -> document without any repair call.
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: a well-formed Agent-ready fixture passes with zero repair calls...');
    const goodSopRequest = buildSopRequest();
    let goodRepairCalls = 0;
    const goodResult = await runSopGenerationPostProcessing({
        object: buildObject(),
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            goodRepairCalls++;
            throw new Error('repair must not be called for an already-compliant document');
        },
    });
    check(goodResult.ok, `A well-formed Agent-ready fixture must pass, got: ${!goodResult.ok ? await goodResult.response.text() : ''}`);
    check(goodRepairCalls === 0, 'No repair call is made when the generated object already satisfies the node authoring contract');
    if (goodResult.ok) {
        const steps = (goodResult.object as { steps: { id: string; executionSpec?: { actorRole?: string } }[] }).steps;
        const businessStep = steps.find((s) => s.id === 'step-1')!;
        check(businessStep.executionSpec?.actorRole === '채용담당자', 'The executionSpec.actorRole survives wire -> normalize -> validate unchanged');

        // document: the client-side normalizer that turns the validated object into the
        // persisted SopDocument must ALSO preserve Mission/executionSpec (TST-NODE-007) —
        // otherwise Foundation's document-level schema fields would never be reachable.
        //
        // instructionContractVersion is passed EXPLICITLY, not derived from structureVersion —
        // per NODE_AUTHORING_AND_AGENT_CONTROL.md §4.4 this stamp records "actually produced and
        // validated under the node-authoring contract," which is a distinct fact from "this
        // document happens to use the Activity–Sub Action structure." A standard-draft document
        // has no structureVersion at all yet can still pass node-authoring validation, so deriving
        // the stamp from structureVersion would make that document permanently unstampable — the
        // caller (this generation path, once wired by Wave 2's sop-ai-generation.ts) must assert it.
        const document = createSopDocumentFromGeneration({
            rawResponse: goodResult.object,
            member: SAMPLE_SOP_DOCUMENT.member,
            workLibrary: SAMPLE_WORK_LIBRARY,
            context: memberContext,
            setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig!,
            structureVersion: 'activity-subaction-v1',
            instructionContractVersion: SOP_NODE_INSTRUCTION_CONTRACT_VERSION,
        });
        check(document.agentInstruction?.objective === '채용 요청을 접수해 승인된 채용 안건으로 전환한다.', 'createSopDocumentFromGeneration preserves the document-level Mission');
        check(document.instructionContractVersion === SOP_NODE_INSTRUCTION_CONTRACT_VERSION, 'The persisted document is stamped with the node authoring contract version when the caller explicitly asserts it');

        const undstampedDocument = createSopDocumentFromGeneration({
            rawResponse: goodResult.object,
            member: SAMPLE_SOP_DOCUMENT.member,
            workLibrary: SAMPLE_WORK_LIBRARY,
            context: memberContext,
            setupConfig: SAMPLE_SOP_DOCUMENT.setupConfig!,
            structureVersion: 'activity-subaction-v1',
        });
        check(undstampedDocument.instructionContractVersion === undefined, 'Omitting instructionContractVersion leaves the document unstamped — the contract version is never INFERRED from structureVersion alone, even for an activity-subaction-v1 document');

        const docStep1 = document.steps.find((s) => s.id === 'step-1')!;
        check(docStep1.executionSpec?.actorRole === '채용담당자', 'The persisted document step carries the same actorRole (responsible role) as the generation response');
        check(docStep1.executionSpec?.completionCriteria?.[0] === '채용 요청서 검토 결과가 기록된다.', 'The persisted document step preserves observable completion criteria');
        check(docStep1.executionSpec?.toolPolicy.allowedToolIds.length === 0, 'The persisted document step preserves the empty tool policy (no invented tool permissions)');
        const docTerminal = document.steps.find((s) => s.terminalType === 'start')!;
        check(docTerminal.executionSpec === undefined, 'A persisted terminal step never carries an execution spec');
    }

    // ---------------------------------------------------------
    // Blocking: missing responsible role -> repaired within the existing repair budget (1 call)
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: missing actorRole triggers exactly one repair, then passes once fixed...');
    const missingRoleObject = buildObject({ executionSpec: cleanExecutionSpec({ actorRole: '' }) });
    let roleRepairCalls = 0;
    const roleRepairedResult = await runSopGenerationPostProcessing({
        object: missingRoleObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            roleRepairCalls++;
            return buildObject({ executionSpec: cleanExecutionSpec({ actorRole: '채용담당자' }) });
        },
    });
    check(roleRepairCalls === 1, 'A missing actorRole triggers exactly one repair call (existing repair budget, no extra retry loop)');
    check(roleRepairedResult.ok, 'Once the repair supplies a responsible role, the document is accepted');

    console.log('runSopGenerationPostProcessing: an unrepaired missing actorRole never becomes a silently-accepted document...');
    let unrepairedRoleCalls = 0;
    const roleUnrepairedResult = await runSopGenerationPostProcessing({
        object: missingRoleObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            unrepairedRoleCalls++;
            return missingRoleObject; // repair does not fix the missing role
        },
    });
    check(unrepairedRoleCalls === 1, 'Exactly one repair attempt is made before giving up (no unbounded retry)');
    check(!roleUnrepairedResult.ok, 'A responsible-role violation that survives repair returns ok:false, never a passed-through document');
    if (!roleUnrepairedResult.ok) {
        check(roleUnrepairedResult.response.status === 400, 'The failure is surfaced as an actionable 400, not a silent pass or a 500');
        const body = await roleUnrepairedResult.response.json();
        check(Array.isArray(body.issues) && body.issues.some((issue: { code: string }) => issue.code === 'missing-actor-role'), 'The 400 body names the specific blocking issue code for human/AI follow-up');
    }

    // ---------------------------------------------------------
    // Blocking: unobservable decision condition ("고액인 경우" alone, no observable anchor)
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: an unobservable decision condition ("고액") is blocking...');
    const vagueConditionSpec = cleanExecutionSpec({
        decisionCriteria: [{ condition: '구매 금액이 고액인 경우', outcome: '팀장 승인 요청', sourceType: 'human-confirmed' }],
    });
    const vagueConditionObject = buildObject({ executionSpec: vagueConditionSpec });
    let vagueRepairCalls = 0;
    const vagueUnrepairedResult = await runSopGenerationPostProcessing({
        object: vagueConditionObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            vagueRepairCalls++;
            return vagueConditionObject; // repair does not resolve the ambiguity
        },
    });
    check(!vagueUnrepairedResult.ok, "\"필요 시\"/\"고액\" alone, with no observable value, is blocking and never passed through as a normal document");
    check(vagueRepairCalls === 1, 'The vague-condition fixture also gets exactly one repair attempt');

    const groundedConditionObject = buildObject({
        executionSpec: cleanExecutionSpec({
            decisionCriteria: [{ condition: '구매성 지출이 500만원을 초과함', outcome: '팀장 승인 요청', sourceType: 'member-context' }],
        }),
    });
    const groundedConditionResult = await runSopGenerationPostProcessing({
        object: groundedConditionObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            throw new Error('repair must not be needed once the condition is observable and grounded');
        },
    });
    check(groundedConditionResult.ok, 'A decision condition with an observable value AND a threshold that literally appears in the member context passes without repair');

    // ---------------------------------------------------------
    // Blocking: a numeric threshold not present anywhere in the input is rejected
    // REGARDLESS of the self-asserted sourceType label (a label is not self-proof).
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: an ungrounded threshold is blocking even when labeled sourceType:"policy"...');
    const ungroundedObject = buildObject({
        executionSpec: cleanExecutionSpec({
            decisionCriteria: [{ condition: '구매 금액이 80%를 초과함', outcome: '팀장 승인 요청', sourceType: 'policy', sourceRef: '사내 구매 규정' }],
        }),
    });
    let ungroundedRepairCalls = 0;
    const ungroundedResult = await runSopGenerationPostProcessing({
        object: ungroundedObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            ungroundedRepairCalls++;
            return ungroundedObject;
        },
    });
    check(!ungroundedResult.ok, '"80%" does not appear anywhere in the Task definition, Activity description, or member context, so it is rejected even though the model self-labeled it sourceType:"policy"');
    check(ungroundedRepairCalls === 1, 'The ungrounded-threshold fixture gets exactly one repair attempt, not a silent pass');

    // ---------------------------------------------------------
    // Blocking: unregistered tool id + a data access scope no registered tool grants
    // (the tool registry is EMPTY_TOOL_REGISTRY at this stage of the project — §8 of
    // NODE_AUTHORING_AND_AGENT_CONTROL.md — so any allowedToolIds entry is unknown by
    // definition).
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: an invented tool id and an ungranted data access scope are blocking (TST-AOP-001/002)...');
    const inventedToolObject = buildObject({
        executionSpec: cleanExecutionSpec({
            toolPolicy: { allowedToolIds: ['crm.send_email'], forbiddenActions: [], dataAccessScope: ['send'], requiresHumanApproval: true },
        }),
    });
    let toolRepairCalls = 0;
    const inventedToolResult = await runSopGenerationPostProcessing({
        object: inventedToolObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            toolRepairCalls++;
            return inventedToolObject;
        },
    });
    check(!inventedToolResult.ok, 'An invented tool ID never registered in any tool registry is blocking, not silently trusted');
    check(toolRepairCalls === 1, 'The invented-tool fixture gets exactly one repair attempt before failing');
    if (!inventedToolResult.ok) {
        const body = await inventedToolResult.response.json();
        const codes = (body.issues as { code: string }[]).map((i) => i.code);
        check(codes.includes('unknown-tool-id'), 'The unknown-tool-id blocking code is surfaced');
        check(codes.includes('data-access-scope-not-allowed'), "A data access scope ('send') that no registered tool grants is also blocking, independent of the unknown-tool-id issue");
    }

    // ---------------------------------------------------------
    // Repair budget (1E-1 항목 2): a node-authoring blocking defect and an Activity
    // coverage defect present AT THE SAME TIME must still consume only ONE repair
    // round — the two concerns share the same generateRepair call and the same
    // repair prompt, never two separate full-regeneration calls.
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: simultaneous authoring + coverage defects share a single repair round...');
    const combinedSopRequest = buildSopRequest({
        activities: [
            { id: activity.id, order: 1, name: activity.name, description: activity.description, skills: [] },
            { id: secondActivity.id, order: 2, name: secondActivity.name, description: secondActivity.description, skills: [] },
        ],
    });
    // step-1 lacks a responsible role (authoring defect); no step maps to secondActivity
    // at all (coverage defect) — both defects exist in the SAME object simultaneously.
    const combinedDefectObject = buildObject({ executionSpec: cleanExecutionSpec({ actorRole: '' }) });

    let combinedRepairCalls = 0;
    let combinedRepairPrompt = '';
    const combinedFixedObject = buildObject(
        { executionSpec: cleanExecutionSpec({ actorRole: '채용담당자' }) },
        { sourceActivityIds: [secondActivity.id] }
    );
    const combinedFixedResult = await runSopGenerationPostProcessing({
        object: combinedDefectObject,
        prompt: 'PROMPT',
        sopRequest: combinedSopRequest,
        generateRepair: async (repairPrompt) => {
            combinedRepairCalls++;
            combinedRepairPrompt = repairPrompt;
            return combinedFixedObject;
        },
    });
    check(combinedRepairCalls === 1, 'Exactly ONE repair call is made even though the object has both an authoring defect AND a coverage defect at once');
    check(combinedRepairPrompt.includes('missing-actor-role'), 'The single repair prompt names the authoring blocking issue');
    check(combinedRepairPrompt.includes(secondActivity.id), 'The SAME single repair prompt also names the uncovered Activity id — both concerns share one prompt, not two separate calls');
    check(combinedFixedResult.ok, 'Once that one repair call fixes BOTH defects, the document is accepted');

    let partialFixRepairCalls = 0;
    const partialFixObject = buildObject(
        { executionSpec: cleanExecutionSpec({ actorRole: '' }) }, // authoring defect still NOT fixed
        { sourceActivityIds: [secondActivity.id] } // coverage defect fixed
    );
    const partialFixResult = await runSopGenerationPostProcessing({
        object: combinedDefectObject,
        prompt: 'PROMPT',
        sopRequest: combinedSopRequest,
        generateRepair: async () => {
            partialFixRepairCalls++;
            return partialFixObject;
        },
    });
    check(partialFixRepairCalls === 1, 'Still exactly ONE repair attempt even when the repair only fixes one of the two simultaneous defect types — no second attempt is made for the remaining authoring defect');
    check(!partialFixResult.ok, 'A surviving authoring defect (actorRole still missing) fails the whole request even though coverage was fixed — partial repair is never silently accepted');
    if (!partialFixResult.ok) {
        check(partialFixResult.response.status === 400, 'The partially-repaired-but-still-defective document is surfaced as a 400, not passed through');
    }

    // ---------------------------------------------------------
    // Warnings (repairable-in-principle, but not generation-blocking): passive voice,
    // compound action, undefined abbreviation, missing document Mission. None of these
    // trigger a repair call — they are surfaced for human review (§5.2 semantic repair/warning).
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: passive voice / compound action / undefined abbreviation / missing Mission are warnings, never blocking...');
    let warningRepairCalls = 0;
    const passiveVoiceObject = buildObject({
        definition: '채용 요청서가 채용담당자에 의해 검토되어야 한다.',
    });
    const passiveResult = await runSopGenerationPostProcessing({
        object: passiveVoiceObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            warningRepairCalls++;
            throw new Error('a passive-voice-only defect must not trigger a repair call');
        },
    });
    check(passiveResult.ok, 'Passive voice alone does not block generation');
    if (passiveResult.ok) {
        check(passiveResult.warnings.some((w) => w.includes('passive-voice')), 'The passive-voice defect is surfaced as an explicit warning for human review, not silently dropped');
    }

    const compoundActionObject = buildObject({
        title: '지원서를 접수하고 서류를 검토하며 결과를 기록',
    });
    const compoundResult = await runSopGenerationPostProcessing({
        object: compoundActionObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            warningRepairCalls++;
            throw new Error('a compound-action-only defect must not trigger a repair call');
        },
    });
    check(compoundResult.ok, 'A compound-action title (multiple verbs in one node) does not block generation');
    if (compoundResult.ok) {
        check(compoundResult.warnings.some((w) => w.includes('compound-action')), 'The compound-action defect is surfaced as a warning, routing the member to split the node manually');
    }

    const undefinedAbbreviationObject = buildObject(
        { definition: 'CRM 시스템에서 채용 요청서 검토 결과를 기록한다.' },
        {},
        { agentInstruction: { objective: '채용 요청을 접수해 승인된 채용 안건으로 전환한다.', successCriteria: [], globalConstraints: [], glossary: [] } }
    );
    const abbreviationResult = await runSopGenerationPostProcessing({
        object: undefinedAbbreviationObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            warningRepairCalls++;
            throw new Error('an undefined-abbreviation-only defect must not trigger a repair call');
        },
    });
    check(abbreviationResult.ok, 'An abbreviation not present in the glossary does not block generation');
    if (abbreviationResult.ok) {
        check(abbreviationResult.warnings.some((w) => w.includes('undefined-abbreviation') && w.includes('CRM')), 'The undefined "CRM" abbreviation is surfaced as a glossary warning');
    }

    const missingMissionObject = buildObject({}, {}, { agentInstruction: undefined });
    const missingMissionResult = await runSopGenerationPostProcessing({
        object: missingMissionObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            warningRepairCalls++;
            throw new Error('a missing document-level Mission alone must not trigger a repair call');
        },
    });
    check(missingMissionResult.ok, 'A missing document-level Mission (agentInstruction) does not block generation — it is a document-level warning, not a per-node blocking defect');
    if (missingMissionResult.ok) {
        check(missingMissionResult.warnings.some((w) => w.includes('missing-mission')), 'The missing Mission is surfaced as an explicit warning');
    }
    check(warningRepairCalls === 0, 'None of the four warning-only fixtures ever triggered a repair call — warnings and blocking issues are kept strictly separate');

    // ---------------------------------------------------------
    // Terminal exemption: even if a malformed object hands a terminal step an
    // executionSpec, the pipeline's entry normalization already strips it (this is
    // the SAME normalizeSopGenerationObject the graph-repair stage already relies
    // on), so the node-authoring stage never flags a terminal for missing/extra spec.
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: terminal nodes are excluded from the execution-spec requirement...');
    const terminalWithSpecObject = buildObject();
    (terminalWithSpecObject.steps[0] as Record<string, unknown>).executionSpec = cleanExecutionSpec();
    const terminalResult = await runSopGenerationPostProcessing({
        object: terminalWithSpecObject,
        prompt: 'PROMPT',
        sopRequest: goodSopRequest,
        generateRepair: async () => {
            throw new Error('a terminal carrying a stray execution spec must be normalized away, not repaired');
        },
    });
    check(terminalResult.ok, 'A terminal step that arrives with a stray execution spec is silently normalized (never a blocking generation failure)');
    if (terminalResult.ok) {
        const terminalStep = (terminalResult.object as { steps: { id: string; executionSpec?: unknown }[] }).steps.find((s) => s.id === 'start')!;
        check(terminalStep.executionSpec === undefined, 'The stray executionSpec on the terminal step is stripped before node-authoring validation ever runs');
    }

    // ---------------------------------------------------------
    // Regression: a legacy (non Activity–Sub Action) request is never subjected to the
    // new node-authoring gate — its prompt and runner behavior stay unchanged.
    // ---------------------------------------------------------
    console.log('runSopGenerationPostProcessing: legacy Activity-scope requests are unaffected by the new node-authoring stage...');
    const legacySopRequest = buildSopRequest({ sourceType: 'activity', activityName: activity.name, structureVersion: undefined, minSteps: 1, maxSteps: 2 });
    const legacyObject = {
        title: '레거시 SOP',
        steps: [
            { id: 'start', title: '시작', definition: '시작 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'start' },
            { id: 'legacy-1', title: '요청서 검토', definition: '요청서가 검토되어야 한다.', shape: 'process', sourceActivityIds: [activity.id] },
            { id: 'end', title: '종료', definition: '종료 단계의 상세 정의입니다.', shape: 'terminal', terminalType: 'end' },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'legacy-1' },
            { id: 'e2', source: 'legacy-1', target: 'end' },
        ],
    };
    let legacyRepairCalls = 0;
    const legacyResult = await runSopGenerationPostProcessing({
        object: legacyObject,
        prompt: 'PROMPT',
        sopRequest: legacySopRequest,
        generateRepair: async () => {
            legacyRepairCalls++;
            throw new Error('the node-authoring stage must never run for a legacy (non Activity–Sub Action) request');
        },
    });
    check(legacyResult.ok, 'A legacy request with no executionSpec anywhere still passes — the new gate is scoped to structureVersion === "activity-subaction-v1" only');
    check(legacyRepairCalls === 0, 'No node-authoring repair is ever attempted for a legacy Activity-scope request, even though its steps have zero executionSpec and an obviously passive definition');
    if (legacyResult.ok) {
        check(!legacyResult.warnings.some((w) => w.includes('missing-execution-spec') || w.includes('passive-voice')), 'No node-authoring warning code leaks into a legacy request\'s warnings either');
    }

    console.log(`ALL SOP NODE AUTHORING GENERATION TESTS PASSED (${passed})`);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
