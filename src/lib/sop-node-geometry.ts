import type { SopStepData } from './sop-types';

export interface SopNodeSize {
    width: number;
    height: number;
}

export interface SopNodeBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * The actual on-canvas footprint of a SOP step node. This is the single source
 * of truth shared by SopStepNode (what actually renders), sop-canvas-utils
 * (edge connection points), and sop-rework-routing (obstacle bounds for routed
 * rework lanes) — they must agree, or routed edges and hit-testing drift from
 * what the member actually sees.
 */
export function getSopNodeSize(step: Pick<SopStepData, 'shape'>): SopNodeSize {
    if (step.shape === 'decision') {
        return { width: 190, height: 120 };
    }
    return { width: 190, height: 74 };
}

export function getSopNodeBounds(step: SopStepData): SopNodeBounds {
    const { width, height } = getSopNodeSize(step);
    return {
        left: step.position.x,
        top: step.position.y,
        right: step.position.x + width,
        bottom: step.position.y + height,
    };
}
