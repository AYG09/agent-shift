import { z } from 'zod';

// 노드 메트릭 스키마 - 다양한 시간 단위 지원 (분/시간/일/주/월)
export const NodeMetricsSchema = z.object({
    timeMinutes: z.number().int().optional(), // 하위 호환성 (분 단위)
    duration: z.number().int().optional(),    // 새 필드: 숫자 값
    durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']).optional(), // 새 필드: 단위
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
    sourceHandle: z.enum(['top', 'right', 'bottom', 'left']).optional().default('bottom'),
    targetHandle: z.enum(['top', 'right', 'bottom', 'left']).optional().default('top'),
});

// As-Is 플로우 응답 스키마
export const AsIsFlowResponseSchema = z.object({
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
    painPoints: z.array(
        z.object({
            nodeId: z.string(),
            issue: z.string(),
            severity: z.enum(['low', 'medium', 'high']),
        })
    ),
});

// To-Be 플로우 응답 스키마
export const ToBeFlowResponseSchema = z.object({
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
    improvements: z.array(
        z.object({
            originalNodeId: z.string(),
            newNodeId: z.string(),
            description: z.string(),
            timeSaved: z.string(),
        })
    ),
});

// 변화 전략 응답 스키마 (Schein의 8가지 접근방법 통합)
export const ChangeStrategyResponseSchema = z.object({
    phases: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            duration: z.string(),
            startWeek: z.number(),
            endWeek: z.number(),
            // 확장된 액션 스키마: 이유와 가치 포함
            actions: z.array(z.object({
                action: z.string(),
                rationale: z.string(), // 왜 이 활동이 필요한가
                value: z.string(), // 어떤 가치를 제공하는가
            })),
            color: z.string(),
        })
    ),
    keyMessages: z.array(z.string()),
    riskFactors: z.array(
        z.object({
            risk: z.string(),
            mitigation: z.string(),
        })
    ),
    // Schein의 심리적 안전 프레임워크 (Lewin 모델과 통합)
    survivalAnxiety: z.object({
        description: z.string(), // 왜 변화해야 하는가
        triggers: z.array(z.string()), // 생존불안을 높이는 요소들
    }).optional(),
    learningAnxiety: z.object({
        description: z.string(), // 변화에 대한 두려움
        barriers: z.array(z.string()), // 학습불안의 원인들
    }).optional(),
    // Schein의 8가지 학습불안 감소 방법 (조직문화와 리더십, 2017)
    scheinApproaches: z.array(
        z.object({
            id: z.number(), // 1-8
            approach: z.string(), // 접근방법 이름
            description: z.string(), // 이 업무에 맞는 적용 방법
            actions: z.array(z.string()), // 구체적 실행 항목
        })
    ).optional(),
});

// 타입 추출
export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type AsIsFlowResponse = z.infer<typeof AsIsFlowResponseSchema>;
export type ToBeFlowResponse = z.infer<typeof ToBeFlowResponseSchema>;
export type ChangeStrategyResponse = z.infer<typeof ChangeStrategyResponseSchema>;

// 드릴다운 응답 스키마 (AS-IS/TO-BE 분리) - 모든 문자열에 길이 제한 적용
export const DrilldownResponseSchema = z.object({
    parentNodeId: z.string(),
    flowType: z.enum(['asis', 'tobe']).optional(), // 어떤 플로우인지 명시
    subSteps: z.array(
        z.object({
            id: z.string().max(50),
            label: z.string().max(100),
            description: z.string().max(500), // 설명은 500자 이내
            duration: z.string().max(50).optional(),
            tools: z.array(z.string().max(30)).max(3).optional(), // 핵심 도구 1-3개만 (토큰 오버플로우 방지)
            // AS-IS 전용: 인간이 겪는 어려움/비효율
            painPoints: z.string().max(300).optional(),
            // TO-BE 전용: AI 구현 방법 상세
            aiImplementation: z.object({
                method: z.string().max(500), // AI 처리 방법 (500자 이내)
                technology: z.array(z.string().max(50)), // 사용 기술 (LLM, RPA, OCR 등)
                platforms: z.array(z.string().max(50)).optional(), // MS365 Copilot, Google AI 등
                automationLevel: z.enum(['full', 'partial', 'assisted']).optional(),
            }).optional(),
            // TO-BE 전용: 학습 리소스
            resources: z.array(z.object({
                type: z.enum(['youtube', 'docs', 'article', 'tutorial']),
                title: z.string().max(100), // 자료 제목 (100자 이내)
                url: z.string().max(100).optional(), // 짧은 검색 키워드만! (100자 이내)
                description: z.string().max(200).optional(), // 설명 (200자 이내)
            })).max(3).optional(), // 리소스는 최대 3개
        })
    ).max(6), // subSteps 최대 6개
    summary: z.string().max(500),
    // TO-BE 전용: 전체 자동화 개요
    automationOverview: z.object({
        // 대체된 AS-IS 단계들 (ID 또는 이름)
        replacedAsIsSteps: z.array(z.string().max(100)).max(5).optional(),
        // 역량별 시간 절감 (필수!)
        skillBasedReduction: z.object({
            asIsTotal: z.number().int().optional(), // AS-IS 기준 총 시간(분)
            junior: z.string().max(80), // 예: "90분→5분 (94% 절감)"
            mid: z.string().max(80),    // 예: "60분→5분 (92% 절감)"
            senior: z.string().max(80), // 예: "42분→5분 (88% 절감)"
        }).optional(),
        // 기존 필드 (역량별로 분리되면서 간단한 요약) - 50자 이내 권장
        totalTimeReduction: z.string().max(300).optional(),
        keyBenefits: z.array(z.string().max(200)).max(5).optional(),
        implementationTips: z.array(z.string().max(200)).max(5).optional(),
    }).optional(),
});

export type DrilldownResponse = z.infer<typeof DrilldownResponseSchema>;

// 노드 분할 (세분화) 응답 스키마
export const NodeSplitResponseSchema = z.object({
    nodes: z.array(
        z.object({
            id: z.string(),
            label: z.string(),
            description: z.string().optional(),
            type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']),
            stressLevel: z.enum(['low', 'medium', 'high']).optional(),
        })
    ),
    summary: z.string(),
});

export type NodeSplitResponse = z.infer<typeof NodeSplitResponseSchema>;
