import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import {
    AsIsFlowResponseSchema,
    ToBeFlowResponseSchema,
    ChangeStrategyResponseSchema,
    type AsIsFlowResponse,
    type ToBeFlowResponse,
    type ChangeStrategyResponse,
} from './ai-schemas';

// Gemini 모델 설정
const model = google('gemini-2.0-flash');

// 업무 맥락 타입
export interface WorkContext {
    industry: string;
    role: string;
    task: string;
    timeScale: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

// As-Is 플로우 생성
export async function generateAsIsFlow(context: WorkContext): Promise<AsIsFlowResponse> {
    const prompt = `당신은 업무 프로세스 분석 전문가입니다.
다음 업무에 대해 현재(As-Is) 프로세스를 분석하고 플로우차트 노드를 생성해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}
- 업무 주기: ${context.timeScale}

## 요구사항
1. 해당 업무의 일반적인 수행 단계를 5~8개 노드로 작성하세요.
2. 각 노드는 업무 흐름에 맞게 적절한 y 좌표를 부여하세요 (100 간격).
3. 병목 지점이나 반복 작업에는 stressLevel을 'medium' 또는 'high'로 설정하세요.
4. type 필드: 일반 업무='task', 분기점='decision', 하위 프로세스='subprocess'
5. painPoints 배열에 각 노드의 문제점을 분석해주세요.

노드 배치: 모든 노드의 x는 250, y는 0부터 100 간격으로 배치하세요.`;

    const { object } = await generateObject({
        model,
        schema: AsIsFlowResponseSchema,
        prompt,
    });

    return object;
}

// To-Be 플로우 생성
export async function generateToBeFlow(
    context: WorkContext,
    asIsNodes: AsIsFlowResponse['nodes']
): Promise<ToBeFlowResponse> {
    const prompt = `당신은 AI Agent 활용 업무 자동화 전문가입니다.
현재(As-Is) 프로세스를 분석하고 AI Agent를 활용한 미래(To-Be) 프로세스를 설계해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}

## 현재 As-Is 프로세스
${asIsNodes.map(n => `- ${n.label}: ${n.description || ''} (스트레스: ${n.stressLevel || 'low'})`).join('\n')}

## 요구사항
1. 반복적이거나 자동화 가능한 작업은 AI Agent 노드(type='agent')로 대체하세요.
2. AI Agent의 협업 유형을 지정하세요:
   - copilot: 인간과 AI가 협력
   - monitor: 인간이 AI를 감독
   - autonomous: AI가 독립 수행
3. 각 개선사항에 대해 예상 시간 절감률을 제시하세요.
4. improvements 배열에 원래 노드와 새 노드의 매핑을 포함하세요.

노드 배치: 모든 노드의 x는 250, y는 0부터 100 간격으로 배치하세요.`;

    const { object } = await generateObject({
        model,
        schema: ToBeFlowResponseSchema,
        prompt,
    });

    return object;
}

// 변화 관리 전략 생성
export async function generateChangeStrategy(
    context: WorkContext,
    framework: 'kotter' | 'adkar' | 'lewin'
): Promise<ChangeStrategyResponse> {
    const frameworkGuide = {
        kotter: "Kotter의 8단계 변화 관리 (긴급성 조성 → 추진팀 구성 → 비전 수립 → 비전 전파 → 장애물 제거 → 단기 성과 → 변화 가속 → 문화 정착)",
        adkar: "ADKAR 모델 (Awareness → Desire → Knowledge → Ability → Reinforcement)",
        lewin: "Lewin의 3단계 모델 (Unfreeze → Change → Refreeze)"
    };

    const prompt = `당신은 변화 관리 전문 컨설턴트입니다.
다음 업무의 AI 전환을 위한 변화 관리 전략을 수립해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}

## 적용 프레임워크
${frameworkGuide[framework]}

## 요구사항
1. 12주 일정으로 각 단계의 기간과 시작/종료 주차를 설정하세요.
2. 각 단계별 2~3개의 구체적인 액션 아이템을 작성하세요.
3. 단계별로 시각적으로 구분되는 색상(hex)을 지정하세요.
4. 핵심 커뮤니케이션 메시지를 3~5개 제시하세요.
5. 예상 리스크와 완화 방안을 2~3개 제시하세요.`;

    const { object } = await generateObject({
        model,
        schema: ChangeStrategyResponseSchema,
        prompt,
    });

    return object;
}
