import { type FlowShape } from './flow-shapes';
import type { SopAgentInstructionSpec, SopNodeExecutionSpec, SopNodeInstructionContractVersion } from './sop-node-authoring-contract';

export type SopReviewStatus = 'ai-draft' | 'reviewed' | 'confirmed';
export type SopAgentizationScope = 'workflow' | 'steps';
/**
 * An unset step remains a human-performed step. Only explicit AI participation
 * is stored and surfaced in the workspace.
 */
export type SopAiApplicationMode = 'automation' | 'assist';

/**
 * AI-generated candidacy signal for a Sub Action, produced at generation time.
 * This is never the member's decision — it only seeds `agentizationReview`,
 * which the member must independently accept/change/leave unset. Keep this
 * union distinct from SopAiApplicationMode: 'not-recommended' has no member-mode
 * analog (an unset member mode already means human-performed).
 */
// 값 집합의 원천은 sop-step-common-schema.ts의 SOP_AGENTIZATION_SUGGESTION_TYPES (SSOT).
export type SopAgentizationSuggestionType = (typeof import('./sop-step-common-schema').SOP_AGENTIZATION_SUGGESTION_TYPES)[number];

export interface SopAgentizationSuggestion {
    type: SopAgentizationSuggestionType;
    /** Short, specific rationale. Never a confidence/probability score. */
    rationale: string;
}

/** How a generated Sub Action entered the member's SOP draft. */
export type SopSubActionOrigin = 'activity-derived' | 'context-derived';

/**
 * A member's explicit judgement about where AI may participate in an SOP.
 * It records a candidate decision only; it does not create or authorize an AI agent.
 */
export interface SopAgentizationReview {
    scope: SopAgentizationScope;
    stepIds: string[];
    /** A batch value may be applied to the current review scope. */
    defaultMode?: SopAiApplicationMode;
    /** The authoritative judgement for each reviewed SOP step. */
    stepModes: Partial<Record<string, SopAiApplicationMode>>;
    /** Legacy persisted value, normalized at read time. */
    mode?: SopAiApplicationMode;
    note?: string;
    confirmedAt?: string;
}

export interface SopMember {
    id?: string;
    /** Prototype login identifier. Authentication integration remains out of scope. */
    employeeId?: string;
    name: string;
    jobRole: string;
    organization?: string;
    /** 직급. Source system (SSO/HR master) is not yet decided — prototype login context only. */
    grade?: string;
}

export interface WorkLibrarySkill {
    id: string;
    name: string;
    description?: string;
}

export interface WorkLibraryActivity {
    id: string;
    /** Source Activity order within its Task. Legacy records are migrated from array order. */
    order?: number;
    name: string;
    description?: string;
    skills: WorkLibrarySkill[];
}

export interface WorkLibraryTask {
    id: string;
    name: string;
    description?: string;
    activities: WorkLibraryActivity[];
}

export interface WorkLibrarySelection {
    /** Job metadata scopes the editable Task catalog without duplicating catalog data. */
    jobId?: string;
    sourceJobId?: string;
    jobName?: string;
    taskId: string;
    taskName: string;
    activityId?: string;
    activityName?: string;
    /** The editable Task → Activity → SKILL source data. */
    taskCatalog: WorkLibraryTask[];
    /**
     * Skills in the current SOP generation scope. This is derived from the
     * selected Activity, or deduplicated across the selected Task.
     */
    skills: WorkLibrarySkill[];
    sourceType: 'task' | 'activity';
    confirmed: boolean;
}

export interface SopRequiredSkill {
    skillId?: string;
    name: string;
    requiredLevel?: 'basic' | 'intermediate' | 'advanced';
    reason?: string;
    source: 'work-library' | 'ai-suggested';
    accepted: boolean;
}

export interface SopStepData {
    id: string;
    title: string;
    definition: string;
    detailedInstructions?: string;
    responsibleRole?: string;
    inputs?: string[];
    outputs?: string[];
    tools?: string[];
    cautions?: string[];
    decisionRules?: string[];
    requiredSkills: SopRequiredSkill[];
    estimatedDuration?: {
        value: number;
        unit: 'minutes' | 'hours' | 'days' | 'weeks';
    };
    type?: string;
    shape: FlowShape;
    terminalType?: 'start' | 'end';
    ioType?: 'input' | 'output';
    /**
     * Task Library Activity ids represented by this business step. A legacy
     * (structureVersion-less) document may list several; a document whose
     * structureVersion is 'activity-subaction-v1' requires exactly one — that
     * step is a single Sub Action of that one Activity, not a merged summary.
     */
    sourceActivityIds?: string[];
    /**
     * Order of this Sub Action within its owning Activity (positive integer,
     * unique per Activity). Only meaningful when the owning document's
     * structureVersion is 'activity-subaction-v1'; ignored for legacy documents.
     */
    subActionOrder?: number;
    /** Activity definition baseline or a member-context augmentation. */
    subActionOrigin?: SopSubActionOrigin;
    /** Required by the generation contract for a context-derived Sub Action. */
    subActionOriginRationale?: string;
    /**
     * AI-generated Agent화 candidacy suggestion for this Sub Action. Separate
     * from the member's authoritative agentizationReview.stepModes — see that
     * field's docstring. Never present on a terminal step.
     */
    agentizationSuggestion?: SopAgentizationSuggestion;
    /**
     * Agent-ready 실행 명세 (책임 역할, 실행 행동, 완료·분기 기준, tool policy,
     * escalation). Additive-optional: legacy 문서에는 없고, 없다는 이유로 문서가
     * 깨지지 않는다. terminal과 순수 control node에는 두지 않는다.
     *
     * 이 필드가 채워졌다는 것이 Agent화 확정이나 tool 실행 권한을 뜻하지 않는다 —
     * 그 셋은 서로 다른 필드와 전이로 유지된다 (REQ-AOP-003).
     */
    executionSpec?: SopNodeExecutionSpec;
    position: { x: number; y: number };
    reviewStatus: SopReviewStatus;
}

export interface SopEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    branchType?: 'yes' | 'no' | 'condition' | 'default';
    condition?: string;
    sourceHandle?: string;
    targetHandle?: string;
    /** A member deliberately chose these ports; never replace them with auto-routing. */
    manualRouting?: boolean;
}

export interface SopSetupConfig {
    detailLevel: 'simple' | 'standard' | 'detailed';
    minSteps: number;
    maxSteps: number;
    branchPolicy: 'auto' | 'none' | 'max';
    maxBranches: number;
    allowRework: boolean;
    maxTotalNodes?: number;
    maxLoops?: number;
    splitComplexSteps?: boolean;
}

export interface SopDocument {
    id: string;
    title: string;
    member: SopMember;
    workLibrary: WorkLibrarySelection;
    context: string;
    setupConfig?: SopSetupConfig;
    steps: SopStepData[];
    edges: SopEdge[];
    reviewStatus: SopReviewStatus;
    agentizationReview?: SopAgentizationReview;
    createdAt: string;
    updatedAt: string;
    isSampleData?: boolean;
    /**
     * Discriminator for the newer Activity–Sub Action document shape. Absent on
     * every legacy document, which keeps its existing (possibly multi-Activity
     * per step) graph semantics unchanged. Never stamp this onto a document that
     * was not actually generated/migrated into the new shape.
     */
    structureVersion?: 'activity-subaction-v1';
    /**
     * 문서 수준 Mission (목표·성공 기준·전역 제약·glossary). node마다 복제하지
     * 않는다. Additive-optional — legacy 문서에는 없다.
     */
    agentInstruction?: SopAgentInstructionSpec;
    /**
     * node 작성 계약 버전. `structureVersion`과 같은 규칙을 따른다: 실제로 그
     * 계약으로 생성·검증된 문서에만 찍고, 마이그레이션이 legacy 문서에 소급해서
     * 찍지 않는다 (NODE_AUTHORING_AND_AGENT_CONTROL.md §4.4).
     */
    instructionContractVersion?: SopNodeInstructionContractVersion;
    /** Provenance only — set once when a colleague-template clone is first saved. Never re-derived. */
    sourceTemplateId?: string;
    /** Provenance only — set once when an own-prior clone is first saved. Never set together with sourceTemplateId; never re-derived. */
    sourceRecordId?: string;
    /**
     * Explicit creation-path provenance. Absent on every document created
     * before this field existed — see `resolveCreationSource` for the
     * read-time fallback (never eagerly rewritten into old documents).
     */
    creationSource?: 'task' | 'colleague-template' | 'own-prior';
}

/**
 * Read-time fallback for documents saved before `creationSource` existed —
 * this repo's established migration convention (see `structureVersion`) is an
 * optional field with a fallback reader, not an eager rewrite script. A
 * document actually stamped with `creationSource` always wins; only a legacy,
 * unstamped document falls back to inferring 'colleague-template' from
 * `sourceTemplateId`, or 'task' otherwise (the only two creation paths that
 * existed before `own-prior` was introduced).
 */
export function resolveCreationSource(document: Pick<SopDocument, 'creationSource' | 'sourceTemplateId'>): 'task' | 'colleague-template' | 'own-prior' {
    if (document.creationSource) return document.creationSource;
    return document.sourceTemplateId ? 'colleague-template' : 'task';
}
