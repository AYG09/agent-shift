'use client';

import React from 'react';
import { Settings2, ChevronDown, ChevronUp, Sliders, LayoutGrid } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopDisplayMode } from '@/lib/sop-types';
import { MAX_BRANCHES_MIN, MAX_BRANCHES_MAX, validateSopSetupConfig } from '@/lib/sop-setup-validation';

export const SopGenerationSettings: React.FC = () => {
    const { setupConfig, setSetupConfig, displayMode, setDisplayMode } = useSopPrototypeStore();
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    // 공용 검증 함수 하나로 모든 필드 오류를 계산한다 - 서버(app/api/ai/route.ts)도 동일한 함수를 쓴다.
    const issues = validateSopSetupConfig(setupConfig);
    const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;

    // Calculate recommended expected node count range dynamically
    const minNodesEst = Math.round((setupConfig.minSteps || 0) * 1.2);
    const maxNodesEst = Math.round((setupConfig.maxSteps || 0) * 1.5);

    // 공란(빈 문자열)을 Number()로 바꾸면 0이 되어버려 "빈 값"과 "명시적 0"을 구분할 수 없다.
    // 빈 입력은 NaN으로 유지해 validateSopSetupConfig가 공란을 오류로 잡아내게 한다.
    const parseIntFieldValue = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw));

    const handleMaxBranchesChange = (raw: string) => {
        setSetupConfig({ maxBranches: parseIntFieldValue(raw) });
    };

    return (
        <div className="space-y-6">
            {/* 3.4 SOP Display Level Card */}
            <div className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
                        <LayoutGrid className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900">SOP 콘텐츠 표시 수준</h2>
                        <p className="text-xs text-zinc-500">
                            캔버스 및 뷰어에서 1차적으로 노출할 데이터의 상세 밀도를 선택하세요. (Workspace에서도 자유롭게 전환 가능)
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                        {
                            id: 'compact' as SopDisplayMode,
                            title: '단계명 중심 (Compact)',
                            description: '도형 내에는 단계 번호와 단계명만 깔끔하게 표시하고 상세 내용은 우측 패널에서 확인',
                        },
                        {
                            id: 'standard' as SopDisplayMode,
                            title: '단계명 + 개요 (Standard - 권장)',
                            description: '단계명과 1~2줄 핵심 정의를 함께 표기하여 프로세스 이해도 극대화',
                        },
                        {
                            id: 'detailed' as SopDisplayMode,
                            title: '단계명 + 개요 + SKILL (Detailed)',
                            description: '단계명, 정의 및 요구되는 핵심 SKILL 태그를 도형 내부까지 함께 시각화',
                        },
                    ].map((mode) => (
                        <div
                            key={mode.id}
                            onClick={() => setDisplayMode(mode.id)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                displayMode === mode.id
                                    ? 'bg-violet-50/70 border-violet-400 ring-2 ring-violet-500/20 shadow-sm'
                                    : 'bg-zinc-50/50 border-zinc-200 hover:border-zinc-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-zinc-900">{mode.title}</span>
                                <input
                                    type="radio"
                                    name="displayMode"
                                    checked={displayMode === mode.id}
                                    onChange={() => setDisplayMode(mode.id)}
                                    className="w-4 h-4 text-violet-600 focus:ring-violet-500"
                                />
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">{mode.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3.5 Workflow Structure Settings Card */}
            <div className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                        <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900">워크플로우 구조 설정</h2>
                        <p className="text-xs text-zinc-500">
                            생성될 SOP의 주요 단계 범위, 분기 정책 및 구조적 제약 조건을 설정합니다.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Detail Level */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                            상세 수준 (Detail Level)
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'simple' as const, label: '간단' },
                                { id: 'standard' as const, label: '표준' },
                                { id: 'detailed' as const, label: '상세' },
                            ].map((level) => (
                                <button
                                    key={level.id}
                                    type="button"
                                    onClick={() => setSetupConfig({ detailLevel: level.id })}
                                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                                        setupConfig.detailLevel === level.id
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                                    }`}
                                >
                                    {level.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Major Steps Range */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                                주요 단계 수 범위
                            </label>
                            <span className="text-xs font-bold text-blue-600">
                                {setupConfig.minSteps} ~ {setupConfig.maxSteps} 단계
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mb-2">시작·종료 노드는 제외한, 실제 업무를 수행하는 단계 수입니다.</p>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={4}
                                max={12}
                                value={setupConfig.minSteps}
                                onChange={(e) => {
                                    const minVal = Number(e.target.value);
                                    const maxVal = Math.max(minVal + 1, setupConfig.maxSteps);
                                    setSetupConfig({ minSteps: minVal, maxSteps: maxVal });
                                }}
                                className="w-full accent-blue-600"
                            />
                            <input
                                type="range"
                                min={setupConfig.minSteps + 1}
                                max={16}
                                value={setupConfig.maxSteps}
                                onChange={(e) => setSetupConfig({ maxSteps: Number(e.target.value) })}
                                className="w-full accent-blue-600"
                            />
                        </div>
                    </div>

                    {/* Branch Policy */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                            분기 처리 정책
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'auto' as const, label: 'AI 자동 판단' },
                                { id: 'none' as const, label: '분기 없음' },
                                { id: 'max' as const, label: '최대 개수 지정' },
                            ].map((policy) => (
                                <button
                                    key={policy.id}
                                    type="button"
                                    onClick={() => setSetupConfig({ branchPolicy: policy.id })}
                                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                                        setupConfig.branchPolicy === policy.id
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                                    }`}
                                >
                                    {policy.label}
                                </button>
                            ))}
                        </div>

                        {setupConfig.branchPolicy === 'none' && (
                            <p className="mt-2 text-[11px] text-zinc-500">
                                판단(decision) 노드가 생성되지 않으며, 모든 단계가 순차적으로만 연결됩니다.
                            </p>
                        )}

                        {setupConfig.branchPolicy === 'max' && (
                            <div className="mt-2">
                                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                                    decision(판단) 노드 최대 개수
                                </label>
                                <input
                                    type="number"
                                    min={MAX_BRANCHES_MIN}
                                    max={MAX_BRANCHES_MAX}
                                    value={Number.isNaN(setupConfig.maxBranches) ? '' : setupConfig.maxBranches}
                                    onChange={(e) => handleMaxBranchesChange(e.target.value)}
                                    className={`w-24 px-2.5 py-1.5 bg-white border rounded-lg text-xs font-medium text-zinc-900 ${
                                        issueFor('maxBranches') ? 'border-rose-400 ring-1 ring-rose-300' : 'border-zinc-300'
                                    }`}
                                />
                                {issueFor('maxBranches') ? (
                                    <p className="mt-1 text-[11px] text-rose-600 font-medium">{issueFor('maxBranches')}</p>
                                ) : (
                                    <p className="mt-1 text-[11px] text-zinc-500">
                                        전체 SOP에서 생성될 decision 노드 개수의 상한입니다 ({MAX_BRANCHES_MIN}~{MAX_BRANCHES_MAX}).
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Rework Path Toggle & Node Estimate */}
                    <div className="flex flex-col justify-between">
                        <div className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl mb-3">
                            <div>
                                <span className="text-xs font-semibold text-zinc-900 block">재작업 경로 허용</span>
                                <span className="text-[11px] text-zinc-500">
                                    반려 및 조건 미달 시 이전 단계로 돌아가는 되돌아가는 흐름 허용
                                </span>
                            </div>
                            <input
                                type="checkbox"
                                checked={setupConfig.allowRework}
                                onChange={(e) => setSetupConfig({ allowRework: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded-sm focus:ring-blue-500"
                            />
                        </div>

                        <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs text-blue-900">
                            <span className="font-medium">예상 전체 노드 수 (자동 계산):</span>
                            <span className="font-bold text-blue-700">
                                약 {minNodesEst} ~ {maxNodesEst}개
                            </span>
                        </div>
                    </div>
                </div>

                {/* Advanced Settings Collapsible */}
                <div className="mt-6 border-t border-zinc-200 pt-4">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 focus:outline-hidden"
                    >
                        <Settings2 className="w-3.5 h-3.5" /> 고급 설정
                        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showAdvanced && (
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
                            <div>
                                <label className="block font-medium text-zinc-700 mb-1">최대 전체 노드 수 제한</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={setupConfig.maxTotalNodes ?? ''}
                                    onChange={(e) => setSetupConfig({ maxTotalNodes: parseIntFieldValue(e.target.value) })}
                                    className={`w-full px-3 py-1.5 bg-white border rounded-lg text-zinc-900 ${
                                        issueFor('maxTotalNodes') ? 'border-rose-400 ring-1 ring-rose-300' : 'border-zinc-300'
                                    }`}
                                />
                                {issueFor('maxTotalNodes') ? (
                                    <p className="mt-1 text-[10px] text-rose-600 font-medium">{issueFor('maxTotalNodes')}</p>
                                ) : (
                                    <p className="mt-1 text-[10px] text-zinc-500">시작·종료·판단(decision)·재작업 한계(loopLimit) 노드를 모두 포함한 전체 개수입니다.</p>
                                )}
                            </div>

                            <div>
                                <label className="block font-medium text-zinc-700 mb-1">최대 재작업 루프 수</label>
                                <input
                                    type="number"
                                    min={0}
                                    disabled={!setupConfig.allowRework}
                                    value={setupConfig.maxLoops ?? ''}
                                    onChange={(e) => setSetupConfig({ maxLoops: parseIntFieldValue(e.target.value) })}
                                    className={`w-full px-3 py-1.5 bg-white border rounded-lg text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400 ${
                                        issueFor('maxLoops') ? 'border-rose-400 ring-1 ring-rose-300' : 'border-zinc-300'
                                    }`}
                                />
                                {!setupConfig.allowRework ? (
                                    <p className="mt-1 text-[10px] text-zinc-400">재작업 경로 허용이 꺼져 있어 이 값은 적용되지 않습니다.</p>
                                ) : issueFor('maxLoops') ? (
                                    <p className="mt-1 text-[10px] text-rose-600 font-medium">{issueFor('maxLoops')}</p>
                                ) : (
                                    <p className="mt-1 text-[10px] text-zinc-500">
                                        실행 횟수가 아니라, 정적 그래프 안에 존재하는 &ldquo;이전 단계로 되돌아가는&rdquo; 재작업 경로의 최대 개수입니다. 0을 입력하면 되돌아가는 edge를 허용하지 않습니다.
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between sm:col-span-2 pt-2 border-t border-zinc-200 text-zinc-500">
                                <span className="font-medium">시작·종료 노드는 SOP 표준상 항상 자동으로 포함됩니다.</span>
                            </div>

                            <div className="flex items-center justify-between sm:col-span-2">
                                <span className="font-medium text-zinc-700">복합 수행 단계를 세부 단계로 자동 분리</span>
                                <input
                                    type="checkbox"
                                    checked={setupConfig.splitComplexSteps !== false}
                                    onChange={(e) => setSetupConfig({ splitComplexSteps: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 rounded-sm"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
