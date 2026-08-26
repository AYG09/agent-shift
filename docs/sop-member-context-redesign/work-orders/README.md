# SOP 구성원 업무맥락 재설계 작업지시서 묶음

## 사용 목적

이 디렉터리는 Claude Code의 여러 Opus 5 세션에 각각 전달할 실행 지시서를 제공한다. 병렬 작업은 같은 dirty worktree에서 여러 writer를 실행하는 방식이 아니다. 검증된 동일 baseline에서 분리한 Git worktree와 branch를 세션별로 사용해야 한다.

현재 엔지니어링 문서가 commit에 포함되지 않은 상태라면 새 worktree에서 문서를 읽을 수 없다. 실행 관리자는 먼저 다음 둘 중 하나를 수행해야 한다.

1. 사용자의 명시적 허가를 받아 이 문서 묶음을 포함한 baseline commit을 만든다.
2. 각 worktree에 이 문서 묶음을 읽기 전용으로 동일하게 배포하고 checksum을 확인한다.

이 문서 자체는 commit 또는 push 권한을 부여하지 않는다. 각 Claude Code 세션은 현재 요청에 명시적 권한이 없으면 commit·push하지 않는다.

## 실행 순서

복사·전달용 첫 메시지는 [CLAUDE_SESSION_PROMPTS.md](CLAUDE_SESSION_PROMPTS.md)에서 선택한다.

1. [00_MASTER_ORCHESTRATION.md](00_MASTER_ORCHESTRATION.md)를 실행 관리자 세션에 전달한다.
2. [01_WAVE0_FOUNDATION.md](01_WAVE0_FOUNDATION.md)를 단독 실행한다.
3. Foundation handoff commit을 기준으로 Wave 1의 여섯 worktree를 만든다.
4. 다음 여섯 지시서를 서로 다른 세션에서 병렬 실행한다.
   - [02_WAVE1A_LOGIN_CONTEXT.md](02_WAVE1A_LOGIN_CONTEXT.md)
   - [03_WAVE1B_RECOMMENDATION_LOADING.md](03_WAVE1B_RECOMMENDATION_LOADING.md)
   - [04_WAVE1C_SIMPLE_WORK_MAP.md](04_WAVE1C_SIMPLE_WORK_MAP.md)
   - [05_WAVE1D_DETAILED_WORK_MAP.md](05_WAVE1D_DETAILED_WORK_MAP.md)
   - [06_WAVE1E_MEMBER_NODE_GENERATION.md](06_WAVE1E_MEMBER_NODE_GENERATION.md)
   - [07_WAVE1F_STANDARD_DRAFT_GENERATION.md](07_WAVE1F_STANDARD_DRAFT_GENERATION.md)
5. 여섯 세션의 handoff를 받은 뒤 [08_WAVE2_INTEGRATION.md](08_WAVE2_INTEGRATION.md)를 단독 실행한다.
6. [09_WAVE3_DESIGN_VERIFICATION.md](09_WAVE3_DESIGN_VERIFICATION.md)로 시각·접근성·전체 시나리오를 검증한다.

## 중단 조건

다음 중 하나라도 해당하면 코드를 수정하지 말고 실행 관리자에게 보고한다.

- baseline commit이 서로 다르다.
- Foundation handoff가 없거나 필수 검증이 실패했다.
- 소유 파일이 다른 활성 세션의 소유 파일과 겹친다.
- 작업에 공용 파일 수정이 필요하지만 해당 세션 지시서가 소유권을 부여하지 않았다.
- `/flow` 변경이 필요하다고 판단했다.
- unrelated dirty change가 소유 파일과 겹친다.
