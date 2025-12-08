'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

export default function StrategyPage() {
    const { context } = useAppStore();
    const { isLoading, error, generateChangeStrategy } = useAIGeneration();
    const [selectedFramework, setSelectedFramework] = useState<FrameworkType | null>(null);
    const [generatedPhases, setGeneratedPhases] = useState<Phase[] | null>(null);

    // Interactive state
    const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
    const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});

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
        );

        if (result?.phases) {
            setGeneratedPhases(result.phases);
            // Reset completion state for new phases
            setCompletedActions(new Set());
            setRoleAssignments({});
        }
    };

    // Toggle action completion
    const toggleAction = (phaseId: string, actionIdx: number) => {
        const key = `${phaseId}-${actionIdx}`;
        setCompletedActions(prev => {
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
    const displayPhases = generatedPhases || (selectedFramework ? frameworkPhases[selectedFramework] : []);

    return (
        <div className="min-h-screen pro-canvas text-[#18181B] p-8 pb-24">
            <div className="max-w-4xl mx-auto">
                <Link href="/flow" className="text-[#71717A] hover:text-[#18181B] mb-8 inline-block text-sm">
                    ← Flow 캔버스로
                </Link>

                <h1 className="text-2xl font-semibold text-[#18181B] mb-8">
                    변화 관리 전략
                </h1>

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
                                ⚠️ 업무 맥락이 설정되지 않았습니다. <Link href="/flow" className="underline">Flow 캔버스</Link>에서 먼저 업무를 입력해주세요.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Step 1: Framework Selection */}
                <Card className="bg-white border-[#E2E4E9] mb-6 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base font-medium text-[#18181B]">
                            <span className="bg-[#3B82F6] text-white text-xs px-2 py-1 rounded">1</span>
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
                                <span className="bg-[#8B5CF6] text-white text-xs px-2 py-1 rounded">2</span>
                                실행 로드맵
                                {generatedPhases && <span className="text-xs text-[#10B981] ml-2">✓ AI 생성됨</span>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-6">
                                <Button
                                    onClick={handleGenerateStrategy}
                                    disabled={isLoading || !context}
                                    className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                                >
                                    {isLoading ? '분석 중...' : 'AI 맞춤 전략 생성'}
                                </Button>
                                {!context && <span className="text-xs text-[#71717A] ml-3">맥락 입력 후 사용 가능</span>}
                                {error && <span className="text-xs text-[#EF4444] ml-3">{error}</span>}
                            </div>

                            {/* Gantt Chart */}
                            <div className="bg-[#F5F6F8] rounded-xl p-4 border border-[#E2E4E9]">
                                <GanttChart
                                    phases={displayPhases}
                                    totalWeeks={12}
                                    onPhaseClick={(phase) => console.log('Phase clicked:', phase)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Step 3: Interactive Actions */}
                {selectedFramework && displayPhases.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="bg-green-500 text-white text-sm px-2 py-1 rounded">3</span>
                                주요 액션 아이템
                                <span className="text-xs text-slate-400 ml-auto">
                                    전체 진행률: {Math.round(
                                        displayPhases.reduce((acc, p) => acc + getPhaseProgress(p), 0) / displayPhases.length
                                    )}%
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {displayPhases.map((phase) => {
                                    const progress = getPhaseProgress(phase);
                                    return (
                                        <div key={phase.id} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                                            {/* Phase Header */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: phase.color }} />
                                                <h3 className="font-medium text-white flex-1">{phase.name}</h3>
                                                <span className="text-xs text-slate-400">{progress}%</span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="h-1.5 bg-slate-700 rounded-full mb-3 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${progress}%`,
                                                        backgroundColor: phase.color
                                                    }}
                                                />
                                            </div>

                                            {/* Role Assignment */}
                                            <div className="mb-3">
                                                <Input
                                                    placeholder="담당자 지정..."
                                                    value={roleAssignments[phase.id] || ''}
                                                    onChange={(e) => setRoleAssignments(prev => ({
                                                        ...prev,
                                                        [phase.id]: e.target.value
                                                    }))}
                                                    className="bg-slate-800 border-slate-600 text-sm h-8"
                                                />
                                            </div>

                                            {/* Action Items with Checkboxes */}
                                            <ul className="space-y-2">
                                                {phase.actions.map((action, idx) => {
                                                    const isCompleted = completedActions.has(`${phase.id}-${idx}`);
                                                    return (
                                                        <li
                                                            key={idx}
                                                            className="flex items-center gap-2 cursor-pointer group"
                                                            onClick={() => toggleAction(phase.id, idx)}
                                                        >
                                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                                                                ${isCompleted
                                                                    ? 'bg-green-500 border-green-500'
                                                                    : 'border-slate-500 group-hover:border-slate-400'
                                                                }`}
                                                            >
                                                                {isCompleted && (
                                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className={`text-sm transition-colors ${isCompleted
                                                                ? 'text-slate-500 line-through'
                                                                : 'text-slate-300 group-hover:text-white'
                                                                }`}>
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
