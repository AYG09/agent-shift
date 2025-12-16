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
${asIsNodes.map((n) => `- ${n.label}: ${n.description || ''} (스트레스: ${n.stressLevel || 'low'})`).join('\n')}

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

// 변화 관리 전략 생성 (Schein의 8가지 접근방법 통합)
export async function generateChangeStrategy(
    context: WorkContext,
    framework: 'kotter' | 'adkar' | 'lewin'
): Promise<ChangeStrategyResponse> {
    
    // 프레임워크별 상세 가이드
    const frameworkPrompts = {
        kotter: `## Kotter의 8단계 변화 관리 모델 (John Kotter, 1996)

각 단계는 순차적으로 진행되며, 이전 단계의 성공이 다음 단계의 기반이 됩니다.

1. **긴급성 조성 (Create Urgency)**: 현재 상태 유지의 위험성 인식, 변화의 필요성 공감
2. **추진팀 구성 (Form Powerful Coalition)**: 변화를 이끌 영향력 있는 팀 구성
3. **비전 수립 (Create Vision)**: 명확하고 설득력 있는 미래 상태 정의
4. **비전 전파 (Communicate Vision)**: 전 조직에 비전과 전략 소통
5. **장애물 제거 (Remove Obstacles)**: 변화를 방해하는 구조, 시스템, 저항 제거
6. **단기 성과 (Create Short-term Wins)**: 가시적인 초기 성과로 모멘텀 확보
7. **변화 가속 (Build on Change)**: 성과를 바탕으로 더 큰 변화 추진
8. **문화 정착 (Anchor Changes)**: 새로운 방식을 조직 문화로 내재화`,

        adkar: `## ADKAR 모델 (Prosci, Jeff Hiatt)

개인 수준의 변화에 초점을 맞춘 모델로, 각 개인이 변화를 수용하기 위해 거쳐야 하는 5단계입니다.

1. **Awareness (인식)**: 변화의 필요성 인식 - "왜 변화해야 하는가?"
2. **Desire (욕구)**: 변화에 참여하고 지지하려는 의지 - "나도 변화하고 싶다"
3. **Knowledge (지식)**: 어떻게 변화할지에 대한 지식 - "어떻게 해야 하는가?"
4. **Ability (능력)**: 새로운 기술과 행동을 실행하는 능력 - "할 수 있다"
5. **Reinforcement (강화)**: 변화를 지속시키는 강화 - "계속 유지하겠다"

각 단계에서 개인의 심리적 저항과 지원 방법을 고려하세요.`,

        lewin: `## Lewin의 3단계 변화 모델 + Schein의 심리적 안전 프레임워크

Kurt Lewin의 3단계 모델을 Edgar Schein이 발전시킨 심리적 관점으로 확장합니다.
(참고: 조직문화와 리더십, Schein, 2017)

### 핵심 개념: 생존불안 vs 학습불안

**생존불안 (Survival Anxiety)**: 변화하지 않으면 위험하다는 인식
- 이것을 높여야 변화 동기가 생김
- 단, 과도하면 방어기제 발동

**학습불안 (Learning Anxiety)**: 새로운 것을 배우는 두려움
- 무능력해 보일까 봐
- 정체성을 잃을까 봐
- 그룹에서 배제될까 봐

**변화 공식**: 학습불안 < 생존불안 (학습불안을 낮추는 것이 핵심)

### Schein의 8가지 학습불안 감소 방법

1. **설득력 있는 긍정적 비전 제시**: 변화 후 더 나은 상태를 구체적으로 보여줌
2. **공식적 교육 제공**: 새로운 기술/지식에 대한 체계적 교육
3. **학습자의 교육 과정 참여**: 스스로 학습 방법을 설계하게 함
4. **비공식 가족 그룹 교육**: 팀 단위로 함께 배우고 지원
5. **연습 기회, 코치, 피드백**: 안전한 환경에서 시행착오 허용
6. **긍정적 역할 모델**: 변화를 성공적으로 수용한 사례 제시
7. **지원 그룹**: 어려움을 나눌 수 있는 동료 네트워크
8. **일관된 시스템과 구조**: 보상, 평가, 프로세스의 일관성

### 3단계 적용
- **Unfreeze (해빙)**: 생존불안 인식 + 심리적 안전감 조성
- **Change (변화)**: 8가지 방법으로 학습불안 감소, 새로운 방식 학습
- **Refreeze (재동결)**: 새로운 방식의 정착과 강화`
    };

    const basePrompt = `당신은 조직변화 전문 컨설턴트입니다. 변화관리 이론에 정통합니다.

다음 업무의 AI 전환을 위한 변화 관리 전략을 수립해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}
- 업무명: ${context.task}
${context.timeScale ? `- 업무 주기: ${context.timeScale}` : ''}

${frameworkPrompts[framework]}

## 요구사항

### 1. 실행 로드맵 (phases)
- 12주 일정으로 각 단계의 기간과 시작/종료 주차를 설정
- 각 단계별 3~4개의 구체적인 액션 아이템 작성
- 단계별로 시각적으로 구분되는 색상(hex) 지정

### 2. 핵심 메시지 (keyMessages)
- 변화의 필요성과 비전을 전달하는 핵심 커뮤니케이션 메시지 5개

### 3. 리스크 관리 (riskFactors)
- 예상 리스크와 완화 방안 3개`;

    // Lewin 모델 선택 시 Schein 관련 필드 추가 요청
    const scheinAddition = framework === 'lewin' ? `

### 4. 생존불안 분석 (survivalAnxiety)
- 이 업무에서 변화하지 않으면 발생할 위험을 구체적으로 기술
- 생존불안을 높이는 트리거 3~4개 제시

### 5. 학습불안 분석 (learningAnxiety)
- AI 전환 시 구성원들이 느낄 두려움 기술
- 학습불안의 구체적 원인(barriers) 3~4개 제시

### 6. Schein의 8가지 접근방법 (scheinApproaches)
- 8가지 학습불안 감소 방법 각각에 대해:
  - 이 업무에 맞는 구체적 적용 방법 (description)
  - 실행 가능한 액션 아이템 2~3개 (actions)` : '';

    const prompt = basePrompt + scheinAddition;

    const { object } = await generateObject({
        model,
        schema: ChangeStrategyResponseSchema,
        prompt,
    });

    return object;
}
