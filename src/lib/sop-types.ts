import { type FlowShape } from './flow-shapes';

export type SopDisplayMode = 'compact' | 'standard' | 'detailed';
export type SopReviewStatus = 'ai-draft' | 'reviewed' | 'confirmed';
export type SopAgentizationScope = 'workflow' | 'steps';
/**
 * An unset step remains a human-performed step. Only explicit AI participation
 * is stored and surfaced in the workspace.
 */
export type SopAiApplicationMode = 'automation' | 'assist';

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
    name: string;
    jobRole: string;
    organization?: string;
}

export interface WorkLibrarySkill {
    id: string;
    name: string;
    description?: string;
}

export interface WorkLibraryActivity {
    id: string;
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
    sourceType: 'task' | 'activity';
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
    displayMode: SopDisplayMode;
    reviewStatus: SopReviewStatus;
    agentizationReview?: SopAgentizationReview;
    createdAt: string;
    updatedAt: string;
    isSampleData?: boolean;
}
