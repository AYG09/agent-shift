import { CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { getAgentizationModeForStep, getAgentizationModeMeta, AGENTIZATION_SUGGESTION_META } from '@/lib/sop-agentization';
import { SOP_LIFECYCLE_STATUS_META } from '@/lib/sop-lifecycle';
import type { SopRecord } from '@/lib/sop-record-schema';

function buildActivityNameMap(record: SopRecord): Map<string, string> {
    const map = new Map<string, string>();
    record.document.workLibrary.taskCatalog.forEach((task) => {
        task.activities.forEach((activity) => map.set(activity.id, activity.name));
    });
    return map;
}

/**
 * A read-only Work Map/SOP summary for the approver Inbox — deliberately
 * NOT the editing Workspace (SopWorkspace) reused in a locked mode. The
 * customer contract requires review to happen in "편집 화면과 구분된 읽기
 * 전용 뷰어", so this renders a plain ordered summary of the Activity ->
 * Sub Action structure with Activity provenance, the AI-generated
 * Agentization suggestion, and the member's own confirmed judgement shown
 * side by side but visually distinct — never implying the reviewer can edit
 * either.
 */
export function SopApprovalReadOnlyPanel({ record }: { record: SopRecord }) {
    const activityNames = buildActivityNameMap(record);
    const businessSteps = record.document.steps.filter((step) => !step.terminalType);
    const statusMeta = SOP_LIFECYCLE_STATUS_META[record.lifecycleStatus];

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-zinc-900">{record.document.title}</h3>
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-bold ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-600 sm:grid-cols-4">
                    <div><dt className="text-zinc-400">요청자</dt><dd className="font-semibold text-zinc-800">{record.document.member.name}</dd></div>
                    <div><dt className="text-zinc-400">조직</dt><dd className="font-semibold text-zinc-800">{record.organizationId}</dd></div>
                    <div><dt className="text-zinc-400">Task</dt><dd className="font-semibold text-zinc-800">{record.taskName}</dd></div>
                    <div><dt className="text-zinc-400">최종 수정</dt><dd className="font-semibold text-zinc-800">{new Date(record.updatedAt).toLocaleString('ko-KR')}</dd></div>
                </dl>
                {record.document.context && <p className="mt-2 text-[11px] leading-5 text-zinc-600">{record.document.context}</p>}
            </div>

            <div className="flex items-start gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-2.5 py-1.5 text-[10px] text-indigo-800">
                <Info className="mt-0.5 h-3 w-3 shrink-0" /> 읽기 전용 검토 화면입니다. 편집 화면과 별개이며, 여기서 문서·Work Map·Agent화 판단을 수정할 수 없습니다.
            </div>

            <div>
                <h4 className="mb-2 text-xs font-bold text-zinc-700">Activity → Sub Action ({businessSteps.length}개)</h4>
                <ol className="space-y-1.5">
                    {businessSteps.map((step, index) => {
                        const activityId = step.sourceActivityIds?.[0];
                        const activityName = activityId ? activityNames.get(activityId) : undefined;
                        const suggestion = step.agentizationSuggestion ? AGENTIZATION_SUGGESTION_META[step.agentizationSuggestion.type] : null;
                        const memberMode = getAgentizationModeForStep(record.document, step.id);
                        const memberModeMeta = getAgentizationModeMeta(memberMode);
                        return (
                            <li key={step.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="shrink-0 rounded-sm bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">#{index + 1}</span>
                                    <p className="truncate text-xs font-semibold text-zinc-900">{step.title}</p>
                                    {activityName && (
                                        <span className="flex shrink-0 items-center gap-0.5 rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
                                            <ChevronRight className="h-2.5 w-2.5" /> {activityName}
                                        </span>
                                    )}
                                </div>
                                {/* Sub Action 생성 출처는 위 Activity 연결(mapping) 정보와 의도적으로 분리된 별도 줄로
                                    렌더링한다 — 어떤 것이 고객 T-A-S(Activity) 기반이고 어떤 것이 구성원이 직무
                                    맥락으로 보강한 것인지 직책자/SME가 두 개념을 하나로 착각하지 않게 한다. */}
                                {step.subActionOrigin && (
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold ${step.subActionOrigin === 'context-derived' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
                                            Sub Action 생성 출처: {step.subActionOrigin === 'context-derived' ? '직무 맥락 보강' : 'Activity 기본 분해'}
                                        </span>
                                    </div>
                                )}
                                {step.subActionOrigin === 'context-derived' && step.subActionOriginRationale && (
                                    <p className="mt-1 text-[10px] italic leading-4 text-violet-700">맥락 근거: {step.subActionOriginRationale}</p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    {suggestion && <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold ${suggestion.badgeClass}`}>{suggestion.label}</span>}
                                    {memberModeMeta ? (
                                        <span className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold ${memberModeMeta.badgeClass}`}>
                                            <CheckCircle2 className="h-2.5 w-2.5" /> 구성원 확정: {memberModeMeta.label}
                                        </span>
                                    ) : (
                                        <span className="rounded-sm border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">구성원 판단 미지정 (사람 수행)</span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}
