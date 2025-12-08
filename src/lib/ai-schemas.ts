import { z } from 'zod';

// 노드 메트릭 스키마 - 정수만 허용하여 부동소수점 오버플로우 방지
export const NodeMetricsSchema = z.object({
    timeMinutes: z.number().int().optional(),     // 소요 시간 (분) - 정수
    costKRW: z.number().int().optional(),         // 비용 (원) - 정수
    peopleCount: z.number().int().optional(),     // 관련 인원 - 정수
    errorRate: z.number().int().optional(),       // 오류율 (%) - 정수
});

// 노드 스키마
export const FlowNodeSchema = z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']),
    terminalType: z.enum(['start', 'end']).optional(),
    ioType: z.enum(['input', 'output']).optional(),
    stressLevel: z.enum(['low', 'medium', 'high']).optional(),
    collaborationType: z.enum(['copilot', 'monitor', 'autonomous']).optional(),
    agentDescription: z.string().optional(),
    position: z.object({
        x: z.number(),
        y: z.number(),
    }),
    metrics: NodeMetricsSchema.optional(),
});

// 엣지 스키마
export const FlowEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
});

// As-Is 플로우 응답 스키마
export const AsIsFlowResponseSchema = z.object({
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
    painPoints: z.array(z.object({
        nodeId: z.string(),
        issue: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
    })),
});

// To-Be 플로우 응답 스키마
export const ToBeFlowResponseSchema = z.object({
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
    improvements: z.array(z.object({
        originalNodeId: z.string(),
        newNodeId: z.string(),
        description: z.string(),
        timeSaved: z.string(),
    })),
});

// 변화 전략 응답 스키마
export const ChangeStrategyResponseSchema = z.object({
    phases: z.array(z.object({
        id: z.string(),
        name: z.string(),
        duration: z.string(),
        startWeek: z.number(),
        endWeek: z.number(),
        actions: z.array(z.string()),
        color: z.string(),
    })),
    keyMessages: z.array(z.string()),
    riskFactors: z.array(z.object({
        risk: z.string(),
        mitigation: z.string(),
    })),
});

// 타입 추출
export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type AsIsFlowResponse = z.infer<typeof AsIsFlowResponseSchema>;
export type ToBeFlowResponse = z.infer<typeof ToBeFlowResponseSchema>;
export type ChangeStrategyResponse = z.infer<typeof ChangeStrategyResponseSchema>;

// 드릴다운 응답 스키마
export const DrilldownResponseSchema = z.object({
    parentNodeId: z.string(),
    subSteps: z.array(z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        duration: z.string().optional(),
        tools: z.array(z.string()).optional(),
        aiPotential: z.string().optional(), // AI 자동화 가능성 설명
    })),
    summary: z.string(),
});

export type DrilldownResponse = z.infer<typeof DrilldownResponseSchema>;

// 노드 분할 (세분화) 응답 스키마
export const NodeSplitResponseSchema = z.object({
    nodes: z.array(z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
        type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']),
        stressLevel: z.enum(['low', 'medium', 'high']).optional(),
    })),
    summary: z.string(),
});

export type NodeSplitResponse = z.infer<typeof NodeSplitResponseSchema>;
