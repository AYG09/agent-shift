import { z } from 'zod';
import { FLOW_SHAPE_IDS } from './flow-shapes';
import { SHAPE_FIELD_DESCRIBE_HINT } from './ai-shape-guide';

// 노드 메트릭 스키마 - 다양한 시간 단위 지원 (분/시간/일/주/월)
const NodeMetricsSchema = z.object({
    timeMinutes: z.number().int().optional().describe('사용하지 말 것 (하위 호환용)'),
    duration: z.number().int().describe('소요 시간 (정수, 예: 30)'),
    durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']).describe('시간 단위 (예: minutes)'),
}).describe('시간 메트릭 객체 - 모든 노드에 반드시 포함');

export const FlowShapeSchema = z.enum(FLOW_SHAPE_IDS);

// 노드 스키마 - .describe()로 모델에 명확한 지시, .max()로 JSON Schema maxLength 강제
const FlowNodeSchema = z.object({
    id: z.string().describe('고유 ID'),
    label: z.string().max(30).describe('노드 이름 (30자 이내, 핵심만)'),
    description: z.string().max(60).optional().describe('간단 설명 (60자 이내)'),
    type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']),
    shape: FlowShapeSchema.describe(SHAPE_FIELD_DESCRIBE_HINT),
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

// 분기 의미 타입 - 표시 문구(label)와 의미(branchType)를 분리한다
export const BranchTypeSchema = z.enum(['yes', 'no', 'condition', 'default']);

// 엣지 스키마
const FlowEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.enum(['top', 'right', 'bottom', 'left']).optional().default('bottom'),
    targetHandle: z.enum(['top', 'right', 'bottom', 'left']).optional().default('top'),
    label: z.string().max(20).optional().describe('연결선에 표시할 문구 (예: YES, NO, 승인, 반려). decision 노드에서 나가는 edge는 반드시 지정'),
    branchType: BranchTypeSchema.optional().describe("분기 의미 타입. decision 노드에서 나가는 edge는 반드시 지정 - 이진 판단이면 'yes'/'no' 각 1개씩, 다중 조건 분기면 'condition', 그 외 일반 흐름은 생략 가능"),
    condition: z.string().max(60).optional().describe('분기 조건/근거 설명 (예: 적합 후보자 없음, 최대 재시도 초과). NO나 조건부 분기에 권장'),
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
                task: z.string().max(40).describe('과업 (40자)'),
                owner: z.string().max(20).describe('담당자 (20자)'),
                priority: z.enum(['high', 'medium', 'low']).describe('우선순위'),
            })).max(10).describe('핵심 액션 아이템'),
        })
    ).max(10).describe('실행 단계 3~5개'),
    overallSummary: z.string().max(200).describe('전체 요약 (200자)'),
    expectedROI: z.string().max(100).describe('기대 효과 (100자)'),
});

// ----------------------------------------------------------------------------
// 세부 단계 분석 (Drilldown) 스키마
// ----------------------------------------------------------------------------

export const DurationUnitEnum = z.enum(['seconds', 'minutes', 'hours', 'days', 'weeks', 'months']);

export const DurationSchema = z.object({
    value: z.number().int().min(1).describe('숫자값 (1 이상 정수)'),
    unit: DurationUnitEnum.describe('단위 (minutes/hours/days/weeks/months)'),
});

const CommonDrilldownFlowFieldsSchema = z.object({
    type: z.enum(['terminal', 'process', 'decision', 'io', 'agent', 'task', 'subprocess']).optional().describe('노드 종류'),
    shape: FlowShapeSchema.describe(SHAPE_FIELD_DESCRIBE_HINT),
    terminalType: z.enum(['start', 'end']).optional().describe('시작/종료 세부 구분'),
    ioType: z.enum(['input', 'output']).optional().describe('입력/출력 세부 구분'),
    stressLevel: z.enum(['low', 'medium', 'high']).optional().describe('부하/부담 수준'),
    collaborationType: z.enum(['copilot', 'monitor', 'autonomous']).optional().describe('AI 협업 방식'),
    agentDescription: z.string().max(100).optional().describe('AI 역할 설명'),
});

/** 인간 담당자 하위 단계 */
const HumanDrilldownStepSchema = z.object({
    id: z.string().describe('하위 단계 ID'),
    label: z.string().max(40).describe('단계명 (40자)'),
    description: z.string().max(120).describe('세부 설명 (120자)'),
    duration: DurationSchema.optional().describe('소요 시간'),
    tools: z.array(z.string().max(30)).max(5).optional().describe('사용 도구/시스템'),
    painPoints: z.string().max(100).optional().describe('어려움/비효율 요인 (100자 이내)'),
}).merge(CommonDrilldownFlowFieldsSchema);

const ResourceSchema = z.object({
    type: z.string().optional(),
    title: z.string().max(80).describe('자료 제목'),
    searchQuery: z.string().max(100).optional().describe('검색어'),
    description: z.string().max(120).optional().describe('설명'),
});

const AiImplementationSchema = z.object({
    method: z.string().max(120).describe('AI 처리 방법 (120자)'),
    technology: z.array(z.string().max(30)).max(5).optional().describe('사용 기술/도구'),
    platforms: z.array(z.string().max(30)).max(5).optional().describe('구현 플랫폼'),
    automationLevel: z.enum(['full', 'partial', 'assisted']).optional().describe('자동화 수준'),
});

/** AI 에이전트 하위 단계 */
const AgentDrilldownStepSchema = z.object({
    id: z.string().describe('하위 단계 ID'),
    label: z.string().max(40).describe('단계명 (40자)'),
    description: z.string().max(120).describe('세부 설명 (120자)'),
    duration: DurationSchema.optional().describe('소요 시간'),
    tools: z.array(z.string().max(30)).max(5).optional().describe('사용 AI 도구/프레임워크'),
    aiCapability: z.string().max(100).optional().describe('사용된 AI 역량 (100자 이내)'),
    aiImplementation: AiImplementationSchema.optional().describe('AI 구현 방법 상세'),
    resources: z.array(ResourceSchema).max(3).optional().describe('학습 자료 목록'),
    promptsUsed: z.array(z.string().max(100)).max(3).optional().describe('핵심 프롬프트/명령 예시 1~2개'),
    humanRole: z.string().max(100).optional().describe('인간 개입 방식/검수 역할 (100자 이내)'),
}).merge(CommonDrilldownFlowFieldsSchema);

/** 역량별 시간 절감 상세 */
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

/**
 * 하위 단계 간 연결(subEdges) - subSteps의 id를 그대로 참조한다.
 * decision이 포함된 하위 단계 분해에서 YES/NO 분기와 재시도 순환 경로를 표현하기 위해 사용.
 * 생략하면 subSteps 배열 순서대로 순차 연결하는 기존 방식으로 fallback한다.
 */
const DrilldownSubEdgeSchema = z.object({
    source: z.string().describe('출발 하위 단계 ID (subSteps 중 하나의 id)'),
    target: z.string().describe('도착 하위 단계 ID (subSteps 중 하나의 id, 앞선 단계로 되돌아가는 재시도 경로도 가능)'),
    label: z.string().max(20).optional().describe('연결선 문구 (예: YES, NO)'),
    branchType: BranchTypeSchema.optional().describe("분기 의미 타입. decision 하위 단계에서 나가는 edge는 반드시 지정"),
    condition: z.string().max(60).optional().describe('분기 조건/근거 설명'),
});

/** 인간 단계 분석 응답 */
export const HumanDrilldownResponseSchema = z.object({
    parentNodeId: z.string().max(80).describe('분석 대상 노드 ID'),
    flowType: z.enum(['asis', 'tobe']).describe('플로우 유형'),
    subSteps: z.array(HumanDrilldownStepSchema).max(8).describe('하위 단계 3~5개'),
    subEdges: z.array(DrilldownSubEdgeSchema).max(16).optional()
        .describe('하위 단계 간 연결 구조. subSteps에 decision이 있으면 반드시 지정 (YES/NO 분기 + 되돌아가는 재시도 경로 표현). 단순 순차 진행이면 생략 가능'),
    summary: z.string().max(200).describe('전체 요약 (200자 이내)'),
});

/** AI 에이전트 단계 분석 응답 */
export const AgentDrilldownResponseSchema = z.object({
    parentNodeId: z.string().max(80).describe('분석 대상 노드 ID'),
    flowType: z.literal('tobe').describe('플로우 유형'),
    subSteps: z.array(AgentDrilldownStepSchema).max(8).describe('하위 단계 3~5개'),
    subEdges: z.array(DrilldownSubEdgeSchema).max(16).optional()
        .describe('하위 단계 간 연결 구조. subSteps에 decision이 있으면 반드시 지정 (YES/NO 분기 + 되돌아가는 재시도 경로 표현). 단순 순차 진행이면 생략 가능'),
    summary: z.string().max(200).describe('전체 요약 (200자 이내)'),
    automationOverview: AutomationOverviewSchema.describe('자동화 개요'),
});

export type DrilldownSubEdge = z.infer<typeof DrilldownSubEdgeSchema>;

export type AsIsFlowResponse = z.infer<typeof AsIsFlowResponseSchema>;
export type ToBeFlowResponse = z.infer<typeof ToBeFlowResponseSchema>;
export type ChangeStrategyResponse = z.infer<typeof ChangeStrategyResponseSchema>;

export type DurationUnit = z.infer<typeof DurationUnitEnum>;
export type Duration = z.infer<typeof DurationSchema>;
export type SkillTimeReduction = z.infer<typeof SkillTimeReductionSchema>;
export type AutomationOverview = z.infer<typeof AutomationOverviewSchema>;

export type DrilldownSubStep =
    z.infer<typeof HumanDrilldownStepSchema> & Partial<z.infer<typeof AgentDrilldownStepSchema>>;

export interface DrilldownResponse {
    parentNodeId: string;
    flowType: 'asis' | 'tobe';
    subSteps: DrilldownSubStep[];
    subEdges?: DrilldownSubEdge[];
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
            shape: FlowShapeSchema.describe(SHAPE_FIELD_DESCRIBE_HINT),
            terminalType: z.enum(['start', 'end']).optional(),
            ioType: z.enum(['input', 'output']).optional(),
            stressLevel: z.enum(['low', 'medium', 'high']).optional(),
            collaborationType: z.enum(['copilot', 'monitor', 'autonomous']).optional(),
            agentDescription: z.string().max(100).optional(),
            duration: z.number().int().optional().describe('소요시간 (숫자)'),
            durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']).optional().describe('시간 단위'),
        })
    ).max(10).describe('분할된 노드 4~6개 권장'),
    summary: z.string().max(150).describe('분할 요약 (150자)'),
});

export type NodeSplitResponse = z.infer<typeof NodeSplitResponseSchema>;
