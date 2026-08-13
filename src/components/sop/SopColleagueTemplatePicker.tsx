'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Copy, Loader2, Search, Users } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { cloneSopTemplate, listSopTemplates } from '@/lib/sop-record-client';
import type { SopTemplateSummary } from '@/lib/sop-template';

/**
 * Lists approved, template-eligible colleague SOPs (already sanitized server-side,
 * own records already excluded — see GET /api/sop/templates) and clones a chosen
 * one into a brand-new, independent draft under the current member's own
 * identity. Never edits or merges the source record; the clone is a fresh
 * document the member can then edit freely in Workspace. Takes `navigate` as a
 * prop (rather than calling `useRouter()` itself) so it stays renderable
 * outside a Next.js App Router context — see SopMemberHome.tsx's docstring.
 *
 * Matching here is plain case-insensitive substring matching against
 * Task name / SOP title / job-role category, and "우선 표시" is a stable sort
 * (same job-role category as the current member first) — NOT an AI-similarity
 * ranking. Every label in this component says so explicitly so it is never
 * mistaken for smarter matching than it actually does.
 */
export function SopColleagueTemplatePicker({ onClose, navigate, fetchImpl }: { onClose: () => void; navigate: (href: string) => void; fetchImpl?: typeof fetch }) {
    const memberInfo = useSopPrototypeStore((state) => state.memberInfo);
    const setDocument = useSopPrototypeStore((state) => state.setDocument);
    const customerReviewMode = useSopPrototypeStore((state) => state.customerReviewMode);

    const [templates, setTemplates] = useState<SopTemplateSummary[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selected, setSelected] = useState<SopTemplateSummary | null>(null);
    const [isCloning, setIsCloning] = useState(false);
    const [cloneError, setCloneError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listSopTemplates({ member: memberInfo, fetchImpl }).then((result) => {
            if (cancelled) return;
            if (result.success) setTemplates(result.data);
            else setLoadError(result.error);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberInfo]);

    // 문자열/카테고리 일치 기준 검색 + 정렬이다 - AI 유사도 분석이 아니다. 현재 구성원과 같은
    // jobRoleCategory를 우선 표시하되(안정 정렬), 검색어는 Task명·SOP 제목·직무 카테고리
    // 전체를 대상으로 한다.
    const visibleTemplates = useMemo(() => {
        if (!templates) return [];
        const query = searchQuery.trim().toLowerCase();
        const matched = query
            ? templates.filter((template) =>
                  template.taskName.toLowerCase().includes(query) ||
                  template.sopTitle.toLowerCase().includes(query) ||
                  template.jobRoleCategory.toLowerCase().includes(query)
              )
            : templates;
        const sameJobRole = matched.filter((template) => template.jobRoleCategory === memberInfo.jobRole);
        const otherJobRole = matched.filter((template) => template.jobRoleCategory !== memberInfo.jobRole);
        return [...sameJobRole, ...otherJobRole];
    }, [templates, searchQuery, memberInfo.jobRole]);

    const handleClone = async () => {
        if (!selected || customerReviewMode) return;
        setIsCloning(true);
        setCloneError(null);
        const result = await cloneSopTemplate({ member: memberInfo, templateId: selected.templateId, fetchImpl });
        setIsCloning(false);
        if (!result.success) {
            setCloneError(result.error);
            return;
        }
        if (!setDocument(result.data)) {
            setCloneError('복제된 SOP를 현재 문서에 적용하지 못했습니다. 고객 검토 모드와 문서 상태를 확인해 주세요.');
            return;
        }
        onClose();
        navigate('/sop/workspace');
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="colleague-template-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                    <h3 id="colleague-template-title" className="flex items-center gap-2 text-lg font-bold text-zinc-900">
                        <Users className="h-5 w-5 text-indigo-600" /> 동료 SOP 기반 생성
                    </h3>
                    <button type="button" onClick={onClose} aria-label="닫기" className="text-xl font-bold text-zinc-400 hover:text-zinc-700">
                        &times;
                    </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-zinc-500">
                    승인 완료되고 템플릿 공유가 허용된 동료 SOP만 표시되며, 내가 작성한 SOP는 제외됩니다. 이름·사번·소속 등 개인정보는 표시하지 않으며, 선택 시 원본을 수정하지 않고 나만의 새 독립 초안으로 복제됩니다.
                </p>

                {templates !== null && templates.length > 0 && (
                    <div className="mt-3">
                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Task명 · SOP 제목 · 직무로 검색"
                                className="w-full rounded-lg border border-zinc-300 py-2 pl-8 pr-3 text-xs focus:border-indigo-500 focus:outline-none"
                            />
                        </label>
                        <p className="mt-1 text-[10px] text-zinc-400">
                            문자열 일치 기준 검색입니다(AI 유사도 분석 아님). 내 직무({memberInfo.jobRole})와 같은 카테고리의 SOP를 목록 상단에 우선 표시합니다.
                        </p>
                    </div>
                )}

                {templates === null && !loadError && (
                    <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
                    </div>
                )}

                {loadError && (
                    <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
                    </p>
                )}

                {templates !== null && templates.length === 0 && (
                    <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-xs text-zinc-500">
                        아직 승인 완료 · 템플릿 공유가 허용된 동료 SOP가 없습니다. 실제 저장소(in-memory reference adapter)에 데이터가 쌓이면 여기에 표시됩니다.
                    </div>
                )}

                {templates !== null && templates.length > 0 && visibleTemplates.length === 0 && (
                    <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500">
                        &quot;{searchQuery}&quot;와 일치하는 동료 SOP가 없습니다. 다른 검색어로 다시 시도해 주세요.
                    </div>
                )}

                {visibleTemplates.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {visibleTemplates.map((template) => {
                            const isSelected = selected?.templateId === template.templateId;
                            const isSameJobRole = template.jobRoleCategory === memberInfo.jobRole;
                            return (
                                <button
                                    key={template.templateId}
                                    type="button"
                                    onClick={() => setSelected(template)}
                                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-zinc-900">{template.sopTitle}</p>
                                        {isSameJobRole && <span className="shrink-0 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">내 직무와 동일</span>}
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-zinc-500">Task: {template.taskName} · {template.jobRoleCategory}</p>
                                    <p className="mt-0.5 text-[11px] text-zinc-400">Activity {template.activityCount}개 · Sub Action {template.subActionCount}개</p>
                                </button>
                            );
                        })}
                    </div>
                )}

                {selected && (
                    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                        <p className="text-xs font-bold text-indigo-900">선택한 템플릿을 복제해 새 독립 초안을 만듭니다.</p>
                        <p className="mt-1 text-[11px] leading-5 text-indigo-800">
                            원본 동료 SOP는 수정되지 않습니다. 복제본은 내 이름으로 새 문서가 되며, 검토·승인·Agent화 확정 상태는 모두 초기화됩니다.
                        </p>
                        {cloneError && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-700">{cloneError}</p>}
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleClone}
                                disabled={isCloning || customerReviewMode}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                            >
                                {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} 이 템플릿으로 새 초안 만들기
                            </button>
                            <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                                다른 템플릿 선택
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
