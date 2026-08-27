/**
 * Wave 0 Foundation — 구성원 intake 도메인 테스트.
 *
 * 검증 대상은 화면이 아니라 상태 규칙이다: 프로토타입 로그인 세션, 단일 업무맥락
 * SSOT, legacy persisted 상태의 무손실 마이그레이션, 추천 상태 전이와 중복/stale
 * 요청 방어, 그리고 도메인 상태로만 결정되는 route 가드.
 */
import assert from 'node:assert/strict';
import {
    ANONYMOUS_MEMBER_SESSION,
    LEGACY_SAMPLE_CONTEXT_SENTENCE,
    SOP_INTAKE_ROUTES,
    computeContextKey,
    confirmMemberContext,
    describeContextConfirmationImpact,
    hasUnconfirmedContextChange,
    isStaleRecommendationResponse,
    isSubmittableContext,
    migrateMemberIntakeState,
    normalizeWorkContext,
    resolveIntakeRouteAccess,
    resolveMemberLandingRoute,
    resolvePostLoginRoute,
    selectAuthoritativeWorkContext,
    validateMemberIdentity,
    type MemberContextState,
    type TaskRecommendationState,
} from '../src/lib/sop-member-intake';
import { migrateSopPrototypePersistedState, useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SOP_TASK_LIBRARY_FIXTURE } from '../src/lib/sop-task-library';

void (async () => {

console.log('Identity: 필수 필드 검증과 프로토타입 로그인 세션...');
const missing = validateMemberIdentity({ name: '김구성', jobRole: 'Talent Acquisition' });
assert.equal(missing.ok, false, '사번과 조직이 없으면 세션을 만들 수 없다.');
if (!missing.ok) {
    assert.deepEqual(Object.keys(missing.fieldErrors).sort(), ['employeeId', 'organization']);
}
const blankName = validateMemberIdentity({ employeeId: 'E1', name: '   ', organization: '인사팀', jobRole: 'Talent Acquisition' });
assert.equal(blankName.ok, false, '공백만 있는 필수 입력은 유효하지 않다.');

const valid = validateMemberIdentity({ employeeId: ' E1001 ', name: ' 김구성 ', organization: ' 인재확보팀 ', jobRole: ' Talent Acquisition ', grade: '  ' });
assert.equal(valid.ok, true);
if (valid.ok) {
    assert.equal(valid.member.employeeId, 'E1001', '앞뒤 공백은 제거한다.');
    assert.equal(valid.member.grade, undefined, '직급은 선택 입력이며 공백은 저장하지 않는다.');
}

console.log('Context: 하나의 원문이 추천과 생성 양쪽의 권위 원본이다...');
const context: MemberContextState = { draft: '  채용 요청 접수부터 최종 합격 통보까지 수행한다.\n  ' };
assert.equal(isSubmittableContext(context.draft), true);
assert.equal(isSubmittableContext('   \n  '), false, '공백만 있는 입력은 제출할 수 없다 (TST-REC-001).');

const confirmed = confirmMemberContext({ context, recommendation: { status: 'idle', candidates: [] }, hasWorkMapDraft: false, now: '2026-08-26T00:00:00.000Z' });
assert(confirmed, '유효한 업무맥락은 확정된다.');
assert.equal(confirmed.recommendation.status, 'pending', '확정은 추천 요청 대기 상태를 만든다.');
assert.equal(
    selectAuthoritativeWorkContext(confirmed.context),
    normalizeWorkContext(context.draft),
    'TST-STATE-004: 추천 request와 SOP 생성 request가 읽는 원문이 같은 selector에서 나온다.'
);
assert.equal(confirmed.contextKey, computeContextKey(context.draft));
assert.equal(computeContextKey('  같은 문장  '), computeContextKey('같은 문장'), 'contextKey는 정규화 후 결정론적이다.');

console.log('Context: 확정 후 재편집은 무엇이 사라지는지 먼저 알려준다...');
const editedAfterConfirm: MemberContextState = { ...confirmed.context, draft: `${confirmed.context.draft} 추가로 온보딩까지 담당한다.` };
assert.equal(hasUnconfirmedContextChange(editedAfterConfirm), true);
const impact = describeContextConfirmationImpact({
    context: editedAfterConfirm,
    recommendation: { status: 'ready', candidates: [{ taskId: 't1', rank: 1, reason: 'r' }], contextKey: confirmed.contextKey },
    hasWorkMapDraft: true,
});
assert.deepEqual(impact, { invalidatesRecommendation: true, invalidatesWorkMapDraft: true, requiresExplicitConfirmation: true }, '자동 삭제가 아니라 사전 경고 대상이다 (§4.2).');

const reconfirmed = confirmMemberContext({
    context: editedAfterConfirm,
    recommendation: { status: 'ready', candidates: [{ taskId: 't1', rank: 1, reason: 'r' }], contextKey: confirmed.contextKey },
    hasWorkMapDraft: true,
    now: '2026-08-26T01:00:00.000Z',
});
assert(reconfirmed);
assert.deepEqual(reconfirmed.recommendation.candidates, [], 'TST-STATE-005: 맥락 재확정은 오래된 추천 후보를 버린다.');
assert.equal(reconfirmed.discardWorkMapDraft, true, '미확정 Work Map도 무효화 대상이다.');
assert.notEqual(reconfirmed.contextKey, confirmed.contextKey);

console.log('Recommendation: stale 응답은 현재 상태를 덮지 않는다...');
const pending: TaskRecommendationState = { status: 'pending', candidates: [], contextKey: 'ctx-new' };
assert.equal(isStaleRecommendationResponse(pending, 'ctx-old'), true);
assert.equal(isStaleRecommendationResponse(pending, 'ctx-new'), false);

console.log('Migration: 두 legacy 입력이 하나의 맥락으로, 무손실로 합쳐진다...');
const bothPresent = migrateMemberIntakeState({ taskRecommendationInput: '내가 직접 쓴 업무 설명', context: '생성용으로 따로 쓴 문장' });
assert.equal(bothPresent.memberContext.draft, '내가 직접 쓴 업무 설명', '구성원이 직접 작성한 추천 입력이 우선한다.');
assert.deepEqual(bothPresent.memberContext.legacyCandidates, ['생성용으로 따로 쓴 문장'], '채택되지 않은 원문도 보존한다(무손실).');
assert.equal(bothPresent.memberContext.confirmedText, undefined, '마이그레이션은 자동 제출하지 않는다.');
assert.deepEqual(bothPresent.session, ANONYMOUS_MEMBER_SESSION, '마이그레이션 결과 세션은 언제나 anonymous다.');

const sampleOnly = migrateMemberIntakeState({ taskRecommendationInput: '', context: LEGACY_SAMPLE_CONTEXT_SENTENCE });
assert.equal(sampleOnly.memberContext.draft, '', 'fixture 안내 문장은 실제 업무맥락으로 승격하지 않는다.');
assert.equal(sampleOnly.memberContext.legacyCandidates, undefined);

const contextOnly = migrateMemberIntakeState({ context: '구성원이 생성 화면에 직접 쓴 맥락' });
assert.equal(contextOnly.memberContext.draft, '구성원이 생성 화면에 직접 쓴 맥락');

console.log('Migration: Store persisted 상태가 v6로 넘어가도 기존 데이터를 잃지 않는다...');
const legacyPersisted = {
    memberInfo: { employeeId: 'E900', name: '기존 사용자', jobRole: 'Talent Acquisition', organization: '인재확보팀' },
    context: '기존 사용자가 작성한 업무 맥락',
    taskRecommendationInput: '',
    customerReviewMode: true,
    lastSavedTimestamp: '2026-01-01T00:00:00.000Z',
};
const migrated = migrateSopPrototypePersistedState(legacyPersisted) as Record<string, unknown>;
assert.deepEqual(migrated.memberInfo, legacyPersisted.memberInfo, '기존 구성원 정보는 그대로 남는다.');
assert.equal(migrated.lastSavedTimestamp, legacyPersisted.lastSavedTimestamp);
assert.equal(migrated.customerReviewMode, true, '고객 검토 모드 같은 기존 상태를 잃지 않는다.');
assert.equal((migrated.memberSession as { status: string }).status, 'anonymous', '저장된 memberInfo가 있어도 로그인 완료로 간주하지 않는다 (SPEC §3.1).');
assert.equal((migrated.memberContext as MemberContextState).draft, '기존 사용자가 작성한 업무 맥락');
assert.equal(migrated.context, '기존 사용자가 작성한 업무 맥락', 'legacy 미러는 단일 원본과 같은 값을 가리킨다.');
assert.equal(migrated.taskRecommendationInput, '기존 사용자가 작성한 업무 맥락', '두 legacy 입력이 서로 다른 값으로 남지 않는다.');
assert.equal(migrated.workMapDraft, null);

console.log('Route guard: URL이 아니라 도메인 상태가 접근을 결정한다...');
const anonymousState = {
    session: ANONYMOUS_MEMBER_SESSION,
    memberContext: { draft: '' },
    recommendation: { status: 'idle' as const, candidates: [] },
    hasWorkMapDraft: false,
};
const anonymousContextAccess = resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.context, anonymousState);
assert.equal(anonymousContextAccess.allowed, false, 'TST-STATE-001: 비로그인 상태의 /sop/context 직접 접근은 막힌다.');
if (!anonymousContextAccess.allowed) assert.equal(anonymousContextAccess.redirectTo, SOP_INTAKE_ROUTES.login);
assert.equal(resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.login, anonymousState).allowed, true);

const authenticatedState = {
    ...anonymousState,
    session: { status: 'authenticated' as const, member: { employeeId: 'E1', name: '김구성', jobRole: 'Talent Acquisition', organization: '인재확보팀' } },
};
assert.equal(resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.context, authenticatedState).allowed, true, 'TST-STATE-002: 로그인 후 업무맥락 화면으로 진입한다.');
const noContextRecommendation = resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.recommendation, authenticatedState);
assert.equal(noContextRecommendation.allowed, false, '업무맥락 제출 전에는 추천 화면에 들어갈 수 없다.');
if (!noContextRecommendation.allowed) assert.equal(noContextRecommendation.redirectTo, SOP_INTAKE_ROUTES.context);

const submittedState = { ...authenticatedState, memberContext: { draft: '제출됨', confirmedText: '제출됨' } };
assert.equal(resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.recommendation, submittedState).allowed, true);
const noWorkMap = resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.workMapSimple, submittedState);
assert.equal(noWorkMap.allowed, false, 'Task 확정 전에는 Work Map 화면이 없다.');
if (!noWorkMap.allowed) assert.equal(noWorkMap.redirectTo, SOP_INTAKE_ROUTES.recommendation);
assert.equal(resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.workMapDetailed, { ...submittedState, hasWorkMapDraft: true }).allowed, true);

assert.equal(resolvePostLoginRoute(authenticatedState), SOP_INTAKE_ROUTES.context);
assert.equal(resolvePostLoginRoute(submittedState), SOP_INTAKE_ROUTES.recommendation);
assert.equal(resolvePostLoginRoute({ ...submittedState, hasWorkMapDraft: true }), SOP_INTAKE_ROUTES.workMapSimple);

console.log('착지 판정: 진행 상태와 보유 record 유무로 로그인 직후 착지점을 정한다 (INT-LAND-001)...');
assert.equal(
    resolveMemberLandingRoute({ ...anonymousState, hasStoredRecords: false }),
    SOP_INTAKE_ROUTES.login,
    '미인증 → 로그인 게이트.'
);
assert.equal(
    resolveMemberLandingRoute({ ...authenticatedState, hasStoredRecords: false }),
    SOP_INTAKE_ROUTES.context,
    '인증 + record 0건 + 진행 없음 → 신규 구성원은 곧장 업무맥락 작성으로 간다.'
);
assert.equal(
    resolveMemberLandingRoute({ ...authenticatedState, hasStoredRecords: true }),
    '/sop',
    '인증 + record 1건 이상 + 진행 없음 → 복귀 구성원은 기존 Home으로 간다.'
);
assert.equal(
    resolveMemberLandingRoute({ ...submittedState, hasStoredRecords: false }),
    resolvePostLoginRoute(submittedState),
    '확정 context가 있으면 record 유무와 무관하게 기존 resolvePostLoginRoute의 진행 지점으로 복귀한다.'
);
assert.equal(
    resolveMemberLandingRoute({ ...submittedState, hasWorkMapDraft: true, hasStoredRecords: true }),
    SOP_INTAKE_ROUTES.workMapSimple,
    'Work Map 초안이 있으면 record가 있어도 Work Map 지점으로 복귀한다(Home으로 되돌리지 않는다).'
);

console.log('Store: 로그인 → 업무맥락 → 추천 요청 → Task 확정 전이...');
const store = useSopPrototypeStore.getState();
store.resetStore();
assert.equal(useSopPrototypeStore.getState().memberSession.status, 'anonymous', '초기 세션은 anonymous다.');

const rejected = useSopPrototypeStore.getState().submitMemberIdentity({ name: '김구성' });
assert.equal(rejected.ok, false);
assert.equal(useSopPrototypeStore.getState().memberSession.status, 'anonymous', '검증 실패는 세션을 만들지 않는다.');

const accepted = useSopPrototypeStore.getState().submitMemberIdentity({ employeeId: 'E1001', name: '김구성', organization: '인재확보팀', jobRole: 'Talent Acquisition' });
assert.equal(accepted.ok, true);
assert.equal(useSopPrototypeStore.getState().memberSession.status, 'authenticated');
// W4-05가 브라우저 검증에서 발견한 회귀: submitMemberIdentity가 memberInfo를 병합
// (`{...old, ...new}`)하면, resetStore가 심어 둔 샘플 memberInfo(CUSTOMER_SOP_MEMBER,
// id: 'member-001')의 `id`가 로그인 폼이 채우지 않는 필드라서 새 로그인 뒤에도 남는다.
// listMySopRecords 등 record 조회는 `member.id || member.employeeId` 순으로 식별자를
// 고르므로, 남은 `id`가 실제 로그인한 구성원의 employeeId보다 우선해 계속 다른(샘플)
// 구성원의 record를 조회하게 되어 INT-LAND-001의 착지 판정이 항상 "record 0건"으로
// 나오는 방식으로 깨진다 — 완전 대체여야 한다.
assert.equal(useSopPrototypeStore.getState().memberInfo.id, undefined, 'memberInfo는 이전 샘플의 id를 물려받지 않는다(완전 대체, 병합 아님).');
assert.equal(useSopPrototypeStore.getState().memberInfo.employeeId, 'E1001', 'memberInfo.employeeId는 실제 로그인한 구성원의 값이다.');

assert.equal(useSopPrototypeStore.getState().submitMemberContext(), null, '공백 맥락은 어떤 상태도 만들지 않는다.');
assert.equal(useSopPrototypeStore.getState().taskRecommendation.status, 'idle');

useSopPrototypeStore.getState().setMemberContextDraft('채용 공고 등록부터 최종 합격 통보까지 담당하고, 면접 일정은 현업과 조율한다.');
assert.equal(useSopPrototypeStore.getState().context, useSopPrototypeStore.getState().memberContext.draft, 'legacy context 미러가 단일 원본을 따라간다.');
assert.equal(useSopPrototypeStore.getState().taskRecommendationInput, useSopPrototypeStore.getState().memberContext.draft);

const submitted = useSopPrototypeStore.getState().submitMemberContext();
assert(submitted, '유효한 맥락은 제출된다.');
assert.equal(useSopPrototypeStore.getState().taskRecommendation.status, 'pending');

assert.equal(useSopPrototypeStore.getState().beginTaskRecommendationRequest(submitted.contextKey), true, '첫 요청은 시작된다.');
assert.equal(
    useSopPrototypeStore.getState().beginTaskRecommendationRequest(submitted.contextKey),
    false,
    'TST-STATE-003: 같은 맥락에 대한 두 번째 요청 시작은 거절된다(중복 호출 방지).'
);

assert.equal(useSopPrototypeStore.getState().applyTaskRecommendations('ctx-오래된-값', [{ taskId: 'x', rank: 1, reason: 'stale' }]), false, 'stale 응답은 적용되지 않는다.');
assert.equal(useSopPrototypeStore.getState().taskRecommendation.status, 'pending');

const representativeJob = SOP_TASK_LIBRARY_FIXTURE.jobs.find((job) => job.name === 'Talent Acquisition')!;
const representativeTask = representativeJob.tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화')!;
assert.equal(useSopPrototypeStore.getState().applyTaskRecommendations(submitted.contextKey, [{ taskId: representativeTask.id, rank: 1, reason: '업무맥락과 가장 관련성이 높습니다.' }]), true);
assert.equal(useSopPrototypeStore.getState().taskRecommendation.status, 'ready');
assert.equal(useSopPrototypeStore.getState().workMapDraft, null, 'TST-REC-003: 추천 성공만으로 Task가 확정되지 않는다.');

assert.equal(useSopPrototypeStore.getState().confirmRecommendedTask('존재하지-않는-task'), false, '카탈로그에 없는 Task는 확정되지 않는다.');
assert.equal(useSopPrototypeStore.getState().confirmRecommendedTask(representativeTask.id), true);
const draft = useSopPrototypeStore.getState().workMapDraft;
assert(draft, 'TST-REC-004: 명시적 확정 후에만 Work Map 스냅샷이 생긴다.');
assert.equal(draft.sourceTaskId, representativeTask.id);
assert.equal(
    draft.contextText,
    selectAuthoritativeWorkContext(useSopPrototypeStore.getState().memberContext),
    'Work Map은 추천에 사용한 것과 같은 업무맥락을 provenance로 보존한다.'
);

console.log('Store: 실패는 입력을 지우지 않고, 다른 구성원 로그인은 진행 상태를 물려주지 않는다...');
const beforeFailure = useSopPrototypeStore.getState().memberContext.draft;
useSopPrototypeStore.getState().failTaskRecommendation(useSopPrototypeStore.getState().taskRecommendation.contextKey!, 'AI 호출 실패');
assert.equal(useSopPrototypeStore.getState().taskRecommendation.status, 'error');
assert.equal(useSopPrototypeStore.getState().memberContext.draft, beforeFailure, 'TST-REC-005: 실패 후에도 입력 원문이 보존된다.');
assert(useSopPrototypeStore.getState().workMapDraft, '추천 실패가 이미 만든 Work Map을 지우지 않는다.');

useSopPrototypeStore.getState().submitMemberIdentity({ employeeId: 'E2002', name: '다른 구성원', organization: '영업팀', jobRole: 'Application Marketing' });
assert.equal(useSopPrototypeStore.getState().memberContext.draft, '', '구성원이 바뀌면 미확정 업무맥락을 물려주지 않는다.');
assert.equal(useSopPrototypeStore.getState().workMapDraft, null);
assert.equal(useSopPrototypeStore.getState().taskRecommendation.status, 'idle');

useSopPrototypeStore.getState().signOutMember();
assert.equal(useSopPrototypeStore.getState().memberSession.status, 'anonymous');
useSopPrototypeStore.getState().resetStore();

console.log('✅ SOP member intake 도메인 테스트 통과.');
})();
