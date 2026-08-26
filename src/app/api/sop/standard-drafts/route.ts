import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { respondValidated } from '@/server/sop/sop-response';
import { generateStandardDraftDocument, type SopStandardDraftGenerate } from '@/server/sop/sop-standard-draft-runner';
import { SopStandardDraftRequestSchema, SopStandardDraftResponseSchema } from '@/lib/sop-standard-draft-schemas';
import { documentContainsAuthorIdentifiers } from '@/lib/sop-template';
import { SOP_TASK_LIBRARY_FIXTURE, createWorkLibrarySelection } from '@/lib/sop-task-library';
import { sanitizeStandardDraftSource } from '@/server/sop/sop-standard-draft-prompt';
import type { SopRecord } from '@/lib/sop-record-schema';

function findJobForTask(taskId: string) {
    for (const job of SOP_TASK_LIBRARY_FIXTURE.jobs) {
        const task = job.tasks.find((t) => t.id === taskId);
        if (task) return { job, task };
    }
    return null;
}

/**
 * HR-only preview generation for a Task-grouped standard-SOP candidate
 * (작업 F #9). Never persists the result as a SopRecord — this is a preview
 * response only, and the caller must never present it as an officially
 * confirmed standard. Every source record must be approved AND share the
 * requested taskId; any other record (draft/rejected/wrong Task) is rejected
 * outright rather than silently skipped, so the response can never quietly
 * include content from a record HR didn't actually mean to select.
 */
/**
 * `testOnly.generate` mirrors generateStandardDraftDocument's own `generate?`
 * DI seam one level up so this route's success path (not just its validation
 * boundary) can be tested without ever exercising the live generateObject()
 * network call — the same repo-wide convention runSopSetupGeneration's
 * `generate?` param already follows for the personal-SOP path.
 *
 * Why this is safe in production does NOT depend on whether Next.js passes a
 * second argument — it does pass a route context (`{ params }`) to every
 * handler, dynamic segments or not. It is safe because that context object
 * carries no `generate` property, so `testOnly?.generate` is undefined for
 * every real request and generateStandardDraftDocument falls back to its real
 * implementation exactly as before. An HTTP request cannot supply a function,
 * so there is no way to reach the seam from outside the process. `params` is
 * carried along (never read) only so this stays structurally compatible with
 * the `{ params: Promise<{}> }` shape Next's generated route-type validator
 * expects.
 */
export async function POST(request: NextRequest, testOnly?: { params?: Promise<Record<string, never>>; generate?: SopStandardDraftGenerate }) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;

    if (actor.role !== 'hr') {
        return NextResponse.json({ error: '대표 표준안 초안 생성은 HR 역할만 요청할 수 있습니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = SopStandardDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: '요청 형식이 유효하지 않습니다. taskId와 sourceRecordIds(1개 이상)가 필요합니다.' }, { status: 400 });
    }

    const sourceRecords: SopRecord[] = [];
    for (const id of parsed.data.sourceRecordIds) {
        const record = await sopRepository.getById(id);
        if (!record || record.lifecycleStatus !== 'approved' || record.taskId !== parsed.data.taskId) {
            return NextResponse.json({ error: `선택한 source record 중 승인 완료 상태이고 동일 Task(${parsed.data.taskId})에 속하지 않는 항목이 있습니다 (id: ${id}).` }, { status: 400 });
        }
        if (documentContainsAuthorIdentifiers(record.document, record.document.member)) {
            return NextResponse.json({ error: `선택한 source record 중 개인정보 제거 검증을 통과하지 못한 항목이 있어 초안을 생성할 수 없습니다 (id: ${id}).` }, { status: 400 });
        }
        sourceRecords.push(record);
    }

    const jobAndTask = findJobForTask(parsed.data.taskId);
    if (!jobAndTask) {
        return NextResponse.json({ error: `Task Library에서 taskId(${parsed.data.taskId})를 찾을 수 없습니다.` }, { status: 400 });
    }
    const workLibrary = createWorkLibrarySelection(jobAndTask.job, jobAndTask.task);

    const sources = sourceRecords.map(sanitizeStandardDraftSource);
    const runResult = await generateStandardDraftDocument({
        id: `sop-standard-draft-${randomUUID()}`,
        taskName: jobAndTask.task.name,
        taskDefinition: jobAndTask.task.description,
        sources,
        workLibrary,
        model: parsed.data.model,
        reasoning: parsed.data.reasoning,
        apiKey: parsed.data.apiKey,
        generate: testOnly?.generate,
    });
    if (!runResult.ok) {
        return NextResponse.json({ error: runResult.error }, { status: 502 });
    }

    return respondValidated(
        SopStandardDraftResponseSchema,
        {
            document: runResult.document,
            sourceRecordIds: parsed.data.sourceRecordIds,
            taskId: parsed.data.taskId,
            generatedAt: new Date().toISOString(),
            qualityReport: runResult.qualityReport,
            standardizationIssues: runResult.standardizationIssues,
        },
        200
    );
}
