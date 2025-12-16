'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// 스킬 레벨 상수
type SkillLevel = 'junior' | 'mid' | 'senior';
const SKILL_MULTIPLIERS: Record<SkillLevel, number> = {
    junior: 1.5,
    mid: 1.0,
    senior: 0.7,
};
const SKILL_LABELS: Record<SkillLevel, string> = {
    junior: '🔴 저역량 (1.5x)',
    mid: '🟡 중역량 (1.0x)',
    senior: '🟢 고역량 (0.7x)',
};

interface NodeMetrics {
    timeMinutes?: number;
}

interface FlowNodeData {
    id: string;
    metrics?: NodeMetrics;
}

interface GapAnalysisSummaryProps {
    asIsNodes: FlowNodeData[];
    toBeNodes: FlowNodeData[];
}

// 애니메이션 숫자 카운터 컴포넌트
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
    const spring = useSpring(0, { mass: 0.8, stiffness: 75, damping: 15 });
    const display = useTransform(spring, (current) => Math.round(current).toLocaleString());
    const [displayValue, setDisplayValue] = useState('0');

    useEffect(() => {
        spring.set(value);
    }, [spring, value]);

    useEffect(() => {
        return display.on('change', (v) => setDisplayValue(v));
    }, [display]);

    return <span>{displayValue}{suffix}</span>;
}

// 비교 바 차트 컴포넌트
function ComparisonBar({ asIs, toBe, label }: { asIs: number; toBe: number; label: string }) {
    const max = Math.max(asIs, toBe, 1);
    const asIsPercent = (asIs / max) * 100;
    const toBePercent = (toBe / max) * 100;
    const savingsPercent = asIs > 0 ? Math.round(((asIs - toBe) / asIs) * 100) : 0;

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">{label}</span>
                {savingsPercent > 0 && (
                    <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.5, type: 'spring' }}
                        className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold"
                    >
                        -{savingsPercent}%
                    </motion.span>
                )}
            </div>
            <div className="space-y-1.5">
                {/* As-Is Bar */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-red-500 w-10 shrink-0">As-Is</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${asIsPercent}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full"
                        />
                    </div>
                    <span className="text-[10px] text-gray-500 w-12 text-right">
                        <AnimatedNumber value={asIs} />
                    </span>
                </div>
                {/* To-Be Bar */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-600 w-10 shrink-0">To-Be</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${toBePercent}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                        />
                    </div>
                    <span className="text-[10px] text-gray-500 w-12 text-right">
                        <AnimatedNumber value={toBe} />
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function GapAnalysisSummary({ asIsNodes, toBeNodes }: GapAnalysisSummaryProps) {
    const [skillLevel, setSkillLevel] = useState<SkillLevel>('mid');

    const metrics = useMemo(() => {
        const multiplier = SKILL_MULTIPLIERS[skillLevel];

        // Calculate As-Is totals with skill multiplier
        const asIsTotals = asIsNodes.reduce(
            (acc, node) => ({
                time: acc.time + Math.round((node.metrics?.timeMinutes || 0) * multiplier),
            }),
            { time: 0 }
        );

        // Calculate To-Be totals with skill multiplier
        const toBeTotals = toBeNodes.reduce(
            (acc, node) => ({
                time: acc.time + Math.round((node.metrics?.timeMinutes || 0) * multiplier),
            }),
            { time: 0 }
        );

        return {
            asIs: asIsTotals,
            toBe: toBeTotals,
            savings: {
                time: asIsTotals.time - toBeTotals.time,
            },
        };
    }, [asIsNodes, toBeNodes, skillLevel]);

    const hasData = metrics.asIs.time > 0;

    if (!hasData) {
        return (
            <div className="bg-white/95 backdrop-blur-xl rounded-xl p-4 border border-gray-200/80 shadow-lg shadow-gray-200/50">
                <div className="text-sm text-gray-500 text-center">
                    📊 메트릭 데이터가 있으면 생산성 분석이 표시됩니다
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white/95 backdrop-blur-xl rounded-xl p-5 border border-gray-200/80 shadow-xl shadow-gray-200/50"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    📊 생산성 분석
                </div>
                {/* 스킬 레벨 선택 */}
                <Select value={skillLevel} onValueChange={(v) => setSkillLevel(v as SkillLevel)}>
                    <SelectTrigger className="w-[140px] h-7 text-xs bg-white/80 border-gray-200">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="junior">{SKILL_LABELS.junior}</SelectItem>
                        <SelectItem value="mid">{SKILL_LABELS.mid}</SelectItem>
                        <SelectItem value="senior">{SKILL_LABELS.senior}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            {/* 총 절감률 뱃지 */}
            {metrics.asIs.time > 0 && metrics.savings.time > 0 && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-lg mb-4"
                >
                    <span className="text-white text-xs font-medium">생산성 향상</span>
                    <span className="text-white text-sm font-bold">
                        {Math.round(((metrics.asIs.time - metrics.toBe.time) / metrics.asIs.time) * 100)}%↑
                    </span>
                </motion.div>
            )}

            {/* 비교 바 차트 - 맨아워 표시 */}
            <div className="space-y-4">
                <ComparisonBar asIs={metrics.asIs.time} toBe={metrics.toBe.time} label="⏱️ 맨아워 (분)" />
            </div>

            {/* 절감 요약 */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-4 pt-4 border-t border-gray-200/80"
            >
                {metrics.savings.time > 0 && (
                    <div className="text-center">
                        <div className="text-xl font-bold text-emerald-600">
                            <AnimatedNumber value={metrics.savings.time} suffix="분" />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">맨아워 절감</div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
