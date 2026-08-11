/**
 * AI 생성 경로(As-Is/To-Be 생성, 드릴다운, 노드 분할) 전반에서 재사용하는 프롬프트 가이드 상수의
 * 단일 출처. 여러 프롬프트에 같은 설명을 복붙하는 대신 이 파일에서 관리한다.
 */

// ----------------------------------------------------------------------------
// 25개 표준 도형 선택 가이드
// ----------------------------------------------------------------------------

/**
 * 25개 canonical shape 전체의 의미/선택 기준. As-Is/To-Be 생성, 드릴다운(인간/Agent), 노드 분할
 * 프롬프트가 모두 이 상수를 그대로 재사용한다.
 */
export const FULL_SHAPE_SELECTION_GUIDE = `## 표준 도형(shape) 선택 기준 - 단계의 실제 기능에 맞는 도형을 고르세요
- shape='terminal': 시작, 완료, 중단, 종료
- shape='process': 특화된 의미가 없는 일반 처리 (의미가 모호할 때만 기본값으로 사용)
- shape='decision': 승인·합격·수락 여부, 조건 판단, 분기 ("~여부", "~인가?"처럼 질문형 레이블)
- shape='data': 일반 데이터 입력·출력·수신·전송
- shape='document': 계약서, 보고서, 신청서, 공문 등 문서 생성·검토
- shape='predefinedProcess': 이미 정의된 하위 절차나 외부 서비스 호출
- shape='database': DB 조회·저장·갱신
- shape='internalStorage': 애플리케이션 내부 상태, 세션, 캐시
- shape='storedData': 파일, 백업, 로그, 아카이브 데이터
- shape='manualInput': 사용자의 폼 입력, 키보드 입력, 스캔 입력
- shape='manualOperation': 오프라인 검수, 수기 작업, 사람의 물리적 처리
- shape='preparation': 사전 준비, 환경 설정, 초기화
- shape='display': 화면, 대시보드, 사용자 알림 표시
- shape='delay': 일정 시간 대기, 보류, 응답 대기
- shape='connector': 같은 화면 안의 복잡한 연결 참조
- shape='offPageConnector': 다른 페이지나 다른 프로세스 도면으로 이동
- shape='merge': 여러 실행 경로가 하나로 합류
- shape='extract': 데이터나 후보군에서 일부 항목 추출
- shape='sort': 점수순 정렬, 우선순위 조율, 순위 결정
- shape='collate': 여러 목록·자료·결과를 대조하고 취합
- shape='or': 둘 이상의 조건 중 하나 이상 충족 여부
- shape='card': 카드형 레코드나 레거시 카드 데이터
- shape='stream': 실시간 이벤트·연속 데이터 흐름
- shape='queuedData': Kafka, RabbitMQ, SQS, 작업 대기열, 이벤트 버퍼 (일반 대기는 'delay', 일반 입출력은 'data', 페이지 연결은 'connector'와 구분)
- shape='loopLimit': 최대 반복 횟수, 재시도 한계, 반복 종료 조건

### decision과 sort를 혼동하지 마세요
"동점자가 발생했는가?"처럼 여부/조건을 판단하는 단계는 shape='decision'이고,
"동점자를 기준에 따라 순위화한다"처럼 순서를 정하는 단계는 shape='sort'입니다.
"우선순위 조율"류 단계가 무조건 process나 decision으로만 생성되지 않도록 하세요.

25개를 골고루 쓰는 것이 목표가 아닙니다 - 의미가 명확할 때만 특화 도형을 고르고, 모호하면 process/decision/data 같은 기본 도형을 쓰세요.`;

/**
 * 하나의 레이블에 여러 의미가 섞였을 때 단일 process로 뭉개지 말고 의미 단위로 분해하도록 안내.
 * 드릴다운과 노드 분할처럼 하나의 단계를 여러 하위 단계로 쪼개는 프롬프트에서 사용한다.
 */
export const MULTI_MEANING_SPLIT_GUIDE = `## 단계 분해 시 도형 선택
하나의 레이블에 여러 의미가 섞여 있으면 무조건 process 하나로 만들지 말고, 가능하면 의미 단위로 분리해 각각에 맞는 shape를 부여하세요.

예: "처우 협의 및 계약서 작성"
- 처우 조건 협의 -> type='process', shape='process' 또는 'manualOperation'
- 조건 수락 여부 -> type='decision', shape='decision'
- 근로계약서 작성 -> type='process', shape='document'

다른 예:
- "지원자 점수 집계" -> shape='process' 또는 'collate'
- "지원자 점수순 정렬" -> shape='sort'
- "동점자 발생 여부" -> shape='decision'
- "동점자 우선순위 조율" -> shape='sort'
- "서류 합격자 추출" -> shape='extract'
- "면접 결과 취합" -> shape='collate'
- "면접 결과 통보 화면 표시" -> shape='display'
- "후보자 응답 대기" -> shape='delay'
- "채용 시스템 입력" -> shape='manualInput'
- "계약서 작성" -> shape='document'

"우선순위 조율"처럼 순서를 정하는 단계가 일반 process나 decision으로만 생성되지 않게 하세요.`;

/** Zod `.describe()` 필드용 축약 버전 - 스키마 설명은 요청 토큰에 그대로 실리므로 짧게 유지. */
export const SHAPE_FIELD_DESCRIBE_HINT =
    '단계의 실제 기능에 부합하는 표준 도형 (필수). 예: decision=승인/여부/조건판단, sort=우선순위·정렬, document=계약서/보고서, extract=추출, collate=취합, queuedData=메시지 큐, loopLimit=최대 반복·재시도 한계. 의미가 모호하면 process/data 등 기본 도형 사용';

// ----------------------------------------------------------------------------
// 분기(decision) edge 작성 가이드
// ----------------------------------------------------------------------------

/**
 * decision 노드가 실질적인 YES/NO 분기(및 필요 시 되돌아가는 재시도 경로)를 갖도록 하는 edge 작성 규칙.
 * As-Is/To-Be 생성과 드릴다운(subEdges) 프롬프트가 공유한다.
 */
export const BRANCH_EDGE_GUIDE = `## 분기(decision) edge 작성 규칙
decision 노드에는 반드시 서로 다른 target을 가진 outgoing edge를 2개 이상 작성하세요. 나가는 edge가 1개뿐이거나, 동일한 target으로 향하는 중복(가짜) 분기는 잘못된 결과입니다.
decision에서 나가는 모든 edge는 branchType을 반드시 지정해야 합니다 (branchType 생략이나 'default'는 decision edge에 금지됩니다).

decision의 outgoing edge는 다음 두 형태 중 하나로 작성하세요.

### 1. 이진 판단 (합격/불합격, 승인/반려, 수락/거절 등)
- 정확히 2개의 edge만 만드세요. 하나는 label='YES', branchType='yes', 다른 하나는 label='NO', branchType='no'로 지정하세요.
- YES를 2개 만들거나 NO를 2개 만들지 마세요 - 각각 정확히 1개씩만 허용됩니다.

### 2. 다중 조건 분기 (3개 이상의 갈래로 나뉘거나, 세부 조건별로 다른 경로가 필요한 경우)
- 2개 이상의 edge를 만들고, 각 edge에 branchType='condition'과 함께 비어 있지 않은 label, condition(분기 근거 설명)을 반드시 지정하세요.
- 서로 다른 condition edge끼리 label이나 condition 내용이 중복되지 않게 하세요.
- 이진 판단(yes/no)과 다중 조건(condition)을 함께 쓸 수도 있습니다 - 예: "수락(yes)" / "조건부 재협의(condition)" / "최대 재시도 초과 시 최종 거절(no)"처럼 실제로 의미가 다른 3갈래 분기는 허용됩니다. 다만 yes와 no는 각각 최대 1개까지만 쓰고, 나머지 갈래는 condition으로 작성하세요.

### 공통 규칙
- NO/반려/거절 경로는 흐름을 끊지 말고, 이전 단계로 되돌아가거나(예: 후보자 재검토, 조건 재협의) 별도의 종료 경로로 연결하세요.
- 반복 재시도를 표현할 때는 최대 횟수나 한계를 나타내는 shape='loopLimit' 노드를 추가로 배치하는 것을 고려하세요.
- 일반적인 순차 흐름의 edge는 label/branchType을 생략해도 됩니다 (decision에서 나가는 edge만 반드시 지정).
- edge의 source/target은 실제로 존재하는 노드 id만 참조하세요 (존재하지 않는 id, 고립된 노드 금지).
- 시작 노드로 들어오는 edge나 종료 노드에서 나가는 edge는 만들지 마세요.`;
