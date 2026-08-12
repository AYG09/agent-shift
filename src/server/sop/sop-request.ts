import { NextResponse } from 'next/server';
import { SopGenerationRequestSchema, type SopGenerationRequest } from '@/lib/sop-ai-request';

export type SopGenerationRequestResult =
    | { ok: true; request: SopGenerationRequest }
    | { ok: false; response: NextResponse };

/**
 * Validates a raw request body against the client/server-shared SOP generation
 * contract (SopGenerationRequestSchema). The server never trusts the client's
 * validation — a shape mismatch (wrong field type, invalid detailLevel/branchPolicy,
 * a non-string apiKey) is rejected with a 400 and field-level issues here, before
 * any model call is attempted.
 */
export function parseSopGenerationRequest(body: unknown): SopGenerationRequestResult {
    const parsed = SopGenerationRequestSchema.safeParse(body);
    if (parsed.success) {
        return { ok: true, request: parsed.data };
    }
    const issues = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
    }));
    return {
        ok: false,
        response: NextResponse.json(
            {
                error: `SOP 생성 요청이 유효하지 않습니다: ${issues.map((i) => `${i.field}: ${i.message}`).join(' / ')}`,
                issues,
            },
            { status: 400 }
        ),
    };
}
