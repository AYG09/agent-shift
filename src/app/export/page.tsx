'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { generateWordReport, generateExcelWBS } from '@/lib/export-service';
import { useAppStore } from '@/lib/store';
import Link from 'next/link';

export default function ExportPage() {
    const { context, asIsNodes, toBeNodes, strategy } = useAppStore();
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [exportStatus, setExportStatus] = useState<string | null>(null);

    // 스토어에서 데이터 가져오기 또는 샘플 데이터 사용
    const exportContext = context
        ? { industry: context.industry, role: context.role, task: context.task }
        : { industry: '제조업', role: '영업 관리자', task: '주간 영업 보고서 작성' };

    const exportAsIsNodes =
        asIsNodes.length > 0
            ? asIsNodes.map((n) => ({
                  id: n.id,
                  label: n.label,
                  description: n.description,
                  type: n.type,
                  metrics: n.metrics,
              }))
            : [
                  {
                      id: '1',
                      label: '데이터 수집',
                      description: '각 팀에서 수동으로 요청',
                      type: 'task' as const,
                      metrics: { timeMinutes: 60 },
                  },
                  {
                      id: '2',
                      label: '엑셀 취합',
                      description: '병목 구간 - 3시간 소요',
                      type: 'task' as const,
                      metrics: { timeMinutes: 180 },
                  },
              ];

    const exportToBeNodes =
        toBeNodes.length > 0
            ? toBeNodes.map((n) => ({
                  id: n.id,
                  label: n.label,
                  description: n.description,
                  type: n.type,
                  metrics: n.metrics,
              }))
            : [
                  { id: 't1', label: '데이터 수집 Agent', description: 'AI가 자동으로 데이터 수집', type: 'agent' as const, metrics: { timeMinutes: 5 } },
                  { id: 't2', label: '데이터 분석 Agent', description: 'AI가 자동으로 분석 수행', type: 'agent' as const, metrics: { timeMinutes: 10 } },
              ];

    const sampleStrategy = {
        framework: "Kotter's 8 Steps",
        phases: [
            {
                name: '긴급성 조성',
                duration: '2주',
                startWeek: 1,
                endWeek: 2,
                actions: ['위기 인식 공유', '변화 필요성 전파'],
            },
            {
                name: '추진팀 구성',
                duration: '1주',
                startWeek: 3,
                endWeek: 3,
                actions: ['변화 리더 선정', '크로스펑셔널 팀 구성'],
            },
            { name: '비전 수립', duration: '2주', startWeek: 4, endWeek: 5, actions: ['목표 상태 정의', '전략 로드맵 작성'] },
        ],
    };

    // Store strategy가 있으면 사용, 없으면 sampleStrategy fallback
    const exportStrategy = strategy
        ? {
              framework: strategy.framework === 'kotter' ? "Kotter's 8 Steps" 
                       : strategy.framework === 'adkar' ? "ADKAR Model" 
                       : "Lewin's Change Model",
              phases: strategy.phases.map((p) => ({
                  name: p.name,
                  duration: p.duration,
                  startWeek: p.startWeek,
                  endWeek: p.endWeek,
                  actions: p.actions,
              })),
          }
        : sampleStrategy;

    const handleExportWord = async () => {
        setIsExportingWord(true);
        setExportStatus(null);
        try {
            await generateWordReport({
                context: exportContext,
                asIsNodes: exportAsIsNodes,
                toBeNodes: exportToBeNodes,
                strategy: exportStrategy,
            });
            setExportStatus('✅ Word 보고서가 다운로드되었습니다!');
        } catch (error) {
            setExportStatus('❌ Word 내보내기 실패');
            console.error(error);
        } finally {
            setIsExportingWord(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExportingExcel(true);
        setExportStatus(null);
        try {
            generateExcelWBS({
                asIsNodes: exportAsIsNodes,
                toBeNodes: exportToBeNodes,
                strategy: exportStrategy,
                totalWeeks: strategy?.totalWeeks || 12,
            });
            setExportStatus('✅ Excel 보고서가 다운로드되었습니다!');
        } catch (error) {
            setExportStatus('❌ Excel 내보내기 실패');
            console.error(error);
        } finally {
            setIsExportingExcel(false);
        }
    };

    const hasData = context || asIsNodes.length > 0 || toBeNodes.length > 0;

    return (
        <div className="min-h-screen pro-canvas text-[#18181B] p-8 pb-24">
            <div className="max-w-3xl mx-auto">
                <Link
                    href="/flow"
                    className="text-[#71717A] hover:text-[#18181B] mb-8 inline-block text-sm"
                >
                    ← Flow 캔버스로
                </Link>

                <h1 className="text-2xl font-semibold text-[#18181B] mb-8">결과 내보내기</h1>

                {/* Data Status */}
                <Card
                    className={`mb-6 shadow-sm ${hasData ? 'bg-[#DCFCE7] border-[#86EFAC]' : 'bg-[#FEF3C7] border-[#FCD34D]'}`}
                >
                    <CardContent className="py-4">
                        {hasData ? (
                            <div className="text-[#166534] text-sm">
                                ✓ 내보낼 데이터가 준비되었습니다
                                <ul className="mt-2 text-[#166534]/70">
                                    <li>• 업무: {context?.task || '샘플 데이터'}</li>
                                    <li>
                                        • As-Is 노드:{' '}
                                        {asIsNodes.length > 0
                                            ? `${asIsNodes.length}개`
                                            : '샘플 데이터'}
                                    </li>
                                    <li>
                                        • To-Be 노드:{' '}
                                        {toBeNodes.length > 0
                                            ? `${toBeNodes.length}개`
                                            : '샘플 데이터'}
                                    </li>
                                </ul>
                            </div>
                        ) : (
                            <p className="text-[#92400E] text-sm">
                                ⚠️ AI 플로우가 생성되지 않아 샘플 데이터로 내보냅니다.{' '}
                                <Link href="/flow" className="underline">
                                    Flow 캔버스
                                </Link>
                                에서 먼저 플로우를 생성해주세요.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Export Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {/* Word Report */}
                    <Card className="group bg-white border-[#E2E4E9] hover:border-[#3B82F6] hover:-translate-y-1 hover:shadow-lg transition-all duration-200 shadow-sm">
                        <CardHeader>
                            <div className="w-10 h-10 bg-[#DBEAFE] rounded-lg flex items-center justify-center text-xl mb-3">
                                📄
                            </div>
                            <CardTitle className="text-base font-medium text-[#18181B]">
                                Word 보고서
                            </CardTitle>
                            <CardDescription className="text-[#71717A] text-sm">
                                변화 관리 분석 결과를 Word 문서로 내보냅니다
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-sm text-[#71717A] mb-4 space-y-1">
                                <li>• 업무 맥락 요약</li>
                                <li>• As-Is / To-Be 비교</li>
                                <li>• 예상 효과 및 ROI</li>
                                <li>• 실행 로드맵</li>
                            </ul>
                            <Button
                                onClick={handleExportWord}
                                disabled={isExportingWord}
                                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                            >
                                {isExportingWord ? (
                                    <span className="flex items-center gap-2">
                                        <Spinner size="sm" className="text-white" />
                                        생성 중...
                                    </span>
                                ) : (
                                    'Word 다운로드'
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Excel Report */}
                    <Card className="group bg-white border-[#E2E4E9] hover:border-[#10B981] hover:-translate-y-1 hover:shadow-lg transition-all duration-200 shadow-sm">
                        <CardHeader>
                            <div className="w-10 h-10 bg-[#D1FAE5] rounded-lg flex items-center justify-center text-xl mb-3">
                                📊
                            </div>
                            <CardTitle className="text-base font-medium text-[#18181B]">
                                Excel 보고서
                            </CardTitle>
                            <CardDescription className="text-[#71717A] text-sm">
                                전체 분석 결과를 Excel로 내보냅니다
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-sm text-[#71717A] mb-4 space-y-1">
                                <li>• AS-IS / TO-BE 플로우</li>
                                <li>• 간트 차트 형태 WBS</li>
                                <li>• ROI 분석 요약</li>
                                <li>• 주차별 일정 시각화</li>
                            </ul>
                            <Button
                                onClick={handleExportExcel}
                                disabled={isExportingExcel}
                                className="w-full bg-[#10B981] hover:bg-[#059669] text-white"
                            >
                                {isExportingExcel ? (
                                    <span className="flex items-center gap-2">
                                        <Spinner size="sm" className="text-white" />
                                        생성 중...
                                    </span>
                                ) : (
                                    'Excel 다운로드'
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Export Status */}
                {exportStatus && (
                    <Card
                        className={`${exportStatus.includes('✅') ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'} shadow-sm`}
                    >
                        <CardContent className="py-4 text-center">
                            <span className="text-lg text-[#18181B]">{exportStatus}</span>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
