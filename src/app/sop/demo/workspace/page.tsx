import { Suspense } from 'react';
import { DemoWorkspace } from '@/components/sop-demo/DemoWorkspace';

export default function SopDemoWorkspacePage() {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-slate-500">샘플 SOP를 불러오는 중입니다.</div>}><DemoWorkspace /></Suspense>;
}
