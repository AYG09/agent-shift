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
        name: "Lewin's 3-Step",
        icon: '❄️',
        description: '해빙-변화-재동결의 단순하고 직관적인 모델',
        steps: ['해빙 (Unfreeze)', '변화 (Change)', '재동결 (Refreeze)'],
        color: 'from-purple-500 to-pink-500',
        borderColor: 'border-purple-500/30',
    },
};

export default function FrameworkCard({ id, selected, onSelect }: FrameworkCardProps) {
    const fw = frameworks[id];

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
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="text-2xl">{fw.icon}</span>
                    <span className={selected ? 'text-white' : 'text-[#18181B]'}>{fw.name}</span>
                </CardTitle>
                <CardDescription className={selected ? 'text-white/90' : 'text-[#71717A]'}>
                    {fw.description}
                </CardDescription>
            </CardHeader>

            <CardContent>
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
