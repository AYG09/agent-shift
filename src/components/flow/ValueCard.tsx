'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ValueCardProps {
    nodeLabel: string;
    collaborationType?: 'copilot' | 'monitor' | 'autonomous';
    timeSaved?: string;
    costSaved?: string;
    strengths?: string[];
    weaknesses?: string[];
}

export default function ValueCard({
    nodeLabel,
    collaborationType = 'copilot',
    timeSaved = '80%',
    costSaved = '60%',
    strengths = ['자동화로 인한 효율성 증가', '일관된 품질 보장'],
    weaknesses = ['초기 설정 비용', '예외 상황 처리 필요'],
}: ValueCardProps) {
    const collabInfo = {
        copilot: { label: 'Co-pilot', desc: '인간과 AI가 협업', color: 'text-blue-400' },
        monitor: { label: 'Monitor', desc: '인간이 AI를 감독', color: 'text-cyan-400' },
        autonomous: { label: 'Autonomous', desc: 'AI가 독립 수행', color: 'text-emerald-400' },
    };

    const collab = collabInfo[collaborationType];

    return (
        <Card className="bg-slate-800/90 border-slate-700 backdrop-blur-sm w-full sm:w-80">
            <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <span className="text-xl sm:text-2xl">🤖</span>
                    <span className="text-white truncate">{nodeLabel}</span>
                </CardTitle>
                <div className={`text-xs sm:text-sm ${collab.color}`}>
                    {collab.label} - {collab.desc}
                </div>
            </CardHeader>

            <CardContent className="space-y-3 sm:space-y-4">
                {/* 가치 지표 */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 sm:p-3 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-green-400">{timeSaved}</div>
                        <div className="text-[10px] sm:text-xs text-slate-400">시간 절감</div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 sm:p-3 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-blue-400">{costSaved}</div>
                        <div className="text-[10px] sm:text-xs text-slate-400">비용 절감</div>
                    </div>
                </div>

                {/* SWOT 간소화 */}
                <div className="space-y-2">
                    <div className="flex items-start gap-2">
                        <span className="text-green-400 text-xs sm:text-sm">✅</span>
                        <div className="text-xs sm:text-sm text-slate-300">
                            {strengths.map((s, i) => (
                                <div key={i}>• {s}</div>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-yellow-400 text-xs sm:text-sm">⚠️</span>
                        <div className="text-xs sm:text-sm text-slate-400">
                            {weaknesses.map((w, i) => (
                                <div key={i}>• {w}</div>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
