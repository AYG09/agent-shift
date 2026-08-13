'use client';

import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import type { SopActivityGroupNodeData } from '@/lib/sop-canvas-utils';

/**
 * Read-only background container that shows which Activity a run of Sub
 * Action nodes belongs to — the customer's expected SOP design groups Sub
 * Actions inside their parent Activity section ("1. 대상자 추출" 등).
 *
 * Never interactive: buildSopActivityGroupNodes marks the node
 * non-draggable/non-selectable with pointer-events disabled, so it can never
 * intercept clicks, drags, or edge connections meant for the real step nodes
 * it visually contains.
 */
export const SopActivityGroupNode = memo(({ data }: NodeProps) => {
    const { label, showFullLabel, width, height } = data as SopActivityGroupNodeData;

    return (
        <div
            className="pointer-events-none relative rounded-2xl border-2 border-dashed border-violet-300/80 bg-violet-50/35"
            style={{ width, height }}
        >
            <span
                className={`absolute -top-3 left-3 inline-flex max-w-[85%] items-center truncate rounded-md border px-2 py-0.5 text-[11px] font-bold shadow-sm ${
                    showFullLabel
                        ? 'border-violet-300 bg-white text-violet-700'
                        : 'border-violet-200 bg-white/90 text-violet-400'
                }`}
                title={label}
            >
                {showFullLabel ? label : `${label} (계속)`}
            </span>
        </div>
    );
});

SopActivityGroupNode.displayName = 'SopActivityGroupNode';
