'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';

import type { DurationUnit, SkillMultipliers, FlowNodeType, FlowNode } from '@/lib/store';
import { DEFAULT_SKILL_MULTIPLIERS } from '@/lib/store';
import { type FlowShape, normalizeFlowShape, getRecommendedShapeForType } from '@/lib/flow-shapes';
import { ShapePalette } from './ShapePalette';

interface NodeData {
    id?: string;
    label: string;
    description?: string;
    type: FlowNodeType;
    shape?: FlowShape;
    shapeMode?: 'auto' | 'manual';
    terminalType?: 'start' | 'end';
    ioType?: 'input' | 'output';
    stressLevel?: 'low' | 'medium' | 'high';
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    metrics?: {
        timeMinutes?: number;
        duration?: number;
        durationUnit?: DurationUnit;
        skillMultipliers?: SkillMultipliers;
    };
}

interface NodeEditorProps {
    open: boolean;
    onClose: () => void;
    onSave: (data: NodeData) => void;
    onDelete?: () => void;
    initialData?: FlowNode | NodeData | null;
    mode: 'create' | 'edit';
    flowType: 'asis' | 'tobe';
}

export default function NodeEditor({
    open,
    onClose,
    onSave,
    onDelete,
    initialData,
    mode,
    flowType,
}: NodeEditorProps) {
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<FlowNodeType>('process');
    const [shape, setShape] = useState<FlowShape>('process');
    const [shapeMode, setShapeMode] = useState<'auto' | 'manual'>('auto');
    const [terminalType, setTerminalType] = useState<'start' | 'end' | undefined>(undefined);
    const [ioType, setIoType] = useState<'input' | 'output' | undefined>(undefined);
    const [stressLevel, setStressLevel] = useState<'low' | 'medium' | 'high'>('low');
    const [collaborationType, setCollaborationType] = useState<'copilot' | 'monitor' | 'autonomous'>('copilot');
    const [duration, setDuration] = useState<number | undefined>(undefined);
    const [durationUnit, setDurationUnit] = useState<DurationUnit>('minutes');
    const [skillMultipliers, setSkillMultipliers] = useState<SkillMultipliers>({ ...DEFAULT_SKILL_MULTIPLIERS });
    const [showMultiplierEdit, setShowMultiplierEdit] = useState(false);

    // 현재 편집 상태를 기반으로 추천 도형 계산
    const recommendedShape = useMemo(
        () => getRecommendedShapeForType(type, terminalType, ioType),
        [type, terminalType, ioType]
    );

    const resetForm = () => {
        const defaultType: FlowNodeType = flowType === 'tobe' ? 'agent' : 'process';
        const defaultShape = getRecommendedShapeForType(defaultType);
        setLabel('');
        setDescription('');
        setType(defaultType);
        setShape(defaultShape);
        setShapeMode('auto');
        setTerminalType(undefined);
        setIoType(undefined);
        setStressLevel('low');
        setCollaborationType('copilot');
        setDuration(undefined);
        setDurationUnit('minutes');
        setSkillMultipliers({ ...DEFAULT_SKILL_MULTIPLIERS });
        setShowMultiplierEdit(false);
    };

    useEffect(() => {
        if (initialData) {
            const initialType: FlowNodeType = initialData.type || (flowType === 'tobe' ? 'agent' : 'process');
            const initialTerminalType = initialData.terminalType || (initialType === 'terminal' ? 'start' : undefined);
            const initialIoType = initialData.ioType || (initialType === 'io' ? 'input' : undefined);

            const initialShapeMode = initialData.shapeMode || (initialData.shape ? 'manual' : 'auto');
            const normShape = normalizeFlowShape(
                initialData.shape,
                initialType,
                initialTerminalType,
                initialIoType
            );

            setLabel(initialData.label || '');
            setDescription(initialData.description || '');
            setType(initialType);
            setTerminalType(initialTerminalType);
            setIoType(initialIoType);
            setShape(normShape);
            setShapeMode(initialShapeMode);
            setStressLevel(initialData.stressLevel || 'low');
            setCollaborationType(initialData.collaborationType || 'copilot');

            if (initialData.metrics?.duration !== undefined) {
                setDuration(initialData.metrics.duration);
                setDurationUnit(initialData.metrics.durationUnit || 'minutes');
            } else if (initialData.metrics?.timeMinutes !== undefined) {
                setDuration(initialData.metrics.timeMinutes);
                setDurationUnit('minutes');
            } else {
                setDuration(undefined);
                setDurationUnit('minutes');
            }

            setSkillMultipliers(initialData.metrics?.skillMultipliers || { ...DEFAULT_SKILL_MULTIPLIERS });
        } else {
            resetForm();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData, flowType, open]);

    // type 변경 핸들러
    const handleTypeChange = (newType: FlowNodeType) => {
        setType(newType);

        let newTermType = terminalType;
        let newIoTypeVal = ioType;

        if (newType === 'terminal') {
            newTermType = terminalType || 'start';
            newIoTypeVal = undefined;
        } else if (newType === 'io') {
            newIoTypeVal = ioType || 'input';
            newTermType = undefined;
        } else {
            newTermType = undefined;
            newIoTypeVal = undefined;
        }

        setTerminalType(newTermType);
        setIoType(newIoTypeVal);

        if (shapeMode === 'auto') {
            const rec = getRecommendedShapeForType(newType, newTermType, newIoTypeVal);
            setShape(rec);
        }
    };

    // terminalType 변경 핸들러 (시작/종료)
    const handleTerminalTypeChange = (newTermType: 'start' | 'end') => {
        setTerminalType(newTermType);
        if (shapeMode === 'auto') {
            const rec = getRecommendedShapeForType(type, newTermType, ioType);
            setShape(rec);
        }
    };

    // ioType 변경 핸들러 (입력/출력)
    const handleIoTypeChange = (newIoTypeVal: 'input' | 'output') => {
        setIoType(newIoTypeVal);
        if (shapeMode === 'auto') {
            const rec = getRecommendedShapeForType(type, terminalType, newIoTypeVal);
            setShape(rec);
        }
    };

    // 사용자가 도형 팔레트에서 직접 선택할 때 -> manual 상태 전환
    const handleSelectShape = (selected: FlowShape) => {
        setShape(selected);
        setShapeMode('manual');
    };

    // 자동 선택 리셋 -> auto 상태 전환
    const handleResetAuto = () => {
        setShape(recommendedShape);
        setShapeMode('auto');
    };

    const handleSave = () => {
        onSave({
            id: initialData?.id,
            label,
            description,
            type,
            shape,
            shapeMode,
            terminalType: type === 'terminal' ? terminalType : undefined,
            ioType: type === 'io' ? ioType : undefined,
            stressLevel: type !== 'agent' ? stressLevel : undefined,
            collaborationType: type === 'agent' ? collaborationType : undefined,
            metrics: {
                duration,
                durationUnit,
                timeMinutes: durationUnit === 'minutes' ? duration : undefined,
                skillMultipliers,
            },
        });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-white/95 backdrop-blur-xl border-[#E2E4E9] text-[#18181B] max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-[#18181B] flex items-center gap-2">
                        {mode === 'create' ? '✨ 새 노드 추가' : '✏️ 노드 편집'}
                    </DialogTitle>
                    <DialogDescription className="text-[#71717A]">
                        노드의 기능 유형, 세부 의도, 시각적 표준 도형 및 시간을 설정합니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Label */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">노드 이름 *</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="예: 데이터 수집 및 분석"
                            className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 h-9"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">설명</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="이 단계에 대한 세부 설명..."
                            className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 resize-none text-xs"
                            rows={2}
                        />
                    </div>

                    {/* Type Selection */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">노드 기능 / 유형 (Meaning)</Label>
                        <Select value={type} onValueChange={(v) => handleTypeChange(v as FlowNodeType)}>
                            <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-9 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="process">📋 일반 업무 (Process)</SelectItem>
                                <SelectItem value="decision">❓ 조건 판단 / 분기 (Decision)</SelectItem>
                                <SelectItem value="terminal">⏹ 시작 / 종료 (Terminal)</SelectItem>
                                <SelectItem value="io">📥 입출력 데이터 (I/O)</SelectItem>
                                <SelectItem value="subprocess">📦 하위 프로세스 (Subprocess)</SelectItem>
                                <SelectItem value="agent">🤖 AI Agent</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Terminal Type Sub-selection (Start / End) */}
                    {type === 'terminal' && (
                        <div className="space-y-1.5 p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-100 animate-in fade-in duration-150">
                            <Label className="text-xs font-semibold text-indigo-900">시작 / 종료 단계 세부 지정</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleTerminalTypeChange('start')}
                                    className={`py-1.5 text-xs rounded-md font-medium border transition-colors ${
                                        terminalType !== 'end'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                                    }`}
                                >
                                    ▶ 시작 단계 (Start)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTerminalTypeChange('end')}
                                    className={`py-1.5 text-xs rounded-md font-medium border transition-colors ${
                                        terminalType === 'end'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                                    }`}
                                >
                                    ⏹ 종료 단계 (End)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* IO Type Sub-selection (Input / Output) */}
                    {type === 'io' && (
                        <div className="space-y-1.5 p-2.5 bg-blue-50/70 rounded-lg border border-blue-100 animate-in fade-in duration-150">
                            <Label className="text-xs font-semibold text-blue-900">입력 / 출력 세부 지정</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleIoTypeChange('input')}
                                    className={`py-1.5 text-xs rounded-md font-medium border transition-colors ${
                                        ioType !== 'output'
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                                    }`}
                                >
                                    📥 데이터 입력 (Input)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleIoTypeChange('output')}
                                    className={`py-1.5 text-xs rounded-md font-medium border transition-colors ${
                                        ioType === 'output'
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                                    }`}
                                >
                                    📤 데이터 출력 (Output)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Visual Shape Palette */}
                    <ShapePalette
                        selectedShape={shape}
                        onSelectShape={handleSelectShape}
                        isAuto={shapeMode === 'auto'}
                        onResetAuto={handleResetAuto}
                        recommendedShape={recommendedShape}
                    />

                    {/* Metrics Section */}
                    <div className="space-y-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <Label className="text-xs font-semibold text-slate-700">📊 노드 시간 메트릭</Label>
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    min={0}
                                    value={duration ?? ''}
                                    onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : undefined)}
                                    placeholder="예: 30"
                                    className="bg-white border-slate-200 text-slate-900 h-8 text-xs flex-1"
                                />
                                <Select
                                    value={durationUnit}
                                    onValueChange={(v) => setDurationUnit(v as DurationUnit)}
                                >
                                    <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-8 w-24 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="minutes">분</SelectItem>
                                        <SelectItem value="hours">시간</SelectItem>
                                        <SelectItem value="days">일</SelectItem>
                                        <SelectItem value="weeks">주</SelectItem>
                                        <SelectItem value="months">개월</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {duration !== undefined && duration > 0 && (
                                <div className="bg-white rounded-lg p-2 border border-slate-200 text-xs">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[11px] text-slate-500 font-medium">역량별 예상 소요 시간</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowMultiplierEdit(!showMultiplierEdit)}
                                            className="text-[10px] text-blue-600 hover:underline"
                                        >
                                            {showMultiplierEdit ? '완료' : '배율 편집'}
                                        </button>
                                    </div>

                                    {showMultiplierEdit && (
                                        <div className="grid grid-cols-3 gap-2 mb-2 pt-1 border-t border-slate-100">
                                            <div className="text-center">
                                                <div className="text-[9px] text-red-600 mb-0.5">저역량</div>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    value={skillMultipliers.junior}
                                                    onChange={(e) => setSkillMultipliers((prev) => ({ ...prev, junior: Number(e.target.value) || 1.5 }))}
                                                    className="h-6 text-[10px] text-center bg-red-50"
                                                />
                                            </div>
                                            <div className="text-center">
                                                <div className="text-[9px] text-amber-600 mb-0.5">중역량</div>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    value={skillMultipliers.mid}
                                                    onChange={(e) => setSkillMultipliers((prev) => ({ ...prev, mid: Number(e.target.value) || 1.0 }))}
                                                    className="h-6 text-[10px] text-center bg-amber-50"
                                                />
                                            </div>
                                            <div className="text-center">
                                                <div className="text-[9px] text-emerald-600 mb-0.5">고역량</div>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    value={skillMultipliers.senior}
                                                    onChange={(e) => setSkillMultipliers((prev) => ({ ...prev, senior: Number(e.target.value) || 0.7 }))}
                                                    className="h-6 text-[10px] text-center bg-emerald-50"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-3 gap-1.5 text-center">
                                        <div className="bg-red-50 p-1 rounded border border-red-100">
                                            <div className="text-[9px] text-red-600">저역량 (×{skillMultipliers.junior})</div>
                                            <div className="font-semibold text-xs text-red-700">{(duration * skillMultipliers.junior).toFixed(1)}{durationUnit === 'minutes' ? '분' : durationUnit === 'hours' ? '시간' : '일'}</div>
                                        </div>
                                        <div className="bg-amber-50 p-1 rounded border border-amber-100">
                                            <div className="text-[9px] text-amber-600">중역량 (×{skillMultipliers.mid})</div>
                                            <div className="font-semibold text-xs text-amber-700">{(duration * skillMultipliers.mid).toFixed(1)}{durationUnit === 'minutes' ? '분' : durationUnit === 'hours' ? '시간' : '일'}</div>
                                        </div>
                                        <div className="bg-emerald-50 p-1 rounded border border-emerald-100">
                                            <div className="text-[9px] text-emerald-600">고역량 (×{skillMultipliers.senior})</div>
                                            <div className="font-semibold text-xs text-emerald-700">{(duration * skillMultipliers.senior).toFixed(1)}{durationUnit === 'minutes' ? '분' : durationUnit === 'hours' ? '시간' : '일'}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stress Level (for non-agent) */}
                    {type !== 'agent' && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">스트레스 레벨 (병목 여부)</Label>
                            <Select
                                value={stressLevel}
                                onValueChange={(v) => setStressLevel(v as 'low' | 'medium' | 'high')}
                            >
                                <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">🟢 낮음 (원활)</SelectItem>
                                    <SelectItem value="medium">🟡 보통 (주의)</SelectItem>
                                    <SelectItem value="high">🔴 높음 (주요 병목)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Collaboration Type (for agent) */}
                    {type === 'agent' && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">AI 협업 유형 (Collaboration)</Label>
                            <Select
                                value={collaborationType}
                                onValueChange={(v) => setCollaborationType(v as 'copilot' | 'monitor' | 'autonomous')}
                            >
                                <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="copilot">🤝 Co-pilot (인간과 AI 공동 수행)</SelectItem>
                                    <SelectItem value="monitor">👁️ Monitor (인간 감독 하 수행)</SelectItem>
                                    <SelectItem value="autonomous">🚀 Autonomous (AI 자율 수행)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between pt-2">
                    {mode === 'edit' && onDelete && (
                        <Button variant="destructive" onClick={onDelete} size="sm" className="mr-auto">
                            🗑️ 삭제
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose}>
                            취소
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!label.trim()}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {mode === 'create' ? '노드 추가' : '저장'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
