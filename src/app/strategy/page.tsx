'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FrameworkSelector } from '@/components/strategy/FrameworkCard';
import { frameworkPhases } from '@/components/strategy/GanttChart';
import { useAppStore } from '@/lib/store';
import { useAIGeneration } from '@/hooks/useAIGeneration';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Target, CheckCircle2, AlertTriangle, Layers, Crosshair, Clock, LayoutGrid, Bot, Info, X, ChevronDown, Zap, Wrench, Brain } from 'lucide-react';

const GanttChart = dynamic(() => import('@/components/strategy/GanttChart'), { ssr: false });

type FrameworkType = 'kotter' | 'adkar' | 'lewin';

interface ActionItem {
    action: string;
    rationale: string;
    value: string;
}

interface Phase {
    id: string;
    name: string;
    duration: string;
    startWeek: number;
    endWeek: number;
    actions: (string | ActionItem)[];
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
    const { 
        context, 
        strategy,
        setStrategy, 
        toBeNodes,
        strategyScope,
        selectedToBeNodeId,
        setStrategyScope,
        setSelectedToBeNodeId,
        drilldownResults,
    } = useAppStore();
    const { isLoading, error, generateChangeStrategy } = useAIGeneration();
    const [selectedFramework, setSelectedFramework] = useState<FrameworkType | null>(null);
    const [generatedPhases, setGeneratedPhases] = useState<Phase[] | null>(null);
    const [scheinApproaches, setScheinApproaches] = useState<ScheinApproach[] | null>(null);
    const [frameworkExplanation, setFrameworkExplanation] = useState<string | null>(null);
    const [totalWeeks, setTotalWeeks] = useState(12);

    // AI 에이전트 선택 Dialog
    const [agentSelectOpen, setAgentSelectOpen] = useState(false);

    // Hydration 안전 처리
    const [mounted, setMounted] = useState(false);
    const hasRestoredRef = useRef(false);

    // Interactive state
    const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
    const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
    const [expandedApproach, setExpandedApproach] = useState<number | null>(null);
    const [expandedDrilldown, setExpandedDrilldown] = useState<string | null>(null);

    // Mounted 상태 설정
    useEffect(() => {
        setMounted(true);
    }, []);

    // Store strategy에서 이전 결과 복원
    useEffect(() => {
        if (mounted && strategy && !hasRestoredRef.current) {
            hasRestoredRef.current = true;

            // 프레임워크 복원
            setSelectedFramework(strategy.framework);

            // phases 복원
            if (strategy.phases && strategy.phases.length > 0) {
                setGeneratedPhases(strategy.phases);
                
                // totalWeeks 복원
                if (strategy.totalWeeks) {
                    setTotalWeeks(strategy.totalWeeks);
                }
            }
        }
    }, [mounted, strategy]);

    // To-Be 플로우 요약 계산
    const agentNodes = toBeNodes.filter(n => n.type === 'agent');
    const selectedNode = selectedToBeNodeId 
        ? toBeNodes.find(n => n.id === selectedToBeNodeId) 
        : null;
    const hasToBeFlow = toBeNodes.length > 0;
    const hasAgentNodes = agentNodes.length > 0;
    const canSelectNode = hasAgentNodes; // 에이전트가 있으면 선택 가능

    // 협업 유형별 집계
    const collaborationSummary = {
        copilot: agentNodes.filter(n => n.collaborationType === 'copilot').length,
        monitor: agentNodes.filter(n => n.collaborationType === 'monitor').length,
        autonomous: agentNodes.filter(n => n.collaborationType === 'autonomous').length,
    };

    // 캐시된 drilldown 결과 필터링 (TO-BE 노드 전용)
    const tobeDrilldowns = Object.entries(drilldownResults)
        .filter(([key]) => key.startsWith('to-be-'))
        .map(([key, result]) => {
            const nodeId = key.replace('to-be-', '');
            const node = toBeNodes.find(n => n.id === nodeId);
            return { nodeId, node, result };
        })
        .filter(item => item.node !== undefined);
    
    const hasDrilldowns = tobeDrilldowns.length > 0;

    const handleGenerateStrategy = async () => {
        if (!selectedFramework || !context) return;

        // 전략 범위에 따라 다른 context 전달
        const scopeContext = strategyScope === 'selected' && selectedNode
            ? {
                industry: context.industry,
                role: context.role,
                task: `[${selectedNode.label}] ${selectedNode.description || selectedNode.label} (${selectedNode.collaborationType} 협업)`,
                timeScale: context.timeScale,
            }
            : {
                industry: context.industry,
                role: context.role,
                task: context.task,
                timeScale: context.timeScale,
            };

        const result = await generateChangeStrategy(
            scopeContext,
            selectedFramework,
            totalWeeks
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
        <div className="min-h-screen pro-canvas text-[#18181B] p-4 sm:p-8 pb-24 safe-area-padding">
            <div className="max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <Link
                        href="/flow"
                        className="text-gray-500 hover:text-gray-800 mb-6 sm:mb-8 inline-flex items-center gap-2 text-sm transition-colors touch-target"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Flow 캔버스로
                    </Link>
                </motion.div>

                <motion.h1 
                    className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-6 sm:mb-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    변화 관리 전략
                </motion.h1>

                {/* Context Info */}
                <AnimatePresence>
                    {context && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, delay: 0.15 }}
                        >
                            <Card className="bg-white/80 backdrop-blur-xl border-gray-200/80 mb-6 shadow-lg shadow-gray-200/50">
                                <CardContent className="py-3 sm:py-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4 h-4 text-blue-500" />
                                            <span className="text-gray-500">분석 대상:</span>
                                        </div>
                                        <span className="font-semibold text-gray-800 line-clamp-2 sm:line-clamp-1">{context.task}</span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600">{context.industry}</span>
                                            <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-600">{context.role}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {!context && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <Card className="bg-amber-50 border-amber-200 mb-6">
                                <CardContent className="py-4">
                                    <div className="flex items-center gap-3 text-amber-800 text-sm">
                                        <AlertTriangle className="w-5 h-5" />
                                        <p>
                                            업무 맥락이 설정되지 않았습니다.{' '}
                                            <Link href="/flow" className="underline font-medium hover:text-amber-900">
                                                Flow 캔버스
                                            </Link>
                                            에서 먼저 업무를 입력해주세요.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Step 0: 전략 범위 선택 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                >
                    <Card className="bg-white/90 backdrop-blur-xl border-gray-200/80 mb-6 shadow-lg shadow-gray-200/50 overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border-b border-gray-100">
                            <CardTitle className="flex items-center gap-3 text-base font-semibold text-gray-800">
                                <span className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm">
                                    0
                                </span>
                                전략 범위 선택
                                {!hasToBeFlow && (
                                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full ml-2 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        To-Be 플로우 필요
                                    </span>
                                )}
                            </CardTitle>
                            <p className="text-sm text-gray-500 mt-1.5">
                                전체 To-Be 플로우를 대상으로 할지, 특정 AI 에이전트 노드만 대상으로 할지 선택하세요.
                            </p>
                        </CardHeader>
                        <CardContent className="pt-4 sm:pt-5">
                            <div className="grid grid-cols-1 gap-4 sm:gap-5">
                                {/* 전체 플로우 옵션 */}
                                <motion.div
                                    className={`p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 cursor-pointer transition-all touch-feedback ${
                                        strategyScope === 'full'
                                            ? 'border-indigo-400 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-lg shadow-indigo-500/10'
                                            : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
                                    } ${!hasToBeFlow ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => hasToBeFlow && setStrategyScope('full')}
                                    whileHover={hasToBeFlow ? { scale: 1.02, y: -2 } : {}}
                                    whileTap={hasToBeFlow ? { scale: 0.98 } : {}}
                                >
                                    <div className="flex items-start gap-3 sm:gap-4">
                                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                                            strategyScope === 'full' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-indigo-100 text-indigo-600'
                                        }`}>
                                            <LayoutGrid className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className={`font-bold text-lg ${strategyScope === 'full' ? 'text-indigo-900' : 'text-gray-800'}`}>
                                                전체 To-Be 플로우
                                            </h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                모든 변화 대상을 포함한 종합 전략
                                            </p>
                                            {hasToBeFlow && (
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <span className="text-xs px-2.5 py-1.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-1">
                                                        <Bot className="w-3 h-3" />
                                                        AI 에이전트 {agentNodes.length}개
                                                    </span>
                                                    <span className="text-xs px-2.5 py-1.5 rounded-full bg-gray-100 text-gray-700 font-medium flex items-center gap-1">
                                                        <Layers className="w-3 h-3" />
                                                        총 {toBeNodes.length}개 노드
                                                    </span>
                                                </div>
                                            )}
                                            {hasToBeFlow && agentNodes.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {collaborationSummary.copilot > 0 && (
                                                        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                                                            Copilot {collaborationSummary.copilot}
                                                        </span>
                                                    )}
                                                    {collaborationSummary.monitor > 0 && (
                                                        <span className="text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-600 font-medium">
                                                            Monitor {collaborationSummary.monitor}
                                                        </span>
                                                    )}
                                                    {collaborationSummary.autonomous > 0 && (
                                                        <span className="text-[10px] px-2 py-1 rounded-full bg-purple-50 text-purple-600 font-medium">
                                                            Autonomous {collaborationSummary.autonomous}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {strategyScope === 'full' && (
                                            <motion.div 
                                                className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shadow-md"
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: 'spring', stiffness: 300 }}
                                            >
                                                <CheckCircle2 className="w-4 h-4 text-white" />
                                            </motion.div>
                                        )}
                                    </div>
                                </motion.div>

                                {/* 선택된 노드 옵션 */}
                                <motion.div
                                    className={`p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 cursor-pointer transition-all touch-feedback ${
                                        strategyScope === 'selected'
                                            ? 'border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg shadow-purple-500/10'
                                            : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-md'
                                    } ${!canSelectNode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => {
                                        if (canSelectNode) {
                                            setAgentSelectOpen(true);
                                        }
                                    }}
                                    whileHover={canSelectNode ? { scale: 1.02, y: -2 } : {}}
                                    whileTap={canSelectNode ? { scale: 0.98 } : {}}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                            strategyScope === 'selected' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30' : 'bg-purple-100 text-purple-600'
                                        }`}>
                                            <Crosshair className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className={`font-bold text-lg ${strategyScope === 'selected' ? 'text-purple-900' : 'text-gray-800'}`}>
                                                선택된 AI 에이전트
                                            </h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                특정 노드에 집중한 상세 전략
                                            </p>
                                            {selectedNode ? (
                                                <div className="mt-4 p-3 bg-white/80 rounded-xl border border-purple-100">
                                                    <div className="flex items-center gap-2">
                                                        <Bot className="w-4 h-4 text-purple-600" />
                                                        <span className="text-sm font-semibold text-purple-800">{selectedNode.label}</span>
                                                    </div>
                                                    {selectedNode.collaborationType && (
                                                        <span className={`text-[10px] px-2 py-1 rounded-full mt-2 inline-block font-medium ${
                                                            selectedNode.collaborationType === 'copilot' ? 'bg-emerald-50 text-emerald-600' :
                                                            selectedNode.collaborationType === 'monitor' ? 'bg-amber-50 text-amber-600' :
                                                            'bg-purple-50 text-purple-600'
                                                        }`}>
                                                            {selectedNode.collaborationType}
                                                        </span>
                                                    )}
                                                    {selectedNode.description && (
                                                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{selectedNode.description}</p>
                                                    )}
                                                    <p className="text-[10px] text-purple-500 mt-2">클릭하여 다른 에이전트 선택</p>
                                                </div>
                                            ) : hasAgentNodes ? (
                                                <div className="mt-4 p-3 bg-purple-50/50 rounded-xl border border-purple-200">
                                                    <p className="text-xs text-purple-600 text-center font-medium">
                                                        🤖 클릭하여 AI 에이전트 선택
                                                    </p>
                                                    <p className="text-[10px] text-purple-400 text-center mt-1">
                                                        {agentNodes.length}개의 AI 에이전트 사용 가능
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="mt-4 p-3 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                                    <p className="text-xs text-gray-500 text-center">
                                                        <Link href="/flow" className="text-purple-500 hover:underline font-medium">
                                                            Flow 캔버스
                                                        </Link>
                                                        에서 To-Be 플로우를 생성하세요
                                                    </p>
                                                    <p className="text-[10px] text-gray-400 text-center mt-1">
                                                        💡 AI 에이전트가 없습니다
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        {strategyScope === 'selected' && selectedNode && (
                                            <motion.div 
                                                className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center shadow-md"
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: 'spring', stiffness: 300 }}
                                            >
                                                <CheckCircle2 className="w-4 h-4 text-white" />
                                            </motion.div>
                                        )}
                                    </div>
                                </motion.div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
                {/* Step 1: Framework Selection */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                >
                    <Card className="bg-white/90 backdrop-blur-xl border-gray-200/80 mb-6 shadow-lg shadow-gray-200/50 overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-blue-50/80 to-cyan-50/80 border-b border-gray-100">
                            <CardTitle className="flex items-center gap-3 text-base font-semibold text-gray-800">
                                <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm">
                                    1
                                </span>
                                프레임워크 선택
                                {selectedFramework && (
                                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        선택됨
                                    </span>
                                )}
                            </CardTitle>
                            <p className="text-sm text-gray-500 mt-1.5">
                                변화 관리에 적합한 프레임워크를 선택하세요. 각 프레임워크는 다른 관점과 단계를 제공합니다.
                            </p>
                        </CardHeader>
                        <CardContent className="pt-5">
                            <FrameworkSelector
                                selected={selectedFramework || undefined}
                                onSelect={setSelectedFramework}
                            />
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Step 2: Generate Strategy */}
                <AnimatePresence>
                    {selectedFramework && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                        >
                            <Card className="bg-white/90 backdrop-blur-xl border-gray-200/80 mb-6 shadow-lg shadow-gray-200/50 overflow-hidden">
                                <CardHeader className="bg-gradient-to-r from-violet-50/80 to-purple-50/80 border-b border-gray-100">
                                    <CardTitle className="flex items-center gap-3 text-base font-semibold text-gray-800">
                                        <span className="bg-gradient-to-r from-violet-500 to-purple-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm">
                                            2
                                        </span>
                                        실행 로드맵
                                        {generatedPhases && (
                                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                AI 생성됨
                                            </span>
                                        )}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-5">
                                    <div className="mb-6 flex items-center gap-4 flex-wrap">
                                        <motion.button
                                            onClick={handleGenerateStrategy}
                                            disabled={isLoading || !context}
                                            className={`px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${
                                                isLoading || !context
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30'
                                            }`}
                                            whileHover={!isLoading && context ? { scale: 1.02, y: -1 } : {}}
                                            whileTap={!isLoading && context ? { scale: 0.98 } : {}}
                                        >
                                            {isLoading ? (
                                                <>
                                                    <motion.div 
                                                        className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full"
                                                        animate={{ rotate: 360 }}
                                                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                                    />
                                                    분석 중...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-4 h-4" />
                                                    AI 맞춤 전략 생성
                                                </>
                                            )}
                                        </motion.button>
                                        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            <label className="text-sm text-gray-600 whitespace-nowrap">타임라인:</label>
                                            <Input
                                                type="number"
                                                min={4}
                                                max={52}
                                                value={totalWeeks}
                                                onChange={(e) => setTotalWeeks(Math.max(4, Math.min(52, parseInt(e.target.value) || 12)))}
                                                className="w-16 bg-white border-gray-200 text-center"
                                            />
                                            <span className="text-sm text-gray-500">주</span>
                                        </div>
                                        {!context && (
                                            <span className="text-xs text-gray-400">
                                                맥락 입력 후 사용 가능
                                            </span>
                                        )}
                                        <AnimatePresence>
                                            {error && (
                                                <motion.span
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -10 }}
                                                    className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg"
                                                >
                                                    {error}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Gantt Chart */}
                                    <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl p-5 border border-gray-200">
                                        <GanttChart
                                            phases={displayPhases}
                                            totalWeeks={totalWeeks}
                                            onPhaseClick={(phase) => console.log('Phase clicked:', phase)}
                                        />
                                    </div>

                                    {/* Framework Explanation */}
                                    <AnimatePresence>
                                        {frameworkExplanation && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="mt-5 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                                                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-blue-900 mb-1.5">프레임워크 이론적 배경</h4>
                                                        <p className="text-sm text-blue-700 leading-relaxed">{frameworkExplanation}</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Schein's 8 Approaches (Lewin model) */}
                <AnimatePresence>
                    {scheinApproaches && scheinApproaches.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                        >
                            <Card className="bg-white/90 backdrop-blur-xl border-gray-200/80 mb-6 shadow-lg shadow-gray-200/50 overflow-hidden">
                                <CardHeader className="bg-gradient-to-r from-purple-50/80 to-pink-50/80 border-b border-gray-100">
                                    <CardTitle className="flex items-center gap-3 text-base font-semibold text-gray-800">
                                        <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm">
                                            2.5
                                        </span>
                                        <span className="flex items-center gap-2">
                                            Schein의 학습불안 감소 전략
                                            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">
                                                생존불안 &gt; 학습불안
                                            </span>
                                        </span>
                                    </CardTitle>
                                    <p className="text-sm text-gray-500 mt-1.5">
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
                                                ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300 shadow-md'
                                                : 'bg-white/70 border-gray-200 hover:border-purple-200 hover:shadow-sm'
                                        }`}
                                        onClick={() => setExpandedApproach(expandedApproach === idx ? null : idx)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold transition-colors ${
                                                expandedApproach === idx
                                                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-sm'
                                                    : 'bg-purple-100 text-purple-600'
                                            }`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`font-medium text-sm ${
                                                    expandedApproach === idx ? 'text-purple-900' : 'text-gray-800'
                                                }`}>
                                                    {item.approach}
                                                </h4>
                                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                    {item.description}
                                                </p>
                                                
                                                {/* Expanded Tactics */}
                                                {expandedApproach === idx && item.tactics.length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-purple-100">
                                                        <p className="text-xs font-medium text-purple-700 mb-2">실행 전술</p>
                                                        <ul className="space-y-1.5">
                                                            {item.tactics.map((tactic, tIdx) => (
                                                                <li key={tIdx} className="flex items-start gap-2 text-xs text-gray-600">
                                                                    <span className="text-purple-400 mt-0.5">▸</span>
                                                                    {tactic}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                            <svg 
                                                className={`w-4 h-4 text-gray-400 transition-transform ${expandedApproach === idx ? 'rotate-180' : ''}`} 
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
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Step 2.75: TO-BE 노드 상세분석 결과 (캐시된 drilldown) */}
                <AnimatePresence>
                    {hasDrilldowns && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                        >
                            <Card className="bg-white/90 backdrop-blur-xl border-gray-200/80 mb-6 shadow-lg shadow-gray-200/50 overflow-hidden">
                                <CardHeader className="bg-gradient-to-r from-cyan-50/80 to-blue-50/80 border-b border-gray-100">
                                    <CardTitle className="flex items-center gap-3 text-base font-semibold text-gray-800">
                                        <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm">
                                            2.8
                                        </span>
                                        <span className="flex items-center gap-2">
                                            AI 에이전트 상세분석 결과
                                            <span className="text-xs font-medium text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full">
                                                {tobeDrilldowns.length}개 분석 완료
                                            </span>
                                        </span>
                                    </CardTitle>
                                    <p className="text-sm text-gray-500 mt-1.5">
                                        Flow 캔버스에서 분석한 AI 에이전트별 세부 단계, 도구, 리소스 정보입니다.
                                    </p>
                                </CardHeader>
                                <CardContent className="pt-5">
                                    <div className="space-y-3">
                                        {tobeDrilldowns.map(({ nodeId, node, result }) => {
                                            const isExpanded = expandedDrilldown === nodeId;
                                            return (
                                                <div
                                                    key={nodeId}
                                                    className={`rounded-xl border transition-all ${
                                                        isExpanded
                                                            ? 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-300 shadow-md'
                                                            : 'bg-white/70 border-gray-200 hover:border-cyan-200 hover:shadow-sm'
                                                    }`}
                                                >
                                                    {/* Header */}
                                                    <div 
                                                        className="p-4 cursor-pointer flex items-center gap-3"
                                                        onClick={() => setExpandedDrilldown(isExpanded ? null : nodeId)}
                                                    >
                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                            node?.type === 'agent' 
                                                                ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white' 
                                                                : 'bg-cyan-100 text-cyan-600'
                                                        }`}>
                                                            {node?.type === 'agent' ? <Bot className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-gray-800 truncate">{node?.label}</span>
                                                                {node?.collaborationType && (
                                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                                                        node.collaborationType === 'copilot' ? 'bg-emerald-100 text-emerald-700' :
                                                                        node.collaborationType === 'monitor' ? 'bg-amber-100 text-amber-700' :
                                                                        'bg-purple-100 text-purple-700'
                                                                    }`}>
                                                                        {node.collaborationType}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                                                {result.subSteps?.length || 0}개 단계
                                                            </p>
                                                        </div>
                                                        {result.automationOverview?.totalTimeReduction && (
                                                            <div className="text-right">
                                                                <div className="flex items-center gap-1 text-emerald-600">
                                                                    <Zap className="w-3.5 h-3.5" />
                                                                    <span className="text-xs font-medium">시간 절감</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </div>

                                                    {/* Expanded Content */}
                                                    <AnimatePresence>
                                                        {isExpanded && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-4 pb-4 space-y-4 border-t border-cyan-100 pt-4">
                                                                    {/* Time Reduction */}
                                                                    {result.automationOverview?.totalTimeReduction && (
                                                                        <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-100">
                                                                            <div className="flex items-center gap-2 text-emerald-700">
                                                                                <Zap className="w-4 h-4" />
                                                                                <span className="text-sm font-medium">예상 시간 절감</span>
                                                                            </div>
                                                                            <p className="text-sm text-emerald-600 mt-1">{result.automationOverview.totalTimeReduction}</p>
                                                                        </div>
                                                                    )}

                                                                    {/* Sub Steps */}
                                                                    {result.subSteps && result.subSteps.length > 0 && (
                                                                        <div>
                                                                            <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                                                                <Layers className="w-4 h-4 text-cyan-500" />
                                                                                세부 단계
                                                                            </h4>
                                                                            <div className="space-y-2">
                                                                                {result.subSteps.map((step, idx) => (
                                                                                    <div key={idx} className="flex items-start gap-2 p-2 bg-white/80 rounded-lg">
                                                                                        <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-xs flex items-center justify-center font-medium shrink-0">
                                                                                            {idx + 1}
                                                                                        </span>
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <p className="text-sm font-medium text-gray-700">{step.label}</p>
                                                                                            {step.description && (
                                                                                                <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                                                                                            )}
                                                                                            {step.duration && (
                                                                                                <span className="text-[10px] text-gray-400 mt-1 inline-flex items-center gap-1">
                                                                                                    <Clock className="w-3 h-3" />
                                                                                                    {step.duration}
                                                                                                </span>
                                                                                            )}
                                                                                            {/* Tools from subStep */}
                                                                                            {step.tools && step.tools.length > 0 && (
                                                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                                                    {step.tools.map((tool, tIdx) => (
                                                                                                        <span key={tIdx} className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                                                                                                            {tool}
                                                                                                        </span>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Key Benefits */}
                                                                    {result.automationOverview?.keyBenefits && result.automationOverview.keyBenefits.length > 0 && (
                                                                        <div>
                                                                            <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                                                                <Zap className="w-4 h-4 text-emerald-500" />
                                                                                주요 효과
                                                                            </h4>
                                                                            <ul className="space-y-1">
                                                                                {result.automationOverview.keyBenefits.map((benefit, idx) => (
                                                                                    <li key={idx} className="text-xs text-gray-600 flex items-start gap-1.5">
                                                                                        <span className="text-emerald-500 mt-0.5">✓</span>
                                                                                        {benefit}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}

                                                                    {/* Skill-based Time Reduction */}
                                                                    {result.automationOverview?.skillBasedReduction && (
                                                                        <div>
                                                                            <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                                                                <Clock className="w-4 h-4 text-blue-500" />
                                                                                역량별 시간 절감
                                                                            </h4>
                                                                            <div className="grid grid-cols-3 gap-2">
                                                                                <div className="p-2 bg-blue-50 rounded-lg text-center">
                                                                                    <p className="text-[10px] text-blue-600 font-medium">Junior</p>
                                                                                    <p className="text-xs text-blue-700">{result.automationOverview.skillBasedReduction.junior}</p>
                                                                                </div>
                                                                                <div className="p-2 bg-indigo-50 rounded-lg text-center">
                                                                                    <p className="text-[10px] text-indigo-600 font-medium">Mid</p>
                                                                                    <p className="text-xs text-indigo-700">{result.automationOverview.skillBasedReduction.mid}</p>
                                                                                </div>
                                                                                <div className="p-2 bg-purple-50 rounded-lg text-center">
                                                                                    <p className="text-[10px] text-purple-600 font-medium">Senior</p>
                                                                                    <p className="text-xs text-purple-700">{result.automationOverview.skillBasedReduction.senior}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Step 3: Interactive Actions */}
                <AnimatePresence>
                    {selectedFramework && displayPhases.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                        >
                            <Card className="bg-white/90 backdrop-blur-xl border-gray-200/80 shadow-lg shadow-gray-200/50 overflow-hidden">
                                <CardHeader className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 border-b border-gray-100">
                                    <CardTitle className="flex items-center gap-3 text-base font-semibold text-gray-800">
                                        <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm">
                                            3
                                        </span>
                                        주요 액션 아이템
                                        <span className="text-xs text-gray-500 ml-auto bg-gray-100 px-2.5 py-1 rounded-full font-medium">
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
                                            className="p-4 bg-white/70 backdrop-blur-md rounded-xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:border-gray-300"
                                        >
                                            {/* Phase Header */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <div
                                                    className="w-3 h-3 rounded-full shadow-sm"
                                                    style={{ backgroundColor: phase.color }}
                                                />
                                                <h3 className="font-medium text-gray-800 flex-1">
                                                    {phase.name}
                                                </h3>
                                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {progress}%
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500 ease-out"
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
                                                    className="bg-white/90 border-gray-200 text-sm h-8 text-gray-800 placeholder:text-gray-400 focus:border-emerald-300 focus:ring-emerald-200/50"
                                                />
                                            </div>

                                            {/* Action Items with Checkboxes */}
                                            <ul className="space-y-3">
                                                {phase.actions.map((actionItem, idx) => {
                                                    const isCompleted = completedActions.has(
                                                        `${phase.id}-${idx}`
                                                    );
                                                    // 하위 호환성: string 또는 object 지원
                                                    const actionText = typeof actionItem === 'string' ? actionItem : actionItem.action;
                                                    const rationale = typeof actionItem === 'object' ? actionItem.rationale : null;
                                                    const value = typeof actionItem === 'object' ? actionItem.value : null;
                                                    return (
                                                        <li
                                                            key={idx}
                                                            className="group"
                                                        >
                                                            <div 
                                                                className="flex items-start gap-2 cursor-pointer"
                                                                onClick={() =>
                                                                    toggleAction(phase.id, idx)
                                                                }
                                                            >
                                                                <div
                                                                    className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0
                                                                    ${
                                                                        isCompleted
                                                                            ? 'bg-gradient-to-br from-emerald-500 to-teal-500 border-emerald-500 shadow-sm'
                                                                            : 'border-gray-300 group-hover:border-emerald-400'
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
                                                                <div className="flex-1">
                                                                    <span
                                                                        className={`text-sm font-medium transition-colors ${
                                                                            isCompleted
                                                                                ? 'text-gray-400 line-through'
                                                                                : 'text-gray-700 group-hover:text-gray-900'
                                                                        }`}
                                                                    >
                                                                        {actionText}
                                                                    </span>
                                                                    {(rationale || value) && !isCompleted && (
                                                                        <div className="mt-1 pl-0.5 space-y-0.5">
                                                                            {rationale && (
                                                                                <p className="text-xs text-gray-500 flex items-start gap-1">
                                                                                    <span className="text-amber-500 font-medium">왜:</span>
                                                                                    <span>{rationale}</span>
                                                                                </p>
                                                                            )}
                                                                            {value && (
                                                                                <p className="text-xs text-gray-500 flex items-start gap-1">
                                                                                    <span className="text-emerald-500 font-medium">효과:</span>
                                                                                    <span>{value}</span>
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
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
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* AI 에이전트 선택 Dialog */}
            <Dialog open={agentSelectOpen} onOpenChange={setAgentSelectOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Bot className="w-5 h-5 text-purple-600" />
                            AI 에이전트 선택
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto">
                        {agentNodes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p className="text-sm">생성된 AI 에이전트가 없습니다</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Flow 캔버스에서 To-Be 플로우를 먼저 생성하세요
                                </p>
                            </div>
                        ) : (
                            agentNodes.map((node) => (
                                <motion.div
                                    key={node.id}
                                    onClick={() => {
                                        setSelectedToBeNodeId(node.id);
                                        setStrategyScope('selected');
                                        setAgentSelectOpen(false);
                                    }}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                        selectedToBeNodeId === node.id
                                            ? 'border-purple-400 bg-purple-50'
                                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                                    }`}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                            selectedToBeNodeId === node.id 
                                                ? 'bg-purple-500 text-white' 
                                                : 'bg-purple-100 text-purple-600'
                                        }`}>
                                            <Bot className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-800 truncate">{node.label}</span>
                                                {selectedToBeNodeId === node.id && (
                                                    <CheckCircle2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                                )}
                                            </div>
                                            {node.collaborationType && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block font-medium ${
                                                    node.collaborationType === 'copilot' ? 'bg-emerald-100 text-emerald-700' :
                                                    node.collaborationType === 'monitor' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-purple-100 text-purple-700'
                                                }`}>
                                                    {node.collaborationType}
                                                </span>
                                            )}
                                            {node.description && (
                                                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{node.description}</p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
