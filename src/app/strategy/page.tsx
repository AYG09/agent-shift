'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { FrameworkSelector } from '@/components/strategy/FrameworkCard';
import { frameworkPhases } from '@/components/strategy/GanttChart';
import { useAppStore } from '@/lib/store';
import { useAIGeneration } from '@/hooks/useAIGeneration';
import Link from 'next/link';

const GanttChart = dynamic(() => import('@/components/strategy/GanttChart'), { ssr: false });

type FrameworkType = 'kotter' | 'adkar' | 'lewin';

interface Phase {
    id: string;
    name: string;
    duration: string;
    startWeek: number;
    endWeek: number;
    actions: string[];
    color: string;
}

interface ScheinApproach {
    approach: string;
    description: string;
    tactics: string[];
}

interface StrategyResult {
    phases: Phase[];
    scheinApproaches?: ScheinApproach[];
    frameworkExplanation?: string;
}

export default function StrategyPage() {
    const { context, setStrategy } = useAppStore();
    const { isLoading, error, generateChangeStrategy } = useAIGeneration();
    const [selectedFramework, setSelectedFramework] = useState<FrameworkType | null>(null);
    const [generatedPhases, setGeneratedPhases] = useState<Phase[] | null>(null);
    const [scheinApproaches, setScheinApproaches] = useState<ScheinApproach[] | null>(null);
    const [frameworkExplanation, setFrameworkExplanation] = useState<string | null>(null);
    const [totalWeeks, setTotalWeeks] = useState(12);

    // Interactive state
    const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
    const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
    const [expandedApproach, setExpandedApproach] = useState<number | null>(null);

    const handleGenerateStrategy = async () => {
        if (!selectedFramework || !context) return;

        const result = await generateChangeStrategy(
            {
                industry: context.industry,
                role: context.role,
                task: context.task,
                timeScale: context.timeScale,
            },
            selectedFramework
        ) as StrategyResult | null;

        if (result?.phases) {
            setGeneratedPhases(result.phases);
            setScheinApproaches(result.scheinApproaches || null);
            setFrameworkExplanation(result.frameworkExplanation || null);
            // Store에 전략 저장
            setStrategy({
                framework: selectedFramework,
                phases: result.phases,
                totalWeeks,
            });
            // Reset completion state for new phases
            setCompletedActions(new Set());
            setRoleAssignments({});
            setExpandedApproach(null);
        }
    };

    // Toggle action completion
    const toggleAction = (phaseId: string, actionIdx: number) => {
        const key = `${phaseId}-${actionIdx}`;
        setCompletedActions((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Calculate phase progress
    const getPhaseProgress = (phase: Phase) => {
        const completed = phase.actions.filter((_, idx) =>
            completedActions.has(`${phase.id}-${idx}`)
        ).length;
        return phase.actions.length > 0 ? Math.round((completed / phase.actions.length) * 100) : 0;
    };

    // 표시할 단계 (AI 생성 결과 또는 기본 템플릿)
    const displayPhases =
        generatedPhases || (selectedFramework ? frameworkPhases[selectedFramework] : []);

    return (
        <div className="min-h-screen pro-canvas text-[#18181B] p-8 pb-24">
            <div className="max-w-4xl mx-auto">
                <Link
                    href="/flow"
                    className="text-[#71717A] hover:text-[#18181B] mb-8 inline-block text-sm"
                >
                    ← Flow 캔버스로
                </Link>

                <h1 className="text-2xl font-semibold text-[#18181B] mb-8">변화 관리 전략</h1>

                {/* Context Info */}
                {context && (
                    <Card className="bg-white border-[#E2E4E9] mb-6 shadow-sm">
                        <CardContent className="py-4">
                            <div className="flex items-center gap-4 text-sm">
                                <span className="text-[#71717A]">분석 대상:</span>
                                <span className="font-medium text-[#18181B]">{context.task}</span>
                                <span className="text-[#E2E4E9]">|</span>
                                <span className="text-[#71717A]">{context.industry}</span>
                                <span className="text-[#71717A]">{context.role}</span>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {!context && (
                    <Card className="bg-[#FEF3C7] border-[#FCD34D] mb-6">
                        <CardContent className="py-4">
                            <p className="text-[#92400E] text-sm">
                                ⚠️ 업무 맥락이 설정되지 않았습니다.{' '}
                                <Link href="/flow" className="underline">
                                    Flow 캔버스
                                </Link>
                                에서 먼저 업무를 입력해주세요.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Step 1: Framework Selection */}
                <Card className="bg-white border-[#E2E4E9] mb-6 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base font-medium text-[#18181B]">
                            <span className="bg-[#3B82F6] text-white text-xs px-2 py-1 rounded">
                                1
                            </span>
                            프레임워크 선택
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <FrameworkSelector
                            selected={selectedFramework || undefined}
                            onSelect={setSelectedFramework}
                        />
                    </CardContent>
                </Card>

                {/* Step 2: Generate Strategy */}
                {selectedFramework && (
                    <Card className="bg-white border-[#E2E4E9] mb-6 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-medium text-[#18181B]">
                                <span className="bg-[#8B5CF6] text-white text-xs px-2 py-1 rounded">
                                    2
                                </span>
                                실행 로드맵
                                {generatedPhases && (
                                    <span className="text-xs text-[#10B981] ml-2">✓ AI 생성됨</span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-6 flex items-center gap-4 flex-wrap">
                                <Button
                                    onClick={handleGenerateStrategy}
                                    disabled={isLoading || !context}
                                    className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                                >
                                    {isLoading ? (
                                        <span className="flex items-center gap-2">
                                            <Spinner size="sm" className="text-white" />
                                            분석 중...
                                        </span>
                                    ) : (
                                        'AI 맞춤 전략 생성'
                                    )}
                                </Button>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-[#71717A] whitespace-nowrap">타임라인:</label>
                                    <Input
                                        type="number"
                                        min={4}
                                        max={52}
                                        value={totalWeeks}
                                        onChange={(e) => setTotalWeeks(Math.max(4, Math.min(52, parseInt(e.target.value) || 12)))}
                                        className="w-20 bg-white border-[#E2E4E9]"
                                    />
                                    <span className="text-sm text-[#71717A]">주</span>
                                </div>
                                {!context && (
                                    <span className="text-xs text-[#71717A]">
                                        맥락 입력 후 사용 가능
                                    </span>
                                )}
                                {error && (
                                    <span className="text-xs text-[#EF4444]">{error}</span>
                                )}
                            </div>

                            {/* Gantt Chart */}
                            <div className="bg-[#F5F6F8] rounded-xl p-4 border border-[#E2E4E9]">
                                <GanttChart
                                    phases={displayPhases}
                                    totalWeeks={totalWeeks}
                                    onPhaseClick={(phase) => console.log('Phase clicked:', phase)}
                                />
                            </div>

                            {/* Framework Explanation */}
                            {frameworkExplanation && (
                                <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                                            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-blue-900 mb-1">프레임워크 이론적 배경</h4>
                                            <p className="text-sm text-blue-700 leading-relaxed">{frameworkExplanation}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Schein's 8 Approaches (Lewin model) */}
                {scheinApproaches && scheinApproaches.length > 0 && (
                    <Card className="bg-white border-[#E2E4E9] mb-6 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-medium text-[#18181B]">
                                <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-2 py-1 rounded">
                                    2.5
                                </span>
                                <span className="flex items-center gap-2">
                                    Schein의 학습불안 감소 전략
                                    <span className="text-xs font-normal text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                        생존불안 &gt; 학습불안
                                    </span>
                                </span>
                            </CardTitle>
                            <p className="text-sm text-[#71717A] mt-1">
                                변화에 대한 저항을 줄이고 새로운 학습을 촉진하는 8가지 접근방법입니다.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {scheinApproaches.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                                            expandedApproach === idx
                                                ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-md'
                                                : 'bg-white/60 border-[#E2E4E9] hover:border-purple-200 hover:shadow-sm'
                                        }`}
                                        onClick={() => setExpandedApproach(expandedApproach === idx ? null : idx)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold ${
                                                expandedApproach === idx
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-purple-100 text-purple-600'
                                            }`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`font-medium text-sm ${
                                                    expandedApproach === idx ? 'text-purple-900' : 'text-[#18181B]'
                                                }`}>
                                                    {item.approach}
                                                </h4>
                                                <p className="text-xs text-[#71717A] mt-1 line-clamp-2">
                                                    {item.description}
                                                </p>
                                                
                                                {/* Expanded Tactics */}
                                                {expandedApproach === idx && item.tactics.length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-purple-100">
                                                        <p className="text-xs font-medium text-purple-700 mb-2">실행 전술</p>
                                                        <ul className="space-y-1.5">
                                                            {item.tactics.map((tactic, tIdx) => (
                                                                <li key={tIdx} className="flex items-start gap-2 text-xs text-[#52525B]">
                                                                    <span className="text-purple-400 mt-0.5">▸</span>
                                                                    {tactic}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                            <svg 
                                                className={`w-4 h-4 text-[#A1A1AA] transition-transform ${expandedApproach === idx ? 'rotate-180' : ''}`} 
                                                fill="none" 
                                                viewBox="0 0 24 24" 
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Theory Note */}
                            <div className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-100">
                                <p className="text-xs text-amber-800">
                                    💡 <strong>Schein의 핵심 원리:</strong> 변화가 일어나려면 생존불안(변하지 않으면 안 된다는 인식)이 
                                    학습불안(새로운 것을 배우는 두려움)보다 커야 합니다. 
                                    위 8가지 접근방법은 학습불안을 감소시켜 심리적 안전감을 높이는 전략입니다.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Step 3: Interactive Actions */}
                {selectedFramework && displayPhases.length > 0 && (
                    <Card className="bg-white/90 backdrop-blur-xl border-[#E2E4E9] shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-medium text-[#18181B]">
                                <span className="bg-emerald-500 text-white text-xs px-2 py-1 rounded">
                                    3
                                </span>
                                주요 액션 아이템
                                <span className="text-xs text-[#71717A] ml-auto">
                                    전체 진행률:{' '}
                                    {Math.round(
                                        displayPhases.reduce(
                                            (acc, p) => acc + getPhaseProgress(p),
                                            0
                                        ) / displayPhases.length
                                    )}
                                    %
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {displayPhases.map((phase) => {
                                    const progress = getPhaseProgress(phase);
                                    return (
                                        <div
                                            key={phase.id}
                                            className="p-4 bg-white/60 backdrop-blur-md rounded-xl border border-[#E2E4E9] shadow-sm hover:shadow-md transition-shadow"
                                        >
                                            {/* Phase Header */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: phase.color }}
                                                />
                                                <h3 className="font-medium text-[#18181B] flex-1">
                                                    {phase.name}
                                                </h3>
                                                <span className="text-xs text-[#71717A]">
                                                    {progress}%
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="h-1.5 bg-[#E2E4E9] rounded-full mb-3 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${progress}%`,
                                                        backgroundColor: phase.color,
                                                    }}
                                                />
                                            </div>

                                            {/* Role Assignment */}
                                            <div className="mb-3">
                                                <Input
                                                    placeholder="담당자 지정..."
                                                    value={roleAssignments[phase.id] || ''}
                                                    onChange={(e) =>
                                                        setRoleAssignments((prev) => ({
                                                            ...prev,
                                                            [phase.id]: e.target.value,
                                                        }))
                                                    }
                                                    className="bg-white/80 border-[#E2E4E9] text-sm h-8 text-[#18181B] placeholder:text-[#A1A1AA]"
                                                />
                                            </div>

                                            {/* Action Items with Checkboxes */}
                                            <ul className="space-y-2">
                                                {phase.actions.map((action, idx) => {
                                                    const isCompleted = completedActions.has(
                                                        `${phase.id}-${idx}`
                                                    );
                                                    return (
                                                        <li
                                                            key={idx}
                                                            className="flex items-center gap-2 cursor-pointer group"
                                                            onClick={() =>
                                                                toggleAction(phase.id, idx)
                                                            }
                                                        >
                                                            <div
                                                                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                                                                ${
                                                                    isCompleted
                                                                        ? 'bg-emerald-500 border-emerald-500'
                                                                        : 'border-[#D4D4D8] group-hover:border-[#A1A1AA]'
                                                                }`}
                                                            >
                                                                {isCompleted && (
                                                                    <svg
                                                                        className="w-3 h-3 text-white"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={3}
                                                                            d="M5 13l4 4L19 7"
                                                                        />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span
                                                                className={`text-sm transition-colors ${
                                                                    isCompleted
                                                                        ? 'text-[#A1A1AA] line-through'
                                                                        : 'text-[#52525B] group-hover:text-[#18181B]'
                                                                }`}
                                                            >
                                                                {action}
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
