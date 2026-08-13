import type { SopStepData, WorkLibrarySelection } from './sop-types';
import { getScopedActivities } from './sop-task-library';

export interface SopActivityCoverageResult {
    valid: boolean;
    coveredIds: string[];
    missingIds: string[];
    unknownIds: string[];
    unmappedBusinessStepIds: string[];
}

export function validateSopActivityCoverage(
    steps: Pick<SopStepData, 'id' | 'terminalType' | 'sourceActivityIds'>[],
    workLibrary: WorkLibrarySelection
): SopActivityCoverageResult {
    const allowed = new Set(getScopedActivities(workLibrary).map((activity) => activity.id));
    const businessSteps = steps.filter((step) => !step.terminalType);
    const mappedIds = businessSteps.flatMap((step) => step.sourceActivityIds ?? []);
    const coveredIds = [...new Set(mappedIds.filter((id) => allowed.has(id)))];
    const unknownIds = [...new Set(mappedIds.filter((id) => !allowed.has(id)))];
    const missingIds = [...allowed].filter((id) => !coveredIds.includes(id));
    const unmappedBusinessStepIds = businessSteps.filter((step) => !(step.sourceActivityIds?.length)).map((step) => step.id);
    return {
        valid: unknownIds.length === 0 && missingIds.length === 0 && unmappedBusinessStepIds.length === 0,
        coveredIds,
        missingIds,
        unknownIds,
        unmappedBusinessStepIds,
    };
}

export function validateGeneratedActivityCoverage(
    steps: Pick<SopStepData, 'id' | 'terminalType' | 'sourceActivityIds'>[],
    allowedActivityIds: string[]
): SopActivityCoverageResult {
    const allowed = new Set(allowedActivityIds);
    const businessSteps = steps.filter((step) => !step.terminalType);
    const mappedIds = businessSteps.flatMap((step) => step.sourceActivityIds ?? []);
    const coveredIds = [...new Set(mappedIds.filter((id) => allowed.has(id)))];
    const unknownIds = [...new Set(mappedIds.filter((id) => !allowed.has(id)))];
    const missingIds = [...allowed].filter((id) => !coveredIds.includes(id));
    const unmappedBusinessStepIds = businessSteps.filter((step) => !(step.sourceActivityIds?.length)).map((step) => step.id);
    return { valid: unknownIds.length === 0 && missingIds.length === 0 && unmappedBusinessStepIds.length === 0, coveredIds, missingIds, unknownIds, unmappedBusinessStepIds };
}

export function formatSopActivityCoverageErrors(result: SopActivityCoverageResult): string[] {
    const messages: string[] = [];
    if (result.missingIds.length) messages.push(`반영되지 않은 Activity ID: ${result.missingIds.join(', ')}`);
    if (result.unknownIds.length) messages.push(`선택 Task에 없는 Activity ID: ${result.unknownIds.join(', ')}`);
    if (result.unmappedBusinessStepIds.length) messages.push(`Activity 연결이 없는 업무 단계: ${result.unmappedBusinessStepIds.join(', ')}`);
    return messages;
}

export interface SopSubActionStructureResult extends SopActivityCoverageResult {
    /** Non-terminal steps mapped to more than one Activity — invalid for the new structure (exactly one required). */
    multiActivityStepIds: string[];
    /** Non-terminal steps whose subActionOrder is missing or not a positive integer. */
    invalidOrderStepIds: string[];
    /** Activity ids that have two or more Sub Action steps sharing the same subActionOrder. */
    duplicateOrderActivityIds: string[];
}

/**
 * Stricter coverage check for the new Activity–Sub Action document structure
 * (structureVersion 'activity-subaction-v1'): every non-terminal step must map
 * to exactly one allowed Activity id (not zero, not several) and carry a
 * positive-integer subActionOrder that is unique among the other Sub Actions of
 * that same Activity. Every allowed Activity id must still be covered by at
 * least one Sub Action, and no unknown/cross-Task id may appear — reuses the
 * same coverage semantics as validateGeneratedActivityCoverage for those parts.
 */
export function validateSubActionStructure(
    steps: Pick<SopStepData, 'id' | 'terminalType' | 'sourceActivityIds' | 'subActionOrder'>[],
    allowedActivityIds: string[]
): SopSubActionStructureResult {
    const allowed = new Set(allowedActivityIds);
    const businessSteps = steps.filter((step) => !step.terminalType);

    const mappedIds = businessSteps.flatMap((step) => step.sourceActivityIds ?? []);
    const coveredIds = [...new Set(mappedIds.filter((id) => allowed.has(id)))];
    const unknownIds = [...new Set(mappedIds.filter((id) => !allowed.has(id)))];
    const missingIds = [...allowed].filter((id) => !coveredIds.includes(id));
    const unmappedBusinessStepIds = businessSteps.filter((step) => !(step.sourceActivityIds?.length)).map((step) => step.id);
    const multiActivityStepIds = businessSteps.filter((step) => (step.sourceActivityIds?.length ?? 0) > 1).map((step) => step.id);
    const invalidOrderStepIds = businessSteps
        .filter((step) => !(Number.isInteger(step.subActionOrder) && (step.subActionOrder as number) > 0))
        .map((step) => step.id);

    const ordersByActivity = new Map<string, number[]>();
    businessSteps.forEach((step) => {
        const activityId = step.sourceActivityIds?.length === 1 ? step.sourceActivityIds[0] : undefined;
        if (!activityId || step.subActionOrder === undefined) return;
        const orders = ordersByActivity.get(activityId) ?? [];
        orders.push(step.subActionOrder);
        ordersByActivity.set(activityId, orders);
    });
    const duplicateOrderActivityIds = [...ordersByActivity.entries()]
        .filter(([, orders]) => new Set(orders).size !== orders.length)
        .map(([activityId]) => activityId);

    const valid =
        unknownIds.length === 0 &&
        missingIds.length === 0 &&
        unmappedBusinessStepIds.length === 0 &&
        multiActivityStepIds.length === 0 &&
        invalidOrderStepIds.length === 0 &&
        duplicateOrderActivityIds.length === 0;

    return { valid, coveredIds, missingIds, unknownIds, unmappedBusinessStepIds, multiActivityStepIds, invalidOrderStepIds, duplicateOrderActivityIds };
}

export function formatSubActionStructureErrors(result: SopSubActionStructureResult): string[] {
    const messages = formatSopActivityCoverageErrors(result);
    if (result.multiActivityStepIds.length) messages.push(`Sub Action은 정확히 하나의 Activity만 가져야 합니다 (위반 단계): ${result.multiActivityStepIds.join(', ')}`);
    if (result.invalidOrderStepIds.length) messages.push(`Sub Action 순서(subActionOrder)가 없거나 유효하지 않은 단계: ${result.invalidOrderStepIds.join(', ')}`);
    if (result.duplicateOrderActivityIds.length) messages.push(`같은 Activity 안에서 Sub Action 순서가 중복된 Activity: ${result.duplicateOrderActivityIds.join(', ')}`);
    return messages;
}

export interface SopSubActionOriginResult {
    valid: boolean;
    /** Non-terminal steps with no subActionOrigin at all — a draft may legitimately have these; only the confirm boundary rejects them. */
    missingOriginStepIds: string[];
    /** subActionOrigin: 'context-derived' but subActionOriginRationale is empty/whitespace-only. */
    missingRationaleStepIds: string[];
    /** subActionOrigin: 'activity-derived' but a non-empty subActionOriginRationale is still present — a leftover from switching away from 'context-derived' that was never cleared. */
    unexpectedRationaleStepIds: string[];
}

/**
 * Confirm-boundary-only check for the newer Activity–Sub Action document
 * structure's provenance fields (subaction-semantics-contract.md §7): every
 * non-terminal Sub Action must be traceable as either `activity-derived`
 * (the Activity's own baseline decomposition) or `context-derived` (a member
 * work-context augmentation, which requires a concrete rationale). This is
 * NOT a draft-schema requirement — a document mid-edit may legitimately have
 * steps with no origin yet; only confirming (`validateFullSopConfirmation`)
 * calls this, gated on `structureVersion === 'activity-subaction-v1'` so
 * legacy documents are never retroactively held to it.
 */
export function validateSubActionOrigins(
    steps: Pick<SopStepData, 'id' | 'terminalType' | 'subActionOrigin' | 'subActionOriginRationale'>[]
): SopSubActionOriginResult {
    const businessSteps = steps.filter((step) => !step.terminalType);
    const missingOriginStepIds = businessSteps.filter((step) => !step.subActionOrigin).map((step) => step.id);
    const missingRationaleStepIds = businessSteps
        .filter((step) => step.subActionOrigin === 'context-derived' && !step.subActionOriginRationale?.trim())
        .map((step) => step.id);
    const unexpectedRationaleStepIds = businessSteps
        .filter((step) => step.subActionOrigin === 'activity-derived' && Boolean(step.subActionOriginRationale?.trim()))
        .map((step) => step.id);
    return {
        valid: missingOriginStepIds.length === 0 && missingRationaleStepIds.length === 0 && unexpectedRationaleStepIds.length === 0,
        missingOriginStepIds,
        missingRationaleStepIds,
        unexpectedRationaleStepIds,
    };
}

export function formatSubActionOriginErrors(result: SopSubActionOriginResult): string[] {
    const messages: string[] = [];
    if (result.missingOriginStepIds.length) messages.push(`Sub Action 생성 근거(activity-derived/context-derived)가 지정되지 않은 단계: ${result.missingOriginStepIds.join(', ')}`);
    if (result.missingRationaleStepIds.length) messages.push(`직무 맥락 보강(context-derived)인데 구체적인 근거가 없는 단계: ${result.missingRationaleStepIds.join(', ')}`);
    if (result.unexpectedRationaleStepIds.length) messages.push(`Activity 기본 분해(activity-derived)인데 불필요한 맥락 근거가 남아있는 단계: ${result.unexpectedRationaleStepIds.join(', ')}`);
    return messages;
}
