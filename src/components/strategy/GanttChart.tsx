'use client';

import { useState } from 'react';
// Unused UI imports removed to satisfy lint

interface ActionItem {
    action: string;
    rationale: string;
    value: string;
}

interface Phase {
    id: string;
    name: string;
    duration: string;
    startWeek: number;
    endWeek: number;
    actions: (string | ActionItem)[];
    color: string;
}

interface GanttChartProps {
    phases: Phase[];
    totalWeeks?: number;
    onPhaseClick?: (phase: Phase) => void;
}

export default function GanttChart({ phases, totalWeeks = 12, onPhaseClick }: GanttChartProps) {
    const [hoveredPhase, setHoveredPhase] = useState<string | null>(null);
    const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

    return (
        <div className="w-full overflow-x-auto">
            <div className="min-w-[800px]">
                {/* 헤더 - 주차 표시 */}
                <div className="flex border-b border-slate-700 mb-2">
                    <div className="w-48 shrink-0 p-2 text-sm font-medium text-slate-400">단계</div>
                    <div
                        className="flex-1 grid"
                        style={{ gridTemplateColumns: `repeat(${totalWeeks}, 1fr)` }}
                    >
                        {weeks.map((week) => (
                            <div
                                key={week}
                                className="text-center text-xs text-slate-500 py-2 border-l border-slate-800"
                            >
                                {week}주
                            </div>
                        ))}
                    </div>
                </div>

                {/* 간트 바 */}
                {phases.map((phase) => (
                    <div
                        key={phase.id}
                        className="flex items-center mb-2 group"
                        onMouseEnter={() => setHoveredPhase(phase.id)}
                        onMouseLeave={() => setHoveredPhase(null)}
                    >
                        {/* 단계명 */}
                        <div
                            className="w-48 shrink-0 p-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors"
                            onClick={() => onPhaseClick?.(phase)}
                        >
                            {phase.name}
                        </div>

                        {/* 타임라인 바 */}
                        <div
                            className="flex-1 grid h-10 relative"
                            style={{ gridTemplateColumns: `repeat(${totalWeeks}, 1fr)` }}
                        >
                            {/* 배경 그리드 */}
                            {weeks.map((week) => (
                                <div key={week} className="border-l border-slate-800 h-full" />
                            ))}

                            {/* 간트 바 */}
                            <div
                                className={`absolute h-8 top-1 rounded-lg transition-all duration-200 cursor-pointer
                  ${hoveredPhase === phase.id ? 'ring-2 ring-white/30 scale-y-110' : ''}
                `}
                                style={{
                                    left: `${((phase.startWeek - 1) / totalWeeks) * 100}%`,
                                    width: `${((phase.endWeek - phase.startWeek + 1) / totalWeeks) * 100}%`,
                                    background: `linear-gradient(135deg, ${phase.color} 0%, ${phase.color}aa 100%)`,
                                }}
                                onClick={() => onPhaseClick?.(phase)}
                            >
                                <div className="px-2 py-1 text-xs text-white font-medium truncate">
                                    {phase.duration}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* 범례 */}
                <div className="flex gap-4 mt-6 pt-4 border-t border-slate-800">
                    {phases.map((phase) => (
                        <div key={phase.id} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: phase.color }}
                            />
                            <span className="text-xs text-slate-400">{phase.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// 프레임워크별 기본 단계 데이터
export const frameworkPhases = {
    kotter: [
        {
            id: '1',
            name: '긴급성 조성',
            duration: '2주',
            startWeek: 1,
            endWeek: 2,
            actions: ['위기 인식 공유', '변화 필요성 전파'],
            color: '#ef4444',
        },
        {
            id: '2',
            name: '추진팀 구성',
            duration: '1주',
            startWeek: 2,
            endWeek: 3,
            actions: ['변화 리더 선정', '크로스펑셔널 팀 구성'],
            color: '#f97316',
        },
        {
            id: '3',
            name: '비전 수립',
            duration: '2주',
            startWeek: 3,
            endWeek: 5,
            actions: ['목표 상태 정의', '전략 로드맵 작성'],
            color: '#eab308',
        },
        {
            id: '4',
            name: '비전 전파',
            duration: '2주',
            startWeek: 5,
            endWeek: 7,
            actions: ['전사 커뮤니케이션', '피드백 수집'],
            color: '#22c55e',
        },
        {
            id: '5',
            name: '장애물 제거',
            duration: '2주',
            startWeek: 7,
            endWeek: 9,
            actions: ['저항 요인 분석', '지원 체계 구축'],
            color: '#06b6d4',
        },
        {
            id: '6',
            name: '단기 성과',
            duration: '2주',
            startWeek: 9,
            endWeek: 11,
            actions: ['Quick Win 달성', '성과 가시화'],
            color: '#3b82f6',
        },
        {
            id: '7',
            name: '변화 가속',
            duration: '2주',
            startWeek: 10,
            endWeek: 12,
            actions: ['추가 변화 추진', '모멘텀 유지'],
            color: '#8b5cf6',
        },
        {
            id: '8',
            name: '문화 정착',
            duration: '2주',
            startWeek: 11,
            endWeek: 12,
            actions: ['새 프로세스 표준화', '지속적 개선'],
            color: '#ec4899',
        },
    ],
    adkar: [
        {
            id: '1',
            name: 'Awareness',
            duration: '2주',
            startWeek: 1,
            endWeek: 3,
            actions: ['변화 필요성 인식'],
            color: '#ef4444',
        },
        {
            id: '2',
            name: 'Desire',
            duration: '2주',
            startWeek: 3,
            endWeek: 5,
            actions: ['참여 동기 부여'],
            color: '#f97316',
        },
        {
            id: '3',
            name: 'Knowledge',
            duration: '3주',
            startWeek: 5,
            endWeek: 8,
            actions: ['역량 교육'],
            color: '#22c55e',
        },
        {
            id: '4',
            name: 'Ability',
            duration: '3주',
            startWeek: 8,
            endWeek: 11,
            actions: ['실행 역량 개발'],
            color: '#3b82f6',
        },
        {
            id: '5',
            name: 'Reinforcement',
            duration: '2주',
            startWeek: 11,
            endWeek: 12,
            actions: ['변화 강화'],
            color: '#8b5cf6',
        },
    ],
    lewin: [
        {
            id: '1',
            name: '해빙(Unfreeze)',
            duration: '3주',
            startWeek: 1,
            endWeek: 4,
            actions: ['현상 분석', '변화 필요성 인식'],
            color: '#3b82f6',
        },
        {
            id: '2',
            name: '변화(Change)',
            duration: '5주',
            startWeek: 4,
            endWeek: 9,
            actions: ['새 프로세스 도입', '실행 및 조정'],
            color: '#22c55e',
        },
        {
            id: '3',
            name: '재동결(Refreeze)',
            duration: '3주',
            startWeek: 9,
            endWeek: 12,
            actions: ['표준화', '문화 정착'],
            color: '#8b5cf6',
        },
    ],
};
