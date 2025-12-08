import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import {
    AsIsFlowResponseSchema,
    ToBeFlowResponseSchema,
    ChangeStrategyResponseSchema,
    DrilldownResponseSchema,
    NodeSplitResponseSchema,
} from '@/lib/ai-schemas';

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

## 중요: description 필드 필수 작성
각 노드의 description 필드에 반드시 구체적인 활동, 소요 시간, 사용 도구를 포함하세요.

## 중요: metrics 필드 필수 작성 (⚠️ 모든 숫자는 소수점 없는 정수만!)
각 process/io 노드에 다음 metrics를 포함하세요 (반드시 정수로 작성):
- timeMinutes: 예상 소요 시간 (분 단위, 정수만 예: 30)
- costKRW: 예상 비용 (원 단위, 정수만 예: 15000)
- peopleCount: 관련 인원 수 (정수만 예: 2)
- errorRate: 예상 오류율 (%, 정수만 예: 5)

노드 배치: 모든 노드의 x는 250, y는 0부터 120 간격으로 배치하세요.`;
}

function getToBePrompt(
    context: { industry: string; role: string; task: string; teamSize?: string; tooling?: string; painPoints?: string },
    asIsNodes: unknown[],
    scenario: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
) {
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

${scenarioGuide[scenario]}

## 현재 As-Is 프로세스
${JSON.stringify(asIsNodes, null, 2)}

## 요구사항
1. 위 시나리오(${scenario})에 맞게 AI Agent를 배치하세요.
2. AI Agent의 협업 유형을 시나리오에 맞게 지정:
   - copilot: 인간과 AI가 협력
   - monitor: 인간이 AI를 감독
   - autonomous: AI가 독립 수행
3. 각 개선사항에 대해 예상 시간 절감률을 제시하세요.
4. improvements 배열에 원래 노드와 새 노드의 매핑을 포함하세요.

## 중요: agentDescription 필드 필수 작성
각 AI Agent 노드(type='agent')의 agentDescription 필드에:
- 구체적 수행 작업 (2~3문장)
- 사용 AI 기술 (LLM, RPA, 컴퓨터 비전 등)
- 인간과의 협업 방식

## 중요: metrics 필드 필수 작성 (⚠️ 모든 숫자는 소수점 없는 정수만!)
모든 process/io/agent 노드에 다음 metrics를 포함하세요 (반드시 정수로 작성):
- timeMinutes: 예상 소요 시간 (분 단위, 정수만 예: 10)
- costKRW: 예상 비용 (원 단위, 정수만 예: 5000)
- peopleCount: 관련 인원 수 (정수만 예: 1)
- errorRate: 예상 오류율 (%, 정수만 예: 2)

노드 배치: 모든 노드의 x는 250, y는 0부터 100 간격으로 배치하세요.`;
}

function getStrategyPrompt(context: { industry: string; role: string; task: string }, framework: string) {
    const frameworkGuide: Record<string, string> = {
        kotter: "Kotter의 8단계 변화 관리 (긴급성 조성 → 추진팀 구성 → 비전 수립 → 비전 전파 → 장애물 제거 → 단기 성과 → 변화 가속 → 문화 정착)",
        adkar: "ADKAR 모델 (Awareness → Desire → Knowledge → Ability → Reinforcement)",
        lewin: "Lewin의 3단계 모델 (Unfreeze → Change → Refreeze)"
    };

    return `당신은 변화 관리 전문 컨설턴트입니다.
다음 업무의 AI 전환을 위한 변화 관리 전략을 수립해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}

## 적용 프레임워크
${frameworkGuide[framework] || framework}

## 요구사항
1. 12주 일정으로 각 단계의 기간과 시작/종료 주차를 설정하세요.
2. 각 단계별 2~3개의 구체적인 액션 아이템을 작성하세요.
3. 단계별로 시각적으로 구분되는 색상(hex)을 지정하세요.
4. 핵심 커뮤니케이션 메시지를 3~5개 제시하세요.
5. 예상 리스크와 완화 방안을 2~3개 제시하세요.`;
}

function getDrilldownPrompt(node: { id: string; label: string; description?: string; type: string }, context: { industry: string; role: string; task: string }, flowType: string) {
    return `당신은 업무 프로세스 세분화 전문가입니다.
다음 프로세스 단계를 더 세부적인 하위 단계로 분해해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}  
- 전체 업무: ${context.task}

## 분석 대상 노드
- ID: ${node.id}
- 이름: ${node.label}
- 설명: ${node.description || '없음'}
- 타입: ${node.type}
- 플로우 종류: ${flowType} (As-Is 또는 To-Be)

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계에 대해:
   - 구체적인 활동 description (2~3문장)
   - 예상 소요 시간 duration
   - 사용되는 도구 tools 배열
   - AI 자동화 가능성 aiPotential (${flowType === 'to-be' ? '현재 AI가 어떻게 처리하는지' : 'AI로 대체 가능한지 여부와 방법'})
3. summary에 전체 요약을 작성하세요.`;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, context, asIsNodes, framework, apiKey, node, flowType, scenario } = body;

        // BYOK: 사용자 제공 키 또는 환경 변수 키 사용 (개행 문자 방지를 위해 trim)
        const trimmedApiKey = apiKey?.trim();

        // 디버깅: 환경 변수 상태 확인
        const rawEnvKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        console.log('[API Route] Debug - Raw env key exists:', !!rawEnvKey);
        console.log('[API Route] Debug - Raw env key length:', rawEnvKey?.length);
        console.log('[API Route] Debug - Raw env key first 10 chars:', rawEnvKey?.substring(0, 10));
        console.log('[API Route] Debug - Raw env key last 10 chars:', rawEnvKey?.substring(rawEnvKey?.length - 10));
        console.log('[API Route] Debug - User provided key exists:', !!trimmedApiKey);

        let model;
        if (trimmedApiKey) {
            // 사용자가 제공한 API 키로 새 클라이언트 생성
            const customGoogle = createGoogleGenerativeAI({ apiKey: trimmedApiKey });
            model = customGoogle('gemini-2.0-flash');
            console.log('[API Route] Using user-provided API key');
        } else {
            // 환경 변수의 기본 키 사용 (환경 변수도 trim)
            const envApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
            console.log('[API Route] Debug - Trimmed env key length:', envApiKey?.length);
            if (envApiKey) {
                const customGoogle = createGoogleGenerativeAI({ apiKey: envApiKey });
                model = customGoogle('gemini-2.0-flash');
                console.log('[API Route] Using env API key (trimmed)');
            } else {
                model = google('gemini-2.0-flash');
                console.log('[API Route] Using default google() - no API key found!');
            }
        }

        let schema;
        let prompt;

        switch (action) {
            case 'generateAsIsFlow':
                if (!context) {
                    return NextResponse.json({ error: 'context is required' }, { status: 400 });
                }
                schema = AsIsFlowResponseSchema;
                prompt = getAsIsPrompt(context);
                break;

            case 'generateToBeFlow':
                if (!context || !asIsNodes) {
                    return NextResponse.json({ error: 'context and asIsNodes are required' }, { status: 400 });
                }
                schema = ToBeFlowResponseSchema;
                prompt = getToBePrompt(context, asIsNodes, scenario || 'balanced');
                break;

            case 'generateChangeStrategy':
                if (!context || !framework) {
                    return NextResponse.json({ error: 'context and framework are required' }, { status: 400 });
                }
                schema = ChangeStrategyResponseSchema;
                prompt = getStrategyPrompt(context, framework);
                break;

            case 'generateDrilldown':
                if (!context || !node || !flowType) {
                    return NextResponse.json({ error: 'context, node and flowType are required' }, { status: 400 });
                }
                schema = DrilldownResponseSchema;
                prompt = getDrilldownPrompt(node, context, flowType);
                break;

            case 'generateNodeSplit':
                if (!context || !node || !flowType) {
                    return NextResponse.json({ error: 'context, node and flowType are required' }, { status: 400 });
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
- 플로우 종류: ${flowType}

## 요구사항
1. 이 단계를 4~5개의 순차적인 하위 단계로 분할하세요.
2. 각 노드에 고유한 id (sub-1, sub-2 등), label, description을 부여하세요.
3. type은 process(일반 작업), decision(분기점), io(입출력) 중 적절히 선택하세요.
4. 병목이나 어려운 단계는 stressLevel을 'medium' 또는 'high'로 설정하세요.
5. summary에 분할 이유와 전체 요약을 작성하세요.`;
                break;

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const { object } = await generateObject({
            model,
            schema,
            prompt,
        });

        // 숫자 필드 정규화 후 반환
        const normalizedObject = normalizeMetrics(object);
        return NextResponse.json(normalizedObject);
    } catch (error) {
        console.error('AI API Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'AI 생성 중 오류가 발생했습니다.';
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
