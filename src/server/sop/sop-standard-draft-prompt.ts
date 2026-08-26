/**
 * HR 대표 표준안 초안 prompt와 source sanitization — 개인 SOP prompt
 * (sop-prompt.ts)와 **다른 모듈**이다.
 *
 * 왜 분리했는가: 개인 SOP node 품질(Session E)과 대표 표준안 node 품질(Session F)은
 * 서로 다른 세션이 병렬로 강화한다. 두 prompt가 한 파일에 있으면 한 파일의 active
 * owner가 둘이 되어 병렬 작업 규칙(PARALLEL_EXECUTION.md §1.3)이 깨진다.
 *
 * 이 파일은 NODE_AUTHORING_AND_AGENT_CONTROL.md §6의 두 결함을 고친다:
 *  1. sanitizeStandardDraftSource가 기존 title/definition만 넘기던 손실을 없애고
 *     책임 역할·입출력·도구·주의·decision rule·(있으면) execution spec 의미까지
 *     비식별 상태로 보존한다.
 *  2. getStandardDraftPrompt가 5대 node 작성 규칙·agent-ready 계약을 요구하고,
 *     원본 간 충돌을 모델이 임의로 대표값 선택하지 못하게 하며
 *     `standardizationIssues`로 반환하도록 명시한다.
 */
import { FULL_SHAPE_SELECTION_GUIDE, BRANCH_EDGE_GUIDE } from '@/lib/ai-shape-guide';
import type { SopStepData, SopMember } from '@/lib/sop-types';
import type { SopRecord } from '@/lib/sop-record-schema';

export interface SopStandardDraftSourceToolPolicySummary {
    allowedToolIds: string[];
    forbiddenActions: string[];
    dataAccessScope: string[];
    requiresHumanApproval: boolean;
}

export interface SopStandardDraftSourceDecisionCriterionSummary {
    condition: string;
    outcome: string;
    sourceType: string;
}

export interface SopStandardDraftSourceStepSummary {
    title: string;
    definition: string;
    /** Job-role-shaped label (e.g. "채용 운영 담당자"), never a person's name — see redactKnownIdentifiers. */
    responsibleRoleCategory?: string;
    inputs?: string[];
    outputs?: string[];
    tools?: string[];
    cautions?: string[];
    decisionRules?: string[];
    /** De-identified fields of the source step's execution spec, when the source document was generated under the node-authoring contract. Absent on every source predating that contract — never backfilled. */
    toolPolicy?: SopStandardDraftSourceToolPolicySummary;
    decisionCriteria?: SopStandardDraftSourceDecisionCriterionSummary[];
}

export interface SopStandardDraftSourceSummary {
    /** Opaque provenance label (e.g. "원본 1") — never the source member's real identity. */
    label: string;
    steps: SopStandardDraftSourceStepSummary[];
}

/**
 * Exact-substring (case-insensitive) redaction of a member's own known
 * identifier values from free text. This is the same known-identifier list
 * documentContainsAuthorIdentifiers (sop-template.ts) scans for — that
 * function BLOCKS an entire record when found (the route's coarse gate);
 * this function additionally REDACTS at the individual-field level for
 * every field this module newly carries into the AI prompt (responsible
 * role, inputs, outputs, tools, cautions, decision rules), which previously
 * never left the record at all. Defense in depth, not a replacement for the
 * route's block — see that function's docstring for this scan's known limits
 * (exact-substring only; it cannot catch paraphrase or unstructured PII).
 */
export function redactKnownIdentifiers(text: string, identifiers: string[]): string {
    return identifiers.reduce((result, identifier) => {
        if (!identifier) return result;
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return result.replace(new RegExp(escaped, 'gi'), '[비식별]');
    }, text);
}

function collectKnownIdentifiers(member: SopMember): string[] {
    return [member.name, member.employeeId, member.organization, member.id].filter(
        (value): value is string => typeof value === 'string' && value.trim().length >= 2
    );
}

/**
 * Strips a source record's step data down to opaque-provenance, PII-redacted
 * business meaning — responsible role, inputs/outputs, descriptive tools/
 * cautions/decision rules, and (when present) the de-identified fields of the
 * step's execution spec. Never includes member name/employeeId/organization,
 * reviewer feedback, or any other free-form field from the source record.
 */
export function sanitizeStandardDraftSource(record: SopRecord, index: number): SopStandardDraftSourceSummary {
    const identifiers = collectKnownIdentifiers(record.document.member);
    const clean = (text: string): string => redactKnownIdentifiers(text, identifiers);
    const cleanList = (values: string[] | undefined): string[] | undefined =>
        values && values.length > 0 ? values.map(clean) : undefined;

    const steps = record.document.steps
        .filter((step): step is SopStepData => !step.terminalType)
        .map((step) => {
            const summary: SopStandardDraftSourceStepSummary = {
                title: clean(step.title),
                definition: clean(step.definition),
                responsibleRoleCategory: step.responsibleRole ? clean(step.responsibleRole) : undefined,
                inputs: cleanList(step.inputs),
                outputs: cleanList(step.outputs),
                tools: cleanList(step.tools),
                cautions: cleanList(step.cautions),
                decisionRules: cleanList(step.decisionRules),
            };
            if (step.executionSpec) {
                summary.toolPolicy = { ...step.executionSpec.toolPolicy };
                if (step.executionSpec.decisionCriteria.length > 0) {
                    summary.decisionCriteria = step.executionSpec.decisionCriteria.map((criterion) => ({
                        condition: clean(criterion.condition),
                        outcome: clean(criterion.outcome),
                        sourceType: criterion.sourceType,
                    }));
                }
            }
            return summary;
        });

    return { label: `원본 ${index + 1}`, steps };
}

function formatStepSummary(step: SopStandardDraftSourceStepSummary): string {
    const lines = [`${step.title}: ${step.definition}`];
    if (step.responsibleRoleCategory) lines.push(`  - 책임 역할: ${step.responsibleRoleCategory}`);
    if (step.inputs?.length) lines.push(`  - 입력: ${step.inputs.join(', ')}`);
    if (step.outputs?.length) lines.push(`  - 산출물: ${step.outputs.join(', ')}`);
    if (step.tools?.length) lines.push(`  - 사용 도구(서술): ${step.tools.join(', ')}`);
    if (step.cautions?.length) lines.push(`  - 주의사항: ${step.cautions.join(', ')}`);
    if (step.decisionRules?.length) lines.push(`  - 판단 기준: ${step.decisionRules.join(', ')}`);
    if (step.decisionCriteria?.length) {
        lines.push(
            `  - 분기 조건: ${step.decisionCriteria.map((c) => `[${c.condition} → ${c.outcome}] (근거: ${c.sourceType})`).join('; ')}`
        );
    }
    if (step.toolPolicy) {
        const policy = step.toolPolicy;
        lines.push(
            `  - tool policy: 허용 tool [${policy.allowedToolIds.join(', ') || '없음'}], 금지 행동 [${policy.forbiddenActions.join(', ') || '없음'}], 접근범위 [${policy.dataAccessScope.join(', ') || '없음'}], 사람 승인 필요: ${policy.requiresHumanApproval ? '예' : '아니오'}`
        );
    }
    return lines.join('\n');
}

/**
 * Prompt for the HR "대표 표준안 초안" preview (작업 F #9) — a SEPARATE,
 * simpler prompt from getSopPrompt, not a variant of it. Every input here has
 * already been PII-redacted by sanitizeStandardDraftSource — member name/
 * employeeId/organization/reviewer feedback must never reach this function.
 * This deliberately does NOT request the Activity–Sub Action structure
 * (structureVersion) — a cross-member representative merge has no single
 * source Activity mapping to preserve, and the customer has not confirmed a
 * merge-provenance-per-step requirement.
 *
 * Applies the SAME 5대 node 작성 규칙과 agent-ready 계약 (Mission/execution
 * spec/tool policy/escalation) that Session E applies to personal SOP
 * generation — REQ-STD-003 — and requires the model to surface, never
 * silently resolve, cross-source disagreement as a top-level
 * `standardizationIssues` array (REQ-STD-002). That array is additive to the
 * shared generation wire schema (SopGenerationWireSchema is `.passthrough()`
 * — see sop-schemas.ts) so this module never needs to modify a Foundation-
 * owned file to carry it; sop-standard-draft-runner.ts reads and validates it
 * with this repo's own schema (sop-standard-draft-schemas.ts).
 */
export function getStandardDraftPrompt(params: {
    taskName: string;
    taskDefinition?: string;
    sources: SopStandardDraftSourceSummary[];
}): string {
    const sourcesList = params.sources
        .map((source) => `### ${source.label}\n${source.steps.map((step, index) => `${index + 1}. ${formatStepSummary(step)}`).join('\n')}`)
        .join('\n\n');

    return `당신은 프로세스 표준화 전문가입니다. 아래는 같은 Task("${params.taskName}")에 대해 서로 다른 구성원이 각자 작성하고 승인받은 SOP 초록(개인정보 제거됨)입니다. 이들을 비교해 하나의 대표 표준 SOP 초안을 종합하세요.

## Task 정의 (Mission의 기준점)
${params.taskDefinition || '미지정'}

## 승인된 원본 SOP 요약 (개인정보 제거됨, ${params.sources.length}건)
${sourcesList}

## 종합 원칙
1. 원본들에서 공통적으로 나타나는 행동을 우선 반영하되, 행동·책임 역할·판단 조건·tool policy는 각각 따로 비교하세요.
2. 이것은 확정된 공식 표준이 아니라 검토용 초안입니다 — 원본을 그대로 복사하지 말고 종합된 대표 절차로 다시 서술하세요.
3. **원본 간 책임 역할, 수치·SLA 기준, tool 권한이 서로 다르면 하나를 고르거나 평균 내지 마세요.** 대신 대표 절차에는 다툼이 없는 부분만 반영하고, 충돌 자체는 아래 "충돌 보고" 형식으로 별도 반환하세요.
4. 입력 원본 어디에도 없는 수치·SLA·confidence·tool 권한을 새로 만들지 마세요. 근거가 없는 기준이 필요하면 만들지 말고 "기준 미확정"으로 표시하세요.
5. 충돌하는 allowed tool을 사람 검토 없이 실행 허용으로 승격하지 마세요 — allowedToolIds는 모든 원본이 명시적으로 동의한 tool만 포함하세요.

## Node 작성 필수 규칙 (개인 SOP와 동일한 계약)
1. **실행 행동 중심**: 모든 business node는 "대상 + 구체적 행동 동사" 제목을 가진, 실제 수행 가능한 하나의 행동입니다. 입력자료·산출물·목적·순수 분기/합류는 별도 행동 노드로 만들지 마세요.
2. **능동태와 책임 주체**: 각 business node에 responsibleRole과 executionSpec.actorRole을 채우세요 — 원본들의 responsibleRoleCategory를 참고하여 공통되거나 대표적인 역할 범주로 표현하고, 피동형 문장을 쓰지 마세요.
3. **모호성 제거와 출처 있는 기준**: decision node의 조건은 관찰 가능한 값이어야 합니다. "필요 시", "적절히", "가급적" 같은 표현만으로 조건을 만들지 마세요. executionSpec.decisionCriteria의 각 condition에는 sourceType('work-map'|'member-context'|'approved-sop'|'policy'|'human-confirmed')을 표시하세요 — 원본 SOP에서 가져온 기준은 'approved-sop'를 사용하세요.
4. **평이한 언어와 용어 정의**: 전문 용어·약어는 문서 수준 agentInstruction.glossary에 정의하세요. definition은 title을 반복하지 말고 "행동 + 기준/도구 + 완료 결과"를 1~2문장으로 쓰세요.
5. **최소 유효 단일 행동**: 서로 다른 동사·산출물·책임을 가지는 행동은 분리하고, 하나의 통합 판단으로만 성립하는 행동은 억지로 쪼개지 마세요.

## Mission (agentInstruction, 문서 수준 — node마다 반복하지 마세요)
- objective: Task 정의와 원본들의 공통 목적에서 도출하세요.
- successCriteria: 원본들에서 공통으로 확인 가능한 완료 기준만 나열하세요.
- globalConstraints: 원본에 명시된 금지·준수 사항만 나열하세요. 없으면 빈 배열로 두세요.
- glossary: 본문에 등장하는 미정의 약어를 정의하세요.

## Node 실행 명세 (executionSpec, 시작/종료 제외 모든 business node)
- actorRole, action{verb, object}: 필수.
- completionCriteria: 관찰 가능한 완료 확인 방법.
- decisionCriteria: decision node에만 필요 시 작성 (조건/결과/sourceType).
- toolPolicy: allowedToolIds는 원본에 실제로 등장한 도구만, 비어 있어도 됩니다. forbiddenActions, dataAccessScope도 원본 근거가 있을 때만 채우세요. 이메일 발송·외부 게시·승인·삭제·금전/계약/고용 관련 행동은 requiresHumanApproval: true로 표시하세요.
- escalationRules: 예외·기준 미확정·고영향 판단 상황에서만 작성하고, targetRole은 원본에 없으면 비워 두세요(임의로 팀장·SME를 발명하지 마세요).

## 충돌 보고 (standardizationIssues, 최상위 필드)
원본 간 책임 역할, 수치/SLA 기준, tool 권한, 또는 분기 조건이 실질적으로 다르면 아래 JSON 배열 형태로 함께 반환하세요. 다투지 않는 사소한 표현 차이는 포함하지 마세요.
\`\`\`json
"standardizationIssues": [
  {
    "targetStepLabel": "이 충돌이 관련된 행동/판단을 짧게 설명",
    "issueType": "responsibility" | "threshold" | "tool-policy" | "condition",
    "conflictingValues": [
      { "sourceLabel": "원본 1", "value": "그 원본의 입장(비식별)" },
      { "sourceLabel": "원본 2", "value": "다른 원본의 입장(비식별)" }
    ],
    "humanDecisionNeeded": "사람이 무엇을 결정해야 하는지"
  }
]
\`\`\`
충돌이 없으면 빈 배열 \`"standardizationIssues": []\`을 반환하세요. conflictingValues에는 원본의 opaque label(위 "원본 N")만 쓰고 실제 인물 정보를 쓰지 마세요.

## 도형 규칙
- 시작 단계는 shape: 'terminal', terminalType: 'start' 정확히 1개, 종료 단계는 shape: 'terminal', terminalType: 'end' 정확히 1개만 작성하세요.
- 판단 분기점은 shape: 'decision'으로, 아래 분기 규칙을 따르세요.
- sourceActivityIds/subActionOrder/agentizationSuggestion 필드는 사용하지 마세요 — 이 초안은 원본 개별 Activity 매핑을 그대로 보존하지 않습니다.
- terminal 단계에는 executionSpec을 두지 마세요.

${FULL_SHAPE_SELECTION_GUIDE}
${BRANCH_EDGE_GUIDE}`;
}
