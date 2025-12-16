'use client';

import { BaseEdge, EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

// 선택 가능한 기본 엣지 (호버/선택 시 강조)
export function SelectableEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    selected,
    data,
}: EdgeProps) {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // 선택/호버 상태에 따른 스타일
    const strokeColor = selected ? '#6366f1' : '#71717A';
    const strokeWidth = selected ? 3 : 2;
    const glowFilter = selected ? 'drop-shadow(0 0 4px rgba(99, 102, 241, 0.5))' : 'none';

    return (
        <>
            {/* 투명한 히트 영역 (클릭 감지 용이) */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer"
            />
            
            {/* 실제 엣지 */}
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    ...style,
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    filter: glowFilter,
                    transition: 'stroke 0.2s, stroke-width 0.2s, filter 0.2s',
                }}
            />

            {/* 선택 시 라벨 표시 */}
            {selected && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                        }}
                        className="bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full shadow-lg font-medium"
                    >
                        우클릭: 메뉴
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

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
    selected,
    data,
}: EdgeProps) {
    const [edgePath, labelX, labelY] = getBezierPath({
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
    
    // 선택 상태
    const strokeColor = selected 
        ? '#6366f1' 
        : speed === 'slow' ? '#fbbf24' : '#6366f1';
    const strokeWidth = selected ? 4 : 2;
    const glowFilter = selected ? 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.6))' : 'none';

    return (
        <>
            {/* 투명한 히트 영역 */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer"
            />

            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    ...style,
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    filter: glowFilter,
                    transition: 'stroke 0.2s, stroke-width 0.2s',
                }}
            />

            {/* 움직이는 토큰 (파티클) */}
            <circle r="4" fill={tokenColor} filter="drop-shadow(0 0 4px currentColor)">
                <animateMotion dur={duration} repeatCount="indefinite" path={edgePath} />
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

            {/* 선택 시 라벨 */}
            {selected && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                        }}
                        className="bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full shadow-lg font-medium"
                    >
                        우클릭: 메뉴
                    </div>
                </EdgeLabelRenderer>
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
    selected,
}: EdgeProps) {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const strokeColor = selected ? '#6366f1' : '#6366f1';
    const strokeWidth = selected ? 4 : 2;
    const glowFilter = selected ? 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.6))' : 'none';

    return (
        <>
            {/* 투명한 히트 영역 */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer"
            />

            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    ...style,
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    filter: glowFilter,
                    transition: 'stroke 0.2s, stroke-width 0.2s',
                }}
            />

            {selected && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                        }}
                        className="bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full shadow-lg font-medium"
                    >
                        우클릭: 메뉴
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

// 엣지 타입 내보내기
export const edgeTypes = {
    default: SelectableEdge,
    selectable: SelectableEdge,
    tokenFlow: TokenFlowEdge,
    smooth: SmoothEdge,
};
