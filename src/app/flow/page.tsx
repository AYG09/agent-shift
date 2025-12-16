'use client';

import { useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import { useAIGeneration } from '@/hooks/useAIGeneration';
import ApiKeySettings from '@/components/settings/ApiKeySettings';
import { ShareDialog } from '@/components/collaboration/ShareDialog';
import { Spinner } from '@/components/ui/spinner';
import { Sparkles, Bot, Shield, Scale, Rocket, TrendingUp, Upload } from 'lucide-react';
import Link from 'next/link';

// ReactFlow 동적 import
const FlowCanvas = dynamic(() => import('@/components/flow/FlowCanvas'), { ssr: false });
const SplitViewCanvas = dynamic(() => import('@/components/flow/SplitViewCanvas'), { ssr: false });
const ValueCard = dynamic(() => import('@/components/flow/ValueCard'), { ssr: false });

const industries = [
    { value: 'manufacturing', label: '제조 (Manufacturing)' },
    { value: 'it', label: 'IT/소프트웨어 (Software & Services)' },
    { value: 'finance', label: '금융/보험 (Finance & Insurance)' },
    { value: 'retail', label: '유통/소매 (Retail)' },
    { value: 'healthcare', label: '의료/바이오 (Healthcare & Biotech)' },
    { value: 'logistics', label: '물류/운송 (Logistics & Transport)' },
    { value: 'construction', label: '건설/엔지니어링 (Construction)' },
    { value: 'education', label: '교육 (Education)' },
    { value: 'media', label: '미디어/엔터테인먼트 (Media)' },
    { value: 'public', label: '공공/행정 (Public Sector)' },
    { value: 'consulting', label: '컨설팅/전문서비스 (Professional Services)' },
    { value: 'energy', label: '에너지/화학 (Energy & Chemicals)' },
    { value: 'hospitality', label: '숙박/식음료 (Hospitality & F&B)' },
    { value: 'other', label: '직접 입력 (Direct Input)' },
];

const roles = [
    // C-Level / Exec
    { value: 'cxo', label: 'C-Level (CEO, CTO, CFO...)' },
    { value: 'head', label: '본부장/실장 (Head of Dept)' },
    // Management
    { value: 'manager', label: '팀장/매니저 (Team Lead)' },
    { value: 'pm', label: 'PM/PO (Product/Project Manager)' },
    // Specialized
    { value: 'sales', label: '영업 (Sales)' },
    { value: 'marketing', label: '마케팅 (Marketing)' },
    { value: 'dev', label: '개발/엔지니어링 (Engineering)' },
    { value: 'design', label: '디자인 (Design)' },
    { value: 'hr', label: '인사/채용 (HR)' },
    { value: 'finance_acc', label: '재무/회계 (Finance)' },
    { value: 'ops', label: '운영/지원 (Operations)' },
    { value: 'data', label: '데이터 분석 (Data Analyst)' },
    { value: 'customer', label: '고객 지원 (CS)' },
    { value: 'legal', label: '법무/총무 (Legal/Admin)' },
    { value: 'student', label: '학생/연구원 (Student/Researcher)' },
    { value: 'other', label: '직접 입력 (Direct Input)' },
];

const timeScales = [
    { value: 'daily', label: '일일 (Daily)' },
    { value: 'weekly', label: '주간 (Weekly)' },
    { value: 'monthly', label: '월간 (Monthly)' },
    { value: 'quarterly', label: '분기 (Quarterly)' },
    { value: 'yearly', label: '연간 (Yearly)' },
    { value: 'project', label: '프로젝트 단위 (Project-based)' },
];

export default function FlowPage() {
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
    } = useAppStore();
    const { isLoading, error, generateAsIsFlow, generateToBeFlow, generateNodeSplit, generateDrilldown } =
        useAIGeneration();

    const [industry, setIndustry] = useState('');
    const [customIndustry, setCustomIndustry] = useState('');
    const [role, setRole] = useState('');
    const [customRole, setCustomRole] = useState('');
    const [task, setTask] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [tooling, setTooling] = useState('');
    const [painPoints, setPainPoints] = useState('');
    const [timeScale, setTimeScale] = useState<
        'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project'
    >('weekly');
    const [step, setStep] = useState<'context' | 'canvas'>('context');
    const [isSimulating, setIsSimulating] = useState(false);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedScenario, setSelectedScenario] = useState<
        'conservative' | 'balanced' | 'aggressive'
    >('balanced');

    // Drilldown state
    const [drilldownNode, setDrilldownNode] = useState<{
        id: string;
        label: string;
        description?: string;
        type: string;
    } | null>(null);
    const [drilldownResult, setDrilldownResult] = useState<{
        subSteps: Array<{
            id: string;
            label: string;
            description: string;
            duration?: string;
            tools?: string[];
            aiPotential?: string;
        }>;
        summary: string;
    } | null>(null);
    const drilldownFlowType: 'as-is' | 'to-be' = viewMode === 'tobe' ? 'to-be' : 'as-is';

    // ReactFlow 형식으로 변환
    // Note: ReactFlow conversion helpers removed (unused)

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
                timeScale: timeScale as 'daily' | 'weekly' | 'monthly' | 'quarterly',
                teamSize,
                tooling,
                painPoints,
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
            // AI 응답을 Zustand FlowNode 형식으로 변환 (label이 루트 레벨)
            const storeNodes = result.nodes.map((node) => ({
                id: node.id,
                type: node.type as 'task' | 'decision' | 'subprocess' | 'agent',
                label: node.label,
                description: node.description,
                stressLevel: node.stressLevel as 'low' | 'medium' | 'high' | undefined,
                position: node.position,
                metrics: node.metrics,
            }));
            const storeEdges = result.edges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
            }));
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
            const storeNodes = result.nodes.map((node) => ({
                id: node.id,
                type: node.type as 'task' | 'decision' | 'subprocess' | 'agent',
                label: node.label,
                description: node.description,
                stressLevel: node.stressLevel as 'low' | 'medium' | 'high' | undefined,
                collaborationType: node.collaborationType as
                    | 'copilot'
                    | 'monitor'
                    | 'autonomous'
                    | undefined,
                agentDescription: node.agentDescription,
                position: node.position,
                metrics: node.metrics,
            }));
            const storeEdges = result.edges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
            }));
            setToBeFlow(storeNodes, storeEdges);
            // 자동으로 To-Be 뷰로 전환
            setViewMode('tobe');
        }
    };

    const toggleSimulation = () => setIsSimulating(!isSimulating);

    // 노드 세분화 (우클릭 메뉴에서 호출)
    const handleNodeSplit = async (nodeId: string, flowType: 'asis' | 'tobe') => {
        const nodes = flowType === 'asis' ? asIsNodes : toBeNodes;
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || !context) return null;

        const result = await generateNodeSplit(
            { industry: context.industry, role: context.role, task: context.task },
            { id: node.id, label: node.label, description: node.description, type: node.type },
            flowType
        );

        if (result) {
            // FlowNode 형식으로 변환
            return {
                nodes: result.nodes.map(
                    (n: {
                        id: string;
                        label: string;
                        description?: string;
                        type: string;
                        stressLevel?: string;
                    }) => ({
                        id: n.id,
                        label: n.label,
                        description: n.description,
                        type: n.type as 'task' | 'decision' | 'subprocess' | 'agent',
                        stressLevel: n.stressLevel as 'low' | 'medium' | 'high' | undefined,
                        position: { x: 0, y: 0 }, // FlowCanvas에서 재배치
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
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || !context) return;

        setDrilldownNode({
            id: node.id,
            label: node.label,
            description: node.description,
            type: node.type,
        });

        const flowType = viewMode === 'tobe' ? 'to-be' : 'as-is';

        const result = await generateDrilldown(
            { industry: context.industry, role: context.role, task: context.task },
            { id: node.id, label: node.label, description: node.description, type: node.type },
            flowType
        );

        if (result) {
            setDrilldownResult({
                subSteps: result.subSteps.map((step: { id: string; label: string; description: string; duration?: string; tools?: string[]; aiPotential?: string }) => ({
                    id: step.id,
                    label: step.label,
                    description: step.description,
                    duration: step.duration,
                    tools: step.tools,
                    aiPotential: step.aiPotential
                })),
                summary: result.summary
            });
        }
    };

    // 드릴다운 다이얼로그 닫기
    const closeDrilldown = () => {
        setDrilldownNode(null);
        setDrilldownResult(null);
    };

    // Context Form
    if (step === 'context') {
        return (
            <div className="min-h-screen overflow-y-auto pro-canvas relative text-[#18181B] p-8">
                <div className="max-w-2xl mx-auto">
                    <Link
                        href="/"
                        className="text-[#71717A] hover:text-[#18181B] mb-8 inline-block"
                    >
                        ← 홈으로
                    </Link>

                    <Card className="bg-white/70 backdrop-blur-xl border-white/50 shadow-xl">
                        <CardHeader>
                            <CardTitle className="text-2xl text-[#18181B] font-semibold flex items-center gap-2">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                업무 맥락 입력
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-[#71717A]">산업군</label>
                                    <div className="space-y-2">
                                        <Select value={industry} onValueChange={setIndustry}>
                                            <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
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
                                        {industry === 'other' && (
                                            <Input
                                                value={customIndustry}
                                                onChange={(e) => setCustomIndustry(e.target.value)}
                                                placeholder="산업군 직접 입력"
                                                className="bg-white/50 border-[#3B82F6] text-[#18181B] placeholder:text-[#A1A1AA] animate-in fade-in slide-in-from-top-1"
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-[#71717A]">직무</label>
                                    <div className="space-y-2">
                                        <Select value={role} onValueChange={setRole}>
                                            <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
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
                                        {role === 'other' && (
                                            <Input
                                                value={customRole}
                                                onChange={(e) => setCustomRole(e.target.value)}
                                                placeholder="직무 직접 입력"
                                                className="bg-white/50 border-[#3B82F6] text-[#18181B] placeholder:text-[#A1A1AA] animate-in fade-in slide-in-from-top-1"
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-[#71717A]">업무명</label>
                                <Input
                                    value={task}
                                    onChange={(e) => setTask(e.target.value)}
                                    placeholder="예: 주간 영업 실적 취합 및 보고"
                                    className="bg-white/50 border-[#E2E4E9] text-[#18181B] placeholder:text-[#A1A1AA]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-[#71717A]">팀 규모</label>
                                    <Select value={teamSize} onValueChange={setTeamSize}>
                                        <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
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
                                    <label className="text-sm text-[#71717A]">업무 주기</label>
                                    <Select
                                        value={timeScale}
                                        onValueChange={(v) => setTimeScale(v as typeof timeScale)}
                                    >
                                        <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
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
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-[#71717A]">
                                    사용 중인 도구 (선택)
                                </label>
                                <Input
                                    value={tooling}
                                    onChange={(e) => setTooling(e.target.value)}
                                    placeholder="예: Excel, Slack, Jira, Notion"
                                    className="bg-white/50 border-[#E2E4E9] text-[#18181B] placeholder:text-[#A1A1AA]"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-[#71717A]">
                                    주요 고충 (Pain Points)
                                </label>
                                <Input
                                    value={painPoints}
                                    onChange={(e) => setPainPoints(e.target.value)}
                                    placeholder="예: 데이터 복사/붙여넣기에 시간이 너무 많이 걸림"
                                    className="bg-white/50 border-[#E2E4E9] text-[#18181B] placeholder:text-[#A1A1AA]"
                                />
                            </div>

                            <Button
                                onClick={handleStart}
                                disabled={
                                    !industry ||
                                    !role ||
                                    !task ||
                                    (industry === 'other' && !customIndustry) ||
                                    (role === 'other' && !customRole)
                                }
                                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white mt-4"
                            >
                                🚀 Flow 캔버스 시작하기
                            </Button>
                        </CardContent>
                    </Card>
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
            ? asIsEdges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
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
                    collaborationType: n.collaborationType,
                    agentDescription: n.agentDescription,
                    stressLevel: n.stressLevel,
                },
            }))
            : displayAsIsNodes;

    const displayToBeEdges: Edge[] =
        toBeNodes.length > 0
            ? toBeEdges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
            : displayAsIsEdges;

    // Canvas with Sidebar
    return (
        <div className="h-screen pro-canvas text-[#18181B] flex overflow-hidden">
            {/* Sidebar - Pro Glassmorphism */}
            <div className="w-64 bg-white/80 backdrop-blur-xl border-r border-[#E2E4E9] p-4 flex flex-col">
                <Link href="/" className="text-xl font-semibold text-[#18181B] mb-6">
                    Agent Shift
                </Link>

                <div className="mb-6 p-3 bg-[#F5F6F8] rounded-xl border border-[#E2E4E9]">
                    <div className="text-xs text-[#71717A] mb-2">현재 분석 중</div>
                    <div className="text-sm font-medium text-[#18181B]">{context?.task}</div>
                    <div className="text-xs text-[#71717A] mt-1">
                        {industries.find((i) => i.value === context?.industry)?.label} ·{' '}
                        {roles.find((r) => r.value === context?.role)?.label}
                    </div>
                </div>

                {/* 협업 시작 버튼 */}
                <div className="mb-4">
                    <ShareDialog />
                </div>

                {/* AI 생성 버튼 */}
                <div className="mb-4 space-y-2">
                    <Button
                        onClick={handleGenerateAsIs}
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <Spinner size="sm" className="text-white" />
                                <span>AI 생성 중...</span>
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 whitespace-nowrap">
                                <Sparkles className="w-4 h-4" />
                                As-Is 플로우 생성
                            </span>
                        )}
                    </Button>
                    <Button
                        onClick={handleGenerateToBe}
                        disabled={isLoading || asIsNodes.length === 0}
                        className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <Spinner size="sm" className="text-white" />
                                <span>AI 변환 중...</span>
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 whitespace-nowrap">
                                <Bot className="w-4 h-4" />
                                To-Be 변환
                            </span>
                        )}
                    </Button>
                    {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
                </div>

                {/* Scenario Selector */}
                {toBeNodes.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-500 mb-2">AI 자동화 수준</div>
                        <div className="space-y-1">
                            <button
                                onClick={() => setSelectedScenario('conservative')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 whitespace-nowrap ${selectedScenario === 'conservative'
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <Shield className="w-3.5 h-3.5" />
                                Conservative - 인간 감독 유지
                            </button>
                            <button
                                onClick={() => setSelectedScenario('balanced')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 whitespace-nowrap ${selectedScenario === 'balanced'
                                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <Scale className="w-3.5 h-3.5" />
                                Balanced - AI 코파일럿
                            </button>
                            <button
                                onClick={() => setSelectedScenario('aggressive')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 whitespace-nowrap ${selectedScenario === 'aggressive'
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <Rocket className="w-3.5 h-3.5" />
                                Aggressive - 최대 자동화
                            </button>
                        </div>
                    </div>
                )}

                {/* 뷰 모드 탭 바 - 프리미엄 디자인 */}
                <div className="mb-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1 font-medium">
                        플로우 뷰
                    </div>
                    <div className="relative bg-gray-100/80 backdrop-blur-sm rounded-xl p-1">
                        {/* 슬라이딩 인디케이터 배경 */}
                        <div
                            className="absolute top-1 h-[calc(100%-8px)] bg-white rounded-lg shadow-md transition-all duration-300 ease-out"
                            style={{
                                left: viewMode === 'asis' ? '4px' : viewMode === 'tobe' ? 'calc(33.33% + 2px)' : 'calc(66.66%)',
                                width: 'calc(33.33% - 4px)',
                            }}
                        />
                        <div className="relative flex gap-0.5">
                            <button
                                onClick={() => setViewMode('asis')}
                                className={`relative z-10 flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${viewMode === 'asis'
                                    ? 'text-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <span>As-Is</span>
                            </button>
                            <button
                                onClick={() => setViewMode('tobe')}
                                className={`relative z-10 flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${viewMode === 'tobe'
                                    ? 'text-emerald-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <span>To-Be</span>
                            </button>
                            <button
                                onClick={() => setViewMode('split')}
                                className={`relative z-10 flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${viewMode === 'split'
                                    ? 'text-purple-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                </svg>
                                <span>비교</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 추가 메뉴 */}
                <div className="space-y-1 flex-1">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
                        추가 기능
                    </div>
                    <Link href="/strategy">
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-gray-100 gap-2"
                        >
                            <TrendingUp className="w-4 h-4" />
                            변화 전략
                        </Button>
                    </Link>
                    <Link href="/export">
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-gray-100 gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            내보내기
                        </Button>
                    </Link>
                </div>

                {/* API 설정 */}
                <div className="mb-4">
                    <ApiKeySettings />
                </div>

                <Button
                    variant="outline"
                    className="border-slate-700"
                    onClick={() => setStep('context')}
                >
                    ← 맥락 수정
                </Button>
            </div>


            {/* Main Canvas */}
            <div className="flex-1 relative">
                {viewMode === 'split' ? (
                    <SplitViewCanvas
                        asIsNodes={displayAsIsNodes}
                        asIsEdges={displayAsIsEdges}
                        toBeNodes={displayToBeNodes}
                        toBeEdges={displayToBeEdges}
                        isSimulating={isSimulating}
                        onToggleSimulation={toggleSimulation}
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
                    </DialogHeader>
                    <ValueCard
                        nodeLabel={(selectedNode?.data?.label as string) || ''}
                        collaborationType={
                            selectedNode?.data?.collaborationType as
                            | 'copilot'
                            | 'monitor'
                            | 'autonomous'
                        }
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

                                            {step.aiPotential && (
                                                <div className="mt-2 text-xs text-[#3B82F6] bg-blue-50 p-2 rounded">
                                                    🤖 {step.aiPotential}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
