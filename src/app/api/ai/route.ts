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

## 중요: description 필드 필수 작성
각 노드의 description 필드에 반드시 구체적인 활동, 소요 시간, 사용 도구를 포함하세요.

## 중요: metrics 필드 필수 작성 (⚠️ 모든 숫자는 소수점 없는 정수만!)
각 process/io 노드에 다음 metrics를 반드시 포함하세요:
- timeMinutes: 예상 소요 시간 (분 단위, 정수만 예: 30) - ⚠️ 모든 노드에 필수!

## 중요: 노드 및 엣지 배치 규칙 (⬇️ 수직 플로우)
- 모든 노드의 x는 250, y는 0부터 120 간격으로 배치하세요.
- 엣지(edges)는 반드시 sourceHandle='bottom', targetHandle='top' 으로 설정하세요.
- 예시: { "id": "e1", "source": "node1", "target": "node2", "sourceHandle": "bottom", "targetHandle": "top" }`;
}

function getToBePrompt(
    context: {
        industry: string;
        role: string;
        task: string;
        teamSize?: string;
        tooling?: string;
        painPoints?: string;
    },
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
모든 process/io/agent 노드에 다음 metrics를 반드시 포함하세요:
- timeMinutes: 예상 소요 시간 (분 단위, 정수만 예: 10) - ⚠️ 모든 노드에 필수!

## 중요: 노드 및 엣지 배치 규칙 (⬇️ 수직 플로우)
- 모든 노드의 x는 250, y는 0부터 100 간격으로 배치하세요.
- 엣지(edges)는 반드시 sourceHandle='bottom', targetHandle='top' 으로 설정하세요.
- 예시: { "id": "e1", "source": "node1", "target": "node2", "sourceHandle": "bottom", "targetHandle": "top" }`;
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

## 요구사항
1. **${totalWeeks}주 일정**으로 각 단계의 기간과 시작/종료 주차를 설정하세요.
2. 각 단계별 2~3개의 구체적인 액션 아이템을 작성하세요.
3. 단계별로 시각적으로 구분되는 색상(hex)을 지정하세요.
4. 핵심 커뮤니케이션 메시지를 3~5개 제시하세요.
5. 예상 리스크와 완화 방안을 2~3개 제시하세요.

## 중요: 액션 아이템 상세 설명 ⚠️
각 액션 아이템은 반드시 다음 형식으로 작성하세요:
- **action**: 구체적인 활동 내용
- **rationale**: 왜 이 활동이 필요한지 (1-2문장)
- **value**: 이 활동이 제공하는 가치와 효과 (1-2문장)

예시:
{
  "action": "AI 시스템 도입 설명회 개최",
  "rationale": "변화의 필요성과 배경을 명확히 전달하여 구성원의 이해도를 높이기 위함",
  "value": "불확실성으로 인한 저항을 줄이고, 변화에 대한 수용도를 높임"
}`;
}

// AS-IS 전용 드릴다운 프롬프트: 인간 작업 과정만 상세 분석
function getDrilldownPromptAsIs(
    node: { id: string; label: string; description?: string; type: string },
    context: { industry: string; role: string; task: string },
    graphContext: GraphContext | null = null
) {
    const graphContextText = formatGraphContextForPrompt(graphContext);
    
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
이것은 **As-Is (현재 상태)** 분석입니다.
- AI 자동화, AI 도입, AI 대체 가능성은 **절대 언급하지 마세요**
- 오직 **인간이 현재 이 작업을 어떻게 수행하는지**만 분석하세요
${graphContext ? `- 위의 이전/다음 단계를 참고하여 **흐름에 맞는** 세부 단계를 도출하세요` : ''}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계에 대해:
   - **description**: 담당자가 수행하는 구체적인 활동 (2~3문장)
   - **duration**: 예상 소요 시간
   - **tools**: 사용되는 도구 (엑셀, 이메일, 워드 등)
   - **painPoints**: 이 단계에서 겪는 어려움, 비효율, 실수 가능성 (1~2문장)
3. **summary**: 전체 과정 요약과 주요 병목점

## 응답 형식
- flowType: "asis"
- subSteps 배열에 각 하위 단계
- aiImplementation, resources 필드는 **생략** (null 또는 undefined)`;
}

// TO-BE 전용 드릴다운 프롬프트: AI 자동화 구현 방법 상세 안내
// 단, 노드 타입이 'agent'가 아니면 인간 작업으로 분석
function getDrilldownPromptToBe(
    node: { id: string; label: string; description?: string; type: string; collaborationType?: string; metrics?: { timeMinutes?: number } },
    context: { industry: string; role: string; task: string },
    graphContext: GraphContext | null = null,
    asIsNodes?: GraphNode[]  // AS-IS 원본 노드들 (시간 비교용)
) {
    const graphContextText = formatGraphContextForPrompt(graphContext);
    
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
        // TO-BE 플로우에서 인간이 수행하는 단계 (task, process, decision 등)
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
이것은 **To-Be 플로우에서 인간이 수행하는 단계**입니다.
- 이 노드는 AI가 아닌 **인간 담당자**가 수행합니다
- AI 자동화, AI 도입 가능성은 **언급하지 마세요** (이 단계는 인간 업무로 계획됨)
- 오직 **인간이 이 작업을 어떻게 수행하는지**만 분석하세요
${graphContext ? `- 위의 이전/다음 단계(일부는 AI 에이전트)와의 **연계**를 고려하세요` : ''}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계에 대해:
   - **description**: 담당자가 수행하는 구체적인 활동 (2~3문장)
   - **duration**: 예상 소요 시간
   - **tools**: 사용되는 도구 (엑셀, 이메일, 워드 등)
   - **painPoints**: 이 단계에서 겪는 어려움, 비효율, 실수 가능성 (1~2문장)
3. **summary**: 전체 과정 요약과 AI 에이전트와의 협업 포인트

## 응답 형식
- flowType: "tobe"
- subSteps 배열에 각 하위 단계
- aiImplementation, resources 필드는 **생략** (null 또는 undefined)`;
    }
    
    // 노드 타입이 'agent'인 경우: AI 자동화 분석
    return `당신은 AI 자동화 구현 전문가이자 기술 교육자입니다.
다음 프로세스 단계가 AI로 어떻게 자동화되는지 **구체적이고 실용적으로** 설명해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}  
- 전체 업무: ${context.task}

## 분석 대상 노드 (AI 자동화 단계)
- ID: ${node.id}
- 이름: ${node.label}
- 설명: ${node.description || '없음'}
- AI 처리 예상 시간: ${node.metrics?.timeMinutes ? `${node.metrics.timeMinutes}분` : '미정'}
- 협업 유형: ${node.collaborationType || 'copilot'} (copilot=인간+AI 협력, autonomous=AI 독립 수행, monitor=인간 감독)
${graphContextText}
${asIsInfo}
## 중요 지침 ⚠️
이것은 **To-Be (AI 도입 후)** 분석입니다.
- 이 단계는 이미 AI가 처리하는 것으로 계획되어 있습니다
- **AI가 구체적으로 어떻게 이 작업을 수행하는지** 설명하세요
- 비전문가도 이해할 수 있게 쉽게 설명하세요
- 실제로 구현 가능한 방법을 제시하세요
${graphContext ? `- 위의 이전/다음 단계와의 **데이터 흐름**을 고려하세요` : ''}
${asIsNodes && asIsNodes.length > 0 ? `- **반드시** 위 AS-IS 단계들 중 이 AI가 대체하는 단계들을 식별하고, 역량별 시간 절감을 계산하세요!` : ''}

## 요구사항
1. 이 단계를 **3~5개**의 세부 하위 단계로 분해하세요. (**최대 5개, 절대 초과 금지!**)

2. ⚠️ **매우 중요: JSON 구조를 정확히 따르세요!**
   - aiImplementation은 각 subStep **내부의 객체**입니다
   - aiImplementation을 **별도의 subStep으로 만들지 마세요!**
   
   **올바른 구조 예시 (subSteps 배열 내 각 항목):**
   {
     "id": "step1",
     "label": "단계 이름",
     "description": "설명...",
     "duration": "30초",
     "tools": ["Power Automate"],
     "aiImplementation": { ← 이것은 subStep 내부의 객체!
       "method": "AI 처리 방법",
       "technology": ["RPA", "NLP"],
       "platforms": ["Microsoft 365"],
       "automationLevel": "full"
     },
     "resources": [{"type": "docs", "title": "제목", "url": "검색키워드"}]
   }

3. 각 하위 단계의 필드 (**⚠️ 길이 제한 엄격 준수!**):
   - **id**: 고유 ID (예: "node1_1")
   - **label**: 단계 이름 (**50자 이내**, 간결하게!)
   - **description**: AI 작업 설명 (**200자 이내**, 핵심만!)
   - **duration**: 처리 시간 (예: "30초", "2분")
   - **tools**: AI 도구 (**최대 3개만!**, 예: ["Power Automate", "Python"])
   - **aiImplementation**: (객체)
     - method: AI 처리 방법 (**200자 이내**)
     - technology: 기술 (**최대 3개**, 예: ["RPA", "NLP"])
     - platforms: 플랫폼 (**최대 2개**)
     - automationLevel: "full" | "partial" | "assisted"
   - **resources**: 학습 자료 (**최대 2개만!**)
     - type: "youtube" | "docs" | "article" | "tutorial"
     - title: 자료 제목 (**50자 이내**)
     - url: **검색 키워드만! 30자 이내** (예: "Power Automate RPA")
     - description: 설명 (**100자 이내**)

4. **summary**: 효율성 요약 (**300자 이내**, 핵심만!)
5. **automationOverview**: 자동화 개요 (**⚠️ 필수!**)
   - **replacedAsIsSteps**: 이 AI가 대체/압축하는 AS-IS 단계 이름들 (최대 5개)
   - **skillBasedReduction** (**필수!**): 역량별 시간 절감 분석
     - asIsTotal: AS-IS 대체 단계들의 총 소요 시간(분, 중역량 기준)
     - junior: "90분→5분 (94% 절감)" 형식 (**80자 이내**)
     - mid: "60분→5분 (92% 절감)" 형식 (**80자 이내**)
     - senior: "42분→5분 (88% 절감)" 형식 (**80자 이내**)
   - totalTimeReduction: 전체 요약 (**⚠️ 50자 이내 필수!**, 예: "저역량 94%/중역량 92%/고역량 88% 절감" - 이런 짧은 형식만!)
   - keyBenefits: 핵심 이점 3가지 (각 **200자 이내**)
   - implementationTips: 실무 구현 시 유의사항 2~3가지 (각 **200자 이내**)

⚠️ **중요: 반복 금지!** 같은 내용을 반복하거나 "데이터 기반으로..." 같은 문구를 여러 번 쓰지 마세요.
모든 필드는 **간결하고 실용적**으로 작성하세요. 토큰 제한에 도달하지 않도록 핵심만 포함!

## 실제 기업 AI 도구 예시 (참고)
- **Microsoft 365 Copilot**: Word/Excel/Outlook/Teams에서 AI 지원
- **Power Automate**: 워크플로우 자동화, AI Builder 포함
- **Google Workspace + Gemini**: 문서/이메일/스프레드시트 AI 지원
- **Zapier + AI**: 앱 간 자동화 + AI 처리
- **ChatGPT API / Claude API**: 커스텀 AI 에이전트 구축

## 응답 형식
- flowType: "tobe"
- subSteps 배열에 각 하위 단계 (aiImplementation, resources 필수!)
- painPoints 필드는 **생략**
- automationOverview.skillBasedReduction은 **필수!**`;
}

function getDrilldownPrompt(
    node: { id: string; label: string; description?: string; type: string; collaborationType?: string; metrics?: { timeMinutes?: number } },
    context: { industry: string; role: string; task: string },
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

        // 디버깅: 환경 변수 상태 확인
        const rawEnvKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        console.log('[API Route] Debug - Raw env key exists:', !!rawEnvKey);
        console.log('[API Route] Debug - Raw env key length:', rawEnvKey?.length);
        console.log('[API Route] Debug - Raw env key first 10 chars:', rawEnvKey?.substring(0, 10));
        console.log(
            '[API Route] Debug - Raw env key last 10 chars:',
            rawEnvKey?.substring(rawEnvKey?.length - 10)
        );
        console.log('[API Route] Debug - User provided key exists:', !!trimmedApiKey);

        let model;
        if (trimmedApiKey) {
            // 사용자가 제공한 API 키로 새 클라이언트 생성
            const customGoogle = createGoogleGenerativeAI({ apiKey: trimmedApiKey });
            model = customGoogle('gemini-2.5-flash');
            console.log('[API Route] Using user-provided API key');
        } else {
            // 환경 변수의 기본 키 사용 (환경 변수도 trim)
            const envApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
            console.log('[API Route] Debug - Trimmed env key length:', envApiKey?.length);
            if (envApiKey) {
                const customGoogle = createGoogleGenerativeAI({ apiKey: envApiKey });
                model = customGoogle('gemini-2.5-flash');
                console.log('[API Route] Using env API key (trimmed)');
            } else {
                model = google('gemini-2.5-flash');
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
                    return NextResponse.json(
                        { error: 'context and asIsNodes are required' },
                        { status: 400 }
                    );
                }
                schema = ToBeFlowResponseSchema;
                prompt = getToBePrompt(context, asIsNodes, scenario || 'balanced');
                break;

            case 'generateChangeStrategy':
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

            case 'generateDrilldown':
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

            case 'generateNodeSplit':
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
            maxOutputTokens: 8192, // Gemini 2.5 Flash 지원 (최대 65535)
        });

        // 숫자 필드 정규화 후 반환
        const normalizedObject = normalizeMetrics(object);
        return NextResponse.json(normalizedObject);
    } catch (error) {
        console.error('AI API Error:', error);
        
        // finishReason: 'length' 에러 특별 처리
        if (error instanceof Error && error.message.includes('No object generated')) {
            return NextResponse.json({ 
                error: 'AI 응답이 너무 길어 잘렸습니다. 다시 시도해주세요.' 
            }, { status: 500 });
        }
        
        const errorMessage =
            error instanceof Error ? error.message : 'AI 생성 중 오류가 발생했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
