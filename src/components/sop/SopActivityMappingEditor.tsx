'use client';

import { Link2 } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import type { SopStepData } from '@/lib/sop-types';

export function SopActivityMappingEditor({ step }: { step: SopStepData }) {
    const document = useSopPrototypeStore((state) => state.document);
    const readOnly = useSopPrototypeStore((state) => state.customerReviewMode);
    const setStepSourceActivities = useSopPrototypeStore((state) => state.setStepSourceActivities);
    const setStepSubActionOrder = useSopPrototypeStore((state) => state.setStepSubActionOrder);
    if (!document || step.terminalType) return null;
    const task = document.workLibrary.taskCatalog.find((item) => item.id === document.workLibrary.taskId);
    const activities = [...(task?.activities ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    const selected = new Set(step.sourceActivityIds ?? []);
    const isSubActionStructure = document.structureVersion === 'activity-subaction-v1';

    // 새 구조(Activity–Sub Action)에서는 이 단계가 정확히 하나의 Sub Action이므로
    // 라디오 선택 + 순서 입력으로 표시한다. 과거 문서는 여러 Activity를 함께 반영할 수 있는
    // 기존 체크박스 편집을 그대로 유지한다(하위 호환).
    // 섹션 제목은 인스펙터의 아코디언 헤더(SopInspectorSection)가 담당한다 —
    // 여기서는 규칙 설명과 편집 UI만 렌더링해 제목이 중복되지 않게 한다.
    if (isSubActionStructure) {
        const currentActivityId = step.sourceActivityIds?.[0];
        return <section>
            <p className="flex items-start gap-1.5 text-[11px] text-zinc-500"><Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />이 Sub Action은 정확히 하나의 Activity에만 속합니다. 변경하면 SOP 검토·Agent화 확정이 다시 필요합니다.</p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
                {activities.map((activity) => <label key={activity.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-zinc-50">
                    <input type="radio" name={`sub-action-activity-${step.id}`} disabled={readOnly} checked={currentActivityId === activity.id} onChange={() => setStepSourceActivities(step.id, [activity.id])} className="h-3.5 w-3.5 accent-violet-600" />
                    <span className="font-bold text-violet-700">A{String(activity.order ?? 0).padStart(2, '0')}</span>
                    <span className="truncate text-zinc-700">{activity.name}</span>
                </label>)}
            </div>
            <label className="mt-2 block text-xs font-semibold text-zinc-600">
                Activity 내 Sub Action 순서
                <input
                    type="number"
                    min={1}
                    disabled={readOnly}
                    value={step.subActionOrder ?? ''}
                    onChange={(event) => setStepSubActionOrder(step.id, Number(event.target.value) || 1)}
                    className="mt-1 w-24 rounded border border-zinc-300 px-2 py-1.5 text-xs disabled:bg-zinc-100"
                />
            </label>
        </section>;
    }

    return <section>
        <p className="flex items-start gap-1.5 text-[11px] text-zinc-500"><Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600"/>이 단계가 반영한 원본 Activity를 지정합니다. 변경하면 SOP 검토·Agent화 확정이 다시 필요합니다.</p>
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
            {activities.map((activity) => <label key={activity.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-zinc-50"><input type="checkbox" disabled={readOnly} checked={selected.has(activity.id)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(activity.id); else next.delete(activity.id); setStepSourceActivities(step.id, [...next]); }} className="h-3.5 w-3.5 accent-violet-600"/><span className="font-bold text-violet-700">A{String(activity.order ?? 0).padStart(2, '0')}</span><span className="truncate text-zinc-700">{activity.name}</span></label>)}
        </div>
    </section>;
}
