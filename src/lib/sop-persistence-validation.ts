import { getAgentizableSopStepIds } from './sop-agentization';
import { validateFullSopConfirmation } from './sop-review';
import type { SopDocument } from './sop-types';

/**
 * Validates domain claims that have meaning beyond a document's JSON shape.
 * Drafts remain intentionally permissive; a document only has to satisfy the
 * full confirmation rules when it claims `reviewStatus: 'confirmed'`.
 */
export function validateSopPersistenceState(document: SopDocument): string[] {
    const errors: string[] = [];

    if (document.reviewStatus === 'confirmed') {
        // validateFullSopConfirmation is the single shared confirm authority: it covers
        // content completeness, review status, AI SKILL handling, graph validity, AND
        // (for structureVersion 'activity-subaction-v1') the full Sub Action contract —
        // structure (exactly-one Activity mapping, unique positive subActionOrder,
        // Activity coverage) and origin tracing. No second, divergent check is kept
        // here: the server rejects exactly what the client's confirm flow rejects.
        const confirmation = validateFullSopConfirmation(document);
        if (!confirmation.success) errors.push(...confirmation.errors);
        if (document.steps.some((step) => step.reviewStatus !== 'confirmed')) {
            errors.push('확정된 SOP의 모든 단계는 confirmed 상태여야 합니다.');
        }
    } else if (document.steps.some((step) => step.reviewStatus === 'confirmed')) {
        errors.push('문서 전체를 확정하지 않은 상태에서는 개별 단계를 confirmed로 저장할 수 없습니다.');
    }

    const review = document.agentizationReview;
    if (!review?.confirmedAt) return errors;

    const eligibleIds = getAgentizableSopStepIds(document);
    const eligibleIdSet = new Set(eligibleIds);
    const selectedIdSet = new Set(review.stepIds);
    const selectedIds = review.stepIds;

    if (selectedIds.length === 0) {
        errors.push('확정된 Agent화 검토에는 대상 단계가 하나 이상 필요합니다.');
    }
    if (selectedIdSet.size !== selectedIds.length) {
        errors.push('확정된 Agent화 검토의 대상 단계가 중복되었습니다.');
    }
    if (selectedIds.some((id) => !eligibleIdSet.has(id))) {
        errors.push('확정된 Agent화 검토에는 존재하지 않거나 시작·종료 단계인 대상이 포함될 수 없습니다.');
    }
    if (review.scope === 'workflow' && (selectedIds.length !== eligibleIds.length || eligibleIds.some((id) => !selectedIdSet.has(id)))) {
        errors.push('전체 워크플로 Agent화 검토는 모든 비-terminal 단계를 대상으로 해야 합니다.');
    }
    if (selectedIds.some((id) => !review.stepModes[id])) {
        errors.push('확정된 Agent화 검토의 모든 대상 단계에는 AI 적용 방식이 필요합니다.');
    }
    if (Object.keys(review.stepModes).some((id) => !selectedIdSet.has(id) || !eligibleIdSet.has(id))) {
        errors.push('Agent화 적용 방식은 선택된 비-terminal 단계에만 지정할 수 있습니다.');
    }

    return errors;
}

/** A persisted record owner and its embedded member identity must never diverge. */
export function validateSopDocumentOwner(document: SopDocument, memberId: string): string[] {
    return document.member.id !== undefined && document.member.id !== memberId
        ? ['record.memberId와 document.member.id는 동일해야 합니다.']
        : [];
}
