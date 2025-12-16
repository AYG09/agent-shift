# Copilot Instructions for Agent Shift

- Stack: Next.js 16 App Router (client-heavy pages), TypeScript strict, Tailwind v4, shadcn UI atoms, XYFlow canvas for diagrams, Zustand store (`src/lib/store.ts`) persisted locally.
- AI pipeline: `/src/app/api/ai/route.ts` uses Google Gemini (BYOK via localStorage key `agent-shift-api-key`, UI in `components/settings/ApiKeySettings.tsx`), Zod schemas in `src/lib/ai-schemas.ts` enforce integer metrics; normalization rounds numbers.
- Flow data shapes: store nodes (`FlowNode`) keep `label` at root, metrics optional integers, types `task|decision|subprocess|agent`; ReactFlow nodes expect `data.label/...` so convert when rendering. Do not save ReactFlow nodes directly to the store.
- Key flows: context form + AI buttons in `src/app/flow/page.tsx`; canvas rendering/edit/split in `components/flow/FlowCanvas.tsx` and split view in `components/flow/SplitViewCanvas.tsx`; node types in `components/flow/CustomNodes.tsx`; ROI summary uses metrics in `components/flow/GapAnalysisSummary.tsx`.
- AI actions: `useAIGeneration` calls `/api/ai` for `generateAsIsFlow`, `generateToBeFlow` (scenario `conservative|balanced|aggressive`), `generateChangeStrategy`, `generateDrilldown`, `generateNodeSplit`; always convert AI nodes to store shape before `setAsIsFlow`/`setToBeFlow`.
- Metrics conventions: `timeMinutes`, `costKRW`, `peopleCount`, `errorRate` must be integers (Zod). Stress levels `low|medium|high`; agent `collaborationType` `copilot|monitor|autonomous`.
- View modes: store `viewMode` supports `asis|tobe|split`; split view uses tokenFlow edges for simulation and ROI summary when not simulating.
- Persistence: Zustand partializes context, flows, viewMode only; avoid storing transient flags. LocalStorage guarded for SSR.
- Exports: Word/Excel in `src/lib/export-service.ts` (docx/xlsx); PDF in `components/export/PdfReport.tsx`. Strategy Gantt/phases in `src/app/strategy/page.tsx` and `components/strategy/GanttChart.tsx`.
- Dev commands: `npm run dev`, `npm run build`, `npm run lint`. Next config minimal; paths alias `@/*`.
- UI notes: ReactFlow components are dynamically imported (keep SSR-safe). Node editor/context menu live in `components/flow/NodeEditor.tsx` and `NodeContextMenu.tsx`.
- Known pitfall (from DEVELOPMENT.md): Do not store ReactFlow node shape in Zustand; always map AI outputs to store shape (label at root) before saving.
- 언어 지침: 모든 추론과정 표시는 물론 최종 답변도 한국어/한글로 작성한다.

## MCP Mandatory Workflow (triggered by user saying "mcp" or "mcp로")

1. Sequential Thinking MCP: restate request, scope, constraints.
2. Context7 + Tavily: fetch official guidance/best practices for relevant stack; note versions and pitfalls.
3. Version/tech check: compare findings to project stack; if mismatch or conflict, stop and surface options.
4. User confirmation: get approval on changes/versions before proceeding when mismatches exist.
5. Shrimp Task Manager: plan with `plan_task`/`split_tasks`, then execute per plan.

## Available MCP Tools

### 핵심 개발 도구
- **Context7**: 최신 라이브러리 문서 및 코드 예제 (공식 저장소)
- **Sequential Thinking**: 복잡한 문제 단계별 분석 (사고 과정 추적)
- **Shrimp Task Manager**: 작업 계획 및 실행 관리 (`plan_task`, `split_tasks`, `execute_task`)

### 테스트 도구
- **Chrome DevTools**: E2E 테스트, 웹 자동화, 성능 분석
- **Tavily**: AI 웹 검색, 심층 리서치

### 디자인 도구
- **Penpot**: UI/UX 디자인 파일 분석, 에셋 추출, Tailwind CSS 코드 변환
- **Excalidraw**: 다이어그램 생성, 시스템 아키텍처, 플로우차트 시각화

## MCP 조합 패턴

**패턴 1: 새 기능 개발**
1. Sequential Thinking → 개발 계획 수립
2. Context7 → 최신 라이브러리 패턴 확인
3. Shrimp → 작업 분할 및 실행
4. Chrome DevTools → 기능 테스트

**패턴 2: 버그 해결**
1. Sequential Thinking → 원인 분석
2. Context7 → 공식 문서 참조
3. Tavily → 커뮤니티 해결책 검색
4. Chrome DevTools → 테스트

**패턴 3: 디자인 기반 UI 개발**
1. Penpot → 디자인 파일 분석 및 Tailwind CSS 코드 추출
2. Context7 → 컴포넌트 라이브러리 최신 패턴 확인
3. Shrimp → 작업 계획 수립 및 실행
4. Chrome DevTools → 반응형 테스트 및 스타일 검증

**패턴 4: 시스템 설계 및 문서화**
1. Sequential Thinking → 아키텍처 설계 분석
2. Excalidraw → 시스템 아키텍처/플로우차트 다이어그램 생성
3. Shrimp → 설계에 따른 구현 계획
4. 코드 작업 → 구현 실행
