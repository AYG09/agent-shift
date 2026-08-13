import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
    computeSopLifecycleTransition,
    normalizeLifecycleStatus,
    SopRecordLifecycleStatusSchema,
    isMemberEditableLifecycleStatus,
    toMemberSummaryBucket,
} from '../src/lib/sop-lifecycle';
import { canActorActOnStage, scopeRecordsForReviewStage, filterApprovalQueue } from '../src/lib/sop-review-assignment';
import { cloneSopDocumentFromPriorRecord } from '../src/lib/sop-prior-clone';
import { InMemorySopRepository, sopRepository, createScenarioSeededRepository } from '../src/server/sop/sop-repository-memory';
import { seedScenarioRecords } from '../src/lib/sop-scenario-seed';
import { POST as sopApiCreate } from '../src/app/api/sop/route';
import { POST as sopApiLifecycle } from '../src/app/api/sop/[id]/lifecycle/route';
import { POST as sopApiPriorClone } from '../src/app/api/sop/[id]/prior-clone/route';
import { GET as sopApiApprovals } from '../src/app/api/sop/approvals/route';
import { useSopPrototypeStore } from '../src/lib/sop-prototype-store';
import { SAMPLE_SOP_DOCUMENT } from '../src/lib/sop-sample-data';
import { SopApprovalReadOnlyPanel } from '../src/components/sop/SopApprovalReadOnlyPanel';
import type { SopDocument, SopMember } from '../src/lib/sop-types';
import type { SopRecord } from '../src/lib/sop-record-schema';
import type { SopRepository } from '../src/lib/sop-repository';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== SOP approval-lifecycle domain/API regression tests ===');
let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAILED: ${message}`);
    passed++;
    console.log(`✓ ${message}`);
}

function memberHeaders(actorId: string, organizationId = 'org-approval-test') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': 'member', 'x-sop-actor-organization-id': organizationId };
}
function reviewerHeaders(role: 'leader' | 'sme', actorId: string, organizationId = 'org-approval-test') {
    return { 'x-sop-actor-id': actorId, 'x-sop-actor-role': role, 'x-sop-actor-organization-id': organizationId };
}
function apiRequest(headers: Record<string, string>, body?: unknown) {
    return { headers: new Headers(headers), json: async () => body } as unknown as Parameters<typeof sopApiCreate>[0];
}

function apiGetRequest(headers: Record<string, string>, url: string) {
    return { headers: new Headers(headers), url } as unknown as Parameters<typeof sopApiApprovals>[0];
}

function baseRecord(overrides: Partial<SopRecord>): SopRecord {
    const now = new Date().toISOString();
    return {
        id: 'r', memberId: 'm', organizationId: 'o', taskId: 't', taskName: 'T', sourceType: 'task',
        document: SAMPLE_SOP_DOCUMENT, version: 1, lifecycleStatus: 'draft', templateEligible: false, creationSource: 'task',
        createdAt: now, updatedAt: now,
        ...overrides,
    };
}

async function buildConfirmedDocument(id: string, memberId: string): Promise<SopDocument> {
    useSopPrototypeStore.getState().resetStore();
    useSopPrototypeStore.getState().generateFromSample();
    useSopPrototypeStore.getState().document!.steps.forEach((step) => {
        step.requiredSkills.forEach((sk) => {
            if (sk.source === 'ai-suggested' && !sk.accepted) useSopPrototypeStore.getState().acceptAiSkill(step.id, sk.name);
        });
    });
    useSopPrototypeStore.getState().document!.steps.forEach((step) => {
        if (step.reviewStatus !== 'confirmed') useSopPrototypeStore.getState().updateStepReviewStatus(step.id, 'reviewed');
    });
    const outcome = useSopPrototypeStore.getState().confirmFullSop();
    check(outcome.success, `Fixture setup: confirmation must succeed, errors: ${outcome.errors.join(' / ')}`);
    const confirmed = useSopPrototypeStore.getState().document!;
    return { ...confirmed, id, member: { ...confirmed.member, id: memberId } };
}

async function run() {
    // ---------------------------------------------------------
    // Pure domain: computeSopLifecycleTransition
    // ---------------------------------------------------------
    console.log('Domain: computeSopLifecycleTransition...');

    const draftRecord = { memberId: 'owner-1', lifecycleStatus: 'draft' as const };
    const submitOk = computeSopLifecycleTransition(draftRecord, { kind: 'member-submit', actorId: 'owner-1' });
    check(submitOk.ok && submitOk.patch.lifecycleStatus === 'leader-review' && submitOk.patch.rejection === null, 'member-submit from draft by the owner succeeds, moving to leader-review with no rejection metadata');

    const submitByStranger = computeSopLifecycleTransition(draftRecord, { kind: 'member-submit', actorId: 'someone-else' });
    check(!submitByStranger.ok && submitByStranger.reason === 'forbidden', 'member-submit by a non-owning actor is forbidden');

    const submitFromLeaderReview = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'leader-review' }, { kind: 'member-submit', actorId: 'owner-1' });
    check(!submitFromLeaderReview.ok && submitFromLeaderReview.reason === 'invalid-transition', 'member-submit from leader-review (already submitted) is an invalid-transition, not silently accepted');

    const submitFromRejected = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'rejected' }, { kind: 'member-submit', actorId: 'owner-1' });
    check(submitFromRejected.ok && submitFromRejected.patch.lifecycleStatus === 'leader-review', 'member-submit from rejected (resubmission) succeeds, restarting at leader-review — never a shortcut to sme-review');

    const leaderApproveOk = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'leader-review' }, { kind: 'leader-approve', actorId: 'leader-1' });
    check(leaderApproveOk.ok && leaderApproveOk.patch.lifecycleStatus === 'sme-review', 'leader-approve moves leader-review -> sme-review, never straight to approved');

    const leaderApproveWrongStage = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'sme-review' }, { kind: 'leader-approve', actorId: 'leader-1' });
    check(!leaderApproveWrongStage.ok && leaderApproveWrongStage.reason === 'invalid-transition', 'leader-approve on a record already at sme-review is rejected');

    const leaderRejectEmptyFeedback = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'leader-review' }, { kind: 'leader-reject', actorId: 'leader-1', reasonCode: 'x', feedback: '   ' });
    check(!leaderRejectEmptyFeedback.ok && leaderRejectEmptyFeedback.reason === 'invalid-request', 'leader-reject with whitespace-only feedback is rejected as invalid-request, not accepted as a silent empty reason');

    const leaderRejectEmptyReason = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'leader-review' }, { kind: 'leader-reject', actorId: 'leader-1', reasonCode: '', feedback: 'has content' });
    check(!leaderRejectEmptyReason.ok && leaderRejectEmptyReason.reason === 'invalid-request', 'leader-reject with an empty reasonCode is rejected as invalid-request');

    const leaderRejectOk = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'leader-review' }, { kind: 'leader-reject', actorId: 'leader-1', reasonCode: 'insufficient-detail', feedback: '3단계 기준을 구체화해주세요.' });
    check(
        leaderRejectOk.ok && leaderRejectOk.patch.lifecycleStatus === 'rejected' &&
        leaderRejectOk.patch.rejection?.rejectedAtStage === 'leader-review' && leaderRejectOk.patch.rejection.reviewedByRole === 'leader',
        'leader-reject moves the record to rejected and stamps rejection metadata (stage=leader-review, role=leader)'
    );

    const smeApproveWrongStage = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'leader-review' }, { kind: 'sme-approve', actorId: 'sme-1' });
    check(!smeApproveWrongStage.ok && smeApproveWrongStage.reason === 'invalid-transition', 'sme-approve on a record still at leader-review is rejected — SME cannot skip the leader stage');

    const smeApproveOk = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'sme-review' }, { kind: 'sme-approve', actorId: 'sme-1' });
    check(smeApproveOk.ok && smeApproveOk.patch.lifecycleStatus === 'approved', 'sme-approve moves sme-review -> approved (the only path to approved)');

    const smeRejectOk = computeSopLifecycleTransition({ memberId: 'owner-1', lifecycleStatus: 'sme-review' }, { kind: 'sme-reject', actorId: 'sme-1', reasonCode: 'policy-mismatch', feedback: '정책과 불일치합니다.' });
    check(
        smeRejectOk.ok && smeRejectOk.patch.lifecycleStatus === 'rejected' && smeRejectOk.patch.rejection?.rejectedAtStage === 'sme-review' && smeRejectOk.patch.rejection.reviewedByRole === 'sme',
        'sme-reject moves the record to rejected and stamps rejection metadata (stage=sme-review, role=sme)'
    );

    check(isMemberEditableLifecycleStatus('draft') && isMemberEditableLifecycleStatus('rejected'), 'draft and rejected are the only member-editable lifecycle statuses');
    check(!isMemberEditableLifecycleStatus('leader-review') && !isMemberEditableLifecycleStatus('sme-review') && !isMemberEditableLifecycleStatus('approved'), 'leader-review/sme-review/approved are never member-editable');

    check(toMemberSummaryBucket('leader-review') === 'approval-requested' && toMemberSummaryBucket('sme-review') === 'approval-requested', 'leader-review and sme-review both fold into the approval-requested summary bucket');
    check(toMemberSummaryBucket('draft') === 'draft' && toMemberSummaryBucket('approved') === 'approved' && toMemberSummaryBucket('rejected') === 'rejected', 'draft/approved/rejected pass through the summary bucket unchanged');

    // ---------------------------------------------------------
    // Migration: the legacy single-stage 'approval-requested' status
    // ---------------------------------------------------------
    console.log('Migration: legacy approval-requested -> leader-review...');
    check(normalizeLifecycleStatus('approval-requested') === 'leader-review', "normalizeLifecycleStatus maps the legacy literal 'approval-requested' to 'leader-review'");
    check(normalizeLifecycleStatus('approved') === 'approved', 'normalizeLifecycleStatus passes through an already-current value unchanged');
    const parsedLegacy = SopRecordLifecycleStatusSchema.safeParse('approval-requested');
    check(parsedLegacy.success && parsedLegacy.data === 'leader-review', 'Parsing a raw legacy record through SopRecordLifecycleStatusSchema transparently upgrades it to leader-review');
    const parsedUnknown = SopRecordLifecycleStatusSchema.safeParse('totally-unknown-status');
    check(!parsedUnknown.success, 'An unrecognized status string still fails schema validation (normalizeLifecycleStatus does not silently swallow real corruption)');

    // ---------------------------------------------------------
    // Domain: sop-review-assignment.ts scoping/filtering
    // ---------------------------------------------------------
    console.log('Domain: sop-review-assignment.ts...');
    check(canActorActOnStage('leader', 'leader-review') && !canActorActOnStage('leader', 'sme-review'), 'A leader may only act on leader-review, never sme-review');
    check(canActorActOnStage('sme', 'sme-review') && !canActorActOnStage('sme', 'leader-review'), 'An SME may only act on sme-review, never leader-review');

    const scopingPool: SopRecord[] = [
        baseRecord({ id: 'sc-1', lifecycleStatus: 'leader-review', organizationId: 'org-a' }),
        baseRecord({ id: 'sc-2', lifecycleStatus: 'sme-review', organizationId: 'org-a' }),
        baseRecord({ id: 'sc-3', lifecycleStatus: 'draft', organizationId: 'org-a' }),
        baseRecord({ id: 'sc-4', lifecycleStatus: 'leader-review', organizationId: 'org-b' }),
    ];
    const leaderQueue = scopeRecordsForReviewStage(scopingPool, 'leader');
    check(leaderQueue.length === 2 && leaderQueue.every((r) => r.lifecycleStatus === 'leader-review'), 'scopeRecordsForReviewStage("leader") returns every leader-review record across every organization (no assignment policy in this prototype)');
    const smeQueue = scopeRecordsForReviewStage(scopingPool, 'sme');
    check(smeQueue.length === 1 && smeQueue[0].id === 'sc-2', 'scopeRecordsForReviewStage("sme") returns only sme-review records');

    const orgFiltered = filterApprovalQueue(leaderQueue, { organizationId: 'org-a' });
    check(orgFiltered.length === 1 && orgFiltered[0].id === 'sc-1', 'filterApprovalQueue narrows by organizationId as a display filter, not a second access boundary');
    const statusFiltered = filterApprovalQueue(scopingPool, { status: 'draft' });
    check(statusFiltered.length === 1 && statusFiltered[0].id === 'sc-3', 'filterApprovalQueue narrows by the exact current lifecycleStatus');

    // ---------------------------------------------------------
    // Domain: own-prior clone invariants
    // ---------------------------------------------------------
    console.log('Domain: cloneSopDocumentFromPriorRecord...');
    const priorMember: SopMember = { id: 'prior-owner', name: '기존 작성 구성원', jobRole: 'Talent Acquisition', organization: 'People & Culture팀' };
    const priorSource: SopDocument = {
        ...SAMPLE_SOP_DOCUMENT,
        id: 'prior-source-doc',
        member: priorMember,
        reviewStatus: 'confirmed',
        steps: SAMPLE_SOP_DOCUMENT.steps.map((s) => ({ ...s, reviewStatus: 'confirmed' as const })),
        agentizationReview: { scope: 'workflow', stepIds: ['step-2'], stepModes: { 'step-2': 'automation' }, confirmedAt: new Date().toISOString() },
    };
    const priorClone = cloneSopDocumentFromPriorRecord(priorSource, 'prior-clone-doc-1');
    check(priorClone.id === 'prior-clone-doc-1' && priorClone.id !== priorSource.id, 'The clone receives a brand-new document id');
    check(priorClone.member.id === priorMember.id && priorClone.member.name === priorMember.name, 'Unlike a colleague-template clone, an own-prior clone KEEPS the same member identity (no PII to sanitize)');
    check(priorClone.reviewStatus === 'ai-draft' && priorClone.steps.every((s) => s.reviewStatus === 'ai-draft'), 'The clone resets document AND every step reviewStatus to ai-draft');
    check(priorClone.agentizationReview === undefined, "The clone drops the source member's own prior Agentization judgement entirely");
    check(priorClone.sourceRecordId === priorSource.id && priorClone.sourceTemplateId === undefined, 'The clone records sourceRecordId provenance and never sets sourceTemplateId alongside it');
    check(priorClone.creationSource === 'own-prior', "The clone is stamped creationSource: 'own-prior'");
    check(priorSource.reviewStatus === 'confirmed' && priorSource.agentizationReview !== undefined, 'The source document itself is never mutated by cloning it');

    // ---------------------------------------------------------
    // API: full member -> leader -> SME orchestration, cross-role rejection, own-prior clone route
    // ---------------------------------------------------------
    console.log('API: member -> leader -> SME orchestration...');
    const ownerHeaders = memberHeaders('flow-owner');
    const flowDoc = await buildConfirmedDocument('flow-doc-1', 'flow-owner');
    const createRes = await sopApiCreate(apiRequest(ownerHeaders, { memberId: 'flow-owner', organizationId: 'org-approval-test', document: flowDoc }));
    check(createRes.status === 201, `Fixture setup: create must succeed, got ${createRes.status}`);
    const created = (await createRes.json()).record as SopRecord;

    const memberSubmit = await sopApiLifecycle(apiRequest(ownerHeaders, { transition: 'leader-review' }), { params: Promise.resolve({ id: created.id }) });
    check(memberSubmit.status === 200, `member-submit via API must succeed, got ${memberSubmit.status}`);

    const smeApproveTooEarly = await sopApiLifecycle(apiRequest(reviewerHeaders('sme', 'sme-flow-1'), { decision: 'approve' }), { params: Promise.resolve({ id: created.id }) });
    check(smeApproveTooEarly.status === 409, `An SME approving a record still at leader-review must be rejected (409), got ${smeApproveTooEarly.status}`);

    const leaderApproveViaApi = await sopApiLifecycle(apiRequest(reviewerHeaders('leader', 'leader-flow-1'), { decision: 'approve' }), { params: Promise.resolve({ id: created.id }) });
    check(leaderApproveViaApi.status === 200, `leader-approve via API must succeed, got ${leaderApproveViaApi.status}`);
    const afterLeaderApprove = (await leaderApproveViaApi.json()).record as SopRecord;
    check(afterLeaderApprove.lifecycleStatus === 'sme-review', 'After leader approval the record sits at sme-review, not approved');

    const leaderApproveAgain = await sopApiLifecycle(apiRequest(reviewerHeaders('leader', 'leader-flow-1'), { decision: 'approve' }), { params: Promise.resolve({ id: created.id }) });
    check(leaderApproveAgain.status === 409, `A leader approving a record already past leader-review must be rejected (409), got ${leaderApproveAgain.status}`);

    const rejectMissingFeedback = await sopApiLifecycle(apiRequest(reviewerHeaders('sme', 'sme-flow-1'), { decision: 'reject', reasonCode: 'x', feedback: '' }), { params: Promise.resolve({ id: created.id }) });
    check(rejectMissingFeedback.status === 400, `An SME reject request with empty feedback must be rejected at the schema layer (400), got ${rejectMissingFeedback.status}`);

    const smeApproveViaApi = await sopApiLifecycle(apiRequest(reviewerHeaders('sme', 'sme-flow-1'), { decision: 'approve' }), { params: Promise.resolve({ id: created.id }) });
    check(smeApproveViaApi.status === 200, `sme-approve via API must succeed, got ${smeApproveViaApi.status}`);
    const afterSmeApprove = (await smeApproveViaApi.json()).record as SopRecord;
    check(afterSmeApprove.lifecycleStatus === 'approved', 'After SME approval the record is officially approved');

    const hrLifecycleAttempt = await sopApiLifecycle(
        { headers: new Headers({ 'x-sop-actor-id': 'hr-1', 'x-sop-actor-role': 'hr', 'x-sop-actor-organization-id': 'org-approval-test' }), json: async () => ({ decision: 'approve' }) } as unknown as Parameters<typeof sopApiLifecycle>[0],
        { params: Promise.resolve({ id: created.id }) }
    );
    check(hrLifecycleAttempt.status === 403, `HR has no lifecycle-transition authority at all, got ${hrLifecycleAttempt.status}`);

    // ---------------------------------------------------------
    // API: leader reject -> member sees feedback -> record is editable -> resubmit
    // ---------------------------------------------------------
    console.log('API: leader reject -> editable -> resubmit...');
    const rejFlowHeaders = memberHeaders('flow-owner-2');
    const rejFlowDoc = await buildConfirmedDocument('flow-doc-2', 'flow-owner-2');
    const rejCreateRes = await sopApiCreate(apiRequest(rejFlowHeaders, { memberId: 'flow-owner-2', organizationId: 'org-approval-test', document: rejFlowDoc }));
    const rejCreated = (await rejCreateRes.json()).record as SopRecord;
    await sopApiLifecycle(apiRequest(rejFlowHeaders, { transition: 'leader-review' }), { params: Promise.resolve({ id: rejCreated.id }) });
    const rejectRes = await sopApiLifecycle(
        apiRequest(reviewerHeaders('leader', 'leader-flow-2'), { decision: 'reject', reasonCode: 'insufficient-detail', feedback: '(테스트) 3단계 기준을 구체화해 주세요.' }),
        { params: Promise.resolve({ id: rejCreated.id }) }
    );
    check(rejectRes.status === 200, `leader-reject via API must succeed, got ${rejectRes.status}`);
    const rejectedRecord = (await rejectRes.json()).record as SopRecord;
    check(rejectedRecord.lifecycleStatus === 'rejected' && Boolean(rejectedRecord.rejection?.feedback.includes('구체화')), 'The rejected record carries the exact feedback the leader wrote');

    const { PUT: sopApiUpdate } = await import('../src/app/api/sop/[id]/route');
    const editAfterReject = await sopApiUpdate(
        apiRequest(rejFlowHeaders, { document: { ...rejFlowDoc, title: '반려 후 수정된 제목' }, expectedVersion: rejectedRecord.version }),
        { params: Promise.resolve({ id: rejCreated.id }) }
    );
    check(editAfterReject.status === 200, `A rejected record's owner can edit it through the normal PUT route, got ${editAfterReject.status}`);

    const resubmitRes = await sopApiLifecycle(apiRequest(rejFlowHeaders, { transition: 'leader-review' }), { params: Promise.resolve({ id: rejCreated.id }) });
    check(resubmitRes.status === 200, `Resubmitting a rejected-then-reconfirmed record must succeed, got ${resubmitRes.status}`);
    const resubmittedRecord = (await resubmitRes.json()).record as SopRecord;
    check(resubmittedRecord.lifecycleStatus === 'leader-review' && resubmittedRecord.rejection === undefined, 'Resubmission restarts at leader-review (never sme-review) and clears the prior rejection metadata');

    // ---------------------------------------------------------
    // API: own-prior clone route
    // ---------------------------------------------------------
    console.log('API: own-prior clone route...');
    const priorCloneOwnerHeaders = memberHeaders('prior-clone-owner');
    const priorCloneSourceDoc = await buildConfirmedDocument('prior-clone-source', 'prior-clone-owner');
    const priorCloneSourceCreate = await sopApiCreate(apiRequest(priorCloneOwnerHeaders, { memberId: 'prior-clone-owner', organizationId: 'org-approval-test', document: priorCloneSourceDoc }));
    check(priorCloneSourceCreate.status === 201, 'Fixture setup: own-prior clone source record must save successfully');

    const priorCloneRes = await sopApiPriorClone(apiRequest(priorCloneOwnerHeaders), { params: Promise.resolve({ id: 'prior-clone-source' }) });
    check(priorCloneRes.status === 200, `Cloning one's own prior record must succeed, got ${priorCloneRes.status}`);
    const priorCloneBody = await priorCloneRes.json();
    check(priorCloneBody.document.id !== 'prior-clone-source', 'The own-prior clone response document has a brand-new id, never reusing the source id');
    check(priorCloneBody.document.sourceRecordId === 'prior-clone-source', 'The own-prior clone response records sourceRecordId provenance pointing at the source');

    const strangerPriorCloneAttempt = await sopApiPriorClone(apiRequest(memberHeaders('someone-else'), undefined), { params: Promise.resolve({ id: 'prior-clone-source' }) });
    check(strangerPriorCloneAttempt.status === 404, `A non-owning member's own-prior clone attempt must be rejected with 404 (indistinguishable from not-found), got ${strangerPriorCloneAttempt.status}`);

    const missingPriorCloneAttempt = await sopApiPriorClone(apiRequest(priorCloneOwnerHeaders), { params: Promise.resolve({ id: 'does-not-exist' }) });
    check(missingPriorCloneAttempt.status === 404, 'Cloning a non-existent record id is rejected with 404');

    // ---------------------------------------------------------
    // Scenario seed: idempotent, covers every required demo branch
    // ---------------------------------------------------------
    console.log('Domain: seedScenarioRecords is idempotent and covers the required scenario branches...');
    const seedRepo = new InMemorySopRepository();
    await seedScenarioRecords(seedRepo);
    const afterFirstSeed = await seedRepo.listAll();
    check(afterFirstSeed.length >= 5, `The first seed run produces at least 5 records, got ${afterFirstSeed.length}`);

    const statusesById = new Map(afterFirstSeed.map((r) => [r.id, r.lifecycleStatus]));
    check(statusesById.get('scenario-member-a-draft') === 'draft', 'member A draft scene seeded correctly');
    check(statusesById.get('scenario-member-a-leader-review') === 'leader-review', 'member A leader-review scene seeded correctly');
    check(statusesById.get('scenario-member-a-rejected') === 'rejected', 'member A rejected scene seeded correctly');
    check(statusesById.get('scenario-member-b-sme-review') === 'sme-review', 'member B sme-review scene seeded correctly');
    const approvedSeed = afterFirstSeed.find((r) => r.id === 'scenario-member-c-approved');
    check(Boolean(approvedSeed) && approvedSeed!.lifecycleStatus === 'approved' && approvedSeed!.templateEligible, 'member C approved + templateEligible scene seeded correctly');

    const distinctOrgs = new Set(afterFirstSeed.map((r) => r.organizationId));
    check(distinctOrgs.size >= 2, `The seed spans at least 2 organizations, got ${distinctOrgs.size}`);
    const distinctTasks = new Set(afterFirstSeed.map((r) => r.taskId));
    check(distinctTasks.size >= 2, `The seed spans at least 2 Tasks, got ${distinctTasks.size}`);

    const approvedStepModes = Object.values(approvedSeed!.document.agentizationReview?.stepModes ?? {});
    check(new Set(approvedStepModes).size > 1 || approvedStepModes.length !== approvedSeed!.document.steps.filter((s) => !s.terminalType).length, "member C's approved record has genuinely varied per-Sub-Action Agentization judgement, not one blanket mode applied to every Sub Action");

    await seedScenarioRecords(seedRepo);
    const afterSecondSeed = await seedRepo.listAll();
    check(afterSecondSeed.length === afterFirstSeed.length, 'Running the seed a second time produces no duplicate records (idempotent by fixed id)');

    // The production singleton was already auto-seeded on import (non-production guard in
    // sop-repository-memory.ts) — verify that seeding actually reached the live app singleton,
    // not just a throwaway repository instance, so member requests are genuinely visible to
    // leader/SME/HR within the same running process.
    const singletonSeed = await sopRepository.getById('scenario-member-c-approved');
    check(Boolean(singletonSeed), 'The scenario seed also ran against the real sopRepository singleton the API routes use, not only a test-local instance');

    // ---------------------------------------------------------
    // API: GET /api/sop/approvals — role scoping, stage isolation, filters
    // ---------------------------------------------------------
    console.log('API: GET /api/sop/approvals...');
    async function createAndAdvance(id: string, target: 'leader-review' | 'sme-review', organizationId = 'org-approval-test', jobRole?: string) {
        const headers = memberHeaders('approvals-fixture-owner', organizationId);
        const doc = await buildConfirmedDocument(id, 'approvals-fixture-owner');
        const patchedDoc = jobRole ? { ...doc, member: { ...doc.member, jobRole } } : doc;
        const createRes = await sopApiCreate(apiRequest(headers, { memberId: 'approvals-fixture-owner', organizationId, document: patchedDoc }));
        check(createRes.status === 201, `Fixture setup: create ${id} must succeed, got ${createRes.status}`);
        await sopApiLifecycle(apiRequest(headers, { transition: 'leader-review' }), { params: Promise.resolve({ id }) });
        if (target === 'sme-review') {
            await sopApiLifecycle(apiRequest(reviewerHeaders('leader', 'leader-approvals-fixture'), { decision: 'approve' }), { params: Promise.resolve({ id }) });
        }
    }
    await createAndAdvance('approvals-lr-1', 'leader-review', 'org-approval-test', 'Talent Acquisition');
    await createAndAdvance('approvals-lr-2', 'leader-review', 'org-approval-other');
    await createAndAdvance('approvals-sr-1', 'sme-review');

    const leaderQueueRes = await sopApiApprovals(apiGetRequest(reviewerHeaders('leader', 'leader-view-1'), 'http://localhost/api/sop/approvals'));
    check(leaderQueueRes.status === 200, `GET as leader must succeed, got ${leaderQueueRes.status}`);
    const leaderQueueBody = await leaderQueueRes.json();
    check(leaderQueueBody.records.every((r: SopRecord) => r.lifecycleStatus === 'leader-review'), 'The leader queue contains ONLY leader-review records, never sme-review/approved/draft');
    check(leaderQueueBody.records.some((r: SopRecord) => r.id === 'approvals-lr-1') && leaderQueueBody.records.some((r: SopRecord) => r.id === 'approvals-lr-2'), 'Both leader-review fixtures (across two different organizations) appear — no org restriction on the leader queue itself');
    check(!leaderQueueBody.records.some((r: SopRecord) => r.id === 'approvals-sr-1'), 'The sme-review fixture does NOT appear in the leader queue');

    const smeQueueRes = await sopApiApprovals(apiGetRequest(reviewerHeaders('sme', 'sme-view-1'), 'http://localhost/api/sop/approvals'));
    const smeQueueBody = await smeQueueRes.json();
    // Note: the module-level scenario seed (sop-scenario-seed.ts) also contributes a real
    // 'scenario-member-b-sme-review' record to this same singleton repository, so the queue
    // is not expected to contain ONLY this fixture — only that every record is genuinely
    // sme-review and this fixture is among them.
    check(smeQueueBody.records.every((r: SopRecord) => r.lifecycleStatus === 'sme-review'), 'Every record in the SME queue is genuinely at sme-review');
    check(smeQueueBody.records.some((r: SopRecord) => r.id === 'approvals-sr-1'), 'The sme-review fixture appears in the SME queue');
    check(!smeQueueBody.records.some((r: SopRecord) => r.id === 'approvals-lr-1' || r.id === 'approvals-lr-2'), 'The leader-review fixtures do NOT appear in the SME queue');

    const memberQueueAttempt = await sopApiApprovals(apiGetRequest(memberHeaders('some-member'), 'http://localhost/api/sop/approvals'));
    check(memberQueueAttempt.status === 403, `A member actor has no approvals-queue access, got ${memberQueueAttempt.status}`);
    const hrQueueAttempt = await sopApiApprovals(apiGetRequest({ 'x-sop-actor-id': 'hr-1', 'x-sop-actor-role': 'hr', 'x-sop-actor-organization-id': 'org-x' }, 'http://localhost/api/sop/approvals'));
    check(hrQueueAttempt.status === 403, `An HR actor has no approvals-queue access either (HR is a separate, read-only dashboard), got ${hrQueueAttempt.status}`);

    const orgFilteredRes = await sopApiApprovals(apiGetRequest(reviewerHeaders('leader', 'leader-view-1'), 'http://localhost/api/sop/approvals?organizationId=org-approval-other'));
    const orgFilteredBody = await orgFilteredRes.json();
    check(
        orgFilteredBody.records.every((r: SopRecord) => r.organizationId === 'org-approval-other') && orgFilteredBody.records.some((r: SopRecord) => r.id === 'approvals-lr-2'),
        'organizationId query filter narrows the leader queue to just that organization, and the fixture is present'
    );
    check(!orgFilteredBody.records.some((r: SopRecord) => r.id === 'approvals-lr-1'), 'organizationId filter excludes a record from a different organization');

    const jobFilteredRes = await sopApiApprovals(apiGetRequest(reviewerHeaders('leader', 'leader-view-1'), 'http://localhost/api/sop/approvals?jobRole=Talent%20Acquisition&organizationId=org-approval-test'));
    const jobFilteredBody = await jobFilteredRes.json();
    check(
        jobFilteredBody.records.every((r: SopRecord) => r.document.member.jobRole === 'Talent Acquisition') && jobFilteredBody.records.some((r: SopRecord) => r.id === 'approvals-lr-1'),
        'jobRole query filter narrows the leader queue to that job role, and the fixture is present'
    );

    check(Array.isArray(leaderQueueBody.organizationProgress) && leaderQueueBody.organizationProgress.length > 0, 'The response includes organizationProgress derived from the full record set, not just the current queue');
    const someOrgProgress = leaderQueueBody.organizationProgress[0];
    check(
        typeof someOrgProgress.approvalRate.approvedCount === 'number' && typeof someOrgProgress.approvalRate.submittedCount === 'number' &&
        (someOrgProgress.approvalRate.rate === null || typeof someOrgProgress.approvalRate.rate === 'number'),
        'Each organizationProgress entry exposes the exact numerator/denominator behind its approval rate, never just a bare percentage'
    );

    // ---------------------------------------------------------
    // Defect fix: SopApprovalReadOnlyPanel shows Sub Action origin (activity-derived vs.
    // context-derived + rationale), rendered independently from Activity mapping, with
    // NO edit controls anywhere in the panel.
    // ---------------------------------------------------------
    console.log('Component: SopApprovalReadOnlyPanel shows Sub Action origin distinctly from Activity mapping...');
    const originPanelDoc: SopDocument = {
        ...SAMPLE_SOP_DOCUMENT,
        structureVersion: 'activity-subaction-v1',
        steps: SAMPLE_SOP_DOCUMENT.steps.map((step, index) =>
            step.terminalType
                ? step
                : index === 1
                  ? { ...step, sourceActivityIds: ['act-sourcing'], subActionOrder: 1, subActionOrigin: 'context-derived', subActionOriginRationale: '구성원이 입력한 해외 대응 맥락에서 파생된 단계입니다.' }
                  : { ...step, sourceActivityIds: ['act-requisition-review'], subActionOrder: 1, subActionOrigin: 'activity-derived' }
        ),
    };
    const originPanelRecord: SopRecord = {
        id: originPanelDoc.id, memberId: 'panel-owner', organizationId: 'org-panel-test', taskId: originPanelDoc.workLibrary.taskId, taskName: originPanelDoc.workLibrary.taskName,
        sourceType: 'task', document: originPanelDoc, version: 1, lifecycleStatus: 'leader-review', templateEligible: false, creationSource: 'task',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    let panelRenderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        panelRenderer = TestRenderer.create(React.createElement(SopApprovalReadOnlyPanel, { record: originPanelRecord }));
    });
    const panelText = JSON.stringify(panelRenderer.toJSON());
    check(panelText.includes('Activity 기본 분해'), "An activity-derived step shows the 'Activity 기본 분해' origin label");
    check(panelText.includes('직무 맥락 보강') && panelText.includes('해외 대응 맥락'), "A context-derived step shows the '직무 맥락 보강' label AND its rationale text");
    check(panelRenderer.root.findAllByType('button').length === 0, 'The read-only approval panel renders NO buttons anywhere (no edit affordance)');
    check(panelRenderer.root.findAllByType('input').length === 0 && panelRenderer.root.findAllByType('textarea').length === 0, 'The read-only approval panel renders NO input/textarea anywhere (no edit affordance)');
    // Independent rendering: the origin label and the Activity-mapping chip are two
    // separate elements, not merged into one combined badge string.
    const activityChip = panelText.includes('채용 요청 및 직무 요건 확정') || panelText.includes('채용 공고 및 후보자 소싱');
    check(activityChip, 'The Activity-mapping chip (Activity name) still renders independently of the origin label');
    act(() => {
        panelRenderer.unmount();
    });

    // ---------------------------------------------------------
    // Defect fix: scenario seed must be usable even under NODE_ENV=production
    // (a Vercel-style prod build), driven by an explicit flag rather than
    // NODE_ENV, with a single idempotent init Promise every repository call
    // awaits — replacing the old `void seedScenarioRecords(...)`
    // fire-and-forget call that could race an early read.
    // ---------------------------------------------------------
    console.log('Domain: createScenarioSeededRepository — production-capable, idempotent, disable-able seeding...');

    // Next.js's own type augmentation declares NODE_ENV readonly; this test
    // deliberately overrides it at runtime (types bypassed via an untyped
    // env handle) to prove seeding no longer inspects NODE_ENV at all.
    const mutableEnv = process.env as Record<string, string | undefined>;
    const previousNodeEnv = mutableEnv.NODE_ENV;
    try {
        mutableEnv.NODE_ENV = 'production';
        const prodRepo = new InMemorySopRepository();
        const prodWrapped = createScenarioSeededRepository(prodRepo, true);
        const prodRecord = await prodWrapped.getById('scenario-member-c-approved');
        check(Boolean(prodRecord) && prodRecord!.lifecycleStatus === 'approved', 'With NODE_ENV=production, an enabled scenario-seed gate still seeds and serves the demo records — seeding is no longer NODE_ENV-gated');
    } finally {
        mutableEnv.NODE_ENV = previousNodeEnv;
    }

    const disabledRepo = new InMemorySopRepository();
    const disabledWrapped = createScenarioSeededRepository(disabledRepo, false);
    const disabledRecord = await disabledWrapped.getById('scenario-member-c-approved');
    check(disabledRecord === null, 'With the scenario-seed gate explicitly disabled, no demo records are auto-created (the future real-production cutover path)');
    const disabledAll = await disabledWrapped.listAll();
    check(disabledAll.length === 0, 'A disabled gate never seeds anything, even after a read is made');

    // The FIRST read through a freshly wrapped repository must itself await
    // seeding — proving there is no fire-and-forget race where an early
    // request can return before seeding completes.
    const raceRepo = new InMemorySopRepository();
    const raceWrapped = createScenarioSeededRepository(raceRepo, true);
    const firstEverRead = await raceWrapped.getById('scenario-member-c-approved');
    check(Boolean(firstEverRead), 'The very first call made through a freshly wrapped repository already sees fully-seeded data — no early-read race against a fire-and-forget seed');

    // Multiple concurrent calls racing the first-ever seed must all await the
    // SAME seeding Promise, not each trigger their own independent seed run.
    const concurrentRepo = new InMemorySopRepository();
    const concurrentWrapped = createScenarioSeededRepository(concurrentRepo, true);
    const [concurrentA, concurrentB, concurrentC] = await Promise.all([
        concurrentWrapped.listAll(),
        concurrentWrapped.listAll(),
        concurrentWrapped.getById('scenario-member-c-approved'),
    ]);
    check(concurrentA.length === concurrentB.length && concurrentA.length >= 5, 'Concurrent calls racing the first-ever seed all observe the same fully-seeded record count');
    check(Boolean(concurrentC), 'A concurrent getById also observes the seeded record, not a partially-seeded or empty state');
    const afterConcurrentAll = await concurrentWrapped.listAll();
    check(afterConcurrentAll.length === concurrentA.length, 'No duplicate records were created by the concurrent race (a single idempotent init Promise, not one seed run per caller)');

    // The required demo branches (leader Inbox / SME Inbox / colleague
    // template / HR analytics) must survive through the wrapped repository
    // exactly as they do through the raw repository (checked above via
    // seedScenarioRecords directly).
    const branchRepo = new InMemorySopRepository();
    const branchWrapped = createScenarioSeededRepository(branchRepo, true);
    const branchAll = await branchWrapped.listAll();
    const branchStatuses = new Map(branchAll.map((r) => [r.id, r.lifecycleStatus]));
    check(branchStatuses.get('scenario-member-a-leader-review') === 'leader-review', 'Wrapped repository: leader Inbox demo branch (leader-review) is present');
    check(branchStatuses.get('scenario-member-b-sme-review') === 'sme-review', 'Wrapped repository: SME Inbox demo branch (sme-review) is present');
    const branchApproved = branchAll.find((r) => r.id === 'scenario-member-c-approved');
    check(Boolean(branchApproved) && branchApproved!.templateEligible === true, 'Wrapped repository: colleague-template demo branch (approved + templateEligible) is present');
    check(branchAll.some((r) => r.lifecycleStatus === 'approved'), 'Wrapped repository: HR analytics has at least one approved record to aggregate');

    // A FAILING seed must degrade to "demo data missing", never to a permanently
    // broken repository: the cached init Promise must be the CAUGHT (resolved)
    // one, so the failure is logged once and every subsequent repository call
    // still works. Without the catch, the cached rejection would rethrow on
    // every call and brick the whole /api/sop surface over optional demo data.
    const failingBase = new InMemorySopRepository();
    const failingSeedRepo: SopRepository = {
        create: async () => {
            throw new Error('(test) 시나리오 seed create 강제 실패');
        },
        getById: (id) => failingBase.getById(id),
        update: (id, input) => failingBase.update(id, input),
        listByMember: (memberId) => failingBase.listByMember(memberId),
        listByOrganization: (organizationId) => failingBase.listByOrganization(organizationId),
        listAll: () => failingBase.listAll(),
        listByLifecycleStage: (stage) => failingBase.listByLifecycleStage(stage),
        listTemplateEligible: () => failingBase.listTemplateEligible(),
        listColleagueTemplateCandidates: (excludingMemberId) => failingBase.listColleagueTemplateCandidates(excludingMemberId),
        transitionLifecycle: (id, input) => failingBase.transitionLifecycle(id, input),
        setTemplateEligibility: (id, eligible) => failingBase.setTemplateEligibility(id, eligible),
    };
    const failingWrapped = createScenarioSeededRepository(failingSeedRepo, true);
    const originalConsoleError = console.error;
    let seedFailureLogCount = 0;
    console.error = () => {
        seedFailureLogCount += 1;
    };
    let firstCallAfterFailedSeed: SopRecord[] | null = null;
    let secondCallAfterFailedSeed: SopRecord | null | 'rejected' = 'rejected';
    try {
        firstCallAfterFailedSeed = await failingWrapped.listAll();
        secondCallAfterFailedSeed = await failingWrapped.getById('scenario-member-c-approved');
    } finally {
        console.error = originalConsoleError;
    }
    check(Array.isArray(firstCallAfterFailedSeed) && firstCallAfterFailedSeed.length === 0, 'A failing seed degrades gracefully: the first repository call still resolves (empty, no demo data) instead of rejecting');
    check(secondCallAfterFailedSeed === null, 'Subsequent calls after a failed seed also resolve normally — the caught init Promise is cached, never a poisoned rejection');
    check(seedFailureLogCount === 1, `The seed failure is logged exactly once (single-shot init, no per-call retry), got ${seedFailureLogCount} log calls`);

    console.log(`\nALL SOP APPROVAL-LIFECYCLE TESTS PASSED (${passed})`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
