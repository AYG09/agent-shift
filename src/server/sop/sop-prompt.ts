import { SOP_DETAIL_LEVEL_GUIDE, SOP_BRANCH_POLICY_GUIDE, type SopDetailLevel, type SopBranchPolicy } from '@/lib/sop-setup-validation';
import { FULL_SHAPE_SELECTION_GUIDE, MULTI_MEANING_SPLIT_GUIDE, BRANCH_EDGE_GUIDE } from '@/lib/ai-shape-guide';

export function getSopPrompt(params: {
    memberRole?: string;
    sourceJobId?: string;
    jobName?: string;
    taskId?: string;
    taskName?: string;
    taskDefinition?: string;
    sourceType?: 'task' | 'activity';
    structureVersion?: 'activity-subaction-v1';
    activityName?: string;
    activities?: Array<{ id?: string; order?: number; name: string; description?: string; skills?: { id?: string; name: string; description?: string }[] }>;
    skills?: { id?: string; name: string; description?: string }[];
    context?: string;
    detailLevel?: SopDetailLevel;
    minSteps?: number;
    maxSteps?: number;
    maxTotalNodes?: number;
    branchPolicy?: SopBranchPolicy;
    maxBranches?: number;
    allowRework?: boolean;
    maxLoops?: number;
    splitComplexSteps?: boolean;
}) {
    const sourceType = params.sourceType ?? 'task';
    const skillsList = (params.skills || []).map((s) => `- [${s.id || 'legacy'}] ${s.name}: ${s.description || ''}`).join('\n');
    const activitiesList = (params.activities || [])
        .map((activity, index) => {
            const activitySkills = (activity.skills || []).map((skill) => `[${skill.id || 'legacy'}] ${skill.name}: ${skill.description || ''}`).join(', ');
            return `${activity.order ?? index + 1}. [${activity.id || 'legacy'}] ${activity.name}${activity.description ? ` — ${activity.description}` : ''}${activitySkills ? `\n   - 유관 SKILL: ${activitySkills}` : ''}`;
        })
        .join('\n');
    // 0처럼 유효한 값이 falsy라서 기본값으로 덮어써지지 않도록 `||`가 아니라 `??`를 쓴다
    // (예: maxLoops=0은 "재작업 루프를 허용하지 않음"이라는 유효한 사용자 설정이다).
    const minSteps = params.minSteps ?? 6;
    const maxSteps = params.maxSteps ?? 8;
    const maxTotalNodes = params.maxTotalNodes ?? 15;
    const branchPolicy = params.branchPolicy ?? 'auto';
    const maxBranches = params.maxBranches ?? 2;
    const allowRework = params.allowRework !== false;
    const maxLoops = params.maxLoops ?? 3;
    const splitComplexSteps = params.splitComplexSteps !== false;
    const isSubActionStructure = params.structureVersion === 'activity-subaction-v1';
    const shouldApplyMeaningSplitGuide = isSubActionStructure || splitComplexSteps;

    const subActionSemanticsPrinciple = isSubActionStructure
        ? `4. **Sub Action 의미 분해 원칙 (필수)**:
   - Activity 설명을 그대로 한 단계명으로 복사하지 말고, 먼저 각 구절을 실행 행동, 입력/이전 결과, 산출물, 목적/조건, 흐름 제어로 분류하세요.
   - 노드는 담당자가 실제로 수행할 수 있는 실행 행동만 만드세요. 입력/이전 결과는 inputs, 실행 결과물은 outputs에 기록하고, 목적·조건은 definition 또는 decisionRules에 설명하세요.
   - Sub Action title은 반드시 "대상 + 행동 동사" 형태로 작성하세요. 산출물 명사, 목적 문구, 이전 Activity의 결과만으로 별도 노드를 만들지 마세요.
   - 서로 독립적으로 수행·검증·Agent화 판단할 수 있는 행동은 분리하고, 하나의 통합 행동으로만 성립하는 표현은 억지로 쪼개지 마세요.
   - 선행 결과가 필요한 행동은 순차 연결하고, 두 행동이 서로 독립적으로 실행되며 후속 행동이 두 결과를 모두 필요로 할 때만 병렬 edge로 분기·합류하세요.
   - 병렬 분기와 합류는 여러 outgoing/incoming edge로 표현하세요. 실행 행동이 없는 순수 fork/join gateway를 단계로 만들거나 Agent화 후보로 세지 마세요. 실제 기준 판단 업무는 decision 형태의 Sub Action으로 만들 수 있습니다.
   - Activity 설명에서 직접 분해한 단계는 subActionOrigin: 'activity-derived'로 표시하세요. 구성원이 입력한 업무 맥락 때문에 같은 Activity 안에 추가한 단계는 subActionOrigin: 'context-derived'와 구체적인 subActionOriginRationale을 함께 기록하세요.
   - 직무 맥락에서 필요성이 보이더라도 어느 Activity에도 정합적으로 속하지 않는 행동은 임의 Activity ID에 강제 매핑하거나 새 ID를 발명하지 마세요. 그런 후보는 생성 범위에 포함하지 않고 Work Map의 Activity 제안·구성원 수락 절차로 돌려야 합니다.
   - 예시 1: "수요 예측 및 갭 분석 결과를 바탕으로 중장기 제품 믹스 및 개발 우선순위를 설정하여 포트폴리오 최적화 안을 도출함"에서 "수요 예측 및 갭 분석 결과"는 inputs입니다. 기본형은 "제품 믹스·개발 우선순위 설정 → 포트폴리오 최적화안 도출" 2단계이며, 제품 믹스 설정과 개발 우선순위 설정이 독립 실행 가능할 때만 두 병렬 단계가 최적화안 도출로 합류하는 3단계입니다.
   - 예시 2: "Auto 및 신규 응용처 고객사와 협상하여 샘플 공급 및 초기 물량 확보를 위한 비즈니스 계약을 추진함"은 "고객사 공급 조건 협상 → 비즈니스 계약 추진" 2단계입니다. 샘플 공급과 초기 물량 확보는 이 문장만으로는 목적/예상 outputs이므로 실제 공급·물량 배정 업무가 범위에 명시되지 않았다면 별도 노드로 만들지 마세요.`
        : '';

    const activityTrackingPrinciple = isSubActionStructure
        ? `3. **Activity → Sub Action 매핑 원칙 (필수)**:
   - 이 SOP는 Activity–Sub Action 구조입니다. 시작/종료 terminal을 제외한 모든 업무 단계는 정확히 하나의 Sub Action이며, 정확히 하나의 Activity에만 속합니다.
   - 절대로 하나의 단계에 여러 Activity ID를 함께 넣지 마세요. 하나의 Activity가 여러 단계(Sub Action)로 나뉘는 것은 허용되고 오히려 권장되지만, 그 반대(한 단계가 여러 Activity를 대표)는 금지입니다.
   - sourceActivityIds에는 정확히 1개의 ID만 넣으세요 (위 반영 Activity 목록의 ID만 사용, 다른 Task의 ID나 존재하지 않는 ID는 절대 넣지 마세요).
   - 위 반영 Activity 목록의 모든 Activity가 최소 1개의 Sub Action으로 반영되어야 합니다. 절대 누락하지 마세요.
   - subActionOrder에는 같은 Activity 안에서 1부터 시작하는 고유한 양의 정수를 넣어 그 Activity 내부의 실행 순서를 표시하세요 (Activity가 다르면 값이 겹쳐도 됩니다).
   - 각 Sub Action(시작/종료 제외)마다 agentizationSuggestion을 반드시 생성하세요: type은 'agent-candidate'(정해진 규칙 안에서 AI가 주도할 수 있는 후보), 'ai-assist'(사람이 수행하고 AI가 초안·검색·분석을 지원), 'not-recommended'(사람 판단·대면 소통·예외 처리 등으로 AI 적용을 권장하지 않음) 중 하나이며, rationale은 왜 그렇게 판단했는지 1문장의 구체적 근거입니다. 확률/신뢰도 수치는 절대 만들지 마세요 — 이 값은 구성원이 검토할 제안일 뿐, 확정된 판단이 아닙니다.`
        : `3. **Task Library Activity 추적 원칙**:
   - 시작/종료 terminal을 제외한 모든 업무 단계에 sourceActivityIds를 반드시 넣으세요.
   - sourceActivityIds에는 위 반영 Activity 목록의 ID만 넣으세요. Task 전체 범위라면 모든 Activity ID가 최소 한 번은 포함되어야 하며, 한 단계가 여러 Activity를 함께 반영할 수 있습니다.`;

    return `당신은 프로세스 설계 및 SOP (Standard Operating Procedure) 작성 전문가입니다.
고객사와 구성원이 즉시 업무에 활용할 수 있도록 정밀하고 완성도 높은 SOP를 설계하세요.

## 입력 정보
- 담당 직무: ${params.memberRole || '담당자'}
- Job: ${params.jobName || '미지정'} (${params.sourceJobId || '미지정'})
- 대상 Task: ${params.taskName || '업무'} (${params.taskId || '미지정'})
- Task 정의: ${params.taskDefinition || '미지정'}
- SOP 생성 범위: ${sourceType === 'task' ? `Task 전체 (${(params.activities || []).length}개 주요 Activity)` : '특정 Activity'}
- 대상 Activity: ${sourceType === 'activity' ? params.activityName || '선택 Activity' : '해당 Task의 전체 Activity'}
- 반영 Activity 목록:
${activitiesList || `1. ${params.activityName || '상세 업무'}`}
- Work Library SKILL 목록:
${skillsList || '없음'}
- 업무 맥락:
${params.context || '없음'}

## 설정 조건
- 업무 분해 수준: ${params.detailLevel || 'standard'} — ${(SOP_DETAIL_LEVEL_GUIDE[params.detailLevel || 'standard'] || SOP_DETAIL_LEVEL_GUIDE.standard).promptGuide}
- 주요 단계 수 범위: ${minSteps} ~ ${maxSteps}단계 (시작·종료 노드는 제외한 개수입니다)${isSubActionStructure ? '\n  이 범위는 모든 Activity를 최소 1개씩 Sub Action으로 반영할 수 있도록 이미 넉넉하게 설정되었습니다. 단계 수를 줄이려고 여러 Activity를 하나의 단계에 합치지 마세요.' : ''}
- 전체 노드 수 상한: ${maxTotalNodes}개 (시작·종료·decision·loopLimit을 모두 포함한 개수입니다)
${(SOP_BRANCH_POLICY_GUIDE[branchPolicy] || SOP_BRANCH_POLICY_GUIDE.auto).promptGuide(maxBranches)}
- 재작업/되돌아가는 경로: ${allowRework ? `허용 (정적 그래프 내 재작업 루프는 최대 ${maxLoops}개까지)` : '금지 (되돌아가는 edge를 만들지 마세요)'}
- 복합 단계 자동 분리: ${isSubActionStructure ? '필수 - Activity 문장을 실행 행동과 입력·산출물·목적·조건으로 구분한 뒤, 독립 실행 가능한 행동만 Sub Action으로 분해하세요.' : splitComplexSteps ? '허용 - 하나의 레이블에 여러 의미가 섞인 단계는 의미 단위로 나누어 각각의 단계로 작성하세요.' : '금지 - 하나의 레이블에 여러 의미가 섞여 있어도 강제로 쪼개지 말고 하나의 단계로 유지하세요.'}

## 작성 필수 원칙
0. **워크플로우 가독성 원칙**:
   - AI는 업무의 선후 관계와 분기 의미를 정확히 작성하고, 캔버스 좌표는 최종 결과로 간주하지 마세요. 플랫폼이 주 흐름을 여러 행으로 재배치하고 연결선을 최단 방향으로 연결합니다.
   - 기본 진행은 하나의 명확한 주 흐름으로 연결하고, 재검토·반려·재협의는 반드시 branchType을 no 또는 condition으로 표시하세요. 그러면 주 흐름 밖으로 우회해 표시됩니다.
   - 불필요한 교차 연결, 의미 없는 병렬 분기, 동일 노드 사이의 중복 edge를 만들지 마세요.
1. **단계 정의(definition) 작성 원칙**:
   - 절대로 단계명(title)을 단순 반복하는 문장을 쓰지 마세요.
   - 다음 3가지 요소를 명확히 포함한 1~2문장의 완결된 정의를 작성하세요:
     (1) 무엇을 수행하는가 (2) 어떤 기준/도구로 수행하는가 (3) 어떤 결과/산출물을 만들어내는가
2. **SKILL 할당 원칙**:
   - 제공된 Work Library SKILL을 우선 적용하세요 (source: 'work-library', accepted: true).
   - 반드시 필요한 추가 SKILL이 있다면 제안하되, source: 'ai-suggested', accepted: false로 표시하고 이유(reason)를 명시하세요.
${activityTrackingPrinciple}
${subActionSemanticsPrinciple}
${isSubActionStructure ? '5' : '4'}. **도형 및 흐름 구조**:
   - 시작 단계는 반드시 shape: 'terminal', terminalType: 'start'로 정확히 1개만 작성하세요.
   - 종료 단계는 반드시 shape: 'terminal', terminalType: 'end'로 정확히 1개만 작성하세요.
     (terminalType을 생략하면 오류로 처리되며, 배열에서의 위치로 시작/종료를 추정하지 않습니다.
     시작/종료가 아닌 단계에는 shape: 'terminal'을 사용하지 마세요.)
   - 판단 분기점은 shape: 'decision' (위 분기 정책을 반드시 지키세요)
   - 데이터 입출력은 shape: 'manualInput' 또는 'data'
   - 문서 작성 단계는 shape: 'document'
   - 재작업/루프 한계점은 shape: 'loopLimit'
   - decision 노드의 outgoing edge 작성 규칙은 아래 "분기(decision) edge 작성 규칙"을 정확히 따르세요.

${FULL_SHAPE_SELECTION_GUIDE}
${shouldApplyMeaningSplitGuide ? MULTI_MEANING_SPLIT_GUIDE : ''}
${BRANCH_EDGE_GUIDE}`;
}

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
