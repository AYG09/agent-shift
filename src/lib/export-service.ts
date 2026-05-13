'use client';

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType, VerticalAlign, convertInchesToTwip } from 'docx';
import ExcelJS from 'exceljs';
import type { DrilldownResponse } from './ai-schemas';

// ============================================================================
// 색상 상수 (프로페셔널 디자인 시스템)
// ============================================================================
const COLORS = {
    // Primary
    PRIMARY: '2563EB',        // Blue 600
    PRIMARY_LIGHT: 'DBEAFE',  // Blue 100
    PRIMARY_DARK: '1D4ED8',   // Blue 700
    
    // Success
    SUCCESS: '059669',        // Emerald 600
    SUCCESS_LIGHT: 'D1FAE5',  // Emerald 100
    
    // Warning
    WARNING: 'D97706',        // Amber 600
    WARNING_LIGHT: 'FEF3C7',  // Amber 100
    
    // Neutral
    HEADER_BG: '1F2937',      // Gray 800
    HEADER_TEXT: 'FFFFFF',
    ROW_ALT: 'F9FAFB',        // Gray 50
    BORDER: 'E5E7EB',         // Gray 200
    TEXT_DARK: '111827',      // Gray 900
    TEXT_MUTED: '6B7280',     // Gray 500
    
    // Agent 특화
    AGENT_BG: 'EFF6FF',       // Blue 50
    AGENT_BORDER: '3B82F6',   // Blue 500
};

// ============================================================================
// 시간 단위 타입 정의 (새로운 체계)
// ============================================================================
type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

interface NodeMetrics {
    timeMinutes?: number;      // 하위 호환
    duration?: number;
    durationUnit?: DurationUnit;
}

// ============================================================================
// 시간 포맷팅 헬퍼 함수 (새로운 duration 체계 지원)
// ============================================================================
function getUnitLabel(unit: DurationUnit): string {
    const labels: Record<DurationUnit, string> = {
        minutes: '분',
        hours: '시간',
        days: '일',
        weeks: '주',
        months: '개월',
    };
    return labels[unit] || unit;
}

function formatDuration(metrics?: NodeMetrics): string {
    if (!metrics) return '-';
    
    // 새로운 체계 우선
    if (metrics.duration !== undefined && metrics.durationUnit) {
        return `${metrics.duration}${getUnitLabel(metrics.durationUnit)}`;
    }
    
    // 하위 호환: timeMinutes
    if (metrics.timeMinutes !== undefined) {
        if (metrics.timeMinutes >= 60) {
            const hours = Math.floor(metrics.timeMinutes / 60);
            const mins = metrics.timeMinutes % 60;
            return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
        }
        return `${metrics.timeMinutes}분`;
    }
    
    return '-';
}

// 분 단위로 변환 (ROI 계산용)
function toMinutes(metrics?: NodeMetrics): number {
    if (!metrics) return 0;
    
    if (metrics.duration !== undefined && metrics.durationUnit) {
        const multipliers: Record<DurationUnit, number> = {
            minutes: 1,
            hours: 60,
            days: 480,      // 8시간 근무일 기준
            weeks: 2400,    // 5일 * 8시간 * 60분
            months: 9600,   // 4주 * 5일 * 8시간 * 60분
        };
        return metrics.duration * (multipliers[metrics.durationUnit] || 1);
    }
    
    return metrics.timeMinutes || 0;
}

// ============================================================================
// 액션 아이템 타입 (왜/어떻게 포함)
// ============================================================================
interface ActionItem {
    action: string;
    rationale: string;   // 왜 (필요 이유)
    value: string;       // 어떻게 (제공 가치)
}

// ============================================================================
// 리스크 요인 타입
// ============================================================================
interface RiskFactor {
    risk: string;
    mitigation: string;
}

// ============================================================================
// Schein 접근법 타입
// ============================================================================
interface ScheinApproach {
    id?: number;
    approach: string;
    description: string;
    actions?: string[];
}

// ============================================================================
// 확장된 전략 타입 (모든 변화관리 데이터 포함)
// ============================================================================
interface ExtendedStrategy {
    framework: string;
    phases: StrategyPhase[];
    keyMessages?: string[];
    riskFactors?: RiskFactor[];
    survivalAnxiety?: {
        description: string;
        triggers: string[];
    };
    learningAnxiety?: {
        description: string;
        barriers: string[];
    };
    scheinApproaches?: ScheinApproach[];
}

// ============================================================================
// Word 보고서용 노드 타입
// ============================================================================
interface ReportNode {
    id: string;
    type: 'terminal' | 'process' | 'decision' | 'io' | 'agent' | 'task' | 'subprocess';
    label: string;
    description?: string;
    metrics?: NodeMetrics;
}

// ============================================================================
// 엣지 타입
// ============================================================================
interface ReportEdge {
    id: string;
    source: string;
    target: string;
}

// ============================================================================
// 전략 Phase 타입
// ============================================================================
interface StrategyPhase {
    name: string;
    duration: string;
    startWeek?: number;
    endWeek?: number;
    actions: (string | ActionItem)[];
    color?: string;
}

// ============================================================================
// 위상 정렬: 엣지 기반으로 노드를 플로우 순서대로 정렬
// ============================================================================
function topologicalSort<T extends { id: string }>(nodes: T[], edges: ReportEdge[]): T[] {
    if (edges.length === 0) return nodes;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    nodes.forEach(n => {
        inDegree.set(n.id, 0);
        adjList.set(n.id, []);
    });

    edges.forEach(e => {
        if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
            adjList.get(e.source)?.push(e.target);
            inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        }
    });

    const queue: string[] = [];
    inDegree.forEach((deg, id) => {
        if (deg === 0) queue.push(id);
    });

    const result: T[] = [];
    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = nodeMap.get(nodeId);
        if (node) result.push(node);

        adjList.get(nodeId)?.forEach(neighbor => {
            inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
            if (inDegree.get(neighbor) === 0) {
                queue.push(neighbor);
            }
        });
    }

    const resultIds = new Set(result.map(n => n.id));
    nodes.forEach(n => {
        if (!resultIds.has(n.id)) result.push(n);
    });

    return result;
}

// ============================================================================
// 헬퍼: 액션 텍스트 추출
// ============================================================================
function getActionText(action: string | ActionItem): string {
    return typeof action === 'string' ? action : action.action;
}

function isActionItem(action: string | ActionItem): action is ActionItem {
    return typeof action !== 'string' && 'rationale' in action;
}

// ============================================================================
// Word 테이블 스타일 헬퍼 (개선된 디자인)
// ============================================================================
function createStyledHeaderCell(text: string, width?: number): TableCell {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ 
                text, 
                bold: true, 
                color: COLORS.HEADER_TEXT,
                size: 22, // 11pt
            })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 80 },
        })],
        shading: { type: ShadingType.SOLID, fill: COLORS.HEADER_BG, color: COLORS.HEADER_BG },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 120, bottom: 120, left: 120, right: 120 },
        width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    });
}

function createStyledCell(
    text: string, 
    options: {
        alignment?: typeof AlignmentType[keyof typeof AlignmentType];
        bold?: boolean;
        color?: string;
        bgColor?: string;
        size?: number;
    } = {}
): TableCell {
    const { alignment = AlignmentType.LEFT, bold = false, color, bgColor, size = 20 } = options;
    
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ 
                text, 
                bold,
                color: color || COLORS.TEXT_DARK,
                size,
            })],
            alignment,
            spacing: { before: 60, after: 60 },
        })],
        shading: bgColor ? { type: ShadingType.SOLID, fill: bgColor, color: bgColor } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
    });
}

// ============================================================================
// Word 보고서 생성 (대폭 개선된 버전)
// ============================================================================
export async function generateWordReport(data: {
    context: { industry: string; role: string; task: string };
    asIsNodes: ReportNode[];
    toBeNodes: ReportNode[];
    asIsEdges?: ReportEdge[];
    toBeEdges?: ReportEdge[];
    strategy?: ExtendedStrategy;
    drilldownResults?: Record<string, DrilldownResponse>;
}) {
    const sortedAsIsNodes = topologicalSort(data.asIsNodes, data.asIsEdges || []);
    const sortedToBeNodes = topologicalSort(data.toBeNodes, data.toBeEdges || []);

    // 시간 계산
    const asIsTotalMinutes = sortedAsIsNodes.reduce((sum, n) => sum + toMinutes(n.metrics), 0);
    const toBeTotalMinutes = sortedToBeNodes.reduce((sum, n) => sum + toMinutes(n.metrics), 0);
    const timeSavedMinutes = asIsTotalMinutes - toBeTotalMinutes;
    const efficiencyRate = asIsTotalMinutes > 0 ? Math.round((timeSavedMinutes / asIsTotalMinutes) * 100) : 0;

    // ========== AS-IS 테이블 ==========
    const asIsTableRows = [
        new TableRow({
            children: [
                createStyledHeaderCell('순번', 8),
                createStyledHeaderCell('업무명', 30),
                createStyledHeaderCell('설명', 42),
                createStyledHeaderCell('소요시간', 20),
            ],
            tableHeader: true,
        }),
        ...sortedAsIsNodes.map((node, idx) =>
            new TableRow({
                children: [
                    createStyledCell(String(idx + 1), { alignment: AlignmentType.CENTER, bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined }),
                    createStyledCell(node.label, { bold: true, bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined }),
                    createStyledCell(node.description || '-', { bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined }),
                    createStyledCell(formatDuration(node.metrics), { alignment: AlignmentType.CENTER, bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined }),
                ],
            })
        ),
    ];

    // ========== TO-BE 테이블 ==========
    const toBeTableRows = [
        new TableRow({
            children: [
                createStyledHeaderCell('순번', 7),
                createStyledHeaderCell('업무명', 25),
                createStyledHeaderCell('유형', 13),
                createStyledHeaderCell('설명', 40),
                createStyledHeaderCell('소요시간', 15),
            ],
            tableHeader: true,
        }),
        ...sortedToBeNodes.map((node, idx) => {
            const isAgent = node.type === 'agent';
            const rowBg = isAgent ? COLORS.AGENT_BG : (idx % 2 === 1 ? COLORS.ROW_ALT : undefined);
            
            return new TableRow({
                children: [
                    createStyledCell(String(idx + 1), { alignment: AlignmentType.CENTER, bgColor: rowBg }),
                    createStyledCell(node.label, { bold: true, bgColor: rowBg }),
                    createStyledCell(isAgent ? '🤖 AI Agent' : '📋 일반업무', { 
                        alignment: AlignmentType.CENTER, 
                        color: isAgent ? COLORS.PRIMARY : COLORS.TEXT_MUTED,
                        bold: isAgent,
                        bgColor: rowBg,
                    }),
                    createStyledCell(node.description || '-', { bgColor: rowBg }),
                    createStyledCell(formatDuration(node.metrics), { alignment: AlignmentType.CENTER, bgColor: rowBg }),
                ],
            });
        }),
    ];

    // ========== 전략 테이블 (왜/어떻게 포함) ==========
    const strategyDetailRows: TableRow[] = [];
    if (data.strategy) {
        strategyDetailRows.push(
            new TableRow({
                children: [
                    createStyledHeaderCell('단계', 15),
                    createStyledHeaderCell('액션', 25),
                    createStyledHeaderCell('왜 (필요 이유)', 30),
                    createStyledHeaderCell('가치 (제공 효과)', 30),
                ],
                tableHeader: true,
            })
        );

        data.strategy.phases.forEach((phase, phaseIdx) => {
            phase.actions.forEach((action, actionIdx) => {
                const isFirstAction = actionIdx === 0;
                const rowBg = phaseIdx % 2 === 1 ? COLORS.ROW_ALT : undefined;
                
                strategyDetailRows.push(
                    new TableRow({
                        children: [
                            createStyledCell(isFirstAction ? `${phase.name}\n(${phase.duration})` : '', { 
                                bold: isFirstAction, 
                                bgColor: rowBg 
                            }),
                            createStyledCell(getActionText(action), { bgColor: rowBg }),
                            createStyledCell(isActionItem(action) ? action.rationale : '-', { 
                                color: COLORS.TEXT_MUTED,
                                bgColor: rowBg,
                            }),
                            createStyledCell(isActionItem(action) ? action.value : '-', { 
                                color: COLORS.SUCCESS,
                                bgColor: rowBg,
                            }),
                        ],
                    })
                );
            });
        });
    }

    // ========== 리스크 관리 테이블 ==========
    const riskTableRows: TableRow[] = [];
    if (data.strategy?.riskFactors && data.strategy.riskFactors.length > 0) {
        riskTableRows.push(
            new TableRow({
                children: [
                    createStyledHeaderCell('리스크 요인', 45),
                    createStyledHeaderCell('완화 방안', 55),
                ],
                tableHeader: true,
            })
        );
        
        data.strategy.riskFactors.forEach((rf, idx) => {
            riskTableRows.push(
                new TableRow({
                    children: [
                        createStyledCell(rf.risk, { 
                            color: COLORS.WARNING,
                            bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined,
                        }),
                        createStyledCell(rf.mitigation, { 
                            bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined,
                        }),
                    ],
                })
            );
        });
    }

    // ========== Schein 접근법 테이블 ==========
    const scheinTableRows: TableRow[] = [];
    if (data.strategy?.scheinApproaches && data.strategy.scheinApproaches.length > 0) {
        scheinTableRows.push(
            new TableRow({
                children: [
                    createStyledHeaderCell('접근법', 25),
                    createStyledHeaderCell('설명', 40),
                    createStyledHeaderCell('실행 항목', 35),
                ],
                tableHeader: true,
            })
        );
        
        data.strategy.scheinApproaches.forEach((approach, idx) => {
            const actionsText = approach.actions?.join(', ') || '-';
            scheinTableRows.push(
                new TableRow({
                    children: [
                        createStyledCell(approach.approach, { 
                            bold: true,
                            bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined,
                        }),
                        createStyledCell(approach.description, { 
                            bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined,
                        }),
                        createStyledCell(actionsText, { 
                            color: COLORS.TEXT_MUTED,
                            bgColor: idx % 2 === 1 ? COLORS.ROW_ALT : undefined,
                        }),
                    ],
                })
            );
        });
    }

    // ========== 문서 구조 ==========
    const docChildren: (Paragraph | Table)[] = [
        // 타이틀
        new Paragraph({
            text: 'Agent Shift',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
        }),
        new Paragraph({
            children: [new TextRun({ text: 'AI 업무 전환 및 변화 관리 보고서', color: COLORS.TEXT_MUTED, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
        }),
        new Paragraph({
            children: [new TextRun({ text: `생성일: ${new Date().toLocaleDateString('ko-KR')}`, color: COLORS.TEXT_MUTED, size: 20 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
        }),
        
        // 1. 업무 맥락
        new Paragraph({ text: '1. 업무 맥락', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
        new Paragraph({
            children: [
                new TextRun({ text: '산업 분야: ', bold: true, size: 22 }),
                new TextRun({ text: data.context.industry, size: 22 }),
            ],
            spacing: { after: 100 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: '직무/역할: ', bold: true, size: 22 }),
                new TextRun({ text: data.context.role, size: 22 }),
            ],
            spacing: { after: 100 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: '분석 대상 업무: ', bold: true, size: 22 }),
                new TextRun({ text: data.context.task, size: 22 }),
            ],
            spacing: { after: 300 },
        }),
        
        // 2. AS-IS 현황
        new Paragraph({ text: '2. As-Is 현황 (현재 프로세스)', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
        new Table({ rows: asIsTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({
            children: [
                new TextRun({ text: '총 소요시간: ', bold: true, size: 22 }),
                new TextRun({ text: formatDuration({ timeMinutes: asIsTotalMinutes }), size: 22, bold: true, color: COLORS.PRIMARY }),
            ],
            spacing: { before: 200, after: 300 },
        }),
        
        // 3. TO-BE 설계
        new Paragraph({ text: '3. To-Be 설계 (AI 자동화 프로세스)', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
        new Table({ rows: toBeTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({
            children: [
                new TextRun({ text: '총 소요시간: ', bold: true, size: 22 }),
                new TextRun({ text: formatDuration({ timeMinutes: toBeTotalMinutes }), size: 22, bold: true, color: COLORS.PRIMARY }),
                ...(timeSavedMinutes > 0 ? [
                    new TextRun({ text: '  |  ', color: COLORS.TEXT_MUTED, size: 22 }),
                    new TextRun({ text: `${formatDuration({ timeMinutes: timeSavedMinutes })} 절감`, bold: true, color: COLORS.SUCCESS, size: 22 }),
                    new TextRun({ text: ` (${efficiencyRate}% 효율화)`, color: COLORS.SUCCESS, size: 22 }),
                ] : []),
            ],
            spacing: { before: 200, after: 300 },
        }),
    ];

    // 4. 변화 관리 전략
    if (data.strategy) {
        docChildren.push(
            new Paragraph({ 
                text: `4. 변화 관리 전략 (${data.strategy.framework})`, 
                heading: HeadingLevel.HEADING_1, 
                spacing: { before: 400, after: 200 } 
            })
        );

        // 4.1 단계별 계획 (왜/어떻게 포함)
        if (strategyDetailRows.length > 1) {
            docChildren.push(
                new Paragraph({ text: '4.1 단계별 실행 계획', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
                new Table({ rows: strategyDetailRows, width: { size: 100, type: WidthType.PERCENTAGE } })
            );
        }

        // 4.2 핵심 메시지
        if (data.strategy.keyMessages && data.strategy.keyMessages.length > 0) {
            docChildren.push(
                new Paragraph({ text: '4.2 핵심 메시지', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } })
            );
            data.strategy.keyMessages.forEach((msg, idx) => {
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: `${idx + 1}. ${msg}`, size: 22 })],
                    spacing: { after: 80 },
                    indent: { left: convertInchesToTwip(0.25) },
                }));
            });
        }

        // 4.3 리스크 관리
        if (riskTableRows.length > 1) {
            docChildren.push(
                new Paragraph({ text: '4.3 리스크 관리', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
                new Table({ rows: riskTableRows, width: { size: 100, type: WidthType.PERCENTAGE } })
            );
        }

        // 4.4 Schein 변화 분석
        if (data.strategy.survivalAnxiety || data.strategy.learningAnxiety) {
            docChildren.push(
                new Paragraph({ text: '4.4 Schein 변화 심리 분석', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } })
            );
            
            if (data.strategy.survivalAnxiety) {
                docChildren.push(
                    new Paragraph({
                        children: [new TextRun({ text: '생존불안 (Survival Anxiety)', bold: true, size: 22, color: COLORS.WARNING })],
                        spacing: { before: 150, after: 80 },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: data.strategy.survivalAnxiety.description, size: 20, italics: true })],
                        spacing: { after: 80 },
                        indent: { left: convertInchesToTwip(0.25) },
                    })
                );
                data.strategy.survivalAnxiety.triggers.forEach(trigger => {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: `• ${trigger}`, size: 20 })],
                        spacing: { after: 60 },
                        indent: { left: convertInchesToTwip(0.5) },
                    }));
                });
            }
            
            if (data.strategy.learningAnxiety) {
                docChildren.push(
                    new Paragraph({
                        children: [new TextRun({ text: '학습불안 (Learning Anxiety)', bold: true, size: 22, color: COLORS.PRIMARY })],
                        spacing: { before: 200, after: 80 },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: data.strategy.learningAnxiety.description, size: 20, italics: true })],
                        spacing: { after: 80 },
                        indent: { left: convertInchesToTwip(0.25) },
                    })
                );
                data.strategy.learningAnxiety.barriers.forEach(barrier => {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: `• ${barrier}`, size: 20 })],
                        spacing: { after: 60 },
                        indent: { left: convertInchesToTwip(0.5) },
                    }));
                });
            }
        }

        // 4.5 Schein 8가지 접근법
        if (scheinTableRows.length > 1) {
            docChildren.push(
                new Paragraph({ text: '4.5 Schein 변화 촉진 접근법', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
                new Table({ rows: scheinTableRows, width: { size: 100, type: WidthType.PERCENTAGE } })
            );
        }
    }

    // 5. AI 에이전트 상세분석
    if (data.drilldownResults && Object.keys(data.drilldownResults).length > 0) {
        docChildren.push(
            new Paragraph({ text: '5. AI 에이전트 상세분석', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } })
        );

        let agentIndex = 0;
        Object.entries(data.drilldownResults)
            .filter(([key]) => key.startsWith('to-be-'))
            .forEach(([key, result]) => {
                const nodeId = key.replace('to-be-', '');
                const node = sortedToBeNodes.find(n => n.id === nodeId);
                if (!node) return;
                
                agentIndex++;
                
                docChildren.push(
                    new Paragraph({
                        text: `5.${agentIndex}. ${node.label}`,
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 250, after: 150 },
                    })
                );

                // 시간 절감
                if (result.automationOverview?.totalTimeReduction) {
                    docChildren.push(new Paragraph({
                        children: [
                            new TextRun({ text: '⏱ 예상 시간 절감: ', bold: true, size: 22 }),
                            new TextRun({ text: result.automationOverview.totalTimeReduction, color: COLORS.SUCCESS, size: 22, bold: true }),
                        ],
                        spacing: { after: 100 },
                    }));
                }

                // 세부 단계
                if (result.subSteps && result.subSteps.length > 0) {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: '📋 세부 실행 단계:', bold: true, size: 22 })],
                        spacing: { before: 150, after: 80 },
                    }));
                    
                    result.subSteps.forEach((step, idx) => {
                        const toolsStr = step.tools?.length ? ` [${step.tools.join(', ')}]` : '';
                        const durationStr = step.duration ? ` (${step.duration})` : '';
                        docChildren.push(new Paragraph({
                            children: [
                                new TextRun({ text: `${idx + 1}. ${step.label}`, bold: true, size: 20 }),
                                new TextRun({ text: durationStr + toolsStr, color: COLORS.TEXT_MUTED, size: 20 }),
                            ],
                            spacing: { after: 40 },
                            indent: { left: convertInchesToTwip(0.25) },
                        }));
                        if (step.description) {
                            docChildren.push(new Paragraph({
                                children: [new TextRun({ text: step.description, size: 20, color: COLORS.TEXT_MUTED })],
                                spacing: { after: 60 },
                                indent: { left: convertInchesToTwip(0.5) },
                            }));
                        }
                    });
                }

                // 주요 효과
                if (result.automationOverview?.keyBenefits && result.automationOverview.keyBenefits.length > 0) {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: '✨ 주요 효과:', bold: true, size: 22 })],
                        spacing: { before: 150, after: 80 },
                    }));
                    result.automationOverview.keyBenefits.forEach(benefit => {
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: `• ${benefit}`, size: 20 })],
                            spacing: { after: 40 },
                            indent: { left: convertInchesToTwip(0.25) },
                        }));
                    });
                }

                // 역량별 시간 절감
                if (result.automationOverview?.skillBasedReduction) {
                    const sr = result.automationOverview.skillBasedReduction;
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: '👥 역량별 예상 효과:', bold: true, size: 22 })],
                        spacing: { before: 150, after: 80 },
                    }));
                    docChildren.push(new Paragraph({
                        children: [
                            new TextRun({ text: '• 저역량(Junior): ', size: 20 }),
                            new TextRun({ text: sr.junior, color: COLORS.SUCCESS, size: 20 }),
                        ],
                        spacing: { after: 40 },
                        indent: { left: convertInchesToTwip(0.25) },
                    }));
                    docChildren.push(new Paragraph({
                        children: [
                            new TextRun({ text: '• 중역량(Mid): ', size: 20 }),
                            new TextRun({ text: sr.mid, color: COLORS.SUCCESS, size: 20 }),
                        ],
                        spacing: { after: 40 },
                        indent: { left: convertInchesToTwip(0.25) },
                    }));
                    docChildren.push(new Paragraph({
                        children: [
                            new TextRun({ text: '• 고역량(Senior): ', size: 20 }),
                            new TextRun({ text: sr.senior, color: COLORS.SUCCESS, size: 20 }),
                        ],
                        spacing: { after: 100 },
                        indent: { left: convertInchesToTwip(0.25) },
                    }));
                }
            });
    }

    const doc = new Document({
        sections: [{ children: docChildren }],
        styles: {
            paragraphStyles: [
                {
                    id: 'Title',
                    name: 'Title',
                    basedOn: 'Normal',
                    run: { size: 56, bold: true, color: COLORS.TEXT_DARK },
                    paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 200 } },
                },
                {
                    id: 'Heading1',
                    name: 'Heading 1',
                    basedOn: 'Normal',
                    run: { size: 32, bold: true, color: COLORS.PRIMARY_DARK },
                    paragraph: { spacing: { before: 400, after: 200 } },
                },
                {
                    id: 'Heading2',
                    name: 'Heading 2',
                    basedOn: 'Normal',
                    run: { size: 26, bold: true, color: COLORS.TEXT_DARK },
                    paragraph: { spacing: { before: 300, after: 150 } },
                },
            ],
        },
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, 'agent-shift-report.docx');
}

// ============================================================================
// Excel WBS 생성 (ExcelJS 기반 - 전문적 스타일링)
// ============================================================================
export async function generateExcelWBS(data: {
    asIsNodes?: ReportNode[];
    toBeNodes?: ReportNode[];
    asIsEdges?: ReportEdge[];
    toBeEdges?: ReportEdge[];
    strategy: ExtendedStrategy;
    totalWeeks?: number;
    drilldownResults?: Record<string, DrilldownResponse>;
}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Agent Shift';
    workbook.created = new Date();

    const totalWeeks = data.totalWeeks || 12;
    const sortedAsIsNodes = data.asIsNodes ? topologicalSort(data.asIsNodes, data.asIsEdges || []) : [];
    const sortedToBeNodes = data.toBeNodes ? topologicalSort(data.toBeNodes, data.toBeEdges || []) : [];

    // 공통 스타일 정의
    const headerStyle: Partial<ExcelJS.Style> = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
        border: {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        },
    };

    const cellStyle: Partial<ExcelJS.Style> = {
        font: { size: 10 },
        alignment: { vertical: 'middle', wrapText: true },
        border: {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        },
    };

    const agentCellStyle: Partial<ExcelJS.Style> = {
        ...cellStyle,
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } },
        font: { size: 10, color: { argb: 'FF2563EB' } },
    };

    // ========== 시트 1: AS-IS Flow ==========
    if (sortedAsIsNodes.length > 0) {
        const ws1 = workbook.addWorksheet('AS-IS Flow', { properties: { tabColor: { argb: 'FFEF4444' } } });
        ws1.columns = [
            { header: '순번', key: 'no', width: 8 },
            { header: '업무명', key: 'label', width: 28 },
            { header: '설명', key: 'description', width: 45 },
            { header: '소요시간', key: 'duration', width: 15 },
        ];

        // 헤더 스타일
        ws1.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
        ws1.getRow(1).height = 28;

        // 데이터 행
        sortedAsIsNodes.forEach((node, idx) => {
            const row = ws1.addRow({
                no: idx + 1,
                label: node.label,
                description: node.description || '-',
                duration: formatDuration(node.metrics),
            });
            row.eachCell(cell => { 
                cell.style = { ...cellStyle };
                if (idx % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                }
            });
            row.height = 24;
        });

        // 합계 행
        const asIsTotalMinutes = sortedAsIsNodes.reduce((sum, n) => sum + toMinutes(n.metrics), 0);
        const totalRow = ws1.addRow({ no: '', label: '총 소요시간', description: '', duration: formatDuration({ timeMinutes: asIsTotalMinutes }) });
        totalRow.eachCell(cell => {
            cell.style = {
                font: { bold: true, size: 11 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } },
                alignment: { vertical: 'middle', horizontal: 'center' },
                border: cellStyle.border,
            };
        });
        totalRow.height = 28;
    }

    // ========== 시트 2: TO-BE Flow ==========
    if (sortedToBeNodes.length > 0) {
        const ws2 = workbook.addWorksheet('TO-BE Flow', { properties: { tabColor: { argb: 'FF22C55E' } } });
        ws2.columns = [
            { header: '순번', key: 'no', width: 8 },
            { header: '업무명', key: 'label', width: 28 },
            { header: '유형', key: 'type', width: 14 },
            { header: '설명', key: 'description', width: 40 },
            { header: '소요시간', key: 'duration', width: 15 },
        ];

        ws2.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
        ws2.getRow(1).height = 28;

        sortedToBeNodes.forEach((node, idx) => {
            const isAgent = node.type === 'agent';
            const row = ws2.addRow({
                no: idx + 1,
                label: node.label,
                type: isAgent ? '🤖 AI Agent' : '📋 일반업무',
                description: node.description || '-',
                duration: formatDuration(node.metrics),
            });
            row.eachCell(cell => {
                cell.style = isAgent ? { ...agentCellStyle } : { ...cellStyle };
                if (!isAgent && idx % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                }
            });
            row.height = 24;
        });

        const toBeTotalMinutes = sortedToBeNodes.reduce((sum, n) => sum + toMinutes(n.metrics), 0);
        const totalRow = ws2.addRow({ no: '', label: '총 소요시간', type: '', description: '', duration: formatDuration({ timeMinutes: toBeTotalMinutes }) });
        totalRow.eachCell(cell => {
            cell.style = {
                font: { bold: true, size: 11, color: { argb: 'FF059669' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
                alignment: { vertical: 'middle', horizontal: 'center' },
                border: cellStyle.border,
            };
        });
        totalRow.height = 28;
    }

    // ========== 시트 3: Strategy WBS (Gantt) ==========
    const ws3 = workbook.addWorksheet('Strategy WBS', { properties: { tabColor: { argb: 'FF3B82F6' } } });
    const weekHeaders = Array.from({ length: totalWeeks }, (_, i) => `W${i + 1}`);
    
    ws3.columns = [
        { header: '단계', key: 'phase', width: 18 },
        { header: '기간', key: 'duration', width: 10 },
        { header: '액션', key: 'action', width: 35 },
        { header: '왜 (필요성)', key: 'rationale', width: 35 },
        { header: '가치', key: 'value', width: 35 },
        ...weekHeaders.map(w => ({ header: w, key: w, width: 4 })),
    ];

    ws3.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
    ws3.getRow(1).height = 28;

    data.strategy.phases.forEach((phase, phaseIdx) => {
        const startWeek = phase.startWeek || 1;
        const endWeek = phase.endWeek || startWeek;
        const phaseColor = phase.color?.replace('#', '') || '3B82F6';

        phase.actions.forEach((action, actionIdx) => {
            const isFirst = actionIdx === 0;
            const rowData: Record<string, string | number> = {
                phase: isFirst ? phase.name : '',
                duration: isFirst ? phase.duration : '',
                action: getActionText(action),
                rationale: isActionItem(action) ? action.rationale : '-',
                value: isActionItem(action) ? action.value : '-',
            };
            
            weekHeaders.forEach((w, weekIdx) => {
                const week = weekIdx + 1;
                rowData[w] = week >= startWeek && week <= endWeek ? '●' : '';
            });

            const row = ws3.addRow(rowData);
            row.eachCell((cell, colNumber) => {
                cell.style = { ...cellStyle };
                cell.alignment = { vertical: 'middle', horizontal: colNumber > 5 ? 'center' : 'left', wrapText: true };
                
                // Gantt 표시 셀에 색상 적용
                if (colNumber > 5 && cell.value === '●') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${phaseColor}` } };
                    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                }
                
                if (phaseIdx % 2 === 1 && colNumber <= 5) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                }
            });
            row.height = 32;
        });
    });

    // ========== 시트 4: 변화관리 상세 ==========
    if (data.strategy.keyMessages || data.strategy.riskFactors || data.strategy.scheinApproaches) {
        const ws4 = workbook.addWorksheet('변화관리 상세', { properties: { tabColor: { argb: 'FFF59E0B' } } });
        let currentRow = 1;

        // 핵심 메시지
        if (data.strategy.keyMessages && data.strategy.keyMessages.length > 0) {
            ws4.getCell(currentRow, 1).value = '핵심 메시지';
            ws4.getCell(currentRow, 1).style = { ...headerStyle, alignment: { horizontal: 'left' } };
            ws4.mergeCells(currentRow, 1, currentRow, 3);
            currentRow++;
            
            data.strategy.keyMessages.forEach((msg, idx) => {
                ws4.getCell(currentRow, 1).value = idx + 1;
                ws4.getCell(currentRow, 2).value = msg;
                ws4.mergeCells(currentRow, 2, currentRow, 3);
                ws4.getRow(currentRow).eachCell(cell => { cell.style = cellStyle; });
                currentRow++;
            });
            currentRow++;
        }

        // 리스크 요인
        if (data.strategy.riskFactors && data.strategy.riskFactors.length > 0) {
            ws4.getCell(currentRow, 1).value = '리스크 요인';
            ws4.getCell(currentRow, 2).value = '완화 방안';
            ws4.getRow(currentRow).eachCell(cell => { cell.style = headerStyle; });
            currentRow++;
            
            data.strategy.riskFactors.forEach(rf => {
                ws4.getCell(currentRow, 1).value = rf.risk;
                ws4.getCell(currentRow, 2).value = rf.mitigation;
                ws4.getRow(currentRow).eachCell(cell => { cell.style = cellStyle; });
                currentRow++;
            });
            currentRow++;
        }

        // Schein 접근법
        if (data.strategy.scheinApproaches && data.strategy.scheinApproaches.length > 0) {
            ws4.getCell(currentRow, 1).value = '접근법';
            ws4.getCell(currentRow, 2).value = '설명';
            ws4.getCell(currentRow, 3).value = '실행 항목';
            ws4.getRow(currentRow).eachCell(cell => { cell.style = headerStyle; });
            currentRow++;
            
            data.strategy.scheinApproaches.forEach(approach => {
                ws4.getCell(currentRow, 1).value = approach.approach;
                ws4.getCell(currentRow, 2).value = approach.description;
                ws4.getCell(currentRow, 3).value = approach.actions?.join(', ') || '-';
                ws4.getRow(currentRow).eachCell(cell => { cell.style = cellStyle; });
                currentRow++;
            });
        }

        ws4.columns = [
            { width: 30 },
            { width: 45 },
            { width: 45 },
        ];
    }

    // ========== 시트 5: ROI Summary ==========
    const ws5 = workbook.addWorksheet('ROI Summary', { properties: { tabColor: { argb: 'FF8B5CF6' } } });
    
    const asIsTotalMinutes = sortedAsIsNodes.reduce((sum, n) => sum + toMinutes(n.metrics), 0);
    const toBeTotalMinutes = sortedToBeNodes.reduce((sum, n) => sum + toMinutes(n.metrics), 0);
    const timeSavedMinutes = asIsTotalMinutes - toBeTotalMinutes;
    const efficiencyRate = asIsTotalMinutes > 0 ? Math.round((timeSavedMinutes / asIsTotalMinutes) * 100) : 0;

    ws5.columns = [{ width: 30 }, { width: 25 }];

    const roiData = [
        ['ROI 분석 요약', ''],
        ['', ''],
        ['항목', '값'],
        ['AS-IS 총 소요시간', formatDuration({ timeMinutes: asIsTotalMinutes })],
        ['TO-BE 총 소요시간', formatDuration({ timeMinutes: toBeTotalMinutes })],
        ['절감 시간', formatDuration({ timeMinutes: timeSavedMinutes })],
        ['효율화율', `${efficiencyRate}%`],
        ['', ''],
        ['변화 관리 정보', ''],
        ['총 변화 관리 기간', `${totalWeeks}주`],
        ['전략 단계 수', `${data.strategy.phases.length}단계`],
        ['총 액션 아이템', `${data.strategy.phases.reduce((sum, p) => sum + p.actions.length, 0)}개`],
    ];

    roiData.forEach((rowData, idx) => {
        const row = ws5.addRow(rowData);
        if (idx === 0) {
            row.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
            ws5.mergeCells(idx + 1, 1, idx + 1, 2);
        } else if (idx === 2 || idx === 8) {
            row.eachCell(cell => { cell.style = headerStyle; });
        } else if (rowData[0]) {
            row.eachCell(cell => { cell.style = cellStyle; });
        }
    });

    // ========== 시트 6: 상세분석 ==========
    if (data.drilldownResults && Object.keys(data.drilldownResults).length > 0) {
        const ws6 = workbook.addWorksheet('AI 에이전트 상세', { properties: { tabColor: { argb: 'FF10B981' } } });
        ws6.columns = [
            { header: '노드명', key: 'label', width: 22 },
            { header: '세부단계', key: 'subSteps', width: 55 },
            { header: '주요효과', key: 'benefits', width: 40 },
            { header: '시간절감', key: 'timeReduction', width: 20 },
            { header: '역량별 효과', key: 'skillReduction', width: 50 },
        ];

        ws6.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
        ws6.getRow(1).height = 28;

        Object.entries(data.drilldownResults)
            .filter(([key]) => key.startsWith('to-be-'))
            .forEach(([key, result], idx) => {
                const nodeId = key.replace('to-be-', '');
                const node = sortedToBeNodes.find(n => n.id === nodeId);
                if (!node) return;

                const subStepsText = result.subSteps
                    ? result.subSteps.map((s, i) => {
                        const toolsStr = s.tools?.length ? ` [${s.tools.join(', ')}]` : '';
                        return `${i + 1}. ${s.label}${s.duration ? ` (${s.duration})` : ''}${toolsStr}`;
                    }).join('\n')
                    : '-';
                
                const benefitsText = result.automationOverview?.keyBenefits?.join('\n') || '-';
                
                const skillReductionText = result.automationOverview?.skillBasedReduction
                    ? `Junior: ${result.automationOverview.skillBasedReduction.junior}\nMid: ${result.automationOverview.skillBasedReduction.mid}\nSenior: ${result.automationOverview.skillBasedReduction.senior}`
                    : '-';

                const row = ws6.addRow({
                    label: node.label,
                    subSteps: subStepsText,
                    benefits: benefitsText,
                    timeReduction: result.automationOverview?.totalTimeReduction || '-',
                    skillReduction: skillReductionText,
                });
                
                row.eachCell(cell => {
                    cell.style = { ...agentCellStyle };
                    if (idx % 2 === 1) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
                    }
                });
                row.height = Math.max(60, (subStepsText.split('\n').length) * 16);
            });
    }

    // 파일 다운로드
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, 'agent-shift-report.xlsx');
}

// ============================================================================
// 파일 다운로드 헬퍼
// ============================================================================
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
