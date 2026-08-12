import { SOP_DETAIL_LEVEL_GUIDE, SOP_BRANCH_POLICY_GUIDE, type SopDetailLevel, type SopBranchPolicy } from '@/lib/sop-setup-validation';
import { FULL_SHAPE_SELECTION_GUIDE, MULTI_MEANING_SPLIT_GUIDE, BRANCH_EDGE_GUIDE } from '@/lib/ai-shape-guide';

export function getSopPrompt(params: {
    memberRole?: string;
    taskName?: string;
    sourceType?: 'task' | 'activity';
    activityName?: string;
    activities?: Array<{ name: string; description?: string; skills?: { name: string; description?: string }[] }>;
    skills?: { name: string; description?: string }[];
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
    const skillsList = (params.skills || []).map((s) => `- ${s.name}: ${s.description || ''}`).join('\n');
    const activitiesList = (params.activities || [])
        .map((activity, index) => {
            const activitySkills = (activity.skills || []).map((skill) => skill.name).join(', ');
            return `${index + 1}. ${activity.name}${activity.description ? ` — ${activity.description}` : ''}${activitySkills ? `\n   - 유관 SKILL: ${activitySkills}` : ''}`;
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

    return `당신은 프로세스 설계 및 SOP (Standard Operating Procedure) 작성 전문가입니다.
고객사와 구성원이 즉시 업무에 활용할 수 있도록 정밀하고 완성도 높은 SOP를 설계하세요.

## 입력 정보
- 담당 직무: ${params.memberRole || '담당자'}
- 대상 Task: ${params.taskName || '업무'}
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
- 주요 단계 수 범위: ${minSteps} ~ ${maxSteps}단계 (시작·종료 노드는 제외한 개수입니다)
- 전체 노드 수 상한: ${maxTotalNodes}개 (시작·종료·decision·loopLimit을 모두 포함한 개수입니다)
${(SOP_BRANCH_POLICY_GUIDE[branchPolicy] || SOP_BRANCH_POLICY_GUIDE.auto).promptGuide(maxBranches)}
- 재작업/되돌아가는 경로: ${allowRework ? `허용 (정적 그래프 내 재작업 루프는 최대 ${maxLoops}개까지)` : '금지 (되돌아가는 edge를 만들지 마세요)'}
- 복합 단계 자동 분리: ${splitComplexSteps ? '허용 - 하나의 레이블에 여러 의미가 섞인 단계는 의미 단위로 나누어 각각의 단계로 작성하세요.' : '금지 - 하나의 레이블에 여러 의미가 섞여 있어도 강제로 쪼개지 말고 하나의 단계로 유지하세요.'}

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
3. **도형 및 흐름 구조**:
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
${splitComplexSteps ? MULTI_MEANING_SPLIT_GUIDE : ''}
${BRANCH_EDGE_GUIDE}`;
}
