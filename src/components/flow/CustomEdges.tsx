'use client';

import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

// 토큰 시뮬레이션이 있는 애니메이션 엣지
export function TokenFlowEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // 속도 설정 (느림 = 병목, 빠름 = 효율적)
    const speed = (data?.speed as 'slow' | 'fast') || 'fast';
    const duration = speed === 'slow' ? '3s' : '1s';
    const tokenColor = speed === 'slow' ? '#ef4444' : '#22c55e';

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    ...style,
                    stroke: speed === 'slow' ? '#fbbf24' : '#6366f1',
                    strokeWidth: 2,
                }}
            />

            {/* 움직이는 토큰 (파티클) */}
            <circle r="4" fill={tokenColor} filter="drop-shadow(0 0 4px currentColor)">
                <animateMotion
                    dur={duration}
                    repeatCount="indefinite"
                    path={edgePath}
                />
            </circle>

            {/* 두 번째 토큰 (딜레이) */}
            <circle r="3" fill={tokenColor} opacity="0.6">
                <animateMotion
                    dur={duration}
                    repeatCount="indefinite"
                    path={edgePath}
                    begin="0.5s"
                />
            </circle>

            {/* 세 번째 토큰 (더 딜레이) */}
            {speed === 'fast' && (
                <circle r="2" fill={tokenColor} opacity="0.4">
                    <animateMotion
                        dur={duration}
                        repeatCount="indefinite"
                        path={edgePath}
                        begin="0.25s"
                    />
                </circle>
            )}
        </>
    );
}

// 기본 부드러운 엣지 (토큰 없음)
export function SmoothEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            style={{
                ...style,
                stroke: '#6366f1',
                strokeWidth: 2,
            }}
        />
    );
}

// 엣지 타입 내보내기
export const edgeTypes = {
    tokenFlow: TokenFlowEdge,
    smooth: SmoothEdge,
};
