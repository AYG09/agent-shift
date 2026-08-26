# 작업지시서 W4-01 — Foundation (단독 선행)

## 임무

W4-03B와 W4-04C가 공유할 **착지 판정·복제 초안·출처 계약**을 도메인과 문서에서 먼저
확정한다. 화면은 만들지 않는다.

## 시작 조건

`W4_00_MASTER_PARALLEL.md`를 먼저 읽는다. 이어서 `AGENTS.md`, `CLAUDE.md`, SOP repository
skill과 필수 reference 5개, `docs/sop-member-context-redesign/{CONTEXT,SPEC}.md`,
`WAVE0_FOUNDATION_HANDOFF.md`를 읽는다.

```bash
git status --short --branch
git log -1 --oneline
npm run verify:sop-customer
```

## 배타적 소유 파일

```text
docs/sop-member-context-redesign/SPEC.md
docs/sop-member-context-redesign/CONTEXT.md
src/lib/sop-member-intake.ts
src/lib/sop-work-map-draft.ts
src/lib/sop-prototype-store.ts
tests/sop-member-intake-domain.test.ts
tests/sop-work-map-domain.test.ts
```

## 구현 지시

### 1. 문서를 먼저 갱신한다

코드보다 문서가 앞선다. 최소한 다음을 반영한다.

- `CONTEXT.md` §4 목표 사용자 여정: Home은 항상 첫 화면이 아니라 **보유 기록 유무로 결정되는
  착지점**이다. 세 생성 경로는 "Work Map 초안을 만드는 방법"만 다른 하나의 파이프라인이다.
- `SPEC.md` §2.2 라우트 가드: Work Map route의 진입 조건에서 "제출된 업무맥락"이 요구되는
  이유와, 복제 경로가 그 조건을 **어떻게 정당하게 충족하는지**(아래 3번)를 명시한다.
- `SPEC.md` §4.2 무효화 규칙: 복제로 만들어진 Work Map 초안이 context 재확정 시 어떻게
  다뤄지는지 한 행 추가한다.
- 새 REQ/INT ID를 부여한다(권장: `INT-LAND-001` 착지 판정, `INT-CLONE-001` 복제 초안,
  `REQ-CLONE-001` 복제본의 Work Map 편집 가능성 — 마지막 항목은 §2.3 인용과 함께 확인된
  고객 요구로 표기한다).

문서가 확정하지 않은 값을 코드가 먼저 정하지 않는다.

### 2. 착지 판정을 도메인에 둔다

`sop-member-intake.ts`에 순수 함수를 추가한다.

```ts
export function resolveMemberLandingRoute(state: MemberIntakeGuardState & { hasStoredRecords: boolean }): SopIntakeRoute | '/sop'
```

규칙:

- 미인증 → `/sop/login`
- 인증 + 진행 중 intake(확정 context 또는 Work Map 초안 존재) → 기존 `resolvePostLoginRoute`의
  판단을 그대로 사용(진행 지점 복귀)
- 인증 + 진행 없음 + **저장된 record 0건** → `/sop/context` (신규 구성원은 곧장 작업 시작)
- 인증 + 진행 없음 + record 1건 이상 → `/sop` (복귀 구성원은 현황 Home)

`hasStoredRecords`는 이 모듈이 직접 조회하지 않는다 — 호출자가 넘기는 boolean이다. 도메인
모듈은 repository·네트워크를 알지 못해야 한다.

`resolvePostLoginRoute`는 삭제하지 않는다. 기존 호출부가 있으므로 유지하고, 새 함수가 그것을
내부에서 사용한다.

### 3. 복제 초안과 출처를 정의한다

`sop-work-map-draft.ts`:

- `MemberWorkMapDraft`에 `origin: 'task-recommendation' | 'colleague-template' | 'own-prior'`를
  추가한다. 기존 `createWorkMapDraftFromCatalog`는 `'task-recommendation'`을 채운다.
  **legacy persisted 초안에는 이 필드가 없으므로 읽을 때 `'task-recommendation'`으로 본다** —
  마이그레이션이 값을 소급 기록하지 않는다(`structureVersion`과 같은 규칙).
- 신규:

  ```ts
  export function createWorkMapDraftFromDocument(params: {
      document: Pick<SopDocument, 'workLibrary' | 'context'>;
      origin: 'colleague-template' | 'own-prior';
      now: string;
  }): MemberWorkMapDraft | null
  ```

  복제된 문서의 `workLibrary` 스냅샷에서 선택 Task를 찾아 **deep clone**해 초안을 만든다.
  Task를 찾을 수 없으면 `null`을 돌려준다(추측해서 만들지 않는다). `contextText`는 문서의
  `context` 원문을 쓴다.

### 4. Store에 복제 채택 액션을 둔다

`sop-prototype-store.ts`에 추가한다.

```ts
adoptClonedWorkMap: (document: SopDocument) => boolean;
```

동작:

- `createWorkMapDraftFromDocument`로 초안을 만들고 실패하면 `false`를 돌려준다.
- 성공하면 `workMapDraft`를 설정한다.
- **동시에 `memberContext`의 확정 원문을 문서의 `context`로 채운다.** 이유를 코드 주석에
  남긴다: Work Map route 가드는 "제출된 업무맥락"을 요구하는데, 복제본의 업무맥락은 그
  문서가 실제로 생성될 때 쓰인 원문이므로 **가드를 우회하는 것이 아니라 정당하게 충족**하는
  것이다. 가드 자체를 완화하지 마라 — 완화하면 Task 경로에서도 맥락 없이 Work Map에 들어갈
  수 있게 된다.
- 이 액션은 고객 검토 모드에서 문서를 바꾸지 않는다(기존 read-only 가드 규칙 준수).

### 5. 금지

- 화면·컴포넌트·라우트 파일 생성 또는 수정
- Work Map 뷰, Home, picker, Setup Gate 수정
- 라우트 가드 조건 완화
- 승인 생애주기·Agent화·노드 작성 계약 변경

## 수용 검증

`tests/sop-member-intake-domain.test.ts`에 추가:

- 미인증 → `/sop/login`
- 인증 + record 0 + 진행 없음 → `/sop/context`
- 인증 + record 1 이상 + 진행 없음 → `/sop`
- 인증 + 확정 context 있음 → 진행 지점 복귀(기존 `resolvePostLoginRoute` 결과와 동일)
- 인증 + Work Map 초안 있음 → Work Map 지점 복귀

`tests/sop-work-map-domain.test.ts`에 추가:

- 복제 문서에서 만든 초안이 원본 문서의 `workLibrary.taskCatalog`를 변형하지 않는다
- 초안의 `origin`이 요청한 값으로 보존된다
- `origin` 없는 legacy 초안을 읽으면 `'task-recommendation'`으로 간주된다
- Task를 찾을 수 없는 문서는 `null`을 돌려준다
- `adoptClonedWorkMap` 이후 Work Map route 가드가 통과한다(확정 context가 채워졌기 때문)
- `adoptClonedWorkMap`이 복제 원본 문서 객체를 변형하지 않는다

```bash
npx tsx tests/sop-member-intake-domain.test.ts
npx tsx tests/sop-work-map-domain.test.ts
npm run test:sop
npx tsc --noEmit
npm run lint
npm run verify:quality
npm run verify:sop-customer
git diff --check
```

## 인계

마스터 HANDOFF 형식에 더해 다음을 기록한다.

1. 갱신한 SPEC/CONTEXT 절과 새 requirement ID
2. 추가한 export의 시그니처와 호출 예시 (W4-03B·W4-04C가 추측하지 않도록)
3. `origin` legacy 읽기 규칙
4. 복제 시 context를 채우는 근거와 가드를 완화하지 않았다는 확인
