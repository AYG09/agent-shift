import { NextRequest, NextResponse } from 'next/server';
import { sopRepository } from '@/server/sop/sop-repository-memory';
import { readSopActorContext } from '@/server/sop/sop-actor-context';
import { filterRecordsByOrganization } from '@/lib/sop-analytics';
import { buildAnalyticsCsv } from '@/lib/sop-export';

/**
 * CSV export of the CURRENTLY FILTERED HR detail rows — the same
 * filterRecordsByOrganization call GET /api/sop/analytics uses, so this file
 * can never silently show different rows than the dashboard the user is
 * looking at. XLSX is deliberately not offered (see implementation-contract.md
 * §15) — CSV is the required baseline.
 */
export async function GET(request: NextRequest) {
    const actorResult = readSopActorContext(request);
    if (!actorResult.ok) return actorResult.response;
    const { actor } = actorResult;

    if (actor.role !== 'hr') {
        return NextResponse.json({ error: 'HR 대시보드 export는 hr 역할만 사용할 수 있습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') ?? undefined;

    const allRecords = await sopRepository.listAll();
    const records = filterRecordsByOrganization(allRecords, organizationId);
    const csv = buildAnalyticsCsv(records);

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="sop-hr-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
    });
}
