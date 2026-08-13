import assert from 'node:assert/strict';
import fixture from '../src/data/sop-task-library-sample.json';
import { CUSTOMER_SOP_DOCUMENT, CUSTOMER_WORK_LIBRARY } from '../src/lib/sop-sample-data';
import { getScopedActivities, getScopedSkills } from '../src/lib/sop-task-library';
import { buildSopGenerationRequestBody } from '../src/lib/sop-ai-request';
import { getSopPrompt } from '../src/server/sop/sop-prompt';
import { formatSopActivityCoverageErrors, validateSopActivityCoverage } from '../src/lib/sop-activity-coverage';
import { validateTaskRecommendationResponse, recommendTasksViaApi } from '../src/lib/sop-task-recommendation';
import { migrateSopPrototypePersistedState, useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { validateActivityProposalResponse, acceptActivityProposal } from '../src/lib/sop-activity-proposal';

void (async () => {

const jobs = fixture.jobs;
const tasks = jobs.flatMap((job) => job.tasks);
const activities = tasks.flatMap((task) => task.activities);
const relationships = activities.flatMap((activity) => activity.skills);

assert.equal(jobs.length, 2, 'Customer fixture must retain 2 Jobs.');
assert.equal(tasks.length, 10, 'Customer fixture must retain 10 Tasks.');
assert.equal(activities.length, 138, 'Customer fixture must retain 138 Activities.');
assert.equal(relationships.length, 690, 'Customer fixture must retain 690 Activity-Skill relations.');
assert.deepEqual(jobs.map((job) => job.sourceJobId).sort(), ['50100208', '50100245']);
assert(tasks.every((task) => task.description.trim() && task.activities.length >= 12 && task.activities.length <= 15));
assert(activities.every((activity) => activity.name.trim() && activity.description.trim() && activity.skills.length === 5));
assert(relationships.every((skill) => skill.id && skill.name.trim() && skill.description.trim()));
assert(activities.every((activity) => activity.order > 0) && tasks.every((task) => task.activities.every((activity, index) => activity.order === index + 1)), 'Activity source order must be stable and contiguous.');
assert.equal(new Set(relationships.map((skill) => skill.name)).size, 339, 'Repeated relations must not be globally flattened.');
assert.equal(new Set(relationships.map((skill) => skill.id)).size, 690, 'Every imported Activity-Skill relationship needs its own deterministic id.');

const representative = tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화');
assert(representative, 'Talent Acquisition representative Task must exist.');
assert.equal(representative.activities.length, 14);
assert(representative.activities.every((activity) => activity.skills.length === 5));
assert.equal(CUSTOMER_WORK_LIBRARY.taskId, representative.id, 'Gate sample selection and fixture representative Task must match.');
assert.equal(CUSTOMER_SOP_DOCUMENT.workLibrary.taskId, representative.id, 'Sample SOP metadata must match the Gate sample Task.');

const taskScoped = getScopedActivities(CUSTOMER_WORK_LIBRARY);
assert.equal(taskScoped.length, 14, 'Task scope sends every ordered Activity.');
const activitySelection = { ...CUSTOMER_WORK_LIBRARY, sourceType: 'activity' as const };
assert.equal(getScopedActivities(activitySelection).length, 1, 'Activity scope sends exactly one catalog-backed Activity.');
assert.equal(getScopedSkills(CUSTOMER_WORK_LIBRARY).length > 0, true);

const fullRequest = buildSopGenerationRequestBody({
    memberRole: 'Talent Acquisition',
    sourceJobId: CUSTOMER_WORK_LIBRARY.sourceJobId,
    jobName: CUSTOMER_WORK_LIBRARY.jobName,
    taskId: CUSTOMER_WORK_LIBRARY.taskId,
    taskName: CUSTOMER_WORK_LIBRARY.taskName,
    taskDefinition: representative.description,
    sourceType: 'task',
    activities: taskScoped,
    skills: getScopedSkills(CUSTOMER_WORK_LIBRARY),
    context: '채용 업무 맥락',
    detailLevel: 'standard', minSteps: 14, maxSteps: 18, maxTotalNodes: 22,
    branchPolicy: 'auto', maxBranches: 2, allowRework: true,
});
assert.equal(fullRequest.activities.length, 14);
assert(fullRequest.activities.every((activity, index) => activity.id === representative.activities[index].id && activity.order === index + 1));
const prompt = getSopPrompt(fullRequest);
assert(prompt.includes(CUSTOMER_WORK_LIBRARY.sourceJobId!) && prompt.includes(representative.description), 'Prompt must carry Job identity and Task definition.');
assert(prompt.includes(representative.activities[0].id), 'Prompt must carry Activity ids.');

const validCoverage = validateSopActivityCoverage(CUSTOMER_SOP_DOCUMENT.steps, CUSTOMER_WORK_LIBRARY);
assert(validCoverage.valid, `Customer sample document must cover all Task Activities: ${formatSopActivityCoverageErrors(validCoverage).join(' / ')}`);
const missingCoverage = validateSopActivityCoverage(CUSTOMER_SOP_DOCUMENT.steps.map((step) => ({ ...step, sourceActivityIds: [] })), CUSTOMER_WORK_LIBRARY);
assert(!missingCoverage.valid && missingCoverage.missingIds.length === 14);
const unknownCoverage = validateSopActivityCoverage([{ id: 'business-step', sourceActivityIds: ['other-task-activity'] }], CUSTOMER_WORK_LIBRARY);
assert(!unknownCoverage.valid && unknownCoverage.unknownIds.length === 1);

assert.throws(() => validateTaskRecommendationResponse({ candidates: [{ taskId: representative.id, rank: 1, reason: 'a' }, { taskId: representative.id, rank: 2, reason: 'b' }] }, [representative]));
assert.throws(() => validateTaskRecommendationResponse({ candidates: [{ taskId: 'not-in-catalog', rank: 1, reason: 'a' }] }, [representative]));

let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => { fetchCalls += 1; return new Response(JSON.stringify({ candidates: [] })); }) as typeof fetch;
await assert.rejects(() => recommendTasksViaApi({ member: CUSTOMER_SOP_DOCUMENT.member, job: { id: CUSTOMER_WORK_LIBRARY.jobId, sourceJobId: CUSTOMER_WORK_LIBRARY.sourceJobId, name: CUSTOMER_WORK_LIBRARY.jobName }, briefWorkDescription: ' ', candidates: [representative] }));
assert.equal(fetchCalls, 0, 'Empty recommendation input must make zero API calls.');
globalThis.fetch = originalFetch;

const legacy = migrateSopPrototypePersistedState({
    workLibrary: { ...CUSTOMER_WORK_LIBRARY, taskCatalog: CUSTOMER_WORK_LIBRARY.taskCatalog.map((task) => ({ ...task, activities: task.activities.map((activity) => { const legacyActivity = { ...activity }; delete legacyActivity.order; return legacyActivity; }) })) },
    setupConfig: { detailLevel: 'standard', minSteps: 6, maxSteps: 8, branchPolicy: 'auto', maxBranches: 2, allowRework: true, sourceType: 'task' },
    document: { ...CUSTOMER_SOP_DOCUMENT, setupConfig: { ...CUSTOMER_SOP_DOCUMENT.setupConfig!, sourceType: 'task' } },
});
const migrated = legacy as { workLibrary: typeof CUSTOMER_WORK_LIBRARY; setupConfig: Record<string, unknown>; document: typeof CUSTOMER_SOP_DOCUMENT };
assert(migrated.workLibrary.taskCatalog.every((task) => task.activities.every((activity, index) => activity.order === index + 1)), 'Legacy Activity order should migrate from array position.');
assert.equal(migrated.setupConfig.sourceType, undefined, 'Legacy duplicate setup scope must be removed.');

const store = useSopPrototypeStore.getState();
store.setCustomerReviewMode(false);
assert(store.setDocument(structuredClone(CUSTOMER_SOP_DOCUMENT)));
store.setStepSourceActivities(CUSTOMER_SOP_DOCUMENT.steps.find((step) => !step.terminalType)!.id, [representative.activities[0].id]);
assert.equal(useSopPrototypeStore.getState().document?.reviewStatus, 'ai-draft', 'Mapping edits must invalidate SOP review status.');
store.setCustomerReviewMode(true);
const beforeLocked = structuredClone(useSopPrototypeStore.getState().document);
store.setStepSourceActivities(CUSTOMER_SOP_DOCUMENT.steps.find((step) => !step.terminalType)!.id, [representative.activities[1].id]);
assert.deepEqual(useSopPrototypeStore.getState().document, beforeLocked, 'Customer review mode must block Activity mapping edits.');
store.setCustomerReviewMode(false);

// ---------------------------------------------------------
// AI 제안 Activity (작업 C-2): propose -> unaccepted -> member accept -> Work
// Map inclusion -> generation scope inclusion.
// ---------------------------------------------------------
console.log('AI 제안 Activity: propose -> unaccepted -> accept -> Work Map + generation scope...');

const PROPOSAL_CONTEXT = '해외 신규 응용처 대응 관련 업무를 처리합니다.';
const proposalRaw = {
    proposals: [
        // Duplicates an existing Activity name (case/whitespace-insensitive) — must be dropped.
        { name: `  ${representative.activities[0].name}  `, description: 'x', rationale: 'x', skills: [{ name: 'x' }] },
        { name: '해외 규제 대응 검토', description: '해외 진출 시 현지 규제 요건을 사전 검토합니다.', rationale: '맥락에 해외 신규 응용처 대응이 언급되었습니다.', skills: [{ name: '해외 규제 리서치', description: '국가별 규제 조사' }] },
        // Same idea as the surviving proposal above, differing only by whitespace/case — must collapse to one.
        { name: '  해외 규제 대응 검토  ', description: 'y', rationale: 'y', skills: [{ name: 'y' }] },
    ],
};
const beforeAcceptSelection = { ...CUSTOMER_WORK_LIBRARY, sourceType: 'task' as const };
const validatedProposals = validateActivityProposalResponse(proposalRaw, {
    existingActivityNames: representative.activities.map((a) => a.name),
    sourceTaskId: beforeAcceptSelection.taskId,
    contextKey: PROPOSAL_CONTEXT,
});
assert.equal(validatedProposals.proposals.length, 1, 'A proposal duplicating an existing Activity name is dropped, and a within-response duplicate (whitespace/case-insensitive) collapses to one');
assert(validatedProposals.proposals[0].id.length > 0, 'A surviving proposal is assigned a stable local id, never trusting an AI-supplied id');
assert.equal(validatedProposals.proposals[0].sourceTaskId, beforeAcceptSelection.taskId, 'A validated proposal is stamped with the Task it was generated against');
assert.equal(validatedProposals.proposals[0].contextKey, PROPOSAL_CONTEXT, 'A validated proposal is stamped with the exact context text it was generated against');
const proposal = validatedProposals.proposals[0];

const beforeAcceptActivityCount = getScopedActivities(beforeAcceptSelection).length;
const beforeAcceptRequest = buildSopGenerationRequestBody({
    memberRole: 'Talent Acquisition', sourceJobId: beforeAcceptSelection.sourceJobId, jobName: beforeAcceptSelection.jobName,
    taskId: beforeAcceptSelection.taskId, taskName: beforeAcceptSelection.taskName, taskDefinition: representative.description,
    sourceType: 'task', activities: getScopedActivities(beforeAcceptSelection), skills: getScopedSkills(beforeAcceptSelection),
    context: 'x', detailLevel: 'standard', minSteps: 14, maxSteps: 18, maxTotalNodes: 22, branchPolicy: 'auto', maxBranches: 2, allowRework: true,
});
assert(!beforeAcceptRequest.activities.some((a) => a.name === proposal.name), 'Before acceptance, an unaccepted proposal never appears in the Task-wide generation request');

// Defect repro: accepting a proposal generated against Task A while the member has since
// switched to Task B (or a differently-shaped selection with the same taskId but stale
// context) must be refused, never silently inserted into whatever Task/context is current.
const wrongTaskSelection = { ...beforeAcceptSelection, taskId: 'not-the-current-task-id' };
const staleTaskResult = acceptActivityProposal(wrongTaskSelection, proposal, PROPOSAL_CONTEXT);
assert.equal(staleTaskResult.ok, false, 'Accepting a proposal against a different Task than it was generated for is refused');
assert.equal(!staleTaskResult.ok && staleTaskResult.reason, 'stale-task');

const staleContextResult = acceptActivityProposal(beforeAcceptSelection, proposal, '완전히 다른 새 업무 맥락입니다.');
assert.equal(staleContextResult.ok, false, 'Accepting a proposal after the context text has changed since it was generated is refused');
assert.equal(!staleContextResult.ok && staleContextResult.reason, 'stale-context');

const acceptResult = acceptActivityProposal(beforeAcceptSelection, proposal, PROPOSAL_CONTEXT);
assert(acceptResult.ok, 'Accepting a fresh, matching-Task, matching-context proposal succeeds');
if (!acceptResult.ok) throw new Error('unreachable');
assert(!('confirmed' in acceptResult.patch), 'The success patch NEVER carries a confirmed key — this is what lets setWorkLibrary\'s existing "any T-A-S change clears confirmation" branch fire naturally instead of being bypassed');
const acceptedSelection: typeof beforeAcceptSelection = { ...beforeAcceptSelection, ...acceptResult.patch };
assert.equal(getScopedActivities(acceptedSelection).length, beforeAcceptActivityCount + 1, 'Accepting a proposal adds exactly one new Activity to the Task-wide scope');
const acceptedActivity = acceptedSelection.taskCatalog.find((t) => t.id === acceptedSelection.taskId)!.activities.find((a) => a.name === proposal.name);
assert(Boolean(acceptedActivity), 'The accepted Activity is present in the current Task catalog with the proposal\'s name');
assert.equal(acceptedActivity!.order, beforeAcceptActivityCount + 1, 'The accepted Activity is ordered immediately after every existing Activity (max order + 1)');
assert.equal(acceptedActivity!.skills.length, proposal.skills.length, 'The accepted Activity carries the proposal\'s proposed Skills');
assert(acceptedActivity!.skills.every((s) => s.id.startsWith(acceptedActivity!.id)), 'Each accepted Skill has a stable id derived from the new Activity id, not a random/duplicate id');

const afterAcceptRequest = buildSopGenerationRequestBody({
    memberRole: 'Talent Acquisition', sourceJobId: acceptedSelection.sourceJobId, jobName: acceptedSelection.jobName,
    taskId: acceptedSelection.taskId, taskName: acceptedSelection.taskName, taskDefinition: representative.description,
    sourceType: 'task', activities: getScopedActivities(acceptedSelection), skills: getScopedSkills(acceptedSelection),
    context: 'x', detailLevel: 'standard', minSteps: 14, maxSteps: 18, maxTotalNodes: 22, branchPolicy: 'auto', maxBranches: 2, allowRework: true,
});
assert(afterAcceptRequest.activities.some((a) => a.name === proposal.name), 'After acceptance, the new Activity IS included in the Task-wide generation request');
assert.equal(afterAcceptRequest.activities.length, beforeAcceptRequest.activities.length + 1, 'Generation-request Activity count grows by exactly one after acceptance');

// Re-accepting the exact same proposal a second time must never create a duplicate Activity.
const reAcceptResult = acceptActivityProposal(acceptedSelection, proposal, PROPOSAL_CONTEXT);
assert.equal(reAcceptResult.ok, false, 'Accepting the same proposal a second time is refused, not silently duplicated');
assert.equal(!reAcceptResult.ok && reAcceptResult.reason, 'already-accepted');
assert.equal(getScopedActivities(acceptedSelection).length, beforeAcceptActivityCount + 1, 'The Task-wide Activity count is unaffected by the rejected re-accept attempt');

// A DIFFERENT proposal whose name collides with an Activity already present (e.g. added by a
// prior accept, or manually by the member) must also be refused, not just within-response dupes.
const duplicateNameProposal = { ...proposal, id: 'a-totally-different-proposal-id' };
const duplicateNameResult = acceptActivityProposal(acceptedSelection, duplicateNameProposal, PROPOSAL_CONTEXT);
assert.equal(duplicateNameResult.ok, false, 'A differently-id\'d proposal whose name matches an Activity already in the current Task is refused');
assert.equal(!duplicateNameResult.ok && duplicateNameResult.reason, 'duplicate-name');

const taskNotFoundResult = acceptActivityProposal({ ...beforeAcceptSelection, taskId: proposal.sourceTaskId, taskCatalog: [] }, proposal, PROPOSAL_CONTEXT);
assert.equal(taskNotFoundResult.ok, false, 'Accepting against a selection whose taskId does not resolve in taskCatalog is a safe, explicit failure, never a crash or silent wrong-Task write');
assert.equal(!taskNotFoundResult.ok && taskNotFoundResult.reason, 'task-not-found');

// Store-level: acceptActivityProposal's patch, applied through the REAL setWorkLibrary action,
// must actually clear Task Library confirmation — this is the exact defect this contract fixes.
console.log('Store: accepting an AI Activity proposal through setWorkLibrary clears confirmed...');
useSopPrototypeStore.setState({ workLibrary: { ...beforeAcceptSelection, confirmed: true }, customerReviewMode: false });
assert.equal(useSopPrototypeStore.getState().workLibrary.confirmed, true, 'Fixture setup: workLibrary starts confirmed');
const storeAcceptResult = acceptActivityProposal(useSopPrototypeStore.getState().workLibrary, proposal, PROPOSAL_CONTEXT);
assert(storeAcceptResult.ok, 'Fixture setup: the acceptance itself succeeds');
if (storeAcceptResult.ok) useSopPrototypeStore.getState().setWorkLibrary(storeAcceptResult.patch);
assert.equal(useSopPrototypeStore.getState().workLibrary.confirmed, false, 'A successful AI Activity acceptance clears workLibrary.confirmed through the real Store action — the central "T-A-S change invalidates confirmation" rule, not bypassed');
assert(useSopPrototypeStore.getState().workLibrary.taskCatalog.find((t) => t.id === beforeAcceptSelection.taskId)!.activities.some((a) => a.name === proposal.name), 'The Store\'s workLibrary actually contains the newly accepted Activity');

// Customer review mode: setWorkLibrary itself has no review-mode guard (Work Map editing on
// the Gate has never been review-mode-gated at the Store level), so the panel component is
// responsible for refusing to call accept/propose at all while locked — verified at the
// component level in tests/sop-member-home.test.ts. This assertion documents that
// acceptActivityProposal is a pure function with no Store access, so it cannot itself enforce
// the guard; the guard is enforced by never invoking it under customerReviewMode.
useSopPrototypeStore.setState({ customerReviewMode: false });

console.log('✅ SOP customer Task Library fixture, generation scope, recommendation and Activity coverage tests passed.');
})();
