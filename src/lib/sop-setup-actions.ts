import { buildSopGenerationRequestBody, type SopGenerationRequestBodyParams } from './sop-ai-request';
import { generateSopViaApi, type GenerateSopViaApiParams, type GenerateSopViaApiResult } from './sop-ai-generation';
import { withTaskScope } from './sop-task-library';
import { toWorkLibrarySelection, selectWorkMapDraftOrigin, type ConfirmWorkMapResult } from './sop-work-map-draft';
import type { SopDocument, WorkLibrarySelection } from './sop-types';

type Navigate = (href: string) => void;

export type SopSetupActionResult =
    | { success: true }
    | { success: false; channel: 'validation' | 'ai'; message: string };

const CUSTOMER_REVIEW_GENERATION_ERROR = '고객 검토 모드에서는 새 SOP를 생성할 수 없습니다. 게이트 상단의 "고객 검토 모드 종료" 버튼으로 잠금을 해제한 뒤 다시 시도해 주세요.';

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'SOP 생성 요청을 준비하지 못했습니다. Work Library 입력값을 확인해 주세요.';
}

/**
 * Actual Workspace exit behavior shared by the header and regenerate modal.
 * It intentionally clears customer review mode before navigating rather than
 * relying on a toggle whose result depends on the prior state.
 */
export function returnSopWorkspaceToSetup(params: {
    setCustomerReviewMode: (enabled: boolean) => void;
    navigate: Navigate;
}): void {
    params.setCustomerReviewMode(false);
    params.navigate('/sop/setup');
}

/**
 * The ONLY entry point for the Task-based creation path — Home's "Task 기반
 * 생성" card click and a direct `/sop/setup` navigation both call this exact
 * function, so the Store's generation-scope source of truth
 * (`workLibrary.sourceType`) can never be left stale (e.g. 'activity' from an
 * old persisted session) when a member is actually on the Task path. A no-op
 * when already task-scoped, so calling it redundantly from both entry points
 * is harmless — see `withTaskScope`'s docstring for why `sourceType` is never
 * hard-coded as a separate literal anywhere else (AI request, sample
 * generation) once this has run.
 */
export function enterTaskCreationPath(params: {
    workLibrary: WorkLibrarySelection;
    setWorkLibrary: (patch: Partial<WorkLibrarySelection>) => void;
}): void {
    const normalized = withTaskScope(params.workLibrary);
    if (normalized === params.workLibrary) return;
    params.setWorkLibrary(normalized);
}

/**
 * The ONLY place that finishes Work Map review — the simple (`/sop/work-map/simple`,
 * Wave 1C) and detailed (`/sop/work-map/detailed`, Wave 1D) views both call this
 * exact function instead of each running its own confirm → generation-seam →
 * navigate sequence. Before this, both views independently validated the draft,
 * converted it with `toWorkLibrarySelection`, and hardcoded `navigate('/sop/setup')`
 * — a future change to "what happens after Work Map confirmation" could land in
 * one projection and silently miss the other (see sop-work-map-draft.ts's module
 * docstring on why simple/detailed must never fork behavior on the shared draft).
 *
 * W4-04C: a clone-family draft (`colleague-template` | `own-prior`) already carries
 * an already-generated SOP — routing it through `/sop/setup` would regenerate and
 * discard that content. Only `task-recommendation` (and legacy drafts with no
 * `origin`, which `selectWorkMapDraftOrigin` also reads as `task-recommendation`)
 * takes the generation seam; clone-family drafts go straight to Workspace where
 * their existing SOP already lives. `setWorkLibrary` still runs for every origin so
 * downstream generation-scope reads (`workLibrary.sourceType`) stay consistent even
 * though clone-family origins never call the generation API from here.
 */
export function confirmWorkMapAndProceed(params: {
    confirmWorkMap: () => ConfirmWorkMapResult | null;
    setWorkLibrary: (patch: Partial<WorkLibrarySelection>) => void;
    navigate: Navigate;
}): ConfirmWorkMapResult | null {
    const result = params.confirmWorkMap();
    if (result?.ok) {
        params.setWorkLibrary(toWorkLibrarySelection(result.draft));
        const origin = selectWorkMapDraftOrigin(result.draft);
        params.navigate(origin === 'task-recommendation' ? '/sop/setup' : '/sop/workspace');
    }
    return result;
}

/** Handles the Setup Gate sample action without navigating after a blocked replacement. */
export function loadSampleSopFromSetup(params: {
    customerReviewMode: boolean;
    generateFromSample: () => SopDocument | null;
    navigate: Navigate;
}): SopSetupActionResult {
    if (params.customerReviewMode) {
        return { success: false, channel: 'validation', message: CUSTOMER_REVIEW_GENERATION_ERROR };
    }
    if (!params.generateFromSample()) {
        // customerReviewMode is already handled above, so the remaining realistic cause is
        // the selected Task Library entry having no Activity data to build a sample from
        // (see buildTaskGateSampleDocument) — never silently produced as a legacy document.
        return { success: false, channel: 'validation', message: '샘플 SOP를 적용하지 못했습니다. 선택한 Task Library 항목에 Activity 데이터가 있는지, 현재 문서 상태가 잠겨 있지는 않은지 확인한 뒤 다시 시도해 주세요.' };
    }
    params.navigate('/sop/workspace');
    return { success: true };
}

/**
 * Builds, calls, and applies a generated SOP as one guarded operation. The
 * Setup Gate owns only UI state (spinner/error rendering); this function owns
 * the rule that a failed build, API result, or Store replacement must never
 * navigate to the Workspace.
 */
export async function generateSopFromSetup(params: {
    customerReviewMode: boolean;
    requestParams: SopGenerationRequestBodyParams;
    apiParams: Omit<GenerateSopViaApiParams, 'requestBody'>;
    setDocument: (document: SopDocument) => boolean;
    navigate: Navigate;
    buildRequest?: typeof buildSopGenerationRequestBody;
    generate?: (params: GenerateSopViaApiParams) => Promise<GenerateSopViaApiResult>;
}): Promise<SopSetupActionResult> {
    if (params.customerReviewMode) {
        return { success: false, channel: 'validation', message: CUSTOMER_REVIEW_GENERATION_ERROR };
    }

    try {
        const requestBody = (params.buildRequest ?? buildSopGenerationRequestBody)(params.requestParams);
        const result = await (params.generate ?? generateSopViaApi)({ requestBody, ...params.apiParams });
        if (!result.success) return { success: false, channel: 'ai', message: result.error };
        if (!params.setDocument(result.document)) {
            return { success: false, channel: 'ai', message: '생성된 SOP를 현재 문서에 적용하지 못했습니다. 고객 검토 모드와 문서 상태를 확인해 주세요.' };
        }
        params.navigate('/sop/workspace');
        return { success: true };
    } catch (error: unknown) {
        return { success: false, channel: 'validation', message: errorMessage(error) };
    }
}

/**
 * UI-state wrapper used by SopSetupGate. Keeping the spinner lifecycle here
 * makes both synchronous request-schema failures and asynchronous API failures
 * proveably return the Gate to its ready state.
 */
export async function runSopSetupGeneration(params: Parameters<typeof generateSopFromSetup>[0] & {
    setIsGenerating: (value: boolean) => void;
    setValidationError: (message: string | null) => void;
    setAiError: (message: string | null) => void;
}): Promise<SopSetupActionResult> {
    params.setIsGenerating(true);
    params.setValidationError(null);
    params.setAiError(null);
    try {
        const outcome = await generateSopFromSetup(params);
        if (!outcome.success) {
            if (outcome.channel === 'validation') params.setValidationError(outcome.message);
            else params.setAiError(outcome.message);
        }
        return outcome;
    } finally {
        params.setIsGenerating(false);
    }
}
