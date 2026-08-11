'use client';

import { BaseEdge, EdgeLabelRenderer, EdgeProps } from '@xyflow/react';
import { SopReworkRoute, SopRoutePoint } from '@/lib/sop-rework-routing';

function roundedOrthogonalPath(points: SopRoutePoint[]) {
    if (points.length < 2) return '';
    const radius = 12;
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        const previous = points[index - 1];
        const next = points[index + 1];
        if (!next) {
            path += ` L ${point.x} ${point.y}`;
            continue;
        }

        const incomingLength = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
        const outgoingLength = Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
        const corner = Math.min(radius, incomingLength / 2, outgoingLength / 2);
        const before = {
            x: point.x + (previous.x > point.x ? corner : previous.x < point.x ? -corner : 0),
            y: point.y + (previous.y > point.y ? corner : previous.y < point.y ? -corner : 0),
        };
        const after = {
            x: point.x + (next.x > point.x ? corner : next.x < point.x ? -corner : 0),
            y: point.y + (next.y > point.y ? corner : next.y < point.y ? -corner : 0),
        };
        path += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
    }
    return path;
}

function getLabelPosition(points: SopRoutePoint[]) {
    const segments = points.slice(1).map((point, index) => {
        const previous = points[index];
        return {
            horizontal: previous.y === point.y,
            length: Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y),
            x: (previous.x + point.x) / 2,
            y: (previous.y + point.y) / 2,
        };
    });
    const best = [...segments].sort((a, b) => Number(b.horizontal) - Number(a.horizontal) || b.length - a.length)[0];
    return best ? { x: best.x, y: best.y - 12 } : { x: points[0].x, y: points[0].y };
}

/** Rework loops use their own routed rail, independent from the primary flow. */
export function SopReworkEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style,
    markerEnd,
    selected,
    data,
}: EdgeProps) {
    const route = data?.reworkRoute as SopReworkRoute | undefined;
    if (!route || route.points.length < 2) return null;

    const points = [{ x: sourceX, y: sourceY }, ...route.points.slice(1, -1), { x: targetX, y: targetY }];
    const path = roundedOrthogonalPath(points);
    const label = typeof data?.label === 'string' ? data.label : '';
    const labelPosition = getLabelPosition(points);
    const stroke = (style?.stroke as string) || '#f59e0b';

    return (
        <>
            <path d={path} fill="none" stroke="transparent" strokeWidth={20} className="cursor-pointer" />
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    stroke,
                    strokeWidth: selected ? 3.5 : 2.5,
                    strokeDasharray: '7 5',
                }}
            />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        className="rounded-md border bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm whitespace-nowrap pointer-events-none"
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -100%) translate(${labelPosition.x}px,${labelPosition.y}px)`,
                            color: stroke,
                            borderColor: `${stroke}55`,
                        }}
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
