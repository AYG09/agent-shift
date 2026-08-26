# SOP 구성원 업무맥락 흐름 재설계 문서 세트

## 1. 문서 목적

이 문서 세트는 SOP 프로토타입의 구성원 진입 및 Task 기반 생성 흐름을 다음 순서로 재설계하기 위한 구현 기준이다.

```text
구성원 정보 입력·프로토타입 로그인
→ 업무맥락 작성·입력 완료
→ AI Task 추천 처리
→ 추천 Task 명시적 확인
→ Task–Activity–Skill Work Map 검토·수정
→ SOP 생성·Workspace
```

핵심 목표는 기능을 한 화면에 축적하는 방식에서 벗어나, 사용자가 한 시점에 하나의 결정만 내리도록 정보 구조를 분리하는 것이다. 이 단계에서는 애플리케이션 코드를 변경하지 않는다.

## 2. 적용 우선순위

이 문서 세트는 2026-08-26 확정된 구성원 UX 재설계 방향을 반영한다. 충돌 시 다음 순서를 적용한다.

1. 이후 확정되는 명시적 고객 결정
2. 이 문서 세트
3. `.agents/skills/implement-sop-customer-requirements/references/final-system-scenario-contract.md`
4. 같은 Skill의 나머지 구현 계약
5. 기존 `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`
6. 현재 프로토타입 UI와 fixture

이 재설계는 기존 최종 시나리오의 승인, 반려, HR, Activity–Sub Action, Agent화 계약을 폐기하지 않는다. 구성원 Task 기반 생성의 **진입 순서, 화면 책임, 정보 밀도**만 최신 요구에 맞게 좁혀 재정의한다.

## 3. 문서 구성

| 문서 | 역할 | 구현 전 필수 여부 |
|---|---|---|
| [CONTEXT.md](CONTEXT.md) | 고객 요구, 현행 코드 기준선, 문제 정의, 용어, 가정과 보류 범위 | 필수 |
| [SPEC.md](SPEC.md) | 상태 전이, 화면, 데이터, API, UI/UX, 검증 가능한 수용 기준 | 필수 |
| [NODE_AUTHORING_AND_AGENT_CONTROL.md](NODE_AUTHORING_AND_AGENT_CONTROL.md) | 개인 SOP·대표 표준안의 노드 작성 품질, agent-ready 구조, tool/HITL 계약 | 필수 |
| [PARALLEL_EXECUTION.md](PARALLEL_EXECUTION.md) | Claude Opus 병렬 세션의 파일 소유권, 선행 관계, 통합 게이트 | 병렬 작업 시 필수 |
| [work-orders/README.md](work-orders/README.md) | 세션별 복사·전달용 Claude Code 작업지시서와 실행 순서 | 구현 착수 시 필수 |

구현 작업지시서는 이 네 문서를 소스 오브 트루스로 참조해 별도로 작성한다. 작업지시서가 이 문서의 미확정 항목을 임의로 확정해서는 안 된다.

## 4. 완료 경계

엔지니어링 문서 구축 완료는 다음을 의미한다.

- 확인된 고객 요구, 구현 해석, 보류 항목이 분리되어 있다.
- 현행 구현 중 재사용할 계약과 교체할 화면 구조가 식별되어 있다.
- 로그인부터 두 밀도 Work Map까지 상태 전이가 검증 가능한 언어로 정의되어 있다.
- 추천 API 실패, 수동 선택, 로딩 경험, 데이터 무효화 규칙이 정의되어 있다.
- 간소화·상세 화면이 동일한 Work Map 데이터와 mutation을 사용하도록 명시되어 있다.
- 개인 SOP와 대표 표준안 모두에 적용할 노드 작성·도구 권한·HITL·품질 검증 계약이 정의되어 있다.
- 병렬 세션이 같은 파일을 동시에 수정하지 않도록 소유권과 통합 순서가 정의되어 있다.

코드 구현, Claude 디자인 리뷰 수행, 브라우저 시각 검증, 커밋과 푸시는 이 문서 구축 단계의 완료 범위가 아니다.
