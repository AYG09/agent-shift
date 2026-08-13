'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    UserCheck,
    FileText,
    Sparkles,
    Eye,
    ArrowRight,
    HelpCircle,
    AlertCircle,
    CheckCircle2,
    BookOpen,
    RefreshCw,
    X,
    KeyRound,
} from 'lucide-react';
import { useSopPrototypeStore } from '@/lib/sop-prototype-store';
import { enterTaskCreationPath, loadSampleSopFromSetup, runSopSetupGeneration } from '@/lib/sop-setup-actions';
import { useSopAiSettings } from '@/hooks/useSopAiSettings';
import { validateSopSetupConfig } from '@/lib/sop-setup-validation';
import { computeSubActionCapacity } from '@/lib/sop-subaction-capacity';
import { REASONING_LEVEL_LABELS } from '@/lib/gemini-models';
import { WorkLibrarySelector } from './WorkLibrarySelector';
import { SopGenerationSettings } from './SopGenerationSettings';
import { SopTaskRecommendationPanel } from './SopTaskRecommendationPanel';
import { SopActivityProposalPanel } from './SopActivityProposalPanel';
import { SopSetupReviewModeNotice } from './SopSetupReviewModeNotice';
import ApiKeySettings from '@/components/settings/ApiKeySettings';

const CONTEXT_TOPICS = [
    { label: '선행 조건', snippet: '\n[선행 조건]\n- 필수 제출 서류 및 사전에 완료되어야 하는 작업' },
    { label: '승인·의사결정 기준', snippet: '\n[승인 및 의사결정 기준]\n- 결재권자 및 승인 허들 조건' },
    { label: '예외·반려 조건', snippet: '\n[예외 및 반려 조건]\n- 수락 불가 조건 및 예외 발생 시 대처 방안' },
    { label: '사용 시스템과 도구', snippet: '\n[사용 시스템 및 도구]\n- ATS, 전자결재, Slack, 이메일, Excel' },
    { label: '협업 대상', snippet: '\n[협업 대상]\n- 현업 부서 팀장, 경영진, 외주 파트너' },
    { label: '반드시 지켜야 하는 업무 원칙', snippet: '\n[필수 업무 원칙]\n- 개인정보보호 준수, 가이드라인 엄수' },
    { label: '반복·재작업이 발생하는 조건', snippet: '\n[재작업/반복 조건]\n- 서류 재모집 또는 조건 재협의 최대 횟수' },
];

export const SopSetupGate: React.FC = () => {
    const router = useRouter();
    const {
        memberInfo,
        workLibrary,
        setWorkLibrary,
        context,
        setContext,
        setupConfig,
        generateFromSample,
        setDocument,
        customerReviewMode,
        setCustomerReviewMode,
        document,
    } = useSopPrototypeStore();

    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);

    // Direct /sop/setup entry (bookmark, refresh, back-button) must normalize the
    // generation scope exactly like Home's "Task 기반 생성" card click does — this
    // is the SAME enterTaskCreationPath function, not a second implementation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => enterTaskCreationPath({ workLibrary, setWorkLibrary }), []);

    const { apiKey, model, reasoning } = useSopAiSettings();
    const selectedTask = workLibrary.taskCatalog?.find((task) => task.id === workLibrary.taskId);
    // 구성원 Task 기반 생성 경로는 항상 Task 전체를 대상으로 한다 — "선택 Activity" 생성
    // 토글은 이 화면에서 제거되었다(고객 확정: Task 단위 생성이 기본 경로). workLibrary.sourceType이
    // 과거 세션에서 'activity'로 남아있더라도 이 Gate의 생성 요청은 항상 Task 전체를 사용한다.
    const selectedActivities = [...(selectedTask?.activities || [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    const activitiesForGeneration = selectedActivities
        .map((activity) => ({ id: activity.id, order: activity.order ?? selectedTask!.activities.indexOf(activity) + 1, name: activity.name, description: activity.description, skills: activity.skills }));

    // 워크플로우 구조 설정(4·5번 카드) 오류가 있으면 AI 생성 자체를 막는다 - 서버(app/api/ai/route.ts)도
    // 동일한 validateSopSetupConfig로 같은 조건을 다시 검사하므로, UI 검증만 신뢰하지 않는다.
    const setupConfigIssues = validateSopSetupConfig(setupConfig);
    const hasSetupConfigError = setupConfigIssues.length > 0;

    // Activity–Sub Action 구조는 Activity당 최소 1개의 Sub Action을 요구하므로, 주요 단계 수
    // 상한이 선택 Task의 Activity 수보다 작으면 AI가 여러 Activity를 하나의 단계로 조용히
    // 합칠 수밖에 없다(무음 truncation). 반대로 상한을 Activity 수와 동일하게 고정하면 이번엔
    // Activity당 정확히 1개의 Sub Action만 허용하는 것과 같아져, "한 Activity에 여러 Sub Action
    // 허용"이라는 계약을 어긴다. computeSubActionCapacity가 최소값과 상한을 분리해 계산한다 -
    // 생성 요청·프롬프트·후처리 검증이 모두 이 함수가 만든 동일한 값을 사용한다.
    const activityCount = selectedActivities.length;
    const capacity = computeSubActionCapacity({
        activityCount,
        minSteps: setupConfig.minSteps,
        maxSteps: setupConfig.maxSteps,
        maxTotalNodes: setupConfig.maxTotalNodes,
        detailLevel: setupConfig.detailLevel,
    });
    const { minSteps: effectiveMinSteps, maxSteps: effectiveMaxSteps, maxTotalNodes: effectiveMaxTotalNodes } = capacity;
    const activityCoverageWarning = capacity.explanation;

    const handleTopicClick = (snippet: string) => {
        setContext((context ? context.trim() + '\n' : '') + snippet);
    };

    const validateGate = (): boolean => {
        if (!memberInfo.name.trim() || !memberInfo.jobRole.trim()) {
            setValidationError('1. 구성원 정보(이름 및 담당 직무)를 모두 입력해 주세요.');
            return false;
        }
        if (!workLibrary.taskName.trim()) {
            setValidationError('2. Task Library의 Task를 선택해 주세요.');
            return false;
        }
        if (!selectedTask || selectedTask.name !== workLibrary.taskName) {
            setValidationError('2. 선택한 Task가 Task Library에 존재하지 않습니다. 다시 선택해 주세요.');
            return false;
        }
        if (activitiesForGeneration.length === 0) {
            setValidationError('2. Task 전체 SOP 생성에는 선택한 Task의 Activity가 하나 이상 필요합니다.');
            return false;
        }
        if (activitiesForGeneration.some((activity) => !activity.name.trim())) {
            setValidationError('2. SOP 생성 범위에 포함된 모든 Activity 이름을 입력해 주세요.');
            return false;
        }
        if (activitiesForGeneration.some((activity) => activity.skills.some((skill) => !skill.name.trim())) || workLibrary.skills.some((skill) => !skill.name.trim())) {
            setValidationError('2. SOP 생성 범위에 포함된 모든 SKILL 이름을 입력해 주세요.');
            return false;
        }
        if (!workLibrary.confirmed) {
            setValidationError('2. Task Library 카드에서 "검토 완료 · 확정" 버튼을 클릭해 주세요.');
            return false;
        }
        if (hasSetupConfigError) {
            setValidationError(
                `4/5. 워크플로우 구조 설정에 오류가 있습니다: ${setupConfigIssues.map((i) => i.message).join(' / ')}`
            );
            return false;
        }
        setValidationError(null);
        return true;
    };

    const handleExplicitLoadSample = () => {
        const outcome = loadSampleSopFromSetup({
            customerReviewMode,
            generateFromSample,
            navigate: router.push,
        });
        if (!outcome.success) setValidationError(outcome.message);
    };

    // 검토 모드 잠금 해제는 Workspace 토글과 정확히 같은 Store 액션을 사용한다.
    // 이 버튼이 없으면 Gate는 교착에 빠진다: 생성·샘플 열기는 검토 모드가 막고,
    // 검토 모드를 끌 수 있는 Workspace는 생성해야만 진입할 수 있기 때문이다.
    const handleExitReviewMode = () => {
        setCustomerReviewMode(false);
        setValidationError(null);
    };

    const handleGenerateAiSop = async () => {
        if (customerReviewMode) {
            setValidationError('고객 검토 모드에서는 새 SOP를 생성할 수 없습니다. 위의 "고객 검토 모드 종료" 버튼으로 잠금을 해제해 주세요.');
            return;
        }
        if (!validateGate()) return;

        // Request construction performs the shared Zod validation before any API call.
        // sourceType is read from workLibrary — the single source of truth for generation
        // scope (see withTaskScope/enterTaskCreationPath) — never hard-coded as a separate
        // literal here. The mount effect below normalizes it to 'task' on every entry to
        // this Gate, so by the time a member can click "AI SOP 생성" it is already 'task';
        // reading it here (instead of a literal) is what makes that normalization the real
        // source of truth rather than a redundant no-op. structureVersion stays a Gate-level
        // constant: this screen is exclusively the Activity–Sub Action creation path.
        await runSopSetupGeneration({
            customerReviewMode,
            requestParams: {
                    memberRole: memberInfo.jobRole,
                    sourceJobId: workLibrary.sourceJobId || 'legacy-job',
                    jobName: workLibrary.jobName || memberInfo.jobRole,
                    taskId: workLibrary.taskId,
                    taskName: workLibrary.taskName,
                    taskDefinition: selectedTask?.description || '구성원이 정의한 Task',
                    sourceType: workLibrary.sourceType,
                    structureVersion: 'activity-subaction-v1',
                    activities: activitiesForGeneration,
                    skills: workLibrary.skills,
                    context,
                    detailLevel: setupConfig.detailLevel,
                    minSteps: effectiveMinSteps,
                    maxSteps: effectiveMaxSteps,
                    maxTotalNodes: effectiveMaxTotalNodes,
                    branchPolicy: setupConfig.branchPolicy,
                    maxBranches: setupConfig.maxBranches,
                    allowRework: setupConfig.allowRework,
                    maxLoops: setupConfig.maxLoops,
                    splitComplexSteps: setupConfig.splitComplexSteps,
                    apiKey,
                    model,
                    reasoning,
            },
            apiParams: { member: memberInfo, workLibrary, context, setupConfig, structureVersion: 'activity-subaction-v1' },
            setDocument,
            navigate: router.push,
            setIsGenerating,
            setValidationError,
            setAiError,
        });
    };

    return (
        <div className="h-screen overflow-hidden bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-zinc-200 sticky top-0 z-30 shadow-2xs">
                <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                            SOP
                        </div>
                        <div>
                            <h1 className="text-base font-semibold text-zinc-900 leading-tight">
                                SOP 생성 전 확인 게이트
                            </h1>
                            <p className="text-xs text-zinc-500">고객사 검토 및 사용자 테스트용 독립 프로토타입</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ApiKeySettings
                            trigger={
                                <button
                                    type="button"
                                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors shadow-2xs ${
                                        apiKey
                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                                    }`}
                                >
                                    <KeyRound className="w-4 h-4" /> {apiKey ? 'API KEY 변경' : 'API KEY 등록'}
                                </button>
                            }
                        />
                        <button
                            type="button"
                            onClick={handleExplicitLoadSample}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl border border-zinc-300 transition-colors shadow-2xs"
                        >
                            <BookOpen className="w-4 h-4 text-indigo-600" /> 샘플 SOP 데이터로 열기
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto grid h-[calc(100vh-7.5rem)] max-w-[1440px] min-h-0 gap-4 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* 고객 검토 모드 잠금 안내 — 생성 버튼을 누르기 전에 잠금 상태와 해제 수단을 먼저 보여준다 */}
                {customerReviewMode && (
                    <SopSetupReviewModeNotice
                        documentExists={Boolean(document)}
                        onExitReviewMode={handleExitReviewMode}
                        onGoToWorkspace={() => router.push('/sop/workspace')}
                    />
                )}

                {/* Validation Error Banner */}
                {validationError && (
                    <div className="lg:col-span-2 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm font-medium animate-shake">
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>{validationError}</span>
                    </div>
                )}

                {/* AI generation failure requires an explicit retry/cancel choice, never a silent fallback. */}
                {aiError && (
                    <div className="lg:col-span-2 p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-3 shadow-sm">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 text-amber-900">
                                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold">AI SOP 생성 실패 안내</h3>
                                    <p className="text-xs text-amber-800 mt-0.5">{aiError}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAiError(null)}
                                className="text-amber-600 hover:text-amber-900 p-1"
                                aria-label="오류 안내 닫기"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-amber-200/80">
                            {!apiKey && (
                                <ApiKeySettings
                                    trigger={
                                        <button
                                            type="button"
                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs"
                                        >
                                            <KeyRound className="w-3.5 h-3.5" /> API KEY 등록
                                        </button>
                                    }
                                />
                            )}
                            <button
                                type="button"
                                onClick={handleGenerateAiSop}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> AI 생성 다시 시도
                            </button>

                            <button
                                type="button"
                                onClick={() => setAiError(null)}
                                className="px-4 py-2 bg-white border border-amber-300 text-amber-900 font-semibold text-xs rounded-xl hover:bg-amber-100/60"
                            >
                                게이트 입력 수정하기
                            </button>

                            <button
                                type="button"
                                onClick={handleExplicitLoadSample}
                                className="px-4 py-2 bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-xs rounded-xl flex items-center gap-1.5"
                            >
                                <BookOpen className="w-3.5 h-3.5" /> 샘플 데이터로 진행하기
                            </button>
                        </div>
                    </div>
                )}

                {/* 1. 구성원 정보 Card */}
                <div className="min-h-0 flex flex-col gap-4">
                <section className="shrink-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
                            <UserCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900">1. 구성원 정보</h2>
                            <p className="text-xs text-zinc-500">
                                프로토타입 로그인으로 식별된 구성원 정보입니다. 실제 인증 연동은 이 범위에 포함하지 않습니다.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div>
                            <span className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">사번</span>
                            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900">{memberInfo.employeeId || memberInfo.id || '프로토타입 계정'}</p>
                        </div>

                        <div>
                            <span className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">구성원 이름</span>
                            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900">{memberInfo.name}</p>
                        </div>

                        <div>
                            <span className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">담당 직무</span>
                            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900">{memberInfo.jobRole}</p>
                        </div>
                        <div>
                            <span className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">소속 조직</span>
                            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900">{memberInfo.organization || '미지정'}</p>
                        </div>
                    </div>
                </section>

                {/* 2. Task Library Card */}
                <section className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                    <SopTaskRecommendationPanel />
                    <WorkLibrarySelector />
                    {workLibrary.taskId && <SopActivityProposalPanel />}
                    {activityCoverageWarning && (
                        <p
                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
                            title={activityCoverageWarning}
                        >
                            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
                            <strong>실제 적용 범위 {effectiveMinSteps}~{effectiveMaxSteps}단계 (노드 상한 {effectiveMaxTotalNodes}개)</strong>
                            {' '}— Activity {activityCount}개 반영을 위해 자동 확장됨. 자세한 내용은 오른쪽 &apos;워크플로우 구조 설정&apos; 참고 (프로토타입 구현 가정, 마우스를 올리면 전체 설명이 보입니다).
                        </p>
                    )}
                </section>

                </div>

                {/* 3. 업무 맥락 Textarea */}
                <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
                <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500 text-white">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900">3. 업무 맥락 입력</h2>
                            <p className="text-xs text-zinc-500">
                                실제 업무 순서, 승인 조건, 예외 상황, 사용 시스템 및 반드시 지켜야 할 기준을 작성해 주세요.
                            </p>
                        </div>
                    </div>

                    {/* Topic Helper Chips */}
                    <div className="mb-3">
                        <label className="block text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-600" /> 클릭하여 보조 입력 양식 삽입:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {CONTEXT_TOPICS.map((topic, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleTopicClick(topic.snippet)}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 rounded-lg text-xs font-medium transition-colors"
                                >
                                    + {topic.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <textarea
                        rows={3}
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        placeholder="실제 업무 순서, 승인 조건, 예외 상황, 사용 시스템, 반드시 지켜야 할 기준, 협업 방식과 자주 되돌아가는 단계를 작성해 주세요."
                        className="w-full rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                </section>

                {/* 4. SOP 콘텐츠 수준 & 5. 워크플로우 구조 설정 */}
                <section>
                    <SopGenerationSettings activityCount={activityCount} />
                </section>
                </aside>
            </main>

            {/* Sticky Action Footer */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur-md">
                <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        {workLibrary.confirmed ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                <CheckCircle2 className="w-4 h-4" /> Task Library 검토 완료
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-amber-600 font-semibold">
                                <AlertCircle className="w-4 h-4" /> Task Library 검토 · 확정 필요
                            </span>
                        )}
                        {hasSetupConfigError && (
                            <span className="flex items-center gap-1 text-rose-600 font-semibold">
                                <AlertCircle className="w-4 h-4" /> 워크플로우 구조 설정 오류 {setupConfigIssues.length}건
                            </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-[11px] font-medium text-zinc-600">
                            적용 모델: {model} ({REASONING_LEVEL_LABELS[reasoning]})
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsPreviewOpen(true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-zinc-300 text-zinc-700 bg-white hover:bg-zinc-50 text-sm font-semibold rounded-xl transition-all shadow-2xs"
                        >
                            <Eye className="w-4 h-4 text-zinc-500" /> 입력 내용 미리보기
                        </button>

                        <button
                            type="button"
                            onClick={handleGenerateAiSop}
                            disabled={isGenerating || hasSetupConfigError}
                            title={hasSetupConfigError ? setupConfigIssues.map((i) => i.message).join(' / ') : undefined}
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/20"
                        >
                            {isGenerating ? (
                                <>
                                    <Sparkles className="w-4 h-4 animate-spin" /> AI SOP 생성 중...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" /> AI SOP 생성 <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Preview Modal (keyboard/screen-reader accessible dialog) */}
            {isPreviewOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="preview-modal-title"
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
                >
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-zinc-200">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                            <h3 id="preview-modal-title" className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                                <Eye className="w-5 h-5 text-indigo-600" /> 게이트 입력 내용 미리보기
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsPreviewOpen(false)}
                                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold"
                                aria-label="미리보기 닫기"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-zinc-700">
                            <div>
                                <strong className="text-zinc-900 block mb-1">1. 구성원 정보:</strong>
                                <p className="bg-zinc-50 p-2.5 rounded-lg">
                                    {memberInfo.name} ({memberInfo.jobRole} / {memberInfo.organization || '소속 미지정'})
                                </p>
                            </div>

                            <div>
                                <strong className="text-zinc-900 block mb-1">2. Task Library 선택:</strong>
                                <p className="bg-zinc-50 p-2.5 rounded-lg">
                                    기준: Task 전체 | Task:{' '}
                                    {workLibrary.taskName} | Activity {activitiesForGeneration.length}개 전체 | 상태:{' '}
                                    {workLibrary.confirmed ? '확정됨' : '미확정'}
                                </p>
                            </div>

                            <div>
                                <strong className="text-zinc-900 block mb-1">반영 Activity ({activitiesForGeneration.length}개):</strong>
                                <ul className="bg-zinc-50 p-2.5 rounded-lg space-y-1">
                                    {activitiesForGeneration.map((activity, index) => (
                                        <li key={`${activity.name}-${index}`}>
                                            {index + 1}. <strong>{activity.name}</strong>
                                            {activity.description ? `: ${activity.description}` : ''} <span className="text-zinc-500">· SKILL {activity.skills.length}개</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <strong className="text-zinc-900 block mb-1">연결된 SKILL ({workLibrary.skills.length}개):</strong>
                                <ul className="bg-zinc-50 p-2.5 rounded-lg space-y-1">
                                    {workLibrary.skills.map((s) => (
                                        <li key={s.id}>
                                            • <strong>{s.name}</strong>: {s.description || '설명 없음'}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <strong className="text-zinc-900 block mb-1">3. 업무 맥락:</strong>
                                <p className="bg-zinc-50 p-2.5 rounded-lg whitespace-pre-wrap">
                                    {context || '입력된 맥락이 없습니다.'}
                                </p>
                            </div>

                            <div>
                                <strong className="text-zinc-900 block mb-1">4 & 5. 표시 및 워크플로우 설정:</strong>
                                <p className="bg-zinc-50 p-2.5 rounded-lg">
                                    업무 분해: {setupConfig.detailLevel} | 주요 단계: {setupConfig.minSteps}~
                                    {setupConfig.maxSteps} | 분기: {setupConfig.branchPolicy} | 재작업:{' '}
                                    {setupConfig.allowRework ? '허용' : '금지'}
                                </p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-zinc-200 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsPreviewOpen(false)}
                                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-zinc-800"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
