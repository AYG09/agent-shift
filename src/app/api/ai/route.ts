import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import {
    AsIsFlowResponseSchema,
    ToBeFlowResponseSchema,
    ChangeStrategyResponseSchema,
    HumanDrilldownResponseSchema,
    AgentDrilldownResponseSchema,
    NodeSplitResponseSchema,
} from '@/lib/ai-schemas';
import { sanitizeModelId, sanitizeReasoningLevel } from '@/lib/gemini-models';
import { normalizeFlowShape } from '@/lib/flow-shapes';
import { QUEUE_LOOP_SHAPE_GUIDE } from '@/lib/ai-shape-guide';

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

// AI 응답 노드의 도형(shape) 정규화
function sanitizeResponseShapes(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    const rec = obj as Record<string, unknown>;
    if (Array.isArray(rec.nodes)) {
        const sanitizedNodes = rec.nodes.map((node) => {
            if (node && typeof node === 'object') {
                const n = node as Record<string, unknown>;
                const shape = normalizeFlowShape(
                    n.shape as string | undefined,
                    n.type as string | undefined,
                    n.terminalType as string | undefined,
                    n.ioType as string | undefined
                );
                return { ...n, shape };
            }
            return node;
        });
        return { ...rec, nodes: sanitizedNodes };
    }
    return obj;
}

/** 경로를 따라 값을 읽는다. 중간에 끊기면 undefined. */
function getAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
    let current: unknown = root;
    for (const key of path) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<PropertyKey, unknown>)[key];
    }
    return current;
}

/** 경로에 값을 쓴다. 경로가 유효하지 않으면 false. */
function setAtPath(root: unknown, path: readonly PropertyKey[], value: unknown): boolean {
    if (path.length === 0) return false;
    const parent = getAtPath(root, path.slice(0, -1));
    if (parent === null || typeof parent !== 'object') return false;
    (parent as Record<PropertyKey, unknown>)[path[path.length - 1]] = value;
    return true;
}

/**
 * Zod의 too_big 이슈를 근거로 초과분을 잘라 낸다.
 *
 * 상한값을 여기에 따로 적지 않고 이슈에 실려 온 maximum을 쓰기 때문에,
 * 스키마의 .max()를 바꾸면 이 복구 로직도 자동으로 따라온다.
 */
function applyTooBigFixes(data: unknown, issues: readonly z.core.$ZodIssue[]): boolean {
    let changed = false;

    for (const issue of issues) {
        if (issue.code !== 'too_big') continue;

        const maximum = Number(issue.maximum);
        if (!Number.isFinite(maximum)) continue;

        const current = getAtPath(data, issue.path);

        if (issue.origin === 'string' && typeof current === 'string' && current.length > maximum) {
            changed = setAtPath(data, issue.path, current.slice(0, maximum)) || changed;
        } else if (issue.origin === 'array' && Array.isArray(current) && current.length > maximum) {
            changed = setAtPath(data, issue.path, current.slice(0, maximum)) || changed;
        }
    }

    return changed;
}

// 길이 초과를 잘라 내며 재검증하는 최대 횟수.
// 한 번의 safeParse가 모든 위반을 보고하지 않을 수 있어 몇 차례 반복한다.
const MAX_REPAIR_ROUNDS = 3;

/**
 * 스키마 검증에 실패한 응답을 살려 본다.
 *
 * 길이/개수 초과만 잘라 내고, 그 외의 위반(타입 불일치, 필수 필드 누락 등)은
 * 복구하지 않는다. 반드시 schema.safeParse를 통과한 값만 반환하므로
 * 검증되지 않은 데이터가 클라이언트로 나가는 일은 없다.
 *
 * 이전 구현은 JSON.parse만 성공하면 그대로 반환했다. 그 탓에 모델이 같은 단어를
 * 끝없이 반복해 스키마 상한을 수십 배 넘긴 응답도 정상 결과처럼 화면에 표시됐다.
 */
function salvageFromError(error: unknown, schema: z.ZodType): unknown | null {
    if (!NoObjectGeneratedError.isInstance(error) || !error.text) return null;

    let candidate: unknown;
    try {
        candidate = JSON.parse(error.text);
    } catch {
        // 토큰 한도로 잘린 JSON 등 — 복구 대상이 아니다
        console.log('[API Route] Salvage 실패: error.text가 JSON이 아님');
        return null;
    }

    for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
        const result = schema.safeParse(candidate);
        if (result.success) {
            if (round > 0) {
                console.log(`[API Route] Salvage 성공: 길이 초과 ${round}회 보정`);
            }
            return result.data;
        }

        if (!applyTooBigFixes(candidate, result.error.issues)) {
            // 잘라 내서 해결되는 문제가 아니다
            console.log('[API Route] Salvage 포기: 길이 초과 외의 스키마 위반');
            return null;
        }
    }

    console.log('[API Route] Salvage 포기: 보정 후에도 검증 실패');
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

## 노드 타입 및 표준 도형 (shape) 선택 규칙
각 단계의 의미와 실제 수행 기능에 맞는 shape를 반드시 지정하세요:
- 시작/종료: type='terminal', terminalType='start' 또는 'end', shape='terminal'
- 일반 업무 수행: type='process', shape='process'
- 질문, 승인 여부, 조건 판단, 분기: type='decision', shape='decision'
- 데이터 입출력/수신/전송: type='io', ioType='input' 또는 'output', shape='data'
- 보고서, 계약서, 신청서 등 문서 생성/검토: shape='document'
- 하위 절차/모듈 호출: type='subprocess', shape='predefinedProcess'
- DB 조회/저장/갱신: shape='database'
- 시스템 내부 저장: shape='internalStorage'
- 외부/파일 보관 데이터: shape='storedData'
- 사용자가 직접 키보드/마우스 입력: shape='manualInput'
- 사람이 시스템 밖에서 수동으로 처리: shape='manualOperation'
- 환경 설정, 초기화, 준비: shape='preparation'
- 대기, 보류, 지연: shape='delay'
- 화면/대시보드 표시: shape='display'
- 흐름 참조: shape='connector' 또는 'offPageConnector'
- 흐름 병합/추출/정렬/취합: shape='merge' | 'extract' | 'sort' | 'collate' | 'or' | 'card' | 'stream'
${QUEUE_LOOP_SHAPE_GUIDE}
- 모호한 단계는 기본값 shape='process'를 적용하세요.

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
- 시작/종료 -> shape='terminal'
- 질문, 승인, 조건 판단 -> shape='decision'
- 입출력 -> shape='data'
- 문서 처리 -> shape='document'
- 수동 처리/입력 -> shape='manualInput' 또는 'manualOperation'
- DB 작업 -> shape='database'
${QUEUE_LOOP_SHAPE_GUIDE}

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
- 각 하위 단계에 기능에 부합하는 type과 shape를 명시적으로 부여하세요 (예: 입력 -> type='io', ioType='input', shape='data'; 검증/판단 -> type='decision', shape='decision'; 문서작성 -> type='process', shape='document'; 모호하면 type='process', shape='process')
${QUEUE_LOOP_SHAPE_GUIDE}
${graphContext ? `- 위의 이전/다음 단계를 참고하여 **흐름에 맞는** 세부 단계를 도출하세요` : ''}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계: label, description, type, shape, duration, tools, painPoints
3. summary: 전체 과정 요약과 주요 병목점

## JSON 구조 예시
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
- 중역량(mid): 기준시간 × 1.0  
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
- 각 하위 단계에 기능에 부합하는 type과 shape를 명시적으로 부여하세요
${QUEUE_LOOP_SHAPE_GUIDE}
${graphContext ? `- 위의 이전/다음 단계(일부는 AI 에이전트)와의 **연계**를 고려하세요` : ''}

## 요구사항
1. 이 단계를 3~5개의 세부 하위 단계로 분해하세요.
2. 각 하위 단계: label, description, type, shape, duration, tools, painPoints
3. summary: 전체 과정 요약과 AI 에이전트와의 협업 포인트

## JSON 구조 예시
{
  "parentNodeId": "${node.id}",
  "flowType": "tobe",
  "subSteps": [{
    "id": "step_1", "label": "단계명", "description": "설명",
    "type": "process", "shape": "document",
    "duration": { "value": 30, "unit": "minutes" },
    "tools": ["Excel"],
    "painPoints": "이 단계에서 겪는 어려움"
  }],
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

## 도형(shape) 선택 규칙
각 하위 단계(subSteps)의 실제 기능에 맞는 shape를 지정하세요 (예: 처리 -> shape='process', 판단 -> shape='decision', 데이터 입출력 -> shape='data', 문서 처리 -> shape='document', DB 작업 -> shape='database').
${QUEUE_LOOP_SHAPE_GUIDE}

## 요구사항 (길이·개수는 스키마가 강제함)
1. 3~5개 세부 하위 단계 (subSteps)
2. 각 subStep에 aiImplementation 객체 포함
3. automationOverview.skillBasedReduction: 역량별 시간 절감

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
 */
function isAgentDrilldown(node: { type: string }, flowType: string): boolean {
    const isTobe = flowType === 'tobe' || flowType === 'to-be';
    return isTobe && node.type === 'agent';
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
4. 각 노드의 역할에 알맞은 표준 도형(shape)을 선택하세요 (예: document, database, manualInput, process, decision, data, predefinedProcess 등).
${QUEUE_LOOP_SHAPE_GUIDE}
5. 병목이나 어려운 단계는 stressLevel을 'medium' 또는 'high'로 설정하세요.
6. **각 노드에 duration(숫자)과 durationUnit(단위)을 반드시 설정하세요.**
7. summary에 분할 이유와 전체 요약을 작성하세요.`;
}

export async function POST(request: NextRequest) {
    // 검증 실패 시 catch 블록에서도 스키마가 필요하므로 try 밖에 둔다
    let schema: z.ZodType | undefined;

    try {
        const body = await request.json();
        const { action, context, asIsNodes, framework, apiKey, node, flowType, scenario } = body;

        // BYOK: 사용자 제공 키 또는 환경 변수 키 사용 (개행 문자 방지를 위해 trim)
        const trimmedApiKey = apiKey?.trim();

        // 클라이언트가 설정창에서 고른 모델. 형식이 어긋나거나 구형이면 기본 모델로 되돌린다.
        const modelId = sanitizeModelId(body.model);

        // 추론 깊이. Gemini 3.x는 thinkingLevel을 쓴다(2.5의 thinkingBudget과 다름).
        // 'default'면 아무것도 보내지 않아 모델 기본 추론 수준을 그대로 쓴다.
        const reasoningLevel = sanitizeReasoningLevel(body.reasoning);
        const providerOptions =
            reasoningLevel === 'default'
                ? undefined
                : { google: { thinkingConfig: { thinkingLevel: reasoningLevel } } };

        console.log('[API Route] Model:', modelId, '| Reasoning:', reasoningLevel);

        let model;
        if (trimmedApiKey) {
            // 사용자가 제공한 API 키로 새 클라이언트 생성
            const customGoogle = createGoogleGenerativeAI({ apiKey: trimmedApiKey });
            model = customGoogle(modelId);
            console.log('[API Route] Using user-provided API key');
        } else {
            // 환경 변수의 기본 키 사용 (환경 변수도 trim)
            const envApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
            if (envApiKey) {
                const customGoogle = createGoogleGenerativeAI({ apiKey: envApiKey });
                model = customGoogle(modelId);
                console.log('[API Route] Using env API key (trimmed)');
            } else {
                model = google(modelId);
                console.log('[API Route] Using default google() - no API key found!');
            }
        }

        let prompt: string | undefined;

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
                // 프롬프트와 스키마가 같은 조건으로 변형을 고르도록 한 곳에서 판별한다
                schema = isAgentDrilldown(node, flowType)
                    ? AgentDrilldownResponseSchema
                    : HumanDrilldownResponseSchema;
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
                prompt = getNodeSplitPrompt(context, node, flowType);
                break;

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        if (!schema || !prompt) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const { object } = await generateObject({
            model,
            schema,
            prompt,
            maxOutputTokens: 16384, // 실제 필요량 6,000 + 여유분
            ...(providerOptions ? { providerOptions } : {}),
        });

        // 숫자 및 도형 필드 정규화 후 반환
        return NextResponse.json(normalizeMetrics(sanitizeResponseShapes(object)));
    } catch (error) {
        console.error('AI API Error:', error);

        // 스키마 검증 실패: 길이 초과만 잘라 내고 재검증해 살릴 수 있으면 살린다.
        // 검증을 통과하지 못한 응답은 절대 반환하지 않는다.
        if (NoObjectGeneratedError.isInstance(error)) {
            const salvaged = schema ? salvageFromError(error, schema) : null;
            if (salvaged) {
                return NextResponse.json(normalizeMetrics(sanitizeResponseShapes(salvaged)));
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
