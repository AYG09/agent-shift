import { NextResponse } from 'next/server';
import type { z } from 'zod';

/**
 * Validates `data` against `schema` before sending it as a JSON response body.
 * A response that doesn't match its own declared shape is a bug in this
 * server (e.g. a record that drifted out of sync with SopRecordSchema), not
 * something a client should ever see the raw detail of — it fails as a
 * generic 500 rather than leaking a partially-formed document.
 */
export function respondValidated<T>(schema: z.ZodType<T>, data: T, status: number) {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
        console.error('[sop-response] response body failed its own schema; refusing to send the raw payload.', parsed.error.issues);
        return NextResponse.json({ error: '서버 내부 오류가 발생했습니다.' }, { status: 500 });
    }
    return NextResponse.json(parsed.data, { status });
}
