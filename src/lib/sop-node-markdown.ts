/**
 * 검증된 SOP 구조를 사람이 읽는 Markdown으로 **단방향** 투영한다.
 *
 * 왜 단방향인가: Markdown은 실행 권한의 원본이 아니다 (REQ-AOP-004). 실행기는
 * 자유형 텍스트를 파싱해 권한을 부여하지 않고, 검증된 구조화 객체와 tool registry만
 * 사용한다. 그래서 이 모듈에는 parser가 없고 renderer만 있다 — Markdown을 고쳐도
 * 권한이 바뀌지 않는다는 계약이 "역함수가 존재하지 않는다"는 사실로 보장된다.
 *
 * 렌더링은 결정론적이다: 같은 입력이면 항상 같은 문자열이 나오고, 시각·난수·
 * 로케일에 의존하는 값을 넣지 않는다. 그래야 개인 SOP와 대표 표준안이 같은
 * template을 공유하는지 테스트로 비교할 수 있다.
 */
import { formatActivityCode, formatStepNumber } from './sop-format';
import type { SopAgentInstructionSpec, SopNodeExecutionSpec } from './sop-node-authoring-contract';

export interface SopMarkdownStep {
    id: string;
    title: string;
    definition?: string;
    terminalType?: 'start' | 'end';
    inputs?: string[];
    outputs?: string[];
    /** Activity 표시 코드를 만들기 위한 순서. 없으면 출처 줄을 생략한다. */
    sourceActivityOrder?: number;
    sourceActivityIds?: string[];
    executionSpec?: SopNodeExecutionSpec;
}

export interface SopMarkdownInput {
    title: string;
    agentInstruction?: SopAgentInstructionSpec;
    steps: SopMarkdownStep[];
    /**
     * 대표 표준안 전용 머리말. 개인 SOP는 비워 둔다 — 표준안에는 `AI 초안`과
     * 미해소 표준화 이슈를 명시해야 한다 (§4.5).
     */
    draftNotice?: string;
    unresolvedIssues?: string[];
}

function bulletList(label: string, values: string[] | undefined): string[] {
    if (!values || values.length === 0) return [];
    return [`- ${label}: ${values.join(', ')}`];
}

function renderMissionSection(instruction: SopAgentInstructionSpec | undefined): string[] {
    if (!instruction) return [];
    const lines = ['# Mission', `- Objective: ${instruction.objective}`];
    if (instruction.successCriteria.length > 0) lines.push(`- Success criteria: ${instruction.successCriteria.join(' / ')}`);
    if (instruction.globalConstraints.length > 0) lines.push(`- Global constraints: ${instruction.globalConstraints.join(' / ')}`);
    if (instruction.glossary.length > 0) {
        lines.push('', '## Glossary');
        instruction.glossary.forEach((entry) => lines.push(`- ${entry.term}: ${entry.definition}`));
    }
    return lines;
}

function renderStepSection(step: SopMarkdownStep, stepNumber: number): string[] {
    if (step.terminalType) {
        // terminal에는 실행 명세가 없다. 흐름의 경계만 표시하고 지시문처럼 쓰지 않는다.
        return [`## ${step.terminalType === 'start' ? '시작' : '종료'} — ${step.title}`];
    }

    const lines = [`## Step S-${formatStepNumber(stepNumber)} — ${step.title}`];
    const spec = step.executionSpec;
    if (spec) lines.push(`- Actor: ${spec.actorRole}`);
    if (step.sourceActivityOrder !== undefined) lines.push(`- Source Activity: ${formatActivityCode(step.sourceActivityOrder)}`);
    lines.push(...bulletList('Inputs', step.inputs));
    if (spec) lines.push(`- Action: ${spec.action.object} ${spec.action.verb}`);
    else if (step.definition) lines.push(`- Action: ${step.definition}`);
    if (spec && spec.completionCriteria.length > 0) lines.push(`- Completion criteria: ${spec.completionCriteria.join(' / ')}`);
    lines.push(...bulletList('Outputs', step.outputs));

    if (spec) {
        lines.push(...bulletList('Allowed tools', spec.toolPolicy.allowedToolIds));
        lines.push(...bulletList('Forbidden actions', spec.toolPolicy.forbiddenActions));
        lines.push(...bulletList('Data access', spec.toolPolicy.dataAccessScope));
        if (spec.toolPolicy.requiresHumanApproval) lines.push('- Human approval: 고영향 도구 호출 전 사람 승인이 필요합니다.');
        spec.decisionCriteria.forEach((criterion) => {
            lines.push(`- Decision criteria: ${criterion.condition} → ${criterion.outcome} (근거: ${criterion.sourceType})`);
        });
        spec.escalationRules.forEach((rule) => {
            const target = rule.targetRole?.trim() || '담당 역할 미확정';
            const evidence = rule.requiredEvidence.length > 0 ? ` / 근거 자료: ${rule.requiredEvidence.join(', ')}` : '';
            lines.push(`- Escalation: ${rule.trigger} → ${target}${evidence} / 승인 전 진행: ${rule.agentMayContinue ? '가능' : '불가'}`);
        });
    }
    return lines;
}

/** 구조화 객체 → Markdown. 이 함수의 역방향(파싱)은 의도적으로 존재하지 않는다. */
export function renderSopNodeMarkdown(input: SopMarkdownInput): string {
    const sections: string[][] = [];

    if (input.draftNotice) sections.push([`> ${input.draftNotice}`]);
    const mission = renderMissionSection(input.agentInstruction);
    if (mission.length > 0) sections.push(mission);
    sections.push([`# ${input.title}`]);

    let businessStepNumber = 0;
    input.steps.forEach((step) => {
        if (!step.terminalType) businessStepNumber += 1;
        sections.push(renderStepSection(step, businessStepNumber));
    });

    if (input.unresolvedIssues && input.unresolvedIssues.length > 0) {
        sections.push(['## 미해소 표준화 이슈', ...input.unresolvedIssues.map((issue) => `- ${issue}`)]);
    }

    return sections.map((lines) => lines.join('\n')).join('\n\n');
}
