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

// ============================================
// 드릴다운(상세 분석) 스키마
// ============================================
//
// 설계 원칙
// 1. 변형별로 스키마를 나눈다. 예전에는 스키마 하나를 세 프롬프트가 공유하며
//    "aiImplementation 필드는 생략하세요" 같은 산문으로 변형을 구분했다.
//    변형 판별을 프롬프트가 아니라 타입이 하도록 바꿨다.
// 2. 구조화된 값은 문자열에 넣지 않는다. "30초", "90분→5분" 같은 표기는
//    앱에서 다시 파싱해야 했고 정규식에 없는 단위는 조용히 버려졌다.
// 3. 필드명이 곧 지시다. 모델은 .describe()보다 필드명을 강하게 따른다.

export const DURATION_UNITS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

const DurationUnitEnum = z.enum(DURATION_UNITS);

/** 소요 시간. 숫자와 단위를 분리해 앱이 파싱할 필요가 없게 한다. */
const DurationSchema = z.object({
    value: z.number().int().min(0).describe('숫자만 (예: 30)'),
    unit: DurationUnitEnum.describe('시간 단위'),
});

/** 하위 단계의 공통 필드 */
const drilldownStepBase = {
    id: z.string().max(50).describe('단계 ID (snake_case)'),
    label: z.string().max(40).describe('단계명 (40자 이내)'),
    description: z.string().max(150).describe('설명 (150자 이내)'),
    duration: DurationSchema.optional().describe('소요 시간'),
    tools: z.array(z.string().max(35)).max(5).default([])
        .describe('실제 제품·서비스 이름 1~3개 (예: Excel, Slack). 일반 명사 금지'),
};

/** 인간이 수행하는 단계 — AS-IS 전체, TO-BE의 비(非)에이전트 노드 */
const HumanDrilldownStepSchema = z.object({
    ...drilldownStepBase,
    painPoints: z.string().max(100).optional().describe('이 단계에서 겪는 어려움 (100자)'),
});

/** AI 에이전트가 수행하는 단계 — TO-BE의 agent 노드 전용 */
const AgentDrilldownStepSchema = z.object({
    ...drilldownStepBase,
    aiImplementation: z.object({
        method: z.string().max(150).describe('AI 처리 방법 (150자 이내)'),
        technology: z.array(z.string().max(35)).max(5).default([])
            .describe('실제 기술명 1~3개 (예: RPA, OCR). 일반 명사 금지'),
        platforms: z.array(z.string().max(35)).max(5).default([])
            .describe('실제 제품명 1~3개 (예: Power Automate). 일반 명사 금지'),
        automationLevel: z.enum(['full', 'partial', 'assisted']).describe('자동화 수준'),
    }).describe('AI 처리 방식'),
    resources: z.array(z.object({
        type: z.enum(['youtube', 'docs', 'article', 'tutorial']),
        title: z.string().max(50).describe('자료 제목 (50자)'),
        // 예전 필드명이 url이라 모델이 실제 URL을 넣어 길이 제한을 넘기곤 했다
        searchQuery: z.string().max(50).describe('검색어 (50자). URL이 아니라 검색 키워드'),
        description: z.string().max(80).optional().describe('설명 (80자)'),
    })).max(3).default([]).describe('학습 자료 1~2개'),
});

/** 역량별 시간 절감. 예전에는 "90분→5분" 문자열이었다. */
const SkillTimeReductionSchema = z.object({
    before: z.number().int().min(0).describe('도입 전 소요 시간 (숫자)'),
    after: z.number().int().min(0).describe('도입 후 소요 시간 (숫자)'),
    unit: DurationUnitEnum.describe('시간 단위'),
});

const AutomationOverviewSchema = z.object({
    replacedAsIsSteps: z.array(z.string().max(40)).max(10).default([])
        .describe('이 AI가 대체한 AS-IS 단계명'),
    skillBasedReduction: z.object({
        junior: SkillTimeReductionSchema.describe('저역량 담당자'),
        mid: SkillTimeReductionSchema.describe('중역량 담당자'),
        senior: SkillTimeReductionSchema.describe('고역량 담당자'),
    }).describe('역량별 시간 절감'),
    reductionPercent: z.number().int().min(0).max(100).describe('전체 시간 절감률 (0~100 정수)'),
    keyBenefits: z.array(z.string().max(80)).max(5).default([]).describe('핵심 이점 1~3개'),
    implementationTips: z.array(z.string().max(80)).max(5).default([]).describe('구현 팁 1~3개'),
});

/** 인간 단계 분석 응답 */
export const HumanDrilldownResponseSchema = z.object({
    parentNodeId: z.string().max(80).describe('분석 대상 노드 ID'),
    flowType: z.enum(['asis', 'tobe']).describe('플로우 유형'),
    subSteps: z.array(HumanDrilldownStepSchema).max(8).describe('하위 단계 3~5개'),
    summary: z.string().max(200).describe('전체 요약 (200자 이내)'),
});

/** AI 에이전트 단계 분석 응답 */
export const AgentDrilldownResponseSchema = z.object({
    parentNodeId: z.string().max(80).describe('분석 대상 노드 ID'),
    flowType: z.literal('tobe').describe('플로우 유형'),
    subSteps: z.array(AgentDrilldownStepSchema).max(8).describe('하위 단계 3~5개'),
    summary: z.string().max(200).describe('전체 요약 (200자 이내)'),
    automationOverview: AutomationOverviewSchema.describe('자동화 개요'),
});

export type Duration = z.infer<typeof DurationSchema>;
export type SkillTimeReduction = z.infer<typeof SkillTimeReductionSchema>;
export type AutomationOverview = z.infer<typeof AutomationOverviewSchema>;

/**
 * 저장·렌더링용 통합 형태.
 *
 * 모델에는 변형별 스키마를 좁게 주되, 저장소와 UI는 한 가지 형태만 다루면 되도록
 * 변형 전용 필드를 optional로 둔 상위 집합을 쓴다.
 * 두 응답 스키마의 결과 모두 이 타입에 그대로 대입된다.
 */
export type DrilldownSubStep =
    z.infer<typeof HumanDrilldownStepSchema> & Partial<z.infer<typeof AgentDrilldownStepSchema>>;

export interface DrilldownResponse {
    parentNodeId: string;
    flowType: 'asis' | 'tobe';
    subSteps: DrilldownSubStep[];
    summary: string;
    automationOverview?: AutomationOverview;
}

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
