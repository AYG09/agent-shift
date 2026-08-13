import fixture from '@/data/sop-task-library-sample.json';
import type { WorkLibraryActivity, WorkLibrarySelection, WorkLibrarySkill, WorkLibraryTask } from './sop-types';

export interface SopTaskLibraryJob {
    id: string;
    sourceJobId: string;
    name: string;
    tasks: WorkLibraryTask[];
}

export interface SopTaskLibraryFixture {
    jobs: SopTaskLibraryJob[];
}

export const SOP_TASK_LIBRARY_FIXTURE = fixture as SopTaskLibraryFixture;

export function getTaskLibraryJob(jobId: string | undefined): SopTaskLibraryJob | undefined {
    return SOP_TASK_LIBRARY_FIXTURE.jobs.find((job) => job.id === jobId);
}

export function getTaskLibraryJobByRole(role: string | undefined): SopTaskLibraryJob | undefined {
    const normalized = role?.trim().toLowerCase();
    return SOP_TASK_LIBRARY_FIXTURE.jobs.find((job) => job.name.toLowerCase() === normalized)
        ?? SOP_TASK_LIBRARY_FIXTURE.jobs.find((job) => normalized?.includes(job.name.toLowerCase()));
}

export function getTaskLibraryTask(selection: Pick<WorkLibrarySelection, 'taskId' | 'taskCatalog'>): WorkLibraryTask | undefined {
    return selection.taskCatalog.find((task) => task.id === selection.taskId);
}

export function getTaskLibraryActivity(
    selection: Pick<WorkLibrarySelection, 'taskId' | 'activityId' | 'taskCatalog'>
): WorkLibraryActivity | undefined {
    const task = getTaskLibraryTask(selection);
    return task?.activities.find((activity) => activity.id === selection.activityId);
}

export function getScopedActivities(selection: WorkLibrarySelection): WorkLibraryActivity[] {
    const task = getTaskLibraryTask(selection);
    if (!task) return [];
    const ordered = [...task.activities].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    if (selection.sourceType === 'task') return ordered;
    const activity = ordered.find((item) => item.id === selection.activityId);
    return activity ? [activity] : [];
}

/** Derived-only view for generation and UI. It never replaces Activity.skills as source data. */
export function getScopedSkills(selection: WorkLibrarySelection): WorkLibrarySkill[] {
    const activities = getScopedActivities(selection);
    if (selection.sourceType === 'activity') return activities[0]?.skills ?? [];
    const deduplicated = new Map<string, WorkLibrarySkill>();
    activities.flatMap((activity) => activity.skills).forEach((skill) => {
        const key = `${skill.name}\u0000${skill.description ?? ''}`;
        if (!deduplicated.has(key)) deduplicated.set(key, skill);
    });
    return [...deduplicated.values()];
}

/**
 * Normalizes a selection to the Task-wide generation scope — `sourceType` is
 * `WorkLibrarySelection`'s single source of truth for generation scope (see
 * implementation-contract.md §2), so this is the ONLY function that may flip
 * it to `'task'`; no caller should set `sourceType: 'task'` as a separate
 * literal. `activityId`/`activityName` are left untouched — they remain a
 * valid editing focus (e.g. which Activity's detail pane is open) even when
 * the generation scope is Task-wide; only `sourceType` and the derived
 * `skills` (which depend on it) change.
 */
export function withTaskScope(selection: WorkLibrarySelection): WorkLibrarySelection {
    if (selection.sourceType === 'task') return selection;
    const normalized: WorkLibrarySelection = { ...selection, sourceType: 'task' };
    return { ...normalized, skills: getScopedSkills(normalized) };
}

export function createWorkLibrarySelection(job: SopTaskLibraryJob, task: WorkLibraryTask): WorkLibrarySelection {
    const firstActivity = [...task.activities].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))[0];
    const selection: WorkLibrarySelection = {
        jobId: job.id,
        sourceJobId: job.sourceJobId,
        jobName: job.name,
        taskId: task.id,
        taskName: task.name,
        activityId: firstActivity?.id,
        activityName: firstActivity?.name,
        taskCatalog: job.tasks,
        skills: [],
        sourceType: 'task',
        confirmed: false,
    };
    return { ...selection, skills: getScopedSkills(selection) };
}

export function createTaskLibrarySelectionForRole(role?: string): WorkLibrarySelection {
    const job = getTaskLibraryJobByRole(role) ?? SOP_TASK_LIBRARY_FIXTURE.jobs[0];
    const representativeTask = job.tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화') ?? job.tasks[0];
    return createWorkLibrarySelection(job, representativeTask);
}

export function withCatalogActivityOrders(tasks: WorkLibraryTask[]): WorkLibraryTask[] {
    return tasks.map((task) => ({
        ...task,
        activities: task.activities.map((activity, index) => ({ ...activity, order: activity.order ?? index + 1 })),
    }));
}
