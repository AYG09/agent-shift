import Link from 'next/link';
import Image from 'next/image';
import { Cpu, GitMerge, Layers } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen pro-canvas relative">
      {/* Pro Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Image
          src="/images/bg-main.png"
          alt="Pro Background"
          fill
          className="object-cover opacity-80"
          priority
        />
        <div className="absolute inset-0 bg-white/30" />
        <div className="absolute inset-0 bg-[radial-gradient(#000000_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03]" />
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-24 relative z-10">

        {/* Hero */}
        <div className="text-center mb-20">
          <div className="inline-block mb-4 px-4 py-2 bg-[#F5F6F8] rounded-full border border-[#E2E4E9]">
            <span className="text-[#71717A] text-sm font-medium">Professional Process Design Tool</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold text-[#18181B] mb-6 leading-tight">
            Agent Shift
          </h1>

          <p className="text-lg text-[#71717A] mb-8 max-w-xl mx-auto leading-relaxed whitespace-pre-line">
            업무 프로세스를 AI Agent로 전환하고, 변화 관리 전략을 수립하세요.
          </p>

          <div className="flex justify-center gap-3">
            <Link
              href="/flow"
              className="px-6 py-3 bg-[#3B82F6] text-white rounded-xl text-base font-medium hover:bg-[#2563EB] transition-colors shadow-sm"
            >
              시작하기
            </Link>
            <Link
              href="/strategy"
              className="px-6 py-3 bg-white border border-[#E2E4E9] text-[#18181B] rounded-xl text-base font-medium hover:bg-[#F5F6F8] transition-colors"
            >
              전략 보기
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-20">
          {[
            {
              icon: <GitMerge className="w-6 h-6 text-[#6366F1]" />,
              title: 'As-Is 분석',
              desc: '현재 업무 프로세스를 시각화하고 병목 지점을 AI가 자동 탐지',
              color: '#6366F1',
            },
            {
              icon: <Cpu className="w-6 h-6 text-[#3B82F6]" />,
              title: 'To-Be 설계',
              desc: 'AI Agent를 활용한 최적의 업무 자동화 시나리오 제안',
              color: '#3B82F6',
            },
            {
              icon: <Layers className="w-6 h-6 text-[#10B981]" />,
              title: '변화 전략',
              desc: 'Kotter, ADKAR 등 검증된 프레임워크 기반 실행 로드맵',
              color: '#10B981',
            },
          ].map((feature, idx) => (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-white/30 backdrop-blur-xl border border-white/50 hover:border-[#3B82F6]/50 hover:bg-white/50 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-1"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 backdrop-blur-md bg-white/50 border border-white/50"
              >
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold text-[#18181B] mb-2">{feature.title}</h3>
              <p className="text-sm text-[#71717A] leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Process Steps */}
        <div className="text-center mb-12">
          <h2 className="text-xl font-medium text-[#18181B] mb-8">
            4단계 변화 관리 프로세스
          </h2>

          <div className="flex flex-wrap justify-center items-center gap-3">
            {['맥락 입력', 'As-Is 분석', 'To-Be 설계', '전략 수립', '보고서 출력'].map((step, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="px-4 py-2.5 bg-white/30 backdrop-blur-xl border border-white/50 rounded-xl text-sm text-[#18181B] font-medium whitespace-nowrap shadow-md hover:bg-white/50 hover:shadow-lg transition-all">
                  {idx + 1}. {step}
                </div>
                {idx < 4 && <span className="text-[#A1A1AA]">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-[#A1A1AA]">
          © 2025 Agent Shift. Built with Next.js, React Flow & AI.
        </div>
      </div>
    </div>
  );
}
