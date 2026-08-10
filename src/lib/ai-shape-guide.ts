/**
 * AI 생성 경로(As-Is/To-Be 생성, 드릴다운, 노드 분할) 전반에서 재사용하는
 * queuedData/loopLimit 도형 선택 기준의 단일 출처.
 *
 * 이 두 도형은 도형 카탈로그(flow-shapes.ts)·SVG·팔레트·Zod enum에는 등록돼 있지만
 * AI가 능동적으로 고를 근거가 프롬프트에 없으면 수동 선택 전용 도형으로 남는다.
 */
export const QUEUE_LOOP_SHAPE_GUIDE = `- shape='queuedData': 메시지 큐, 작업 대기열, 이벤트 버퍼, 순차 처리 대기 데이터, Kafka/RabbitMQ/SQS 등 큐 메시지 단계에 사용하세요. (일반적인 대기/보류는 'delay', 일반적인 입출력은 'data', 페이지 연결은 'connector'를 사용하고 queuedData와 혼동하지 마세요)
- shape='loopLimit': 최대 반복 횟수, 재시도 한계, 반복 종료 조건, 루프 임계점, 승인·검증의 제한 반복 단계에 사용하세요.`;

/** Zod `.describe()` 필드용 축약 버전 - 스키마 설명은 요청 토큰에 그대로 실리므로 짧게 유지. */
export const SHAPE_FIELD_DESCRIBE_HINT =
    '단계의 기능/의미에 부합하는 표준 도형. queuedData=메시지 큐/작업 대기열/이벤트 버퍼/Kafka·RabbitMQ·SQS 큐 메시지, loopLimit=최대 반복 횟수/재시도 한계/루프 임계점 등 단계에 사용 (일반 대기는 delay, 일반 입출력은 data, 페이지 연결은 connector와 구분)';
