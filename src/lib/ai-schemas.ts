import { z } from 'zod';

// 노드 메트릭 스키마 - 다양한 시간 단위 지원 (분/시간/일/주/월)
const NodeMetricsSchema = z.object({
    timeMinutes: z.number().int().optional().describe('사용하지 말 것 (하위 호환용)'),
    duration: z.number().int().describe('소요 시간 (정수, 예: 30)'),
    durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']).describe('시간 단위 (예: minutes)'),
}).describe('시간 메트릭 객체 - 모든 노드에 반드시 포함');

// 노드 스키마 - .describe()로 모델에 명확한 지시, .max()로 JSON Schema maxLength 강제
const FlowNodeSchema = z.object({
    id: z.string().describe('고유 ID'),
    label: z.string().max(30).describe('노드 이름 (30자 이내, 핵심만)'),
    description: z.string().max(60).optional().describe('간단 설명 (60자 이내)'),
    type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']),
    terminalType: z.enum(['start', 'end']).optional(),
    ioType: z.enum(['input', 'output']).optional(),
    stressLevel: z.enum(['low', 'medium', 'high']).optional(),
    collaborationType: z.enum(['copilot', 'monitor', 'autonomous']).optional().describe('AI 협업 유형'),
    agentDescription: z.string().max(100).optional().describe('AI 에이전트 역할 설명 (100자 이내, 핵심만)'),
    position: z.object({
        x: z.number(),
        y: z.number(),
    }),
    metrics: NodeMetricsSchema.optional().describe('시간 메트릭 (반드시 포함: duration, durationUnit)'),
});

// 엣지 스키마
const FlowEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.enum(['top', 'right', 'bottom', 'left']).optional().default('bottom'),
    targetHandle: z.enum(['top', 'right', 'bottom', 'left']).optional().default('top'),
});

// As-Is 플로우 응답 스키마
export const AsIsFlowResponseSchema = z.object({
    nodes: z.array(FlowNodeSchema).max(20).describe('노드 5~8개 권장'),
    edges: z.array(FlowEdgeSchema).max(40),
    painPoints: z.array(
        z.object({
            nodeId: z.string(),
            issue: z.string().max(120).describe('문제점 (120자)'),
            severity: z.enum(['low', 'medium', 'high']),
        })
    ).max(20),
});

// To-Be 플로우 응답 스키마
export const ToBeFlowResponseSchema = z.object({
    nodes: z.array(FlowNodeSchema).max(20).describe('노드 5~8개 권장'),
    edges: z.array(FlowEdgeSchema).max(40),
    improvements: z.array(
        z.object({
            originalNodeId: z.string(),
            newNodeId: z.string(),
            description: z.string().max(120).describe('개선 내용 (120자)'),
            timeSaved: z.string().max(40).describe('절감 시간 (40자)'),
        })
    ).max(20),
});

// 변화 전략 응답 스키마 - .describe()로 모델에 명확한 지시
export const ChangeStrategyResponseSchema = z.object({
    phases: z.array(
        z.object({
            id: z.string().describe('단계 ID'),
            name: z.string().max(30).describe('단계명 (30자)'),
            duration: z.string().max(20).describe('기간 (예: 2주)'),
            startWeek: z.number().int().describe('시작 주차'),
            endWeek: z.number().int().describe('종료 주차'),
            actions: z.array(z.object({
                action: z.string().max(80).describe('활동 내용 (80자)'),
                rationale: z.string().max(100).describe('필요 이유 (100자)'),
                value: z.string().max(100).describe('제공 가치 (100자)'),
            })).max(5).describe('액션 2~3개 권장'),
            color: z.string().max(10).describe('색상 hex'),
        })
    ).max(8).describe('단계 3~8개 권장'),
    keyMessages: z.array(z.string().max(80)).max(6).describe('핵심 메시지 3~5개 권장 (각 80자)'),
    riskFactors: z.array(
        z.object({
            risk: z.string().max(80).describe('리스크 (80자)'),
            mitigation: z.string().max(100).describe('완화 방안 (100자)'),
        })
    ).max(5).describe('리스크 2~3개 권장'),
    survivalAnxiety: z.object({
        description: z.string().max(150).describe('변화 필요성 (150자)'),
        triggers: z.array(z.string().max(80)).max(5).describe('불안 요소 2~3개 권장 (각 80자)'),
    }).optional().describe('Schein: 생존불안'),
    learningAnxiety: z.object({
        description: z.string().max(150).describe('변화 두려움 (150자)'),
        barriers: z.array(z.string().max(80)).max(5).describe('장벽 2~3개 권장 (각 80자)'),
    }).optional().describe('Schein: 학습불안'),
    scheinApproaches: z.array(
        z.object({
            id: z.number().int().describe('1~8'),
            approach: z.string().max(50).describe('접근방법명 (50자)'),
            description: z.string().max(100).describe('적용 방법 (100자)'),
            actions: z.array(z.string().max(80)).max(5).describe('실행 항목 2~3개 권장 (각 80자)'),
        })
    ).max(8).optional().describe('Schein 8가지 접근 권장'),
});

// 타입 추출
export type AsIsFlowResponse = z.infer<typeof AsIsFlowResponseSchema>;
export type ToBeFlowResponse = z.infer<typeof ToBeFlowResponseSchema>;
export type ChangeStrategyResponse = z.infer<typeof ChangeStrategyResponseSchema>;

// 드릴다운 응답 스키마 (AS-IS/TO-BE 분리) - .describe()로 모델에 명확한 지시
export const DrilldownResponseSchema = z.object({
    parentNodeId: z.string().describe('분석 대상 노드 ID'),
    flowType: z.enum(['asis', 'tobe']).optional().describe('플로우 유형'),
    subSteps: z.array(
        z.object({
            id: z.string().max(50).describe('단계 ID (snake_case, 간결하게)'),
            label: z.string().max(40).describe('단계명 (40자 이내, 핵심만)'),
            description: z.string().max(150).describe('설명 (150자 이내, 간결하게)'),
            duration: z.string().max(20).optional().describe('소요 시간 (예: 30초, 2분)'),
            tools: z.array(z.string().max(35)).max(5).optional().describe('도구명 1~3개 권장'),
            painPoints: z.string().max(100).optional().describe('AS-IS: 인간이 겪는 어려움 (100자)'),
            aiImplementation: z.object({
                method: z.string().max(150).describe('AI 처리 방법 (150자 이내)'),
                technology: z.array(z.string().max(35)).max(5).optional().describe('기술명 1~3개 권장'),
                platforms: z.array(z.string().max(35)).max(5).optional().describe('플랫폼명 1~3개 권장'),
                automationLevel: z.enum(['full', 'partial', 'assisted']).optional(),
            }).optional().describe('TO-BE AI 노드 전용'),
            resources: z.array(z.object({
                type: z.enum(['youtube', 'docs', 'article', 'tutorial']),
                title: z.string().max(50).describe('자료 제목 (50자)'),
                url: z.string().max(50).optional().describe('검색 키워드 (50자)'),
                description: z.string().max(80).optional().describe('설명 (80자)'),
            })).max(3).optional().describe('학습 자료 1~2개 권장'),
        })
    ).max(8).describe('하위 단계 3~5개 권장'),
    summary: z.string().max(200).describe('전체 요약 (200자 이내)'),
    automationOverview: z.object({
        replacedAsIsSteps: z.array(z.string().max(40)).max(10).optional().describe('대체된 AS-IS 단계명'),
        skillBasedReduction: z.object({
            asIsTotal: z.number().int().optional().describe('AS-IS 총 시간(분)'),
            junior: z.string().max(50).describe('저역량 절감 (예: 90분→5분)'),
            mid: z.string().max(50).describe('중역량 절감'),
            senior: z.string().max(50).describe('고역량 절감'),
        }).optional().describe('역량별 시간 절감'),
        totalTimeReduction: z.string().max(80).optional().describe('절감 요약 (80자)'),
        keyBenefits: z.array(z.string().max(80)).max(5).optional().describe('핵심 이점 1~3개 권장'),
        implementationTips: z.array(z.string().max(80)).max(5).optional().describe('구현 팁 1~3개 권장'),
    }).optional().describe('TO-BE AI 노드: 자동화 개요'),
});

export type DrilldownResponse = z.infer<typeof DrilldownResponseSchema>;

// 노드 분할 (세분화) 응답 스키마
export const NodeSplitResponseSchema = z.object({
    nodes: z.array(
        z.object({
            id: z.string(),
            label: z.string().max(40).describe('단계명 (40자)'),
            description: z.string().max(100).optional().describe('설명 (100자)'),
            type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']),
            stressLevel: z.enum(['low', 'medium', 'high']).optional(),
            duration: z.number().int().optional().describe('소요시간 (숫자)'),
            durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']).optional().describe('시간 단위'),
        })
    ).max(10).describe('분할된 노드 4~6개 권장'),
    summary: z.string().max(150).describe('분할 요약 (150자)'),
});

export type NodeSplitResponse = z.infer<typeof NodeSplitResponseSchema>;
