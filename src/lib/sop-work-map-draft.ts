/**
 * Work Map 초안 — 구성원이 확정한 Task를 자신의 업무에 맞게 편집하는 member-owned
 * 스냅샷과, 간소화/상세 두 화면이 **함께 쓰는** selector·mutation·validation.
 *
 * 왜 별도 모듈인가: 재설계 요구는 같은 데이터를 밀도가 다른 두 페이지
 * (`/sop/work-map/simple`, `/sop/work-map/detailed`)로 보여주는 것이다. 두 페이지가
 * 각자 상태와 mutation을 만들면 "간소화에서 고친 값이 상세에 없다"는 종류의 결함이
 * 구조적으로 발생한다. 그래서 두 화면은 화면 코드가 아니라 이 모듈의 함수만
 * 호출하고, 밀도 차이는 projection(selector)으로만 표현한다 (REQ-WM-004~006).
 *
 * 불변식:
 * - Task Library 원본(fixture/카탈로그)은 읽기 전용이다. 확정 시 deep clone 하며,
 *   어떤 mutation도 원본 객체를 공유·변형하지 않는다 (INT-WM-001, INT-WM-002).
 * - 모든 mutation은 `confirmed`를 해제한다 (INT-WM-003).
 * - Activity–Skill 관계는 Activity 안에 남는다. 평탄한 Skill 목록은 파생 selector일
 *   뿐 두 번째 mutable 원본이 아니다.
 * - Skill 개수를 5개로 강제하지 않는다. 5는 샘플 데이터의 사실이지 편집 규칙이 아니다.
 * - 새로 만든 항목의 ID는 draft 안에서 결정론적으로 발급한다. 타임스탬프를 식별자로
 *   쓰지 않는다.
 * - 복제 경로(`origin: colleague-template | own-prior`)는 복제 대상 문서의
 *   `workLibrary.taskCatalog` 스냅샷을 절대 변형하지 않는다. 선택 Task를 그 스냅샷에서
 *   찾지 못하면 추측해서 만들지 않고 `null`을 돌려준다 (`createWorkMapDraftFromDocument`).
 */
import type { SopDocument, WorkLibraryActivity, WorkLibrarySelection, WorkLibrarySkill, WorkLibraryTask } from './sop-types';
import type { SopTaskLibraryJob } from './sop-task-library';
import { getScopedSkills, getTaskLibraryTask } from './sop-task-library';

/** Work Map 초안을 만든 방법. simple/detailed 두 화면 모두 이 값을 그대로 읽기만 한다. */
export type MemberWorkMapDraftOrigin = 'task-recommendation' | 'colleague-template' | 'own-prior';

export interface MemberWorkMapDraft {
    /** 복제 출처 Task ID. 편집으로 task.id가 바뀌지 않으므로 provenance로 남는다. */
    sourceTaskId: string;
    jobId?: string;
    sourceJobId?: string;
    jobName?: string;
    /** 구성원 소유 편집본. 카탈로그 객체와 참조를 공유하지 않는다. */
    task: WorkLibraryTask;
    /** 이 초안을 만든 시점의 확정 업무맥락 원문 (provenance). */
    contextText: string;
    confirmed: boolean;
    createdAt: string;
    /**
     * 이 초안이 어떻게 만들어졌는지 (`INT-CLONE-001`). Optional인 이유는
     * `structureVersion`과 같은 규칙 때문이다 — 이 필드가 생기기 전에 persist된 초안에는
     * 이 키 자체가 없다. 마이그레이션이 소급해서 채우지 않으므로, 읽을 때는 항상
     * `origin` 리터럴을 직접 보지 말고 `selectWorkMapDraftOrigin`을 거친다.
     */
    origin?: MemberWorkMapDraftOrigin;
}

/** `origin` 없는 legacy 초안은 `'task-recommendation'`으로 본다 (위 필드 docstring 참고). */
export function selectWorkMapDraftOrigin(draft: MemberWorkMapDraft): MemberWorkMapDraftOrigin {
    return draft.origin ?? 'task-recommendation';
}

/**
 * 카탈로그의 `order` 값으로 정렬한 뒤 1..n으로 다시 매긴다. **복제 시점에만** 쓴다 —
 * 원본이 배열 순서와 order 값 중 무엇을 진짜 순서로 갖고 있든 여기서 한 번 합의한다.
 */
function withSourceOrder(activities: WorkLibraryActivity[]): WorkLibraryActivity[] {
    return [...activities]
        .map((activity, index) => ({ activity, order: activity.order ?? index + 1, index }))
        .sort((left, right) => left.order - right.order || left.index - right.index)
        .map(({ activity }, index) => ({ ...activity, order: index + 1 }));
}

/**
 * 배열 위치를 순서의 원본으로 삼아 order를 다시 매긴다. **복제 이후 모든 mutation**이
 * 쓴다 — 순서 변경 후 다시 order 값으로 정렬하면 방금 한 이동이 되돌려지기 때문이다.
 * 복제 시점에 한 번 합의했으므로 그 뒤로는 배열 위치가 유일한 순서 원본이다.
 */
function withReindexedOrder(activities: WorkLibraryActivity[]): WorkLibraryActivity[] {
    return activities.map((activity, index) => ({ ...activity, order: index + 1 }));
}

/**
 * Task를 값 단위로 완전 복제한다. 얕은 복사는 Activity·Skill 배열을 카탈로그와
 * 공유하게 만들어, 구성원의 편집이 fixture를 오염시킨다 (TST-WM-007).
 */
export function cloneWorkLibraryTask(task: WorkLibraryTask): WorkLibraryTask {
    return {
        ...task,
        activities: withSourceOrder(task.activities).map((activity) => ({
            ...activity,
            skills: activity.skills.map((skill) => ({ ...skill })),
        })),
    };
}

/**
 * 읽기 전용 후보 catalog에서 member-owned Work Map 초안을 만든다. 추천 성공이
 * 아니라 **구성원의 명시적 Task 확정**만 이 함수를 호출해야 한다 (REQ-REC-004).
 */
export function createWorkMapDraftFromCatalog(params: {
    job?: Pick<SopTaskLibraryJob, 'id' | 'sourceJobId' | 'name'>;
    task: WorkLibraryTask;
    contextText: string;
    now: string;
}): MemberWorkMapDraft {
    return {
        sourceTaskId: params.task.id,
        jobId: params.job?.id,
        sourceJobId: params.job?.sourceJobId,
        jobName: params.job?.name,
        task: cloneWorkLibraryTask(params.task),
        contextText: params.contextText,
        confirmed: false,
        createdAt: params.now,
        origin: 'task-recommendation',
    };
}

/**
 * 동료 SOP·과거 작성 복제 전용 초안 생성 (`INT-CLONE-001`). 카탈로그가 아니라 이미
 * 저장된 `SopDocument`의 `workLibrary` 스냅샷에서 선택 Task를 찾아 deep clone한다 —
 * 복제 시점의 Task Library 원본이 그 사이 바뀌었더라도 문서가 실제로 생성될 때 쓰인
 * Task/Activity/Skill 그대로를 보존해야 하기 때문이다. 문서 스냅샷에서 Task를 찾을 수
 * 없으면(예: 손상되거나 예상 밖의 스냅샷) 추측해서 만들지 않고 `null`을 돌려준다.
 */
export function createWorkMapDraftFromDocument(params: {
    document: Pick<SopDocument, 'workLibrary' | 'context'>;
    origin: Exclude<MemberWorkMapDraftOrigin, 'task-recommendation'>;
    now: string;
}): MemberWorkMapDraft | null {
    const { workLibrary } = params.document;
    const task = getTaskLibraryTask(workLibrary);
    if (!task) return null;
    return {
        sourceTaskId: task.id,
        jobId: workLibrary.jobId,
        sourceJobId: workLibrary.sourceJobId,
        jobName: workLibrary.jobName,
        task: cloneWorkLibraryTask(task),
        contextText: params.document.context,
        confirmed: false,
        createdAt: params.now,
        origin: params.origin,
    };
}

/** 모든 mutation의 공통 후처리: 순서 정규화 + confirmation 해제 (INT-WM-003). */
function withMutatedTask(draft: MemberWorkMapDraft, task: WorkLibraryTask): MemberWorkMapDraft {
    return {
        ...draft,
        task: { ...task, activities: withReindexedOrder(task.activities) },
        confirmed: false,
    };
}

/**
 * draft 안에서 충돌하지 않는 ID를 발급한다. 접두사별로 이미 쓰인 최대 번호 다음을
 * 쓰므로, 같은 draft를 같은 순서로 편집하면 항상 같은 ID가 나온다(결정론적).
 * imported ID는 손대지 않는다.
 */
function nextLocalId(prefix: string, existing: string[]): string {
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    const maxIndex = existing.reduce((max, id) => {
        const matched = pattern.exec(id);
        return matched ? Math.max(max, Number(matched[1])) : max;
    }, 0);
    return `${prefix}-${maxIndex + 1}`;
}

/** 편집 순서 그대로의 Activity 목록. 배열 위치가 순서의 원본이다(위 withReindexedOrder 참고). */
export function selectWorkMapActivities(draft: MemberWorkMapDraft): WorkLibraryActivity[] {
    return [...draft.task.activities];
}

export function selectWorkMapActivity(draft: MemberWorkMapDraft, activityId: string): WorkLibraryActivity | undefined {
    return draft.task.activities.find((activity) => activity.id === activityId);
}

/** Activity–Skill 관계 수. 같은 Skill 이름이 여러 Activity에 반복돼도 각각 센다. */
export function selectWorkMapRelationCount(draft: MemberWorkMapDraft): number {
    return draft.task.activities.reduce((total, activity) => total + activity.skills.length, 0);
}

export interface SimpleWorkMapRow {
    activityId: string;
    order: number;
    name: string;
    /** 원문을 바꾸지 않은 한 줄 요약. 실제 줄임 표시는 CSS가 담당한다. */
    oneLineDescription: string;
    /** 전체 원문 — title 속성이나 편집 drawer가 사용한다. */
    description: string;
    skillNames: string[];
    skillCount: number;
}

/**
 * 간소화 projection. 존재하지 않는 `shortDefinition` 필드를 만들지 않고 기존
 * `description` 원문을 한 줄로 접어 보여준다 (CONTEXT.md §6.4).
 */
export function selectSimpleWorkMapRows(draft: MemberWorkMapDraft): SimpleWorkMapRow[] {
    return selectWorkMapActivities(draft).map((activity) => ({
        activityId: activity.id,
        order: activity.order ?? 0,
        name: activity.name,
        oneLineDescription: (activity.description ?? '').replace(/\s+/g, ' ').trim(),
        description: activity.description ?? '',
        skillNames: activity.skills.map((skill) => skill.name),
        skillCount: activity.skills.length,
    }));
}

export interface DetailedWorkMapActivityView {
    activity: WorkLibraryActivity;
    order: number;
    /** master 목록에서의 위치 — 삭제 후 다음 선택 대상을 정할 때 쓴다. */
    index: number;
    skills: WorkLibrarySkill[];
}

/** 상세 projection. 같은 draft를 읽으므로 simple과 ID 집합이 항상 동일하다 (TST-WM-002). */
export function selectDetailedWorkMapActivity(draft: MemberWorkMapDraft, activityId: string): DetailedWorkMapActivityView | undefined {
    const activities = selectWorkMapActivities(draft);
    const index = activities.findIndex((activity) => activity.id === activityId);
    if (index < 0) return undefined;
    const activity = activities[index];
    return { activity, order: activity.order ?? index + 1, index, skills: activity.skills };
}

export function updateWorkMapTask(draft: MemberWorkMapDraft, patch: { name?: string; description?: string }): MemberWorkMapDraft {
    return withMutatedTask(draft, { ...draft.task, ...patch });
}

export function updateWorkMapActivity(
    draft: MemberWorkMapDraft,
    activityId: string,
    patch: { name?: string; description?: string }
): MemberWorkMapDraft {
    return withMutatedTask(draft, {
        ...draft.task,
        activities: draft.task.activities.map((activity) => (activity.id === activityId ? { ...activity, ...patch } : activity)),
    });
}

export interface AddWorkMapActivityResult {
    draft: MemberWorkMapDraft;
    activityId: string;
}

export function addWorkMapActivity(draft: MemberWorkMapDraft, input?: { name?: string; description?: string }): AddWorkMapActivityResult {
    const activityId = nextLocalId('wm-activity', draft.task.activities.map((activity) => activity.id));
    const activity: WorkLibraryActivity = {
        id: activityId,
        order: draft.task.activities.length + 1,
        name: input?.name ?? '',
        description: input?.description ?? '',
        skills: [],
    };
    return {
        draft: withMutatedTask(draft, { ...draft.task, activities: [...draft.task.activities, activity] }),
        activityId,
    };
}

export function deleteWorkMapActivity(draft: MemberWorkMapDraft, activityId: string): MemberWorkMapDraft {
    if (!draft.task.activities.some((activity) => activity.id === activityId)) return draft;
    return withMutatedTask(draft, {
        ...draft.task,
        activities: draft.task.activities.filter((activity) => activity.id !== activityId),
    });
}

/**
 * Activity 순서를 한 칸 이동한다. 화면이 order 숫자를 직접 계산하지 않도록 도메인이
 * 재정규화까지 책임진다.
 */
export function moveWorkMapActivity(draft: MemberWorkMapDraft, activityId: string, direction: 'up' | 'down'): MemberWorkMapDraft {
    const activities = selectWorkMapActivities(draft);
    const index = activities.findIndex((activity) => activity.id === activityId);
    if (index < 0) return draft;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= activities.length) return draft;
    const reordered = [...activities];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return withMutatedTask(draft, { ...draft.task, activities: reordered });
}

export function updateWorkMapSkill(
    draft: MemberWorkMapDraft,
    activityId: string,
    skillId: string,
    patch: { name?: string; description?: string }
): MemberWorkMapDraft {
    return withMutatedTask(draft, {
        ...draft.task,
        activities: draft.task.activities.map((activity) =>
            activity.id === activityId
                ? { ...activity, skills: activity.skills.map((skill) => (skill.id === skillId ? { ...skill, ...patch } : skill)) }
                : activity
        ),
    });
}

export interface AddWorkMapSkillResult {
    draft: MemberWorkMapDraft;
    skillId: string;
}

export function addWorkMapSkill(draft: MemberWorkMapDraft, activityId: string, input?: { name?: string; description?: string }): AddWorkMapSkillResult {
    const usedIds = draft.task.activities.flatMap((activity) => activity.skills.map((skill) => skill.id));
    const skillId = nextLocalId('wm-skill', usedIds);
    return {
        draft: withMutatedTask(draft, {
            ...draft.task,
            activities: draft.task.activities.map((activity) =>
                activity.id === activityId
                    ? { ...activity, skills: [...activity.skills, { id: skillId, name: input?.name ?? '', description: input?.description ?? '' }] }
                    : activity
            ),
        }),
        skillId,
    };
}

export function deleteWorkMapSkill(draft: MemberWorkMapDraft, activityId: string, skillId: string): MemberWorkMapDraft {
    return withMutatedTask(draft, {
        ...draft.task,
        activities: draft.task.activities.map((activity) =>
            activity.id === activityId ? { ...activity, skills: activity.skills.filter((skill) => skill.id !== skillId) } : activity
        ),
    });
}

export type WorkMapValidationField = 'taskName' | 'activities' | 'activityName' | 'skillName';

export interface WorkMapValidationError {
    field: WorkMapValidationField;
    message: string;
    activityId?: string;
    skillId?: string;
}

/**
 * 두 화면이 공유하는 완료 검증 (SPEC §3.5 공통 검증). 오류 배열의 첫 항목이
 * "가장 먼저 고쳐야 할 곳"이므로, 화면은 그 대상으로 focus를 옮기면 된다.
 */
export function validateWorkMapDraft(draft: MemberWorkMapDraft): { ok: boolean; errors: WorkMapValidationError[] } {
    const errors: WorkMapValidationError[] = [];
    if (!draft.task.name.trim()) errors.push({ field: 'taskName', message: 'Task명을 입력하세요.' });

    const activities = selectWorkMapActivities(draft);
    if (activities.length === 0) errors.push({ field: 'activities', message: 'Activity가 최소 1개 필요합니다.' });

    activities.forEach((activity) => {
        if (!activity.name.trim()) {
            errors.push({ field: 'activityName', activityId: activity.id, message: 'Activity명을 입력하세요.' });
        }
        activity.skills.forEach((skill) => {
            if (!skill.name.trim()) {
                errors.push({ field: 'skillName', activityId: activity.id, skillId: skill.id, message: 'Skill명을 입력하세요.' });
            }
        });
    });

    return { ok: errors.length === 0, errors };
}

export type ConfirmWorkMapResult =
    | { ok: true; draft: MemberWorkMapDraft }
    | { ok: false; errors: WorkMapValidationError[] };

export function confirmWorkMapDraft(draft: MemberWorkMapDraft): ConfirmWorkMapResult {
    const validation = validateWorkMapDraft(draft);
    if (!validation.ok) return { ok: false, errors: validation.errors };
    return { ok: true, draft: { ...draft, confirmed: true } };
}

/**
 * 확정 Work Map → 기존 생성 계약이 쓰는 `WorkLibrarySelection`.
 *
 * 새 흐름이 기존 Task-wide 생성(`runSopSetupGeneration`)을 대체하지 않고 **연결**하기
 * 위한 어댑터다. `sourceType`은 언제나 `'task'`다 — 재설계 흐름에는 selected-Activity
 * 생성 경로가 없다. `skills`는 파생 값이므로 여기서 계산해 채운다.
 */
export function toWorkLibrarySelection(draft: MemberWorkMapDraft): WorkLibrarySelection {
    const activities = selectWorkMapActivities(draft);
    const firstActivity = activities[0];
    const base: WorkLibrarySelection = {
        jobId: draft.jobId,
        sourceJobId: draft.sourceJobId,
        jobName: draft.jobName,
        taskId: draft.task.id,
        taskName: draft.task.name,
        activityId: firstActivity?.id,
        activityName: firstActivity?.name,
        taskCatalog: [{ ...draft.task, activities }],
        skills: [],
        sourceType: 'task',
        confirmed: draft.confirmed,
    };
    return { ...base, skills: getScopedSkills(base) };
}
