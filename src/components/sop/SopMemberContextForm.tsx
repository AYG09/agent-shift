'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopMemberRouteGuard } from './SopMemberRouteGuard';
import { SopInspectorSection } from './SopInspectorSection';
import { SOP_INTAKE_ROUTES, isSubmittableContext } from '@/lib/sop-member-intake';

/**
 * REQ-CTX-002 보조 예시 — INT-CTX-001에 따라 최대 3개 그룹으로 묶어 하나의 접힌
 * section 안에 둔다(기존 SopSetupGate의 평면 6칩 목록을 재사용하지 않는 이유:
 * 그 배열은 SopSetupGate.tsx 내부 비공개 상수이고, 이 화면은 "3개 이하 그룹"이라는
 * 다른 정보 구조를 요구하므로 그룹화한 새 예시 문구를 둔다). 클릭하면 draft 끝에
 * 삽입된다 — 기존 화면의 "삽입형 칩" 동작을 그대로 유지한다.
 */
const CONTEXT_HELP_GROUPS: { title: string; chips: { label: string; snippet: string }[] }[] = [
    {
        title: '업무 순서와 조건',
        chips: [
            { label: '선행 조건', snippet: '\n[선행 조건]\n- 필수 제출 서류 및 사전에 완료되어야 하는 작업' },
            { label: '승인·의사결정 기준', snippet: '\n[승인 및 의사결정 기준]\n- 결재권자 및 승인 허들 조건' },
        ],
    },
    {
        title: '예외와 재작업',
        chips: [
            { label: '예외·반려 조건', snippet: '\n[예외 및 반려 조건]\n- 수락 불가 조건 및 예외 발생 시 대처 방안' },
            { label: '반드시 지켜야 하는 업무 원칙', snippet: '\n[필수 업무 원칙]\n- 개인정보보호 준수, 가이드라인 엄수' },
        ],
    },
    {
        title: '도구와 협업',
        chips: [
            { label: '사용 시스템과 도구', snippet: '\n[사용 시스템 및 도구]\n- ATS, 전자결재, Slack, 이메일, Excel' },
            { label: '협업 대상', snippet: '\n[협업 대상]\n- 현업 부서 팀장, 경영진, 외주 파트너' },
        ],
    },
];

/** SopMemberHome/SopMemberLoginGate와 같은 규칙: 라우터 훅은 여기서만, 실제 로직은 View가 맡는다. */
export function SopMemberContextForm() {
    const router = useRouter();
    return (
        <SopMemberRouteGuard route={SOP_INTAKE_ROUTES.context} navigate={router.replace}>
            <SopMemberContextFormView navigate={router.push} />
        </SopMemberRouteGuard>
    );
}

export function SopMemberContextFormView({ navigate }: { navigate: (href: string) => void }) {
    const memberContext = useSopPrototypeStore((state) => state.memberContext);
    const setMemberContextDraft = useSopPrototypeStore((state) => state.setMemberContextDraft);
    const submitMemberContext = useSopPrototypeStore((state) => state.submitMemberContext);

    const [submitAttempted, setSubmitAttempted] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const draft = memberContext.draft;
    const showEmptyError = submitAttempted && !isSubmittableContext(draft);

    const handleInsertSnippet = (snippet: string) => {
        setMemberContextDraft(draft + snippet);
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitAttempted(true);
        // 추천 API는 이 화면에서 호출하지 않는다 — submitMemberContext는 recommendation-pending
        // 전이만 만들고, 실제 요청은 /sop/recommendation(Session B)이 그 pending 상태를
        // 소비해 한 번 보낸다.
        const result = submitMemberContext();
        if (!result) {
            textareaRef.current?.focus();
            return;
        }
        navigate(SOP_INTAKE_ROUTES.recommendation);
    };

    return (
        <div className="flex min-h-[calc(100vh-0px)] flex-col bg-slate-50">
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-zinc-200 bg-white shadow-2xs">
                <div className="mx-auto flex w-full max-w-[1440px] items-center gap-5 px-6">
                    <span className="text-sm font-bold text-zinc-900">SOP 작성</span>
                    <ol className="flex items-center gap-2">
                        <StepBadge index="✓" label="로그인" state="done" />
                        <StepSeparator />
                        <StepBadge index={2} label="업무맥락 작성" state="current" />
                        <StepSeparator />
                        <StepBadge index={3} label="AI 추천" state="upcoming" />
                        <StepSeparator />
                        <StepBadge index={4} label="Work Map" state="upcoming" />
                    </ol>
                </div>
            </header>

            <main className="flex flex-1 justify-center overflow-y-auto px-6 py-10">
                <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-[760px] flex-col">
                    <h1 id="sop-context-heading" className="mb-1 text-base font-semibold text-zinc-900">지금 하고 있는 일과 업무 맥락을 알려주세요</h1>
                    <p className="mb-5 text-[11px] leading-5 text-zinc-500">
                        실제 업무 순서, 승인·판단 지점, 예외·재작업 상황, 사용 도구, 협업 대상을 적어주시면 AI가 관련 Task를 추천합니다.
                    </p>

                    <textarea
                        ref={textareaRef}
                        rows={9}
                        value={draft}
                        onChange={(event) => setMemberContextDraft(event.target.value)}
                        placeholder="예) 채용 공고를 등록하고 지원자 서류를 검토합니다. 1차 서류합격자를 대상으로 면접 일정을 조율하고, 면접 결과를 ATS에 기록합니다. 채용 기준에 예외가 있으면 팀장 승인을 받아 진행합니다..."
                        aria-labelledby="sop-context-heading"
                        aria-invalid={showEmptyError}
                        aria-describedby={showEmptyError ? 'sop-context-error' : undefined}
                        className={`min-h-[220px] w-full resize-y rounded-xl border p-4 text-[13px] leading-5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                            showEmptyError ? 'border-rose-300 bg-rose-50' : 'border-zinc-300 bg-white'
                        }`}
                    />

                    <div className="mt-1.5 flex items-center justify-between">
                        {showEmptyError ? (
                            <p id="sop-context-error" role="alert" className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                                <AlertCircle className="h-3 w-3 shrink-0" /> 공백만 있는 입력은 제출할 수 없습니다.
                            </p>
                        ) : (
                            <p className="text-[11px] text-zinc-400">글자 수 제한은 없습니다.</p>
                        )}
                        <p className="text-[10px] text-zinc-400">{draft.length}자 작성됨</p>
                    </div>

                    <div className="mt-5">
                        <SopInspectorSection title="작성이 막막하신가요? 참고 예시 보기">
                            <div className="flex flex-col gap-3">
                                {CONTEXT_HELP_GROUPS.map((group) => (
                                    <div key={group.title}>
                                        <p className="mb-1.5 text-[10px] font-bold text-zinc-500">{group.title}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {group.chips.map((chip) => (
                                                <button
                                                    key={chip.label}
                                                    type="button"
                                                    onClick={() => handleInsertSnippet(chip.snippet)}
                                                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                                >
                                                    + {chip.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SopInspectorSection>
                    </div>
                </form>
            </main>

            <div className="flex h-16 shrink-0 items-center justify-end gap-2.5 border-t border-zinc-200 bg-white px-8">
                <span className="text-[10px] text-zinc-400">추천은 다음 화면에서 확인 후 확정합니다.</span>
                <button
                    type="button"
                    onClick={() => textareaRef.current?.form?.requestSubmit()}
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                    입력 완료 · Task 추천 받기
                </button>
            </div>
        </div>
    );
}

function StepBadge({ index, label, state }: { index: React.ReactNode; label: string; state: 'done' | 'current' | 'upcoming' }) {
    const dotClass =
        state === 'current' ? 'bg-indigo-600 text-white' : state === 'done' ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-100 text-zinc-400';
    const labelClass = state === 'current' ? 'font-bold text-indigo-600' : state === 'done' ? 'font-semibold text-zinc-500' : 'font-semibold text-zinc-400';
    return (
        <li aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-1.5">
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${dotClass}`}>{index}</span>
            <span className={`text-[11px] ${labelClass}`}>{label}</span>
        </li>
    );
}

function StepSeparator() {
    return (
        <li aria-hidden="true" className="text-[11px] text-zinc-300">
            ›
        </li>
    );
}
