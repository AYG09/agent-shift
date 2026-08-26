/**
 * HR 대표 표준안 초안 prompt — 개인 SOP prompt(sop-prompt.ts)와 **다른 모듈**이다.
 *
 * 왜 분리했는가: 개인 SOP node 품질(Session E)과 대표 표준안 node 품질(Session F)은
 * 서로 다른 세션이 병렬로 강화한다. 두 prompt가 한 파일에 있으면 한 파일의 active
 * owner가 둘이 되어 병렬 작업 규칙(PARALLEL_EXECUTION.md §1.3)이 깨진다.
 *
 * 이 분리는 **무동작변경 이동**이다. 이 커밋에서 문구, 입력 shaping, 출력 스키마,
 * 런타임 동작은 하나도 바뀌지 않았다 — 표준화 규칙 강화는 Session F의 범위다.
 */
import { FULL_SHAPE_SELECTION_GUIDE, BRANCH_EDGE_GUIDE } from '@/lib/ai-shape-guide';

export interface SopStandardDraftSourceSummary {
    /** Opaque provenance label (e.g. "원본 1") — never the source member's real identity. */
    label: string;
    steps: { title: string; definition: string }[];
}

/**
 * Prompt for the HR "대표 표준안 초안" preview (작업 F #9) — a SEPARATE,
 * simpler prompt from getSopPrompt above, not a variant of it. Every input
 * here has already been PII-sanitized by the caller (see
 * /api/sop/standard-drafts/route.ts) — member name/employeeId/organization/
 * reviewer feedback must never reach this function. This deliberately does
 * NOT request the Activity–Sub Action structure (structureVersion) — a
 * cross-member representative merge has no single source Activity mapping to
 * preserve, and the customer has not confirmed a merge-provenance-per-step
 * requirement. It reuses the same shape/branch-edge guides as normal
 * generation so the output is drawable on the same canvas, and it is
 * explicitly framed as a draft synthesis, never as confirmed production
 * clustering/process mining.
 */
export function getStandardDraftPrompt(params: {
    taskName: string;
    taskDefinition?: string;
    sources: SopStandardDraftSourceSummary[];
}): string {
    const sourcesList = params.sources
        .map((source) => `### ${source.label}\n${source.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.definition}`).join('\n')}`)
        .join('\n\n');

    return `당신은 프로세스 표준화 전문가입니다. 아래는 같은 Task("${params.taskName}")에 대해 서로 다른 구성원이 각자 작성하고 승인받은 SOP 초록(개인정보 제거됨)입니다. 이들을 비교해 하나의 대표 표준 SOP 초안을 종합하세요.

## Task 정의
${params.taskDefinition || '미지정'}

## 승인된 원본 SOP 요약 (개인정보 제거됨, ${params.sources.length}건)
${sourcesList}

## 작성 원칙
1. 원본들에서 공통적으로 나타나는 핵심 단계를 우선 반영하고, 원본 간 차이가 있는 부분은 더 명확하거나 안전한 절차를 대표값으로 선택하세요.
2. 이것은 확정된 공식 표준이 아니라 검토용 초안입니다 — 원본을 그대로 복사하지 말고 종합된 대표 절차로 다시 서술하세요.
3. 단계명(title)을 단순 반복하지 않는 1~2문장의 완결된 definition을 작성하세요.
4. 시작 단계는 shape: 'terminal', terminalType: 'start' 정확히 1개, 종료 단계는 shape: 'terminal', terminalType: 'end' 정확히 1개만 작성하세요.
5. 판단 분기점은 shape: 'decision'으로, 아래 분기 규칙을 따르세요.
6. sourceActivityIds/subActionOrder/agentizationSuggestion 필드는 사용하지 마세요 — 이 초안은 원본 개별 Activity 매핑을 그대로 보존하지 않습니다.

${FULL_SHAPE_SELECTION_GUIDE}
${BRANCH_EDGE_GUIDE}`;
}
