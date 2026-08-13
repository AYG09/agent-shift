# Activity–Sub Action 의미 계약

## 1. 분석 단위와 목적

- 분석 단위는 하나의 Task에 속한 Activity이다.
- Sub Action은 Activity를 실제 SOP 흐름과 AI Agent화 판단으로 변환하는 **최소 유효 실행 단위**이다.
- “최소”는 단어 수가 아니라 독립적으로 수행·배치·검토·Agent화 판단할 수 있는 수준을 뜻한다.
- Activity 설명을 그대로 한 노드로 복사하거나 모든 명사구를 노드로 만드는 것은 잘못이다.

## 2. Sub Action 판정 기준

다음 조건을 만족하는 행위만 Sub Action으로 만든다.

1. 행위자 또는 시스템이 실제로 수행할 수 있다.
2. 목적어와 동사를 포함한 행동으로 표현할 수 있다.
3. 선후 또는 병렬 관계를 지정할 수 있다.
4. 수행 완료 여부와 결과를 확인할 수 있다.
5. 다른 단계와 독립적으로 AI Agent화 가능성을 판단할 수 있다.

제목은 `대상 + 실행 동사` 형태를 우선한다. 예: `고객사와 공급 조건 협상`, `포트폴리오 최적화안 도출`.

## 3. Activity 문장 구성요소 분류

Activity 설명을 먼저 다음 다섯 범주로 분류한 뒤 흐름을 생성한다.

| 범주 | 처리 방식 |
|---|---|
| 실행 행동 | Sub Action 노드로 생성 |
| 선행 Activity의 결과·입력자료 | 현재 Sub Action의 `inputs`로 연결하고 중복 노드로 만들지 않음 |
| 산출물 | 해당 행동의 `outputs`로 기록하고, 산출물을 만드는 별도 행동이 있을 때만 노드 생성 |
| 목적·기대효과 | definition 또는 output 의미에 반영하고 독립 행동처럼 노드화하지 않음 |
| 순수 분기·합류 제어 | edge 구조로 표현하고 Sub Action/Agent화 대상에 포함하지 않음 |

`조건 충족 여부 판단`, `승인 여부 검토`처럼 실제 판단 업무는 Sub Action이며 decision 도형을 사용할 수 있다. 반대로 병렬 실행을 시작하거나 결과를 합치기만 하는 gateway는 업무 행동이 아니므로 별도 노드를 만들지 않는다.

## 4. 분해 깊이와 순차·병렬 판단

- 노드의 단위는 Activity가 아니라 Sub Action이다. **기본 분해 기대치는 Activity당 2~3개의 Sub Action**이다 (확정 방향, 2026-08): 14개 Activity를 가진 Task라면 기본적으로 28~42개 가량의 업무 노드가 나와야 한다. Activity 이름에 "수행"류 접미사만 붙인 요약 1노드는 §1이 금지하는 Activity 복사이다.
- 생성 capacity(`computeSubActionCapacity`)는 minSteps를 Activity 수의 2배로 하한 고정하고 maxSteps에 3배 밴드의 여유를 준다. 생성 후처리(runner)는 Sub Action이 1개뿐인 Activity에 대해 repair를 1회 요구하고, 그래도 남으면 경고로만 전달한다 — 진짜 원자적 Activity를 400이나 확정 차단으로 만들지 않는다.
- 서로 다른 실행 동사가 있고 각각 독립적인 수행 기준·도구·중간 산출물·Agent화 판단을 가진다면 분리한다.
- 여러 목적어가 하나의 통합 판단 또는 협상 행위 안에서 동시에 처리된다면 억지로 분리하지 않는다 (위 기본 기대치의 예외 사유).
- 두 행동 사이에 결과 의존성이 있으면 순차 edge를 만든다.
- 서로의 결과를 기다리지 않고 수행할 수 있고 후속 행동이 두 결과를 모두 필요로 하면 병렬 edge와 합류를 만든다.
- 병렬 분기와 합류 자체는 Sub Action 수에 포함하지 않는다.
- `activity-subaction-v1`에서는 의미론적 분해가 필수다. `splitComplexSteps=false`가 Activity 설명을 한 노드로 복사하도록 허용해서는 안 된다. 상세 수준은 분해 여부가 아니라 유효 실행 단위의 깊이를 조절한다.

## 5. 고객 문장 적용 기준

### 5.1 포트폴리오 최적화

원문:

> 수요 예측 및 갭 분석 결과를 바탕으로 중장기 제품 믹스 및 개발 우선순위를 설정하여 포트폴리오 최적화 안을 도출함

- `수요 예측 및 갭 분석 결과`: 앞 Activity의 산출물이자 현재 Activity의 input
- `중장기 제품 믹스 및 개발 우선순위 설정`: 실행 행동
- `포트폴리오 최적화안 도출`: 후속 실행 행동 및 최종 output 생성

기본 2단계:

```text
중장기 제품 믹스 및 개발 우선순위 설정
→ 포트폴리오 최적화안 도출
```

제품 믹스 설정과 개발 우선순위 설정이 독립 실행 가능하고 각각의 결과가 후속 단계에 필요하면 3단계 병렬 구조로 만든다.

```text
중장기 제품 믹스 설정 ─┐
                        ├→ 포트폴리오 최적화안 도출
개발 우선순위 설정 ────┘
```

### 5.2 고객 협상과 계약

원문:

> Auto 및 신규 응용처 고객사와 협상하여 샘플 공급 및 초기 물량 확보를 위한 비즈니스 계약을 추진함

기본 2단계:

```text
고객사와 공급 조건 협상
→ 비즈니스 계약 추진
```

- `샘플 공급`과 `초기 물량 확보`는 이 문장에서는 목적·기대 결과이다.
- 별도의 샘플 발송, 물량 배정, 공급 실행이 Activity 범위에 명시되지 않은 한 Sub Action으로 만들지 않는다.
- outputs에는 `합의된 샘플 공급 조건`, `초기 물량 확보 조건이 반영된 계약안`처럼 기록한다.

## 6. AI 생성의 두 역할

### 6.1 기본 분해

- 사용자가 확정한 Work Map의 모든 Activity를 Activity 설명과 Skill에 근거해 Sub Action으로 분해한다.
- 모든 확정 Activity를 최소 하나의 Sub Action으로 커버한다.
- 기본 분해 단계는 `activity-derived` 출처를 가진다.

### 6.2 직무 맥락 기반 확장

- 구성원이 Gate에서 작성한 직무 맥락을 이용해 누락된 예외, 승인, 재작업, 연결 행동을 찾는다.
- 기존 Activity 범위 안의 추가 행동이면 해당 Activity에 매핑한 `context-derived` Sub Action 초안으로 제안할 수 있다.
- 기존 Activity에 의미상 속하지 않는 행동이면 임의의 Activity ID에 강제 매핑하지 않는다. `AI 제안 Activity`로 Work Map에 먼저 제시한다.
- AI 제안 Activity는 기본적으로 미수락 상태이며, 구성원이 수락·수정한 뒤에만 Work Map의 권위 있는 원본과 SOP 생성 범위에 포함된다.
- AI가 제안한 Activity와 Sub Action은 제안 근거가 된 직무 맥락을 짧게 설명해야 한다.

## 7. 출처와 데이터 가드레일

신규 Sub Action에는 다음 의미를 보존한다.

```text
subActionOrigin: activity-derived | context-derived
subActionOriginRationale?: string
sourceActivityIds: [exactly one accepted Activity ID]
inputs?: string[]
outputs?: string[]
```

- `activity-derived`: Activity 설명을 기본 분해한 단계
- `context-derived`: 구성원 직무 맥락 때문에 Activity 안에 보강된 단계
- AI 제안 Activity가 수락되기 전에는 정식 source Activity ID를 발급하거나 SOP 단계에 사용하지 않는다.
- terminal과 순수 control connector에는 subActionOrigin, sourceActivityIds, subActionOrder, Agent화 판단을 두지 않는다.
- Activity나 Sub Action의 수락·삭제·매핑 변경은 기존 review/Agentization 무효화 경로를 사용한다.

## 8. 검증과 테스트

- 구조 검증은 Activity ID, coverage, 순서, terminal 제외를 계속 수행한다.
- 와이어(generateObject) 스키마와 게이트(클라이언트 문서 생성) 스키마는 분리한다. 구조화 출력은 enum/타입만 강제하고 superRefine·min-length·positive()는 강제하지 못하므로, 그 규칙이 와이어 스키마에 남아 있으면 단계 하나의 기계적 위반(빈 rationale — `subActionOriginRationale`와 `agentizationSuggestion.rationale` 모두, terminal의 잔여 provenance 필드, subActionOrder 0, 빈 Activity ID 문자열, 5자 미만 definition, 중복 step/edge ID, terminalType 누락)이 응답 전체를 파싱 시점에 죽인다 — 파싱 실패(NoObjectGeneratedError)는 repair 루프에 도달하지 못한다. 기계적으로 정답이 자명한 위반은 파이프라인 진입 정규화(`normalizeSopGenerationObject`)가 고친다(빈 rationale 제거, 순서 반올림/삭제, 빈 ID 제거, definition 백필, 중복 edge ID 개명, start/end 집합 완성에 의한 유일한 무타입 terminal 보완 — 배열 위치 추정은 여전히 금지). 기계적으로 고칠 수 없는 결함(중복 step ID, 모호한 terminalType, coverage/제안 누락, context-derived의 근거 누락, Activity당 1개 과소분해)은 그래프 검증의 blocking issue → 생성 후처리의 검증·repair 루프 → 400이 처리한다. 게이트 스키마(`SopGenerationResponseSchema`)와 확정 경계의 엄격한 규칙은 그대로 유지되어 이중 방어로 남는다.
- SOP 생성의 출력 토큰 상한은 /flow류(≈15노드)와 분리해 별도로 관리한다 — Activity–Sub Action Task 전체 SOP는 28~42+ 노드를 반환해야 하므로 같은 상한을 쓰면 JSON 절단으로 생성 전체가 실패한다.
- 자연어 의미를 단순 정규식으로 “검증 완료” 처리하지 않는다.
- 프롬프트 계약 테스트는 이 문서의 분류·순차·병렬·출처 규칙이 실제 생성 프롬프트에 포함되는지 확인한다.
- 예문 fixture 또는 orchestration 테스트는 위 두 문장에서 입력·목적·산출물이 불필요한 노드가 되지 않는지 확인한다.
- 신규 Activity 제안 테스트는 `제안 → 미수락 → 사용자 수락 → Work Map 포함 → 생성 범위 포함`을 실행 가능하게 검증한다.
- 컨텍스트 기반 Sub Action은 기존 Activity에 매핑되고 origin이 보존되는지 확인한다.
- pure gateway가 Sub Action 수와 Agent화 대상에 포함되지 않는지 확인한다.
