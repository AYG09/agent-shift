import { NextRequest, NextResponse } from 'next/server';
import {
    FALLBACK_MODEL_PRIORITY,
    filterOfficialGeminiModels,
    type GeminiModelListReason,
    type GeminiModelListResult,
    type RawModelEntry,
} from '@/lib/gemini-models';

// Google Generative Language API의 모델 목록 엔드포인트
const LIST_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// 페이지네이션 폭주 방지 상한
const MAX_PAGES = 5;

function fallbackResult(
    reason: GeminiModelListReason,
    hasConfiguredApiKey: boolean,
    extra: Partial<GeminiModelListResult> = {}
): GeminiModelListResult {
    return {
        models: [...FALLBACK_MODEL_PRIORITY],
        source: 'fallback',
        reason,
        hasConfiguredApiKey,
        ...extra,
    };
}

/**
 * 현재 사용 가능한 Gemini 모델 목록을 조회한다.
 * BYOK 키가 오면 그 키로, 없으면 서버 환경 변수 키로 조회하고,
 * 실패하면 하드코딩 fallback 목록과 실패 사유를 함께 돌려준다.
 */
export async function POST(request: NextRequest) {
    let body: { apiKey?: unknown } = {};
    try {
        body = await request.json();
    } catch {
        // body 없이 호출되면 환경 변수 키로 진행한다
    }

    const userKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiKey = userKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || '';

    if (!apiKey) {
        return NextResponse.json(fallbackResult('missing-api-key', false));
    }

    const rawModels: RawModelEntry[] = [];

    try {
        let pageToken: string | undefined;

        for (let page = 0; page < MAX_PAGES; page++) {
            const url = new URL(LIST_MODELS_ENDPOINT);
            url.searchParams.set('key', apiKey);
            url.searchParams.set('pageSize', '200');
            if (pageToken) url.searchParams.set('pageToken', pageToken);

            const response = await fetch(url, { cache: 'no-store' });

            if (!response.ok) {
                // 키가 로그에 남지 않도록 상태 코드와 응답 본문 앞부분만 남긴다
                const detail = await response.text().catch(() => '');
                console.warn('[API Models] ListModels 실패:', response.status, detail.slice(0, 200));
                return NextResponse.json(
                    fallbackResult('api-error', true, {
                        errorMessage: `Google 모델 목록 조회 실패 (HTTP ${response.status})`,
                    })
                );
            }

            const json = (await response.json()) as {
                models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
                nextPageToken?: string;
            };

            for (const model of json.models ?? []) {
                if (!model?.name) continue;
                rawModels.push({
                    id: model.name,
                    supportedGenerationMethods: model.supportedGenerationMethods,
                });
            }

            pageToken = json.nextPageToken;
            if (!pageToken) break;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        console.warn('[API Models] ListModels 호출 예외:', message);
        return NextResponse.json(fallbackResult('api-error', true, { errorMessage: message }));
    }

    if (rawModels.length === 0) {
        return NextResponse.json(fallbackResult('empty-api-result', true, { rawCount: 0 }));
    }

    const models = filterOfficialGeminiModels(rawModels);

    if (models.length === 0) {
        return NextResponse.json(
            fallbackResult('filter-empty', true, {
                rawCount: rawModels.length,
                filteredCount: 0,
            })
        );
    }

    const result: GeminiModelListResult = {
        models,
        source: 'api',
        rawCount: rawModels.length,
        filteredCount: models.length,
        hasConfiguredApiKey: true,
    };

    return NextResponse.json(result);
}
