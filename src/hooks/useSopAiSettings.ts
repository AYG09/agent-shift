'use client';

import { useSyncExternalStore } from 'react';
import {
    MODEL_STORAGE_KEY,
    MODEL_UPDATED_EVENT,
    REASONING_STORAGE_KEY,
    REASONING_UPDATED_EVENT,
    DEFAULT_REASONING_LEVEL,
    DEFAULT_GEMINI_MODEL,
    sanitizeReasoningLevel,
    sanitizeModelId,
    type ReasoningLevel,
} from '@/lib/gemini-models';

const API_KEY_STORAGE_KEY = 'agent-shift-api-key';
// ApiKeySettings.tsx가 저장 시 그대로 이 이름으로 dispatch한다.
const API_KEY_UPDATED_EVENT = 'apikey-updated';

// localStorage 접근이 차단된 환경(Safari 프라이빗 모드 등)에서도 예외로 렌더링이
// 멈추지 않도록 하는 안전 helper. useAIGeneration.ts / ApiKeySettings.tsx의 기존
// 패턴과 동일하다.
function safeGetStorageItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('[Storage] Access denied:', e);
        return null;
    }
}

// storage 이벤트(다른 탭)와 커스텀 이벤트(같은 탭의 설정창 저장)를 모두 구독한다.
function subscribeToStorageKey(key: string, customEvent: string) {
    return (onChange: () => void) => {
        if (typeof window === 'undefined') return () => {};
        const handleStorage = (e: StorageEvent) => {
            if (e.key === key) onChange();
        };
        window.addEventListener('storage', handleStorage);
        window.addEventListener(customEvent, onChange);
        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(customEvent, onChange);
        };
    };
}

/**
 * SOP 게이트가 실제 AI 요청에 쓸 모델/추론 수준/API 키를 읽어온다.
 *
 * useEffect로 setState하는 대신 useSyncExternalStore를 쓴다 - localStorage는
 * React 밖의 외부 저장소이므로, 이 훅이 정확히 그 용도에 맞는 API다. 서버
 * 렌더링에서는 항상 null/기본값(getServerSnapshot)을 반환해 하이드레이션
 * 불일치를 피하고, 클라이언트에서만 실제 저장값을 읽는다. ApiKeySettings에서
 * 설정을 바꾸면(같은 탭) 즉시 반영되고, 다른 탭에서 바꿔도 storage 이벤트로 반영된다.
 *
 * `model`과 `reasoning` 모두 이미 정규화된 값이므로, 화면에 표시하는 배지와
 * buildSopGenerationRequestBody()가 서버로 보내는 값이 항상 동일하다. 저장된 모델 문자열이
 * 오래됐거나 손상됐어도(sanitizeModelId가 거부하는 형식) 배지와 요청 모두 DEFAULT_GEMINI_MODEL로
 * 함께 떨어진다 - 배지에만 원문이 보이고 실제 요청은 다른 모델로 나가는 불일치를 막는다.
 */
// 저장소 키가 컴파일 타임 상수이므로 구독 함수도 모듈 스코프의 안정적인 참조로 한 번만 만든다
// (렌더마다 새 함수를 만들지 않아 useSyncExternalStore가 매 렌더 재구독하지 않는다).
const subscribeApiKey = subscribeToStorageKey(API_KEY_STORAGE_KEY, API_KEY_UPDATED_EVENT);
const subscribeModel = subscribeToStorageKey(MODEL_STORAGE_KEY, MODEL_UPDATED_EVENT);
const subscribeReasoning = subscribeToStorageKey(REASONING_STORAGE_KEY, REASONING_UPDATED_EVENT);

export function useSopAiSettings() {
    const apiKey = useSyncExternalStore(
        subscribeApiKey,
        () => safeGetStorageItem(API_KEY_STORAGE_KEY),
        () => null
    );
    const model = useSyncExternalStore(
        subscribeModel,
        () => sanitizeModelId(safeGetStorageItem(MODEL_STORAGE_KEY)),
        () => DEFAULT_GEMINI_MODEL
    );
    const reasoning = useSyncExternalStore(
        subscribeReasoning,
        () => sanitizeReasoningLevel(safeGetStorageItem(REASONING_STORAGE_KEY)),
        () => DEFAULT_REASONING_LEVEL
    );

    return { apiKey, model, reasoning: reasoning as ReasoningLevel };
}
