'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface NodeMetrics {
    timeMinutes?: number;
    costKRW?: number;
    peopleCount?: number;
}

interface FlowNodeData {
    id: string;
    metrics?: NodeMetrics;
}

interface GapAnalysisSummaryProps {
    asIsNodes: FlowNodeData[];
    toBeNodes: FlowNodeData[];
}

// 숫자 포맷 헬퍼
const formatNumber = (num: number): string => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}천`;
    return num.toLocaleString();
};

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

const formatPercent = (before: number, after: number): string => {
    if (before === 0) return '—';
    const change = ((after - before) / before) * 100;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
};

export default function GapAnalysisSummary({ asIsNodes, toBeNodes }: GapAnalysisSummaryProps) {
    const metrics = useMemo(() => {
        // Calculate As-Is totals
        const asIsTotals = asIsNodes.reduce(
            (acc, node) => ({
                time: acc.time + (node.metrics?.timeMinutes || 0),
                cost: acc.cost + (node.metrics?.costKRW || 0),
                people: acc.people + (node.metrics?.peopleCount || 0),
            }),
            { time: 0, cost: 0, people: 0 }
        );

        // Calculate To-Be totals
        const toBeTotals = toBeNodes.reduce(
            (acc, node) => ({
                time: acc.time + (node.metrics?.timeMinutes || 0),
                cost: acc.cost + (node.metrics?.costKRW || 0),
                people: acc.people + (node.metrics?.peopleCount || 0),
            }),
            { time: 0, cost: 0, people: 0 }
        );

        return {
            asIs: asIsTotals,
            toBe: toBeTotals,
            savings: {
                time: asIsTotals.time - toBeTotals.time,
                cost: asIsTotals.cost - toBeTotals.cost,
                people: asIsTotals.people - toBeTotals.people,
            },
        };
    }, [asIsNodes, toBeNodes]);

    const hasData = metrics.asIs.time > 0 || metrics.asIs.cost > 0 || metrics.asIs.people > 0;

    if (!hasData) {
        return (
            <div className="bg-white/95 backdrop-blur-xl rounded-xl p-4 border border-gray-200/80 shadow-lg shadow-gray-200/50">
                <div className="text-sm text-gray-500 text-center">
                    📊 메트릭 데이터가 있으면 ROI 분석이 표시됩니다
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
                    📊 ROI 분석
                </div>
                {/* 총 절감률 뱃지 */}
                {metrics.asIs.time > 0 && metrics.savings.time > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-lg"
                    >
                        <span className="text-white text-xs font-medium">효율성</span>
                        <span className="text-white text-sm font-bold">
                            {Math.round(((metrics.asIs.time - metrics.toBe.time) / metrics.asIs.time) * 100)}%↑
                        </span>
                    </motion.div>
                )}
            </div>

            {/* 비교 바 차트 */}
            <div className="space-y-4">
                <ComparisonBar asIs={metrics.asIs.time} toBe={metrics.toBe.time} label="⏱️ 소요 시간 (분)" />
                <ComparisonBar asIs={metrics.asIs.cost} toBe={metrics.toBe.cost} label="💰 비용 (₩)" />
                <ComparisonBar asIs={metrics.asIs.people} toBe={metrics.toBe.people} label="👥 인원 (명)" />
            </div>

            {/* 절감 요약 */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-4 pt-4 border-t border-gray-200/80 grid grid-cols-3 gap-3"
            >
                {metrics.savings.time > 0 && (
                    <div className="text-center">
                        <div className="text-lg font-bold text-emerald-600">
                            <AnimatedNumber value={metrics.savings.time} suffix="분" />
                        </div>
                        <div className="text-[10px] text-gray-500">시간 절감</div>
                    </div>
                )}
                {metrics.savings.cost > 0 && (
                    <div className="text-center">
                        <div className="text-lg font-bold text-emerald-600">
                            {formatNumber(metrics.savings.cost)}₩
                        </div>
                        <div className="text-[10px] text-gray-500">비용 절감</div>
                    </div>
                )}
                {metrics.savings.people > 0 && (
                    <div className="text-center">
                        <div className="text-lg font-bold text-emerald-600">
                            <AnimatedNumber value={metrics.savings.people} suffix="명" />
                        </div>
                        <div className="text-[10px] text-gray-500">인원 절감</div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
