'use client';

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import * as XLSX from 'xlsx';

// 액션 아이템 타입
interface ActionItem {
    action: string;
    rationale: string;
    value: string;
}

// Word 보고서용 노드 타입 (position 불필요)
interface ReportNode {
    id: string;
    type: 'task' | 'decision' | 'subprocess' | 'agent';
    label: string;
    description?: string;
    metrics?: { timeMinutes?: number };
}

// 전략 Phase 타입
interface StrategyPhase {
    name: string;
    duration: string;
    startWeek?: number;
    endWeek?: number;
    actions: (string | ActionItem)[];
}

// 헬퍼: 액션 텍스트 추출
function getActionText(action: string | ActionItem): string {
    return typeof action === 'string' ? action : action.action;
}

// 테이블 셀 스타일 헬퍼
function createHeaderCell(text: string): TableCell {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text, bold: true, color: 'FFFFFF' })],
            alignment: AlignmentType.CENTER,
        })],
        shading: { fill: '3B82F6' },
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
    });
}

function createCell(text: string, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT): TableCell {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun(text)],
            alignment,
        })],
        margins: { top: 50, bottom: 50, left: 100, right: 100 },
    });
}

// Word 보고서 생성
export async function generateWordReport(data: {
    context: { industry: string; role: string; task: string };
    asIsNodes: ReportNode[];
    toBeNodes: ReportNode[];
    strategy?: {
        framework: string;
        phases: StrategyPhase[];
    };
}) {
    // AS-IS 플로우 테이블
    const asIsTableRows = [
        new TableRow({
            children: [
                createHeaderCell('순번'),
                createHeaderCell('업무'),
                createHeaderCell('설명'),
                createHeaderCell('소요시간(분)'),
            ],
        }),
        ...data.asIsNodes.map((node, idx) =>
            new TableRow({
                children: [
                    createCell(String(idx + 1), AlignmentType.CENTER),
                    createCell(node.label),
                    createCell(node.description || '-'),
                    createCell(node.metrics?.timeMinutes ? String(node.metrics.timeMinutes) : '-', AlignmentType.CENTER),
                ],
            })
        ),
    ];

    // TO-BE 플로우 테이블
    const toBeTableRows = [
        new TableRow({
            children: [
                createHeaderCell('순번'),
                createHeaderCell('업무'),
                createHeaderCell('유형'),
                createHeaderCell('설명'),
                createHeaderCell('소요시간(분)'),
            ],
        }),
        ...data.toBeNodes.map((node, idx) =>
            new TableRow({
                children: [
                    createCell(String(idx + 1), AlignmentType.CENTER),
                    createCell(node.label),
                    createCell(node.type === 'agent' ? '🤖 AI Agent' : '📋 일반업무', AlignmentType.CENTER),
                    createCell(node.description || '-'),
                    createCell(node.metrics?.timeMinutes ? String(node.metrics.timeMinutes) : '-', AlignmentType.CENTER),
                ],
            })
        ),
    ];

    // 전략 타임라인 테이블
    const strategyTableRows = data.strategy ? [
        new TableRow({
            children: [
                createHeaderCell('단계'),
                createHeaderCell('기간'),
                createHeaderCell('시작'),
                createHeaderCell('종료'),
                createHeaderCell('액션 아이템'),
            ],
        }),
        ...data.strategy.phases.map((phase) =>
            new TableRow({
                children: [
                    createCell(phase.name),
                    createCell(phase.duration, AlignmentType.CENTER),
                    createCell(phase.startWeek ? `${phase.startWeek}주차` : '-', AlignmentType.CENTER),
                    createCell(phase.endWeek ? `${phase.endWeek}주차` : '-', AlignmentType.CENTER),
                    createCell(phase.actions.map(getActionText).join(', ')),
                ],
            })
        ),
    ] : [];

    // 총 소요시간 계산
    const asIsTotalTime = data.asIsNodes.reduce((sum, n) => sum + (n.metrics?.timeMinutes || 0), 0);
    const toBeTotalTime = data.toBeNodes.reduce((sum, n) => sum + (n.metrics?.timeMinutes || 0), 0);
    const timeSaved = asIsTotalTime - toBeTotalTime;

    const doc = new Document({
        sections: [
            {
                children: [
                    // Title
                    new Paragraph({
                        text: 'Agent Shift 변화 관리 보고서',
                        heading: HeadingLevel.TITLE,
                    }),
                    new Paragraph({ text: '' }),

                    // Context
                    new Paragraph({
                        text: '1. 업무 맥락',
                        heading: HeadingLevel.HEADING_1,
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: '산업: ', bold: true }),
                            new TextRun(data.context.industry),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: '직무: ', bold: true }),
                            new TextRun(data.context.role),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: '업무: ', bold: true }),
                            new TextRun(data.context.task),
                        ],
                    }),
                    new Paragraph({ text: '' }),

                    // As-Is Section
                    new Paragraph({
                        text: '2. As-Is 현황 (현재 프로세스)',
                        heading: HeadingLevel.HEADING_1,
                    }),
                    new Table({
                        rows: asIsTableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `총 소요시간: ${asIsTotalTime}분`, bold: true }),
                        ],
                    }),
                    new Paragraph({ text: '' }),

                    // To-Be Section
                    new Paragraph({
                        text: '3. To-Be 설계 (AI 자동화 프로세스)',
                        heading: HeadingLevel.HEADING_1,
                    }),
                    new Table({
                        rows: toBeTableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `총 소요시간: ${toBeTotalTime}분`, bold: true }),
                            timeSaved > 0 ? new TextRun({ text: ` (${timeSaved}분 절감, ${Math.round((timeSaved / asIsTotalTime) * 100)}% 효율화)`, color: '10B981' }) : new TextRun(''),
                        ],
                    }),
                    new Paragraph({ text: '' }),

                    // Strategy Section
                    ...(data.strategy ? [
                        new Paragraph({
                            text: `4. 변화 관리 전략 (${data.strategy.framework})`,
                            heading: HeadingLevel.HEADING_1,
                        }),
                        new Table({
                            rows: strategyTableRows,
                            width: { size: 100, type: WidthType.PERCENTAGE },
                        }),
                    ] : []),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, 'agent-shift-report.docx');
}

// Excel WBS 생성 (4개 시트: AS-IS Flow, TO-BE Flow, Strategy WBS, ROI Summary)
export function generateExcelWBS(data: {
    asIsNodes?: ReportNode[];
    toBeNodes?: ReportNode[];
    strategy: {
        phases: Array<{
            name: string;
            duration: string;
            startWeek?: number;
            endWeek?: number;
            actions: (string | ActionItem)[];
            stakeholders?: string[];
        }>;
    };
    totalWeeks?: number;
}) {
    const workbook = XLSX.utils.book_new();
    const totalWeeks = data.totalWeeks || 12;

    // 시트 1: AS-IS Flow
    if (data.asIsNodes && data.asIsNodes.length > 0) {
        const asIsData = [
            ['순번', '업무', '설명', '소요시간(분)'],
            ...data.asIsNodes.map((node, idx) => [
                idx + 1,
                node.label,
                node.description || '-',
                node.metrics?.timeMinutes || '-',
            ]),
        ];
        const asIsSheet = XLSX.utils.aoa_to_sheet(asIsData);
        asIsSheet['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 40 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(workbook, asIsSheet, 'AS-IS Flow');
    }

    // 시트 2: TO-BE Flow
    if (data.toBeNodes && data.toBeNodes.length > 0) {
        const toBeData = [
            ['순번', '업무', '유형', '설명', '소요시간(분)'],
            ...data.toBeNodes.map((node, idx) => [
                idx + 1,
                node.label,
                node.type === 'agent' ? '🤖 AI Agent' : '📋 일반업무',
                node.description || '-',
                node.metrics?.timeMinutes || '-',
            ]),
        ];
        const toBeSheet = XLSX.utils.aoa_to_sheet(toBeData);
        toBeSheet['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 12 }, { wch: 35 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(workbook, toBeSheet, 'TO-BE Flow');
    }

    // 시트 3: Strategy WBS with Gantt Chart
    // 헤더: 단계, 기간, 시작, 종료, 액션, Week1, Week2, ...
    const weekHeaders = Array.from({ length: totalWeeks }, (_, i) => `W${i + 1}`);
    const wbsHeader = ['단계', '기간', '시작', '종료', '액션 아이템', ...weekHeaders];
    
    const wbsRows = data.strategy.phases.flatMap((phase) => {
        const startWeek = phase.startWeek || 1;
        const endWeek = phase.endWeek || startWeek;
        
        return phase.actions.map((action, idx) => {
            const weekCells = Array.from({ length: totalWeeks }, (_, weekIdx) => {
                const week = weekIdx + 1;
                // 해당 주차가 phase 범위 내면 ● 표시 (간트 차트 시각화)
                return week >= startWeek && week <= endWeek ? '●' : '';
            });
            
            return [
                idx === 0 ? phase.name : '',
                idx === 0 ? phase.duration : '',
                idx === 0 ? `${startWeek}주차` : '',
                idx === 0 ? `${endWeek}주차` : '',
                getActionText(action),
                ...weekCells,
            ];
        });
    });

    const wbsData = [wbsHeader, ...wbsRows];
    const wbsSheet = XLSX.utils.aoa_to_sheet(wbsData);
    
    // 컬럼 너비 설정
    wbsSheet['!cols'] = [
        { wch: 18 }, // 단계
        { wch: 8 },  // 기간
        { wch: 8 },  // 시작
        { wch: 8 },  // 종료
        { wch: 30 }, // 액션
        ...weekHeaders.map(() => ({ wch: 4 })), // 주차별
    ];
    
    XLSX.utils.book_append_sheet(workbook, wbsSheet, 'Strategy WBS');

    // 시트 4: ROI Summary
    const asIsTotalTime = data.asIsNodes?.reduce((sum, n) => sum + (n.metrics?.timeMinutes || 0), 0) || 0;
    const toBeTotalTime = data.toBeNodes?.reduce((sum, n) => sum + (n.metrics?.timeMinutes || 0), 0) || 0;
    const timeSaved = asIsTotalTime - toBeTotalTime;
    const efficiencyRate = asIsTotalTime > 0 ? Math.round((timeSaved / asIsTotalTime) * 100) : 0;

    const roiData = [
        ['ROI 분석 요약', ''],
        ['', ''],
        ['항목', '값'],
        ['AS-IS 총 소요시간', `${asIsTotalTime}분`],
        ['TO-BE 총 소요시간', `${toBeTotalTime}분`],
        ['절감 시간', `${timeSaved}분`],
        ['효율화율', `${efficiencyRate}%`],
        ['', ''],
        ['분석 기준', ''],
        ['총 변화 관리 기간', `${totalWeeks}주`],
        ['전략 단계 수', `${data.strategy.phases.length}단계`],
    ];
    
    const roiSheet = XLSX.utils.aoa_to_sheet(roiData);
    roiSheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, roiSheet, 'ROI Summary');

    // Generate and download
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, 'agent-shift-report.xlsx');
}

// Helper function to download blob
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
