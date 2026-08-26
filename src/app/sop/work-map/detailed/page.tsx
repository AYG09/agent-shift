'use client';

import { useRouter } from 'next/navigation';
import { SopMemberRouteGuard } from '@/components/sop/SopMemberRouteGuard';
import { SopWorkMapDetailedView } from '@/components/sop/SopWorkMapDetailedView';
import { SOP_INTAKE_ROUTES } from '@/lib/sop-member-intake';

export default function SopWorkMapDetailedPage() {
    const router = useRouter();
    return (
        <SopMemberRouteGuard route={SOP_INTAKE_ROUTES.workMapDetailed} navigate={router.replace}>
            <SopWorkMapDetailedView navigate={router.push} />
        </SopMemberRouteGuard>
    );
}
