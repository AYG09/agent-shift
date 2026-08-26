/**
 * Task 추천 로딩·결과 화면이 공유하는 정적 문구 SSOT.
 *
 * 왜 별도 모듈인가: NFR-LOAD-001은 실제 진행률을 알 수 없으므로 숫자형 퍼센트나
 * 가짜 완료 단계를 금지한다. 그래서 로딩 중에는 모델이 실시간 생성하는 문구가
 * 아니라, 검토 가능한 정적 제품 콘텐츠를 순환한다
 * (docs/sop-member-context-redesign/SPEC.md §3.3). 화면(SopRecommendationLoading)과
 * 결과 화면(SopTaskRecommendationFlow)이 각자 문자열을 인라인으로 다시 쓰면 두 화면의
 * 문구가 조용히 어긋날 수 있으므로 여기 하나에서만 관리한다.
 */

export interface SopRecommendationLoadingTip {
    id: string;
    text: string;
}

/**
 * 순환 도움말. SPEC §3.3이 요구하는 다섯 가지 의미를 각각 한 항목으로 담는다:
 * 추천은 확정이 아님 / Task Library 범위 안에서만 추천 / 다음 화면에서 수정 가능 /
 * Activity가 이후 Sub Action으로 구체화됨 / 실패해도 직접 검색 가능.
 */
export const SOP_RECOMMENDATION_LOADING_TIPS: SopRecommendationLoadingTip[] = [
    {
        id: 'not-auto-confirmed',
        text: 'AI 추천은 Task를 자동으로 확정하지 않습니다. 다음 화면에서 회원님이 직접 확인하고 선택합니다.',
    },
    {
        id: 'library-scope',
        text: '추천은 현재 Task Library에 등록된 Task 범위 안에서만 제시됩니다.',
    },
    {
        id: 'editable-next',
        text: '다음 화면에서 Task, Activity, Skill을 실제 업무에 맞게 자유롭게 수정할 수 있습니다.',
    },
    {
        id: 'activity-to-subaction',
        text: '확정한 Activity는 이후 SOP 생성에서 Sub Action 단위로 구체화됩니다.',
    },
    {
        id: 'manual-fallback',
        text: '추천이 실패하거나 원하는 Task가 없으면 언제든 Task를 직접 검색해 선택할 수 있습니다.',
    },
];

/** 도움말 자동 순환 간격. 서버 응답 대기와 무관한 값이며, 응답을 늦추지 않는다(NFR-LOAD-002). */
export const SOP_RECOMMENDATION_TIP_INTERVAL_MS = 4500;

/** aria-live가 알려야 하는 시작·성공·실패 상태 문구 (NFR-LOAD-004: tip 회전마다 읽지 않는다). */
export const SOP_RECOMMENDATION_STATUS_MESSAGES = {
    pending: 'AI가 업무맥락을 바탕으로 Task Library에서 추천을 준비하고 있습니다.',
    ready: (count: number) => `추천 결과 ${count}건이 도착했습니다. 이어서 확인해 주세요.`,
    error: (message: string) => `Task 추천을 받아오지 못했습니다. ${message}`,
} as const;

export const SOP_TOP_RECOMMENDATION_LABEL = '가장 관련성 높은 추천';
export const SOP_RECOMMENDATION_CONFIRM_ACTION_LABEL = '이 Task로 계속';
