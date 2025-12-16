# Agent Shift 🚀

> **AI 기반 업무 프로세스 분석 및 에이전트 자동화 전환 도구**

Agent Shift는 조직의 현행 업무 프로세스를 분석하고, AI 에이전트를 활용한 미래 업무 방식으로의 전환을 지원하는 SaaS 도구입니다.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss)

---

## ✨ 주요 기능

### 1. 📊 As-Is 분석 (현행 업무 분석)

- **플로우 다이어그램 생성**: AI가 산업/직무/업무 맥락을 기반으로 현행 프로세스 자동 생성
- **스트레스 레벨 시각화**: 병목구간, 반복 업무 등 개선 포인트 하이라이팅
- **노드 편집**: 드래그 앤 드롭, 우클릭 메뉴로 노드 추가/수정/삭제
- **맨아워 입력**: 노드별 소요 시간(분/시간/일/주/월) 설정

### 2. 🤖 To-Be 설계 (미래 업무 설계)

- **AI 에이전트 시나리오**: 3가지 자동화 수준 제안
  - `conservative (보수적)`: 인간 중심, AI 보조 (자동화 20~30%)
  - `balanced (균형)`: 인간-AI 협업 (자동화 40~60%)
  - `aggressive (적극적)`: AI 자율 실행 (자동화 70~90%)
- **협업 유형 태그**: Copilot / Monitor / Autonomous 시각적 구분
- **플랫폼 선택**: OpenAI, Anthropic, Google, Microsoft 등 엔터프라이즈 AI 플랫폼 지정

### 3. ⚡ Gap 분석 (As-Is vs To-Be 비교)

- **Split View**: 좌우 분할 화면으로 변화 포인트 직관적 비교
- **맨아워 분석**: 역량별(저/중/고) 승수를 적용한 시간 절감 계산
- **생산성 향상률**: As-Is 대비 To-Be의 맨아워 절감 비율 시각화

### 4. 📈 변화관리 전략

- **프레임워크 선택**: Kotter 8단계 / ADKAR / Lewin 모델 지원
- **액션 로드맵**: 단계별 실행 계획 생성
- **Schein의 8가지 접근방법** 통합

### 5. 👥 실시간 협업 (Liveblocks)

- **멀티 커서**: 팀원들과 동시에 플로우 편집
- **공유 다이얼로그**: 링크 복사 및 팀원 초대
- **User Avatars**: 현재 참여자 표시

### 6. 📤 Export 기능

- **Word/Excel**: 문서 형태로 결과 내보내기
- **PDF 리포트**: React-PDF 기반 보고서 생성

---

## 🛠️ 기술 스택

| 영역 | 기술 |
|------|------|
| **Framework** | Next.js 16 (App Router) |
| **UI** | React 19, Tailwind CSS 4, Radix UI |
| **State** | Zustand (persist middleware) |
| **Flow Editor** | @xyflow/react (React Flow) |
| **AI** | Google Gemini (gemini-2.5-flash) via AI SDK |
| **Collaboration** | Liveblocks |
| **Animation** | Framer Motion |
| **Export** | docx, xlsx, @react-pdf/renderer |
| **Validation** | Zod |

---

## 🚀 시작하기

### 설치

```bash
npm install
```

### 환경 변수 설정

`.env.local` 파일을 생성하고 다음을 추가하세요:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
LIVEBLOCKS_SECRET_KEY=your_liveblocks_key  # 협업 기능 사용 시
```

### 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

### 프로덕션 빌드

```bash
npm run build
npm start
```

---

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx          # 홈 (프로젝트 목록)
│   ├── flow/             # 플로우 에디터 페이지
│   ├── strategy/         # 변화관리 전략 페이지
│   ├── export/           # 내보내기 페이지
│   ├── room/             # 협업 룸 페이지
│   └── api/              # API 라우트
├── components/
│   ├── flow/             # 플로우 관련 컴포넌트
│   │   ├── FlowCanvas.tsx
│   │   ├── SplitViewCanvas.tsx
│   │   ├── GapAnalysisSummary.tsx  # 맨아워 분석
│   │   ├── CustomNodes.tsx
│   │   └── NodeEditor.tsx
│   ├── collaboration/    # 협업 관련 컴포넌트
│   ├── strategy/         # 전략 관련 컴포넌트
│   └── ui/               # 공통 UI 컴포넌트
├── lib/
│   ├── store.ts          # Zustand 전역 상태
│   ├── ai-service.ts     # AI 서비스 로직
│   ├── ai-schemas.ts     # AI 응답 Zod 스키마
│   ├── export-service.ts # Export 로직
│   ├── platforms.ts      # AI 플랫폼 정의
│   └── liveblocks-*.ts   # Liveblocks 설정
└── hooks/                # 커스텀 훅
```

---

## 📚 추가 문서

- [DEVELOPMENT.md](./DEVELOPMENT.md) - 개발 지침 및 버그 트래킹

---

## 📄 라이선스

Private - All Rights Reserved

---

<p align="center">
  <strong>Agent Shift</strong> - 업무의 미래를 설계하라
</p>
