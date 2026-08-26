# 작업지시서 09 — Wave 3 Claude 디자인·전체 검증

## 임무

통합된 구성원 흐름을 Claude의 실제 디자인 검토 기능과 브라우저로 평가하고, `Simple is the best` 원칙, 정보 밀도 비교, 접근성, 전체 기능 연결을 증거로 검증한다. 이 세션은 기본적으로 reviewer다. 수정이 필요하면 Wave 2 integration owner만 writer가 된다.

## 시작 조건

- Wave 2 HANDOFF와 모든 필수 명령의 결과를 받는다.
- 통합 commit 또는 검증할 정확한 dirty diff를 고정한다.
- 다른 writer가 같은 파일을 수정하지 않는다.
- `00_MASTER_ORCHESTRATION.md`의 필수 읽기를 완료한다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## Claude 디자인 기능 의무 사용

Claude 환경에 실제 제공되는 UI/UX 디자인 검토 기능 또는 design skill을 호출한다. 다음 입력을 함께 제공한다.

- `docs/DESIGN_CONVENTIONS.md`
- `CONTEXT.md`의 목표 사용자 여정
- `SPEC.md`의 UI·loading·recommendation·Work Map 요구
- 대표 fixture: Task 1개, Activity 14개, Activity별 Skill 5개
- viewport 1440×900, 1920×1080, zoom 100%

사용한 기능의 정확한 이름, 입력 범위, 산출된 핵심 권고, 채택 여부를 기록한다. 기능이 제공되지 않거나 호출이 실패하면 `DESIGN_CAPABILITY_BLOCKED`로 보고하고 디자인 검토 완료를 주장하지 않는다. Stitch MCP도 실제 호출한 경우에만 사용했다고 기록한다.

## writer 정책

- reviewer는 우선 코드를 수정하지 않고 severity·재현 절차·해당 requirement ID가 있는 issue를 작성한다.
- 수정은 Wave 2 integration owner가 단독으로 수행한다.
- reviewer와 fixer가 같은 파일을 동시에 수정하지 않는다.
- 수정 후 reviewer가 새 baseline으로 재검증한다.
- `/flow`는 수정하지 않는다.

## 브라우저 검증 매트릭스

각 viewport에서 다음 흐름을 실제로 수행하고 스크린샷·관찰 결과를 남긴다.

| 단계 | 정상 상태 | 추가 상태 |
|---|---|---|
| 로그인 | 빈 상태, 유효 입력, 제출 | 필수 오류, keyboard-only |
| 업무맥락 | draft, 도움말, 제출 | 공백 오류, 뒤로가기 복원 |
| 추천 | loading, 결과, 후보 비교 | API 실패, 재시도, 수동 선택, 취소 |
| simple Work Map | 14 Activity scan, drawer edit | add/delete/reorder, 마지막 item |
| detailed Work Map | master–detail, Skill 설명 편집 | 긴 설명, 선택 삭제, view 전환 |
| 생성·Workspace | Work Map confirm, pending, success | generation failure와 복구 |

### 필수 viewport

```text
1440×900 / zoom 100%
1920×1080 / zoom 100%
```

가능하면 작은 viewport는 회귀 참고로 보되, 모바일 정식 지원을 새 완료 조건으로 만들지 않는다.

## 시각·상호작용 판정 기준

- 한 화면에는 하나의 primary action만 시각적으로 우세하다.
- 로그인과 context에 Task Library editor 또는 고급 생성 설정이 노출되지 않는다.
- loading은 정직하며 fake progress, ETA, confidence가 없다.
- 추천 1순위는 강조되지만 자동 확정처럼 보이지 않는다.
- simple은 14개 Activity를 빠르게 scan하게 하고 장문을 기본 확장하지 않는다.
- detailed는 Task·Activity·Skill 설명의 관계를 읽을 수 있다.
- 두 Work Map 화면의 수정 결과가 같은 data에 즉시 반영된다.
- fixed footer, drawer, nested scroll이 마지막 콘텐츠를 가리지 않는다.
- 기존 design token, typography, container width, density 규칙을 따른다.
- AI suggestion, member decision, tool permission을 UI가 혼동시키지 않는다.

## 접근성 검증

- 키보드만으로 전체 흐름을 완료한다.
- focus indicator, error focus, drawer/dialog focus trap과 return을 확인한다.
- label, description, error association을 확인한다.
- loading의 `aria-live`가 시작·성공·실패만 알리는지 확인한다.
- reduced-motion에서 tip·loading animation이 최소화되는지 확인한다.
- 선택 상태와 오류를 색상만으로 전달하지 않는다.

## 기능·데이터 검증

- recommendation request와 generation request의 context 원문을 비교한다.
- API 호출 횟수와 stale response 차단을 확인한다.
- simple/detailed의 Task·Activity·Skill ID 집합을 비교한다.
- 편집 후 Task Library fixture가 바뀌지 않았음을 확인한다.
- Work Map confirm 후 generation request의 Activity 순서·coverage를 확인한다.
- 개인 SOP node quality report와 대표 표준안 standardization issue를 확인한다.
- 대표 표준안이 save·approve·execute side effect를 만들지 않음을 확인한다.

## 최종 명령

시각 수정이 한 건이라도 있었다면 전부 다시 실행한다.

```bash
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:quality
npm run verify:sop-customer -- --final
npm run verify:sop-customer -- --scenario-final
git diff --check
git status --short
```

## 최종 보고 형식

```text
DESIGN_AND_E2E_REPORT
1. 검증 baseline / branch / worktree
2. 사용한 Claude 디자인 기능과 실제 호출 여부
3. viewport·상태별 증거 위치
4. PASS requirement·test ID
5. 발견 issue: severity / 재현 / 영향 / 권고
6. 수정한 파일과 단독 writer 확인
7. 전체 명령 PASS/FAIL
8. 미검증 상태와 이유
9. 고객 요구, 구현 해석, 보류 항목의 분리 요약
10. commit/push 여부와 권한 근거
```

모든 기능·시각·접근성 게이트를 통과하기 전에는 완료라고 선언하지 않는다.
