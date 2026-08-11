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

const VALID_BRANCH_POLICIES = ['auto', 'none', 'max'] as const;

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

    if (typeof input.branchPolicy !== 'string' || !VALID_BRANCH_POLICIES.includes(input.branchPolicy as (typeof VALID_BRANCH_POLICIES)[number])) {
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

export function hasSopSetupErrors(issues: SopSetupValidationIssue[]): boolean {
    return issues.length > 0;
}
