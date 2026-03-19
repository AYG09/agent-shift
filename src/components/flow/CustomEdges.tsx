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
    const strokeColor = selected ? '#6366f1' : '#94a3b8';
    const strokeWidth = selected ? 2.5 : 1.5;
    const glowFilter = selected ? 'drop-shadow(0 0 4px rgba(99, 102, 241, 0.5))' : 'none';
    const arrowColor = selected ? '#6366f1' : '#6366f1';

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
            
            {/* 실제 엣지 - 화살표 마커 제거, 깔끔한 선만 */}
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

            {/* 움직이는 화살표 토큰 - 방향을 나타내는 세련된 삼각형 */}
            <polygon 
                points="-6,-4 6,0 -6,4" 
                fill={arrowColor}
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
            >
                <animateMotion 
                    dur="2.5s" 
                    repeatCount="indefinite" 
                    path={edgePath} 
                    rotate="auto"
                />
            </polygon>

            {/* 두 번째 화살표 토큰 (딜레이) */}
            <polygon 
                points="-4,-3 4,0 -4,3" 
                fill={arrowColor}
                opacity="0.5"
            >
                <animateMotion 
                    dur="2.5s" 
                    repeatCount="indefinite" 
                    path={edgePath} 
                    rotate="auto"
                    begin="1.25s"
                />
            </polygon>

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
    const duration = speed === 'slow' ? '4s' : '1.5s';
    const arrowColor = speed === 'slow' ? '#ef4444' : '#22c55e';
    
    // 선택 상태
    const strokeColor = selected 
        ? '#6366f1' 
        : speed === 'slow' ? '#fbbf24' : '#94a3b8';
    const strokeWidth = selected ? 2.5 : 1.5;
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

            {/* 움직이는 화살표 토큰 */}
            <polygon 
                points="-7,-5 7,0 -7,5" 
                fill={arrowColor}
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.2))"
            >
                <animateMotion 
                    dur={duration} 
                    repeatCount="indefinite" 
                    path={edgePath} 
                    rotate="auto"
                />
            </polygon>

            {/* 두 번째 화살표 토큰 (딜레이) */}
            <polygon 
                points="-5,-3.5 5,0 -5,3.5" 
                fill={arrowColor}
                opacity="0.6"
            >
                <animateMotion
                    dur={duration}
                    repeatCount="indefinite"
                    path={edgePath}
                    rotate="auto"
                    begin="0.5s"
                />
            </polygon>

            {/* 세 번째 화살표 토큰 (더 딜레이) - 빠른 속도일 때만 */}
            {speed === 'fast' && (
                <polygon 
                    points="-4,-2.5 4,0 -4,2.5" 
                    fill={arrowColor}
                    opacity="0.4"
                >
                    <animateMotion
                        dur={duration}
                        repeatCount="indefinite"
                        path={edgePath}
                        rotate="auto"
                        begin="0.25s"
                    />
                </polygon>
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

    const strokeColor = selected ? '#6366f1' : '#94a3b8';
    const strokeWidth = selected ? 2.5 : 1.5;
    const glowFilter = selected ? 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.6))' : 'none';
    const arrowColor = '#6366f1';

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

            {/* 움직이는 화살표 토큰 */}
            <polygon 
                points="-6,-4 6,0 -6,4" 
                fill={arrowColor}
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
            >
                <animateMotion 
                    dur="2.5s" 
                    repeatCount="indefinite" 
                    path={edgePath} 
                    rotate="auto"
                />
            </polygon>

            {/* 두 번째 화살표 토큰 */}
            <polygon 
                points="-4,-3 4,0 -4,3" 
                fill={arrowColor}
                opacity="0.5"
            >
                <animateMotion 
                    dur="2.5s" 
                    repeatCount="indefinite" 
                    path={edgePath} 
                    rotate="auto"
                    begin="1.25s"
                />
            </polygon>

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
