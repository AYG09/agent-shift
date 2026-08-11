export const FLOW_SHAPE_IDS = [
    'terminal',
    'process',
    'decision',
    'data',
    'document',
    'predefinedProcess',
    'database',
    'internalStorage',
    'storedData',
    'manualInput',
    'manualOperation',
    'preparation',
    'display',
    'delay',
    'connector',
    'offPageConnector',
    'merge',
    'extract',
    'sort',
    'collate',
    'or',
    'card',
    'stream',
    'queuedData',
    'loopLimit',
] as const;

export type FlowShape = (typeof FLOW_SHAPE_IDS)[number];

export type ShapeCategory = 'basic' | 'doc_storage' | 'manual_prep' | 'connect_branch' | 'special';

export interface CategoryInfo {
    id: ShapeCategory | 'all';
    label: string;
    description: string;
}

export const SHAPE_CATEGORIES: CategoryInfo[] = [
    { id: 'all', label: '전체', description: '모든 도형' },
    { id: 'basic', label: '기본', description: '시작/종료, 처리, 판단, 입출력 데이터' },
    { id: 'doc_storage', label: '문서 · 저장', description: '문서, DB, 하위 프로세스, 저장소, 대기열' },
    { id: 'manual_prep', label: '수동 · 준비', description: '수동 입력/작업, 준비, 대기, 화면' },
    { id: 'connect_branch', label: '연결 · 분기', description: '커넥터, 참조, 병합, 추출, 정렬, 취합, 루프한계' },
    { id: 'special', label: '특수', description: '데이터 스트림 등 특수 흐름' },
];

export interface ShapeDefinition {
    id: FlowShape;
    name: string;
    description: string;
    recommendedFor: string;
    category: ShapeCategory;
    defaultWidth: number;
    defaultHeight: number;
}

export const FLOW_SHAPES: Record<FlowShape, ShapeDefinition> = {
    terminal: {
        id: 'terminal',
        name: '시작 / 종료',
        description: '프로세스의 시작점 또는 종료점을 나타냅니다.',
        recommendedFor: '시작, 완료, 종료, 중단 단계',
        category: 'basic',
        defaultWidth: 160,
        defaultHeight: 60,
    },
    process: {
        id: 'process',
        name: '일반 처리',
        description: '일반적인 작업, 업무 수행, 데이터 가공 단계를 나타냅니다.',
        recommendedFor: '일반 수행 과업, 데이터 가공, 시스템 연동',
        category: 'basic',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    decision: {
        id: 'decision',
        name: '조건 판단',
        description: '조건에 따른 의사결정 및 분기점을 나타냅니다.',
        recommendedFor: '승인 여부 확인, 조건 비교, 예/아니오 분기',
        category: 'basic',
        defaultWidth: 130,
        defaultHeight: 110,
    },
    data: {
        id: 'data',
        name: '데이터 입출력',
        description: '정보/데이터의 입력 또는 출력 단계를 나타냅니다.',
        recommendedFor: '데이터 수신, 외부 송신, 입력 파라미터',
        category: 'basic',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    document: {
        id: 'document',
        name: '문서',
        description: '보고서, 계약서, 신청서 등 물리적/전자 문서를 나타냅니다.',
        recommendedFor: '문서 작성, 기안서 발송, 보고서 인쇄',
        category: 'doc_storage',
        defaultWidth: 160,
        defaultHeight: 90,
    },
    predefinedProcess: {
        id: 'predefinedProcess',
        name: '사전 정의된 프로세스',
        description: '별도 정의된 하위 절차나 모듈 호출을 나타냅니다.',
        recommendedFor: '서브루틴 호출, 공통 모듈 실행, 템플릿',
        category: 'doc_storage',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    database: {
        id: 'database',
        name: '데이터베이스',
        description: 'RDBMS나 NoSQL 등 데이터베이스 저장소를 나타냅니다.',
        recommendedFor: 'DB 조회, 데이터 저장, 쿼리 실행',
        category: 'doc_storage',
        defaultWidth: 160,
        defaultHeight: 90,
    },
    internalStorage: {
        id: 'internalStorage',
        name: '내부 저장소',
        description: '메모리 캐시, 중앙 내부 스토리지 단계를 나타냅니다.',
        recommendedFor: '메모리 저장, 내부 캐싱, 세션 보관',
        category: 'doc_storage',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    storedData: {
        id: 'storedData',
        name: '보관된 데이터',
        description: '디스크, 백업 매체 등에 저장된 정적 데이터를 나타냅니다.',
        recommendedFor: '백업 아카이브, 파일 보관, 영구 저장',
        category: 'doc_storage',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    manualInput: {
        id: 'manualInput',
        name: '수동 입력',
        description: '사용자가 키보드/마우스 등으로 직접 입력하는 단계입니다.',
        recommendedFor: '폼 입력, 키보드 타이핑, 사용자 스캔',
        category: 'manual_prep',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    manualOperation: {
        id: 'manualOperation',
        name: '수동 작업',
        description: '시스템 밖에서 사람이 직접 수행하는 작업입니다.',
        recommendedFor: '실물 서류 정리, 오프라인 검수, 물리적 이동',
        category: 'manual_prep',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    preparation: {
        id: 'preparation',
        name: '준비 / 초기화',
        description: '환경 설정, 변수 초기화 등 사전 준비 단계입니다.',
        recommendedFor: '변수 초기화, 도구 세팅, 사전 점검',
        category: 'manual_prep',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    display: {
        id: 'display',
        name: '화면 표시',
        description: '모니터, 대시보드 등에 결과를 보여주는 단계입니다.',
        recommendedFor: '대시보드 출력, 화면 모니터링, 알림 표시',
        category: 'manual_prep',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    delay: {
        id: 'delay',
        name: '대기 / 지연',
        description: '시간 지연, 대기 상태를 나타냅니다.',
        recommendedFor: '응답 대기, 타이머 타임아웃, 보류',
        category: 'manual_prep',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    connector: {
        id: 'connector',
        name: '커넥터 (페이지 내)',
        description: '동일 페이지 내 흐름을 연결하는 교차점입니다.',
        recommendedFor: '흐름 연결, 번호 연결점, 라벨 분기',
        category: 'connect_branch',
        defaultWidth: 80,
        defaultHeight: 80,
    },
    offPageConnector: {
        id: 'offPageConnector',
        name: '오프페이지 커넥터',
        description: '다른 페이지나 다른 문서로 이어지는 연결점입니다.',
        recommendedFor: '다음 페이지 참조, 외부 플로우 연동',
        category: 'connect_branch',
        defaultWidth: 130,
        defaultHeight: 90,
    },
    merge: {
        id: 'merge',
        name: '병합',
        description: '여러 처리 흐름이 하나로 합쳐지는 지점입니다.',
        recommendedFor: '흐름 합류, 데이터 병합, 결과 수집',
        category: 'connect_branch',
        defaultWidth: 100,
        defaultHeight: 90,
    },
    extract: {
        id: 'extract',
        name: '추출',
        description: '하나의 흐름에서 조건별 요소를 분류 및 추출하는 단계입니다.',
        recommendedFor: '데이터 추출, 특정 항목 분리',
        category: 'connect_branch',
        defaultWidth: 130,
        defaultHeight: 90,
    },
    sort: {
        id: 'sort',
        name: '정렬',
        description: '데이터나 항목을 순서대로 정렬하는 단계입니다.',
        recommendedFor: '오름차순/내림차순 정렬, 순서 분류',
        category: 'connect_branch',
        defaultWidth: 120,
        defaultHeight: 100,
    },
    collate: {
        id: 'collate',
        name: '취합',
        description: '여러 목록을 하나의 표준 순서로 맞추어 맞대보는 단계입니다.',
        recommendedFor: '목록 대조, 데이터 맞춤 검증',
        category: 'connect_branch',
        defaultWidth: 110,
        defaultHeight: 100,
    },
    or: {
        id: 'or',
        name: '논리 OR 분기',
        description: '여러 조건 중 하나 이상을 만족할 때의 분기점입니다.',
        recommendedFor: 'OR 조건 분기, 선택적 합류',
        category: 'connect_branch',
        defaultWidth: 90,
        defaultHeight: 90,
    },
    card: {
        id: 'card',
        name: '천공 카드 / 천공 데이터',
        description: '카드 기반 입출력 또는 레거시 기록 매체 단계입니다.',
        recommendedFor: '카드 데이터 입력, 수기 기입 카드',
        category: 'special',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    stream: {
        id: 'stream',
        name: '데이터 스트림',
        description: '실시간으로 이어지는 스트리밍 데이터 흐름입니다.',
        recommendedFor: '실시간 파이프라인, 메시지 큐, 파스',
        category: 'special',
        defaultWidth: 160,
        defaultHeight: 80,
    },
    queuedData: {
        id: 'queuedData',
        name: '대기열 데이터',
        description: '순서가 지정된 대기열 또는 큐(Queue)에 보관된 데이터를 나타냅니다.',
        recommendedFor: '메시지 큐, 작업 대기열, 순차 처리 데이터',
        category: 'doc_storage',
        defaultWidth: 90,
        defaultHeight: 90,
    },
    loopLimit: {
        id: 'loopLimit',
        name: '반복 한계',
        description: '반복 루프의 회수 한계 및 루프 구간의 제어를 나타냅니다.',
        recommendedFor: '루프 한계 지정, 반복 처리 임계점, for/while 제어',
        category: 'connect_branch',
        defaultWidth: 140,
        defaultHeight: 80,
    },
};

export const ALL_SHAPES: ShapeDefinition[] = FLOW_SHAPE_IDS.map((id) => FLOW_SHAPES[id]);

// 도형별 4방향 연결점 (Handle Anchors) - SVG 외곽선 맞춤 좌표 (x, y 퍼센트)
export interface HandleAnchors {
    top: { x: string; y: string };
    right: { x: string; y: string };
    bottom: { x: string; y: string };
    left: { x: string; y: string };
}

export const SHAPE_HANDLE_ANCHORS: Record<FlowShape, HandleAnchors> = {
    terminal: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    process: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    decision: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    data: { top: { x: '58%', y: '0%' }, right: { x: '92%', y: '50%' }, bottom: { x: '42%', y: '100%' }, left: { x: '8%', y: '50%' } },
    document: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '45%' }, bottom: { x: '50%', y: '90%' }, left: { x: '0%', y: '45%' } },
    predefinedProcess: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    database: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    internalStorage: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    storedData: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '7%', y: '50%' } },
    manualInput: { top: { x: '50%', y: '12.5%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '56.25%' } },
    manualOperation: { top: { x: '50%', y: '0%' }, right: { x: '91%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '9%', y: '50%' } },
    preparation: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    display: { top: { x: '50%', y: '0%' }, right: { x: '96%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    delay: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    connector: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    offPageConnector: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '32.5%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '32.5%' } },
    merge: { top: { x: '50%', y: '0%' }, right: { x: '75%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '25%', y: '50%' } },
    extract: { top: { x: '50%', y: '0%' }, right: { x: '75%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '25%', y: '50%' } },
    sort: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    collate: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    or: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
    card: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '55%' } },
    stream: { top: { x: '50%', y: '5%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '95%' }, left: { x: '0%', y: '50%' } },
    queuedData: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '45%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '45%' } },
    loopLimit: { top: { x: '50%', y: '0%' }, right: { x: '100%', y: '50%' }, bottom: { x: '50%', y: '100%' }, left: { x: '0%', y: '50%' } },
};

// 도형별 내부 콘텐츠 안전영역 (Content Bounds) 정의 - 투명/사선 모서리 방지
export interface ContentBounds {
    top: string;
    right: string;
    bottom: string;
    left: string;
    maxLines?: number;
    compact?: boolean;
}

export const SHAPE_CONTENT_BOUNDS: Record<FlowShape, ContentBounds> = {
    terminal: { top: '10%', right: '12%', bottom: '10%', left: '12%' },
    process: { top: '8%', right: '8%', bottom: '8%', left: '8%' },
    decision: { top: '22%', right: '22%', bottom: '22%', left: '22%', maxLines: 2 },
    data: { top: '10%', right: '16%', bottom: '10%', left: '16%' },
    document: { top: '8%', right: '8%', bottom: '20%', left: '8%' },
    predefinedProcess: { top: '10%', right: '12%', bottom: '10%', left: '12%' },
    database: { top: '16%', right: '8%', bottom: '16%', left: '8%' },
    internalStorage: { top: '10%', right: '12%', bottom: '10%', left: '12%' },
    storedData: { top: '8%', right: '8%', bottom: '8%', left: '12%' },
    manualInput: { top: '22%', right: '8%', bottom: '8%', left: '8%' },
    manualOperation: { top: '8%', right: '14%', bottom: '8%', left: '14%' },
    preparation: { top: '8%', right: '18%', bottom: '8%', left: '18%' },
    display: { top: '8%', right: '18%', bottom: '8%', left: '10%' },
    delay: { top: '8%', right: '18%', bottom: '8%', left: '8%' },
    connector: { top: '15%', right: '15%', bottom: '15%', left: '15%', compact: true, maxLines: 1 },
    offPageConnector: { top: '8%', right: '10%', bottom: '25%', left: '10%', maxLines: 2 },
    merge: { top: '8%', right: '22%', bottom: '28%', left: '22%', compact: true, maxLines: 1 },
    extract: { top: '28%', right: '22%', bottom: '8%', left: '22%', compact: true, maxLines: 1 },
    sort: { top: '20%', right: '20%', bottom: '20%', left: '20%', compact: true, maxLines: 1 },
    collate: { top: '18%', right: '18%', bottom: '18%', left: '18%', compact: true, maxLines: 1 },
    or: { top: '15%', right: '15%', bottom: '15%', left: '15%', compact: true, maxLines: 1 },
    card: { top: '8%', right: '8%', bottom: '8%', left: '14%' },
    stream: { top: '12%', right: '12%', bottom: '12%', left: '12%' },
    queuedData: { top: '15%', right: '15%', bottom: '25%', left: '15%', compact: true, maxLines: 1 },
    loopLimit: { top: '20%', right: '12%', bottom: '8%', left: '12%', maxLines: 2 },
};

// 빠른 조회를 위한 Set 및 Case-Insensitive Map 생성
const CANONICAL_SHAPE_SET = new Set<string>(FLOW_SHAPE_IDS);
const CASE_INSENSITIVE_CANONICAL_MAP = new Map<string, FlowShape>();
FLOW_SHAPE_IDS.forEach((id) => {
    CASE_INSENSITIVE_CANONICAL_MAP.set(id.toLowerCase(), id);
});

// 레거시 Alias 매핑 (Case-Insensitive)
const LEGACY_ALIAS_MAP: Record<string, FlowShape> = {
    rectangle: 'process',
    diamond: 'decision',
    parallelogram: 'data',
    hexagon: 'preparation',
    pill: 'terminal',
    rounded: 'terminal',
};

/**
 * label/description의 키워드로 도형을 추론하는 의미 기반 fallback.
 *
 * type만 보고 무조건 'process'로 되돌리는 대신, 레이블에 담긴 구체적 의미
 * (예: "우선순위 조율" -> sort, "계약서 작성" -> document)를 최대한 반영한다.
 * 25개를 골고루 쓰기 위한 것이 아니라 - 의미가 명확할 때만 특화 도형을 고르고,
 * 모호하면 그대로 'process'/'decision'/'data' 등 구조적 fallback으로 떨어진다.
 */
export interface ShapeInferenceInput {
    label?: string;
    description?: string;
    type?: string;
    terminalType?: string;
    ioType?: string;
    shape?: string;
}

// 검사 순서가 중요하다: 더 구체적인(희소한) 도형을 먼저 검사해야
// "저장"처럼 폭넓은 키워드를 가진 일반 도형에 앞서 매칭된다.
const KEYWORD_SHAPE_RULES: Array<{ shape: FlowShape; keywords: string[] }> = [
    { shape: 'loopLimit', keywords: ['최대 반복', '재시도 한계', '반복 횟수', '루프 한계', '루프 임계', '최대 시도', '재협의 한계', '재시도 횟수', '반복 종료 조건'] },
    { shape: 'queuedData', keywords: ['kafka', 'rabbitmq', 'sqs', '메시지 큐', '작업 대기열', '이벤트 버퍼', '큐'] },
    { shape: 'sort', keywords: ['우선순위 조율', '순위 조율', '정렬', '순위화', '점수순'] },
    { shape: 'collate', keywords: ['취합', '대조', '맞춤 검증'] },
    { shape: 'extract', keywords: ['추출', '선별', '분리'] },
    { shape: 'document', keywords: ['계약서', '보고서', '신청서', '공문', '기안서', '기안'] },
    { shape: 'database', keywords: ['db 조회', 'db 저장', '데이터베이스', 'db 갱신'] },
    { shape: 'manualInput', keywords: ['폼 입력', '키보드 입력', '스캔 입력', '입력 화면'] },
    { shape: 'manualOperation', keywords: ['수기', '오프라인 검수', '물리적 처리', '물리적 이동'] },
    { shape: 'display', keywords: ['화면 표시', '대시보드', '알림 표시'] },
    { shape: 'delay', keywords: ['응답 대기', '보류', '대기'] },
    { shape: 'preparation', keywords: ['환경 설정', '초기화', '사전 준비', '사전 점검'] },
    { shape: 'or', keywords: ['하나 이상 충족', 'or 조건'] },
    { shape: 'merge', keywords: ['합류', '병합'] },
    { shape: 'predefinedProcess', keywords: ['하위 절차', '모듈 호출', '서브루틴', '외부 서비스 호출'] },
    { shape: 'storedData', keywords: ['백업', '아카이브', '로그 저장'] },
    { shape: 'internalStorage', keywords: ['세션', '캐시', '내부 상태'] },
    { shape: 'stream', keywords: ['실시간', '스트림'] },
    { shape: 'card', keywords: ['카드형', '천공 카드'] },
    { shape: 'offPageConnector', keywords: ['다른 페이지', '다른 프로세스 도면', '외부 프로세스'] },
    { shape: 'connector', keywords: ['연결점', '흐름 참조'] },
];

// "최대 3회", "최대 5번"처럼 반복/재시도 한계를 숫자로 명시한 표현은 loopLimit의 강한 신호.
const LOOP_LIMIT_COUNT_PATTERN = /최대\s*\d+\s*(회|번|차)/;

// "여부"/"인가"/"확인" 등은 조건 판단(decision)의 강한 신호. sort/집계 같은
// 키워드가 섞여 있어도 "동점자 발생 여부"는 decision이어야 하므로 최우선으로 검사한다.
const DECISION_TEXT_PATTERN = /여부|인가\?|확인\?|맞는지|승인.*여부|합격.*여부|수락.*여부/;

export function inferFlowShapeFromContent(input: ShapeInferenceInput): FlowShape {
    // 1. 이미 유효한 canonical shape면 그대로 신뢰
    if (input.shape && CANONICAL_SHAPE_SET.has(input.shape)) {
        return input.shape as FlowShape;
    }

    // 2. 구조적으로 명확한 신호(terminal/decision)가 텍스트 키워드보다 우선
    if (input.type === 'terminal' || input.terminalType) {
        return 'terminal';
    }

    const text = `${input.label || ''} ${input.description || ''}`.toLowerCase();

    if (input.type === 'decision' || DECISION_TEXT_PATTERN.test(text)) {
        return 'decision';
    }

    if (LOOP_LIMIT_COUNT_PATTERN.test(text)) {
        return 'loopLimit';
    }

    for (const rule of KEYWORD_SHAPE_RULES) {
        if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
            return rule.shape;
        }
    }

    if (input.type === 'io' || input.ioType) {
        return 'data';
    }
    if (input.type === 'subprocess') {
        return 'predefinedProcess';
    }

    // 3. 의미가 모호하면 구조적 fallback
    return 'process';
}

/**
 * 입력을 올바른 FlowShape로 정규화 (camelCase 보존 & 호환성 처리)
 *
 * label/description을 함께 전달하면 shape가 없거나 무효할 때 키워드 기반으로
 * 추론한다(inferFlowShapeFromContent). 생략하면 기존처럼 type 기반 추천만 적용된다.
 */
export function normalizeFlowShape(
    shape?: string,
    type?: string,
    terminalType?: string,
    ioType?: string,
    label?: string,
    description?: string
): FlowShape {
    if (!shape || typeof shape !== 'string') {
        return inferFlowShapeFromContent({ label, description, type, terminalType, ioType });
    }

    const trimmed = shape.trim();
    if (!trimmed) {
        return inferFlowShapeFromContent({ label, description, type, terminalType, ioType });
    }

    // 1. 원본 대소문자 그대로 canonical ID와 매칭 검사 (수동 지정 shape는 여기서 항상 그대로 반환됨)
    if (CANONICAL_SHAPE_SET.has(trimmed)) {
        return trimmed as FlowShape;
    }

    const lower = trimmed.toLowerCase();

    // 2. 레거시 Alias 검사 (Object.hasOwn으로 prototype 속성 오염 방지)
    if (Object.hasOwn(LEGACY_ALIAS_MAP, lower)) {
        if (lower === 'rounded') {
            return terminalType ? 'terminal' : 'process';
        }
        const mapped = LEGACY_ALIAS_MAP[lower];
        if (typeof mapped === 'string' && CANONICAL_SHAPE_SET.has(mapped)) {
            return mapped as FlowShape;
        }
    }

    // 3. 대소문자가 다른 canonical ID 검사 (e.g. predefinedprocess -> predefinedProcess)
    if (CASE_INSENSITIVE_CANONICAL_MAP.has(lower)) {
        const mapped = CASE_INSENSITIVE_CANONICAL_MAP.get(lower);
        if (mapped && CANONICAL_SHAPE_SET.has(mapped)) {
            return mapped;
        }
    }

    // 4. 매칭되는 도형이 없을 때 의미 기반 추론으로 fallback
    return inferFlowShapeFromContent({ label, description, type, terminalType, ioType });
}

export interface FlowShapePolicy {
    shape: FlowShape;
    bounds: ContentBounds;
    compact: boolean;
    maxLines: number;
}

/**
 * 도형 정규화 및 콘텐츠 정책 조회를 하나의 순수 함수로 단일화
 */
export function getFlowShapePolicy(
    shape?: string,
    type?: string,
    terminalType?: string,
    ioType?: string
): FlowShapePolicy {
    const normalizedShape = normalizeFlowShape(shape, type, terminalType, ioType);
    const bounds = SHAPE_CONTENT_BOUNDS[normalizedShape] || SHAPE_CONTENT_BOUNDS.process;
    const compact = !!bounds.compact;
    const maxLines = bounds.maxLines || (compact ? 1 : 2);
    return {
        shape: normalizedShape,
        bounds,
        compact,
        maxLines,
    };
}

/**
 * 노드 의미/기능(type)에 따른 추천 도형 반환
 */
export function getRecommendedShapeForType(
    type?: string,
    terminalType?: string,
    ioType?: string
): FlowShape {
    if (type === 'terminal' || terminalType) return 'terminal';
    if (type === 'decision') return 'decision';
    if (type === 'io' || ioType) return 'data';
    if (type === 'subprocess') return 'predefinedProcess';
    if (type === 'document') return 'document';
    if (type === 'database') return 'database';
    if (type === 'manualInput') return 'manualInput';
    if (type === 'manualOperation') return 'manualOperation';
    if (type === 'preparation') return 'preparation';
    if (type === 'display') return 'display';
    if (type === 'delay') return 'delay';
    if (type === 'connector') return 'connector';
    if (type === 'offPageConnector') return 'offPageConnector';
    if (type === 'merge') return 'merge';
    if (type === 'extract') return 'extract';
    if (type === 'sort') return 'sort';
    if (type === 'collate') return 'collate';
    if (type === 'or') return 'or';
    if (type === 'card') return 'card';
    if (type === 'stream') return 'stream';
    if (type === 'queuedData') return 'queuedData';
    if (type === 'loopLimit') return 'loopLimit';

    // 기본값은 process
    return 'process';
}
