'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Bot, Check, CheckSquare, ChevronDown, ClipboardCheck, Eye, Maximize2, Redo2, RotateCcw, Square, Undo2, X } from 'lucide-react';
import { getAgentizableDemoStepIds, getDemoAgentizationModeForStep, useSopDemoStore, scenarioInfo } from '@/lib/sop-demo-store';
import { normalizeDemoScenario, normalizeDemoMode, normalizeDemoPreset, type DemoEdge, type DemoMode, type DemoStep } from '@/lib/sop-demo-fixtures';
import { AI_APPLICATION_MODES, getAgentizationModeMeta } from '@/lib/sop-agentization';
import type { SopAiApplicationMode } from '@/lib/sop-types';
import { FlowShapeRenderer } from '@/components/flow/FlowShapeRenderer';

type NodeData = { step: DemoStep; number: number; mode: DemoMode; onSelect: (id: string) => void; agentizationMode?: SopAiApplicationMode; agentizationConfirmed: boolean };
type DemoFlowNode = Node<NodeData, 'demo'>;

function getOptimalHandles(source: DemoStep, target: DemoStep) {
    const dx = target.position.x - source.position.x;
    const dy = target.position.y - source.position.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' };
    }
    return dy >= 0 ? { sourceHandle: 'bottom', targetHandle: 'top' } : { sourceHandle: 'top', targetHandle: 'bottom' };
}

// 본 화면(SopStepNode)과 완전히 동일한 FlowShapeRenderer(25개 canonical shape SVG)를 재사용한다 -
// 데모 전용으로 별도의 부정확한 CSS 도형(clip-path 육각형 등)을 다시 만들지 않는다.
function DemoNode({ data }: NodeProps<DemoFlowNode>) {
    const { step, number, mode, onSelect, agentizationMode, agentizationConfirmed } = data;
    const modeMeta = getAgentizationModeMeta(agentizationMode);
    const isDecision = step.shape === 'decision';
    const width = 194;
    const height = isDecision ? 148 : 106;
    const strokeColor =
        step.reviewStatus === 'confirmed' ? '#10b981' : step.reviewStatus === 'reviewed' ? '#0ea5e9' : '#94a3b8';
    const fillColor =
        step.reviewStatus === 'confirmed' ? '#f0fdf4' : step.reviewStatus === 'reviewed' ? '#f0f9ff' : '#ffffff';
    return (
        <button
            onClick={(event) => {
                event.stopPropagation();
                onSelect(step.id);
            }}
            className={`relative block text-left text-slate-800 ${modeMeta ? 'drop-shadow-[0_0_0.35rem_rgba(124,58,237,0.35)]' : ''}`}
            style={{ width, height }}
            aria-label={`${number}단계 ${step.title}`}
        >
            <Handle type="target" position={Position.Left} id="left" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="target" position={Position.Top} id="top" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="target" position={Position.Right} id="right" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="target" position={Position.Bottom} id="bottom" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="source" position={Position.Left} id="left" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="source" position={Position.Top} id="top" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="source" position={Position.Right} id="right" className="!h-2.5 !w-2.5 !opacity-0" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!h-2.5 !w-2.5 !opacity-0" />

            <FlowShapeRenderer shape={step.shape} width={width} height={height} fill={fillColor} stroke={strokeColor} strokeWidth={2} className="shadow-sm" />

            <div
                className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-center ${
                    isDecision ? 'px-8 py-3' : 'px-3.5 py-2.5'
                }`}
            >
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{String(number).padStart(2, '0')}</span>
                    {step.reviewStatus === 'reviewed' && <Check size={12} className="text-sky-600" />}
                    {step.reviewStatus === 'confirmed' && <Check size={12} className="text-emerald-600" />}
                </div>
                {modeMeta && <span className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${agentizationConfirmed ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700'}`}><Bot size={10}/>{modeMeta.shortLabel}{agentizationConfirmed ? ' · 확정' : ''}</span>}
                <div className="mt-1 line-clamp-2 text-xs font-bold leading-4">{step.title}</div>
                {mode !== 'compact' && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-600">{step.definition}</p>}
                {mode === 'detailed' && step.requiredSkills.length > 0 && (
                    <span className="mt-1.5 w-fit rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
                        SKILL {step.requiredSkills.length}
                    </span>
                )}
            </div>
        </button>
    );
}

const nodeTypes = { demo: DemoNode };

export function DemoWorkspace() {
    const params = useSearchParams(); const router = useRouter(); const store = useSopDemoStore();
    const [flow, setFlow] = useState<ReactFlowInstance<DemoFlowNode> | null>(null); const [notice, setNotice] = useState(''); const [edgeTarget, setEdgeTarget] = useState(''); const [agentPanelOpen, setAgentPanelOpen] = useState(false);
    const [stepSearch, setStepSearch] = useState(''); const [unreviewedOnly, setUnreviewedOnly] = useState(false);
    // 허용 목록 기반 정규화 - 잘못된 query(예: ?scenario=invalid&mode=bad&preset=bad)도 런타임
    // 오류 없이 안전한 기본값(recruiting/standard/branching)으로 처리한다.
    const scenario = normalizeDemoScenario(params.get('scenario'));
    const mode = normalizeDemoMode(params.get('mode'));
    const preset = normalizeDemoPreset(params.get('preset'));

    // query parameter는 "최초 진입값"으로만 쓴다 - 이후 store.setMode() 등으로 상태가 바뀌어도
    // URL이 다시 이 값으로 되돌리지 않는다. 전체 store 객체를 의존성으로 쓰면(과거 버그) store의
    // 어떤 필드가 바뀌든(예: setMode 클릭) 이 effect가 다시 실행되어 loadFromQuery가 방금 바뀐
    // mode를 곧바로 URL의 초기값으로 되돌려버렸다 - 그래서 여기서는 loadFromQuery 액션만 selector로
    // 구독하고, "이미 이 (scenario, mode, preset) 조합을 로드했는지"는 store가 아닌 로컬 ref로 추적한다.
    const loadFromQuery = useSopDemoStore((s) => s.loadFromQuery);
    const loadedKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const key = `${scenario}:${mode}:${preset}`;
        if (loadedKeyRef.current !== key) {
            loadedKeyRef.current = key;
            loadFromQuery(scenario, mode, preset);
        }
    }, [scenario, mode, preset, loadFromQuery]);
    const document = store.document;
    const agentizableStepIds = useMemo(() => getAgentizableDemoStepIds(document), [document]);
    const agentizationModeById = useMemo(
        () => new Map(agentizableStepIds.map((id) => [id, getDemoAgentizationModeForStep(store, id)])),
        [agentizableStepIds, store]
    );
    const selected = document?.steps.find((step) => step.id === store.selectedStepId);
    const selectedEdge = document?.edges.find((edge) => edge.id === store.selectedEdgeId);
    useEffect(() => {
        if (!store.customerMode || !flow) return;
        const frame = window.requestAnimationFrame(() => flow.fitView({ padding: .12, duration: 220 }));
        return () => window.cancelAnimationFrame(frame);
    }, [store.customerMode, flow]);
    const nodes = useMemo<DemoFlowNode[]>(() => document?.steps.map((step, index) => ({ id: step.id, type: 'demo' as const, position: step.position, data: { step, number: index + 1, mode: store.mode, onSelect: store.selectStep, agentizationMode: agentizationModeById.get(step.id), agentizationConfirmed: !!store.agentizationConfirmedAt }, selected: store.selectedStepId === step.id })) || [], [document, store.mode, store.selectedStepId, store.selectStep, store.agentizationConfirmedAt, agentizationModeById]);
    const edges = useMemo<Edge[]>(() => document?.edges.map((edge) => {
        const source = document.steps.find((step) => step.id === edge.source);
        const target = document.steps.find((step) => step.id === edge.target);
        const handles = source && target ? getOptimalHandles(source, target) : { sourceHandle: 'right', targetHandle: 'left' };
        return { id: edge.id, source: edge.source, target: edge.target, ...handles, label: edge.label, type: 'smoothstep', animated: edge.branchType !== 'default', style: { stroke: edge.branchType === 'yes' ? '#059669' : edge.branchType === 'no' ? '#dc2626' : '#64748b', strokeWidth: store.selectedEdgeId === edge.id ? 3 : 1.7 }, labelStyle: { fill: edge.branchType === 'yes' ? '#047857' : edge.branchType === 'no' ? '#b91c1c' : '#475569', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#fff', fillOpacity: .92 } };
    }) || [], [document, store.selectedEdgeId]);
    // 단계 검색 + 미검토 필터: 원래 순번(String(index+1))은 전체 문서 기준으로 유지하고, 표시할
    // 항목만 걸러낸다.
    const visibleSteps = useMemo(
        () =>
            (document?.steps || [])
                .map((step, index) => ({ step, index }))
                .filter(({ step }) => {
                    if (unreviewedOnly && step.reviewStatus !== 'ai-draft') return false;
                    const query = stepSearch.trim().toLowerCase();
                    if (!query) return true;
                    return step.title.toLowerCase().includes(query) || step.definition.toLowerCase().includes(query);
                }),
        [document, stepSearch, unreviewedOnly]
    );
    const doConfirm = () => { const result = store.confirmAll(); setNotice(result.message); window.setTimeout(() => setNotice(''), 3600); };
    const completeReviews = () => document?.steps.forEach((step) => store.setStepReviewed(step.id));
    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => store.updateStepPosition(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }), [store]);
    if (!document) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">샘플 SOP를 불러오는 중입니다.</div>;
    const info = scenarioInfo[store.scenario];
    return <main className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-slate-100 text-slate-900">
        <header className="z-20 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-bold text-indigo-700">샘플 목업</span><div><h1 className="text-sm font-bold">{info.title}</h1><p className="text-[11px] text-slate-500">{store.member.name} · {store.member.role}</p></div></div><div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-md bg-slate-100 px-2 py-1 font-semibold">{preset}</span><span className="rounded-md bg-slate-100 px-2 py-1">{document.steps.length} 단계</span><span className="rounded-md bg-slate-100 px-2 py-1">{document.edges.length} 연결</span><span className="rounded-md bg-slate-100 px-2 py-1">decision {document.steps.filter(s => s.shape === 'decision').length}</span><span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">미검토 {document.steps.filter(s => s.reviewStatus === 'ai-draft').length}</span><span className={`rounded-md px-2 py-1 font-bold ${document.steps.every(s => s.reviewStatus === 'confirmed') ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{document.steps.every(s => s.reviewStatus === 'confirmed') ? '전체 확정' : '검토 진행 중'}</span></div><div className="flex items-center gap-1"><button onClick={() => router.push('/sop/demo')} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="입력 게이트로 돌아가기"><ArrowLeft size={16}/></button><button onClick={store.resetDemo} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="데모 초기화"><RotateCcw size={16}/></button><button onClick={store.toggleCustomerMode} className={`rounded-md px-3 py-2 text-xs font-bold ${store.customerMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Eye size={14} className="mr-1 inline"/>고객 미팅 모드</button>{!store.customerMode && <button onClick={() => setAgentPanelOpen(true)} className={`rounded-md px-3 py-2 text-xs font-bold ${store.agentizationConfirmedAt ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-800 hover:bg-violet-200'}`}><Bot size={14} className="mr-1 inline"/>{store.agentizationConfirmedAt ? 'Agent화 확정됨' : 'Agent화 검토'}</button>}<button onClick={doConfirm} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white">전체 SOP 확정</button></div></div></header>
        {notice && <div role="status" className="absolute right-5 top-16 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">{notice}</div>}
        <div className="min-h-0 flex flex-1">{!store.customerMode && <aside className="flex w-[238px] shrink-0 flex-col border-r border-slate-200 bg-white"><div className="border-b border-slate-100 p-3"><div className="flex items-center justify-between"><h2 className="text-xs font-bold">단계 목록</h2><button onClick={completeReviews} className="text-[11px] font-semibold text-indigo-600">전체 검토 완료</button></div><div className="mt-2 flex gap-1"><input aria-label="단계 검색" placeholder="단계 검색" value={stepSearch} onChange={(event) => setStepSearch(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs"/><button onClick={() => setUnreviewedOnly((prev) => !prev)} aria-pressed={unreviewedOnly} className={`rounded border px-2 ${unreviewedOnly ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600'}`} aria-label="미검토 단계만 보기"><ChevronDown size={14}/></button></div>{(stepSearch || unreviewedOnly) && <p className="mt-1.5 text-[10px] text-slate-400">{visibleSteps.length}/{document.steps.length}개 표시 중{unreviewedOnly ? ' · 미검토만' : ''}</p>}</div><div className="overflow-y-auto p-2">{visibleSteps.length === 0 && <p className="p-3 text-center text-[11px] text-slate-400">조건에 맞는 단계가 없습니다.</p>}{visibleSteps.map(({ step, index }) => <button key={step.id} onClick={() => store.selectStep(step.id)} className={`mb-1.5 w-full rounded-lg border p-2.5 text-left ${store.selectedStepId === step.id ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${step.reviewStatus === 'confirmed' ? 'bg-emerald-500' : step.reviewStatus === 'reviewed' ? 'bg-sky-500' : 'bg-amber-400'}`}/><span className="text-[11px] text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 truncate text-xs font-medium">{step.title}</span></div></button>)}</div><div className="border-t border-slate-100 p-2"><button onClick={store.addStep} className="mb-2 w-full rounded border border-slate-200 py-1.5 text-[11px] font-semibold hover:bg-slate-50">+ 단계 추가</button>{store.selectedStepId && <><div className="mb-2 flex gap-1"><button onClick={() => store.duplicateStep(store.selectedStepId!)} className="flex-1 rounded border border-slate-200 py-1.5 text-[11px]">복제</button><button onClick={() => store.deleteStep(store.selectedStepId!)} className="flex-1 rounded border border-rose-200 py-1.5 text-[11px] text-rose-700">삭제</button></div><div className="mb-2 flex gap-1"><select aria-label="연결 대상 단계" value={edgeTarget} onChange={(event) => setEdgeTarget(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 px-1 text-[11px]"><option value="">연결 대상 선택</option>{document.steps.filter((step) => step.id !== store.selectedStepId).map((step) => <option key={step.id} value={step.id}>{step.title}</option>)}</select><button disabled={!edgeTarget} onClick={() => { store.addEdge(store.selectedStepId!, edgeTarget); setEdgeTarget(''); }} className="rounded border border-slate-200 px-2 text-[11px] disabled:text-slate-300">연결</button></div></>}<button onClick={store.undo} className="mr-1 rounded p-2 hover:bg-slate-100" aria-label="실행 취소"><Undo2 size={15}/></button><button onClick={store.redo} className="rounded p-2 hover:bg-slate-100" aria-label="다시 실행"><Redo2 size={15}/></button></div></aside>}
            <section className="relative flex min-w-0 flex-1 flex-col bg-[#f8fafc]">
                <div className="relative min-h-0 flex-1">
                    <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"><span className="px-2 text-[11px] font-semibold text-slate-500">{store.mode}</span>{(['compact', 'standard', 'detailed'] as DemoMode[]).map(item => <button key={item} onClick={() => store.setMode(item)} className={`rounded px-2 py-1 text-[11px] ${store.mode === item ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100'}`}>{item[0].toUpperCase()}</button>)}<button onClick={() => flow?.fitView({ padding: .18, duration: 250 })} className="rounded p-1.5 hover:bg-slate-100" aria-label="Fit View"><Maximize2 size={15}/></button></div>
                    <ReactFlow<DemoFlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setFlow} onNodeDragStop={onNodeDragStop} onNodeClick={(_, node) => store.selectStep(node.id)} onEdgeClick={(_, edge) => store.selectEdge(edge.id)} onPaneClick={() => store.selectStep(null)} fitView fitViewOptions={{ padding: .18 }} minZoom={.2} maxZoom={1.4} nodesDraggable={!store.customerMode} proOptions={{ hideAttribution: true }}><Background color="#cbd5e1" gap={22} size={1}/><Controls/><MiniMap<DemoFlowNode> pannable zoomable nodeColor={(node) => node.data.step.shape === 'decision' ? '#f59e0b' : '#6366f1'}/></ReactFlow>
                </div>
                {/* customerMode 안내 배너는 캔버스 위에 겹쳐 그리지 않고(전역 내비게이션·하단 노드를
                    가리는 문제를 유발했었다) 별도의 flex 영역으로 분리해, ReactFlow가 fitView를 계산할
                    때 이 배너의 높이만큼 자동으로 여유 공간을 두고 노드를 배치하게 한다. */}
                {store.customerMode && (
                    <div className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-2.5 text-center">
                        <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
                            샘플 목업 · AI 생성 결과 예시 · {document.steps.length}단계 / decision {document.steps.filter(s => s.shape === 'decision').length}
                        </span>
                    </div>
                )}
            </section>
            {!store.customerMode && <Inspector step={selected} edge={selectedEdge} onClose={() => store.selectStep(null)} />}</div>
        {agentPanelOpen && <AgentizationPanel document={document} onClose={() => setAgentPanelOpen(false)} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(''), 3600); }} />}
    </main>;
}

function AgentizationPanel({ document, onClose, onNotice }: { document: NonNullable<ReturnType<typeof useSopDemoStore.getState>['document']>; onClose: () => void; onNotice: (message: string) => void }) {
    const store = useSopDemoStore();
    const agentizable = getAgentizableDemoStepIds(document);
    const selectedIds = store.agentizationScope === 'workflow' ? agentizable : store.agentizationStepIds.filter((id) => agentizable.includes(id));
    const confirmed = !!store.agentizationConfirmedAt;

    return <div className="absolute inset-0 z-50 flex justify-end bg-slate-950/20" role="dialog" aria-modal="true" aria-label="Agent화 가능 업무 확정">
        <aside className="flex h-full w-full max-w-[420px] flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5"><div><div className="flex items-center gap-2 text-violet-700"><Bot size={18}/><span className="text-xs font-bold">Agent화 가능 업무 확정</span></div><h2 className="mt-1 text-base font-bold text-slate-900">구성원 판단을 Agent 설계 후보로 남깁니다</h2><p className="mt-1 text-xs leading-5 text-slate-500">AI가 실행하거나 협업할 수 있는 업무 범위를 구성원이 직접 선택·확정합니다.</p></div><button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Agent화 검토 닫기"><X size={18}/></button></div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                <section><h3 className="text-xs font-bold text-slate-700">1. 검토 범위</h3><div className="mt-2 grid gap-2"><button onClick={() => store.setAgentizationScope('workflow')} className={`rounded-lg border p-3 text-left ${store.agentizationScope === 'workflow' ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-slate-200'}`}><div className="flex items-center gap-2"><CheckSquare size={16} className="text-violet-600"/><strong className="text-xs">전체 워크플로</strong></div><p className="mt-1 text-[11px] leading-4 text-slate-500">시작·종료를 제외한 업무 단계 {agentizable.length}개를 하나의 Agent화 후보 흐름으로 검토합니다.</p></button><button onClick={() => store.setAgentizationScope('steps')} className={`rounded-lg border p-3 text-left ${store.agentizationScope === 'steps' ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-slate-200'}`}><div className="flex items-center gap-2"><Square size={16} className="text-violet-600"/><strong className="text-xs">특정 업무 단계</strong></div><p className="mt-1 text-[11px] leading-4 text-slate-500">반복성·규칙성·데이터 접근성을 고려해 필요한 단계만 체크합니다.</p></button></div></section>
                {store.agentizationScope === 'steps' && <section><div className="flex items-center justify-between"><h3 className="text-xs font-bold text-slate-700">2. Agent화 후보 단계</h3><span className="text-[11px] font-bold text-violet-700">{selectedIds.length}개 선택</span></div><div className="mt-2 space-y-1.5">{document.steps.filter((step) => agentizable.includes(step.id)).map((step, index) => { const checked = selectedIds.includes(step.id); return <button key={step.id} onClick={() => store.toggleAgentizationStep(step.id)} className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left ${checked ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:bg-slate-50'}`}>{checked ? <CheckSquare size={16} className="shrink-0 text-violet-600"/> : <Square size={16} className="shrink-0 text-slate-400"/>}<span className="text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold">{step.title}</span></button>; })}</div></section>}
                {selectedIds.length > 0 && <section><h3 className="text-xs font-bold text-slate-700">3. AI 참여 방식 일괄 지정</h3><p className="mt-1 text-[10px] leading-4 text-slate-400">선택 단계 전체에 적용됩니다. 개별 단계는 아래에서 따로 바꿀 수 있습니다.</p><div className="mt-2 grid grid-cols-2 gap-2">{AI_APPLICATION_MODES.map((item) => <button key={item.id} onClick={() => store.setAgentizationDefaultMode(item.id)} className="rounded-lg border border-slate-200 p-3 text-left hover:border-violet-300 hover:bg-violet-50/40"><strong className="text-xs">{item.label}</strong><p className="mt-1 text-[10px] leading-4 text-slate-500">{item.detail}</p></button>)}</div></section>}
                {selectedIds.length > 0 && <section><div className="flex items-center justify-between"><h3 className="text-xs font-bold text-slate-700">4. 단계별 AI 참여 방식</h3><span className="text-[11px] text-slate-400">미지정은 사람 수행</span></div><div className="mt-2 space-y-1.5">{document.steps.filter((step) => selectedIds.includes(step.id)).map((step, index) => { const stepMode = getDemoAgentizationModeForStep(store, step.id); return <div key={step.id} className="rounded-lg border border-slate-200 p-2.5"><div className="mb-1.5 flex items-center gap-2"><span className="text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold">{step.title}</span>{stepMode && <span className="text-[10px] font-semibold text-emerald-600">지정됨</span>}</div><select aria-label={`${step.title}의 AI 참여 방식`} value={stepMode || ''} onChange={(event) => store.setAgentizationStepMode(step.id, event.target.value ? (event.target.value as SopAiApplicationMode) : undefined)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-800 outline-none focus:border-violet-500"><option value="">AI 참여 방식 선택</option>{AI_APPLICATION_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>; })}</div></section>}
                <section><label className="block text-xs font-bold text-slate-700">5. 판단 근거 <span className="font-normal text-slate-400">(선택)</span><textarea value={store.agentizationNote} onChange={(event) => store.setAgentizationNote(event.target.value)} rows={3} placeholder="예: 반복적으로 접수되는 지원서의 자격 요건 확인은 규칙 기반으로 자동화 가능" className="mt-2 w-full resize-none rounded-lg border border-slate-300 p-2.5 text-xs leading-5 outline-none focus:border-violet-500"/></label></section>
                {confirmed && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><strong>확정됨</strong> · {selectedIds.length}개 업무의 단계별 AI 참여 방식을 저장했습니다. SOP 내용이나 판단을 수정하면 다시 확정해야 합니다.</div>}
            </div>
            <div className="border-t border-slate-200 bg-white p-5"><div className="mb-3 rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><strong className="text-slate-800">선택 결과</strong> · {store.agentizationScope === 'workflow' ? '전체 워크플로' : `${selectedIds.length}개 선택 단계`} / {selectedIds.filter((id) => getDemoAgentizationModeForStep(store, id)).length}개 단계에 AI 참여 방식 지정됨</div><button onClick={() => { const result = store.confirmAgentization(); onNotice(result.message); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700"><Bot size={16}/>{confirmed ? 'Agent화 판단 다시 확정' : 'Agent화 가능 여부 확정'}</button></div>
        </aside>
    </div>;
}

function Inspector({ step, edge, onClose }: { step?: DemoStep; edge?: DemoEdge; onClose: () => void }) {
    const store = useSopDemoStore();
    if (edge) return <aside className="w-[330px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4"><div className="flex justify-between"><div><span className="text-[10px] font-bold text-indigo-600">연결선</span><h2 className="mt-1 text-sm font-bold">{edge.label || '일반 연결'}</h2></div><button onClick={onClose} aria-label="Inspector 닫기"><X size={17}/></button></div><dl className="mt-5 space-y-4 text-xs"><Detail label="출발 단계" value={stepTitle(edge.source, store.document)}/><Detail label="도착 단계" value={stepTitle(edge.target, store.document)}/><Detail label="분기 유형" value={edge.branchType}/><Detail label="조건 설명" value={edge.condition || '해당 없음'}/></dl><button onClick={() => store.deleteEdge(edge.id)} className="mt-6 w-full rounded-lg border border-rose-200 py-2 text-xs font-bold text-rose-700">연결선 삭제</button></aside>;
    if (!step) return <aside className="w-[330px] shrink-0 border-l border-slate-200 bg-white p-5"><ClipboardCheck size={22} className="text-indigo-600"/><h2 className="mt-3 text-sm font-bold">단계 또는 연결선을 선택하세요</h2><p className="mt-2 text-xs leading-5 text-slate-500">선택한 단계의 정의, 책임 역할, 입·출력, SKILL과 검토 상태를 확인할 수 있습니다.</p></aside>;
    const statusText = step.reviewStatus === 'ai-draft' ? 'AI 초안' : step.reviewStatus === 'reviewed' ? '검토 완료' : '전체 SOP 확정';
    const pendingAiSkills = step.requiredSkills.filter((skill) => skill.source === 'ai-suggested' && !skill.accepted);
    return <aside className="w-[330px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white p-4"><div><span className="text-[10px] font-bold text-indigo-600">{step.shape} · {statusText}</span><h2 className="mt-1 text-sm font-bold">{step.title}</h2></div><button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Inspector 닫기"><X size={17}/></button></div><div className="space-y-4 p-4"><Editable label="단계명" value={step.title} onChange={(value) => store.updateStep(step.id, { title: value })}/><Editable label="단계 정의" value={step.definition} multiline onChange={(value) => store.updateStep(step.id, { definition: value })}/><Detail label="상세 수행 방법" value={step.detailedInstructions}/><Detail label="담당 역할" value={step.responsibleRole}/><Detail label="필요 시간" value={step.estimatedDuration}/><Detail label="입력 정보" value={step.inputs.join(', ')}/><Detail label="산출물" value={step.outputs.join(', ')}/><Detail label="시스템·도구" value={step.tools.join(', ')}/><Detail label="주의사항" value={step.cautions.join(' ')}/>{step.decisionRules.length > 0 && <Detail label="decision 규칙" value={step.decisionRules.join(' · ')}/>}
        <div>
            <p className="mb-2 text-[11px] font-bold text-slate-500">필수 SKILL{pendingAiSkills.length > 0 && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">미처리 AI 제안 {pendingAiSkills.length}</span>}</p>
            <div className="space-y-2">
                {step.requiredSkills.length ? step.requiredSkills.map((skill) => {
                    const isPendingAi = skill.source === 'ai-suggested' && !skill.accepted;
                    return <div key={skill.id} className={`rounded-lg border p-2 text-xs ${isPendingAi ? 'border-amber-300 bg-amber-50' : skill.source === 'ai-suggested' ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-100 bg-indigo-50'}`}>
                        <strong>{skill.source === 'ai-suggested' ? (isPendingAi ? '★ AI 제안(미처리) · ' : '✓ AI 제안(수락됨) · ') : 'Work Library · '}{skill.name}</strong>
                        <p className="mt-1 text-[11px] leading-4 text-slate-600">{skill.description}</p>
                        {isPendingAi && <div className="mt-2 flex gap-1.5 border-t border-amber-200 pt-2">
                            <button onClick={() => store.acceptAiSkill(step.id, skill.id)} className="flex-1 rounded-md bg-emerald-600 py-1.5 text-[11px] font-bold text-white">수락</button>
                            <button onClick={() => store.rejectAiSkill(step.id, skill.id)} className="flex-1 rounded-md border border-rose-300 bg-white py-1.5 text-[11px] font-bold text-rose-700">거절</button>
                        </div>}
                    </div>;
                }) : <p className="text-xs text-slate-400">연결된 SKILL 없음</p>}
            </div>
        </div>
        {pendingAiSkills.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">미처리된 AI 제안 SKILL이 있으면 전체 SOP를 확정할 수 없습니다. 위에서 수락 또는 거절해 주세요.</div>}
        {step.reviewStatus === 'ai-draft' && <button onClick={() => store.setStepReviewed(step.id)} className="flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white"><Check size={14}/>검토 완료</button>}{step.reviewStatus === 'reviewed' && <div className="rounded-lg bg-sky-50 p-3 text-center text-xs font-bold text-sky-700">검토 완료</div>}</div></aside>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="mb-1 text-[11px] font-bold text-slate-500">{label}</dt><dd className="text-xs leading-5 text-slate-700">{value}</dd></div>; }
function Editable({ label, value, multiline, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }) { return <label className="block text-[11px] font-bold text-slate-500">{label}{multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2 text-xs font-normal leading-5 text-slate-700"/> : <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2 text-xs font-normal text-slate-700"/>}</label>; }
function stepTitle(id: string, document: ReturnType<typeof useSopDemoStore.getState>['document']) { return document?.steps.find(step => step.id === id)?.title || id; }
