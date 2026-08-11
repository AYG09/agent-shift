'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Briefcase, CheckCircle2, Edit3, Layers, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SAMPLE_WORK_LIBRARY } from '@/lib/sop-sample-data';
import { WorkLibraryActivity, WorkLibrarySkill, WorkLibraryTask } from '@/lib/sop-types';

const uniqueSkills = (skills: WorkLibrarySkill[]) =>
    Array.from(new Map(skills.map((skill) => [skill.name.trim().toLowerCase(), skill])).values());

const scopeSkills = (task: WorkLibraryTask, activity: WorkLibraryActivity | undefined, sourceType: 'task' | 'activity') =>
    sourceType === 'task' ? uniqueSkills(task.activities.flatMap((item) => item.skills)) : activity?.skills || [];

export const WorkLibrarySelector: React.FC = () => {
    const { workLibrary, setWorkLibrary, confirmWorkLibrary, reopenWorkLibrary } = useSopPrototypeStore();
    const [isEditingTask, setIsEditingTask] = useState(false);
    const [isEditingActivity, setIsEditingActivity] = useState(false);
    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillDesc, setNewSkillDesc] = useState('');
    const [showAddSkill, setShowAddSkill] = useState(false);

    const fallbackCatalog = useMemo<WorkLibraryTask[]>(
        () => [
            {
                id: workLibrary.taskId || SAMPLE_WORK_LIBRARY.taskId,
                name: workLibrary.taskName || SAMPLE_WORK_LIBRARY.taskName,
                activities: [
                    {
                        id: workLibrary.activityId || SAMPLE_WORK_LIBRARY.activityId || 'activity-1',
                        name: workLibrary.activityName || SAMPLE_WORK_LIBRARY.activityName || '주요 Activity',
                        skills: workLibrary.skills.length ? workLibrary.skills : SAMPLE_WORK_LIBRARY.taskCatalog[0].activities[0].skills,
                    },
                    ...SAMPLE_WORK_LIBRARY.taskCatalog[0].activities.slice(1),
                ],
            },
        ],
        [workLibrary.activityId, workLibrary.activityName, workLibrary.skills, workLibrary.taskId, workLibrary.taskName]
    );
    const taskCatalog = workLibrary.taskCatalog?.length ? workLibrary.taskCatalog : fallbackCatalog;
    const selectedTask = taskCatalog.find((task) => task.id === workLibrary.taskId) || taskCatalog[0];
    const selectedActivity = selectedTask.activities.find((activity) => activity.id === workLibrary.activityId) || selectedTask.activities[0];

    useEffect(() => {
        if (!workLibrary.taskCatalog?.length) {
            setWorkLibrary({
                taskCatalog: fallbackCatalog,
                taskId: selectedTask.id,
                taskName: selectedTask.name,
                activityId: selectedActivity.id,
                activityName: selectedActivity.name,
                skills: scopeSkills(selectedTask, selectedActivity, workLibrary.sourceType),
            });
        }
    }, [fallbackCatalog, selectedActivity, selectedTask, setWorkLibrary, workLibrary.sourceType, workLibrary.taskCatalog]);

    const commitCatalog = (catalog: WorkLibraryTask[], taskId = selectedTask.id, activityId = selectedActivity.id) => {
        const nextTask = catalog.find((task) => task.id === taskId) || catalog[0];
        const nextActivity = nextTask.activities.find((activity) => activity.id === activityId) || nextTask.activities[0];
        setWorkLibrary({
            taskCatalog: catalog,
            taskId: nextTask.id,
            taskName: nextTask.name,
            activityId: nextActivity.id,
            activityName: nextActivity.name,
            skills: scopeSkills(nextTask, nextActivity, workLibrary.sourceType),
        });
    };

    const updateSelectedActivity = (update: (activity: WorkLibraryActivity) => WorkLibraryActivity) => {
        commitCatalog(
            taskCatalog.map((task) =>
                task.id === selectedTask.id
                    ? { ...task, activities: task.activities.map((activity) => (activity.id === selectedActivity.id ? update(activity) : activity)) }
                    : task
            )
        );
    };

    const setScope = (sourceType: 'task' | 'activity') =>
        setWorkLibrary({ sourceType, skills: scopeSkills(selectedTask, selectedActivity, sourceType) });

    const addTask = () => {
        const id = `task-${Date.now()}`;
        const activity: WorkLibraryActivity = { id: `activity-${Date.now()}`, name: '새 주요 Activity', skills: [] };
        commitCatalog([...taskCatalog, { id, name: '새 Task', activities: [activity] }], id, activity.id);
        setIsEditingTask(true);
    };

    const deleteTask = () => {
        if (taskCatalog.length <= 1) return;
        const catalog = taskCatalog.filter((task) => task.id !== selectedTask.id);
        commitCatalog(catalog, catalog[0].id, catalog[0].activities[0].id);
    };

    const addActivity = () => {
        const activity: WorkLibraryActivity = { id: `activity-${Date.now()}`, name: '새 주요 Activity', skills: [] };
        commitCatalog(
            taskCatalog.map((task) => (task.id === selectedTask.id ? { ...task, activities: [...task.activities, activity] } : task)),
            selectedTask.id,
            activity.id
        );
        setIsEditingActivity(true);
    };

    const deleteActivity = () => {
        if (selectedTask.activities.length <= 1) return;
        const activities = selectedTask.activities.filter((activity) => activity.id !== selectedActivity.id);
        commitCatalog(
            taskCatalog.map((task) => (task.id === selectedTask.id ? { ...task, activities } : task)),
            selectedTask.id,
            activities[0].id
        );
    };

    const addSkill = () => {
        if (!newSkillName.trim()) return;
        updateSelectedActivity((activity) => ({
            ...activity,
            skills: [...activity.skills, { id: `skill-${Date.now()}`, name: newSkillName.trim(), description: newSkillDesc.trim() }],
        }));
        setNewSkillName('');
        setNewSkillDesc('');
        setShowAddSkill(false);
    };

    return (
        <div className={`rounded-2xl border p-6 transition-all ${workLibrary.confirmed ? 'border-emerald-200 bg-emerald-50/40 shadow-sm' : 'border-zinc-200/80 bg-white shadow-sm'}`}>
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${workLibrary.confirmed ? 'bg-emerald-500' : 'bg-indigo-600'}`}><Layers className="h-5 w-5" /></div>
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                            2. Work Library Data 검토 및 확정
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${workLibrary.confirmed ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-amber-200 bg-amber-100 text-amber-800'}`}>
                                {workLibrary.confirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                                {workLibrary.confirmed ? '확정됨' : '검토 및 확정 필요'}
                            </span>
                        </h2>
                        <p className="mt-0.5 text-xs text-zinc-500">Task를 구성하는 복수의 주요 Activity와 Activity별 유관 SKILL을 직접 수정하고, SOP 생성 범위를 선택합니다.</p>
                    </div>
                </div>
                <button type="button" onClick={workLibrary.confirmed ? reopenWorkLibrary : confirmWorkLibrary} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm ${workLibrary.confirmed ? 'border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                    <CheckCircle2 className="h-4 w-4" /> {workLibrary.confirmed ? '검토 다시 열기' : '검토 완료 · 확정'}
                </button>
            </div>

            <div className="mb-5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700"><Sparkles className="h-4 w-4 text-indigo-600" /> SOP 생성 기준 단위</span>
                    <div className="inline-flex rounded-lg bg-zinc-200/80 p-1">
                        <button type="button" onClick={() => setScope('task')} className={`rounded-md px-4 py-1.5 text-xs font-semibold ${workLibrary.sourceType === 'task' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>Task 전체</button>
                        <button type="button" onClick={() => setScope('activity')} className={`rounded-md px-4 py-1.5 text-xs font-semibold ${workLibrary.sourceType === 'activity' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>선택 Activity</button>
                    </div>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{workLibrary.sourceType === 'task' ? '선택한 Task의 모든 Activity와 유관 SKILL을 반영해 End-to-End SOP를 생성합니다.' : '선택한 Activity와 해당 SKILL만 반영해 상세 SOP를 생성합니다.'}</p>
            </div>

            <div className="mb-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
                <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs font-semibold uppercase text-zinc-500"><Briefcase className="h-3.5 w-3.5 text-indigo-500" /> Task</span>
                    <div className="flex gap-2 text-xs">
                        <button type="button" onClick={addTask} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700"><Plus className="h-3.5 w-3.5" /> Task 추가</button>
                        <button type="button" onClick={deleteTask} disabled={taskCatalog.length <= 1} className="text-rose-500 disabled:text-zinc-300">삭제</button>
                    </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={selectedTask.id} onChange={(event) => { const task = taskCatalog.find((item) => item.id === event.target.value)!; commitCatalog(taskCatalog, task.id, task.activities[0].id); }} className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900">
                        {taskCatalog.map((task) => <option key={task.id} value={task.id}>{task.name} · {task.activities.length}개 Activity</option>)}
                    </select>
                    <button type="button" onClick={() => setIsEditingTask((value) => !value)} className="flex items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-600 hover:text-indigo-600"><Edit3 className="h-3.5 w-3.5" /> {isEditingTask ? '완료' : '수정'}</button>
                </div>
                {isEditingTask && <input value={selectedTask.name} onChange={(event) => commitCatalog(taskCatalog.map((task) => task.id === selectedTask.id ? { ...task, name: event.target.value } : task))} className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900" aria-label="Task 이름" />}
            </div>

            <div className="mb-5">
                <div className="mb-3 flex items-center justify-between">
                    <div><p className="text-xs font-semibold uppercase tracking-wider text-zinc-700">주요 Activity ({selectedTask.activities.length})</p><p className="mt-0.5 text-xs text-zinc-500">Task는 통상 4~5개의 주요 Activity로 관리합니다. 카드를 선택해 내용과 SKILL을 수정하세요.</p></div>
                    <button type="button" onClick={addActivity} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"><Plus className="h-3.5 w-3.5" /> Activity 추가</button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedTask.activities.map((activity, index) => <button key={activity.id} type="button" onClick={() => commitCatalog(taskCatalog, selectedTask.id, activity.id)} className={`rounded-xl border p-3 text-left transition-all ${activity.id === selectedActivity.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}><span className="text-[10px] font-bold text-indigo-600">ACTIVITY {String(index + 1).padStart(2, '0')}</span><p className="mt-1 text-sm font-semibold text-zinc-900">{activity.name}</p><p className="mt-1 text-[11px] text-zinc-500">유관 SKILL {activity.skills.length}개</p></button>)}
                </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
                <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-1 text-xs font-semibold uppercase text-zinc-500"><Layers className="h-3.5 w-3.5 text-emerald-500" /> 선택한 Activity</span><div className="flex gap-2"><button type="button" onClick={() => setIsEditingActivity((value) => !value)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-indigo-600"><Edit3 className="h-3 w-3" /> {isEditingActivity ? '완료' : '수정'}</button><button type="button" onClick={deleteActivity} disabled={selectedTask.activities.length <= 1} className="text-xs text-rose-500 disabled:text-zinc-300"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
                {isEditingActivity ? <><input value={selectedActivity.name} onChange={(event) => updateSelectedActivity((activity) => ({ ...activity, name: event.target.value }))} className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900" aria-label="Activity 이름" /><textarea value={selectedActivity.description || ''} onChange={(event) => updateSelectedActivity((activity) => ({ ...activity, description: event.target.value }))} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700" rows={2} aria-label="Activity 설명" /></> : <><p className="text-sm font-semibold text-zinc-900">{selectedActivity.name}</p><p className="mt-1 text-xs text-zinc-500">{selectedActivity.description || 'Activity 설명을 입력하세요.'}</p></>}

                <div className="mt-4 border-t border-zinc-200 pt-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-700">이 Activity의 유관 SKILL ({selectedActivity.skills.length})</p><button type="button" onClick={() => setShowAddSkill(true)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"><Plus className="h-3.5 w-3.5" /> SKILL 추가</button></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{selectedActivity.skills.map((skill) => <div key={skill.id} className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2.5"><div className="min-w-0 flex-1"><input value={skill.name} onChange={(event) => updateSelectedActivity((activity) => ({ ...activity, skills: activity.skills.map((item) => item.id === skill.id ? { ...item, name: event.target.value } : item) }))} className="w-full border-b border-transparent bg-transparent text-xs font-semibold text-zinc-900 hover:border-zinc-300 focus:border-indigo-500 focus:outline-none" /><input value={skill.description || ''} onChange={(event) => updateSelectedActivity((activity) => ({ ...activity, skills: activity.skills.map((item) => item.id === skill.id ? { ...item, description: event.target.value } : item) }))} placeholder="SKILL 설명" className="mt-1 w-full border-b border-transparent bg-transparent text-[11px] text-zinc-500 hover:border-zinc-300 focus:border-indigo-500 focus:outline-none" /></div><button type="button" onClick={() => updateSelectedActivity((activity) => ({ ...activity, skills: activity.skills.filter((item) => item.id !== skill.id) }))} className="self-start p-1 text-zinc-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
                {showAddSkill && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 sm:flex-row"><input value={newSkillName} onChange={(event) => setNewSkillName(event.target.value)} placeholder="SKILL 이름" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900" /><input value={newSkillDesc} onChange={(event) => setNewSkillDesc(event.target.value)} placeholder="SKILL 설명 (선택)" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900" /><button type="button" onClick={addSkill} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">추가</button><button type="button" onClick={() => setShowAddSkill(false)} className="px-2 py-1.5 text-xs text-zinc-600">취소</button></div>}</div>
            </div>
        </div>
    );
};
