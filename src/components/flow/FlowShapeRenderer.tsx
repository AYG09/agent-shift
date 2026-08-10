'use client';

import React from 'react';
import { type FlowShape, normalizeFlowShape } from '@/lib/flow-shapes';

interface FlowShapeRendererProps {
    shape?: string;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    className?: string;
    children?: React.ReactNode;
}

export const FlowShapeRenderer: React.FC<FlowShapeRendererProps> = ({
    shape: rawShape,
    width,
    height,
    fill = 'white',
    stroke = '#94a3b8',
    strokeWidth = 2,
    className = '',
    children,
}) => {
    const shape: FlowShape = normalizeFlowShape(rawShape);

    const pad = Math.max(strokeWidth, 2);
    const w = Math.max(width - pad * 2, 10);
    const h = Math.max(height - pad * 2, 10);

    const renderShapeElements = () => {
        switch (shape) {
            case 'terminal':
                return (
                    <rect
                        x={pad}
                        y={pad}
                        width={w}
                        height={h}
                        rx={h / 2}
                        ry={h / 2}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                    />
                );

            case 'process':
                return (
                    <rect
                        x={pad}
                        y={pad}
                        width={w}
                        height={h}
                        rx={8}
                        ry={8}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                    />
                );

            case 'decision': {
                const points = `${width / 2},${pad} ${width - pad},${height / 2} ${width / 2},${height - pad} ${pad},${height / 2}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'data': {
                const slant = w * 0.16;
                const points = `${pad + slant},${pad} ${width - pad},${pad} ${width - pad - slant},${height - pad} ${pad},${height - pad}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'document': {
                const waveH = 10;
                const pathStr = `M ${pad},${pad} L ${width - pad},${pad} L ${width - pad},${height - pad - waveH} Q ${width * 0.75},${height - pad} ${width * 0.5},${height - pad - waveH / 2} Q ${width * 0.25},${height - pad - waveH * 1.2} ${pad},${height - pad - waveH / 2} Z`;
                return (
                    <path
                        d={pathStr}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'predefinedProcess': {
                const inset = Math.min(w * 0.12, 14);
                return (
                    <g>
                        <rect
                            x={pad}
                            y={pad}
                            width={w}
                            height={h}
                            rx={6}
                            ry={6}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={pad + inset}
                            y1={pad}
                            x2={pad + inset}
                            y2={height - pad}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={width - pad - inset}
                            y1={pad}
                            x2={width - pad - inset}
                            y2={height - pad}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'database': {
                const ry = Math.min(h * 0.18, 12);
                const pathStr = `M ${pad},${pad + ry} A ${w / 2},${ry} 0 0,0 ${width - pad},${pad + ry} L ${width - pad},${height - pad - ry} A ${w / 2},${ry} 0 0,1 ${pad},${height - pad - ry} Z`;
                return (
                    <g>
                        <path
                            d={pathStr}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            strokeLinejoin="round"
                        />
                        <ellipse
                            cx={width / 2}
                            cy={pad + ry}
                            rx={w / 2}
                            ry={ry}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'internalStorage': {
                const insetX = Math.min(w * 0.12, 14);
                const insetY = Math.min(h * 0.18, 14);
                return (
                    <g>
                        <rect
                            x={pad}
                            y={pad}
                            width={w}
                            height={h}
                            rx={4}
                            ry={4}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={pad + insetX}
                            y1={pad}
                            x2={pad + insetX}
                            y2={height - pad}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={pad}
                            y1={pad + insetY}
                            x2={width - pad}
                            y2={pad + insetY}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'storedData': {
                const curveDepth = Math.min(w * 0.15, 16);
                const pathStr = `M ${pad + curveDepth},${pad} C ${pad},${pad + h * 0.25} ${pad},${pad + h * 0.75} ${pad + curveDepth},${height - pad} L ${width - pad - curveDepth},${height - pad} C ${width - pad},${pad + h * 0.75} ${width - pad},${pad + h * 0.25} ${width - pad - curveDepth},${pad} Z`;
                const leftArcStr = `M ${pad + curveDepth},${pad} C ${pad + curveDepth * 2},${pad + h * 0.25} ${pad + curveDepth * 2},${pad + h * 0.75} ${pad + curveDepth},${height - pad}`;
                return (
                    <g>
                        <path
                            d={pathStr}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            strokeLinejoin="round"
                        />
                        <path
                            d={leftArcStr}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'card': {
                const chamfer = Math.min(w * 0.15, 16);
                const points = `${pad + chamfer},${pad} ${width - pad},${pad} ${width - pad},${height - pad} ${pad},${height - pad} ${pad},${pad + chamfer}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'manualInput': {
                const drop = Math.min(h * 0.25, 18);
                const points = `${pad},${pad + drop} ${width - pad},${pad} ${width - pad},${height - pad} ${pad},${height - pad}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'manualOperation': {
                const inset = Math.min(w * 0.15, 18);
                const points = `${pad},${pad} ${width - pad},${pad} ${width - pad - inset},${height - pad} ${pad + inset},${height - pad}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'preparation': {
                const side = Math.min(w * 0.16, 18);
                const points = `${pad + side},${pad} ${width - pad - side},${pad} ${width - pad},${height / 2} ${width - pad - side},${height - pad} ${pad + side},${height - pad} ${pad},${height / 2}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'delay': {
                const r = h / 2;
                const straightW = Math.max(w - r, 10);
                const pathStr = `M ${pad},${pad} L ${pad + straightW},${pad} A ${r},${r} 0 0,1 ${pad + straightW},${height - pad} L ${pad},${height - pad} Z`;
                return (
                    <path
                        d={pathStr}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'display': {
                const tipW = Math.min(w * 0.18, 18);
                const curveW = Math.min(w * 0.2, 20);
                const pathStr = `M ${pad},${height / 2} L ${pad + tipW},${pad} L ${width - pad - curveW},${pad} Q ${width - pad},${height / 2} ${width - pad - curveW},${height - pad} L ${pad + tipW},${height - pad} Z`;
                return (
                    <path
                        d={pathStr}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'connector': {
                const r = Math.min(w, h) / 2;
                return (
                    <circle
                        cx={width / 2}
                        cy={height / 2}
                        r={r}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                    />
                );
            }

            case 'offPageConnector': {
                const topH = h * 0.65;
                const points = `${pad},${pad} ${width - pad},${pad} ${width - pad},${pad + topH} ${width / 2},${height - pad} ${pad},${pad + topH}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'merge': {
                const points = `${pad},${pad} ${width - pad},${pad} ${width / 2},${height - pad}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'extract': {
                const points = `${width / 2},${pad} ${width - pad},${height - pad} ${pad},${height - pad}`;
                return (
                    <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'sort': {
                const points = `${width / 2},${pad} ${width - pad},${height / 2} ${width / 2},${height - pad} ${pad},${height / 2}`;
                return (
                    <g>
                        <polygon
                            points={points}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            strokeLinejoin="round"
                        />
                        <line
                            x1={pad}
                            y1={height / 2}
                            x2={width - pad}
                            y2={height / 2}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'collate': {
                const r = Math.min(w, h) / 2;
                const cx = width / 2;
                const cy = height / 2;
                const offset = r * Math.SQRT1_2;
                return (
                    <g>
                        <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={cx - offset}
                            y1={cy - offset}
                            x2={cx + offset}
                            y2={cy + offset}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={cx + offset}
                            y1={cy - offset}
                            x2={cx - offset}
                            y2={cy + offset}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'or': {
                const r = Math.min(w, h) / 2;
                const cx = width / 2;
                const cy = height / 2;
                return (
                    <g>
                        <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={cx - r}
                            y1={cy}
                            x2={cx + r}
                            y2={cy}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={cx}
                            y1={cy - r}
                            x2={cx}
                            y2={cy + r}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                    </g>
                );
            }

            case 'stream': {
                const waveH = 8;
                const pathStr = `M ${pad},${pad + waveH} Q ${width * 0.25},${pad} ${width * 0.5},${pad + waveH} Q ${width * 0.75},${pad + waveH * 2} ${width - pad},${pad + waveH} L ${width - pad},${height - pad - waveH} Q ${width * 0.75},${height - pad - waveH * 2} ${width * 0.5},${height - pad - waveH} Q ${width * 0.25},${height - pad} ${pad},${height - pad - waveH} Z`;
                return (
                    <path
                        d={pathStr}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            case 'queuedData': {
                const cx = width / 2;
                const r = Math.min(w, h) * 0.38;
                const cy = pad + r + 2;
                const lineY = height - pad - 2;
                return (
                    <g>
                        <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />
                        <line
                            x1={cx - r * 1.15}
                            y1={lineY}
                            x2={cx + r * 1.15}
                            y2={lineY}
                            stroke={stroke}
                            strokeWidth={strokeWidth + 0.5}
                            strokeLinecap="round"
                        />
                    </g>
                );
            }

            case 'loopLimit': {
                const cut = Math.min(w, h) * 0.25;
                const pathStr = `M ${pad + cut},${pad} L ${width - pad - cut},${pad} L ${width - pad},${pad + cut} L ${width - pad},${height - pad} L ${pad},${height - pad} L ${pad},${pad + cut} Z`;
                return (
                    <path
                        d={pathStr}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                );
            }

            default:
                return (
                    <rect
                        x={pad}
                        y={pad}
                        width={w}
                        height={h}
                        rx={6}
                        ry={6}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                    />
                );
        }
    };

    return (
        <div className={`relative ${className}`} style={{ width, height }}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="absolute inset-0 overflow-visible"
            >
                {renderShapeElements()}
            </svg>
            {children && (
                <div className="absolute inset-0 flex items-center justify-center p-2 z-10 pointer-events-none">
                    <div className="pointer-events-auto w-full h-full flex flex-col items-center justify-center">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};
