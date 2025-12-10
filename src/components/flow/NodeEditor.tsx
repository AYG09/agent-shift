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

interface NodeData {
    id?: string;
    label: string;
    description?: string;
    type: 'task' | 'decision' | 'subprocess' | 'agent';
    shape?: 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'parallelogram' | 'hexagon';
    stressLevel?: 'low' | 'medium' | 'high';
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
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

    const resetForm = () => {
        setLabel('');
        setDescription('');
        setType(flowType === 'tobe' ? 'agent' : 'task');
        setShape(undefined); // Reset to default
        setStressLevel('low');
        setCollaborationType('copilot');
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
        });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create' ? '✨ 새 노드 추가' : '✏️ 노드 편집'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Label */}
                    <div className="space-y-2">
                        <Label>노드 이름 *</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="예: 데이터 수집"
                            className="bg-slate-800 border-slate-600"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label>설명</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="이 단계에 대한 설명..."
                            className="bg-slate-800 border-slate-600 resize-none"
                            rows={2}
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <Label>노드 유형</Label>
                        <Select value={type} onValueChange={(v) => setType(v as NodeData['type'])}>
                            <SelectTrigger className="bg-slate-800 border-slate-600">
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
                        <Label>도형 모양 (선택 사항)</Label>
                        <Select
                            value={shape}
                            onValueChange={(v) => setShape(v as NodeData['shape'])}
                        >
                            <SelectTrigger className="bg-slate-800 border-slate-600">
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

                    {/* Stress Level (for non-agent) */}
                    {type !== 'agent' && (
                        <div className="space-y-2">
                            <Label>스트레스 레벨</Label>
                            <Select
                                value={stressLevel}
                                onValueChange={(v) => setStressLevel(v as NodeData['stressLevel'])}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-600">
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
                            <Label>협업 유형</Label>
                            <Select
                                value={collaborationType}
                                onValueChange={(v) =>
                                    setCollaborationType(v as NodeData['collaborationType'])
                                }
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-600">
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
                            className="border-slate-600 bg-white text-slate-900 hover:bg-slate-100"
                        >
                            취소
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!label}
                            className="bg-indigo-600 hover:bg-indigo-500"
                        >
                            {mode === 'create' ? '추가' : '저장'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
