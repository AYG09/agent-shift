'use client';

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as XLSX from 'xlsx';

// Word 보고서용 노드 타입 (position 불필요)
interface ReportNode {
    id: string;
    type: 'task' | 'decision' | 'subprocess' | 'agent';
    label: string;
    description?: string;
}

// Word 보고서 생성
export async function generateWordReport(data: {
    context: { industry: string; role: string; task: string };
    asIsNodes: ReportNode[];
    toBeNodes: ReportNode[];
    strategy?: {
        framework: string;
        phases: Array<{ name: string; duration: string; actions: string[] }>;
    };
}) {
    const doc = new Document({
        sections: [
            {
                children: [
                    // Title
                    new Paragraph({
                        text: 'Agent Shift 변화 관리 보고서',
                        heading: HeadingLevel.TITLE,
                    }),

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

                    // As-Is
                    new Paragraph({
                        text: '2. As-Is 현황',
                        heading: HeadingLevel.HEADING_1,
                    }),
                    ...data.asIsNodes.map(
                        (node) =>
                            new Paragraph({
                                text: `• ${node.label}${node.description ? ': ' + node.description : ''}`,
                            })
                    ),

                    // To-Be
                    new Paragraph({
                        text: '3. To-Be 설계',
                        heading: HeadingLevel.HEADING_1,
                    }),
                    ...data.toBeNodes.map(
                        (node) =>
                            new Paragraph({
                                text: `• ${node.label} (${node.type === 'agent' ? 'AI Agent' : '일반 업무'})`,
                            })
                    ),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, 'agent-shift-report.docx');
}

// Excel WBS 생성
export function generateExcelWBS(data: {
    strategy: {
        phases: Array<{
            name: string;
            duration: string;
            actions: string[];
            stakeholders?: string[];
        }>;
    };
}) {
    const workbook = XLSX.utils.book_new();

    // Create WBS data
    const wbsData = [
        ['단계', '기간', '활동', '담당자'],
        ...data.strategy.phases.flatMap((phase) =>
            phase.actions.map((action, idx) => [
                idx === 0 ? phase.name : '',
                idx === 0 ? phase.duration : '',
                action,
                phase.stakeholders?.[0] || '',
            ])
        ),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(wbsData);

    // Set column widths
    worksheet['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 40 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'WBS');

    // Generate and download
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, 'agent-shift-wbs.xlsx');
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
