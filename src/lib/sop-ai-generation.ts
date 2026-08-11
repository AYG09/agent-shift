import { SopMember, WorkLibrarySelection, SopSetupConfig, SopDocument } from './sop-types';
import { createSopDocumentFromGeneration } from './sop-normalizer';

export interface GenerateSopViaApiParams {
    requestBody: unknown;
    member: SopMember;
    workLibrary: WorkLibrarySelection;
    context: string;
    setupConfig: SopSetupConfig;
    fetchImpl?: typeof fetch;
}

export type GenerateSopViaApiResult =
    | { success: true; document: SopDocument }
    | { success: false; error: string };

/**
 * SOP 생성 API 호출 + 정규화를 담당하는 순수 orchestration 함수.
 *
 * SopSetupGate.tsx에서 분리했다 - 이전에는 fetch/스토어/라우터가 컴포넌트 안에서
 * 뒤섞여 있어 "fetch 실패 시 문서/샘플/라우팅이 바뀌지 않는다"를 테스트할 방법이
 * 없었다. 이 함수는 store와 router를 전혀 모른다 - 실패해도 그 사실 자체가
 * 호출부(SopSetupGate)가 setDocument/router.push를 부를 근거를 안 만든다는 뜻이다.
 */
export async function generateSopViaApi(params: GenerateSopViaApiParams): Promise<GenerateSopViaApiResult> {
    const fetchFn = params.fetchImpl ?? fetch;

    try {
        const res = await fetchFn('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params.requestBody),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return {
                success: false,
                error: errData.error || 'AI SOP 생성에 실패했습니다. 다시 시도하거나 입력값을 보완해 주세요.',
            };
        }

        const data = await res.json();

        const document = createSopDocumentFromGeneration({
            rawResponse: data,
            member: params.member,
            workLibrary: params.workLibrary,
            context: params.context,
            setupConfig: params.setupConfig,
            isSampleData: false,
        });

        return { success: true, document };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'AI 생성 도중 알 수 없는 오류가 발생했습니다.';
        return { success: false, error: message };
    }
}
