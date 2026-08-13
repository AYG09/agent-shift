import type { SopDocument, SopMember, SopAiApplicationMode } from './sop-types';
import type { SopRepository } from './sop-repository';
import { createTaskLibrarySelectionForRole } from './sop-task-library';
import { buildTaskGateSampleDocument } from './sop-sample-data';

/**
 * Deterministic demo data for the leader/SME/HR scenario walkthrough — kept in
 * its own module, separate from the customer T-A-S fixture
 * (`src/data/sop-task-library-sample.json`, normalized by sop-task-library.ts)
 * per the work order's explicit "do not mix these in one file" rule. This
 * seeds `SopRecord`s directly through the repository port
 * (`SopRepository.create`/`transitionLifecycle`), bypassing the HTTP
 * boundary the same way existing tests already do — it is server-side setup
 * data, not a member's real submission.
 *
 * `seedScenarioRecords` is idempotent: every id below is fixed, and each is
 * checked with `getById` before creating, so calling this twice (e.g. two
 * dev-server reloads importing the singleton module) never produces
 * duplicates.
 */

const SCENARIO_MEMBER_A: SopMember = {
    id: 'scenario-member-a',
    employeeId: 'SCN-A-0001',
    name: '시나리오 데모 구성원 A',
    jobRole: 'Talent Acquisition',
    organization: 'People & Culture팀',
    grade: 'Associate',
};

const SCENARIO_MEMBER_B: SopMember = {
    id: 'scenario-member-b',
    employeeId: 'SCN-B-0001',
    name: '시나리오 데모 구성원 B',
    jobRole: 'Application Marketing',
    organization: 'Application Marketing팀',
    grade: 'Associate',
};

const SCENARIO_MEMBER_C: SopMember = {
    id: 'scenario-member-c',
    employeeId: 'SCN-C-0001',
    name: '시나리오 데모 구성원 C',
    jobRole: 'Application Marketing',
    organization: 'Application Marketing팀',
    grade: 'Senior',
};

const SCENARIO_LEADER_ACTOR_ID = 'scenario-leader-1';
const SCENARIO_SME_ACTOR_ID = 'scenario-sme-1';

/** A confirmed, Activity–Sub Action structured document for `member`, ready to save as-is (bypasses the browser Store's confirm flow, the same way `sopRepository.create()`-calling tests already do). */
function buildConfirmedScenarioDocument(id: string, member: SopMember, applyStepModes: boolean): SopDocument {
    const workLibrary = createTaskLibrarySelectionForRole(member.jobRole);
    const built = buildTaskGateSampleDocument({
        id,
        member,
        workLibrary,
        context: `${workLibrary.taskName} 업무에 대한 시나리오 데모 SOP입니다.`,
        setupConfig: { detailLevel: 'standard', minSteps: 6, maxSteps: 20, branchPolicy: 'auto', maxBranches: 2, allowRework: true, maxTotalNodes: 24, maxLoops: 2, splitComplexSteps: true },
    });
    if (!built.success) throw new Error(`시나리오 seed 문서 생성 실패 (${id}): ${built.reason}`);

    const businessSteps = built.document.steps.filter((step) => !step.terminalType);
    // "Sub Action별 서로 다른 Agent화 판단" — cycle automation/assist/unset across
    // the generated Sub Actions so member-confirmed judgement genuinely varies
    // per Sub Action, not one blanket mode.
    const MODE_CYCLE: (SopAiApplicationMode | undefined)[] = ['automation', 'assist', undefined];
    const stepModes: Partial<Record<string, SopAiApplicationMode>> = {};
    businessSteps.forEach((step, index) => {
        const mode = MODE_CYCLE[index % MODE_CYCLE.length];
        if (mode) stepModes[step.id] = mode;
    });

    return {
        ...built.document,
        reviewStatus: 'confirmed',
        steps: built.document.steps.map((step) => ({ ...step, reviewStatus: 'confirmed' })),
        agentizationReview: applyStepModes
            ? { scope: 'steps', stepIds: businessSteps.map((step) => step.id), stepModes, confirmedAt: new Date().toISOString() }
            : undefined,
    };
}

async function ensureCreated(repository: SopRepository, params: { id: string; member: SopMember; organizationId: string; applyStepModes?: boolean }) {
    const existing = await repository.getById(params.id);
    if (existing) return existing;
    const document = buildConfirmedScenarioDocument(params.id, params.member, params.applyStepModes ?? false);
    const result = await repository.create({ memberId: params.member.id!, organizationId: params.organizationId, document });
    if (!result.ok) throw new Error(`시나리오 seed 레코드 생성 실패 (${params.id}): ${result.reason}`);
    return result.record;
}

async function advanceToLeaderReview(repository: SopRepository, id: string, memberId: string) {
    const record = await repository.getById(id);
    if (record && record.lifecycleStatus === 'draft') {
        await repository.transitionLifecycle(id, { actorRole: 'member', actorId: memberId, kind: 'member-submit' });
    }
}

async function advanceToSmeReview(repository: SopRepository, id: string, memberId: string) {
    await advanceToLeaderReview(repository, id, memberId);
    const record = await repository.getById(id);
    if (record && record.lifecycleStatus === 'leader-review') {
        await repository.transitionLifecycle(id, { actorRole: 'leader', actorId: SCENARIO_LEADER_ACTOR_ID, kind: 'leader-approve' });
    }
}

async function advanceToApproved(repository: SopRepository, id: string, memberId: string) {
    await advanceToSmeReview(repository, id, memberId);
    const record = await repository.getById(id);
    if (record && record.lifecycleStatus === 'sme-review') {
        await repository.transitionLifecycle(id, { actorRole: 'sme', actorId: SCENARIO_SME_ACTOR_ID, kind: 'sme-approve' });
    }
}

async function advanceToRejectedAtLeader(repository: SopRepository, id: string, memberId: string) {
    await advanceToLeaderReview(repository, id, memberId);
    const record = await repository.getById(id);
    if (record && record.lifecycleStatus === 'leader-review') {
        await repository.transitionLifecycle(id, {
            actorRole: 'leader',
            actorId: SCENARIO_LEADER_ACTOR_ID,
            kind: 'leader-reject',
            reasonCode: 'insufficient-detail',
            feedback: '(프로토타입 데모) 3단계 서류 검토 기준이 불명확합니다. 평가 기준을 구체화해 다시 제출해 주세요.',
        });
    }
}

/**
 * Idempotently seeds the minimum scene set the final-scenario work order
 * requires: member A draft/leader-review/rejected, member B sme-review,
 * member C approved+templateEligible, 2+ organizations, 2+ Tasks, and
 * per-Sub-Action Agentization judgement variety.
 */
export async function seedScenarioRecords(repository: SopRepository): Promise<void> {
    await ensureCreated(repository, { id: 'scenario-member-a-draft', member: SCENARIO_MEMBER_A, organizationId: SCENARIO_MEMBER_A.organization! });

    await ensureCreated(repository, { id: 'scenario-member-a-leader-review', member: SCENARIO_MEMBER_A, organizationId: SCENARIO_MEMBER_A.organization! });
    await advanceToLeaderReview(repository, 'scenario-member-a-leader-review', SCENARIO_MEMBER_A.id!);

    await ensureCreated(repository, { id: 'scenario-member-a-rejected', member: SCENARIO_MEMBER_A, organizationId: SCENARIO_MEMBER_A.organization! });
    await advanceToRejectedAtLeader(repository, 'scenario-member-a-rejected', SCENARIO_MEMBER_A.id!);

    await ensureCreated(repository, { id: 'scenario-member-b-sme-review', member: SCENARIO_MEMBER_B, organizationId: SCENARIO_MEMBER_B.organization! });
    await advanceToSmeReview(repository, 'scenario-member-b-sme-review', SCENARIO_MEMBER_B.id!);

    await ensureCreated(repository, { id: 'scenario-member-c-approved', member: SCENARIO_MEMBER_C, organizationId: SCENARIO_MEMBER_C.organization!, applyStepModes: true });
    await advanceToApproved(repository, 'scenario-member-c-approved', SCENARIO_MEMBER_C.id!);
    const approvedRecord = await repository.getById('scenario-member-c-approved');
    if (approvedRecord && approvedRecord.lifecycleStatus === 'approved' && !approvedRecord.templateEligible) {
        await repository.setTemplateEligibility('scenario-member-c-approved', true);
    }
}

/** The fixed demo-member roster this seed provisions — used as the "프로토타입 기준" population for organization-progress rate displays (see sop-analytics.ts / sop-review-assignment.ts), never a real enterprise headcount. */
export const SCENARIO_DEMO_MEMBERS: SopMember[] = [SCENARIO_MEMBER_A, SCENARIO_MEMBER_B, SCENARIO_MEMBER_C];
