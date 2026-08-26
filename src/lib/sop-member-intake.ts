/**
 * 구성원 intake 도메인 — 프로토타입 로그인 세션, 단일 업무맥락(SSOT), Task 추천
 * 상태, 그리고 이 셋에서 파생되는 route 접근 판정을 담는 순수 모듈이다.
 *
 * 왜 별도 모듈인가: 재설계 이전에는 "추천용 입력(taskRecommendationInput)"과
 * "생성용 맥락(context)"이 Store에 서로 독립된 두 문자열로 존재했다. 그래서 AI가
 * 추천한 근거와 SOP를 생성한 근거가 조용히 달라질 수 있었다
 * (docs/sop-member-context-redesign/CONTEXT.md §3.2). 이 모듈은 그 둘을 하나의
 * 권위 있는 업무맥락으로 합치고, 무엇이 언제 무효화되는지를 UI가 아니라 도메인
 * 함수로 결정한다.
 *
 * 이 모듈은 zustand·React·라우터를 import하지 않는다. Store(sop-prototype-store.ts)와
 * route guard 컴포넌트가 이 함수들을 호출하는 방향만 존재한다.
 *
 * 불변식:
 * - 세션의 기본 상태는 언제나 `anonymous`다. Store에 샘플 persona(memberInfo)가
 *   들어 있다는 사실은 인증 근거가 아니다 (SPEC §3.1).
 * - 업무맥락은 `MemberContextState` 하나뿐이다. 추천 request와 SOP 생성 request는
 *   같은 원문을 읽는다 (REQ-CTX-004 / TST-STATE-004).
 * - 이 모듈은 실제 신원 인증이 아니다. 비밀번호·API key·주민번호를 다루지 않는다.
 */
import type { SopMember } from './sop-types';

export type SopMemberSessionStatus = 'anonymous' | 'authenticated';

export interface PrototypeMemberSession {
    status: SopMemberSessionStatus;
    /** authenticated일 때만 non-null. anonymous 세션은 구성원 정보를 갖지 않는다. */
    member: SopMember | null;
    authenticatedAt?: string;
}

export interface MemberContextState {
    /** 구성원이 현재 편집 중인 원문. */
    draft: string;
    /** `입력 완료`로 제출·확정된 원문. 추천과 SOP 생성이 함께 읽는 권위 있는 값. */
    confirmedText?: string;
    confirmedAt?: string;
    /**
     * 마이그레이션 때 발견된, 채택되지 않은 legacy 원문. 무손실 마이그레이션을
     * 위해 보존만 하며 어떤 계산에도 쓰이지 않는다 — 두 번째 권위 원본이 아니다.
     */
    legacyCandidates?: string[];
}

export type TaskRecommendationStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface TaskRecommendationCandidateState {
    taskId: string;
    rank: number;
    reason: string;
}

export interface TaskRecommendationState {
    status: TaskRecommendationStatus;
    /**
     * 이 추천이 어떤 업무맥락에서 나왔는지를 가리키는 키. 늦게 도착한 응답이 새
     * 맥락의 상태를 덮어쓰는 것을 도메인 차원에서 막는다 (Session B가 사용).
     */
    contextKey?: string;
    candidates: TaskRecommendationCandidateState[];
    error?: string;
    /**
     * 이 contextKey로 **실제 요청을 보냈는가**. `status: 'pending'`은 "요청해야 한다"는
     * 뜻이고 이 값은 "이미 보냈다"는 뜻이라 서로 다르다. 둘을 구분하지 않으면 화면
     * 재마운트마다 같은 맥락으로 요청이 반복된다 (TST-STATE-003).
     */
    requested?: boolean;
}

export const ANONYMOUS_MEMBER_SESSION: PrototypeMemberSession = { status: 'anonymous', member: null };
export const EMPTY_MEMBER_CONTEXT: MemberContextState = { draft: '' };
export const IDLE_TASK_RECOMMENDATION: TaskRecommendationState = { status: 'idle', candidates: [] };

/**
 * 재설계 이전 Store가 `context`의 기본값으로 갖고 있던 fixture 안내 문장.
 *
 * 이 문장은 어떤 구성원도 직접 작성한 적이 없다. 마이그레이션이 이 값을 확정
 * 업무맥락으로 승격하면 AI 추천이 "샘플 안내문"을 근거로 동작하게 되므로,
 * SPEC §3.2의 "fixture의 일반 안내 문장을 실제 사용자의 확정 업무맥락으로 간주하지
 * 않는다"에 따라 여기서 식별해 제외한다. Store가 기본값으로 다시 쓸 수 있도록
 * 이 모듈이 단일 원천으로 보관한다.
 */
export const LEGACY_SAMPLE_CONTEXT_SENTENCE =
    '실제 업무 순서, 승인 조건, 예외 상황, 사용 시스템, 반드시 지켜야 할 기준, 협업 방식과 자주 되돌아가는 단계를 검토하여 SOP를 구체화합니다.';

/** 로그인 게이트의 필수 입력. 직급(grade)은 선택 입력이다 (REQ-AUTH-002). */
export const REQUIRED_MEMBER_IDENTITY_FIELDS = ['employeeId', 'name', 'organization', 'jobRole'] as const;
export type RequiredMemberIdentityField = (typeof REQUIRED_MEMBER_IDENTITY_FIELDS)[number];

const REQUIRED_FIELD_LABELS: Record<RequiredMemberIdentityField, string> = {
    employeeId: '사번',
    name: '이름',
    organization: '조직',
    jobRole: '주요 직무',
};

export type MemberIdentityValidation =
    | { ok: true; member: SopMember }
    | { ok: false; fieldErrors: Partial<Record<RequiredMemberIdentityField, string>> };

/**
 * 로그인 입력 검증. 화면이 아니라 도메인이 "무엇이 비었는가"를 결정하므로 로그인
 * 게이트와 테스트가 같은 규칙을 공유한다. 첫 오류 필드로 focus를 옮기는 UI 동작은
 * `fieldErrors`의 키 순서(REQUIRED_MEMBER_IDENTITY_FIELDS 순서)를 그대로 쓰면 된다.
 */
export function validateMemberIdentity(input: Partial<SopMember>): MemberIdentityValidation {
    const fieldErrors: Partial<Record<RequiredMemberIdentityField, string>> = {};
    REQUIRED_MEMBER_IDENTITY_FIELDS.forEach((field) => {
        if (!input[field]?.trim()) fieldErrors[field] = `${REQUIRED_FIELD_LABELS[field]}을(를) 입력하세요.`;
    });
    if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

    const member: SopMember = {
        employeeId: input.employeeId!.trim(),
        name: input.name!.trim(),
        organization: input.organization!.trim(),
        jobRole: input.jobRole!.trim(),
    };
    const grade = input.grade?.trim();
    if (grade) member.grade = grade;
    if (input.id) member.id = input.id;
    return { ok: true, member };
}

export function authenticateMemberSession(member: SopMember, now: string): PrototypeMemberSession {
    return { status: 'authenticated', member, authenticatedAt: now };
}

export function isAuthenticated(session: PrototypeMemberSession | undefined): boolean {
    return session?.status === 'authenticated' && !!session.member;
}

/**
 * 두 구성원이 같은 사람인지 판정한다. 로그아웃 없이 다른 구성원으로 로그인하면
 * 미확정 맥락·추천·Work Map을 무효화해야 하는데(§4.2), 그 판단 기준이다.
 * 사번이 프로토타입의 신원 키이며, 사번이 없는 legacy 값은 이름+직무로 비교한다.
 */
export function isSameMember(left: SopMember | null | undefined, right: SopMember | null | undefined): boolean {
    if (!left || !right) return false;
    if (left.employeeId && right.employeeId) return left.employeeId === right.employeeId;
    return left.name === right.name && left.jobRole === right.jobRole;
}

/** 업무맥락 비교·전송에 쓰는 정규화. 앞뒤 공백과 줄 끝 공백만 제거하고 원문 줄바꿈은 보존한다. */
export function normalizeWorkContext(text: string | undefined): string {
    if (!text) return '';
    return text
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .trim();
}

/** 공백만 있는 입력은 제출할 수 없다. 고객이 정하지 않은 최대 글자 수는 강제하지 않는다 (INT-CTX-002). */
export function isSubmittableContext(text: string | undefined): boolean {
    return normalizeWorkContext(text).length > 0;
}

/**
 * 업무맥락의 동일성 키. 늦게 도착한 추천 응답이 "지금 화면의 맥락"에서 나온
 * 것인지 비교하는 용도이며, 보안 해시가 아니다. 결정론적이어야 하므로 시각·난수를
 * 쓰지 않는다.
 */
export function computeContextKey(text: string | undefined): string {
    const normalized = normalizeWorkContext(text);
    if (!normalized) return '';
    let hash = 5381;
    for (let index = 0; index < normalized.length; index += 1) {
        hash = ((hash << 5) + hash + normalized.charCodeAt(index)) >>> 0;
    }
    return `ctx-${normalized.length}-${hash.toString(36)}`;
}

/**
 * 추천·생성이 함께 읽는 권위 있는 업무맥락 원문.
 *
 * 확정본이 있으면 확정본을, 아직 확정 전이면 작성 중인 draft를 돌려준다. 두
 * 호출자(추천 request 조립, SOP 생성 request 조립)가 같은 함수를 쓰기 때문에
 * TST-STATE-004(두 request의 맥락 문자열 동일)가 화면 구현과 무관하게 성립한다.
 */
export function selectAuthoritativeWorkContext(context: MemberContextState | undefined): string {
    if (!context) return '';
    return normalizeWorkContext(context.confirmedText ?? context.draft);
}

/** draft가 확정본과 실질적으로 달라졌는가 — 확정 시 무엇을 무효화할지 판단하는 기준. */
export function hasUnconfirmedContextChange(context: MemberContextState | undefined): boolean {
    if (!context) return false;
    if (context.confirmedText === undefined) return isSubmittableContext(context.draft);
    return normalizeWorkContext(context.draft) !== normalizeWorkContext(context.confirmedText);
}

export interface ContextConfirmationImpact {
    /** 확정하면 기존 추천 후보가 버려지는가. */
    invalidatesRecommendation: boolean;
    /** 확정하면 이미 만들어진(미확정) Work Map 초안이 버려지는가. */
    invalidatesWorkMapDraft: boolean;
    /** 사용자에게 사전 경고와 명시적 확인을 받아야 하는가 (§4.2: 자동 삭제 금지). */
    requiresExplicitConfirmation: boolean;
}

/**
 * "지금 이 맥락을 확정하면 무엇이 사라지는가"를 미리 계산한다. UI는 이 값으로
 * 경고를 띄우고, 사용자가 수락했을 때에만 confirm 액션을 호출한다 — 도메인이
 * 조용히 지우지 않는다 (SPEC §4.2).
 */
export function describeContextConfirmationImpact(params: {
    context: MemberContextState;
    recommendation: TaskRecommendationState;
    hasWorkMapDraft: boolean;
}): ContextConfirmationImpact {
    const changed = hasUnconfirmedContextChange(params.context);
    const invalidatesRecommendation = changed && params.recommendation.status !== 'idle';
    const invalidatesWorkMapDraft = changed && params.hasWorkMapDraft;
    return {
        invalidatesRecommendation,
        invalidatesWorkMapDraft,
        requiresExplicitConfirmation: invalidatesRecommendation || invalidatesWorkMapDraft,
    };
}

export interface ConfirmedContextResult {
    context: MemberContextState;
    recommendation: TaskRecommendationState;
    /** true면 호출자(Store)가 Work Map 초안을 버려야 한다. */
    discardWorkMapDraft: boolean;
    contextKey: string;
}

/**
 * 업무맥락 제출. 확정 원문을 고정하고, 그 맥락에서 나오지 않은 추천을
 * `pending`으로 되돌린다(=다시 요청해야 함). 실제 API 호출은 Session B의 몫이며
 * 이 함수는 상태 전이만 담당한다.
 */
export function confirmMemberContext(params: {
    context: MemberContextState;
    recommendation: TaskRecommendationState;
    hasWorkMapDraft: boolean;
    now: string;
}): ConfirmedContextResult | null {
    if (!isSubmittableContext(params.context.draft)) return null;
    const confirmedText = normalizeWorkContext(params.context.draft);
    const contextKey = computeContextKey(confirmedText);
    const impact = describeContextConfirmationImpact(params);
    return {
        context: { ...params.context, draft: confirmedText, confirmedText, confirmedAt: params.now },
        recommendation: { status: 'pending', candidates: [], contextKey },
        discardWorkMapDraft: impact.invalidatesWorkMapDraft,
        contextKey,
    };
}

/**
 * 늦게 도착한(stale) 추천 응답인지 판정한다. 요청을 보낼 때의 contextKey와 현재
 * 상태의 contextKey가 다르면 그 응답은 버린다 — 취소·맥락 재편집 뒤 도착한 응답이
 * 현재 화면을 덮는 것을 막는다.
 */
export function isStaleRecommendationResponse(current: TaskRecommendationState, responseContextKey: string | undefined): boolean {
    return (current.contextKey ?? '') !== (responseContextKey ?? '');
}

export interface MemberIntakeMigrationInput {
    /** legacy Store의 추천 전용 입력 */
    taskRecommendationInput?: unknown;
    /** legacy Store의 생성 전용 맥락 */
    context?: unknown;
}

export interface MemberIntakeMigrationResult {
    session: PrototypeMemberSession;
    memberContext: MemberContextState;
    recommendation: TaskRecommendationState;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/**
 * legacy persisted 상태 → 새 intake 상태. 결정론적이고 무손실이다.
 *
 * 규칙 (SPEC §3.2):
 * 1. 구성원이 직접 작성한 `taskRecommendationInput`이 비어 있지 않으면 그것을 draft
 *    후보로 삼는다. 자동 제출하지 않으므로 `confirmedText`는 만들지 않는다.
 * 2. 없으면 `context`를 쓰되, fixture 기본 안내 문장은 사용자의 맥락이 아니므로
 *    제외한다.
 * 3. 채택되지 않은 나머지 원문은 `legacyCandidates`에 그대로 보존한다(무손실).
 * 4. 세션은 언제나 `anonymous`로 시작한다. 저장된 memberInfo 샘플은 로그인 폼의
 *    빠른 입력값일 뿐 인증 근거가 아니다.
 */
export function migrateMemberIntakeState(input: MemberIntakeMigrationInput): MemberIntakeMigrationResult {
    const recommendationInput = normalizeWorkContext(asString(input.taskRecommendationInput));
    const legacyContext = normalizeWorkContext(asString(input.context));
    const usableLegacyContext = legacyContext === normalizeWorkContext(LEGACY_SAMPLE_CONTEXT_SENTENCE) ? '' : legacyContext;

    const draft = recommendationInput || usableLegacyContext;
    const legacyCandidates = [recommendationInput, usableLegacyContext].filter((text) => text && text !== draft);

    const memberContext: MemberContextState = { draft };
    if (legacyCandidates.length > 0) memberContext.legacyCandidates = legacyCandidates;

    return {
        session: ANONYMOUS_MEMBER_SESSION,
        memberContext,
        recommendation: IDLE_TASK_RECOMMENDATION,
    };
}

/** 재설계 흐름의 route들. 기존 `/sop`(Home)과 `/sop/setup`은 Wave 2가 연결한다. */
export const SOP_INTAKE_ROUTES = {
    login: '/sop/login',
    context: '/sop/context',
    recommendation: '/sop/recommendation',
    workMapSimple: '/sop/work-map/simple',
    workMapDetailed: '/sop/work-map/detailed',
} as const;

export type SopIntakeRoute = (typeof SOP_INTAKE_ROUTES)[keyof typeof SOP_INTAKE_ROUTES];

export interface MemberIntakeGuardState {
    session: PrototypeMemberSession;
    memberContext: MemberContextState;
    recommendation: TaskRecommendationState;
    hasWorkMapDraft: boolean;
}

export type IntakeRouteDecision = { allowed: true } | { allowed: false; redirectTo: SopIntakeRoute; reason: string };

/**
 * route 접근 판정. **URL이나 query가 아니라 도메인 상태로만** 결정한다
 * (SPEC §2.2: "새 라우트 가드는 화면 redirect만 수행하는 장식이 아니다").
 *
 * 로그인한 사용자가 `/sop/login`에 접근하는 것 자체는 막지 않는다 — 로그아웃 후
 * 다른 구성원으로 다시 들어오는 경로이기 때문이다. 화면이 안내를 덧붙일 수 있게
 * `allowed: true`로 두고, 되돌아갈 위치 판단은 화면에 맡긴다.
 */
export function resolveIntakeRouteAccess(route: SopIntakeRoute, state: MemberIntakeGuardState): IntakeRouteDecision {
    if (route === SOP_INTAKE_ROUTES.login) return { allowed: true };

    if (!isAuthenticated(state.session)) {
        return { allowed: false, redirectTo: SOP_INTAKE_ROUTES.login, reason: '구성원 정보를 먼저 입력해야 합니다.' };
    }
    if (route === SOP_INTAKE_ROUTES.context) return { allowed: true };

    const hasSubmittedContext = isSubmittableContext(state.memberContext.confirmedText);
    if (!hasSubmittedContext) {
        return { allowed: false, redirectTo: SOP_INTAKE_ROUTES.context, reason: '업무맥락을 먼저 작성해야 합니다.' };
    }
    if (route === SOP_INTAKE_ROUTES.recommendation) return { allowed: true };

    if (!state.hasWorkMapDraft) {
        return { allowed: false, redirectTo: SOP_INTAKE_ROUTES.recommendation, reason: 'Task를 먼저 확인해야 Work Map이 만들어집니다.' };
    }
    return { allowed: true };
}

/**
 * 로그인 직후 이동할 위치. 기존 진행 상태가 있으면 그 지점으로 복귀시켜, 새로고침
 * 한 번에 처음부터 다시 시작하는 일이 없게 한다.
 */
export function resolvePostLoginRoute(state: MemberIntakeGuardState): SopIntakeRoute {
    if (state.hasWorkMapDraft) return SOP_INTAKE_ROUTES.workMapSimple;
    if (isSubmittableContext(state.memberContext.confirmedText)) return SOP_INTAKE_ROUTES.recommendation;
    return SOP_INTAKE_ROUTES.context;
}

/**
 * 로그인 직후 착지점 판정 (`INT-LAND-001`, CONTEXT.md §4 / SPEC.md §2.3).
 *
 * 1차 재설계는 `/sop/context`를 항상 로그인 다음 화면으로 고정했다. 그 결과 SOP가
 * 0건인 신규 구성원과 이미 여러 SOP를 가진 복귀 구성원이 똑같은 화면으로 떨어졌다 —
 * 복귀 구성원에게는 현황 Home이 더 유용한데도. 이 함수는 그 결정을 화면이 아니라
 * 도메인이 내리게 한다.
 *
 * 판정 순서:
 * 1. 미인증 → 로그인 게이트.
 * 2. 진행 중인 intake(확정 context 또는 Work Map 초안)가 있으면 `resolvePostLoginRoute`의
 *    판단을 그대로 재사용해 그 지점으로 복귀시킨다 — 새로고침으로 진행 상태를 잃지 않는다.
 * 3. 진행이 없으면 저장된 record 유무로 갈린다: 0건이면 신규 구성원이므로 곧장
 *    `/sop/context`(빈 Home을 먼저 보여주지 않는다), 1건 이상이면 복귀 구성원이므로
 *    기존 Home(`/sop`)으로 보낸다.
 *
 * `hasStoredRecords`는 이 모듈이 직접 조회하지 않는다 — 이 모듈은 repository·네트워크를
 * 알지 못하므로 호출자(Store/화면)가 넘기는 boolean이다.
 */
export function resolveMemberLandingRoute(state: MemberIntakeGuardState & { hasStoredRecords: boolean }): SopIntakeRoute | '/sop' {
    if (!isAuthenticated(state.session)) return SOP_INTAKE_ROUTES.login;
    const hasIntakeProgress = state.hasWorkMapDraft || isSubmittableContext(state.memberContext.confirmedText);
    if (hasIntakeProgress) return resolvePostLoginRoute(state);
    return state.hasStoredRecords ? '/sop' : SOP_INTAKE_ROUTES.context;
}
