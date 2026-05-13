# Agent Shift - 개발 지침

이 문서는 내부 개발 노트입니다.

## 🔴 버그 발견 시 필수 사항

1. 이 문서에 버그 내용과 원인 기록
2. 수정 방법 및 교훈 문서화
3. 유사 패턴 재발 방지 체크리스트 추가

---

## 📋 타입 규칙

### Zustand Store vs ReactFlow 타입 불일치 주의!

| Zustand FlowNode   | ReactFlow Node          |
| ------------------ | ----------------------- |
| `node.label`       | `node.data.label`       |
| `node.description` | `node.data.description` |
| `node.stressLevel` | `node.data.stressLevel` |

**변환 시 주의:**

```typescript
// ❌ 잘못된 변환 (스토어에 ReactFlow 형식 저장)
setAsIsFlow(reactFlowNodes, edges);

// ✅ 올바른 변환 (스토어 형식으로 저장)
setAsIsFlow(storeFormatNodes, edges);
```

---

## 🐛 발견된 버그 목록

### ✅ 2025-12-05: AI 응답 파싱 실패 (해결됨)

- **증상**: AI가 노드 생성했지만 캔버스에 내용(label) 미표시
- **원인**: `setAsIsFlow()`에 ReactFlow Node 형식 저장 → FlowNode 형식 기대
- **해결**: AI 응답을 Zustand FlowNode 형식으로 변환 후 저장
- **수정 파일**: `flow/page.tsx` - handleGenerateAsIs, handleGenerateToBe

---

## 📁 핵심 파일 구조

| 파일             | 역할           | 타입                   |
| ---------------- | -------------- | ---------------------- |
| `store.ts`       | 전역 상태      | `FlowNode`, `FlowEdge` |
| `FlowCanvas.tsx` | 캔버스 표시    | `@xyflow/react` Node   |
| `flow/page.tsx`  | 페이지 로직    | 변환 담당              |
| `ai-schemas.ts`  | AI 응답 스키마 | Zod                    |

---

## ✅ 개발 체크리스트

### 새 기능 추가 시

- [ ] 타입 정의 확인 (스토어 vs UI 컴포넌트)
- [ ] 데이터 변환 로직 검증
- [ ] 빌드 테스트 (`npm run build`)
- [ ] 브라우저 테스트

### AI 관련 기능

- [ ] Zod 스키마와 실제 사용처 타입 일치 확인
- [ ] API 응답 → 스토어 형식 변환 검증
- [ ] 에러 핸들링 및 사용자 피드백
