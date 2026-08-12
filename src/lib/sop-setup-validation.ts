/**
 * SOP 워크플로우 구조 설정(SopSetupConfig)의 공용 검증 함수.
 *
 * 클라이언트(SopGenerationSettings/SopSetupGate)와 서버(app/api/ai/route.ts)가 동일한 이
 * 함수를 그대로 재사용한다 - "UI에서만 막고 서버는 신뢰하지 않는다"를 피하기 위해서다.
 * 0처럼 유효한 값이 falsy라서 사라지는 일이 없도록, 값을 채워 넣을 때는 항상 `??`나 명시적
 * `!== undefined` 체크를 쓰고 `||`는 쓰지 않는다.
 */

export const MAX_BRANCHES_MIN = 1;
export const MAX_BRANCHES_MAX = 20;

/**
 * Single source of truth for the SOP detail-level and branch-policy option sets.
 * The UI option order/labels (SopGenerationSettings), the request schema's enum
 * (sop-ai-request.ts), and the AI prompt guidance (server/sop/sop-prompt.ts) all
 * read from these instead of maintaining three independently hand-written lists.
 */
export const SOP_DETAIL_LEVELS = ['simple', 'standard', 'detailed'] as const;
export type SopDetailLevel = (typeof SOP_DETAIL_LEVELS)[number];

export const SOP_DETAIL_LEVEL_GUIDE: Readonly<Record<SopDetailLevel, { label: string; shortDetail: string; promptGuide: string }>> = {
    simple: {
        label: '핵심 흐름',
        shortDetail: 'Task의 핵심 흐름만',
        promptGuide: '핵심 흐름: Task의 핵심 Activity와 주요 승인 지점만 묶어 큰 단계 중심으로 작성하세요. 세부 실행을 불필요하게 분할하지 마세요.',
    },
    standard: {
        label: '업무 단계',
        shortDetail: 'Activity별 주요 단계',
        promptGuide: '업무 단계: 주요 Activity를 독립적인 업무 단계로 나누고, 실제로 필요한 판단·분기·재작업 지점을 포함하세요.',
    },
    detailed: {
        label: '실행 단위',
        shortDetail: '조건·예외까지 분해',
        promptGuide: '실행 단위: 입력·산출물, 승인 기준, 예외·재작업 조건이 달라지는 지점까지 세분화하세요. 각 단계가 Agent화 가능성을 검토할 수 있는 하나의 실행 단위가 되도록 작성하세요.',
    },
};

export const SOP_BRANCH_POLICIES = ['auto', 'none', 'max'] as const;
export type SopBranchPolicy = (typeof SOP_BRANCH_POLICIES)[number];

export const SOP_BRANCH_POLICY_GUIDE: Readonly<Record<SopBranchPolicy, { label: string; promptGuide: (maxBranches: number) => string }>> = {
    auto: {
        label: 'AI 자동 판단',
        promptGuide: () => '- 분기 정책: auto - 업무 맥락에 실제로 판단/승인/조건 분기가 필요한 지점에서만 decision 노드를 만드세요. decision 노드 개수에 고정 상한은 없지만, 의미 없이 남발하지 마세요.',
    },
    none: {
        label: '분기 없음',
        promptGuide: () => '- 분기 정책: none - decision(판단) 노드를 절대 생성하지 마세요. 모든 단계는 순차적으로 연결되어야 합니다.',
    },
    max: {
        label: '최대 개수 지정',
        promptGuide: (maxBranches) => `- 분기 정책: max - decision(판단) 노드를 최대 ${maxBranches}개까지만 생성하세요. 그 이상은 허용되지 않습니다.`,
    },
};

export type SopSetupValidationField =
    | 'minSteps'
    | 'maxSteps'
    | 'maxTotalNodes'
    | 'branchPolicy'
    | 'maxBranches'
    | 'maxLoops';

export interface SopSetupValidationIssue {
    field: SopSetupValidationField;
    message: string;
}

export interface SopSetupValidationInput {
    minSteps: unknown;
    maxSteps: unknown;
    maxTotalNodes?: unknown;
    branchPolicy: unknown;
    maxBranches: unknown;
    allowRework: unknown;
    maxLoops?: unknown;
}

function isPositiveInteger(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

function isNonNegativeInteger(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

/**
 * SopSetupConfig(및 이와 동형인 API 요청 바디)을 검증한다.
 *
 * - minSteps/maxSteps: 양의 정수, minSteps < maxSteps
 * - maxTotalNodes: 정수이며 최소 minSteps + 2(시작·종료) 이상
 * - maxBranches: MAX_BRANCHES_MIN~MAX_BRANCHES_MAX 사이의 정수
 * - maxLoops: allowRework=true일 때만 검증(0 이상의 정수) - allowRework=false면 적용되지 않으므로 검증 대상에서 제외
 * - branchPolicy: 'auto' | 'none' | 'max'만 허용
 */
export function validateSopSetupConfig(input: SopSetupValidationInput): SopSetupValidationIssue[] {
    const issues: SopSetupValidationIssue[] = [];

    const minStepsValid = isPositiveInteger(input.minSteps);
    const maxStepsValid = isPositiveInteger(input.maxSteps);

    if (!minStepsValid) {
        issues.push({ field: 'minSteps', message: '최소 단계 수는 1 이상의 정수여야 합니다.' });
    }
    if (!maxStepsValid) {
        issues.push({ field: 'maxSteps', message: '최대 단계 수는 1 이상의 정수여야 합니다.' });
    }
    if (minStepsValid && maxStepsValid && (input.minSteps as number) >= (input.maxSteps as number)) {
        issues.push({ field: 'maxSteps', message: '최대 단계 수는 최소 단계 수보다 커야 합니다.' });
    }

    if (input.maxTotalNodes !== undefined) {
        if (!isPositiveInteger(input.maxTotalNodes)) {
            issues.push({ field: 'maxTotalNodes', message: '전체 노드 수 상한은 1 이상의 정수여야 합니다.' });
        } else if (minStepsValid && (input.maxTotalNodes as number) < (input.minSteps as number) + 2) {
            issues.push({
                field: 'maxTotalNodes',
                message: `전체 노드 수 상한은 최소 단계 수 + 시작·종료 2개(최소 ${(input.minSteps as number) + 2}개) 이상이어야 합니다.`,
            });
        }
    }

    if (typeof input.branchPolicy !== 'string' || !SOP_BRANCH_POLICIES.includes(input.branchPolicy as SopBranchPolicy)) {
        issues.push({ field: 'branchPolicy', message: "분기 정책은 'auto', 'none', 'max' 중 하나여야 합니다." });
    }

    if (
        !isPositiveInteger(input.maxBranches) ||
        (input.maxBranches as number) < MAX_BRANCHES_MIN ||
        (input.maxBranches as number) > MAX_BRANCHES_MAX
    ) {
        issues.push({
            field: 'maxBranches',
            message: `decision(판단) 노드 최대 개수는 ${MAX_BRANCHES_MIN}~${MAX_BRANCHES_MAX} 사이의 정수여야 합니다.`,
        });
    }

    // allowRework=false면 maxLoops는 적용되지 않으므로(SopGenerationSettings UI가 "적용되지 않음"으로
    // 표시) 값이 무엇이든 검증하지 않는다.
    if (input.allowRework === true && input.maxLoops !== undefined) {
        if (!isNonNegativeInteger(input.maxLoops)) {
            issues.push({ field: 'maxLoops', message: '최대 재작업 루프 수는 0 이상의 정수여야 합니다.' });
        }
    }

    return issues;
}
