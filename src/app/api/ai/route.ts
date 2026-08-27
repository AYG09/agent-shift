import { NextRequest, NextResponse } from 'next/server';
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
import { SopGenerationWireSchema, SopSuggestionPatchSchema } from '@/lib/sop-schemas';
import { sanitizeModelId, sanitizeReasoningLevel } from '@/lib/gemini-models';
import { resolveGenerationApiKey, resolveGenerationModel, buildReasoningProviderOptions } from '@/server/ai/model-factory';
import { normalizeFlowShape } from '@/lib/flow-shapes';
import { getAsIsPrompt, getToBePrompt, getDrilldownPrompt, getNodeSplitPrompt, isAgentDrilldown } from '@/server/flow/flow-prompts';
import {
    validateFlowGraph,
    validateDrilldownBranching,
    hasBlockingIssues,
    buildRepairInstruction,
    applyDeterministicGraphFixes,
    type ValidatableNode,
    type ValidatableEdge,
} from '@/lib/graph-validation';
import { getSopPrompt } from '@/server/sop/sop-prompt';
import { parseSopGenerationRequest } from '@/server/sop/sop-request';
import type { SopGenerationRequest } from '@/lib/sop-ai-request';
import { runSopGenerationPostProcessing } from '@/server/sop/sop-generation-runner';
import { computeSubActionCapacity } from '@/lib/sop-subaction-capacity';

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

export async function POST(request: NextRequest) {
    // 검증 실패 시 catch 블록에서도 스키마가 필요하므로 try 밖에 둔다
    let schema: z.ZodType | undefined;

    try {
        const body = await request.json();
        const { action, context, asIsNodes, framework, apiKey, node, flowType, scenario } = body;

        // 모델·키·추론 옵션 해석은 model-factory(SSOT·프로바이더 교체 지점)가 담당한다.
        // 이 라우트는 로깅용으로만 정규화 결과를 다시 읽는다.
        const modelId = sanitizeModelId(body.model);
        const reasoningLevel = sanitizeReasoningLevel(body.reasoning);
        const providerOptions = buildReasoningProviderOptions(body.reasoning);
        const keySource = resolveGenerationApiKey(apiKey).source;
        console.log('[API Route] Model:', modelId, '| Reasoning:', reasoningLevel, '| Key:', keySource);
        const model = resolveGenerationModel({ model: body.model, apiKey });

        let prompt: string | undefined;
        // 생성 결과에 그래프 수준 의미 검증(+ 최대 1회 repair)을 적용할지 여부.
        // 'flow'는 nodes/edges 전체 그래프, 'drilldown'은 subSteps/subEdges를 검사한다.
        let graphKind: 'flow' | 'drilldown' | 'sop' | 'none' = 'none';
        // Set only inside the 'generateSop' case below. The post-processing pipeline
        // (graphKind === 'sop') reads this validated value instead of re-deriving
        // constraints from the raw, untyped `body` a second time.
        let sopRequest: SopGenerationRequest | undefined;

        switch (action) {
            case 'generateAsIsFlow':
                if (!context) {
                    return NextResponse.json({ error: 'context is required' }, { status: 400 });
                }
                schema = AsIsFlowResponseSchema;
                prompt = getAsIsPrompt(context);
                graphKind = 'flow';
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
                graphKind = 'flow';
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
                graphKind = 'drilldown';
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

            case 'generateSop': {
                // 서버는 클라이언트 검증을 신뢰하지 않는다 - 요청 전체를 client/server 공용
                // 스키마(SopGenerationRequestSchema, src/server/sop/sop-request.ts)로 즉시
                // 파싱하고, 실패하면 필드별 issue를 포함한 400으로 막는다. apiKey/detailLevel/
                // branchPolicy가 잘못된 타입이어도 여기서 400으로 끝나며 이후 로직에서 500을
                // 만들지 않는다.
                const parsedSopRequest = parseSopGenerationRequest(body);
                if (!parsedSopRequest.ok) return parsedSopRequest.response;
                // Assigns the outer `sopRequest` (declared above the switch) rather than
                // shadowing it — the post-processing pipeline below reads this same
                // validated value instead of re-parsing/casting raw `body` fields.
                sopRequest = parsedSopRequest.request;

                // The server re-applies the SAME Sub Action capacity floor the Gate
                // computes client-side (computeSubActionCapacity) — a stale or
                // hand-crafted client must never shrink minSteps below the
                // per-Activity decomposition floor (기본 2~3 Sub Action/Activity),
                // or the prompt and the post-processing validator would both be
                // built from numbers that force 1:1 Activity-copy nodes. The
                // adjusted values feed BOTH the prompt below and the
                // runSopGenerationPostProcessing constraints (same object).
                if (sopRequest.structureVersion === 'activity-subaction-v1' && sopRequest.activities.length > 0) {
                    const capacity = computeSubActionCapacity({
                        activityCount: sopRequest.activities.length,
                        minSteps: sopRequest.minSteps,
                        maxSteps: sopRequest.maxSteps,
                        maxTotalNodes: sopRequest.maxTotalNodes,
                        detailLevel: sopRequest.detailLevel,
                    });
                    sopRequest = { ...sopRequest, minSteps: capacity.minSteps, maxSteps: capacity.maxSteps, maxTotalNodes: capacity.maxTotalNodes };
                }

                // 와이어 스키마는 게이트(SopGenerationResponseSchema)보다 의도적으로
                // 관대하다 — Gemini가 강제하지 못하는 superRefine/min-length 위반이
                // generateObject 파싱 시점에 응답 전체를 죽이면(NoObjectGeneratedError)
                // repair 루프에 영영 도달하지 못하기 때문이다. 기계적 위반은 파이프라인
                // 진입 정규화가, 품질 결함은 repair 루프가, 최종 이중 방어는 클라이언트
                // 문서 게이트가 처리한다. sop-schemas.ts의 SopGenerationWireSchema 참고.
                schema = SopGenerationWireSchema;
                prompt = getSopPrompt({
                    memberRole: sopRequest.memberRole,
                    sourceJobId: sopRequest.sourceJobId,
                    jobName: sopRequest.jobName,
                    taskId: sopRequest.taskId,
                    taskName: sopRequest.taskName,
                    taskDefinition: sopRequest.taskDefinition,
                    sourceType: sopRequest.sourceType,
                    structureVersion: sopRequest.structureVersion,
                    activityName: sopRequest.activityName,
                    activities: sopRequest.activities,
                    skills: sopRequest.skills,
                    context: sopRequest.context,
                    detailLevel: sopRequest.detailLevel,
                    minSteps: sopRequest.minSteps,
                    maxSteps: sopRequest.maxSteps,
                    maxTotalNodes: sopRequest.maxTotalNodes,
                    branchPolicy: sopRequest.branchPolicy,
                    maxBranches: sopRequest.maxBranches,
                    allowRework: sopRequest.allowRework,
                    maxLoops: sopRequest.maxLoops,
                    splitComplexSteps: sopRequest.splitComplexSteps,
                });
                graphKind = 'sop';
                break;
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        if (!schema || !prompt) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
        // 위 체크로 이 시점부터 schema/prompt는 확실히 정의되어 있지만, 아래 콜백(클로저)
        // 안에서는 TS가 그 사실을 다시 증명하지 못한다 - 별도 상수로 좁혀서 넘긴다.
        const resolvedSchema = schema;
        const resolvedPrompt = prompt;

        // /flow류 그래프(~15노드)는 16384로 충분하지만("실제 필요량 6,000 + 여유분"),
        // Activity–Sub Action Task 전체 SOP는 한국어 리치 필드를 가진 28~42+ 노드를
        // 반환해야 하므로 같은 상한을 쓰면 JSON이 중간에 잘려 NoObjectGeneratedError
        // ("AI 응답이 스키마와 일치하지 않습니다")로 끝난다. SOP 생성만 별도 상한을 쓴다.
        const generationMaxOutputTokens = graphKind === 'sop' ? 65536 : 16384;

        // SOP 1차 생성도 repair와 동일하게 1회 재시도한다 — 퇴행 반복 루프(자유 문자열
        // 필드 안에서 같은 구절을 토큰 한도까지 반복 → JSON 절단 → NoObjectGeneratedError)는
        // 확률적 실패라 같은 프롬프트의 두 번째 추첨이 대부분 성공한다. repair 경로는
        // generateSopRepairWithRetry가 이미 방어하지만, 1차 생성이 즉사하면 그 방어에
        // 도달하지도 못한 채 사용자에게 500이 나간다. /flow류는 기존 동작을 유지한다.
        const generateFirstObject = async () =>
            (
                await generateObject({
                    model,
                    schema: resolvedSchema,
                    prompt: resolvedPrompt,
                    maxOutputTokens: generationMaxOutputTokens,
                    ...(providerOptions ? { providerOptions } : {}),
                })
            ).object;
        let firstObject: unknown;
        try {
            firstObject = await generateFirstObject();
        } catch (firstError) {
            if (graphKind !== 'sop') throw firstError;
            console.error(
                '[API Route] SOP 1차 생성 실패, 1회 재시도:',
                firstError instanceof Error ? firstError.message : String(firstError)
            );
            firstObject = await generateFirstObject();
        }

        let object: unknown = firstObject;
        let graphWarnings: string[] = [];
        const graphKindType: 'flow' | 'drilldown' | 'sop' | 'none' = graphKind;

        if (graphKindType === 'sop') {
            if (!sopRequest) {
                // graphKind is only ever set to 'sop' in the same 'generateSop' case block
                // that assigns sopRequest, so this narrows rather than asserts past it —
                // unreachable in practice, but never trusted with a cast either.
                return NextResponse.json({ error: 'SOP 요청이 올바르게 파싱되지 않았습니다.' }, { status: 500 });
            }
            // SOP-specific generate -> validate -> repair -> fallback -> revalidate pipeline,
            // extracted to src/server/sop/sop-generation-runner.ts. `sopRequest` is the same
            // schema-validated value the prompt above was built from — no re-parsing/casting
            // of the raw request body a second time.
            const sopResult = await runSopGenerationPostProcessing({
                object,
                prompt: resolvedPrompt,
                sopRequest,
                generateRepair: async (repairPrompt) => {
                    const { object: repaired } = await generateObject({
                        model,
                        schema: resolvedSchema,
                        prompt: repairPrompt,
                        // repair도 전체 SOP 그래프를 다시 반환하므로 본 생성과 동일한 상한이 필요하다.
                        maxOutputTokens: generationMaxOutputTokens,
                        ...(providerOptions ? { providerOptions } : {}),
                    });
                    return repaired;
                },
                // 누락된 Agent화 제안만 채우는 소형 호출 — 33노드 전체 재생성 대신
                // 수천 토큰짜리 제안 목록만 받는다. 확률적 실패에 대비해 1회 재시도.
                generateSuggestionPatch: async (missingSteps) => {
                    const stepList = missingSteps
                        .map((step) => `- [${step.id}] ${step.title || '제목 없음'}: ${step.definition || '정의 없음'}`)
                        .join('\n');
                    const patchPrompt = `당신은 업무 프로세스의 AI 적용 가능성을 판단하는 전문가입니다.
"${sopRequest!.taskName || '업무'}" SOP의 아래 업무 단계마다 Agent화 제안을 정확히 1개씩 생성하세요.
- type: 'agent-candidate'(정해진 규칙 안에서 AI가 주도 가능) | 'ai-assist'(사람이 수행하고 AI가 초안·검색·분석을 지원) | 'not-recommended'(사람 판단·대면 소통·예외 처리 등으로 AI 적용 비권장)
- rationale: 왜 그렇게 판단했는지 1문장의 구체적 근거. 빈 문자열 금지.
- stepId는 아래 목록의 ID를 그대로 사용하고, 모든 ID에 대해 빠짐없이 반환하세요. 확률/신뢰도 수치는 만들지 마세요.

## 단계 목록
${stepList}`;
                    const callPatch = async () =>
                        (
                            await generateObject({
                                model,
                                schema: SopSuggestionPatchSchema,
                                prompt: patchPrompt,
                                maxOutputTokens: 8192,
                                ...(providerOptions ? { providerOptions } : {}),
                            })
                        ).object;
                    try {
                        return await callPatch();
                    } catch (patchError) {
                        console.error(
                            '[API Route] Agent화 제안 패치 1차 실패, 1회 재시도:',
                            patchError instanceof Error ? patchError.message : String(patchError)
                        );
                        return callPatch();
                    }
                },
            });

            if (!sopResult.ok) return sopResult.response;
            object = sopResult.object;
            graphWarnings = sopResult.warnings;
        }

        if (graphKindType === 'flow') {
            const rec = object as { nodes?: ValidatableNode[]; edges?: ValidatableEdge[] };
            let issues = validateFlowGraph(rec.nodes || [], rec.edges || []);

            if (hasBlockingIssues(issues)) {
                console.log('[API Route] 그래프 검증 실패, 1회 repair 시도:', issues.map((i) => i.type));
                try {
                    const repairPrompt = `${prompt}\n\n${buildRepairInstruction(issues)}\n\n## 직전 응답 (참고용 - 문제 있는 부분만 고치세요)\n${JSON.stringify(object)}`;
                    const { object: repaired } = await generateObject({
                        model,
                        schema,
                        prompt: repairPrompt,
                        maxOutputTokens: 16384,
                        ...(providerOptions ? { providerOptions } : {}),
                    });
                    object = repaired;
                    const repairedRec = object as { nodes?: ValidatableNode[]; edges?: ValidatableEdge[] };
                    issues = validateFlowGraph(repairedRec.nodes || [], repairedRec.edges || []);
                } catch (repairError) {
                    console.error('[API Route] 그래프 repair 요청 실패:', repairError);
                }
            }

            if (hasBlockingIssues(issues)) {
                // LLM repair로도 못 고쳤다면 결정론적 fallback으로 "단일 분기 decision"이
                // 조용히 정상 결과처럼 보이지 않게 한다 (안전한 fallback 경로).
                const finalRec = object as {
                    nodes: (ValidatableNode & { id: string })[];
                    edges: (ValidatableEdge & { id: string })[];
                };
                const fixed = applyDeterministicGraphFixes(finalRec.nodes, finalRec.edges);
                object = { ...(object as object), nodes: fixed.nodes, edges: fixed.edges };
                graphWarnings = fixed.fixesApplied;
                if (graphWarnings.length > 0) {
                    console.log('[API Route] 결정론적 fallback 적용:', graphWarnings);
                }
            }
        }

        if (graphKind === 'drilldown') {
            const rec = object as { subSteps?: { id: string; type?: string }[]; subEdges?: ValidatableEdge[] };
            let issues = validateDrilldownBranching(rec.subSteps || [], rec.subEdges);

            if (issues.length > 0) {
                console.log('[API Route] 드릴다운 분기 검증 실패, 1회 repair 시도:', issues.map((i) => i.type));
                try {
                    const repairPrompt = `${prompt}\n\n${buildRepairInstruction(issues)}\n\n## 직전 응답 (참고용 - 문제 있는 부분만 고치세요)\n${JSON.stringify(object)}`;
                    const { object: repaired } = await generateObject({
                        model,
                        schema,
                        prompt: repairPrompt,
                        maxOutputTokens: 16384,
                        ...(providerOptions ? { providerOptions } : {}),
                    });
                    object = repaired;
                    const repairedRec = object as { subSteps?: { id: string; type?: string }[]; subEdges?: ValidatableEdge[] };
                    issues = validateDrilldownBranching(repairedRec.subSteps || [], repairedRec.subEdges);
                } catch (repairError) {
                    console.error('[API Route] 드릴다운 repair 요청 실패:', repairError);
                }
            }

            // subEdges가 끝내 불완전해도, 적용 단계(page.tsx)가 순차 체인으로 안전하게
            // fallback하므로 여기서는 진단용 경고만 남기고 응답 자체는 막지 않는다.
            if (issues.length > 0) {
                graphWarnings = issues.map((i) => i.message);
            }
        }

        // 숫자 및 도형 필드 정규화 후 반환
        const responseBody = normalizeMetrics(sanitizeResponseShapes(object)) as Record<string, unknown>;
        if (graphWarnings.length > 0) {
            responseBody._graphWarnings = graphWarnings;
        }
        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('AI API Error:', error);

        // 스키마 검증 실패: 길이 초과만 잘라 내고 재검증해 살릴 수 있으면 살린다.
        // 검증을 통과하지 못한 응답은 절대 반환하지 않는다.
        if (NoObjectGeneratedError.isInstance(error)) {
            // 어떤 위반이 파싱을 죽였는지 서버 로그에 남긴다 — "스키마와 일치하지
            // 않습니다"만으로는 재발 시 원인 분석이 불가능하다. finishReason이
            // 'length'면 스키마 위반이 아니라 출력 토큰 절단이 원인이다.
            console.error(
                '[API Route] NoObjectGeneratedError:',
                'finishReason=', error.finishReason,
                '| cause=', error.cause instanceof Error ? error.cause.message : String(error.cause ?? 'unknown'),
                '| text length=', error.text?.length ?? 0
            );
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
