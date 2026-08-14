'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Layers, Search, Trash2 } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { formatActivityCode } from '@/lib/sop-format';
import { CUSTOMER_WORK_LIBRARY } from '@/lib/sop-sample-data';
import { getScopedSkills } from '@/lib/sop-task-library';
import type { WorkLibraryActivity, WorkLibrarySelection, WorkLibrarySkill, WorkLibraryTask } from '@/lib/sop-types';

const ordered = (activities: WorkLibraryActivity[]) => [...activities].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
const renumber = (activities: WorkLibraryActivity[]) => ordered(activities).map((activity, index) => ({ ...activity, order: index + 1 }));

export function WorkLibrarySelector() {
    const { workLibrary, setWorkLibrary: updateWorkLibrary, confirmWorkLibrary, reopenWorkLibrary } = useSopPrototypeStore();
    const [taskSearch, setTaskSearch] = useState('');
    const [selectedActivityId, setSelectedActivityId] = useState(workLibrary.activityId);
    const taskCatalog = workLibrary.taskCatalog.length ? workLibrary.taskCatalog : CUSTOMER_WORK_LIBRARY.taskCatalog;
    const selectedTask = taskCatalog.find((task) => task.id === workLibrary.taskId) ?? taskCatalog[0];
    const activities = ordered(selectedTask.activities);
    const selectedActivity = activities.find((activity) => activity.id === selectedActivityId) ?? activities.find((activity) => activity.id === workLibrary.activityId) ?? activities[0];
    const visibleTasks = useMemo(() => taskCatalog.filter((task) => task.name.toLowerCase().includes(taskSearch.trim().toLowerCase())), [taskCatalog, taskSearch]);

    const setWorkLibrary = (patch: Partial<WorkLibrarySelection>) => updateWorkLibrary(patch);

    // 구성원 Task 기반 생성 경로는 항상 Task 전체를 대상으로 한다 — sourceType은 여기서
    // 항상 'task'로 고정한다. getScopedSkills가 'task' 범위를 기준으로 SKILL을 계산하므로
    // (Activity 범위였던 과거 세션 상태가 남아있더라도) 이 화면에서 편집을 시작하는 순간
    // Task 전체 기준으로 정규화된다.
    const commit = (catalog: WorkLibraryTask[], taskId = selectedTask.id, activityId = selectedActivity?.id) => {
        const task = catalog.find((item) => item.id === taskId) ?? catalog[0];
        const activity = ordered(task.activities).find((item) => item.id === activityId) ?? ordered(task.activities)[0];
        const base: WorkLibrarySelection = {
            ...workLibrary,
            sourceType: 'task',
            taskCatalog: catalog.map((item) => ({ ...item, activities: renumber(item.activities) })),
            taskId: task.id,
            taskName: task.name,
            activityId: activity?.id,
            activityName: activity?.name,
        };
        setSelectedActivityId(activity?.id);
        setWorkLibrary({ ...base, skills: getScopedSkills(base) });
    };

    const updateTask = (patch: Partial<WorkLibraryTask>) => commit(taskCatalog.map((task) => task.id === selectedTask.id ? { ...task, ...patch } : task));
    const updateActivity = (patch: Partial<WorkLibraryActivity>) => commit(taskCatalog.map((task) => task.id === selectedTask.id ? { ...task, activities: task.activities.map((activity) => activity.id === selectedActivity.id ? { ...activity, ...patch } : activity) } : task));
    const updateSkills = (skills: WorkLibrarySkill[]) => updateActivity({ skills });

    const selectTask = (taskId: string) => {
        const task = taskCatalog.find((item) => item.id === taskId);
        if (task) commit(taskCatalog, task.id, ordered(task.activities)[0]?.id);
    };
    const addTask = () => {
        const id = `member-task-${Date.now()}`;
        const activity: WorkLibraryActivity = { id: `member-activity-${Date.now()}`, order: 1, name: '새 Activity', description: '', skills: [] };
        commit([...taskCatalog, { id, name: '새 Task', description: '', activities: [activity] }], id, activity.id);
    };
    const removeTask = () => {
        if (taskCatalog.length <= 1) return;
        const next = taskCatalog.filter((task) => task.id !== selectedTask.id);
        commit(next, next[0].id, ordered(next[0].activities)[0]?.id);
    };
    const addActivity = () => {
        const activity: WorkLibraryActivity = { id: `member-activity-${Date.now()}`, order: activities.length + 1, name: '새 Activity', description: '', skills: [] };
        commit(taskCatalog.map((task) => task.id === selectedTask.id ? { ...task, activities: [...task.activities, activity] } : task), selectedTask.id, activity.id);
    };
    const removeActivity = () => {
        if (activities.length <= 1) return;
        const nextActivities = selectedTask.activities.filter((activity) => activity.id !== selectedActivity.id);
        commit(taskCatalog.map((task) => task.id === selectedTask.id ? { ...task, activities: nextActivities } : task), selectedTask.id, ordered(nextActivities)[0]?.id);
    };
    const moveActivity = (direction: -1 | 1) => {
        const index = activities.findIndex((activity) => activity.id === selectedActivity.id);
        const destination = index + direction;
        if (destination < 0 || destination >= activities.length) return;
        const next = [...activities];
        [next[index], next[destination]] = [next[destination], next[index]];
        commit(taskCatalog.map((task) => task.id === selectedTask.id ? { ...task, activities: renumber(next) } : task), selectedTask.id, selectedActivity.id);
    };
    const addSkill = () => updateSkills([...selectedActivity.skills, { id: `member-skill-${Date.now()}`, name: '새 SKILL', description: '' }]);

    // 검토가 확정된 라이브러리는 3단 편집기 대신 읽기 전용 요약으로 접힌다 —
    // "확정"의 의미(검토 끝)와 화면 밀도를 일치시킨다. "검토 다시 열기"를 누르는
    // 순간 기존 편집기가 그대로 복원된다. 데이터는 어느 쪽에서도 변형되지 않는다.
    if (workLibrary.confirmed) {
        const totalSkillCount = activities.reduce((sum, activity) => sum + activity.skills.length, 0);
        return <section className="rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white"><Layers className="h-5 w-5" /></div><div><h2 className="text-base font-bold text-zinc-900">2. Task Library 검토 및 확정</h2><p className="mt-0.5 text-xs text-emerald-700 font-semibold">검토 확정됨 — 편집기가 접혀 있습니다. 수정하려면 &quot;검토 다시 열기&quot;를 누르세요.</p></div></div>
                <button type="button" onClick={reopenWorkLibrary} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />검토 다시 열기</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="text-xs text-zinc-700"><strong>{workLibrary.jobName || 'Job 미지정'}</strong> · <strong className="text-zinc-900">{selectedTask.name}</strong> · Activity {activities.length}개 · SKILL {totalSkillCount}개</p>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">Task 전체 생성</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {activities.map((activity) => (
                    <span key={activity.id} className="inline-flex max-w-56 items-center gap-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700" title={activity.description || activity.name}>
                        <strong className="text-indigo-600">{formatActivityCode(activity.order)}</strong>
                        <span className="truncate">{activity.name}</span>
                    </span>
                ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">Task 전체 생성: {activities.length}개 Activity를 순서대로 반영하며, Activity마다 1개 이상의 Sub Action으로 SOP가 생성됩니다.</p>
        </section>;
    }

    return <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3">
            <div className="flex gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white"><Layers className="h-5 w-5" /></div><div><h2 className="text-base font-bold text-zinc-900">2. Task Library 검토 및 확정</h2><p className="mt-0.5 text-xs text-zinc-600">Job › Task › 순서가 있는 Activity › Activity별 SKILL을 직접 검토·편집합니다.</p></div></div>
            <button type="button" onClick={confirmWorkLibrary} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-4 w-4" />검토 완료 · 확정</button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-700"><strong>{workLibrary.jobName || 'Job 미지정'}</strong>{workLibrary.sourceJobId ? ` · ${workLibrary.sourceJobId}` : ''}</p>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-200">Task 전체 생성</span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,.78fr)_minmax(0,1.22fr)]">
            <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-zinc-700">Task ({taskSearch.trim() ? `검색 결과 ${visibleTasks.length} / 전체 ${taskCatalog.length}` : taskCatalog.length})</p><div className="flex gap-2"><button type="button" onClick={addTask} className="text-xs font-semibold text-indigo-600">+ Task</button><button type="button" onClick={removeTask} disabled={taskCatalog.length <= 1} className="text-xs text-rose-600 disabled:opacity-40">삭제</button></div></div>
                <label className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"><Search className="h-3.5 w-3.5 text-zinc-400"/><input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Task 검색" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
                <div className="mt-2 max-h-[270px] space-y-1 overflow-y-auto pr-1">{visibleTasks.map((task) => <button key={task.id} type="button" onClick={() => selectTask(task.id)} className={`w-full rounded-lg border px-3 py-2 text-left ${task.id === selectedTask.id ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:bg-white'}`}><p className="truncate text-sm font-semibold text-zinc-900">{task.name}</p><p className="mt-0.5 text-[11px] text-zinc-500">{task.activities.length}개 Activity</p></button>)}</div>
            </aside>
            <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"><div><label className="text-[11px] font-bold text-zinc-500">TASK 명</label><input value={selectedTask.name} onChange={(event) => updateTask({ name: event.target.value })} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold" /><label className="mt-2 block text-[11px] font-bold text-zinc-500">TASK 정의</label><textarea value={selectedTask.description || ''} onChange={(event) => updateTask({ description: event.target.value })} rows={2} className="mt-1 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-xs" /></div><div className="flex items-end gap-1"><button type="button" onClick={addActivity} className="rounded-lg border border-indigo-200 px-2 py-2 text-xs font-semibold text-indigo-600">+ Activity</button><button type="button" onClick={removeActivity} disabled={activities.length <= 1} className="rounded-lg border border-rose-200 px-2 py-2 text-xs text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/></button></div></div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(210px,.74fr)_minmax(0,1.26fr)]">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2"><p className="mb-2 text-xs font-bold text-zinc-700">Activity 목록 · {activities.length}개</p><div className="max-h-[310px] space-y-1 overflow-y-auto pr-1">{activities.map((activity) => <button key={activity.id} type="button" onClick={() => { setSelectedActivityId(activity.id); setWorkLibrary({ activityId: activity.id, activityName: activity.name, skills: getScopedSkills({ ...workLibrary, sourceType: 'task' }) }); }} className={`w-full rounded-lg border px-2.5 py-2 text-left ${activity.id === selectedActivity.id ? 'border-indigo-400 bg-white shadow-sm' : 'border-transparent'}`}><span className="text-[10px] font-bold text-indigo-600">{formatActivityCode(activity.order)}</span><p className="mt-0.5 truncate text-xs font-semibold text-zinc-900">{activity.name}</p><p className="mt-0.5 text-[10px] text-zinc-500">SKILL {activity.skills.length}개</p></button>)}</div></div>
                    <div className="max-h-[350px] overflow-y-auto pr-1"><div className="flex items-center justify-between"><p className="text-xs font-bold text-zinc-700">선택 Activity 상세</p><div className="flex gap-1"><button type="button" onClick={() => moveActivity(-1)} title="위로" className="rounded border p-1 text-zinc-600"><ArrowUp className="h-3.5 w-3.5"/></button><button type="button" onClick={() => moveActivity(1)} title="아래로" className="rounded border p-1 text-zinc-600"><ArrowDown className="h-3.5 w-3.5"/></button></div></div><div className="mt-2 grid grid-cols-[78px_1fr] gap-2"><label className="text-xs font-semibold text-zinc-600">순서<input type="number" min={1} value={selectedActivity.order ?? 1} onChange={(event) => updateActivity({ order: Number(event.target.value) || 1 })} className="mt-1 w-full rounded border px-2 py-1.5 text-xs" /></label><label className="text-xs font-semibold text-zinc-600">Activity 명<input value={selectedActivity.name} onChange={(event) => updateActivity({ name: event.target.value })} className="mt-1 w-full rounded border px-2 py-1.5 text-xs" /></label></div><label className="mt-2 block text-xs font-semibold text-zinc-600">Activity 설명<textarea value={selectedActivity.description || ''} onChange={(event) => updateActivity({ description: event.target.value })} rows={2} className="mt-1 w-full resize-none rounded border px-2 py-1.5 text-xs" /></label><div className="mt-3 border-t pt-3"><div className="flex items-center justify-between"><p className="text-xs font-bold text-zinc-700">유관 SKILL · {selectedActivity.skills.length}개</p><button type="button" onClick={addSkill} className="text-xs font-semibold text-indigo-600">+ SKILL</button></div><div className="mt-2 space-y-2">{selectedActivity.skills.map((skill) => <div key={skill.id} className="grid grid-cols-[minmax(0,1fr)_26px] gap-2 rounded-lg border border-zinc-200 p-2"><div><input value={skill.name} onChange={(event) => updateSkills(selectedActivity.skills.map((item) => item.id === skill.id ? { ...item, name: event.target.value } : item))} className="w-full border-b border-zinc-200 py-1 text-xs font-semibold outline-none focus:border-indigo-500" /><textarea value={skill.description || ''} onChange={(event) => updateSkills(selectedActivity.skills.map((item) => item.id === skill.id ? { ...item, description: event.target.value } : item))} rows={2} placeholder="SKILL 설명" className="mt-1 w-full resize-none text-[11px] text-zinc-600 outline-none" /></div><button type="button" onClick={() => updateSkills(selectedActivity.skills.filter((item) => item.id !== skill.id))} className="self-start p-1 text-zinc-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div></div></div>
                </div>
            </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Task 전체 생성: {activities.length}개 Activity를 순서대로 반영하며, Activity마다 1개 이상의 Sub Action으로 SOP가 생성됩니다.</p>
    </section>;
}
