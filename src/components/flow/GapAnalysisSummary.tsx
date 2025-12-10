'use client';

import { useMemo } from 'react';

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
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                <div className="text-sm text-slate-400 text-center">
                    📊 메트릭 데이터가 있으면 ROI 분석이 표시됩니다
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 border border-slate-700 shadow-xl">
            <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                📊 ROI 분석
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
                {/* Time */}
                <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-slate-400 mb-1">⏱️ 소요 시간</div>
                    <div className="flex justify-between items-baseline">
                        <span className="text-red-400 line-through">{metrics.asIs.time}분</span>
                        <span className="text-green-400 font-bold">{metrics.toBe.time}분</span>
                    </div>
                    <div
                        className={`mt-1 font-semibold ${metrics.savings.time > 0 ? 'text-green-400' : 'text-slate-400'}`}
                    >
                        {metrics.savings.time > 0 ? `▼ ${metrics.savings.time}분 절감` : '—'}
                    </div>
                </div>

                {/* Cost */}
                <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-slate-400 mb-1">💰 비용</div>
                    <div className="flex justify-between items-baseline">
                        <span className="text-red-400 line-through">
                            {formatNumber(metrics.asIs.cost)}₩
                        </span>
                        <span className="text-green-400 font-bold">
                            {formatNumber(metrics.toBe.cost)}₩
                        </span>
                    </div>
                    <div
                        className={`mt-1 font-semibold ${metrics.savings.cost > 0 ? 'text-green-400' : 'text-slate-400'}`}
                    >
                        {metrics.savings.cost > 0
                            ? `▼ ${formatNumber(metrics.savings.cost)}₩ 절감`
                            : '—'}
                    </div>
                </div>

                {/* People */}
                <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-slate-400 mb-1">👥 인원</div>
                    <div className="flex justify-between items-baseline">
                        <span className="text-red-400 line-through">{metrics.asIs.people}명</span>
                        <span className="text-green-400 font-bold">{metrics.toBe.people}명</span>
                    </div>
                    <div
                        className={`mt-1 font-semibold ${metrics.savings.people > 0 ? 'text-green-400' : 'text-slate-400'}`}
                    >
                        {metrics.savings.people > 0 ? `▼ ${metrics.savings.people}명 절감` : '—'}
                    </div>
                </div>
            </div>

            {/* Overall ROI */}
            {metrics.asIs.time > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700 text-center">
                    <span className="text-slate-400 text-xs">전체 효율성 개선: </span>
                    <span className="text-lg font-bold text-emerald-400">
                        {formatPercent(metrics.asIs.time, metrics.toBe.time)}
                    </span>
                </div>
            )}
        </div>
    );
}
