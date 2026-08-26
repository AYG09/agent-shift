/**
 * Wave 0 Foundation — Work Map 초안 도메인 테스트.
 *
 * 핵심 주장 두 가지를 실행으로 증명한다.
 * 1. 간소화(simple)와 상세(detailed)는 **같은 초안**의 서로 다른 투영이다. 두 화면이
 *    각자 상태를 갖지 않으므로 한쪽 편집이 다른 쪽에 즉시 보인다.
 * 2. 편집은 읽기 전용 Task Library 원본을 절대 건드리지 않는다.
 */
import assert from 'node:assert/strict';
import { SOP_TASK_LIBRARY_FIXTURE, getScopedActivities, getScopedSkills } from '../src/lib/sop-task-library';
import {
    addWorkMapActivity,
    addWorkMapSkill,
    confirmWorkMapDraft,
    createWorkMapDraftFromCatalog,
    createWorkMapDraftFromDocument,
    deleteWorkMapActivity,
    deleteWorkMapSkill,
    moveWorkMapActivity,
    selectDetailedWorkMapActivity,
    selectSimpleWorkMapRows,
    selectWorkMapActivities,
    selectWorkMapDraftOrigin,
    selectWorkMapRelationCount,
    toWorkLibrarySelection,
    updateWorkMapActivity,
    updateWorkMapSkill,
    updateWorkMapTask,
    validateWorkMapDraft,
} from '../src/lib/sop-work-map-draft';
import { normalizeWorkContext, resolveIntakeRouteAccess, SOP_INTAKE_ROUTES } from '../src/lib/sop-member-intake';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import type { SopDocument } from '../src/lib/sop-types';

void (async () => {

const job = SOP_TASK_LIBRARY_FIXTURE.jobs.find((candidate) => candidate.name === 'Talent Acquisition')!;
const representativeTask = job.tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화')!;
const originalSnapshot = JSON.stringify(representativeTask);

console.log('Clone: 대표 Task의 Activity 14개와 Skill 관계 70개를 손실 없이 복제한다...');
let draft = createWorkMapDraftFromCatalog({ job, task: representativeTask, contextText: '채용 업무 맥락', now: '2026-08-26T00:00:00.000Z' });
assert.equal(selectWorkMapActivities(draft).length, 14, 'TST-WM-001: Activity 14개.');
assert.equal(selectWorkMapRelationCount(draft), 70, 'TST-WM-001: Activity-Skill 관계 70개.');
assert.deepEqual(
    selectWorkMapActivities(draft).map((activity) => activity.order),
    Array.from({ length: 14 }, (_, index) => index + 1),
    'Activity order는 1..n으로 정규화된다.'
);
assert.equal(draft.confirmed, false, '복제 직후는 미확정 상태다.');
assert.notEqual(draft.task, representativeTask, '초안은 카탈로그 객체와 다른 인스턴스다.');
assert.notEqual(draft.task.activities[0].skills, representativeTask.activities[0].skills, 'Skill 배열도 값 복제되어야 한다.');

console.log('Projection: simple과 detailed가 같은 ID 집합을 본다...');
const simpleRows = selectSimpleWorkMapRows(draft);
assert.equal(simpleRows.length, 14);
assert.deepEqual(
    simpleRows.map((row) => row.activityId),
    selectWorkMapActivities(draft).map((activity) => activity.id),
    'TST-WM-002: simple projection은 원본 순서와 ID를 그대로 유지한다.'
);
const firstActivityId = simpleRows[0].activityId;
const detailedView = selectDetailedWorkMapActivity(draft, firstActivityId)!;
assert.equal(detailedView.activity.id, firstActivityId);
assert.equal(detailedView.skills.length, 5, '대표 fixture는 Activity당 Skill 5개다.');
assert.equal(simpleRows[0].skillNames.length, detailedView.skills.length, '두 투영의 Skill 관계 수가 같다.');
assert(!simpleRows[0].oneLineDescription.includes('\n'), 'simple 한 줄 요약에는 줄바꿈이 없다.');
assert.equal(simpleRows[0].description, detailedView.activity.description, '원문 자체는 두 투영에서 동일하다 — 요약은 표시 규칙일 뿐이다.');

console.log('Mutation: 어느 화면에서 고쳐도 같은 초안이 바뀐다...');
draft = confirmWorkMapDraft(draft).ok ? (confirmWorkMapDraft(draft) as { ok: true; draft: typeof draft }).draft : draft;
assert.equal(draft.confirmed, true, '검증을 통과한 초안은 확정된다.');

draft = updateWorkMapActivity(draft, firstActivityId, { name: '채용 요청 접수 및 요건 확정' });
assert.equal(draft.confirmed, false, 'TST-WM-005: 편집은 Work Map 확정을 해제한다 (INT-WM-003).');
assert.equal(
    selectSimpleWorkMapRows(draft)[0].name,
    selectDetailedWorkMapActivity(draft, firstActivityId)!.activity.name,
    'TST-WM-003: simple에서 바꾼 Activity명이 detailed에 즉시 같은 값으로 보인다.'
);

const targetSkillId = detailedView.skills[0].id;
draft = updateWorkMapSkill(draft, firstActivityId, targetSkillId, { description: '상세 화면에서 수정한 Skill 설명' });
const simpleAfterSkillEdit = selectSimpleWorkMapRows(draft)[0];
const detailedAfterSkillEdit = selectDetailedWorkMapActivity(draft, firstActivityId)!;
assert.equal(detailedAfterSkillEdit.skills[0].description, '상세 화면에서 수정한 Skill 설명');
assert.equal(simpleAfterSkillEdit.skillNames[0], detailedAfterSkillEdit.skills[0].name, 'TST-WM-004: 상세에서 고친 Skill이 간소화 투영에도 같은 관계로 남는다.');

draft = updateWorkMapTask(draft, { name: '채용 프로세스 운영' });
assert.equal(draft.task.name, '채용 프로세스 운영');
assert.equal(draft.sourceTaskId, representativeTask.id, 'Task명을 바꿔도 복제 출처 provenance는 유지된다.');

console.log('Mutation: add / delete / reorder와 Skill 개수 제약 없음...');
const added = addWorkMapActivity(draft, { name: '온보딩 인수인계', description: '입사 확정자 정보를 현업에 인계한다.' });
draft = added.draft;
assert.equal(selectWorkMapActivities(draft).length, 15);
assert.equal(selectWorkMapActivities(draft).at(-1)!.id, added.activityId, '새 Activity는 마지막 순서로 들어간다.');
assert(!representativeTask.activities.some((activity) => activity.id === added.activityId), '새 항목 ID가 원본과 충돌하지 않는다.');

const addedSkill = addWorkMapSkill(draft, added.activityId, { name: '인수인계 커뮤니케이션' });
draft = addedSkill.draft;
assert.equal(selectDetailedWorkMapActivity(draft, added.activityId)!.skills.length, 1, 'TST-WM-006: Skill 수를 5개로 강제하지 않는다.');
assert.equal(validateWorkMapDraft(draft).ok, true, 'Skill이 5개가 아니어도 이름이 유효하면 통과한다.');

draft = moveWorkMapActivity(draft, added.activityId, 'up');
assert.equal(selectWorkMapActivities(draft).at(-2)!.id, added.activityId, '순서 이동이 반영된다.');
assert.deepEqual(
    selectWorkMapActivities(draft).map((activity) => activity.order),
    Array.from({ length: 15 }, (_, index) => index + 1),
    '이동 후에도 order는 1..n으로 재정규화된다.'
);

draft = deleteWorkMapSkill(draft, added.activityId, addedSkill.skillId);
assert.equal(selectDetailedWorkMapActivity(draft, added.activityId)!.skills.length, 0);
draft = deleteWorkMapActivity(draft, added.activityId);
assert.equal(selectWorkMapActivities(draft).length, 14, '삭제 후 원래 Activity 수로 돌아온다.');

console.log('Validation: 빈 이름은 완료를 막고 첫 오류 대상을 알려준다...');
const invalid = updateWorkMapActivity(draft, firstActivityId, { name: '   ' });
const validation = validateWorkMapDraft(invalid);
assert.equal(validation.ok, false);
assert.equal(validation.errors[0].field, 'activityName');
assert.equal(validation.errors[0].activityId, firstActivityId, '화면이 focus를 옮길 대상을 도메인이 알려준다.');
const rejected = confirmWorkMapDraft(invalid);
assert.equal(rejected.ok, false, '검증에 실패하면 확정되지 않는다.');

console.log('Immutability: 편집이 Task Library 원본을 바꾸지 않는다...');
assert.equal(JSON.stringify(representativeTask), originalSnapshot, 'TST-WM-007: 원본 fixture는 어떤 편집에도 변하지 않는다 (INT-WM-002).');

console.log('Generation bridge: 확정 Work Map이 모든 Activity를 순서대로 넘긴다...');
const confirmedResult = confirmWorkMapDraft(draft);
assert.equal(confirmedResult.ok, true);
const confirmedDraft = (confirmedResult as { ok: true; draft: typeof draft }).draft;
const selection = toWorkLibrarySelection(confirmedDraft);
assert.equal(selection.sourceType, 'task', '재설계 흐름은 언제나 Task-wide 생성이다.');
assert.equal(selection.confirmed, true);
const scoped = getScopedActivities(selection);
assert.equal(scoped.length, 14, 'TST-WM-008: 생성 request가 모든 Activity를 포함한다.');
assert.deepEqual(
    scoped.map((activity) => activity.id),
    selectWorkMapActivities(confirmedDraft).map((activity) => activity.id),
    '생성 request의 Activity 순서가 편집 순서와 같다.'
);
assert.equal(scoped[0].name, '채용 요청 접수 및 요건 확정', '구성원이 고친 값이 생성 입력에 반영된다.');
assert(getScopedSkills(selection).length > 0, '파생 Skill 목록은 Activity 관계에서 계산된다.');
assert.equal(selection.jobId, job.id, 'Job scope 식별자가 보존된다.');

console.log('Clone draft: 복제 문서에서 만든 초안이 원본 workLibrary를 변형하지 않고 origin을 보존한다 (INT-CLONE-001)...');
const cloneSourceDraft = createWorkMapDraftFromCatalog({ job, task: representativeTask, contextText: '동료가 실제로 작성한 업무 맥락', now: '2026-08-26T00:00:00.000Z' });
const cloneSourceSelection = toWorkLibrarySelection(cloneSourceDraft);
const cloneSourceCatalogSnapshot = JSON.stringify(cloneSourceSelection.taskCatalog);
const colleagueDocument: SopDocument = {
    id: 'colleague-doc-1',
    title: '동료 SOP',
    member: { name: '동료', jobRole: 'Talent Acquisition' },
    workLibrary: cloneSourceSelection,
    context: '동료가 실제로 작성한 업무 맥락',
    steps: [],
    edges: [],
    reviewStatus: 'confirmed',
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    sourceTemplateId: 'colleague-doc-origin',
    creationSource: 'colleague-template',
};
const clonedDraft = createWorkMapDraftFromDocument({ document: colleagueDocument, origin: 'colleague-template', now: '2026-08-26T01:00:00.000Z' });
assert(clonedDraft, '문서 스냅샷에 선택 Task가 있으면 초안이 만들어진다.');
assert.equal(clonedDraft.origin, 'colleague-template', '초안의 origin이 요청한 값으로 보존된다.');
assert.equal(selectWorkMapDraftOrigin(clonedDraft), 'colleague-template');
assert.equal(clonedDraft.sourceTaskId, representativeTask.id);
assert.equal(clonedDraft.contextText, colleagueDocument.context, 'contextText는 문서의 context 원문을 그대로 쓴다.');
assert.equal(selectWorkMapActivities(clonedDraft).length, 14, '복제 초안도 원본과 같은 Activity 14개를 갖는다.');
assert.notEqual(clonedDraft.task, colleagueDocument.workLibrary.taskCatalog[0], '초안의 task는 문서 스냅샷과 다른 인스턴스다(deep clone).');
assert.equal(JSON.stringify(colleagueDocument.workLibrary.taskCatalog), cloneSourceCatalogSnapshot, '복제는 원본 문서의 workLibrary.taskCatalog를 변형하지 않는다.');

console.log('Clone draft: origin 없는 legacy 초안은 task-recommendation으로 간주된다...');
const { origin: _omittedOrigin, ...legacyDraft } = clonedDraft;
void _omittedOrigin;
assert.equal(
    selectWorkMapDraftOrigin(legacyDraft),
    'task-recommendation',
    'origin 필드 자체가 없는 legacy 초안은 task-recommendation으로 읽는다 — structureVersion과 같은 마이그레이션 규칙.'
);

console.log('Clone draft: 선택 Task를 찾을 수 없는 문서는 추측하지 않고 null을 돌려준다...');
const documentWithMissingTask: SopDocument = {
    ...colleagueDocument,
    workLibrary: { ...cloneSourceSelection, taskId: '존재하지-않는-task', taskCatalog: [] },
};
assert.equal(
    createWorkMapDraftFromDocument({ document: documentWithMissingTask, origin: 'own-prior', now: '2026-08-26T02:00:00.000Z' }),
    null,
    'Task를 찾을 수 없는 문서 스냅샷에서는 null을 돌려준다.'
);

console.log('Store: 뷰 전환은 데이터도 확정 상태도 바꾸지 않는다...');
const store = useSopPrototypeStore.getState();
store.resetStore();
useSopPrototypeStore.getState().submitMemberIdentity({ employeeId: 'E1001', name: '김구성', organization: '인재확보팀', jobRole: 'Talent Acquisition' });
useSopPrototypeStore.getState().setMemberContextDraft('채용 전 과정을 담당한다.');
const submitted = useSopPrototypeStore.getState().submitMemberContext()!;
useSopPrototypeStore.getState().applyTaskRecommendations(submitted.contextKey, [{ taskId: representativeTask.id, rank: 1, reason: '관련성 높음' }]);
useSopPrototypeStore.getState().confirmRecommendedTask(representativeTask.id);
const confirmResult = useSopPrototypeStore.getState().confirmWorkMap();
assert(confirmResult?.ok, 'Store 초안도 같은 검증을 통과한다.');

const before = useSopPrototypeStore.getState().workMapDraft!;
const simpleIds = selectSimpleWorkMapRows(before).map((row) => row.activityId);
const detailedIds = selectWorkMapActivities(before).map((activity) => activity.id);
assert.deepEqual(simpleIds, detailedIds, 'TST-STATE-006: 밀도 전환은 투영일 뿐 데이터를 바꾸지 않는다.');
assert.equal(useSopPrototypeStore.getState().workMapDraft!.confirmed, true, '뷰 전환만으로 확정이 풀리지 않는다.');

useSopPrototypeStore.getState().updateWorkMapActivity(detailedIds[1], { description: 'Store 경로로 수정' });
assert.equal(useSopPrototypeStore.getState().workMapDraft!.confirmed, false, 'Store mutation도 같은 무효화 규칙을 쓴다.');
assert.equal(selectDetailedWorkMapActivity(useSopPrototypeStore.getState().workMapDraft!, detailedIds[1])!.activity.description, 'Store 경로로 수정');
assert.equal(JSON.stringify(representativeTask), originalSnapshot, 'Store를 통한 편집도 원본 fixture를 바꾸지 않는다.');
useSopPrototypeStore.getState().resetStore();

console.log('Store: adoptClonedWorkMap이 route 가드를 정당하게 충족시키고 복제 원본을 변형하지 않는다 (INT-CLONE-001)...');
useSopPrototypeStore.getState().submitMemberIdentity({ employeeId: 'E3003', name: '복제 사용자', organization: '인재확보팀', jobRole: 'Talent Acquisition' });
const beforeAdoptSnapshot = JSON.stringify(colleagueDocument);
assert.equal(useSopPrototypeStore.getState().adoptClonedWorkMap(colleagueDocument), true, '유효한 동료 복제 문서는 채택된다.');
assert.equal(JSON.stringify(colleagueDocument), beforeAdoptSnapshot, 'adoptClonedWorkMap은 넘겨받은 복제 원본 문서 객체를 변형하지 않는다.');

const adoptedState = useSopPrototypeStore.getState();
assert.equal(adoptedState.workMapDraft?.origin, 'colleague-template');
assert.equal(
    adoptedState.memberContext.confirmedText,
    normalizeWorkContext(colleagueDocument.context),
    '복제 문서가 실제로 생성될 때 쓰인 업무맥락이 confirmed 원문으로 채택된다.'
);
const guardStateAfterAdopt = {
    session: adoptedState.memberSession,
    memberContext: adoptedState.memberContext,
    recommendation: adoptedState.taskRecommendation,
    hasWorkMapDraft: !!adoptedState.workMapDraft,
};
assert.equal(
    resolveIntakeRouteAccess(SOP_INTAKE_ROUTES.workMapSimple, guardStateAfterAdopt).allowed,
    true,
    'adoptClonedWorkMap 이후 Work Map route 가드가 통과한다(확정 context가 채워졌기 때문) — 가드 조건식 자체는 바뀌지 않는다.'
);

useSopPrototypeStore.getState().resetStore();
useSopPrototypeStore.getState().submitMemberIdentity({ employeeId: 'E3003', name: '복제 사용자', organization: '인재확보팀', jobRole: 'Talent Acquisition' });
const taskOriginDocument: SopDocument = { ...colleagueDocument, id: 'task-doc-1', sourceTemplateId: undefined, creationSource: 'task' };
assert.equal(useSopPrototypeStore.getState().adoptClonedWorkMap(taskOriginDocument), false, 'Task 출처 문서는 복제 채택 대상이 아니다.');
assert.equal(useSopPrototypeStore.getState().workMapDraft, null);

useSopPrototypeStore.getState().setCustomerReviewMode(true);
assert.equal(useSopPrototypeStore.getState().adoptClonedWorkMap(colleagueDocument), false, '고객 검토 모드에서는 새 Work Map 초안을 채택하지 않는다(기존 read-only 가드 준수).');
assert.equal(useSopPrototypeStore.getState().workMapDraft, null);
useSopPrototypeStore.getState().setCustomerReviewMode(false);
useSopPrototypeStore.getState().resetStore();

console.log('✅ SOP Work Map 초안 도메인 테스트 통과.');
})();
