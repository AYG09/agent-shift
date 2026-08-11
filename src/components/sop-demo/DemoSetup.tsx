'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useSopDemoStore } from '@/lib/sop-demo-store';
import type { DemoMode, DemoPreset } from '@/lib/sop-demo-fixtures';
import { WorkLibraryEditor } from './WorkLibraryEditor';

const modes: Array<{ id: DemoMode; title: string; body: string }> = [
    { id: 'compact', title: 'Compact', body: '번호·이름' },
    { id: 'standard', title: 'Standard', body: '이름·핵심 정의' },
    { id: 'detailed', title: 'Detailed', body: '정의·필수 SKILL' },
];
const presets: Array<{ id: DemoPreset; title: string; body: string }> = [
    { id: 'simple', title: 'Simple', body: '8개 노드' },
    { id: 'standard', title: 'Standard', body: '11–13개 노드' },
    { id: 'branching', title: 'Branching', body: '14–16개 노드' },
];

export function DemoSetup() {
    const router = useRouter();
    const store = useSopDemoStore();
    const [loading, setLoading] = useState(false);
    const generate = (quick = false) => {
        if (!quick && (!store.member.name.trim() || !store.member.role.trim() || !store.workLibraryConfirmed)) return;
        const mode = quick ? 'detailed' : store.mode;
        const preset = quick ? 'branching' : store.preset;
        if (quick) { store.setMode(mode); store.setPreset(preset); }
        setLoading(true);
        window.setTimeout(() => {
            store.generate();
            router.push(`/sop/demo/workspace?scenario=${store.scenario}&mode=${mode}&preset=${preset}`);
        }, 450);
    };

    return <main className="flex h-screen flex-col overflow-hidden bg-[#f6f8fb] text-slate-900">
        <header className="shrink-0 border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-2">
                <div><div className="flex items-center gap-2"><span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-bold text-indigo-700">샘플 목업</span><span className="text-[11px] font-medium text-slate-500">AI 생성 결과 예시</span></div><h1 className="mt-1 text-lg font-bold tracking-tight">SOP 생성 조건 확인</h1></div>
                <button onClick={() => generate(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"><Sparkles size={16}/>대표 채용 SOP 샘플 바로 보기</button>
            </div>
        </header>
        <div className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 gap-3 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
                <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><SectionTitle number="01" title="구성원 정보" body="SOP의 책임 역할과 검토 관점을 설정합니다."/><div className="mt-2 grid gap-3 md:grid-cols-3"><Field label="구성원 이름" value={store.member.name} onChange={(value) => store.setMember({ name: value })}/><Field label="담당 직무" value={store.member.role} onChange={(value) => store.setMember({ role: value })}/><Field label="소속 조직 또는 팀" value={store.member.organization} onChange={(value) => store.setMember({ organization: value })}/></div></section>
                <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><SectionTitle number="02" title="Work Library Data" body="초안 Task·주요 Activity·유관 SKILL을 편집하고 SOP 생성 대상을 선택합니다."/><WorkLibraryEditor /></section>
            </section>
            <aside className="grid min-h-0 content-start gap-4">
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">표시 수준</h2><div className="mt-3 grid grid-cols-3 gap-2">{modes.map((item) => <Choice key={item.id} active={store.mode === item.id} onClick={() => store.setMode(item.id)} title={item.title} body={item.body}/>)}</div></section>
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">워크플로 구조 preset</h2><div className="mt-3 grid grid-cols-3 gap-2">{presets.map((item) => <Choice key={item.id} active={store.preset === item.id} onClick={() => store.setPreset(item.id)} title={item.title} body={item.body}/>)}</div></section>
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">업무 맥락</h2><textarea aria-label="업무 맥락" value={store.context} onChange={(event) => store.setContext(event.target.value)} rows={5} className="mt-3 w-full rounded-lg border border-slate-300 p-2.5 text-xs leading-5 outline-none focus:border-indigo-500"/><div className="mt-2 flex flex-wrap gap-1.5">{['선행 조건', '확인 기준', '예외 조건', '재작업 조건'].map((chip) => <button key={chip} onClick={() => store.setContext(`${store.context}\n- ${chip}: `)} className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-600">+ {chip}</button>)}</div></section>
                <button disabled={loading || !store.member.name.trim() || !store.member.role.trim() || !store.workLibraryConfirmed} onClick={() => generate()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300">{loading ? <><Loader2 size={17} className="animate-spin"/>샘플 SOP 화면을 구성하고 있습니다.</> : <>샘플 SOP 생성 결과 보기 <ChevronRight size={17}/></>}</button>
            </aside>
        </div>
    </main>;
}

function SectionTitle({ number, title, body }: { number: string; title: string; body: string }) { return <div className="flex gap-3"><span className="mt-0.5 text-xs font-bold text-indigo-600">{number}</span><div><h2 className="text-base font-bold">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{body}</p></div></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs font-semibold text-slate-600">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500"/></label>; }
function Choice({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body: string }) { return <button onClick={onClick} className={`rounded-lg border p-2 text-left ${active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><div className="flex justify-between"><strong className="text-[11px]">{title}</strong>{active && <Check size={13} className="text-indigo-600"/>}</div><p className="mt-1 text-[10px] leading-4 text-slate-500">{body}</p></button>; }
