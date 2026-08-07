'use client';

import { createClient } from '@liveblocks/client';

// Liveblocks 클라이언트 인스턴스 생성
// publicApiKey는 클라이언트에서 안전하게 사용 가능
export const liveblocksClient = createClient({
    publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!,
});
