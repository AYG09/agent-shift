'use client';

import { useState, useEffect } from 'react';
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
    DialogFooter,
} from '@/components/ui/dialog';

import type { DurationUnit } from '@/lib/store';

interface NodeData {
    id?: string;
    label: string;
    description?: string;
    type: 'task' | 'decision' | 'subprocess' | 'agent';
    shape?: 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'parallelogram' | 'hexagon';
    stressLevel?: 'low' | 'medium' | 'high';
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    metrics?: {
        timeMinutes?: number; // 하위 호환성
        duration?: number;
        durationUnit?: DurationUnit;
    };
}

interface NodeEditorProps {
    open: boolean;
    onClose: () => void;
    onSave: (data: NodeData) => void;
    onDelete?: () => void;
    initialData?: NodeData | null;
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
    const [type, setType] = useState<NodeData['type']>('task');
    const [shape, setShape] = useState<NodeData['shape']>('rectangle');
    const [stressLevel, setStressLevel] = useState<NodeData['stressLevel']>('low');
    const [collaborationType, setCollaborationType] =
        useState<NodeData['collaborationType']>('copilot');
    const [duration, setDuration] = useState<number | undefined>(undefined);
    const [durationUnit, setDurationUnit] = useState<DurationUnit>('minutes');
    const [timeMinutes, setTimeMinutes] = useState<number | undefined>(undefined); // 하위 호환성

    const resetForm = () => {
        setLabel('');
        setDescription('');
        setType(flowType === 'tobe' ? 'agent' : 'task');
        setShape(undefined); // Reset to default
        setStressLevel('low');
        setCollaborationType('copilot');
        setDuration(undefined);
        setDurationUnit('minutes');
        setTimeMinutes(undefined);
    };

    useEffect(() => {
        // 초기 로드와 initialData 변화에 따른 단일 동기화 (열림 여부와 무관)
        if (initialData) {
            setLabel(initialData.label || '');
            setDescription(initialData.description || '');
            setType(initialData.type || (flowType === 'tobe' ? 'agent' : 'task'));
            setShape(initialData.shape);
            setStressLevel(initialData.stressLevel || 'low');
            setCollaborationType(initialData.collaborationType || 'copilot');
            // 새 필드 우선, 하위 호환성 유지
            if (initialData.metrics?.duration !== undefined) {
                setDuration(initialData.metrics.duration);
                setDurationUnit(initialData.metrics.durationUnit || 'minutes');
                setTimeMinutes(undefined);
            } else if (initialData.metrics?.timeMinutes !== undefined) {
                // 기존 데이터 변환
                setDuration(initialData.metrics.timeMinutes);
                setDurationUnit('minutes');
                setTimeMinutes(initialData.metrics.timeMinutes);
            } else {
                setDuration(undefined);
                setDurationUnit('minutes');
                setTimeMinutes(undefined);
            }
        } else {
            resetForm();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData, flowType]);

    const handleSave = () => {
        onSave({
            id: initialData?.id,
            label,
            description,
            type,
            shape, // Save shape
            stressLevel: type !== 'agent' ? stressLevel : undefined,
            collaborationType: type === 'agent' ? collaborationType : undefined,
            metrics: {
                duration,
                durationUnit,
                timeMinutes: durationUnit === 'minutes' ? duration : undefined, // 하위 호환성
            },
        });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-white/95 backdrop-blur-xl border-[#E2E4E9] text-[#18181B] max-w-md shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-[#18181B]">
                        {mode === 'create' ? '✨ 새 노드 추가' : '✏️ 노드 편집'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Label */}
                    <div className="space-y-2">
                        <Label className="text-[#71717A]">노드 이름 *</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="예: 데이터 수집"
                            className="bg-white/50 border-[#E2E4E9] text-[#18181B] placeholder:text-[#A1A1AA]"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label className="text-[#71717A]">설명</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="이 단계에 대한 설명..."
                            className="bg-white/50 border-[#E2E4E9] text-[#18181B] placeholder:text-[#A1A1AA] resize-none"
                            rows={2}
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <Label className="text-[#71717A]">노드 유형</Label>
                        <Select value={type} onValueChange={(v) => setType(v as NodeData['type'])}>
                            <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="task">📋 일반 업무</SelectItem>
                                <SelectItem value="decision">❓ 분기점</SelectItem>
                                <SelectItem value="subprocess">📦 하위 프로세스</SelectItem>
                                <SelectItem value="agent">🤖 AI Agent</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Shape Selection */}
                    <div className="space-y-2">
                        <Label className="text-[#71717A]">도형 모양 (선택 사항)</Label>
                        <Select
                            value={shape}
                            onValueChange={(v) => setShape(v as NodeData['shape'])}
                        >
                            <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
                                <SelectValue placeholder="자동 (기본값)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="rectangle">🟩 직사각형 (기본)</SelectItem>
                                <SelectItem value="rounded">🔲 둥근 사각형</SelectItem>
                                <SelectItem value="pill">💊 캡슐형 (타원)</SelectItem>
                                <SelectItem value="diamond">💠 다이아몬드 (판단)</SelectItem>
                                <SelectItem value="parallelogram">▱ 평행사변형 (입출력)</SelectItem>
                                <SelectItem value="hexagon">🛑 육각형 (에이전트)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Metrics Section */}
                    <div className="space-y-3 p-3 bg-[#F4F4F5]/50 rounded-lg border border-[#E2E4E9]">
                        <Label className="text-[#71717A] font-medium">📊 노드 메트릭 (선택 사항)</Label>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-[#A1A1AA] text-xs">⏱️ 기준 소요시간</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        value={duration ?? ''}
                                        onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : undefined)}
                                        placeholder="예: 30"
                                        className="bg-white/50 border-[#E2E4E9] text-[#18181B] placeholder:text-[#D4D4D8] h-8 text-sm flex-1"
                                    />
                                    <Select
                                        value={durationUnit}
                                        onValueChange={(v) => setDurationUnit(v as DurationUnit)}
                                    >
                                        <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B] h-8 w-24">
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
                            </div>
                            {/* 스킬 레벨별 예상 시간 (읽기 전용) */}
                            {duration && duration > 0 && (
                                <div className="bg-white/80 rounded-md p-2 border border-[#E2E4E9]">
                                    <Label className="text-[#A1A1AA] text-xs mb-2 block">📈 스킬 레벨별 예상 시간</Label>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-red-50 rounded px-2 py-1">
                                            <div className="text-[10px] text-red-600">저역량</div>
                                            <div className="text-sm font-medium text-red-700">{(duration * 1.5).toFixed(1)}{durationUnit === 'minutes' ? '분' : durationUnit === 'hours' ? '시간' : durationUnit === 'days' ? '일' : durationUnit === 'weeks' ? '주' : '개월'}</div>
                                        </div>
                                        <div className="bg-amber-50 rounded px-2 py-1">
                                            <div className="text-[10px] text-amber-600">중역량</div>
                                            <div className="text-sm font-medium text-amber-700">{duration}{durationUnit === 'minutes' ? '분' : durationUnit === 'hours' ? '시간' : durationUnit === 'days' ? '일' : durationUnit === 'weeks' ? '주' : '개월'}</div>
                                        </div>
                                        <div className="bg-emerald-50 rounded px-2 py-1">
                                            <div className="text-[10px] text-emerald-600">고역량</div>
                                            <div className="text-sm font-medium text-emerald-700">{(duration * 0.7).toFixed(1)}{durationUnit === 'minutes' ? '분' : durationUnit === 'hours' ? '시간' : durationUnit === 'days' ? '일' : durationUnit === 'weeks' ? '주' : '개월'}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stress Level (for non-agent) */}
                    {type !== 'agent' && (
                        <div className="space-y-2">
                            <Label className="text-[#71717A]">스트레스 레벨</Label>
                            <Select
                                value={stressLevel}
                                onValueChange={(v) => setStressLevel(v as NodeData['stressLevel'])}
                            >
                                <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">🟢 낮음</SelectItem>
                                    <SelectItem value="medium">🟡 보통</SelectItem>
                                    <SelectItem value="high">🔴 높음 (병목)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Collaboration Type (for agent) */}
                    {type === 'agent' && (
                        <div className="space-y-2">
                            <Label className="text-[#71717A]">협업 유형</Label>
                            <Select
                                value={collaborationType}
                                onValueChange={(v) =>
                                    setCollaborationType(v as NodeData['collaborationType'])
                                }
                            >
                                <SelectTrigger className="bg-white/50 border-[#E2E4E9] text-[#18181B]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="copilot">🤝 Co-pilot (인간 협력)</SelectItem>
                                    <SelectItem value="monitor">👁️ Monitor (인간 감독)</SelectItem>
                                    <SelectItem value="autonomous">
                                        🚀 Autonomous (자율 수행)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between">
                    {mode === 'edit' && onDelete && (
                        <Button variant="destructive" onClick={onDelete} className="mr-auto">
                            🗑️ 삭제
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="border-[#E2E4E9] bg-white text-[#18181B] hover:bg-[#F5F6F8]"
                        >
                            취소
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!label}
                            className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                        >
                            {mode === 'create' ? '추가' : '저장'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
