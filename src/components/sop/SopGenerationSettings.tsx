'use client';

import React from 'react';
import { ChevronDown, ChevronUp, GitBranch, RotateCcw, Settings2, Sliders } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { MAX_BRANCHES_MAX, MAX_BRANCHES_MIN, SOP_DETAIL_LEVELS, SOP_DETAIL_LEVEL_GUIDE, SOP_BRANCH_POLICIES, SOP_BRANCH_POLICY_GUIDE, validateSopSetupConfig } from '@/lib/sop-setup-validation';
import { computeSubActionCapacity } from '@/lib/sop-subaction-capacity';

const STEP_OPTIONS = Array.from({ length: 13 }, (_, index) => index + 4);

/** `activityCount` is the selected Task's Activity count — the same number computeSubActionCapacity uses everywhere else (Gate request building, prompt, post-processing validation). This card must show the SAME computed capacity, never re-derive its own estimate. */
export const SopGenerationSettings: React.FC<{ activityCount: number }> = ({ activityCount }) => {
    const { setupConfig, setSetupConfig } = useSopPrototypeStore();
    const [showAdvanced, setShowAdvanced] = React.useState(false);
    // 밀도 개선: 구조 설정은 합리적인 기본값이 이미 채워져 있으므로 기본 접힘.
    // 현재 값 요약은 헤더에 항상 보이고, 검증 오류가 있으면 강제로 펼쳐져
    // 필드별 오류 표시가 접힌 채 숨겨지는 일이 없다. 내용은 접힘 상태에서도
    // 마운트를 유지한다(CSS hidden) — 폼 상태와 기존 테스트가 그대로 동작한다.
    const [collapsed, setCollapsed] = React.useState(true);
    const issues = validateSopSetupConfig(setupConfig);
    const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;
    const capacity = computeSubActionCapacity({
        activityCount,
        minSteps: setupConfig.minSteps,
        maxSteps: setupConfig.maxSteps,
        maxTotalNodes: setupConfig.maxTotalNodes,
        detailLevel: setupConfig.detailLevel,
    });
    const parseIntFieldValue = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw));
    const isOpen = !collapsed || issues.length > 0;
    const summary = [
        SOP_DETAIL_LEVEL_GUIDE[setupConfig.detailLevel]?.label || setupConfig.detailLevel,
        capacity.adjusted ? `${capacity.minSteps}~${capacity.maxSteps}단계` : `${setupConfig.minSteps}–${setupConfig.maxSteps}단계`,
        SOP_BRANCH_POLICY_GUIDE[setupConfig.branchPolicy]?.label || setupConfig.branchPolicy,
        setupConfig.allowRework ? '재작업 허용' : '재작업 금지',
    ].join(' · ');

    return (
        <div className="rounded-lg border border-zinc-200 bg-white">
            <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50/70"
            >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white"><Sliders className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-zinc-900">워크플로우 구조 설정</h2>
                    <p className="mt-0.5 truncate text-[11px] leading-4 text-zinc-500" title={summary}>{summary}</p>
                    {issues.length > 0 && <p className="mt-0.5 text-[11px] font-semibold text-rose-600">설정 오류 {issues.length}건 — 확인이 필요합니다</p>}
                </div>
                <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <div className={isOpen ? 'space-y-4 border-t border-zinc-100 p-4' : 'hidden'}>
                <div>
                    <div className="mb-2 flex items-center justify-between gap-2"><label className="text-xs font-semibold text-zinc-800">업무 분해 수준</label><span className="text-[10px] font-medium text-indigo-700">SOP 생성 구조</span></div>
                    <p className="mb-2 text-[11px] leading-4 text-zinc-500">AI가 같은 업무를 어느 수준까지 나눠 SOP 단계로 만들지 정합니다. 캔버스 표시는 단계명 중심으로 유지됩니다.</p>
                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="업무 분해 수준">
                        {SOP_DETAIL_LEVELS.map((levelId) => {
                            const level = SOP_DETAIL_LEVEL_GUIDE[levelId];
                            const selected = setupConfig.detailLevel === levelId;
                            return <button key={levelId} type="button" role="radio" aria-checked={selected} onClick={() => setSetupConfig({ detailLevel: levelId })} className={`min-h-[76px] rounded-md border p-2 text-left transition-colors ${selected ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-zinc-200 bg-zinc-50/70 hover:border-zinc-300 hover:bg-white'}`}><span className={`block text-xs font-semibold ${selected ? 'text-indigo-800' : 'text-zinc-800'}`}>{level.label}</span><span className="mt-1 block text-[10px] leading-4 text-zinc-500">{level.shortDetail}</span></button>;
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-y border-zinc-100 py-3">
                    <div>
                        <label className="text-xs font-semibold text-zinc-800">주요 단계 수</label>
                        <div className="mt-1.5 flex items-center gap-1.5"><select value={setupConfig.minSteps} onChange={(event) => { const minSteps = Number(event.target.value); setSetupConfig({ minSteps, maxSteps: Math.max(minSteps + 1, setupConfig.maxSteps) }); }} className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-900 focus:border-indigo-500 focus:outline-none" aria-label="최소 주요 단계 수">{STEP_OPTIONS.slice(0, -1).map((value) => <option key={value} value={value}>{value}</option>)}</select><span className="text-zinc-400">–</span><select value={setupConfig.maxSteps} onChange={(event) => setSetupConfig({ maxSteps: Number(event.target.value) })} className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-900 focus:border-indigo-500 focus:outline-none" aria-label="최대 주요 단계 수">{STEP_OPTIONS.filter((value) => value > setupConfig.minSteps).map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                        <p className="mt-1 text-[10px] text-zinc-500">기본 설정값입니다 (Activity {activityCount}개 반영 전).</p>
                        {/* "실제 적용" is the SAME computeSubActionCapacity output the AI request/prompt/
                            post-processing validation all use — never a separately re-estimated number.
                            Shown only when it actually differs from the raw setting above (capacity.adjusted),
                            so a Task that needs no adjustment never shows two contradictory-looking ranges. */}
                        {capacity.adjusted && (
                            <p className="mt-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-800">
                                이 Task 실제 적용: {capacity.minSteps}~{capacity.maxSteps}단계 · 전체 노드 상한 {capacity.maxTotalNodes}개
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="flex items-center gap-1 text-xs font-semibold text-zinc-800"><GitBranch className="h-3.5 w-3.5 text-indigo-600" /> 분기 처리</label>
                        <select value={setupConfig.branchPolicy} onChange={(event) => setSetupConfig({ branchPolicy: event.target.value as (typeof SOP_BRANCH_POLICIES)[number] })} className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-900 focus:border-indigo-500 focus:outline-none">{SOP_BRANCH_POLICIES.map((policyId) => <option key={policyId} value={policyId}>{SOP_BRANCH_POLICY_GUIDE[policyId].label}</option>)}</select>
                        {setupConfig.branchPolicy === 'max' && <div className="mt-1.5 flex items-center gap-1.5"><input type="number" min={MAX_BRANCHES_MIN} max={MAX_BRANCHES_MAX} value={Number.isNaN(setupConfig.maxBranches) ? '' : setupConfig.maxBranches} onChange={(event) => setSetupConfig({ maxBranches: parseIntFieldValue(event.target.value) })} className={`w-16 rounded-md border px-2 py-1 text-xs ${issueFor('maxBranches') ? 'border-rose-400' : 'border-zinc-300'}`} aria-label="최대 분기 수" /><span className="text-[10px] text-zinc-500">{MAX_BRANCHES_MIN}–{MAX_BRANCHES_MAX}개</span></div>}
                    </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5"><span className="flex min-w-0 items-center gap-2"><RotateCcw className="h-4 w-4 shrink-0 text-emerald-600" /><span><span className="block text-xs font-semibold text-zinc-800">재작업 경로 허용</span><span className="block text-[10px] text-zinc-500">반려·보완 시 이전 단계로 돌아가는 경로</span></span></span><input type="checkbox" checked={setupConfig.allowRework} onChange={(event) => setSetupConfig({ allowRework: event.target.checked })} className="h-4 w-4 rounded-sm text-indigo-600 focus:ring-indigo-500" /></label>

                <div className="border-t border-zinc-100 pt-3">
                    <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900"><Settings2 className="h-3.5 w-3.5" /> 고급 설정{showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                    {showAdvanced && <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-zinc-50 p-3"><label className="text-[11px] font-medium text-zinc-700">최대 전체 노드 수<input type="number" min={1} value={setupConfig.maxTotalNodes ?? ''} onChange={(event) => setSetupConfig({ maxTotalNodes: parseIntFieldValue(event.target.value) })} className={`mt-1 block w-full rounded-md border bg-white px-2 py-1.5 text-xs ${issueFor('maxTotalNodes') ? 'border-rose-400' : 'border-zinc-300'}`} /></label><label className="text-[11px] font-medium text-zinc-700">최대 재작업 루프 수<input type="number" min={0} disabled={!setupConfig.allowRework} value={setupConfig.maxLoops ?? ''} onChange={(event) => setSetupConfig({ maxLoops: parseIntFieldValue(event.target.value) })} className={`mt-1 block w-full rounded-md border bg-white px-2 py-1.5 text-xs disabled:bg-zinc-100 ${issueFor('maxLoops') ? 'border-rose-400' : 'border-zinc-300'}`} /></label><div className="col-span-2 border-t border-zinc-200 pt-2"><p className="text-[11px] font-semibold text-zinc-700">Activity → Sub Action 의미 분해는 항상 적용됩니다</p><p className="mt-1 text-[10px] leading-4 text-zinc-500">실행 행동만 단계로 만들고, 이전 결과·입력·목적·산출물은 단계 정보로 구분합니다. 분해 깊이는 위의 업무 분해 수준에서 조정합니다.</p></div></div>}
                </div>
            </div>
        </div>
    );
};
