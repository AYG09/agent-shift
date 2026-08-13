import type { SopDocument } from '@/lib/sop-types';
import { resolveCreationSource } from '@/lib/sop-types';
import type {
    SopRecord,
    SopRepository,
    SopRepositoryCreateResult,
    SopRepositoryUpdateResult,
    SopRepositoryLifecycleResult,
    SopRepositoryLifecycleInput,
} from '@/lib/sop-repository';
import { computeSopLifecycleTransition, isMemberEditableLifecycleStatus, type SopLifecycleTransitionInput } from '@/lib/sop-lifecycle';
import { seedScenarioRecords } from '@/lib/sop-scenario-seed';

/**
 * Reference server-side implementation of SopRepository, backed by a plain
 * module-level Map.
 *
 * THIS IS NOT DURABLE STORAGE. It resets on every server restart/redeploy and
 * is not shared across serverless instances. It exists to prove out the
 * /api/sop request/response contract (schema validation, versioning, role
 * scoping) end-to-end without adopting a database vendor before one has been
 * confirmed. Swap this for a real adapter (same SopRepository interface) once
 * persistent storage, auth, and org/user data are actually available; nothing
 * above this module (the API routes) needs to change when that happens.
 */
export class InMemorySopRepository implements SopRepository {
    private readonly records = new Map<string, SopRecord>();

    private toRecordFields(document: SopDocument) {
        const isActivityScope = document.workLibrary.sourceType === 'activity';
        return {
            taskId: document.workLibrary.taskId,
            taskName: document.workLibrary.taskName,
            sourceType: document.workLibrary.sourceType,
            // A Task-wide SOP can retain an Activity as the editor's focus in the
            // document, but it is not the generation scope. Listing metadata must
            // not misrepresent that focus as an Activity-scoped SOP.
            activityId: isActivityScope ? document.workLibrary.activityId : undefined,
            activityName: isActivityScope ? document.workLibrary.activityName : undefined,
            creationSource: resolveCreationSource(document),
            sourceTemplateId: document.sourceTemplateId,
            sourceRecordId: document.sourceRecordId,
        };
    }

    /**
     * Every value that crosses the repository boundary (in or out) is cloned.
     * Without this, a caller holding a reference to a document/record they
     * passed in (or received back) could mutate the store's data directly —
     * bypassing update()'s optimistic-locking version bump entirely. The data
     * is plain JSON-shaped (SopDocument/SopRecord have no functions, Dates,
     * or cycles), so structuredClone is a safe, dependency-free deep clone.
     */
    private cloneRecord(record: SopRecord): SopRecord {
        return structuredClone(record);
    }

    async create(input: { memberId: string; organizationId: string; document: SopDocument }): Promise<SopRepositoryCreateResult> {
        const existing = this.records.get(input.document.id);
        if (existing) return { ok: false, reason: 'already-exists', current: this.cloneRecord(existing) };

        const now = new Date().toISOString();
        const record: SopRecord = {
            id: input.document.id,
            memberId: input.memberId,
            organizationId: input.organizationId,
            ...this.toRecordFields(input.document),
            document: structuredClone(input.document),
            version: 1,
            // A member creating a record can never start it as anything other than
            // 'draft'/not-template-eligible — those states are leader/SME-only
            // outcomes (see transitionLifecycle/setTemplateEligibility) with no
            // create-time input.
            lifecycleStatus: 'draft',
            templateEligible: false,
            createdAt: now,
            updatedAt: now,
        };
        this.records.set(record.id, record);
        return { ok: true, record: this.cloneRecord(record) };
    }

    async getById(id: string): Promise<SopRecord | null> {
        const record = this.records.get(id);
        return record ? this.cloneRecord(record) : null;
    }

    async update(id: string, input: { document: SopDocument; expectedVersion: number }): Promise<SopRepositoryUpdateResult> {
        const current = this.records.get(id);
        if (!current) return { ok: false, reason: 'not-found' };
        // Enforced here, not just at the API boundary (PUT /api/sop/[id]) — a
        // record's id and its embedded document.id must never disagree, no
        // matter how update() is called. Checked before the version check so a
        // mismatched request can never bump the version of the wrong record.
        if (input.document.id !== id) return { ok: false, reason: 'id-mismatch' };
        // A member's plain content PUT only ever applies while the record is
        // member-editable ('draft' or 'rejected' — see
        // isMemberEditableLifecycleStatus). Once review has started (or the
        // record is officially approved), the content a reviewer
        // reviewed/approved must stay exactly what they saw. This is enforced
        // here (not just at the API boundary) so no caller of update() can
        // bypass it. Checked before the version check: even a version-correct
        // request must not be allowed to silently drift locked content.
        if (!isMemberEditableLifecycleStatus(current.lifecycleStatus)) {
            return { ok: false, reason: 'locked-lifecycle', current: this.cloneRecord(current) };
        }
        if (current.version !== input.expectedVersion) return { ok: false, reason: 'version-conflict', current: this.cloneRecord(current) };

        const updated: SopRecord = {
            ...current,
            ...this.toRecordFields(input.document),
            document: structuredClone(input.document),
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this.records.set(id, updated);
        return { ok: true, record: this.cloneRecord(updated) };
    }

    async listByMember(memberId: string): Promise<SopRecord[]> {
        return [...this.records.values()].filter((record) => record.memberId === memberId).map((record) => this.cloneRecord(record));
    }

    async listByOrganization(organizationId: string): Promise<SopRecord[]> {
        return [...this.records.values()].filter((record) => record.organizationId === organizationId).map((record) => this.cloneRecord(record));
    }

    async listAll(): Promise<SopRecord[]> {
        return [...this.records.values()].map((record) => this.cloneRecord(record));
    }

    async listByLifecycleStage(stage: 'leader-review' | 'sme-review'): Promise<SopRecord[]> {
        return [...this.records.values()].filter((record) => record.lifecycleStatus === stage).map((record) => this.cloneRecord(record));
    }

    async listTemplateEligible(): Promise<SopRecord[]> {
        return [...this.records.values()]
            .filter((record) => record.lifecycleStatus === 'approved' && record.templateEligible)
            .map((record) => this.cloneRecord(record));
    }

    async listColleagueTemplateCandidates(excludingMemberId: string): Promise<SopRecord[]> {
        return [...this.records.values()]
            .filter((record) => record.lifecycleStatus === 'approved' && record.templateEligible && record.memberId !== excludingMemberId)
            .map((record) => this.cloneRecord(record));
    }

    async transitionLifecycle(id: string, input: SopRepositoryLifecycleInput): Promise<SopRepositoryLifecycleResult> {
        const current = this.records.get(id);
        if (!current) return { ok: false, reason: 'not-found' };

        // member-submit carries an extra document-level precondition
        // (reviewStatus === 'confirmed') that computeSopLifecycleTransition
        // deliberately does not know about — it is a pure lifecycle-status
        // function, not a document-content validator. Ownership is checked
        // FIRST (matching computeSopLifecycleTransition's own precedence) so a
        // non-owning member's request is rejected as 'forbidden', never
        // masked by a 409 about document confirmation that has nothing to do
        // with why the request should fail.
        if (input.kind === 'member-submit') {
            if (current.memberId !== input.actorId) {
                return { ok: false, reason: 'forbidden', message: '이 SOP는 작성한 구성원만 승인 요청을 할 수 있습니다.' };
            }
            if (current.document.reviewStatus !== 'confirmed') {
                return { ok: false, reason: 'invalid-transition', message: 'SOP 내용을 먼저 확정(confirmed)해야 승인을 요청할 수 있습니다.' };
            }
        }

        const transitionInput = toLifecycleTransitionInput(input);
        const result = computeSopLifecycleTransition(current, transitionInput);
        if (!result.ok) return result;

        const updated: SopRecord = {
            ...current,
            lifecycleStatus: result.patch.lifecycleStatus,
            rejection: result.patch.rejection ?? undefined,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this.records.set(id, updated);
        return { ok: true, record: this.cloneRecord(updated) };
    }

    async setTemplateEligibility(id: string, eligible: boolean): Promise<SopRepositoryLifecycleResult> {
        const current = this.records.get(id);
        if (!current) return { ok: false, reason: 'not-found' };
        if (eligible && current.lifecycleStatus !== 'approved') {
            return { ok: false, reason: 'invalid-transition', message: '승인 완료된 SOP만 동료 템플릿으로 표시할 수 있습니다.' };
        }
        const updated: SopRecord = { ...current, templateEligible: eligible, version: current.version + 1, updatedAt: new Date().toISOString() };
        this.records.set(id, updated);
        return { ok: true, record: this.cloneRecord(updated) };
    }
}

/** Maps the repository-level role-paired input to the pure domain function's role-agnostic input shape. */
function toLifecycleTransitionInput(input: SopRepositoryLifecycleInput): SopLifecycleTransitionInput {
    switch (input.kind) {
        case 'member-submit':
            return { kind: 'member-submit', actorId: input.actorId };
        case 'leader-approve':
            return { kind: 'leader-approve', actorId: input.actorId };
        case 'leader-reject':
            return { kind: 'leader-reject', actorId: input.actorId, reasonCode: input.reasonCode, feedback: input.feedback };
        case 'sme-approve':
            return { kind: 'sme-approve', actorId: input.actorId };
        case 'sme-reject':
            return { kind: 'sme-reject', actorId: input.actorId, reasonCode: input.reasonCode, feedback: input.feedback };
    }
}

/**
 * Whether the demo scenario data should be seeded at all. Deliberately NOT
 * derived from NODE_ENV: this repository currently backs a customer-review
 * prototype deployment, and a production build (e.g. Vercel) still needs the
 * leader/SME/HR/colleague-template demo records to be able to walk through
 * the final scenario. Defaults to enabled so today's prototype deployments
 * keep working unchanged; set SOP_SCENARIO_SEED_MODE=disabled explicitly for
 * a future real-production cutover where seeding must never run.
 */
const SOP_SCENARIO_SEED_ENABLED = process.env.SOP_SCENARIO_SEED_MODE !== 'disabled';

/**
 * Wraps a repository so every method call awaits scenario-seed readiness
 * before delegating — this is what removes the race the old
 * `void seedScenarioRecords(...)` fire-and-forget call left open (an early
 * request could read before seeding finished). The seeding Promise is created
 * at most once (`ready` is assigned exactly once, on the first call from any
 * caller) and every subsequent/concurrent caller awaits that SAME Promise, so
 * seeding itself stays idempotent regardless of how many requests race to be
 * first. A Proxy (rather than manually wrapping each SopRepository method) so
 * a future new repository method can never accidentally skip this gate.
 *
 * Exported for tests: build an isolated repository + gate pair to verify the
 * enabled/disabled branches and the idempotent-init behavior without
 * depending on the module-level singleton or process.env.
 */
export function createScenarioSeededRepository(repository: SopRepository, enabled: boolean): SopRepository {
    let ready: Promise<void> | null = null;
    const ensureReady = (): Promise<void> => {
        if (!enabled) return Promise.resolve();
        // A seed failure must degrade to "demo data missing", never to a
        // permanently broken repository: without the catch, the rejected
        // Promise would be cached in `ready` and every subsequent repository
        // call would rethrow it — bricking the whole /api/sop surface over
        // optional demo data. Deliberately single-shot (no retry on later
        // calls): seeding is idempotent-by-fixed-id but a persistently
        // failing seed would otherwise re-run on every request.
        if (!ready) {
            ready = seedScenarioRecords(repository).catch((error) => {
                console.error('[SopScenarioSeed] 시나리오 데모 seed 생성에 실패했습니다. 데모 데이터 없이 계속 동작합니다.', error);
            });
        }
        return ready;
    };
    return new Proxy(repository, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== 'function') return value;
            return async (...args: unknown[]) => {
                await ensureReady();
                return (value as (...callArgs: unknown[]) => unknown).apply(target, args);
            };
        },
    });
}

/**
 * A single process-wide instance so requests within the same server process
 * see each other's writes (still lost on restart — see class docstring
 * above). Every call through this exported binding first awaits scenario-seed
 * readiness (see createScenarioSeededRepository above) so leader/SME/HR/
 * colleague-template demo records are guaranteed visible by the time any API
 * route's read resolves — see sop-scenario-seed.ts for the seeded records
 * themselves. Scoped to this singleton only: a test that constructs its own
 * `new InMemorySopRepository()` never sees these records.
 */
export const sopRepository: SopRepository = createScenarioSeededRepository(new InMemorySopRepository(), SOP_SCENARIO_SEED_ENABLED);
