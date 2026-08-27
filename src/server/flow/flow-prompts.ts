/**
 * /flow의 As-Is/To-Be/드릴다운/노드-분할 프롬프트 빌더.
 *
 * 원래 src/app/api/ai/route.ts에 있었다 — Next의 route 타입 검증기가 route handler가
 * 아닌 export(GET/POST 등 외 심볼)를 거부해 `npx next build --webpack`이
 * ".next/types/app/api/ai/route.ts: Property 'getAsIsPrompt' is incompatible with
 * index signature" 로 실패했기 때문에 이 모듈로 무동작변경 이동했다(W4-05). route.ts는
 * 이제 여기서 import해 handler 안에서만 쓰고, handler 외 심볼을 export하지 않는다.
 *
 * prompt 문자열·동작·스키마는 이동 전과 한 글자도 다르지 않다 — tests/flow-branches.test.ts가
 * 그 무회귀를 증명한다.
 */
import { FULL_SHAPE_SELECTION_GUIDE, MULTI_MEANING_SPLIT_GUIDE, BRANCH_EDGE_GUIDE } from '@/lib/ai-shape-guide';

// 그래프 컨텍스트 추출: 인접 노드(predecessors, successors) 정보 생성
export interface GraphNode {
    id: string;
    label: string;
    description?: string;
    type: string;
    collaborationType?: string;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
}

export interface GraphContext {
    predecessors: GraphNode[];
    successors: GraphNode[];
    position: string; // 예: "2번째 단계 (총 8단계 중)"
}

export function extractGraphContext(
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

export function formatGraphContextForPrompt(graphContext: GraphContext | null): string {
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
export function getAsIsPrompt(context: {
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

${FULL_SHAPE_SELECTION_GUIDE}

${BRANCH_EDGE_GUIDE}

## 요구사항
1. 반드시 시작(terminal, terminalType='start')과 종료(terminal, terminalType='end') 노드를 포함하세요.
2. 해당 업무의 수행 단계를 5~8개 노드로 작성하세요.
3. 사용자가 언급한 도구(${context.tooling || '일반 오피스 도구'})를 활용하는 단계를 반영하세요.
4. 사용자가 언급한 고충(${context.painPoints || '없음'})이 발생하는 단계에는 stressLevel을 'high'로 설정하세요.
5. painPoints 배열에 각 노드의 문제점을 분석해주세요.
6. 승인/합격/수락 여부를 판단하는 단계가 있다면 decision 노드로 만들고, YES/NO 분기가 실제 업무 흐름(반려 시 이전 단계로 재검토 등)을 반영하도록 하세요.

## 핵심 규칙 (스키마가 강제하지만 참고)
- label: 30자 이내 (예: "데이터 수집")
- description: 60자 이내
- 모든 숫자는 정수만
- metrics: **모든 노드에 필수** { duration: 정수, durationUnit: 'minutes'|'hours'|'days'|'weeks'|'months' }

## 노드 배치
- position은 대략적인 값이면 충분합니다(최종 좌표는 서버가 분기 구조에 맞춰 자동 재배치합니다). x=250, y=0부터 120 간격의 수직 흐름으로 작성하세요.
- 엣지: 기본 진행은 sourceHandle='bottom', targetHandle='top'. decision의 분기 edge는 label/branchType(위 규칙 참고)을 반드시 포함하세요.`;
}

export function getToBePrompt(
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

## 노드 타입 및 표준 도형 (shape) 선택 규칙
- As-Is의 shape는 단계의 실제 기능을 판단하는 중요 의미 정보입니다:
  - type='process', shape='document' -> 문서 작성/기안/인쇄 단계로 해석
  - type='process', shape='database' -> DB 저장/조회/마이그레이션 단계로 해석
  - type='terminal', terminalType='end' -> 최종 종료 단계로 해석
  - type='io', ioType='output' -> 데이터 출력/전송 단계로 해석
  - type='agent', shape='decision' -> AI 조건 판단 단계로 해석
- To-Be 설계 시 위 의미 정보(shape, terminalType, ioType, stressLevel, collaborationType, agentDescription, metrics)를 적극 활용하여 알맞게 발전시키세요.
- AI Agent 노드: type='agent', collaborationType='copilot'|'monitor'|'autonomous'
  - AI Agent 노드라고 무조건 동일 도형을 쓰지 말고, 해당 단계의 실질적 역할에 어울리는 shape를 명시적으로 할당하세요 (예: AI 문서 요약 -> shape='document', AI DB 조회/저장 -> shape='database', AI 판단 -> shape='decision', AI 처리 -> shape='process').

${FULL_SHAPE_SELECTION_GUIDE}

${BRANCH_EDGE_GUIDE}

## 요구사항
1. 위 시나리오(${scenario})에 맞게 AI Agent를 배치하세요.
2. AI Agent의 협업 유형을 시나리오에 맞게 지정:
   - copilot: 인간과 AI가 협력
   - monitor: 인간이 AI를 감독
   - autonomous: AI가 독립 수행
3. improvements 배열에 원래 노드와 새 노드의 매핑을 포함하세요.
4. As-Is에 있던 승인/합격 여부 판단 단계는 To-Be에서도 decision 노드로 유지하고, YES/NO 분기(반려 시 재검토 경로 포함)를 실제 edge로 표현하세요.

## 핵심 규칙 (스키마가 강제하지만 참고)
- label: 30자 이내 (예: "AI 데이터 수집")
- agentDescription: 100자 이내 (예: "LLM으로 문서 요약 후 인간이 검토")
- description: 60자 이내
- 모든 숫자는 정수만
- metrics: **모든 노드에 필수** { duration: 정수, durationUnit: 'minutes'|'hours'|'days'|'weeks'|'months' }
  - AI 노드: As-Is 대비 대폭 단축된 시간
  - 인간 노드(task/process): 실제 수행에 필요한 시간

## 노드 배치
- position은 대략적인 값이면 충분합니다(최종 좌표는 서버가 분기 구조에 맞춰 자동 재배치합니다). x=250, y=0부터 100 간격의 수직 흐름으로 작성하세요.
- 엣지: 기본 진행은 sourceHandle='bottom', targetHandle='top'. decision의 분기 edge는 label/branchType을 반드시 포함하세요.`;
}

// AS-IS 전용 드릴다운 프롬프트: 인간 작업 과정만 상세 분석
export function getDrilldownPromptAsIs(
    node: { id: string; label: string; description?: string; type: string },
    context: { industry: string; role: string; task: string },
    graphContext: GraphContext | null = null
) {
    const graphContextText = formatGraphContextForPrompt(graphContext);

    return `당신은 업무 프로세스 분석 전문가입니다.
다음 프로세스 단계를 **인간이 수행하는 관점**에서 세부적으로 분해해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}\u0020\u0020
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
- 각 하위 단계에 기능에 부합하는 type과 shape를 명시적으로 부여하세요
${graphContext ? `- 위의 이전/다음 단계를 참고하여 **흐름에 맞는** 세부 단계를 도출하세요` : ''}

${FULL_SHAPE_SELECTION_GUIDE}

${MULTI_MEANING_SPLIT_GUIDE}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계: label, description, type, shape, duration, tools, painPoints
3. summary: 전체 과정 요약과 주요 병목점
4. 하위 단계 중 승인/여부를 판단하는 decision이 있다면 subEdges로 YES/NO 분기(및 반려 시 되돌아가는 경로)를 반드시 표현하세요 (아래 subEdges 규칙 참고). decision이 없는 단순 순차 분해라면 subEdges를 생략해도 됩니다(자동으로 순서대로 연결됩니다).

## subEdges 작성 규칙 (decision이 있을 때만 필요)
- source/target은 subSteps에 선언한 id를 그대로 사용하세요.
- NO/반려 등 되돌아가는 경로는 target에 **이전 subStep의 id**를 넣어 재시도 흐름을 표현하세요.
- 이 하위 분해를 벗어나 상위 노드의 원래 다음 단계로 넘어가는 분기(보통 YES)는 target에 subSteps에 없는 임의의 설명적 id(예: 다음 실제 단계 이름)를 넣으세요 - 실제로는 상위 노드의 원래 다음 단계로 자동 연결됩니다.
- decision에서 나가는 edge는 반드시 label/branchType을 지정하세요.

## JSON 구조 예시 (decision 없이 단순 순차 - subEdges 생략 가능)
{
  "parentNodeId": "${node.id}",
  "flowType": "asis",
  "subSteps": [{
    "id": "step_1", "label": "단계명", "description": "설명",
    "type": "process", "shape": "document",
    "duration": { "value": 30, "unit": "minutes" },
    "tools": ["Excel"],
    "painPoints": "이 단계에서 겪는 어려움"
  }],
  "summary": "전체 요약"
}

## JSON 구조 예시 (decision이 있어 subEdges로 분기를 표현)
{
  "parentNodeId": "${node.id}",
  "flowType": "asis",
  "subSteps": [
    { "id": "screening", "label": "지원자 자격 검토", "description": "...", "type": "process", "shape": "process", "duration": { "value": 20, "unit": "minutes" } },
    { "id": "passed", "label": "서류 합격자 선정 여부", "description": "...", "type": "decision", "shape": "decision" }
  ],
  "subEdges": [
    { "source": "screening", "target": "passed" },
    { "source": "passed", "target": "screening", "label": "NO", "branchType": "no", "condition": "적합 후보자 없음" },
    { "source": "passed", "target": "interview", "label": "YES", "branchType": "yes" }
  ],
  "summary": "전체 요약"
}

## 출력 제한 ⛔
- duration은 **숫자와 단위를 분리**하세요. "30분" 같은 문자열은 안 됩니다.
- tools는 **실제로 쓰는 도구 이름만 1~3개**. 일반 명사(module, platform, engine 등)를 나열하지 마세요.
- 같은 단어나 표현을 반복하지 마세요. 채울 내용이 없으면 배열을 비우세요.`;
}

// TO-BE 전용 드릴다운 프롬프트: AI 자동화 구현 방법 상세 안내
// 단, 노드 타입이 'agent'가 아니면 인간 작업으로 분석
export function getDrilldownPromptToBe(
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
- 중역량(mid): 기준시간 × 1.0\u0020\u0020
- 고역량(senior): 기준시간 × 0.7
`
        : '';

    // 노드 타입이 'agent'가 아니면 인간 작업으로 분석 (TO-BE에서도 인간이 수행하는 단계)
    const isHumanTask = !isAgentDrilldown(node, 'tobe');

    if (isHumanTask) {
        // TO-BE 플로우에서 인간이 수행하는 단계 (task, process, decision 등)
        return `당신은 업무 프로세스 분석 전문가입니다.
다음 프로세스 단계를 **인간이 수행하는 관점**에서 세부적으로 분해해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}\u0020\u0020
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
- 각 하위 단계에 기능에 부합하는 type과 shape를 명시적으로 부여하세요
${graphContext ? `- 위의 이전/다음 단계(일부는 AI 에이전트)와의 **연계**를 고려하세요` : ''}

${FULL_SHAPE_SELECTION_GUIDE}

${MULTI_MEANING_SPLIT_GUIDE}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계: label, description, type, shape, duration, tools, painPoints
3. summary: 전체 과정 요약과 AI 에이전트와의 협업 포인트
4. 하위 단계 중 승인/여부를 판단하는 decision이 있다면 subEdges로 YES/NO 분기(및 반려 시 되돌아가는 경로)를 반드시 표현하세요. decision이 없는 단순 순차 분해라면 subEdges를 생략해도 됩니다.

## subEdges 작성 규칙 (decision이 있을 때만 필요)
- source/target은 subSteps에 선언한 id를 그대로 사용하세요.
- NO/반려 등 되돌아가는 경로는 target에 **이전 subStep의 id**를 넣어 재시도 흐름을 표현하세요.
- 이 하위 분해를 벗어나 상위 노드의 원래 다음 단계로 넘어가는 분기(보통 YES)는 target에 subSteps에 없는 임의의 설명적 id를 넣으세요 - 실제로는 상위 노드의 원래 다음 단계로 자동 연결됩니다.
- decision에서 나가는 edge는 반드시 label/branchType을 지정하세요.

## JSON 구조 예시 (decision이 있어 subEdges로 분기를 표현)
{
  "parentNodeId": "${node.id}",
  "flowType": "tobe",
  "subSteps": [
    { "id": "review", "label": "조건 검토", "description": "...", "type": "process", "shape": "process", "duration": { "value": 20, "unit": "minutes" } },
    { "id": "accepted", "label": "조건 수락 여부", "description": "...", "type": "decision", "shape": "decision" }
  ],
  "subEdges": [
    { "source": "review", "target": "accepted" },
    { "source": "accepted", "target": "review", "label": "NO", "branchType": "no", "condition": "조건 재협의 필요" },
    { "source": "accepted", "target": "다음 단계", "label": "YES", "branchType": "yes" }
  ],
  "summary": "전체 요약"
}

## 출력 제한 ⛔
- duration은 **숫자와 단위를 분리**하세요. "30분" 같은 문자열은 안 됩니다.
- tools는 **실제로 쓰는 도구 이름만 1~3개**. 일반 명사(module, platform, engine 등)를 나열하지 마세요.
- 같은 단어나 표현을 반복하지 마세요. 채울 내용이 없으면 배열을 비우세요.`;
    }

    // 노드 타입이 'agent'인 경우: AI 자동화 분석
    return `당신은 AI 자동화 구현 전문가이자 기술 교육자입니다.
다음 프로세스 단계가 AI로 어떻게 자동화되는지 **구체적이고 실용적으로** 설명해주세요.

## 업무 정보
- 산업: ${context.industry}
- 직무: ${context.role}\u0020\u0020
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

${FULL_SHAPE_SELECTION_GUIDE}

${MULTI_MEANING_SPLIT_GUIDE}

## 요구사항 (길이·개수는 스키마가 강제함)
1. 3~5개 세부 하위 단계 (subSteps)
2. 각 subStep에 aiImplementation 객체 포함
3. automationOverview.skillBasedReduction: 역량별 시간 절감
4. 하위 단계 중 AI의 조건 판단(decision)이 있다면 subEdges로 분기를 표현하세요 (source/target은 subSteps id 사용, decision에서 나가는 edge는 label/branchType 필수). decision이 없는 단순 순차 분해라면 subEdges를 생략해도 됩니다.

## JSON 구조 예시
{
  "parentNodeId": "${node.id}",
  "flowType": "tobe",
  "subSteps": [{
    "id": "step_1", "label": "단계명", "description": "설명",
    "duration": { "value": 30, "unit": "seconds" },
    "tools": ["Power Automate"],
    "aiImplementation": {
      "method": "처리 방법", "technology": ["OCR"],
      "platforms": ["Azure AI"], "automationLevel": "full"
    },
    "resources": [{ "type": "docs", "title": "자료 제목", "searchQuery": "power automate ocr" }]
  }],
  "summary": "전체 요약",
  "automationOverview": {
    "replacedAsIsSteps": ["대체된 단계명"],
    "skillBasedReduction": {
      "junior": { "before": 90, "after": 5, "unit": "minutes" },
      "mid":    { "before": 60, "after": 5, "unit": "minutes" },
      "senior": { "before": 40, "after": 5, "unit": "minutes" }
    },
    "reductionPercent": 92,
    "keyBenefits": ["핵심 이점"], "implementationTips": ["구현 팁"]
  }
}

## 출력 제한 ⛔
- duration과 skillBasedReduction은 **숫자와 단위를 분리**하세요. "90분→5분" 같은 문자열은 안 됩니다.
- searchQuery는 **URL이 아니라 검색어**입니다.
- tools / technology / platforms는 **실제 제품·서비스 이름만 1~3개** (예: "Power Automate", "LangChain").
  module, platform, engine, connector 같은 일반 명사를 나열하지 마세요.
- 같은 단어나 표현을 반복하지 마세요. 채울 내용이 없으면 배열을 비우세요.`;
}

/**
 * TO-BE 흐름의 AI 에이전트 노드인지 판별한다.
 * 프롬프트와 응답 스키마가 같은 기준으로 변형을 고르도록 여기 한 곳에서만 정의한다.
 * route.ts의 스키마 선택(AgentDrilldownResponseSchema vs HumanDrilldownResponseSchema)도
 * 이 함수를 그대로 import해 쓴다 — 판정 기준이 두 곳으로 갈라지지 않는다.
 */
export function isAgentDrilldown(node: { type: string }, flowType: string): boolean {
    const isTobe = flowType === 'tobe' || flowType === 'to-be';
    return isTobe && node.type === 'agent';
}

export function getDrilldownPrompt(
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

// 노드 분할 프롬프트
export function getNodeSplitPrompt(
    context: { industry: string; role: string; task: string },
    node: { label: string; description?: string; type: string; metrics?: { duration?: number; durationUnit?: string } },
    flowType: string
) {
    return `당신은 업무 프로세스 분석 전문가입니다.
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
3. type은 process(일반 작업), decision(분기점), io(입출력), terminal(시작/종료), agent(AI가 수행하는 작업) 중 적절히 선택하세요.
4. 각 노드의 역할에 알맞은 표준 도형(shape)을 선택하세요.
5. 병목이나 어려운 단계는 stressLevel을 'medium' 또는 'high'로 설정하세요.
6. **각 노드에 duration(숫자)과 durationUnit(단위)을 반드시 설정하세요.**
7. summary에 분할 이유와 전체 요약을 작성하세요.

${FULL_SHAPE_SELECTION_GUIDE}

${MULTI_MEANING_SPLIT_GUIDE}`;
}
