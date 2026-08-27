'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertCircle,
    ClipboardList,
    FileClock,
    FileUp,
    Loader2,
    Sparkles,
    UserCheck,
    Users,
} from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopRoleNav } from './SopRoleNav';
import { useSopStoreHydrated } from './SopMemberRouteGuard';
import { listMySopRecords, requestSopApproval } from '@/lib/sop-record-client';
import { buildSopStatusRows, computeSopStatusCounts, computeMemberTaskActivitySkillCounts, type SopStatusCounts } from '@/lib/sop-member-home';
import { SOP_LIFECYCLE_STATUS_META, SOP_MEMBER_SUMMARY_BUCKET_META, type SopMemberSummaryBucket } from '@/lib/sop-lifecycle';
import { SOP_INTAKE_ROUTES, isAuthenticated, resolveMemberLandingRoute, resolvePostLoginRoute } from '@/lib/sop-member-intake';
import type { SopRecord } from '@/lib/sop-record-schema';
import { SopColleagueTemplatePicker } from './SopColleagueTemplatePicker';
import { SopOwnPriorPicker } from './SopOwnPriorPicker';

const STATUS_ORDER: SopMemberSummaryBucket[] = ['draft', 'approval-requested', 'approved', 'rejected'];

/**
 * Thin routed wrapper — the only place in this file that calls `useRouter()`.
 * All actual rendering/logic lives in `SopMemberHomeView`, which takes
 * `navigate` as a prop instead of calling the hook itself, so it can be
 * rendered in a plain test harness (react-test-renderer has no Next.js App
 * Router context to satisfy `useRouter()`) — the same "page wrapper stays
 * thin, real logic is directly testable" split already used for
 * SopSetupGate/sop-setup-actions.ts.
 */
export function SopMemberHome() {
    const router = useRouter();
    return <SopMemberHomeView navigate={router.push} />;
}

export function SopMemberHomeView({ navigate, fetchImpl }: { navigate: (href: string) => void; fetchImpl?: typeof fetch }) {
    const memberInfo = useSopPrototypeStore((state) => state.memberInfo);
    const localDraft = useSopPrototypeStore((state) => state.document);
    const setDocument = useSopPrototypeStore((state) => state.setDocument);
    const setCustomerReviewMode = useSopPrototypeStore((state) => state.setCustomerReviewMode);
    const memberSession = useSopPrototypeStore((state) => state.memberSession);
    const memberContext = useSopPrototypeStore((state) => state.memberContext);
    const taskRecommendation = useSopPrototypeStore((state) => state.taskRecommendation);
    const hasWorkMapDraft = useSopPrototypeStore((state) => !!state.workMapDraft);
    const hydrated = useSopStoreHydrated();

    const [records, setRecords] = useState<SopRecord[] | null>(null);
    const [recordsError, setRecordsError] = useState<string | null>(null);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showOwnPriorPicker, setShowOwnPriorPicker] = useState(false);
    const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);
    const [approvalError, setApprovalError] = useState<string | null>(null);

    const loadRecords = () => {
        setRecordsError(null);
        listMySopRecords({ member: memberInfo, fetchImpl }).then((result) => {
            if (result.success) setRecords(result.data);
            else {
                setRecordsError(result.error);
                setRecords([]);
            }
        });
    };

    // W4-05가 브라우저 검증에서 발견한 회귀: hydration 이전에는 memberInfo가 아직
    // 초기/샘플 값(CUSTOMER_SOP_MEMBER)이다. 이 effect가 hydrated를 기다리지 않으면
    // 그 샘플 신원으로 먼저 한 번 조회해 records를 채우고(대개 그 신원엔 record가 없어
    // "[]"), 뒤이어 실제(복원된) memberInfo로 다시 조회해 올바른 값으로 덮어쓴다 —
    // 조회 자체는 최종적으로 맞더라도, 아래 INT-LAND-001 착지 판정의
    // `landingCheckedRef`는 "records !== null"이 되는 첫 순간(그 잘못된 빈 결과)에
    // 이미 한 번만 판정하고 잠긴다. 그 결과 record를 실제로 가진 복귀 구성원도 매번
    // "record 0건"으로 잘못 판정되어 Home 대신 /sop/context로 튕겨나간다.
    // hydrated를 기다리면 첫 조회 자체가 항상 복원된(올바른) 신원으로 일어난다.
    useEffect(() => {
        if (!hydrated) return;
        loadRecords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, memberInfo.id, memberInfo.employeeId]);

    // INT-LAND-001: Home이 자신의 착지 여부를 스스로 판정한다 — 판정 로직 자체는
    // W4-01의 resolveMemberLandingRoute 하나뿐이고, 이 effect는 "언제 판정해도 되는지"
    // (hydration 완료 + 최초 record 조회 완료)와 "판정 결과가 /sop가 아니면 이동한다"만
    // 담당한다(SopMemberRouteGuard와 동일한 책임 분리). ref 가드가 있는 이유: 이 판정은
    // "명시적 진입 시점"에 정확히 한 번만 일어나야 한다 — 가드가 없으면 승인 요청·반려
    // 편집 같은 이후의 모든 상태 갱신마다 재판정이 돌아, Home에 머무르던 구성원이
    // 도중에 튕겨나가는 무한 리다이렉트류 버그가 된다. 구성원이 /sop로 새로 진입(재마운트)
    // 할 때마다는 다시 판정한다 — "record가 생긴 뒤부터 /sop가 정상 착지점이 된다"는 규칙이
    // 실제로 성립하는 지점이 바로 그 재마운트다. hasStoredRecords는 Home이 이미 조회하는
    // records 목록에서만 파생하며 별도 API를 두지 않는다.
    const landingCheckedRef = useRef(false);
    useEffect(() => {
        if (landingCheckedRef.current || !hydrated || records === null) return;
        landingCheckedRef.current = true;
        const landingTarget = resolveMemberLandingRoute({
            session: memberSession,
            memberContext,
            recommendation: taskRecommendation,
            hasWorkMapDraft,
            hasStoredRecords: records.length > 0,
        });
        if (landingTarget !== '/sop') navigate(landingTarget);
    }, [hydrated, records, memberSession, memberContext, taskRecommendation, hasWorkMapDraft, navigate]);

    // A single row list drives BOTH the numeric buckets and the enumerated list below them —
    // computeSopStatusCounts derives its numbers from the exact same rows, so the count a
    // member sees can never silently diverge from what's actually listed underneath it.
    const statusRows = buildSopStatusRows(records ?? [], localDraft);
    const statusCounts: SopStatusCounts = computeSopStatusCounts(records ?? [], localDraft);
    const contentCounts = computeMemberTaskActivitySkillCounts(records ?? []);
    const isLoadingRecords = records === null;

    const handleRequestApproval = async (record: SopRecord) => {
        setApprovalRequestId(record.id);
        setApprovalError(null);
        const result = await requestSopApproval({ member: memberInfo, recordId: record.id, fetchImpl });
        setApprovalRequestId(null);
        if (!result.success) {
            setApprovalError(result.error);
            return;
        }
        setRecords((current) => (current ? current.map((item) => (item.id === record.id ? result.data : item)) : current));
    };

    // "수정하기": deterministically unlocks customer-review mode and loads the rejected
    // record's document back into the editor (same document id — the next server save
    // goes through PUT, never a new record) so the member can act on reviewer feedback.
    const handleEditRejected = (record: SopRecord) => {
        setCustomerReviewMode(false);
        if (setDocument(record.document)) {
            navigate('/sop/workspace');
        }
    };

    // Home의 "Task 기반 생성" 카드는 더 이상 /sop/setup의 혼합 화면으로 직접
    // 들어가지 않는다 — 새 순차 흐름(로그인 → 업무맥락 → 추천 → Work Map)이 그
    // 입구다(08 §통합 지시 1·2). 비로그인 구성원은 /sop/login에서 시작하고,
    // 이미 로그인한 구성원은 resolvePostLoginRoute(SopMemberLoginGateView의
    // "계속 진행" 버튼과 같은 함수)가 계산한 진행 지점(업무맥락/추천/Work Map)으로
    // 바로 이어서 들어간다 — 로그인 화면을 다시 거치지 않는다. hydration이 끝나기
    // 전에는 memberSession이 아직 복원 전(anonymous 기본값)이라 신뢰할 수 없으므로,
    // 그 사이의 클릭은 항상 안전한 기본값인 로그인 화면으로 보낸다.
    const handleTaskBasedCreation = () => {
        if (!hydrated || !isAuthenticated(memberSession)) {
            navigate(SOP_INTAKE_ROUTES.login);
            return;
        }
        navigate(resolvePostLoginRoute({ session: memberSession, memberContext, recommendation: taskRecommendation, hasWorkMapDraft }));
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white shadow-2xs">
                <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-6">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">SOP</div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-semibold leading-tight text-zinc-900">구성원 Home</h1>
                        <p className="truncate text-xs text-zinc-500">SOP 작성 및 분석 플랫폼 · 고객사 검토용 프로토타입</p>
                    </div>
                    <SopRoleNav />
                </div>
            </header>

            <main className="mx-auto max-w-[1440px] space-y-5 px-6 py-6">
                {/* 기본 정보 + SOP 현황 */}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white"><UserCheck className="h-5 w-5" /></div>
                            <div>
                                <h2 className="text-sm font-bold text-zinc-900">기본 정보</h2>
                                <p className="text-[11px] text-zinc-500">프로토타입 사용자 정보입니다. 실제 SSO/HR 연동은 이 범위에 포함되지 않습니다.</p>
                            </div>
                        </div>
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {[
                                ['이름', memberInfo.name],
                                ['사번', memberInfo.employeeId || memberInfo.id || '미지정'],
                                ['조직', memberInfo.organization || '미지정'],
                                ['직급', memberInfo.grade || '미지정'],
                                ['주요 직무', memberInfo.jobRole],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
                                    <dd className="mt-1 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-900">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 text-white"><ClipboardList className="h-5 w-5" /></div>
                                <div>
                                    <h2 className="text-sm font-bold text-zinc-900">내 SOP 현황</h2>
                                    <p className="text-[11px] text-zinc-500">서버에 저장된 기록과 이 브라우저의 로컬 초안을 함께 집계합니다(같은 SOP는 한 번만). 서버는 in-memory reference 저장소 기준이며 재시작 시 초기화될 수 있습니다.</p>
                                </div>
                            </div>
                            {isLoadingRecords && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                        </div>

                        {recordsError && (
                            <p role="alert" className="mb-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {recordsError} (저장된 기록 없이 로컬 초안만 집계합니다)
                            </p>
                        )}

                        <div className="grid grid-cols-4 gap-2">
                            {STATUS_ORDER.map((status) => (
                                <div key={status} className={`rounded-xl border px-2 py-3 text-center ${SOP_MEMBER_SUMMARY_BUCKET_META[status].badgeClass}`}>
                                    <span className="block text-lg font-bold">{statusCounts[status]}</span>
                                    <span className="block text-[10px] font-semibold">{SOP_MEMBER_SUMMARY_BUCKET_META[status].label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2">
                            {([
                                ['나의 Task 수', contentCounts.taskCount],
                                ['나의 Activity 수 (고유)', contentCounts.activityCount],
                                ['보유 Skill 수 (고유)', contentCounts.skillCount],
                            ] as const).map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center">
                                    <span className="block text-base font-bold text-zinc-900">{value}</span>
                                    <span className="block text-[9px] font-semibold text-zinc-500">{label}</span>
                                </div>
                            ))}
                        </div>

                        {statusRows.length > 0 && (
                            <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                {statusRows.map((row) => {
                                    const serverRecord = row.source === 'server' ? records?.find((item) => item.id === row.id) : undefined;
                                    return (
                                        <div key={row.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-[11px] font-semibold text-zinc-800">{row.title}</p>
                                                    <p className="flex items-center gap-1 text-[10px] text-zinc-500">
                                                        {row.source === 'local-draft' ? (
                                                            <span className="rounded-sm border border-amber-300 bg-amber-50 px-1 py-0.2 font-semibold text-amber-700">브라우저 로컬 · 서버 미저장</span>
                                                        ) : (
                                                            <span>{SOP_LIFECYCLE_STATUS_META[row.lifecycleStatus].label}</span>
                                                        )}
                                                    </p>
                                                </div>
                                                {serverRecord && serverRecord.lifecycleStatus === 'draft' && serverRecord.document.reviewStatus === 'confirmed' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRequestApproval(serverRecord)}
                                                        disabled={approvalRequestId === serverRecord.id}
                                                        className="shrink-0 rounded-md border border-indigo-300 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                                    >
                                                        {approvalRequestId === serverRecord.id ? '요청 중...' : '승인 요청'}
                                                    </button>
                                                )}
                                                {serverRecord && serverRecord.lifecycleStatus === 'rejected' && (
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditRejected(serverRecord)}
                                                            className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
                                                        >
                                                            수정하기
                                                        </button>
                                                        {serverRecord.document.reviewStatus === 'confirmed' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRequestApproval(serverRecord)}
                                                                disabled={approvalRequestId === serverRecord.id}
                                                                title="프로토타입 기준: 재요청은 항상 직책자 검토부터 다시 시작합니다."
                                                                className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                                            >
                                                                {approvalRequestId === serverRecord.id ? '요청 중...' : '재요청'}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {serverRecord && serverRecord.lifecycleStatus === 'approved' && (
                                                    <span className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-500">읽기 전용</span>
                                                )}
                                            </div>
                                            {serverRecord?.lifecycleStatus === 'rejected' && serverRecord.rejection && (
                                                <div className="mt-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5">
                                                    <p className="text-[10px] font-bold text-rose-800">
                                                        반려 단계: {SOP_LIFECYCLE_STATUS_META[serverRecord.rejection.rejectedAtStage].label} · 사유: {serverRecord.rejection.reasonCode}
                                                    </p>
                                                    <p className="mt-0.5 text-[10px] leading-4 text-rose-700">{serverRecord.rejection.feedback}</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {approvalError && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-700">{approvalError}</p>}
                    </section>
                </div>

                {/* 시작점 선택 — 세 활성 경로는 서로 다른 화면이 아니라 Work Map 초안을 만드는
                    방법만 다른 하나의 파이프라인이다(CONTEXT.md §4). "이후 단계는 동일하다"는
                    사실은 카드마다 반복하지 않고 이 그룹 캡션 한 곳에서만 안내한다. */}
                <section>
                    <h2 className="mb-1 text-sm font-bold text-zinc-900">Work Map 시작점 선택</h2>
                    <p className="mb-3 text-[11px] text-zinc-500">
                        선택한 시작점으로 Work Map 초안을 만들면, 이후 검토와 SOP 생성은 동일한 흐름으로 이어집니다.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <button
                            type="button"
                            onClick={handleTaskBasedCreation}
                            className="flex flex-col items-start gap-2 rounded-2xl border border-indigo-300 bg-white p-5 text-left shadow-sm transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                        >
                            <span className="inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">권장 시작점</span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><Sparkles className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold text-zinc-900">Task 기반</h3>
                            <p className="text-xs leading-5 text-zinc-500"><span className="font-semibold text-zinc-700">시작점:</span> 업무맥락을 쓰고 AI 추천을 받습니다.</p>
                            <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-indigo-600">시작하기 →</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowTemplatePicker(true)}
                            className="flex flex-col items-start gap-2 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white"><Users className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold text-zinc-900">동료 SOP 기반</h3>
                            <p className="text-xs leading-5 text-zinc-500"><span className="font-semibold text-zinc-700">시작점:</span> 승인된 동료 SOP를 복제합니다.</p>
                            <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-600">템플릿 찾아보기 →</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowOwnPriorPicker(true)}
                            className="flex flex-col items-start gap-2 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white"><FileClock className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold text-zinc-900">기존 작성 기반</h3>
                            <p className="text-xs leading-5 text-zinc-500"><span className="font-semibold text-zinc-700">시작점:</span> 내 과거 기록을 복제합니다.</p>
                            <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-amber-600">내 기록 보기 →</span>
                        </button>

                        <button
                            type="button"
                            aria-disabled="true"
                            aria-describedby="work-material-disabled-note"
                            title="향후 제공 예정 — 파일 업로드·영상 캡처 기반 시작점은 아직 지원하지 않습니다."
                            onClick={(event) => event.preventDefault()}
                            className="flex cursor-not-allowed flex-col items-start gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-left opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-300 text-white"><FileUp className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold text-zinc-700">실무 자료 기반</h3>
                            <p id="work-material-disabled-note" className="text-xs leading-5 text-zinc-500"><span className="font-semibold text-zinc-600">시작점:</span> 파일 업로드 또는 영상 캡처 (준비 중).</p>
                            <span className="mt-auto inline-flex items-center rounded-md bg-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-600">향후 제공 (TBD)</span>
                        </button>
                    </div>
                </section>
            </main>

            {showTemplatePicker && <SopColleagueTemplatePicker onClose={() => setShowTemplatePicker(false)} navigate={navigate} fetchImpl={fetchImpl} />}
            {showOwnPriorPicker && (
                <SopOwnPriorPicker records={records ?? []} onClose={() => setShowOwnPriorPicker(false)} navigate={navigate} fetchImpl={fetchImpl} />
            )}
        </div>
    );
}
