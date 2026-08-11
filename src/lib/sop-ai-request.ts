import { sanitizeModelId, sanitizeReasoningLevel, type ReasoningLevel } from './gemini-models';

/**
 * SOP 생성 요청 본문을 만드는 순수 함수.
 *
 * 클라이언트 컴포넌트(SopSetupGate)에서 분리해 React/브라우저 API 없이도
 * 단위 테스트할 수 있게 한다. model/reasoning은 여기서 미리 정규화하므로,
 * UI에 표시되는 배지 값과 실제로 서버에 전달되는 값이 항상 일치한다.
 */
export interface SopGenerationRequestBodyParams {
    memberRole: string;
    taskName: string;
    activityName?: string;
    activities?: Array<{
        name: string;
        description?: string;
        skills: Array<{ id?: string; name: string; description?: string }>;
    }>;
    skills: Array<{ id?: string; name: string; description?: string }>;
    context: string;
    detailLevel: string;
    minSteps: number;
    maxSteps: number;
    maxTotalNodes?: number;
    branchPolicy: string;
    maxBranches: number;
    allowRework: boolean;
    maxLoops?: number;
    splitComplexSteps?: boolean;
    apiKey?: string | null;
    model?: string | null;
    reasoning?: ReasoningLevel | string | null;
}

export function buildSopGenerationRequestBody(params: SopGenerationRequestBodyParams) {
    return {
        action: 'generateSop' as const,
        memberRole: params.memberRole,
        taskName: params.taskName,
        activityName: params.activityName,
        activities: params.activities,
        skills: params.skills,
        context: params.context,
        detailLevel: params.detailLevel,
        minSteps: params.minSteps,
        maxSteps: params.maxSteps,
        maxTotalNodes: params.maxTotalNodes,
        branchPolicy: params.branchPolicy,
        maxBranches: params.maxBranches,
        allowRework: params.allowRework,
        maxLoops: params.maxLoops,
        splitComplexSteps: params.splitComplexSteps,
        ...(params.apiKey ? { apiKey: params.apiKey } : {}),
        ...(params.model ? { model: sanitizeModelId(params.model) } : {}),
        reasoning: sanitizeReasoningLevel(params.reasoning),
    };
}
