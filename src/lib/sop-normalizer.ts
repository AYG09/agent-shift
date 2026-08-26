import { SopDocument, SopStepData, SopEdge, SopMember, WorkLibrarySelection, SopSetupConfig } from './sop-types';
import { SopGenerationResponseSchema } from './sop-schemas';
import { layoutSopGraph } from './sop-layout';
import { FlowShape } from './flow-shapes';
import { classifySopStepType } from './graph-validation';

export function createSopDocumentFromGeneration(params: {
    id?: string;
    rawResponse: unknown;
    member: SopMember;
    workLibrary: WorkLibrarySelection;
    context: string;
    setupConfig: SopSetupConfig;
    isSampleData?: boolean;
    /** Set only when this generation actually requested the Activity–Sub Action structure — never inferred. */
    structureVersion?: 'activity-subaction-v1';
    /** Set only when this generation was actually produced/validated under the node-authoring contract — never inferred, mirroring structureVersion above. */
    instructionContractVersion?: SopDocument['instructionContractVersion'];
}): SopDocument {
    // A raw AI response is never used as-is; it must pass Zod validation first.
    const parseResult = SopGenerationResponseSchema.safeParse(params.rawResponse);
    if (!parseResult.success) {
        const issues = parseResult.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
        throw new Error(`AI SOP 응답 형식이 유효하지 않습니다 (${issues}).`);
    }

    const parsedData = parseResult.data;
    const title = parsedData.title || `${params.workLibrary.taskName} Standard Operating Procedure`;
    const rawSteps = parsedData.steps;
    const rawEdges = parsedData.edges;

    // 2. Normalize Steps
    // classifySopStepType은 graph-validation.ts의 검증 로직과 완전히 동일한 기준을 쓴다 -
    // 배열 위치(idx)로 첫/마지막 terminal을 start/end로 추정하는 일은 절대 하지 않는다.
    // shape/type이 'terminal'인데 terminalType이 없는 응답은 SopGenerationResponseSchema의
    // superRefine에서 이미 파싱 단계에서 걸러지므로, 여기 도달한 시점엔 항상 값이 있다.
    const normalizedSteps: SopStepData[] = rawSteps.map((s, idx) => {
        const classifiedType = classifySopStepType(s);
        const terminalType = classifiedType === 'terminal' ? s.terminalType : undefined;

        const requiredSkills = (s.requiredSkills || []).map((sk) => ({
            skillId: sk.skillId,
            name: sk.name || '미정 SKILL',
            requiredLevel: sk.requiredLevel || 'basic',
            reason: sk.reason || (sk.source === 'ai-suggested' ? 'AI 제안 역량' : 'Work Library 표준 역량'),
            source: sk.source === 'ai-suggested' ? ('ai-suggested' as const) : ('work-library' as const),
            accepted: sk.source === 'work-library',
        }));

        return {
            id: s.id || `step-${idx + 1}`,
            title: s.title || `단계 ${idx + 1}`,
            definition: s.definition || `${s.title} 단계입니다.`,
            detailedInstructions: s.detailedInstructions,
            responsibleRole: s.responsibleRole || params.member.jobRole,
            inputs: s.inputs || [],
            outputs: s.outputs || [],
            tools: s.tools || [],
            cautions: s.cautions || [],
            decisionRules: s.decisionRules || [],
            requiredSkills,
            estimatedDuration: s.estimatedDuration || { value: 1, unit: 'days' },
            // type/shape는 항상 classifySopStepType 결과와 일치시킨다 (AI가 보낸 임의의 type
            // 문자열이나 'start'/'end' 같은 구식 값을 그대로 흘려보내지 않는다).
            type: classifiedType,
            shape: classifiedType === 'terminal' ? ('terminal' as FlowShape) : (s.shape as FlowShape) || 'process',
            terminalType,
            ioType: s.ioType,
            sourceActivityIds: s.sourceActivityIds,
            subActionOrder: s.subActionOrder,
            subActionOrigin: s.subActionOrigin,
            subActionOriginRationale: s.subActionOriginRationale,
            agentizationSuggestion: s.agentizationSuggestion,
            executionSpec: s.executionSpec,
            position: s.position && (s.position.x !== 0 || s.position.y !== 0) ? s.position : { x: 0, y: 0 },
            reviewStatus: 'ai-draft' as const,
        };
    });

    // 3. Normalize Edges
    const normalizedEdges: SopEdge[] = rawEdges.map((e, idx) => ({
        id: e.id || `edge-${idx + 1}`,
        source: e.source,
        target: e.target,
        label: e.label,
        branchType: e.branchType || (e.label?.includes('YES') ? 'yes' : e.label?.includes('NO') ? 'no' : 'default'),
        condition: e.condition,
        // AI가 채운 기본 bottom/top 값은 렌더 시 좌표 기반 라우터가 결정한다.
        // 비기본 핸들만 보존해 실제 배치와 반대 방향의 연결선을 방지한다.
        sourceHandle: e.sourceHandle === 'bottom' ? undefined : e.sourceHandle,
        targetHandle: e.targetHandle === 'top' || e.targetHandle === 'top-target' ? undefined : e.targetHandle,
    }));

    // AI returns the workflow semantics, not trusted canvas geometry. Always
    // derive coordinates after validation so a non-overlapping but single-line
    // AI response cannot degrade the workspace's readability.
    const layoutResult = layoutSopGraph(normalizedSteps, normalizedEdges);
    const finalSteps = layoutResult.steps;
    const finalEdges = layoutResult.edges;

    const now = new Date().toISOString();
    return {
        id: params.id || `sop-${Date.now()}`,
        title,
        member: params.member,
        workLibrary: params.workLibrary,
        context: params.context,
        setupConfig: params.setupConfig,
        steps: finalSteps,
        edges: finalEdges,
        reviewStatus: 'ai-draft' as const,
        createdAt: now,
        updatedAt: now,
        isSampleData: params.isSampleData || false,
        structureVersion: params.structureVersion,
        agentInstruction: parsedData.agentInstruction,
        instructionContractVersion: params.instructionContractVersion,
    };
}
