import type { Edge } from '@xyflow/react';
import type { FlowEdge, FlowNode } from '@/lib/store';

export type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

export type AiFlowNodePayload = {
    id: string;
    type: string;
    terminalType?: string;
    ioType?: string;
    label: string;
    description?: string;
    stressLevel?: string;
    collaborationType?: string;
    agentDescription?: string;
    position: { x: number; y: number };
    metrics?: FlowNode['metrics'];
};

export type AiFlowEdgePayload = {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
};

export const FLOW_NODE_TYPES = [
    'terminal',
    'process',
    'decision',
    'io',
    'agent',
    'task',
    'subprocess',
] as const;

export const STRESS_LEVELS = ['low', 'medium', 'high'] as const;
export const COLLABORATION_TYPES = ['copilot', 'monitor', 'autonomous'] as const;
export const TERMINAL_TYPES = ['start', 'end'] as const;
export const IO_TYPES = ['input', 'output'] as const;

export function parseDurationString(
    durationStr?: string
): { duration: number; durationUnit: DurationUnit } | undefined {
    if (!durationStr) return undefined;

    const match = durationStr.match(/(\d+)\s*(분|시간|일|주|개월)/);
    if (!match) return undefined;

    const value = parseInt(match[1], 10);
    const unitMap: Record<string, DurationUnit> = {
        분: 'minutes',
        시간: 'hours',
        일: 'days',
        주: 'weeks',
        개월: 'months',
    };

    return {
        duration: value,
        durationUnit: unitMap[match[2]] || 'minutes',
    };
}

export function isFlowNodeType(type: string): type is FlowNode['type'] {
    return FLOW_NODE_TYPES.some((value) => value === type);
}

export function isStressLevel(value: string): value is NonNullable<FlowNode['stressLevel']> {
    return STRESS_LEVELS.some((item) => item === value);
}

export function isCollaborationType(
    value: string
): value is NonNullable<FlowNode['collaborationType']> {
    return COLLABORATION_TYPES.some((item) => item === value);
}

export function isTerminalType(value: string): value is NonNullable<FlowNode['terminalType']> {
    return TERMINAL_TYPES.some((item) => item === value);
}

export function isIoType(value: string): value is NonNullable<FlowNode['ioType']> {
    return IO_TYPES.some((item) => item === value);
}

export function normalizeNodeType(type: string): FlowNode['type'] {
    return isFlowNodeType(type) ? type : 'task';
}

export function normalizeStressLevel(stressLevel?: string): FlowNode['stressLevel'] {
    if (!stressLevel) return undefined;
    return isStressLevel(stressLevel) ? stressLevel : undefined;
}

export function normalizeCollaborationType(
    collaborationType?: string
): FlowNode['collaborationType'] {
    if (!collaborationType) return undefined;
    return isCollaborationType(collaborationType) ? collaborationType : undefined;
}

export function normalizeTerminalType(terminalType?: string): FlowNode['terminalType'] {
    if (!terminalType) return undefined;
    return isTerminalType(terminalType) ? terminalType : undefined;
}

export function normalizeIoType(ioType?: string): FlowNode['ioType'] {
    if (!ioType) return undefined;
    return isIoType(ioType) ? ioType : undefined;
}

export function mapAiNodesToStoreNodes(nodes: AiFlowNodePayload[]): FlowNode[] {
    return nodes.map((node) => ({
        id: node.id,
        type: normalizeNodeType(node.type),
        terminalType: normalizeTerminalType(node.terminalType),
        ioType: normalizeIoType(node.ioType),
        label: node.label,
        description: node.description,
        stressLevel: normalizeStressLevel(node.stressLevel),
        collaborationType: normalizeCollaborationType(node.collaborationType),
        agentDescription: node.agentDescription,
        position: node.position,
        metrics: node.metrics,
    }));
}

export function mapAiEdgesToStoreEdges(edges: AiFlowEdgePayload[]): FlowEdge[] {
    return edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
    }));
}

export function mapStoreEdgesToReactFlowEdges(edges: FlowEdge[]): Edge[] {
    return edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
    }));
}
