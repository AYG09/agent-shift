import type { SopDocument } from '@/lib/sop-types';
import type { SopRecord, SopRepository, SopRepositoryCreateResult, SopRepositoryUpdateResult } from '@/lib/sop-repository';

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
        return {
            taskId: document.workLibrary.taskId,
            taskName: document.workLibrary.taskName,
            activityId: document.workLibrary.activityId,
            activityName: document.workLibrary.activityName,
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
}

/**
 * A single process-wide instance so requests within the same server process
 * see each other's writes (still lost on restart — see class docstring above).
 */
export const sopRepository = new InMemorySopRepository();
