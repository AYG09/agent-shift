import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, NoObjectGeneratedError } from 'ai';
import {
    AsIsFlowResponseSchema,
    ToBeFlowResponseSchema,
    ChangeStrategyResponseSchema,
    DrilldownResponseSchema,
    NodeSplitResponseSchema,
} from '@/lib/ai-schemas';

const isDev = process.env.NODE_ENV === 'development';

function devLog(message: string, ...args: unknown[]) {
    if (!isDev) return;
    console.log(message, ...args);
}

// AI 응답의 숫자 필드를 정규화 (부동소수점 오버플로우 방지)
function normalizeMetrics(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'number') {
        // 매우 긴 소수점 숫자를 반올림
        return Math.round(obj * 100) / 100;
    }
    if (Array.isArray(obj)) {
        return obj.map(normalizeMetrics);
    }
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            result[key] = normalizeMetrics(value);
        }
        return result;
    }
    return obj;
}

// 배열 길이 정규화 (AI가 권장 개수 초과 시 잘라내기)
function normalizeArrayLengths(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
        return obj.slice(0, 10).map(normalizeArrayLengths); // 모든 배열 최대 10개
    }
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            result[key] = normalizeArrayLengths(value);
        }
        return result;
    }
    return obj;
}

// NoObjectGeneratedError에서 raw text 파싱 시도
function tryParseFromError(error: unknown): unknown | null {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
        try {
            const parsed = JSON.parse(error.text);
            devLog('[API Route] Fallback: parsed from error.text');
            return normalizeArrayLengths(parsed);
        } catch {
            devLog('[API Route] Fallback failed: could not parse error.text');
            return null;
        }
    }
    return null;
}

// 그래프 컨텍스트 추출: 인접 노드(predecessors, successors) 정보 생성
interface GraphNode {
    id: string;
    label: string;
    description?: string;
    type: string;
    collaborationType?: string;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
}

interface GraphContext {
    predecessors: GraphNode[];
    successors: GraphNode[];
    position: string; // 예: "2번째 단계 (총 8단계 중)"
}

function extractGraphContext(
    nodeId: string,
    allNodes?: GraphNode[],
    allEdges?: GraphEdge[]
): GraphContext | null {
    if (!allNodes || !allEdges || allNodes.length === 0) {
        return null;
    }

    // 이전 노드들 (이 노드를 target으로 하는 엣지의 source)
    const predecessorIds = allEdges
        .filter(e => e.target === nodeId)
        .map(e => e.source);
    const predecessors = allNodes.filter(n => predecessorIds.includes(n.id));

    // 다음 노드들 (이 노드를 source로 하는 엣지의 target)
    const successorIds = allEdges
        .filter(e => e.source === nodeId)
        .map(e => e.target);
    const successors = allNodes.filter(n => successorIds.includes(n.id));

    // 순서 파악 (간단한 BFS로 시작점부터 위치 계산)
    const nodeIndex = allNodes.findIndex(n => n.id === nodeId);
    const position = `${nodeIndex + 1}번째 단계 (총 ${allNodes.length}단계 중)`;

    return { predecessors, successors, position };
}

function formatGraphContextForPrompt(graphContext: GraphContext | null): string {
    if (!graphContext) {
        return '';
    }

    let result = `\n## 전체 흐름에서의 위치\n`;
    result += `- 현재 위치: ${graphContext.position}\n`;

    if (graphContext.predecessors.length > 0) {
        result += `\n### 이전 단계 (선행 작업)\n`;
        graphContext.predecessors.forEach(p => {
            result += `- **${p.label}** (${p.type}): ${p.description || '설명 없음'}\n`;
        });
    }

    if (graphContext.successors.length > 0) {
        result += `\n### 다음 단계 (후속 작업)\n`;
        graphContext.successors.forEach(s => {
            result += `- **${s.label}** (${s.type}): ${s.description || '설명 없음'}\n`;
        });
    }

    return result;
}

// 프롬프트 템플릿들
function getAsIsPrompt(context: {
    industry: string;
    role: string;
    task: string;
    timeScale: string;
    teamSize?: string;
    tooling?: string;
    painPoints?: string;
}) {
    return `당신은 업무 프로세스 분석 전문가입니다.
다음 업무에 대해 현재(As-Is) 프로세스를 분석하고 플로우차트 노드를 생성해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}
- 업무 주기: ${context.timeScale}
${context.teamSize ? `- 팀 규모: ${context.teamSize}` : ''}
${context.tooling ? `- 현재 사용 도구: ${context.tooling}` : ''}
${context.painPoints ? `- 주요 고충/문제점: ${context.painPoints}` : ''}

## 노드 타입 (표준 도식 도형)
- terminal: 시작/종료 노드 (타원형). terminalType='start' 또는 'end' 설정
- process: 처리/작업 노드 (직사각형). 일반적인 업무 단계
- decision: 판단/분기 노드 (마름모). 조건에 따른 분기점
- io: 입출력 노드 (평행사변형). 데이터 입력/출력. ioType='input' 또는 'output'

## 요구사항
1. 반드시 시작(terminal, terminalType='start')과 종료(terminal, terminalType='end') 노드를 포함하세요.
2. 해당 업무의 수행 단계를 5~8개 노드로 작성하세요.
3. 사용자가 언급한 도구(${context.tooling || '일반 오피스 도구'})를 활용하는 단계를 반영하세요.
4. 사용자가 언급한 고충(${context.painPoints || '없음'})이 발생하는 단계에는 stressLevel을 'high'로 설정하세요.
5. painPoints 배열에 각 노드의 문제점을 분석해주세요.

## 핵심 규칙 (스키마가 강제하지만 참고)
- label: 30자 이내 (예: "데이터 수집")
- description: 60자 이내
- 모든 숫자는 정수만
- metrics: **모든 노드에 필수** { duration: 정수, durationUnit: 'minutes'|'hours'|'days'|'weeks'|'months' }

## 노드 배치 (수직 플로우)
- x=250, y=0부터 120 간격
- 엣지: sourceHandle='bottom', targetHandle='top'`;
}

function getToBePrompt(
    context: {
        industry: string;
        role: string;
        task: string;
        teamSize?: string;
        tooling?: string;
        painPoints?: string;
        platforms?: string[];
    },
    asIsNodes: unknown[],
    scenario: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
) {
    // 사용자 선택 플랫폼 컨텍스트
    const platformsContext = context.platforms && context.platforms.length > 0
        ? `- 사용 AI 플랫폼: ${context.platforms.join(', ')}`
        : '';

    const scenarioGuide = {
        conservative: `## 시나리오: Conservative (보수적)
- AI는 보조 역할만 수행, 인간이 최종 의사결정
- 모든 AI Agent는 collaborationType='monitor' (인간 감독) 또는 'copilot' (협력)
- 자동화 비율: 20~30% 정도
- 고위험/고가치 작업은 반드시 인간이 수행
- AI는 데이터 수집, 초안 작성, 알림 등 보조 업무만`,
        balanced: `## 시나리오: Balanced (균형)
- AI와 인간이 협력하여 업무 수행
- collaborationType 혼합 사용: copilot(주), monitor, autonomous
- 자동화 비율: 40~60%
- 반복적/규칙적 작업은 autonomous로 자동화
- 판단이 필요한 작업은 copilot으로 협력`,
        aggressive: `## 시나리오: Aggressive (공격적)
- AI가 대부분의 업무를 자율적으로 수행
- 대부분의 AI Agent는 collaborationType='autonomous' (독립 수행)
- 자동화 비율: 70~90%
- 인간은 예외 처리, 최종 승인, 전략적 의사결정만 수행
- AI가 전체 워크플로우를 오케스트레이션`,
    };

    return `당신은 AI Agent 활용 업무 자동화 전문가입니다.
현재(As-Is) 프로세스를 분석하고 AI Agent를 활용한 미래(To-Be) 프로세스를 설계해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}
${context.teamSize ? `- 팀 규모: ${context.teamSize}` : ''}
${context.tooling ? `- 현재 사용 도구: ${context.tooling}` : ''}
${context.painPoints ? `- 주요 고충: ${context.painPoints}` : ''}
${platformsContext}
${scenarioGuide[scenario]}

## 현재 As-Is 프로세스
${JSON.stringify(asIsNodes, null, 2)}

## 요구사항
1. 위 시나리오(${scenario})에 맞게 AI Agent를 배치하세요.
2. AI Agent의 협업 유형을 시나리오에 맞게 지정:
   - copilot: 인간과 AI가 협력
   - monitor: 인간이 AI를 감독
   - autonomous: AI가 독립 수행
3. improvements 배열에 원래 노드와 새 노드의 매핑을 포함하세요.

## 핵심 규칙 (스키마가 강제하지만 참고)
- label: 30자 이내 (예: "AI 데이터 수집")
- agentDescription: 100자 이내 (예: "LLM으로 문서 요약 후 인간이 검토")
- description: 60자 이내
- 모든 숫자는 정수만
- metrics: **모든 노드에 필수** { duration: 정수, durationUnit: 'minutes'|'hours'|'days'|'weeks'|'months' }
  - AI 노드: As-Is 대비 대폭 단축된 시간
  - 인간 노드(task/process): 실제 수행에 필요한 시간

## 노드 배치 (수직 플로우)
- x=250, y=0부터 100 간격
- 엣지: sourceHandle='bottom', targetHandle='top'`;
}

function getStrategyPrompt(
    context: { industry: string; role: string; task: string },
    framework: string,
    totalWeeks: number = 12
) {
    const frameworkGuide: Record<string, string> = {
        kotter: 'Kotter의 8단계 변화 관리 (긴급성 조성 → 추진팀 구성 → 비전 수립 → 비전 전파 → 장애물 제거 → 단기 성과 → 변화 가속 → 문화 정착)',
        adkar: 'ADKAR 모델 (Awareness → Desire → Knowledge → Ability → Reinforcement)',
        lewin: 'Lewin의 3단계 모델 (Unfreeze → Change → Refreeze)',
    };

    return `당신은 변화 관리 전문 컨설턴트입니다.
다음 업무의 AI 전환을 위한 변화 관리 전략을 수립해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}

## 적용 프레임워크
${frameworkGuide[framework] || framework}

## 요구사항 (스키마가 길이 강제)
1. **${totalWeeks}주 일정**: 각 단계의 시작/종료 주차 설정
2. 각 단계별 2~3개 액션 (action, rationale, value)
3. 단계별 색상(hex) 지정
4. 핵심 메시지 3~5개
5. 리스크 + 완화 방안 2~3개`;
}

// AS-IS 전용 드릴다운 프롬프트: 인간 작업 과정만 상세 분석
function getHumanDrilldownPrompt(
    node: { id: string; label: string; description?: string; type: string },
    context: { industry: string; role: string; task: string },
    graphContextText: string,
    options: {
        flowType: 'asis' | 'tobe';
        modeTitle: string;
        noAiLine: string;
        graphHint?: string;
        summaryLine: string;
    }
) {
    return `당신은 업무 프로세스 분석 전문가입니다.
다음 프로세스 단계를 **인간이 수행하는 관점**에서 세부적으로 분해해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}  
- 전체 업무: ${context.task}

## 분석 대상 노드
- ID: ${node.id}
- 이름: ${node.label}
- 설명: ${node.description || '없음'}
- 타입: ${node.type}
${graphContextText}
## 중요 지침 ⚠️
이것은 **${options.modeTitle}** 분석입니다.
${options.noAiLine}
- 오직 **인간이 이 작업을 어떻게 수행하는지**만 분석하세요
${options.graphHint || ''}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계: description, duration, tools, painPoints
3. summary: ${options.summaryLine}

## 응답 형식
- flowType: "${options.flowType}"
- aiImplementation, resources 필드는 **생략**`;
}

function getDrilldownPromptAsIs(
    node: { id: string; label: string; description?: string; type: string },
    context: { industry: string; role: string; task: string },
    graphContext: GraphContext | null = null
) {
    const graphContextText = formatGraphContextForPrompt(graphContext);

    return getHumanDrilldownPrompt(node, context, graphContextText, {
        flowType: 'asis',
        modeTitle: 'As-Is (현재 상태)',
        noAiLine: '- AI 자동화, AI 도입, AI 대체 가능성은 **절대 언급하지 마세요**',
        graphHint: graphContext
            ? '- 위의 이전/다음 단계를 참고하여 **흐름에 맞는** 세부 단계를 도출하세요'
            : undefined,
        summaryLine: '전체 과정 요약과 주요 병목점',
    });
}

// TO-BE 전용 드릴다운 프롬프트: AI 자동화 구현 방법 상세 안내
// 단, 노드 타입이 'agent'가 아니면 인간 작업으로 분석
function getDrilldownPromptToBe(
    node: { id: string; label: string; description?: string; type: string; collaborationType?: string; metrics?: { timeMinutes?: number } },
    context: { industry: string; role: string; task: string; platforms?: string[] },
    graphContext: GraphContext | null = null,
    asIsNodes?: GraphNode[]  // AS-IS 원본 노드들 (시간 비교용)
) {
    const graphContextText = formatGraphContextForPrompt(graphContext);
    
    // 사용자 선택 플랫폼 컨텍스트
    const platformsContext = context.platforms && context.platforms.length > 0
        ? `- 사용 AI 플랫폼: ${context.platforms.join(', ')} (이 플랫폼 위주로 tools/platforms 추천)`
        : '';
    
    // AS-IS 노드 정보 포맷팅 (시간 포함)
    const asIsInfo = asIsNodes && asIsNodes.length > 0 
        ? `\n## AS-IS 원본 프로세스 (비교 기준) 📊
아래는 AI 도입 전 인간이 수행하던 단계들입니다. 이 AI가 어떤 단계들을 대체/압축하는지 분석하세요.

${asIsNodes.map(n => {
    const time = (n as { metrics?: { timeMinutes?: number } }).metrics?.timeMinutes;
    const timeInfo = time ? `소요시간: ${time}분 (저역량: ${Math.round(time * 1.5)}분, 중역량: ${time}분, 고역량: ${Math.round(time * 0.7)}분)` : '시간 미정';
    return `- **${n.label}** (${n.type}): ${n.description || '설명 없음'} [${timeInfo}]`;
}).join('\n')}

**역량별 시간 승수 (SKILL_MULTIPLIERS)**:
- 저역량(junior): 기준시간 × 1.5
- 중역량(mid): 기준시간 × 1.0  
- 고역량(senior): 기준시간 × 0.7
`
        : '';
    
    // 노드 타입이 'agent'가 아니면 인간 작업으로 분석 (TO-BE에서도 인간이 수행하는 단계)
    const isHumanTask = node.type !== 'agent';
    
    if (isHumanTask) {
        return getHumanDrilldownPrompt(node, context, graphContextText, {
            flowType: 'tobe',
            modeTitle: 'To-Be 플로우에서 인간이 수행하는 단계',
            noAiLine: '- AI 자동화, AI 도입 가능성은 **언급하지 마세요** (이 단계는 인간 업무로 계획됨)',
            graphHint: graphContext
                ? '- 위의 이전/다음 단계(일부는 AI 에이전트)와의 **연계**를 고려하세요'
                : undefined,
            summaryLine: '전체 과정 요약과 AI 에이전트와의 협업 포인트',
        });
    }
    
    // 노드 타입이 'agent'인 경우: AI 자동화 분석
    return `당신은 AI 자동화 구현 전문가이자 기술 교육자입니다.
다음 프로세스 단계가 AI로 어떻게 자동화되는지 **구체적이고 실용적으로** 설명해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}  
- 전체 업무: ${context.task}
${platformsContext}
## 분석 대상 노드 (AI 자동화 단계)
- ID: ${node.id}
- 이름: ${node.label}
- 설명: ${node.description || '없음'}
- AI 처리 예상 시간: ${node.metrics?.timeMinutes ? `${node.metrics.timeMinutes}분` : '미정'}
- 협업 유형: ${node.collaborationType || 'copilot'} (copilot=인간+AI 협력, autonomous=AI 독립 수행, monitor=인간 감독)
${graphContextText}
${asIsInfo}
## 중요 지침
- AI가 어떻게 이 작업을 수행하는지 **구체적으로** 설명
- 비전문가도 이해할 수 있게 쉽게 설명
${graphContext ? `- 이전/다음 단계와의 데이터 흐름 고려` : ''}
${asIsNodes && asIsNodes.length > 0 ? `- AS-IS 단계 중 이 AI가 대체하는 단계 식별 + 역량별 시간 절감 계산` : ''}

## 요구사항 (스키마가 길이를 강제함)
1. 3~5개 세부 하위 단계 (subSteps)
2. 각 subStep 내부에 aiImplementation 객체 포함
3. tools: 구체적 제품명만 (예: Power Automate, Zapier)
4. automationOverview.skillBasedReduction: 역량별 시간 절감

## JSON 구조 예시
{
  "id": "step1", "label": "단계명", "description": "설명",
  "tools": ["Power Automate"],
  "aiImplementation": { "method": "처리방법", "technology": ["RPA"] }
}

## 응답 형식
- flowType: "tobe"
- subSteps + aiImplementation + resources
- automationOverview.skillBasedReduction 필수`;
}

function getDrilldownPrompt(
    node: { id: string; label: string; description?: string; type: string; collaborationType?: string; metrics?: { timeMinutes?: number } },
    context: { industry: string; role: string; task: string; platforms?: string[] },
    flowType: string,
    allNodes?: GraphNode[],
    allEdges?: GraphEdge[],
    asIsNodes?: GraphNode[]  // AS-IS 원본 노드들 (시간 비교용)
) {
    // 그래프 컨텍스트 추출 (인접 노드 정보)
    const graphContext = extractGraphContext(node.id, allNodes, allEdges);
    
    // flowType에 따라 완전히 다른 프롬프트 반환
    if (flowType === 'tobe' || flowType === 'to-be') {
        return getDrilldownPromptToBe(node, context, graphContext, asIsNodes);
    }
    return getDrilldownPromptAsIs(node, context, graphContext);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, context, asIsNodes, framework, apiKey, node, flowType, scenario } = body;

        // BYOK: 사용자 제공 키 또는 환경 변수 키 사용 (개행 문자 방지를 위해 trim)
        const trimmedApiKey = apiKey?.trim();

        let model;
        if (trimmedApiKey) {
            // 사용자가 제공한 API 키로 새 클라이언트 생성
            const customGoogle = createGoogleGenerativeAI({ apiKey: trimmedApiKey });
            model = customGoogle('gemini-2.5-flash');
            devLog('[API Route] Using user-provided API key');
        } else {
            // 환경 변수의 기본 키 사용 (환경 변수도 trim)
            const envApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
            if (envApiKey) {
                const customGoogle = createGoogleGenerativeAI({ apiKey: envApiKey });
                model = customGoogle('gemini-2.5-flash');
                devLog('[API Route] Using env API key (trimmed)');
            } else {
                model = google('gemini-2.5-flash');
                devLog('[API Route] Using default google() - no API key found');
            }
        }

        let schema;
        let prompt;

        switch (action) {
            case 'generateAsIsFlow': {
                if (!context) {
                    return NextResponse.json({ error: 'context is required' }, { status: 400 });
                }
                schema = AsIsFlowResponseSchema;
                prompt = getAsIsPrompt(context);
                break;
            }

            case 'generateToBeFlow': {
                if (!context || !asIsNodes) {
                    return NextResponse.json(
                        { error: 'context and asIsNodes are required' },
                        { status: 400 }
                    );
                }
                schema = ToBeFlowResponseSchema;
                prompt = getToBePrompt(context, asIsNodes, scenario || 'balanced');
                break;
            }

            case 'generateChangeStrategy': {
                if (!context || !framework) {
                    return NextResponse.json(
                        { error: 'context and framework are required' },
                        { status: 400 }
                    );
                }
                const totalWeeks = body.totalWeeks || 12;
                schema = ChangeStrategyResponseSchema;
                prompt = getStrategyPrompt(context, framework, totalWeeks);
                break;
            }

            case 'generateDrilldown': {
                if (!context || !node || !flowType) {
                    return NextResponse.json(
                        { error: 'context, node and flowType are required' },
                        { status: 400 }
                    );
                }
                schema = DrilldownResponseSchema;
                // allNodes, allEdges는 선택적 - 전체 플로우 컨텍스트 전달용
                // asIsNodes는 TO-BE 분석 시 시간 비교용
                prompt = getDrilldownPrompt(node, context, flowType, body.allNodes, body.allEdges, body.asIsNodes);
                break;
            }

            case 'generateNodeSplit': {
                if (!context || !node || !flowType) {
                    return NextResponse.json(
                        { error: 'context, node and flowType are required' },
                        { status: 400 }
                    );
                }
                schema = NodeSplitResponseSchema;
                prompt = `당신은 업무 프로세스 분석 전문가입니다.
다음 프로세스 단계를 4~5개의 하위 노드로 분할해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 전체 업무: ${context.task}

## 분할 대상 노드
- 이름: ${node.label}
- 설명: ${node.description || '없음'}
- 현재 타입: ${node.type}
- 현재 소요시간: ${node.metrics?.duration ? `${node.metrics.duration}${node.metrics.durationUnit || 'minutes'}` : '미정'}
- 플로우 종류: ${flowType}

## 요구사항
1. 이 단계를 4~5개의 순차적인 하위 단계로 분할하세요.
2. 각 노드에 고유한 id (sub-1, sub-2 등), label, description을 부여하세요.
3. type은 process(일반 작업), decision(분기점), io(입출력) 중 적절히 선택하세요.
4. 병목이나 어려운 단계는 stressLevel을 'medium' 또는 'high'로 설정하세요.
5. **각 노드에 duration(숫자)과 durationUnit(단위)을 반드시 설정하세요.**
6. summary에 분할 이유와 전체 요약을 작성하세요.`;
                break;
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const { object } = await generateObject({
            model,
            schema,
            prompt,
            maxOutputTokens: 16384, // 실제 필요량 6,000 + 여유분
        });

        // 숫자 필드 + 배열 길이 정규화 후 반환
        const normalizedObject = normalizeArrayLengths(normalizeMetrics(object));
        return NextResponse.json(normalizedObject);
    } catch (error) {
        console.error('AI API Error:', error);
        
        // NoObjectGeneratedError: 스키마 검증 실패 시 raw text에서 파싱 시도
        if (NoObjectGeneratedError.isInstance(error)) {
            const fallbackResult = tryParseFromError(error);
            if (fallbackResult) {
                devLog('[API Route] Using fallback result from error.text');
                return NextResponse.json(fallbackResult);
            }
            return NextResponse.json({ 
                error: 'AI 응답이 스키마와 일치하지 않습니다. 다시 시도해주세요.' 
            }, { status: 500 });
        }
        
        const errorMessage =
            error instanceof Error ? error.message : 'AI 생성 중 오류가 발생했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
