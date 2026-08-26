'use client';

import { useRouter } from 'next/navigation';
import { SopMemberRouteGuard } from '@/components/sop/SopMemberRouteGuard';
import { SopTaskRecommendationFlow } from '@/components/sop/SopTaskRecommendationFlow';
import { SOP_INTAKE_ROUTES } from '@/lib/sop-member-intake';

export default function SopRecommendationPage() {
    const router = useRouter();
    return (
        <SopMemberRouteGuard route={SOP_INTAKE_ROUTES.recommendation} navigate={router.replace}>
            <SopTaskRecommendationFlow />
        </SopMemberRouteGuard>
    );
}
