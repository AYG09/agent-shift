'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Node, Edge } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import {
    useAppStore,
    SCENARIO_INFO,
    type ScenarioType,
    type UserContext,
} from '@/lib/store';
import { useAIGeneration } from '@/hooks/useAIGeneration';
import ApiKeySettings from '@/components/settings/ApiKeySettings';
import { ShareDialog } from '@/components/collaboration/ShareDialog';
import { Sparkles, Bot, Shield, Scale, Rocket, TrendingUp, Upload, FolderOpen, Save, Building2, Briefcase, FileText, Users, Clock, Wrench, AlertCircle, CheckCircle2, Layers, Zap, Settings2, ChevronRight, Eye, GitCompare, ArrowLeft, Check, ChevronsUpDown, X } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ENTERPRISE_PLATFORMS, PLATFORM_CATEGORIES, PLATFORM_CATEGORY_ORDER } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/useMounted';
import type { DrilldownResponse, NodeSplitResponse } from '@/lib/ai-schemas';
import {
    mapAiEdgesToStoreEdges,
    mapAiNodesToStoreNodes,
    mapStoreEdgesToReactFlowEdges,
    normalizeNodeType,
    normalizeStressLevel,
    parseDurationString,
} from '@/lib/flow-mappers';
import { industries, roles, timeScales } from '@/lib/flow-options';
import CollapsibleSection from '@/components/flow/CollapsibleSection';

// ReactFlow 동적 import
const FlowCanvas = dynamic(() => import('@/components/flow/FlowCanvas'), { ssr: false });
const SplitViewCanvas = dynamic(() => import('@/components/flow/SplitViewCanvas'), { ssr: false });
const ValueCard = dynamic(() => import('@/components/flow/ValueCard'), { ssr: false });

type CollaborationType = 'copilot' | 'monitor' | 'autonomous';

function isTimeScale(value: string): value is UserContext['timeScale'] {
    return timeScales.some((ts) => ts.value === value);
}

function isCollaborationType(value: unknown): value is CollaborationType {
    return value === 'copilot' || value === 'monitor' || value === 'autonomous';
}

export default function FlowPage() {
    const mounted = useMounted();
    const currentProjectId = useAppStore((state) => state.currentProjectId);

    if (!mounted) {
        return null;
    }

    return <FlowPageContent key={currentProjectId ?? 'flow'} />;
}

function FlowPageContent() {
    const {
        context,
        setContext,
        viewMode,
        setViewMode,
        asIsNodes,
        asIsEdges,
        toBeNodes,
        toBeEdges,
        setAsIsFlow,
        setToBeFlow,
        getCurrentProject,
        updateCurrentProject,
        currentProjectId,
    } = useAppStore();

    // 현재 프로젝트 정보
    const currentProject = getCurrentProject();
    
    // 자동 저장 debounce (2초)
    const saveTimeoutRef = useRef<number | null>(null);
    const savingIndicatorTimeoutRef = useRef<number | null>(null);
    const flushPendingSaveRef = useRef<() => void>(() => {});
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const clearAutosaveTimers = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        if (savingIndicatorTimeoutRef.current) {
            clearTimeout(savingIndicatorTimeoutRef.current);
            savingIndicatorTimeoutRef.current = null;
        }
    }, []);

    const commitSave = useCallback(() => {
        if (!currentProjectId) {
            return;
        }

        clearAutosaveTimers();

        updateCurrentProject();
        setIsSaving(false);
        setLastSaved(new Date());
    }, [clearAutosaveTimers, currentProjectId, updateCurrentProject]);

    const flushPendingSave = useCallback(() => {
        if (!saveTimeoutRef.current) {
            return;
        }

        commitSave();
    }, [commitSave]);

    const debouncedSave = useCallback(() => {
        if (!currentProjectId) return;

        clearAutosaveTimers();

        savingIndicatorTimeoutRef.current = window.setTimeout(() => {
            setIsSaving(true);
        }, 0);

        saveTimeoutRef.current = window.setTimeout(() => {
            commitSave();
        }, 2000);
    }, [clearAutosaveTimers, commitSave, currentProjectId]);

    useEffect(() => {
        flushPendingSaveRef.current = flushPendingSave;
    }, [flushPendingSave]);

    // 플로우 변경 시 자동 저장
    useEffect(() => {
        if (currentProjectId && (asIsNodes.length > 0 || toBeNodes.length > 0)) {
            debouncedSave();
        }

        return () => {
            clearAutosaveTimers();
        };
    }, [asIsNodes, asIsEdges, clearAutosaveTimers, context, currentProjectId, debouncedSave, toBeNodes, toBeEdges]);

    // 페이지 이탈 직전 마지막 변경을 즉시 flush해 저장 손실을 줄인다.
    useEffect(() => {
        return () => {
            flushPendingSaveRef.current();
        };
    }, []);

    useEffect(() => {
        const handlePageHide = () => {
            flushPendingSaveRef.current();
        };

        window.addEventListener('pagehide', handlePageHide);
        return () => {
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, []);

    const { isLoading, error, generateAsIsFlow, generateToBeFlow, generateNodeSplit, generateDrilldown } =
        useAIGeneration();

    // label로 value 찾기 헬퍼 함수
    const findIndustryValue = (label: string): string => {
        const found = industries.find(i => i.label === label || i.value === label);
        return found ? found.value : 'other';
    };

    const findRoleValue = (label: string): string => {
        const found = roles.find(r => r.label === label || r.value === label);
        return found ? found.value : 'other';
    };

    const initialIndustryValue = context ? findIndustryValue(context.industry) : '';
    const initialRoleValue = context ? findRoleValue(context.role) : '';
    const [industry, setIndustry] = useState(initialIndustryValue);
    const [customIndustry, setCustomIndustry] = useState(
        context && initialIndustryValue === 'other' ? context.industry : ''
    );
    const [role, setRole] = useState(initialRoleValue);
    const [customRole, setCustomRole] = useState(
        context && initialRoleValue === 'other' ? context.role : ''
    );
    const [task, setTask] = useState(context?.task || '');
    const [teamSize, setTeamSize] = useState(context?.teamSize || '');
    const [tooling, setTooling] = useState(context?.tooling || '');
    const [painPoints, setPainPoints] = useState(context?.painPoints || '');
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(context?.platforms || []);
    const [platformsOpen, setPlatformsOpen] = useState(false);
    const [timeScale, setTimeScale] = useState<
        'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project'
    >(context?.timeScale || 'weekly');
    const [step, setStep] = useState<'context' | 'canvas'>(asIsNodes.length > 0 ? 'canvas' : 'context');
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedScenario, setSelectedScenario] = useState<
        'conservative' | 'balanced' | 'aggressive'
    >('balanced');
    // 모바일 사이드바 토글 상태 (Hooks 순서 보장을 위해 상단에 선언)
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Drilldown state
    const [drilldownNode, setDrilldownNode] = useState<{
        id: string;
        label: string;
        description?: string;
        type: string;
        collaborationType?: string;
    } | null>(null);
    const [drilldownResult, setDrilldownResult] = useState<{
        flowType?: 'asis' | 'tobe';
        subSteps: Array<{
            id: string;
            label: string;
            description: string;
            duration?: string;
            tools?: string[];
            // AS-IS 전용
            painPoints?: string;
            // TO-BE 전용
            aiImplementation?: {
                method: string;
                technology: string[];
                platforms?: string[];
                automationLevel?: 'full' | 'partial' | 'assisted';
            };
            resources?: Array<{
                type: 'youtube' | 'docs' | 'article' | 'tutorial';
                title: string;
                url?: string;
                description?: string;
            }>;
        }>;
        summary: string;
        automationOverview?: {
            totalTimeReduction?: string;
            keyBenefits?: string[];
            implementationTips?: string[];
        };
    } | null>(null);
    const drilldownFlowType: 'as-is' | 'to-be' = viewMode === 'tobe' ? 'to-be' : 'as-is';

    const selectedNodeData = selectedNode?.data;
    const selectedNodeLabel =
        selectedNodeData &&
        typeof selectedNodeData === 'object' &&
        'label' in selectedNodeData &&
        typeof selectedNodeData.label === 'string'
            ? selectedNodeData.label
            : '';
    const selectedNodeCollaborationType =
        selectedNodeData &&
        typeof selectedNodeData === 'object' &&
        'collaborationType' in selectedNodeData &&
        isCollaborationType(selectedNodeData.collaborationType)
            ? selectedNodeData.collaborationType
            : undefined;

    // ReactFlow 형식으로 변환

    const handleStart = () => {
        const finalIndustry =
            industry === 'other'
                ? customIndustry
                : industries.find((i) => i.value === industry)?.label || industry;
        const finalRole =
            role === 'other' ? customRole : roles.find((r) => r.value === role)?.label || role;

        const isIndustryValid = industry !== 'other' || customIndustry.trim() !== '';
        const isRoleValid = role !== 'other' || customRole.trim() !== '';

        if (industry && role && task && isIndustryValid && isRoleValid) {
            setContext({
                industry: finalIndustry,
                role: finalRole,
                task,
                timeScale,
                teamSize,
                tooling,
                painPoints,
                platforms: selectedPlatforms,
            });
            setStep('canvas');
        }
    };

    const handleGenerateAsIs = async () => {
        if (!context) return;

        const result = await generateAsIsFlow({
            industry:
                industries.find((i) => i.value === context.industry)?.label || context.industry,
            role: roles.find((r) => r.value === context.role)?.label || context.role,
            task: context.task,
            timeScale: context.timeScale,
            teamSize: context.teamSize,
            tooling: context.tooling,
            painPoints: context.painPoints,
        });

        if (result) {
            // AI 응답을 Zustand FlowNode/FlowEdge 형식으로 변환
            const storeNodes = mapAiNodesToStoreNodes(result.nodes);
            const storeEdges = mapAiEdgesToStoreEdges(result.edges);
            setAsIsFlow(storeNodes, storeEdges);
        }
    };

    const handleGenerateToBe = async () => {
        if (!context || asIsNodes.length === 0) return;

        const result = await generateToBeFlow(
            {
                industry:
                    industries.find((i) => i.value === context.industry)?.label || context.industry,
                role: roles.find((r) => r.value === context.role)?.label || context.role,
                task: context.task,
                timeScale: context.timeScale,
                teamSize: context.teamSize,
                tooling: context.tooling,
                painPoints: context.painPoints,
                platforms: context.platforms,  // 사용자 선택 AI 플랫폼
            },
            asIsNodes.map((n) => ({
                id: n.id,
                label: n.label,
                description: n.description,
                type: n.type,
                stressLevel: n.stressLevel,
                position: n.position,
            })),
            selectedScenario
        );

        if (result) {
            // AI 응답을 Zustand FlowNode 형식으로 변환
            const storeNodes = mapAiNodesToStoreNodes(result.nodes);
            const storeEdges = mapAiEdgesToStoreEdges(result.edges);
            setToBeFlow(storeNodes, storeEdges);
            // 자동으로 To-Be 뷰로 전환
            setViewMode('tobe');
        }
    };

    // 노드 세분화 (우클릭 메뉴에서 호출)
    const handleNodeSplit = async (nodeId: string, flowType: 'asis' | 'tobe') => {
        const nodes = flowType === 'asis' ? asIsNodes : toBeNodes;
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || !context) return null;

        const result = await generateNodeSplit(
            { industry: context.industry, role: context.role, task: context.task, platforms: context.platforms },
            { id: node.id, label: node.label, description: node.description, type: node.type, metrics: node.metrics },
            flowType
        );

        if (result) {
            // FlowNode 형식으로 변환 (duration/durationUnit → metrics 변환)
            return {
                nodes: result.nodes.map(
                    (n: NodeSplitResponse['nodes'][number]) => ({
                        id: n.id,
                        label: n.label,
                        description: n.description,
                        type: normalizeNodeType(n.type),
                        stressLevel: normalizeStressLevel(n.stressLevel),
                        position: { x: 0, y: 0 }, // FlowCanvas에서 재배치
                        metrics: n.duration ? {
                            duration: n.duration,
                            durationUnit: n.durationUnit || 'minutes',
                            timeMinutes: n.durationUnit === 'minutes' ? n.duration : undefined,
                        } : undefined,
                    })
                ),
                edges: [] as { id: string; source: string; target: string }[],
            };
        }
        return null;
    };

    // 드릴다운 핸들러
    const handleDrilldown = async (nodeId: string) => {
        const nodes = viewMode === 'tobe' ? toBeNodes : asIsNodes;
        const edges = viewMode === 'tobe' ? toBeEdges : asIsEdges;
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || !context) return;

        setDrilldownNode({
            id: node.id,
            label: node.label,
            description: node.description,
            type: node.type,
            collaborationType: node.collaborationType,
        });

        const flowType = viewMode === 'tobe' ? 'to-be' : 'as-is';

        // 전체 노드/엣지를 API에 전달하여 플로우 컨텍스트 파악 (metrics 포함)
        const allNodesForContext = nodes.map(n => ({
            id: n.id,
            label: n.label,
            description: n.description,
            type: n.type,
            collaborationType: n.collaborationType,
            metrics: n.metrics,  // 시간 정보 포함
        }));
        const allEdgesForContext = edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
        }));

        // AS-IS 원본 노드들 (TO-BE 분석 시 시간 비교용)
        const asIsNodesForContext = asIsNodes.map(n => ({
            id: n.id,
            label: n.label,
            description: n.description,
            type: n.type,
            metrics: n.metrics,  // 시간 정보 포함!
        }));

        const result = await generateDrilldown(
            { industry: context.industry, role: context.role, task: context.task, platforms: context.platforms },
            { 
                id: node.id, 
                label: node.label, 
                description: node.description, 
                type: node.type, 
                collaborationType: node.collaborationType,
                metrics: node.metrics,  // 현재 노드의 시간 정보
            },
            flowType,
            allNodesForContext,
            allEdgesForContext,
            viewMode === 'tobe' ? asIsNodesForContext : undefined  // TO-BE일 때만 AS-IS 전달
        );

        if (result) {
            setDrilldownResult({
                flowType: viewMode === 'tobe' ? 'tobe' : 'asis',
                subSteps: result.subSteps.map((step: DrilldownResponse['subSteps'][number]) => ({
                    id: step.id,
                    label: step.label,
                    description: step.description,
                    duration: step.duration,
                    tools: step.tools,
                    painPoints: step.painPoints,
                    aiImplementation: step.aiImplementation
                        ? {
                            ...step.aiImplementation,
                            technology: step.aiImplementation.technology ?? [],
                        }
                        : undefined,
                    resources: step.resources,
                })),
                summary: result.summary,
                automationOverview: result.automationOverview,
            });
        }
    };

    // 드릴다운 결과를 플로우에 적용 (기존 노드를 세부 단계로 대체)
    const applyDrilldownToFlow = () => {
        if (!drilldownNode || !drilldownResult) return;

        const targetNodes = viewMode === 'tobe' ? toBeNodes : asIsNodes;
        const targetEdges = viewMode === 'tobe' ? toBeEdges : asIsEdges;
        
        const originalNode = targetNodes.find((n) => n.id === drilldownNode.id);
        if (!originalNode) return;

        // 새 노드들 생성 (기존 노드 위치 기준으로 배치)
        const baseY = originalNode.position.y;
        const spacing = 100;

        const newNodes: typeof targetNodes = drilldownResult.subSteps.map((step, idx) => {
            const parsed = parseDurationString(step.duration);
            return {
                id: `${drilldownNode.id}-step-${idx}`,
                type: 'task' as const, // FlowNode 타입에 맞게 'task' 사용
                label: step.label,
                description: step.description,
                stressLevel: 'low' as const,
                position: { x: originalNode.position.x, y: baseY + idx * spacing },
                metrics: parsed ? {
                    duration: parsed.duration,
                    durationUnit: parsed.durationUnit,
                } : undefined,
            };
        });

        // 기존 엣지에서 원본 노드 연결 찾기
        const incomingEdges = targetEdges.filter((e) => e.target === drilldownNode.id);
        const outgoingEdges = targetEdges.filter((e) => e.source === drilldownNode.id);

        // 새 엣지: 하위 노드들 순차 연결
        const subEdges = newNodes.slice(0, -1).map((node, idx) => ({
            id: `edge-${node.id}-to-${newNodes[idx + 1].id}`,
            source: node.id,
            target: newNodes[idx + 1].id,
            sourceHandle: 'bottom',
            targetHandle: 'top-target',
        }));

        // 기존 incoming을 첫 번째 하위 노드로 연결
        const reconnectedIncoming = incomingEdges.map((e) => ({
            ...e,
            target: newNodes[0].id,
            sourceHandle: undefined,
            targetHandle: undefined,
        }));

        // 기존 outgoing을 마지막 하위 노드에서 연결
        const reconnectedOutgoing = outgoingEdges.map((e) => ({
            ...e,
            source: newNodes[newNodes.length - 1].id,
            sourceHandle: undefined,
            targetHandle: undefined,
        }));

        // 업데이트된 노드/엣지 배열
        const updatedNodes = [
            ...targetNodes.filter((n) => n.id !== drilldownNode.id),
            ...newNodes,
        ];
        const updatedEdges = [
            ...targetEdges.filter(
                (e) => e.source !== drilldownNode.id && e.target !== drilldownNode.id
            ),
            ...subEdges,
            ...reconnectedIncoming,
            ...reconnectedOutgoing,
        ];

        // Store 업데이트
        if (viewMode === 'tobe') {
            setToBeFlow(updatedNodes, updatedEdges);
        } else {
            setAsIsFlow(updatedNodes, updatedEdges);
        }

        // 다이얼로그 닫기
        closeDrilldown();
    };

    // 드릴다운 다이얼로그 닫기
    const closeDrilldown = () => {
        setDrilldownNode(null);
        setDrilldownResult(null);
    };

    // Context Form
    if (step === 'context') {
        const formProgress = [
            { filled: !!industry, label: '산업군' },
            { filled: !!role, label: '직무' },
            { filled: !!task, label: '업무명' },
        ];
        const filledCount = formProgress.filter(f => f.filled).length;
        const progressPercent = (filledCount / formProgress.length) * 100;
        const isFormValid = industry && role && task && 
            (industry !== 'other' || customIndustry) && 
            (role !== 'other' || customRole);

        return (
            <div className="min-h-screen overflow-y-auto pro-canvas relative text-[#18181B] p-4 sm:p-8 pb-24 md:pb-8 safe-area-padding">
                <div className="max-w-2xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Link
                            href="/"
                            className="text-[#71717A] hover:text-[#18181B] mb-6 sm:mb-8 inline-flex items-center gap-2 transition-colors touch-target"
                        >
                            ← 홈으로
                        </Link>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        <Card className="bg-white/80 backdrop-blur-2xl border-white/60 shadow-2xl shadow-blue-500/10 overflow-hidden">
                            {/* 진행률 표시줄 */}
                            <div className="px-6 pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-[#71717A]">
                                        필수 입력 {filledCount}/{formProgress.length}
                                    </span>
                                    <span className="text-xs font-medium text-blue-600">
                                        {Math.round(progressPercent)}%
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progressPercent}%` }}
                                        transition={{ duration: 0.5, ease: 'easeOut' }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2">
                                    {formProgress.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5 text-xs">
                                            {item.filled ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                            ) : (
                                                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />
                                            )}
                                            <span className={item.filled ? 'text-green-600' : 'text-gray-400'}>
                                                {item.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <CardHeader className="pb-2">
                                <CardTitle className="text-xl sm:text-2xl text-[#18181B] font-semibold flex items-center gap-2 sm:gap-3">
                                    <motion.div 
                                        className="p-1.5 sm:p-2 bg-blue-100 rounded-lg sm:rounded-xl"
                                        whileHover={{ scale: 1.05, rotate: 5 }}
                                        transition={{ type: 'spring', stiffness: 300 }}
                                    >
                                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                                    </motion.div>
                                    업무 맥락 입력
                                </CardTitle>
                                <p className="text-xs sm:text-sm text-[#71717A] mt-1">
                                    AI가 맞춤형 업무 프로세스를 분석할 수 있도록 정보를 입력해주세요
                                </p>
                            </CardHeader>

                            <CardContent className="space-y-6 pt-4">
                                {/* 산업군 & 직무 */}
                                <motion.div 
                                    className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <Building2 className="w-4 h-4 text-blue-500" />
                                            산업군 <span className="text-red-500">*</span>
                                        </label>
                                        <div className="space-y-2">
                                            <Select value={industry} onValueChange={setIndustry}>
                                                <SelectTrigger className={`bg-white/70 border-2 transition-all duration-200 ${industry ? 'border-green-300 bg-green-50/50' : 'border-[#E2E4E9] hover:border-blue-300'} text-[#18181B]`}>
                                                    <SelectValue placeholder="선택" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {industries.map((ind) => (
                                                        <SelectItem key={ind.value} value={ind.value}>
                                                            {ind.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <AnimatePresence>
                                                {industry === 'other' && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <Input
                                                            value={customIndustry}
                                                            onChange={(e) => setCustomIndustry(e.target.value)}
                                                            placeholder="산업군 직접 입력"
                                                            className="bg-white/70 border-2 border-blue-400 text-[#18181B] placeholder:text-[#A1A1AA] focus:ring-2 focus:ring-blue-200"
                                                            autoFocus
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <Briefcase className="w-4 h-4 text-blue-500" />
                                            직무 <span className="text-red-500">*</span>
                                        </label>
                                        <div className="space-y-2">
                                            <Select value={role} onValueChange={setRole}>
                                                <SelectTrigger className={`bg-white/70 border-2 transition-all duration-200 ${role ? 'border-green-300 bg-green-50/50' : 'border-[#E2E4E9] hover:border-blue-300'} text-[#18181B]`}>
                                                    <SelectValue placeholder="선택" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {roles.map((r) => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            {r.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <AnimatePresence>
                                                {role === 'other' && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <Input
                                                            value={customRole}
                                                            onChange={(e) => setCustomRole(e.target.value)}
                                                            placeholder="직무 직접 입력"
                                                            className="bg-white/70 border-2 border-blue-400 text-[#18181B] placeholder:text-[#A1A1AA] focus:ring-2 focus:ring-blue-200"
                                                            autoFocus
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </motion.div>

                                {/* 업무명 */}
                                <motion.div 
                                    className="space-y-2"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-500" />
                                        업무명 <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        value={task}
                                        onChange={(e) => setTask(e.target.value)}
                                        placeholder="예: 주간 영업 실적 취합 및 보고"
                                        className={`bg-white/70 border-2 transition-all duration-200 ${task ? 'border-green-300 bg-green-50/50' : 'border-[#E2E4E9] hover:border-blue-300'} text-[#18181B] placeholder:text-[#A1A1AA]`}
                                    />
                                </motion.div>

                                {/* 팀 규모 & 업무 주기 */}
                                <motion.div 
                                    className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <Users className="w-4 h-4 text-gray-400" />
                                            팀 규모 <span className="text-xs text-gray-400">(선택)</span>
                                        </label>
                                        <Select value={teamSize} onValueChange={setTeamSize}>
                                            <SelectTrigger className="bg-white/70 border-2 border-[#E2E4E9] hover:border-blue-300 transition-all duration-200 text-[#18181B]">
                                                <SelectValue placeholder="선택" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1-5">1-5명</SelectItem>
                                                <SelectItem value="5-20">5-20명</SelectItem>
                                                <SelectItem value="20-50">20-50명</SelectItem>
                                                <SelectItem value="50+">50명 이상</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            업무 주기 <span className="text-xs text-gray-400">(선택)</span>
                                        </label>
                                        <Select
                                            value={timeScale}
                                            onValueChange={(v) => {
                                                if (isTimeScale(v)) {
                                                    setTimeScale(v);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="bg-white/70 border-2 border-[#E2E4E9] hover:border-blue-300 transition-all duration-200 text-[#18181B]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {timeScales.map((ts) => (
                                                    <SelectItem key={ts.value} value={ts.value}>
                                                        {ts.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </motion.div>

                                {/* 도구 & 고충 */}
                                <motion.div 
                                    className="space-y-4"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                >
                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <Wrench className="w-4 h-4 text-gray-400" />
                                            사용 중인 도구 <span className="text-xs text-gray-400">(선택)</span>
                                        </label>
                                        <Input
                                            value={tooling}
                                            onChange={(e) => setTooling(e.target.value)}
                                            placeholder="예: Excel, Slack, Jira, Notion"
                                            className="bg-white/70 border-2 border-[#E2E4E9] hover:border-blue-300 transition-all duration-200 text-[#18181B] placeholder:text-[#A1A1AA]"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 text-gray-400" />
                                            주요 고충 (Pain Points) <span className="text-xs text-gray-400">(선택)</span>
                                        </label>
                                        <Input
                                            value={painPoints}
                                            onChange={(e) => setPainPoints(e.target.value)}
                                            placeholder="예: 데이터 복사/붙여넣기에 시간이 너무 많이 걸림"
                                            className="bg-white/70 border-2 border-[#E2E4E9] hover:border-blue-300 transition-all duration-200 text-[#18181B] placeholder:text-[#A1A1AA]"
                                        />
                                    </div>
                                </motion.div>

                                {/* AI 에이전트 플랫폼 선택 (복수) */}
                                <motion.div 
                                    className="space-y-3"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.55 }}
                                >
                                    <div className="space-y-2">
                                        <label className="text-sm text-[#525252] font-medium flex items-center gap-2">
                                            <Bot className="w-4 h-4 text-blue-500" />
                                            AI 에이전트 플랫폼 <span className="text-xs text-gray-400">(복수 선택 가능)</span>
                                        </label>
                                        <p className="text-xs text-gray-400">
                                            조직에서 사용 중이거나 도입 예정인 플랫폼을 선택하면 맞춤 도구를 추천해드립니다
                                        </p>
                                    </div>
                                    
                                    <Popover open={platformsOpen} onOpenChange={setPlatformsOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={platformsOpen}
                                                className={cn(
                                                    "w-full justify-between bg-white/70 border-2 transition-all duration-200 min-h-[42px] h-auto",
                                                    selectedPlatforms.length > 0
                                                        ? "border-blue-300 bg-blue-50/50"
                                                        : "border-[#E2E4E9] hover:border-blue-300"
                                                )}
                                            >
                                                {selectedPlatforms.length === 0 ? (
                                                    <span className="text-gray-400">플랫폼 선택...</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1 py-1">
                                                        {selectedPlatforms.slice(0, 3).map((value) => {
                                                            const platform = ENTERPRISE_PLATFORMS.find(p => p.value === value);
                                                            return platform ? (
                                                                <Badge
                                                                    key={value}
                                                                    variant="secondary"
                                                                    className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-0.5 text-xs"
                                                                >
                                                                    {platform.label}
                                                                    <button
                                                                        type="button"
                                                                        className="ml-1 hover:text-blue-900"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedPlatforms(prev => prev.filter(v => v !== value));
                                                                        }}
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </Badge>
                                                            ) : null;
                                                        })}
                                                        {selectedPlatforms.length > 3 && (
                                                            <Badge variant="outline" className="text-xs">
                                                                +{selectedPlatforms.length - 3}개
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="플랫폼 검색..." className="h-10" />
                                                <CommandList className="max-h-[300px]">
                                                    <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                                                    {PLATFORM_CATEGORY_ORDER.map((category) => {
                                                        const platformsInCategory = ENTERPRISE_PLATFORMS.filter(
                                                            p => p.category === category
                                                        );
                                                        if (platformsInCategory.length === 0) return null;
                                                        
                                                        return (
                                                            <CommandGroup 
                                                                key={category} 
                                                                heading={PLATFORM_CATEGORIES[category]}
                                                            >
                                                                {platformsInCategory.map((platform) => {
                                                                    const isSelected = selectedPlatforms.includes(platform.value);
                                                                    return (
                                                                        <CommandItem
                                                                            key={platform.value}
                                                                            value={platform.label}
                                                                            onSelect={() => {
                                                                                setSelectedPlatforms(prev =>
                                                                                    isSelected
                                                                                        ? prev.filter(v => v !== platform.value)
                                                                                        : [...prev, platform.value]
                                                                                );
                                                                            }}
                                                                        >
                                                                            <div className={cn(
                                                                                "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                                                                                isSelected
                                                                                    ? "bg-blue-500 border-blue-500 text-white"
                                                                                    : "border-gray-300"
                                                                            )}>
                                                                                {isSelected && <Check className="h-3 w-3" />}
                                                                            </div>
                                                                            {platform.label}
                                                                        </CommandItem>
                                                                    );
                                                                })}
                                                            </CommandGroup>
                                                        );
                                                    })}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    
                                    {/* 선택된 플랫폼 전체 표시 (3개 초과 시) */}
                                    {selectedPlatforms.length > 3 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {selectedPlatforms.map((value) => {
                                                const platform = ENTERPRISE_PLATFORMS.find(p => p.value === value);
                                                return platform ? (
                                                    <Badge
                                                        key={value}
                                                        variant="secondary"
                                                        className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-0.5 text-xs"
                                                    >
                                                        {platform.label}
                                                        <button
                                                            type="button"
                                                            className="ml-1 hover:text-blue-900"
                                                            onClick={() => {
                                                                setSelectedPlatforms(prev => prev.filter(v => v !== value));
                                                            }}
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </Badge>
                                                ) : null;
                                            })}
                                        </div>
                                    )}
                                </motion.div>

                                {/* 시작 버튼 */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                >
                                    <motion.button
                                        onClick={handleStart}
                                        disabled={!isFormValid}
                                        className={`w-full py-3 sm:py-4 px-4 sm:px-6 rounded-xl font-semibold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 transition-all duration-300 touch-target ${
                                            isFormValid
                                                ? 'bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40'
                                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                        whileHover={isFormValid ? { scale: 1.02, y: -2 } : {}}
                                        whileTap={isFormValid ? { scale: 0.98 } : {}}
                                    >
                                        <Rocket className="w-5 h-5" />
                                        Flow 캔버스 시작하기
                                        {isFormValid && (
                                            <motion.span
                                                className="ml-1"
                                                animate={{ x: [0, 4, 0] }}
                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                            >
                                                →
                                            </motion.span>
                                        )}
                                    </motion.button>
                                    {!isFormValid && (
                                        <p className="text-center text-xs text-gray-400 mt-2">
                                            필수 항목(*)을 모두 입력해주세요
                                        </p>
                                    )}
                                </motion.div>
                            </CardContent>
                        </Card>
                    </motion.div>
                    
                    {/* 모바일 하단 네비게이션 바 공간 확보 */}
                    <div className="h-32 md:hidden" aria-hidden="true" />
                </div>
            </div>
        );
    }

    // 현재 표시할 노드/엣지
    const displayAsIsNodes: Node[] =
        asIsNodes.length > 0
            ? asIsNodes.map((n) => ({
                id: n.id,
                type: n.type,
                position: n.position,
                data: {
                    label: n.label,
                    description: n.description,
                    terminalType: n.terminalType,
                    ioType: n.ioType,
                    stressLevel: n.stressLevel,
                    metrics: n.metrics,
                },
            }))
            : [
                {
                    id: 'placeholder',
                    type: 'task',
                    position: { x: 250, y: 100 },
                    data: { label: '✨ AI 플로우 생성을 클릭하세요', stressLevel: 'low' },
                },
            ];

    const displayAsIsEdges: Edge[] =
        asIsNodes.length > 0
            ? mapStoreEdgesToReactFlowEdges(asIsEdges)
            : [];

    const displayToBeNodes: Node[] =
        toBeNodes.length > 0
            ? toBeNodes.map((n) => ({
                id: n.id,
                type: n.type,
                position: n.position,
                data: {
                    label: n.label,
                    description: n.description,
                    terminalType: n.terminalType,
                    ioType: n.ioType,
                    collaborationType: n.collaborationType,
                    agentDescription: n.agentDescription,
                    stressLevel: n.stressLevel,
                    metrics: n.metrics,
                },
            }))
            : displayAsIsNodes;

    const displayToBeEdges: Edge[] =
        toBeNodes.length > 0
            ? mapStoreEdgesToReactFlowEdges(toBeEdges)
            : displayAsIsEdges;

    // Canvas with Sidebar
    return (
        <div className="h-screen pro-canvas text-[#18181B] flex overflow-hidden">
            {/* Mobile Sidebar Toggle */}
            <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-xl shadow-lg touch-target"
            >
                {sidebarOpen ? (
                    <X className="w-5 h-5 text-gray-700" />
                ) : (
                    <Settings2 className="w-5 h-5 text-gray-700" />
                )}
            </button>

            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div 
                    className="md:hidden fixed inset-0 bg-black/30 z-30"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar - Pro Glassmorphism */}
            <motion.div 
                className={`
                    fixed md:relative z-40
                    w-72 h-full
                    bg-white/90 backdrop-blur-2xl border-r border-gray-200/80 
                    flex flex-col overflow-hidden shadow-xl shadow-gray-200/50
                    transform transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
            >
                {/* Fixed Header */}
                <div className="p-4 pb-3 border-b border-gray-200/50 shrink-0 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
                    <div className="flex items-center justify-between">
                        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Agent Shift
                        </Link>
                        {currentProject && (
                            <div className="flex items-center gap-1.5">
                                {isSaving ? (
                                    <motion.div 
                                        className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full"
                                        animate={{ opacity: [0.5, 1, 0.5] }}
                                        transition={{ repeat: Infinity, duration: 1.5 }}
                                    >
                                        <Save className="w-3 h-3" />
                                        저장 중
                                    </motion.div>
                                ) : lastSaved && (
                                    <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                        <CheckCircle2 className="w-3 h-3" />
                                        저장됨
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {currentProject && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-white/60 rounded-lg px-2.5 py-1.5">
                            <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                            <span className="truncate flex-1 font-medium" title={currentProject.name}>
                                {currentProject.name}
                            </span>
                        </div>
                    )}
                </div>

                {/* Scrollable Content - 모바일에서 하단 네비게이션 공간 확보 */}
                <div className="flex-1 overflow-y-auto p-4 pt-3 pb-24 md:pb-4 space-y-3">
                    {/* 현재 분석 중 - 개선된 카드 */}
                    <CollapsibleSection title="업무 컨텍스트" icon={FileText} defaultOpen={true}>
                        <div className="space-y-2 mt-2">
                            <div className="text-sm font-semibold text-gray-800 line-clamp-2">{context?.task}</div>
                            <div className="flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                                    <Building2 className="w-3 h-3" />
                                    {industries.find((i) => i.value === context?.industry || i.label === context?.industry)?.label?.split(' ')[0] || context?.industry}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                                    <Briefcase className="w-3 h-3" />
                                    {roles.find((r) => r.value === context?.role || r.label === context?.role)?.label?.split(' ')[0] || context?.role}
                                </span>
                            </div>
                        </div>
                    </CollapsibleSection>

                    {/* 협업 시작 버튼 */}
                    <ShareDialog />

                    {/* AI 생성 버튼 - 개선된 디자인 */}
                    <CollapsibleSection 
                        title="AI 플로우 생성" 
                        icon={Sparkles} 
                        defaultOpen={true}
                        badge={
                            asIsNodes.length > 0 && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                                    {asIsNodes.length} 노드
                                </span>
                            )
                        }
                    >
                        <div className="space-y-2 mt-2">
                            <motion.button
                                onClick={handleGenerateAsIs}
                                disabled={isLoading}
                                className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                    isLoading 
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                        : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-md shadow-green-500/20 hover:shadow-lg hover:shadow-green-500/30'
                                }`}
                                whileHover={!isLoading ? { scale: 1.02 } : {}}
                                whileTap={!isLoading ? { scale: 0.98 } : {}}
                            >
                                {isLoading ? (
                                    <>
                                        <motion.div 
                                            className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full"
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                        />
                                        AI 생성 중...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        As-Is 플로우 생성
                                    </>
                                )}
                            </motion.button>
                            <motion.button
                                onClick={handleGenerateToBe}
                                disabled={isLoading || asIsNodes.length === 0}
                                className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                    isLoading || asIsNodes.length === 0
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                        : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30'
                                }`}
                                whileHover={!isLoading && asIsNodes.length > 0 ? { scale: 1.02 } : {}}
                                whileTap={!isLoading && asIsNodes.length > 0 ? { scale: 0.98 } : {}}
                            >
                                {isLoading ? (
                                    <>
                                        <motion.div 
                                            className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full"
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                        />
                                        AI 변환 중...
                                    </>
                                ) : (
                                    <>
                                        <Bot className="w-4 h-4" />
                                        To-Be 변환
                                        {asIsNodes.length === 0 && <span className="text-xs opacity-70">(As-Is 필요)</span>}
                                    </>
                                )}
                            </motion.button>
                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="text-xs text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-lg flex items-start gap-2"
                                    >
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </CollapsibleSection>

                    {/* Scenario Selector - 개선된 디자인 */}
                    <AnimatePresence>
                        {toBeNodes.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                            >
                                <CollapsibleSection title="AI 자동화 수준" icon={Zap} defaultOpen={true}>
                                    <div className="space-y-1.5 mt-2">
                                        {[
                                            {
                                                value: 'conservative' as ScenarioType,
                                                icon: Shield,
                                                activeClasses:
                                                    'bg-amber-50 text-amber-700 border-2 border-amber-200 shadow-sm',
                                                iconActiveClass: 'text-amber-500',
                                            },
                                            {
                                                value: 'balanced' as ScenarioType,
                                                icon: Scale,
                                                activeClasses:
                                                    'bg-blue-50 text-blue-700 border-2 border-blue-200 shadow-sm',
                                                iconActiveClass: 'text-blue-500',
                                            },
                                            {
                                                value: 'aggressive' as ScenarioType,
                                                icon: Rocket,
                                                activeClasses:
                                                    'bg-emerald-50 text-emerald-700 border-2 border-emerald-200 shadow-sm',
                                                iconActiveClass: 'text-emerald-500',
                                            },
                                        ].map((scenario) => {
                                            const info = SCENARIO_INFO[scenario.value];
                                            return (
                                            <motion.button
                                                key={scenario.value}
                                                onClick={() => setSelectedScenario(scenario.value as typeof selectedScenario)}
                                                className={`w-full text-left p-2.5 rounded-xl text-sm transition-all flex items-center gap-3 ${
                                                    selectedScenario === scenario.value
                                                        ? scenario.activeClasses
                                                        : 'text-gray-600 hover:bg-gray-50 border-2 border-transparent'
                                                }`}
                                                whileHover={{ x: 2 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <scenario.icon className={`w-4 h-4 ${selectedScenario === scenario.value ? scenario.iconActiveClass : 'text-gray-400'}`} />
                                                <div className="flex-1">
                                                    <div className="font-medium">{info.label}</div>
                                                    <div className="text-xs opacity-70">{info.desc}</div>
                                                </div>
                                                {selectedScenario === scenario.value && (
                                                    <CheckCircle2 className={`w-4 h-4 ${scenario.iconActiveClass}`} />
                                                )}
                                            </motion.button>
                                        )})}
                                    </div>
                                    {/* 선택된 시나리오 상세 정보 */}
                                    <AnimatePresence>
                                        {selectedScenario && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                                            >
                                                <div className="text-xs text-gray-500 space-y-1">
                                                    {SCENARIO_INFO[selectedScenario as ScenarioType].details.map((detail, idx) => (
                                                        <div key={idx} className="flex items-start gap-1.5">
                                                            <span className="text-gray-400 mt-0.5">•</span>
                                                            <span>{detail}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </CollapsibleSection>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 뷰 모드 탭 바 - 개선된 디자인 */}
                    <CollapsibleSection title="플로우 뷰" icon={Eye} defaultOpen={true}>
                        <div className="grid grid-cols-3 gap-1.5 mt-2 bg-gray-100/80 rounded-xl p-1.5">
                            {[
                                {
                                    mode: 'asis',
                                    label: 'As-Is',
                                    icon: Layers,
                                    activeClasses: 'bg-white text-blue-600 shadow-md',
                                },
                                {
                                    mode: 'tobe',
                                    label: 'To-Be',
                                    icon: Bot,
                                    activeClasses: 'bg-white text-emerald-600 shadow-md',
                                },
                                {
                                    mode: 'split',
                                    label: '비교',
                                    icon: GitCompare,
                                    activeClasses: 'bg-white text-purple-600 shadow-md',
                                },
                            ].map((view) => (
                                <motion.button
                                    key={view.mode}
                                    onClick={() => setViewMode(view.mode as typeof viewMode)}
                                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                                        viewMode === view.mode
                                            ? view.activeClasses
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                    }`}
                                    whileHover={{ y: -1 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <view.icon className="w-4 h-4 mb-1" />
                                    {view.label}
                                </motion.button>
                            ))}
                        </div>
                    </CollapsibleSection>

                    {/* 추가 메뉴 - 개선된 디자인 */}
                    <CollapsibleSection title="추가 기능" icon={Settings2} defaultOpen={false}>
                        <div className="space-y-1 mt-2">
                            <Link href="/strategy">
                                <motion.div 
                                    className="flex items-center justify-between p-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
                                    whileHover={{ x: 4 }}
                                >
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-orange-500" />
                                        <span className="text-sm font-medium">변화 전략</span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                </motion.div>
                            </Link>
                            <Link href="/export">
                                <motion.div 
                                    className="flex items-center justify-between p-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
                                    whileHover={{ x: 4 }}
                                >
                                    <div className="flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-indigo-500" />
                                        <span className="text-sm font-medium">내보내기</span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                </motion.div>
                            </Link>
                        </div>
                    </CollapsibleSection>

                    {/* API 설정 */}
                    <ApiKeySettings />
                </div>

                {/* Fixed Footer - 개선된 디자인 */}
                <div className="p-4 pt-3 border-t border-gray-200/50 shrink-0 bg-gray-50/50">
                    <motion.button
                        onClick={() => setStep('context')}
                        className="w-full py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-white hover:border-gray-300 transition-all"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        맥락 수정
                    </motion.button>
                </div>
            </motion.div>
            {/* Canvas Area - 모바일에서 하단 네비게이션 공간 확보 */}
            <div className="flex-1 relative pb-20 md:pb-0">
                {viewMode === 'split' ? (
                    <SplitViewCanvas
                        asIsNodes={displayAsIsNodes}
                        asIsEdges={displayAsIsEdges}
                        toBeNodes={displayToBeNodes}
                        toBeEdges={displayToBeEdges}
                    />
                ) : (
                    <FlowCanvas
                        onGenerateFlow={
                            viewMode === 'asis' ? handleGenerateAsIs : handleGenerateToBe
                        }
                        isLoading={isLoading}
                        onNodeSplit={handleNodeSplit}
                        onDrilldown={handleDrilldown}
                    />
                )}
            </div>

            {/* Value Card Dialog */}
            <Dialog open={!!selectedNode} onOpenChange={() => setSelectedNode(null)}>
                <DialogContent className="bg-white/90 backdrop-blur-xl border-white/50 shadow-xl">
                    <DialogHeader>
                        <DialogTitle>가치 분석</DialogTitle>
                        <DialogDescription>
                            선택한 노드의 기대 가치와 협업 방식을 요약합니다.
                        </DialogDescription>
                    </DialogHeader>
                    <ValueCard
                        nodeLabel={selectedNodeLabel}
                        collaborationType={selectedNodeCollaborationType}
                    />
                </DialogContent>
            </Dialog>

            {/* Drilldown Dialog */}
            <Dialog open={!!drilldownNode} onOpenChange={closeDrilldown}>
                <DialogContent className="bg-white/90 backdrop-blur-xl border-white/50 shadow-xl max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            🔍 세부 단계 분석
                            <span
                                className={`text-xs px-2 py-1 rounded ${drilldownFlowType === 'as-is' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}
                            >
                                {drilldownFlowType === 'as-is' ? 'As-Is' : 'To-Be'}
                            </span>
                        </DialogTitle>
                        <DialogDescription>
                            선택한 노드를 단계별로 분해해 세부 작업과 자동화 포인트를 보여줍니다.
                        </DialogDescription>
                    </DialogHeader>

                    {drilldownNode && (
                        <div className="mb-4 p-3 bg-[#F5F6F8] rounded-lg border border-[#E2E4E9]">
                            <div className="font-medium text-[#18181B]">{drilldownNode.label}</div>
                            {drilldownNode.description && (
                                <div className="text-sm text-[#71717A] mt-1">
                                    {drilldownNode.description}
                                </div>
                            )}
                        </div>
                    )}

                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3B82F6]"></div>
                            <span className="ml-3 text-[#71717A]">AI가 분석 중...</span>
                        </div>
                    )}

                    {drilldownResult && (
                        <div className="space-y-4">
                            <div className="text-sm text-[#71717A] border-b border-[#E2E4E9] pb-2">
                                {drilldownResult.summary}
                            </div>

                            {/* TO-BE: 자동화 개요 섹션 */}
                            {drilldownFlowType === 'to-be' && drilldownResult.automationOverview && (
                                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                                    <div className="text-sm font-semibold text-blue-800 mb-2">⚡ AI 자동화 효과</div>
                                    {drilldownResult.automationOverview.totalTimeReduction && (
                                        <div className="text-lg font-bold text-blue-600 mb-2">
                                            {drilldownResult.automationOverview.totalTimeReduction}
                                        </div>
                                    )}
                                    {drilldownResult.automationOverview.keyBenefits && (
                                        <ul className="text-xs text-blue-700 space-y-1 mb-2">
                                            {drilldownResult.automationOverview.keyBenefits.map((benefit, i) => (
                                                <li key={i}>✅ {benefit}</li>
                                            ))}
                                        </ul>
                                    )}
                                    {drilldownResult.automationOverview.implementationTips && (
                                        <div className="text-xs text-blue-600 mt-2 pt-2 border-t border-blue-200">
                                            <div className="font-medium mb-1">💡 구현 팁:</div>
                                            {drilldownResult.automationOverview.implementationTips.map((tip, i) => (
                                                <div key={i} className="ml-2">• {tip}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {drilldownResult.subSteps.map((step, idx) => (
                                <div
                                    key={step.id}
                                    className="p-3 bg-[#F5F6F8] rounded-lg border border-[#E2E4E9]"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3B82F6]/20 flex items-center justify-center text-xs text-[#3B82F6]">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-[#18181B] text-sm">
                                                {step.label}
                                            </div>
                                            <div className="text-xs text-[#71717A] mt-1">
                                                {step.description}
                                            </div>

                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {step.duration && (
                                                    <span className="text-xs bg-[#E2E4E9] px-2 py-1 rounded">
                                                        ⏱️ {step.duration}
                                                    </span>
                                                )}
                                                {step.tools?.map((tool) => (
                                                    <span
                                                        key={tool}
                                                        className="text-xs bg-[#E2E4E9] px-2 py-1 rounded"
                                                    >
                                                        🔧 {tool}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* AS-IS: 어려움/비효율 표시 */}
                                            {drilldownFlowType === 'as-is' && step.painPoints && (
                                                <div className="mt-2 text-xs text-orange-700 bg-orange-50 p-2 rounded border border-orange-200">
                                                    ⚠️ {step.painPoints}
                                                </div>
                                            )}

                                            {/* TO-BE: AI 구현 방법 상세 */}
                                            {drilldownFlowType === 'to-be' && step.aiImplementation && (
                                                <div className="mt-3 space-y-2">
                                                    <div className="text-xs text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-200">
                                                        <div className="font-semibold mb-1">🤖 AI 처리 방법</div>
                                                        <div className="text-blue-600">{step.aiImplementation.method}</div>
                                                        
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {step.aiImplementation.technology?.map((tech) => (
                                                                <span key={tech} className="text-[10px] bg-blue-100 px-1.5 py-0.5 rounded">
                                                                    {tech}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        
                                                        {step.aiImplementation.platforms && step.aiImplementation.platforms.length > 0 && (
                                                            <div className="mt-2 pt-2 border-t border-blue-200">
                                                                <div className="text-[10px] text-blue-500 mb-1">구현 플랫폼:</div>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {step.aiImplementation.platforms.map((platform) => (
                                                                        <span key={platform} className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                                                                            {platform}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {step.aiImplementation.automationLevel && (
                                                            <div className="mt-2 text-[10px]">
                                                                자동화 수준: {
                                                                    step.aiImplementation.automationLevel === 'full' ? '🟢 완전 자동' :
                                                                    step.aiImplementation.automationLevel === 'partial' ? '🟡 부분 자동' :
                                                                    '🔵 AI 보조'
                                                                }
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 학습 리소스 */}
                                                    {step.resources && step.resources.length > 0 && (
                                                        <div className="text-xs bg-purple-50 p-3 rounded-lg border border-purple-200">
                                                            <div className="font-semibold text-purple-700 mb-2">📚 학습 자료</div>
                                                            {step.resources.map((resource, ri) => (
                                                                <div key={ri} className="mb-2 last:mb-0">
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-[10px]">
                                                                            {resource.type === 'youtube' ? '▶️' :
                                                                             resource.type === 'docs' ? '📄' :
                                                                             resource.type === 'article' ? '📰' : '🎓'}
                                                                        </span>
                                                                        <span className="font-medium text-purple-800">{resource.title}</span>
                                                                    </div>
                                                                    {resource.url && (
                                                                        <div className="text-[10px] text-purple-600 ml-4">
                                                                            🔍 검색: {resource.url}
                                                                        </div>
                                                                    )}
                                                                    {resource.description && (
                                                                        <div className="text-[10px] text-purple-500 ml-4 mt-0.5">
                                                                            {resource.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* 플로우에 적용 버튼 */}
                            <motion.button
                                onClick={applyDrilldownToFlow}
                                className="w-full mt-4 py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Layers className="w-4 h-4" />
                                이 세부 단계로 플로우에 적용
                            </motion.button>
                            <p className="text-xs text-center text-gray-400 mt-2">
                                기존 노드가 {drilldownResult.subSteps.length}개의 세부 단계로 대체됩니다
                            </p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
