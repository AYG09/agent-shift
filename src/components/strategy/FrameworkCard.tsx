'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

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
        <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full touch-manipulation"
        >
            <Card
                className={`cursor-pointer h-full transition-all duration-300 backdrop-blur-xl relative overflow-hidden group
        ${
            selected
                ? `bg-gradient-to-br ${fw.color} border-2 ${fw.borderColor} shadow-2xl ring-2 ring-offset-2 ring-offset-white`
                : 'bg-white/90 border-2 border-gray-200/80 hover:border-blue-400/60 hover:shadow-xl hover:shadow-blue-500/10'
        }
      `}
                onClick={() => onSelect?.(id)}
            >
                {/* Glow Effect on Hover */}
                {!selected && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                        <div className={`absolute inset-0 bg-gradient-to-br ${fw.color} opacity-5`} />
                    </div>
                )}

                {/* 체크마크 아이콘 */}
                {selected && (
                    <motion.div 
                        className="absolute top-3 right-3 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-lg"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </motion.div>
                )}
                {/* 심층 분석 뱃지 */}
                {'badge' in fw && fw.badge && (
                    <motion.div 
                        className={`absolute top-3 ${selected ? 'right-12' : 'right-3'} px-2.5 py-1 rounded-full text-[10px] font-semibold ${selected ? 'bg-white/30 text-white' : 'bg-purple-100 text-purple-700 border border-purple-200'}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        ✨ {fw.badge}
                    </motion.div>
                )}
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-3 text-lg">
                        <motion.span 
                            className="text-3xl"
                            whileHover={{ scale: 1.2, rotate: 10 }}
                            transition={{ type: 'spring', stiffness: 400 }}
                        >
                            {fw.icon}
                        </motion.span>
                        <span className={`font-bold ${selected ? 'text-white' : 'text-gray-800'}`}>{fw.name}</span>
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
                    <div className="pt-3 border-t border-white/20">
                        <p className={`text-xs mb-2 font-medium ${selected ? 'text-white/80' : 'text-gray-600'}`}>
                            + Schein의 8가지 학습불안 감소 방법
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {(fw as typeof frameworks.lewin).scheinApproaches.map((approach, idx) => (
                                <motion.span
                                    key={idx}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`text-[10px] px-2 py-1 rounded-full transition-colors font-medium
                                        ${selected ? 'bg-white/15 text-white/90' : 'bg-purple-50 text-purple-600 border border-purple-100'}
                                    `}
                                >
                                    {idx + 1}. {approach}
                                </motion.span>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
        </motion.div>
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
        <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-5"
            initial="hidden"
            animate="visible"
            variants={{
                hidden: { opacity: 0 },
                visible: {
                    opacity: 1,
                    transition: {
                        staggerChildren: 0.1,
                    },
                },
            }}
        >
            {(['kotter', 'adkar', 'lewin'] as const).map((id, idx) => (
                <motion.div
                    key={id}
                    variants={{
                        hidden: { opacity: 0, y: 30 },
                        visible: { opacity: 1, y: 0 },
                    }}
                >
                    <FrameworkCard id={id} selected={selected === id} onSelect={onSelect} />
                </motion.div>
            ))}
        </motion.div>
    );
}
