'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle2,
    Save,
    RotateCcw,
    Sliders,
    Eye,
    EyeOff,
    Check,
    AlertCircle,
    ArrowLeft,
    Sparkles,
    Undo2,
    Redo2,
    Plus,
    BookOpen,
} from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { returnSopWorkspaceToSetup } from '@/lib/sop-setup-actions';
import { SopSidebar } from './SopSidebar';
import { SopCanvas } from './SopCanvas';
import { SopStepInspector } from './SopStepInspector';
import { SopServerSaveControl } from './SopServerSaveControl';
import { SopRoleNav } from './SopRoleNav';
import { formatClockTime } from '@/lib/sop-format';
import { SopStepData } from '@/lib/sop-types';
import { SOP_REVIEW_STATUS_BADGE_CLASS, SOP_DOCUMENT_REVIEW_STATUS_LABEL } from '@/lib/sop-review-status-meta';

export const SopWorkspace: React.FC = () => {
    const router = useRouter();
    const {
        document,
        generateFromSample,
        customerReviewMode,
        setCustomerReviewMode,
        toggleCustomerReviewMode,
        confirmFullSop,
        saveSnapshot,
        lastSavedTimestamp,
        undo,
        redo,
        history,
        future,
        insertStepBeforeEnd,
        updateDocumentTitle,
    } = useSopPrototypeStore();

    const [showMiniMap, setShowMiniMap] = useState(true);
    const [showBranchLabels, setShowBranchLabels] = useState(true);

    const [showCriteriaModal, setShowCriteriaModal] = useState(false);
    const [showRegenerateModal, setShowRegenerateModal] = useState(false);
    const [confirmErrors, setConfirmErrors] = useState<string[] | null>(null);
    const [saveToast, setSaveToast] = useState(false);
    const [addStepNotice, setAddStepNotice] = useState<string | null>(null);

    // Auto-load sample SOP if document is missing on direct /sop/workspace URL access
    useEffect(() => {
        if (!document) {
            generateFromSample();
        }
    }, [document, generateFromSample]);

    if (!document) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50">
                <div className="flex items-center gap-2 text-zinc-500 font-medium">
                    <Sparkles className="w-5 h-5 animate-spin text-indigo-600" /> SOP 데이터를 로딩 중입니다...
                </div>
            </div>
        );
    }

    const handleSaveDraft = () => {
        if (customerReviewMode) return;
        saveSnapshot();
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 2000);
    };

    // Returning to the setup gate is an explicit session transition, not a toggle:
    // a new sample/AI result must be applicable after the user intentionally leaves
    // customer review mode from either Workspace entry point.
    const returnToSetup = () => {
        returnSopWorkspaceToSetup({ setCustomerReviewMode, navigate: router.push });
    };

    const handleConfirmSop = () => {
        if (customerReviewMode) return;
        const result = confirmFullSop();
        if (!result.success) {
            setConfirmErrors(result.errors);
        } else {
            setConfirmErrors(null);
            handleSaveDraft();
        }
    };

    const handleAddStepClick = () => {
        const newId = `step-${Date.now()}`;
        const endStep = document.steps.find((s) => s.terminalType === 'end');

        const newStep: SopStepData = {
            id: newId,
            title: '신규 수행 단계',
            definition: '수행할 주요 작업 항목과 기준 및 결과를 작성해 주세요.',
            shape: 'process',
            position: endStep ? { x: endStep.position.x - 40, y: endStep.position.y + 180 } : { x: 200, y: 150 },
            requiredSkills: [],
            reviewStatus: 'ai-draft',
        };

        // 새 단계는 항상 종료 노드 바로 앞에 삽입한다(종료 뒤에 붙는 잘못된 edge를 만들지 않는다).
        // 안전하게 삽입할 위치를 정할 수 없는 구조(종료 노드 0/2개 이상, 종료로 들어오는 edge 없음)라면
        // 아무 edge도 만들지 않고 사용자에게 캔버스에서 직접 위치를 지정하도록 안내한다.
        const result = insertStepBeforeEnd(newStep);
        if (!result.success) {
            setAddStepNotice(result.reason || '단계를 자동으로 삽입할 위치를 찾지 못했습니다. 캔버스에서 직접 연결선을 그어 추가해 주세요.');
            window.setTimeout(() => setAddStepNotice(null), 5000);
        }
    };

    // No server storage is connected yet (see SopRepository, src/lib/sop-repository.ts) —
    // this document lives only in this browser's localStorage, not on a shared server.
    const formatTimestamp = (tsString: string | null) => {
        if (!tsString) return '이 브라우저에 저장됨';
        return `이 브라우저에 저장됨 (${formatClockTime(new Date(tsString))})`;
    };

    return (
        <div className="h-screen flex flex-col bg-zinc-100 overflow-hidden font-sans">
            {/* Sample-data banner: this document is a canned example, not an AI generation result. */}
            {document.isSampleData && (
                <div className="bg-amber-500 text-white text-xs font-bold py-1 px-4 text-center flex items-center justify-center gap-2 shrink-0">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>[샘플 데이터로 실행 중] 실제 AI 생성이 아닌 테스트용 샘플 SOP 데이터셋입니다.</span>
                </div>
            )}

            {/* Top Header */}
            <header className="h-14 bg-white border-b border-zinc-200 px-4 flex items-center justify-between shrink-0 z-30 shadow-2xs">
                {/* Left Header Group */}
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={returnToSetup}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                        title="게이트 설정으로 돌아가기"
                        aria-label="게이트 설정으로 돌아가기"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>

                    <div className="h-4 w-px bg-zinc-300" />

                    <div className="flex items-center gap-2 min-w-0">
                        <input
                            type="text"
                            value={document.title}
                            onChange={(e) => updateDocumentTitle(e.target.value)}
                            disabled={customerReviewMode}
                            title={customerReviewMode ? '고객 검토 모드에서는 제목을 수정할 수 없습니다.' : undefined}
                            className="text-sm font-bold text-zinc-900 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-indigo-500 focus:bg-white px-1.5 py-0.5 rounded focus:outline-hidden max-w-[260px] truncate disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-transparent"
                        />
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200 shrink-0">
                            {document.member.name} ({document.member.jobRole})
                        </span>
                        <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${SOP_REVIEW_STATUS_BADGE_CLASS[document.reviewStatus]}`}
                        >
                            {SOP_DOCUMENT_REVIEW_STATUS_LABEL[document.reviewStatus]}
                        </span>
                    </div>
                </div>

                {/* Center Section: Customer Review Mode + 역할 화면 이동 */}
                <div className="hidden lg:flex items-center gap-3">
                    <SopRoleNav compact />
                    {/* Customer Review Mode Toggle */}
                    <button
                        type="button"
                        onClick={toggleCustomerReviewMode}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                            customerReviewMode
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                        }`}
                    >
                        {customerReviewMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        고객 검토 모드 {customerReviewMode ? 'ON' : 'OFF'}
                    </button>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-2">
                    {/* Undo / Redo */}
                    <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg border border-zinc-200 mr-1">
                        <button
                            type="button"
                            onClick={undo}
                            disabled={customerReviewMode || history.length === 0}
                            className="p-1 text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={customerReviewMode ? '고객 검토 모드에서는 실행 취소를 사용할 수 없습니다.' : '실행 취소 (Undo)'}
                            aria-label="실행 취소"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={redo}
                            disabled={customerReviewMode || future.length === 0}
                            className="p-1 text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={customerReviewMode ? '고객 검토 모드에서는 다시 실행을 사용할 수 없습니다.' : '다시 실행 (Redo)'}
                            aria-label="다시 실행"
                        >
                            <Redo2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleAddStepClick}
                        disabled={customerReviewMode}
                        title={customerReviewMode ? '고객 검토 모드에서는 단계를 추가할 수 없습니다.' : undefined}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl border border-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-100"
                    >
                        <Plus className="w-3.5 h-3.5" /> 단계 추가
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowCriteriaModal(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-xl border border-zinc-300 transition-colors"
                    >
                        <Sliders className="w-3.5 h-3.5" /> 조건 보기
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowRegenerateModal(true)}
                        disabled={customerReviewMode}
                        title={customerReviewMode ? '고객 검토 모드에서는 다시 생성할 수 없습니다.' : undefined}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-xl border border-amber-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> 다시 생성
                    </button>

                    {/* Auto-save Status & Snapshot Button */}
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={customerReviewMode}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900"
                        title={customerReviewMode ? '고객 검토 모드에서는 저장할 수 없습니다.' : formatTimestamp(lastSavedTimestamp)}
                    >
                        <Save className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">{formatTimestamp(lastSavedTimestamp)}</span>
                        <span className="sm:hidden">저장</span>
                    </button>

                    <SopServerSaveControl />

                    <button
                        type="button"
                        onClick={handleConfirmSop}
                        disabled={customerReviewMode}
                        title={customerReviewMode ? '고객 검토 모드에서는 SOP를 확정할 수 없습니다.' : undefined}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" /> SOP 확정
                    </button>
                </div>
            </header>

            {customerReviewMode && (
                <div className="bg-indigo-50 text-indigo-800 text-[11px] font-medium py-1 px-4 text-center border-b border-indigo-200 shrink-0">
                    고객 검토 모드에서는 열람과 단계·연결선 탐색만 가능하며, 내용 수정·SKILL 변경·Agent화 판단·SOP 확정은 비활성화됩니다.
                </div>
            )}

            {/* Add-step Notice (safe auto-insert not possible) */}
            {addStepNotice && (
                <div
                    role="status"
                    className="fixed top-16 right-6 z-50 max-w-sm bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg flex items-start gap-2"
                >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{addStepNotice}</span>
                </div>
            )}

            {/* Save Toast Notification */}
            {saveToast && (
                <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 animate-bounce">
                    <Check className="w-4 h-4" /> 이 브라우저에 현재 초안을 저장했습니다. (프로토타입 로컬 저장)
                </div>
            )}

            {/* Main Workspace Body */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Sidebar */}
                <SopSidebar
                    showMiniMap={showMiniMap}
                    setShowMiniMap={setShowMiniMap}
                    showBranchLabels={showBranchLabels}
                    setShowBranchLabels={setShowBranchLabels}
                />

                {/* Center Canvas */}
                <div className="flex-1 h-full relative">
                    <SopCanvas showMiniMap={showMiniMap} showBranchLabels={showBranchLabels} />
                </div>

                {/* Right Step Inspector */}
                <div className="h-full w-[360px] shrink-0">
                    <SopStepInspector />
                </div>
            </div>

            {/* Criteria Modal (keyboard/screen-reader accessible dialog) */}
            {showCriteriaModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="criteria-modal-title"
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
                >
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-zinc-200">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                            <h3 id="criteria-modal-title" className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                                <Sliders className="w-4 h-4 text-indigo-600" /> SOP 생성 조건 정보
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowCriteriaModal(false)}
                                className="text-zinc-400 hover:text-zinc-700 text-lg font-bold"
                                aria-label="닫기"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="space-y-2 text-xs text-zinc-700 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200">
                            <div>
                                <span className="font-semibold text-zinc-900 block">담당자:</span>
                                {document.member.name} ({document.member.jobRole} / {document.member.organization || '팀'})
                            </div>
                            <div>
                                <span className="font-semibold text-zinc-900 block">Task Library:</span>
                                Task: {document.workLibrary.taskName} | Activity:{' '}
                                {document.workLibrary.activityName || '전체'}
                            </div>
                            <div>
                                <span className="font-semibold text-zinc-900 block">생성 설정:</span>
                                상세: {document.setupConfig?.detailLevel || 'standard'} | 단계:{' '}
                                {document.setupConfig?.minSteps}~{document.setupConfig?.maxSteps} | 분기:{' '}
                                {document.setupConfig?.branchPolicy}
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCriteriaModal(false)}
                                className="px-4 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded-xl"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Regenerate Confirm Modal */}
            {showRegenerateModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="regenerate-modal-title"
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
                >
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-zinc-200">
                        <div className="flex items-center gap-3 text-amber-800">
                            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                            <h3 id="regenerate-modal-title" className="text-base font-bold text-zinc-900">SOP 다시 생성 안내</h3>
                        </div>

                        <p className="text-xs text-zinc-600 leading-relaxed">
                            현재 수정한 내용이 초기화될 수 있습니다. 게이트 설정 화면으로 돌아가서 AI SOP를 다시
                            생성하시겠습니까?
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                            <button
                                type="button"
                                onClick={() => setShowRegenerateModal(false)}
                                className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-semibold rounded-xl hover:bg-zinc-200"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRegenerateModal(false);
                                    returnToSetup();
                                }}
                                className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700"
                            >
                                게이트로 이동하여 재생성
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SOP Confirm Errors Modal */}
            {confirmErrors && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-errors-modal-title"
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
                >
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-zinc-200">
                        <div className="flex items-center gap-3 text-rose-800 border-b border-rose-100 pb-3">
                            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                            <div>
                                <h3 id="confirm-errors-modal-title" className="text-base font-bold text-zinc-900">SOP 확정 조건 미충족 안내</h3>
                                <p className="text-xs text-zinc-500">다음 미해결 항목을 보완해야 SOP를 확정할 수 있습니다.</p>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {confirmErrors.map((err, idx) => (
                                <div
                                    key={idx}
                                    className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-medium flex items-start gap-2"
                                >
                                    <span className="font-bold">•</span>
                                    <span>{err}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end pt-3 border-t border-zinc-200">
                            <button
                                type="button"
                                onClick={() => setConfirmErrors(null)}
                                className="px-5 py-2 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-zinc-800"
                            >
                                확인 및 검토 계속하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
