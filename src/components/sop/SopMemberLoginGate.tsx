'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogIn, ArrowRight } from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { SopMemberRouteGuard } from './SopMemberRouteGuard';
import {
    REQUIRED_MEMBER_IDENTITY_FIELDS,
    SOP_INTAKE_ROUTES,
    isAuthenticated,
    resolvePostLoginRoute,
    type MemberIdentityValidation,
    type RequiredMemberIdentityField,
} from '@/lib/sop-member-intake';
import type { SopMember } from '@/lib/sop-types';

/**
 * REQ-AUTH-002 순서와 라벨. 이름은 코드베이스 어디에도 다시 강제하지 않으며 — 실제
 * 필수/선택 판정은 `validateMemberIdentity`(sop-member-intake.ts)가 유일한 원천이고,
 * 이 배열은 그 판정 순서를 그대로 화면 필드 순서로 반영한 UI 전용 라벨이다.
 */
const IDENTITY_FIELD_CONFIG: Record<RequiredMemberIdentityField, { label: string; placeholder: string }> = {
    employeeId: { label: '사번', placeholder: '예: 20231045' },
    name: { label: '이름', placeholder: '예: 김지훈' },
    organization: { label: '조직', placeholder: '예: 인사기획팀' },
    jobRole: { label: '주요 직무', placeholder: '예: 채용 운영' },
};

type IdentityFormState = Record<RequiredMemberIdentityField, string> & { grade: string };

const EMPTY_FORM: IdentityFormState = { employeeId: '', name: '', organization: '', jobRole: '', grade: '' };

/**
 * 라우팅과 훅을 분리하는 이 저장소의 기존 SOP 컴포넌트 규칙(SopMemberHome 참고):
 * `useRouter()`는 여기서만 호출하고, 실제 폼 로직은 `SopMemberLoginGateView`가 맡아
 * react-test-renderer로 라우터 컨텍스트 없이 직접 테스트할 수 있게 한다.
 */
export function SopMemberLoginGate() {
    const router = useRouter();
    return (
        <SopMemberRouteGuard route={SOP_INTAKE_ROUTES.login} navigate={router.replace}>
            <SopMemberLoginGateView navigate={router.push} />
        </SopMemberRouteGuard>
    );
}

export function SopMemberLoginGateView({ navigate }: { navigate: (href: string) => void }) {
    const memberSession = useSopPrototypeStore((state) => state.memberSession);
    const memberContext = useSopPrototypeStore((state) => state.memberContext);
    const taskRecommendation = useSopPrototypeStore((state) => state.taskRecommendation);
    const hasWorkMapDraft = useSopPrototypeStore((state) => !!state.workMapDraft);
    const submitMemberIdentity = useSopPrototypeStore((state) => state.submitMemberIdentity);
    const signOutMember = useSopPrototypeStore((state) => state.signOutMember);

    const [form, setForm] = useState<IdentityFormState>(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredMemberIdentityField, string>>>({});
    const fieldRefs = useRef<Partial<Record<RequiredMemberIdentityField, HTMLInputElement | null>>>({});

    // REQ-AUTH-001: 이미 로그인한 구성원이 /sop/login에 다시 들어와도 접근 자체는
    // 막지 않는다(로그아웃 후 다른 구성원으로 들어오는 경로이기도 하다) — 대신 화면이
    // 안내와 다음 행동을 제공한다 (SPEC §2.2, sop-member-intake.ts 주석 참고).
    if (isAuthenticated(memberSession)) {
        const member = memberSession.member as SopMember;
        const continueRoute = resolvePostLoginRoute({ session: memberSession, memberContext, recommendation: taskRecommendation, hasWorkMapDraft });
        return (
            <div style={{ minHeight: '100%' }} className="flex min-h-[calc(100vh-0px)] items-center justify-center bg-slate-50 p-8">
                <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
                    <ShieldCheck className="mx-auto h-8 w-8 text-indigo-600" />
                    <h1 className="mt-3 text-base font-semibold text-zinc-900">
                        이미 <span className="text-indigo-700">{member.name}</span>님으로 로그인되어 있습니다
                    </h1>
                    <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">{member.organization ?? '조직 미확인'} · {member.jobRole}</p>
                    <div className="mt-5 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => navigate(continueRoute)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                            계속 진행 <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={signOutMember}
                            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                        >
                            다른 구성원으로 로그인
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleFieldChange = (field: RequiredMemberIdentityField | 'grade', value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const input: Partial<SopMember> = {
            employeeId: form.employeeId,
            name: form.name,
            organization: form.organization,
            jobRole: form.jobRole,
            ...(form.grade.trim() ? { grade: form.grade } : {}),
        };
        const result: MemberIdentityValidation = submitMemberIdentity(input);
        if (!result.ok) {
            setFieldErrors(result.fieldErrors);
            const firstErrorField = REQUIRED_MEMBER_IDENTITY_FIELDS.find((field) => result.fieldErrors[field]);
            if (firstErrorField) fieldRefs.current[firstErrorField]?.focus();
            return;
        }
        setFieldErrors({});
        navigate(SOP_INTAKE_ROUTES.context);
    };

    return (
        <div className="flex min-h-[calc(100vh-0px)] items-center justify-center bg-slate-50 p-8">
            <form onSubmit={handleSubmit} noValidate className="w-full max-w-[480px] rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
                <div className="mb-3 flex items-center gap-1.5">
                    <LogIn className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    <span className="text-[11px] font-bold tracking-wide text-indigo-600">프로토타입 로그인</span>
                </div>
                <h1 className="mb-1 text-base font-semibold text-zinc-900">구성원 정보를 입력하고 시작하세요</h1>
                <p className="mb-6 text-[11px] leading-5 text-zinc-500">
                    실제 계정 인증이 아닌 데모용 프로토타입 게이트입니다. 입력한 정보는 Task 추천과 SOP 작성 화면에서 사용됩니다.
                </p>

                {REQUIRED_MEMBER_IDENTITY_FIELDS.map((field) => {
                    const config = IDENTITY_FIELD_CONFIG[field];
                    const error = fieldErrors[field];
                    return (
                        <div key={field} className="mb-3.5">
                            <label htmlFor={`sop-login-${field}`} className="mb-1 block text-xs font-semibold text-zinc-700">
                                {config.label} <span className="text-rose-600">*</span>
                            </label>
                            <input
                                id={`sop-login-${field}`}
                                ref={(el) => {
                                    fieldRefs.current[field] = el;
                                }}
                                type="text"
                                value={form[field]}
                                onChange={(event) => handleFieldChange(field, event.target.value)}
                                placeholder={config.placeholder}
                                aria-invalid={!!error}
                                aria-describedby={error ? `sop-login-${field}-error` : undefined}
                                className={`h-[38px] w-full rounded-lg border px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                                    error ? 'border-rose-400 bg-rose-50' : 'border-zinc-300'
                                }`}
                            />
                            {error && (
                                <p id={`sop-login-${field}-error`} role="alert" className="mt-1 text-[11px] font-medium text-rose-600">
                                    {error}
                                </p>
                            )}
                        </div>
                    );
                })}

                <div className="mb-6">
                    <label htmlFor="sop-login-grade" className="mb-1 block text-xs font-semibold text-zinc-700">
                        직급 <span className="text-[10px] font-medium text-zinc-400">(선택)</span>
                    </label>
                    <input
                        id="sop-login-grade"
                        type="text"
                        value={form.grade}
                        onChange={(event) => handleFieldChange('grade', event.target.value)}
                        placeholder="예: 대리"
                        className="h-[38px] w-full rounded-lg border border-zinc-300 px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                </div>

                <button
                    type="submit"
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                    로그인하고 업무 작성 시작
                </button>
                <p className="mt-3 text-center text-[10px] text-zinc-400">비밀번호·API Key·주민번호는 요구하지 않습니다.</p>
            </form>
        </div>
    );
}
