'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FrameworkCardProps {
    id: 'kotter' | 'adkar' | 'lewin';
    selected?: boolean;
    onSelect?: (id: 'kotter' | 'adkar' | 'lewin') => void;
}

const frameworks = {
    kotter: {
        name: "Kotter's 8 Steps",
        icon: '🔥',
        description: '긴급성 조성부터 문화 정착까지 8단계 체계적 변화 관리',
        theory: 'John Kotter (1996) - 순차적 단계별 접근',
        steps: [
            '긴급성 조성',
            '추진팀 구성',
            '비전 수립',
            '비전 전파',
            '장애물 제거',
            '단기 성과',
            '변화 가속',
            '문화 정착',
        ],
        color: 'from-orange-500 to-red-500',
        borderColor: 'border-orange-500/30',
    },
    adkar: {
        name: 'ADKAR Model',
        icon: '🎯',
        description: '개인 변화에 초점을 맞춘 5단계 모델',
        theory: 'Prosci (Jeff Hiatt) - 개인 심리 중심',
        steps: [
            'Awareness (인식)',
            'Desire (욕구)',
            'Knowledge (지식)',
            'Ability (능력)',
            'Reinforcement (강화)',
        ],
        color: 'from-blue-500 to-cyan-500',
        borderColor: 'border-blue-500/30',
    },
    lewin: {
        name: "Lewin + Schein",
        icon: '🧊',
        description: 'Lewin의 3단계 + Schein의 8가지 학습불안 감소 방법',
        theory: 'Kurt Lewin (1947) + Edgar Schein (2017)',
        badge: '심층 분석',
        steps: ['해빙 (Unfreeze)', '변화 (Change)', '재동결 (Refreeze)'],
        scheinApproaches: [
            '긍정적 비전',
            '공식 교육',
            '학습자 참여',
            '팀 학습',
            '연습·피드백',
            '역할 모델',
            '지원 그룹',
            '일관된 시스템',
        ],
        color: 'from-purple-500 to-pink-500',
        borderColor: 'border-purple-500/30',
    },
};

export default function FrameworkCard({ id, selected, onSelect }: FrameworkCardProps) {
    const fw = frameworks[id];
    const hasSchein = 'scheinApproaches' in fw;

    return (
        <Card
            className={`cursor-pointer transition-all duration-300 backdrop-blur-xl relative overflow-hidden
        ${
            selected
                ? `bg-gradient-to-br ${fw.color} border-2 ${fw.borderColor} scale-[1.02] shadow-xl ring-2 ring-offset-2 ring-offset-white`
                : 'bg-white/80 border-[#E2E4E9] hover:border-[#3B82F6]/50 hover:shadow-lg hover:-translate-y-0.5'
        }
      `}
            onClick={() => onSelect?.(id)}
        >
            {/* 체크마크 아이콘 */}
            {selected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md animate-in zoom-in-50 duration-200">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            )}
            {/* 심층 분석 뱃지 */}
            {'badge' in fw && fw.badge && (
                <div className={`absolute top-3 ${selected ? 'right-12' : 'right-3'} px-2 py-0.5 rounded-full text-[10px] font-medium ${selected ? 'bg-white/30 text-white' : 'bg-purple-100 text-purple-700'}`}>
                    {fw.badge}
                </div>
            )}
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="text-2xl">{fw.icon}</span>
                    <span className={selected ? 'text-white' : 'text-[#18181B]'}>{fw.name}</span>
                </CardTitle>
                <CardDescription className={selected ? 'text-white/90' : 'text-[#71717A]'}>
                    {fw.description}
                </CardDescription>
                {'theory' in fw && (
                    <p className={`text-xs mt-1 ${selected ? 'text-white/70' : 'text-[#A1A1AA]'}`}>
                        {fw.theory}
                    </p>
                )}
            </CardHeader>

            <CardContent className="space-y-3">
                {/* 기본 단계 */}
                <div className="flex flex-wrap gap-1">
                    {fw.steps.map((step, idx) => (
                        <span
                            key={idx}
                            className={`text-xs px-2 py-1 rounded-full transition-colors
                ${selected ? 'bg-white/20 text-white' : 'bg-[#F5F6F8] text-[#71717A]'}
              `}
                        >
                            {idx + 1}. {step}
                        </span>
                    ))}
                </div>
                
                {/* Schein 8가지 접근방법 (Lewin 모델만) */}
                {hasSchein && (
                    <div className="pt-2 border-t border-white/20">
                        <p className={`text-xs mb-2 ${selected ? 'text-white/80' : 'text-[#71717A]'}`}>
                            + Schein의 8가지 학습불안 감소 방법
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {(fw as typeof frameworks.lewin).scheinApproaches.map((approach, idx) => (
                                <span
                                    key={idx}
                                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors
                                        ${selected ? 'bg-white/10 text-white/90' : 'bg-purple-50 text-purple-600'}
                                    `}
                                >
                                    {idx + 1}. {approach}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// 모든 프레임워크를 그리드로 표시
export function FrameworkSelector({
    selected,
    onSelect,
}: {
    selected?: 'kotter' | 'adkar' | 'lewin';
    onSelect?: (id: 'kotter' | 'adkar' | 'lewin') => void;
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['kotter', 'adkar', 'lewin'] as const).map((id) => (
                <FrameworkCard key={id} id={id} selected={selected === id} onSelect={onSelect} />
            ))}
        </div>
    );
}
