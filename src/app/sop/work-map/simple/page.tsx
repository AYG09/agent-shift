'use client';

import { useRouter } from 'next/navigation';
import { SopWorkMapSimpleView } from '@/components/sop/SopWorkMapSimpleView';

export default function SopWorkMapSimplePage() {
    const router = useRouter();
    return <SopWorkMapSimpleView navigate={router.push} />;
}
