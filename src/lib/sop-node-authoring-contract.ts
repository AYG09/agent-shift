/**
 * SOP 노드 작성 품질 계약 — 개인 SOP 생성(Session E)과 HR 대표 표준안 생성
 * (Session F)이 **같은 규칙으로** 검증받게 하는 공용 타입·스키마·validator.
 *
 * 왜 공용 모듈인가: 두 생성 경로가 각자 품질 규칙을 구현하면 "개인 SOP는 막히는데
 * 표준안은 통과하는" 비대칭이 생긴다. 규칙의 원천은 문서
 * (docs/sop-member-context-redesign/NODE_AUTHORING_AND_AGENT_CONTROL.md)이고, 그
 * 기계 검증 지점은 이 파일 하나다.
 *
 * 이 모듈이 하지 않는 것:
 * - Agent 실행 권한 부여. `toolPolicy`는 **작성된 계약의 서술**이며, 실제 실행은
 *   별도 tool executor와 HITL이 강제해야 한다 (REQ-AOP-002).
 * - Agent화 확정. AI 제안(agentizationSuggestion)과 구성원 판단(stepModes)은 이
 *   품질 검증과 무관한 별도 필드다 (REQ-AOP-003).
 * - 자연어 의미의 최종 판정. 정규식은 사람이 볼 후보를 찾는 보조 수단이며, 그래서
 *   대부분의 문장 규칙이 blocking이 아니라 warning으로 분류된다 (§5.2).
 */
import { z } from 'zod';

/**
 * node 작성 계약의 버전. legacy 문서는 이 값이 없고, 없는 문서를 소급해서
 * 재작성하지 않는다 (§4.4). 새 구조로 생성/검증된 문서만 이 값을 갖는다.
 */
export const SOP_NODE_INSTRUCTION_CONTRACT_VERSION = 'node-authoring-v1' as const;
export type SopNodeInstructionContractVersion = typeof SOP_NODE_INSTRUCTION_CONTRACT_VERSION;

/** 판단 기준의 근거 출처. 값 집합의 단일 원천 — zod와 TS 타입이 모두 여기서 파생된다. */
export const SOP_DECISION_SOURCE_TYPES = ['work-map', 'member-context', 'approved-sop', 'policy', 'human-confirmed'] as const;
export type SopDecisionSourceType = (typeof SOP_DECISION_SOURCE_TYPES)[number];

/** 승인된 최소 데이터 접근 범위. 값 집합의 단일 원천. */
export const SOP_DATA_ACCESS_SCOPES = ['read', 'write', 'approve', 'send'] as const;
export type SopDataAccessScope = (typeof SOP_DATA_ACCESS_SCOPES)[number];

export interface SopGlossaryEntry {
    term: string;
    definition: string;
    source?: string;
}

/** 문서 수준 Mission. node마다 복제하지 않는다 (§4.1). */
export interface SopAgentInstructionSpec {
    objective: string;
    successCriteria: string[];
    globalConstraints: string[];
    glossary: SopGlossaryEntry[];
}

export interface SopNodeDecisionCriterion {
    condition: string;
    outcome: string;
    sourceType: SopDecisionSourceType;
    sourceRef?: string;
}

export interface SopNodeToolPolicy {
    allowedToolIds: string[];
    forbiddenActions: string[];
    dataAccessScope: SopDataAccessScope[];
    requiresHumanApproval: boolean;
}

export interface SopNodeEscalationRule {
    trigger: string;
    /** 입력에 근거가 없으면 임의의 팀장·SME를 발명하지 않고 비워 둔다 (§4.3). */
    targetRole?: string;
    requiredEvidence: string[];
    agentMayContinue: boolean;
    source?: string;
}

/** business node 수준 실행 명세. terminal과 순수 control node에는 두지 않는다. */
export interface SopNodeExecutionSpec {
    actorRole: string;
    action: { verb: string; object: string };
    completionCriteria: string[];
    decisionCriteria: SopNodeDecisionCriterion[];
    toolPolicy: SopNodeToolPolicy;
    escalationRules: SopNodeEscalationRule[];
}

export const SopGlossaryEntrySchema = z.object({
    term: z.string().min(1),
    definition: z.string().min(1),
    source: z.string().optional(),
});

export const SopAgentInstructionSpecSchema = z.object({
    objective: z.string().min(1),
    successCriteria: z.array(z.string().min(1)).default([]),
    globalConstraints: z.array(z.string().min(1)).default([]),
    glossary: z.array(SopGlossaryEntrySchema).default([]),
});

export const SopNodeDecisionCriterionSchema = z.object({
    condition: z.string().min(1),
    outcome: z.string().min(1),
    sourceType: z.enum(SOP_DECISION_SOURCE_TYPES),
    sourceRef: z.string().optional(),
});

export const SopNodeToolPolicySchema = z.object({
    allowedToolIds: z.array(z.string().min(1)).default([]),
    forbiddenActions: z.array(z.string().min(1)).default([]),
    dataAccessScope: z.array(z.enum(SOP_DATA_ACCESS_SCOPES)).default([]),
    requiresHumanApproval: z.boolean().default(false),
});

export const SopNodeEscalationRuleSchema = z.object({
    trigger: z.string().min(1),
    targetRole: z.string().optional(),
    requiredEvidence: z.array(z.string().min(1)).default([]),
    agentMayContinue: z.boolean().default(false),
    source: z.string().optional(),
});

export const SopNodeExecutionSpecSchema = z.object({
    actorRole: z.string().min(1),
    action: z.object({ verb: z.string().min(1), object: z.string().min(1) }),
    completionCriteria: z.array(z.string().min(1)).default([]),
    decisionCriteria: z.array(SopNodeDecisionCriterionSchema).default([]),
    toolPolicy: SopNodeToolPolicySchema,
    escalationRules: z.array(SopNodeEscalationRuleSchema).default([]),
});

/**
 * 와이어(generateObject)용 관대 버전. 구조화 출력은 min-length를 강제하지 못하므로
 * 엄격한 스키마를 모델에 넘기면 기계적으로 고칠 수 있는 결함 하나가 응답 전체를
 * 파싱 시점에 죽인다 — sop-schemas.ts가 같은 이유로 별도 wire 스키마를 쓴다.
 */
export const SopNodeExecutionSpecWireSchema = z.object({
    actorRole: z.string().optional(),
    action: z.object({ verb: z.string().optional(), object: z.string().optional() }).optional(),
    completionCriteria: z.array(z.string()).optional(),
    decisionCriteria: z
        .array(
            z.object({
                condition: z.string().optional(),
                outcome: z.string().optional(),
                sourceType: z.enum(SOP_DECISION_SOURCE_TYPES).optional(),
                sourceRef: z.string().optional(),
            })
        )
        .optional(),
    toolPolicy: z
        .object({
            allowedToolIds: z.array(z.string()).optional(),
            forbiddenActions: z.array(z.string()).optional(),
            dataAccessScope: z.array(z.enum(SOP_DATA_ACCESS_SCOPES)).optional(),
            requiresHumanApproval: z.boolean().optional(),
        })
        .optional(),
    escalationRules: z
        .array(
            z.object({
                trigger: z.string().optional(),
                targetRole: z.string().optional(),
                requiredEvidence: z.array(z.string()).optional(),
                agentMayContinue: z.boolean().optional(),
                source: z.string().optional(),
            })
        )
        .optional(),
});

export const SopAgentInstructionSpecWireSchema = z.object({
    objective: z.string().optional(),
    successCriteria: z.array(z.string()).optional(),
    globalConstraints: z.array(z.string()).optional(),
    glossary: z.array(z.object({ term: z.string().optional(), definition: z.string().optional(), source: z.string().optional() })).optional(),
});

/**
 * 등록된 tool 하나. 모델이 tool ID나 권한을 발명하지 못하게 하는 근거 목록이며,
 * 이 registry에 있다는 사실이 실행 권한을 부여하지는 않는다 (§4.2).
 */
export interface SopToolRegistryEntry {
    id: string;
    label: string;
    allowedScopes: SopDataAccessScope[];
    /** 이메일 발송, 외부 게시, 승인, 삭제, 금전·계약·고용 결정 등. */
    highImpact: boolean;
}

export type SopToolRegistry = ReadonlyMap<string, SopToolRegistryEntry>;

export function createToolRegistry(entries: SopToolRegistryEntry[]): SopToolRegistry {
    return new Map(entries.map((entry) => [entry.id, entry]));
}

/**
 * 실제 조직 tool registry는 보류 범위다(§8). 비어 있는 registry는 "등록된 tool이
 * 없다"는 뜻이며, 이때 unknown-tool 검사를 건너뛰지 않고 **모든 tool ID를 미등록으로**
 * 취급한다 — 검사 자체가 조용히 꺼지면 계약이 무의미해지기 때문이다. 등록 목록이
 * 준비되기 전에는 생성 측이 allowedToolIds를 비워 두는 것이 정상 상태다.
 */
export const EMPTY_TOOL_REGISTRY: SopToolRegistry = createToolRegistry([]);

export const SOP_NODE_BLOCKING_ISSUE_CODES = [
    'missing-execution-spec',
    'missing-actor-role',
    'missing-action',
    'terminal-has-execution-spec',
    'decision-missing-criteria',
    'unobservable-decision-condition',
    'ungrounded-threshold',
    'unknown-tool-id',
    'data-access-scope-not-allowed',
    'high-impact-tool-without-approval',
    'forbidden-action-allowed',
] as const;

export const SOP_NODE_WARNING_ISSUE_CODES = [
    'missing-mission',
    'ambiguous-expression',
    'passive-voice',
    'compound-action',
    'undefined-abbreviation',
    'definition-repeats-title',
    'unobservable-completion-criteria',
    'missing-escalation-evidence',
    'unresolved-escalation-role',
] as const;

export type SopNodeBlockingIssueCode = (typeof SOP_NODE_BLOCKING_ISSUE_CODES)[number];
export type SopNodeWarningIssueCode = (typeof SOP_NODE_WARNING_ISSUE_CODES)[number];
export type SopNodeQualityIssueCode = SopNodeBlockingIssueCode | SopNodeWarningIssueCode;

export interface SopNodeQualityIssue {
    severity: 'blocking' | 'warning';
    code: SopNodeQualityIssueCode;
    /** 문서 수준 이슈면 없음. */
    stepId?: string;
    message: string;
}

export interface SopNodeQualityReport {
    contractVersion: SopNodeInstructionContractVersion;
    issues: SopNodeQualityIssue[];
    blockingIssues: SopNodeQualityIssue[];
    warningIssues: SopNodeQualityIssue[];
    /** blocking이 하나도 없으면 true. warning은 사람 검토 대상이지 차단 사유가 아니다. */
    ok: boolean;
}

/** validator가 읽는 최소 step 형태 — 생성 응답과 저장 문서 양쪽에 맞는다. */
export interface SopNodeAuthoringStepInput {
    id: string;
    title: string;
    definition: string;
    shape?: string;
    type?: string;
    terminalType?: 'start' | 'end';
    executionSpec?: SopNodeExecutionSpec;
}

export interface SopNodeAuthoringInput {
    agentInstruction?: SopAgentInstructionSpec;
    steps: SopNodeAuthoringStepInput[];
    /**
     * 수치·기준의 근거가 될 수 있는 원문 모음 (Task 정의, Activity 설명, 업무맥락,
     * 승인 원본 등). 여기에 없는 수치를 모델이 만들어냈다면 blocking이다.
     */
    groundingTexts?: string[];
    toolRegistry?: SopToolRegistry;
    /**
     * business node에 execution spec을 요구할지. 계약 도입 이전에 만들어진 문서를
     * 검사할 때는 false로 두어 legacy를 blocking으로 만들지 않는다.
     */
    requireExecutionSpec?: boolean;
}

const AMBIGUOUS_PATTERNS = ['필요 시', '필요시', '적절히', '적절한', '가능한 경우', '가급적', '신속히', '고액', '이상 징후', '수시로'];
/** 조건이 실제로 관찰 가능한지 판정할 때 찾는 앵커. 값·상태·비교 표현. */
const OBSERVABLE_ANCHORS = ['이상', '이하', '초과', '미만', '일치', '불일치', '승인', '반려', '완료', '누락', '존재', '없음', '있음', '=', '>', '<'];
const PASSIVE_PATTERNS = ['되어야 한다', '되어야 함', '될 수 있다', '처리된다', '검토된다', '수행된다', '진행된다', '이루어진다'];
/** 별도 정의가 필요 없는 프로젝트 공용 약어. 이 목록을 늘려 검사를 무력화하지 않는다. */
const GLOSSARY_EXEMPT_ABBREVIATIONS = new Set(['SOP', 'AI', 'ID']);
const NUMERIC_THRESHOLD_PATTERN = /\d+(?:\.\d+)?\s*(?:%|퍼센트|원|만원|억원|시간|분|일|주|개월|건|회|점|배)/g;
const ABBREVIATION_PATTERN = /\b[A-Z]{2,}\b/g;

function isTerminalStep(step: SopNodeAuthoringStepInput): boolean {
    return !!step.terminalType || step.shape === 'terminal' || step.type === 'terminal';
}

function isDecisionStep(step: SopNodeAuthoringStepInput): boolean {
    return step.shape === 'decision' || step.type === 'decision';
}

function containsAny(text: string, patterns: string[]): string | undefined {
    return patterns.find((pattern) => text.includes(pattern));
}

/**
 * 입력에 근거가 없는 수치 기준을 찾는다 (RULE-NODE-03 / TST-NODE-004).
 * 근거 판정은 "그 수치 표현이 입력 원문에 실제로 등장하는가"이며, 모델이 스스로
 * 붙인 sourceType 라벨은 근거로 인정하지 않는다 — 라벨은 모델이 자유롭게 쓸 수
 * 있는 값이라 자기 증명이 되기 때문이다.
 */
function findUngroundedThresholds(text: string, groundingCorpus: string): string[] {
    const matches = text.match(NUMERIC_THRESHOLD_PATTERN);
    if (!matches) return [];
    const normalizedCorpus = groundingCorpus.replace(/\s+/g, '');
    return [...new Set(matches)].filter((match) => !normalizedCorpus.includes(match.replace(/\s+/g, '')));
}

function findUndefinedAbbreviations(text: string, glossaryTerms: Set<string>): string[] {
    const matches = text.match(ABBREVIATION_PATTERN);
    if (!matches) return [];
    return [...new Set(matches)].filter((token) => !GLOSSARY_EXEMPT_ABBREVIATIONS.has(token) && !glossaryTerms.has(token));
}

function countOccurrences(text: string, patterns: string[]): number {
    return patterns.reduce((total, pattern) => total + text.split(pattern).length - 1, 0);
}

/**
 * 5대 node 작성 규칙과 agent-ready 계약의 기계 검증.
 *
 * 반환값은 판정이 아니라 **보고서**다. 호출자(생성 runner)가 blocking을 어떻게
 * 다룰지(1회 repair 후 오류로 표면화) 결정하며, warning은 사람 검토 항목으로
 * 남긴다. 이 함수는 문서를 수정하지 않는다.
 */
export function validateSopNodeAuthoring(input: SopNodeAuthoringInput): SopNodeQualityReport {
    const issues: SopNodeQualityIssue[] = [];
    const registry = input.toolRegistry ?? EMPTY_TOOL_REGISTRY;
    const requireExecutionSpec = input.requireExecutionSpec ?? true;
    const groundingCorpus = (input.groundingTexts ?? []).join('\n');
    const glossaryTerms = new Set((input.agentInstruction?.glossary ?? []).map((entry) => entry.term.toUpperCase()));

    const add = (severity: 'blocking' | 'warning', code: SopNodeQualityIssueCode, message: string, stepId?: string) => {
        issues.push({ severity, code, message, ...(stepId ? { stepId } : {}) });
    };

    if (!input.agentInstruction?.objective?.trim()) {
        add('warning', 'missing-mission', '문서 수준 Mission(objective)이 없습니다. Task 정의와 업무맥락에서 작성하세요.');
    }

    input.steps.forEach((step) => {
        const spec = step.executionSpec;

        if (isTerminalStep(step)) {
            // terminal에는 실행 명세를 두지 않는다 (§4.4). 남아 있으면 terminal이
            // 업무 단계로 오인돼 Agent화 후보 계산까지 오염된다.
            if (spec) add('blocking', 'terminal-has-execution-spec', `시작/종료 노드 "${step.id}"에는 실행 명세를 두지 않습니다.`, step.id);
            return;
        }

        const titleAndDefinition = `${step.title}\n${step.definition}`;

        const normalizedTitle = step.title.replace(/\s+/g, '');
        const normalizedDefinition = step.definition.replace(/\s+/g, '');
        if (normalizedDefinition && normalizedDefinition.startsWith(normalizedTitle) && normalizedDefinition.length < normalizedTitle.length + 10) {
            add('warning', 'definition-repeats-title', `단계 "${step.id}"의 definition이 title을 반복합니다. 행동·기준·완료 결과를 서술하세요.`, step.id);
        }
        if (countOccurrences(step.title, ['하고', '하며']) >= 2) {
            add('warning', 'compound-action', `단계 "${step.id}"의 title이 여러 행동을 한 노드에 담고 있습니다.`, step.id);
        }
        const passive = containsAny(titleAndDefinition, PASSIVE_PATTERNS);
        if (passive) {
            add('warning', 'passive-voice', `단계 "${step.id}"에 피동 표현("${passive}")이 있어 책임 주체가 사라집니다.`, step.id);
        }
        findUndefinedAbbreviations(titleAndDefinition, glossaryTerms).forEach((abbreviation) => {
            add('warning', 'undefined-abbreviation', `단계 "${step.id}"의 약어 "${abbreviation}"가 glossary에 정의되어 있지 않습니다.`, step.id);
        });
        findUngroundedThresholds(titleAndDefinition, groundingCorpus).forEach((threshold) => {
            add('blocking', 'ungrounded-threshold', `단계 "${step.id}"의 기준 "${threshold}"는 입력 자료에 근거가 없습니다.`, step.id);
        });

        if (!spec) {
            if (requireExecutionSpec) {
                add('blocking', 'missing-execution-spec', `업무 단계 "${step.id}"에 실행 명세(책임 역할·행동·완료 기준)가 없습니다.`, step.id);
            }
            return;
        }

        if (!spec.actorRole?.trim()) {
            add('blocking', 'missing-actor-role', `단계 "${step.id}"에 책임 역할이 없습니다.`, step.id);
        }
        if (!spec.action?.verb?.trim() || !spec.action?.object?.trim()) {
            add('blocking', 'missing-action', `단계 "${step.id}"의 실행 행동(대상 + 행동 동사)이 불완전합니다.`, step.id);
        }
        if (spec.completionCriteria.length === 0) {
            add('warning', 'unobservable-completion-criteria', `단계 "${step.id}"에 관찰 가능한 완료 기준이 없습니다.`, step.id);
        }

        if (isDecisionStep(step) && spec.decisionCriteria.length === 0) {
            add('blocking', 'decision-missing-criteria', `판단 노드 "${step.id}"에 분기 조건과 결과가 없습니다.`, step.id);
        }

        spec.decisionCriteria.forEach((criterion) => {
            const ambiguous = containsAny(criterion.condition, AMBIGUOUS_PATTERNS);
            const observable = containsAny(criterion.condition, OBSERVABLE_ANCHORS) || /\d/.test(criterion.condition);
            if (ambiguous && !observable) {
                add('blocking', 'unobservable-decision-condition', `단계 "${step.id}"의 분기 조건 "${criterion.condition}"은 관찰 가능한 값이 없습니다.`, step.id);
            } else if (ambiguous) {
                add('warning', 'ambiguous-expression', `단계 "${step.id}"의 분기 조건에 모호한 표현("${ambiguous}")이 남아 있습니다.`, step.id);
            }
            findUngroundedThresholds(criterion.condition, groundingCorpus).forEach((threshold) => {
                add('blocking', 'ungrounded-threshold', `단계 "${step.id}"의 분기 기준 "${threshold}"는 입력 자료에 근거가 없습니다.`, step.id);
            });
        });

        spec.completionCriteria.forEach((criterion) => {
            findUngroundedThresholds(criterion, groundingCorpus).forEach((threshold) => {
                add('blocking', 'ungrounded-threshold', `단계 "${step.id}"의 완료 기준 "${threshold}"는 입력 자료에 근거가 없습니다.`, step.id);
            });
            const ambiguous = containsAny(criterion, AMBIGUOUS_PATTERNS);
            if (ambiguous) {
                add('warning', 'ambiguous-expression', `단계 "${step.id}"의 완료 기준에 모호한 표현("${ambiguous}")이 있습니다.`, step.id);
            }
        });

        const policy = spec.toolPolicy;
        // 접근 범위는 node 수준 선언이고 tool은 여러 개일 수 있으므로, tool마다 따로
        // 대조하면 read 전용 tool 하나 때문에 정당한 write 선언이 막힌다. 판정 기준은
        // "이 범위를 허용하는 tool이 하나라도 있는가"다 — 어떤 tool도 허용하지 않는
        // 범위를 선언했다면 그것이 권한 초과다 (TST-AOP-002).
        const grantedScopes = new Set<SopDataAccessScope>();
        policy.allowedToolIds.forEach((toolId) => {
            const entry = registry.get(toolId);
            if (!entry) {
                add('blocking', 'unknown-tool-id', `단계 "${step.id}"의 tool "${toolId}"는 등록된 tool registry에 없습니다.`, step.id);
                return;
            }
            entry.allowedScopes.forEach((scope) => grantedScopes.add(scope));
            if (entry.highImpact && !policy.requiresHumanApproval) {
                add('blocking', 'high-impact-tool-without-approval', `단계 "${step.id}"의 고영향 tool "${toolId}"는 사람 승인 없이 실행할 수 없습니다.`, step.id);
            }
        });
        policy.dataAccessScope
            .filter((scope) => !grantedScopes.has(scope))
            .forEach((scope) => {
                add('blocking', 'data-access-scope-not-allowed', `단계 "${step.id}"의 접근 범위 "${scope}"를 허용하는 등록 tool이 없습니다.`, step.id);
            });
        policy.forbiddenActions.forEach((forbidden) => {
            if (policy.allowedToolIds.includes(forbidden)) {
                add('blocking', 'forbidden-action-allowed', `단계 "${step.id}"의 tool policy가 금지 행동 "${forbidden}"을 동시에 허용합니다.`, step.id);
            }
        });

        spec.escalationRules.forEach((rule) => {
            if (rule.requiredEvidence.length === 0) {
                add('warning', 'missing-escalation-evidence', `단계 "${step.id}"의 이관 규칙에 사람이 판단할 근거 자료가 없습니다.`, step.id);
            }
            if (!rule.targetRole?.trim()) {
                add('warning', 'unresolved-escalation-role', `단계 "${step.id}"의 이관 대상 역할이 미확정입니다. 임의 역할을 만들지 마세요.`, step.id);
            }
        });
    });

    const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
    const warningIssues = issues.filter((issue) => issue.severity === 'warning');
    return {
        contractVersion: SOP_NODE_INSTRUCTION_CONTRACT_VERSION,
        issues,
        blockingIssues,
        warningIssues,
        ok: blockingIssues.length === 0,
    };
}

/** 보고서를 사람이 읽을 한 줄 목록으로. 로그·오류 메시지·테스트 출력이 같은 형식을 쓴다. */
export function formatSopNodeQualityIssues(issues: SopNodeQualityIssue[]): string[] {
    return issues.map((issue) => `[${issue.severity}:${issue.code}]${issue.stepId ? ` (${issue.stepId})` : ''} ${issue.message}`);
}
