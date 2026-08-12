import { SAMPLE_SOP_DOCUMENT, SAMPLE_SOP_MEMBER, SAMPLE_WORK_LIBRARY } from '../src/lib/sop-sample-data';
import { loadSampleSopFromSetup, returnSopWorkspaceToSetup, runSopSetupGeneration } from '../src/lib/sop-setup-actions';
import type { SopGenerationRequestBodyParams } from '../src/lib/sop-ai-request';
import type { SopSetupConfig } from '../src/lib/sop-types';

let passed = 0;

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
    passed++;
    console.log(`✓ ${message}`);
}

const setupConfig: SopSetupConfig = {
    detailLevel: 'standard',
    minSteps: 2,
    maxSteps: 5,
    branchPolicy: 'auto',
    maxBranches: 2,
    allowRework: true,
};

const validRequest: SopGenerationRequestBodyParams = {
    memberRole: SAMPLE_SOP_MEMBER.jobRole,
    taskName: SAMPLE_WORK_LIBRARY.taskName,
    sourceType: 'task',
    activities: SAMPLE_WORK_LIBRARY.taskCatalog[0].activities.map((activity) => ({
        name: activity.name,
        description: activity.description,
        skills: activity.skills,
    })),
    skills: SAMPLE_WORK_LIBRARY.skills,
    context: '테스트 맥락',
    ...setupConfig,
};

const successfulGeneration = async () => ({ success: true as const, document: SAMPLE_SOP_DOCUMENT });

function uiState() {
    const spinner: boolean[] = [];
    const validation: Array<string | null> = [];
    const ai: Array<string | null> = [];
    const navigations: string[] = [];
    return {
        spinner,
        validation,
        ai,
        navigations,
        setIsGenerating: (value: boolean) => spinner.push(value),
        setValidationError: (value: string | null) => validation.push(value),
        setAiError: (value: string | null) => ai.push(value),
        navigate: (href: string) => navigations.push(href),
    };
}

async function run() {
    console.log('=== SOP Setup/Workspace navigation and generation orchestration regression tests ===');

    // Both Workspace entry points use this exact helper: the header back button and
    // the regeneration modal must deterministically exit review mode before routing.
    for (const entryPoint of ['Workspace header back', 'Workspace regenerate modal']) {
        const events: string[] = [];
        returnSopWorkspaceToSetup({
            setCustomerReviewMode: (enabled) => events.push(`mode:${enabled}`),
            navigate: (href) => events.push(`navigate:${href}`),
        });
        check(events.join(',') === 'mode:false,navigate:/sop/setup', `${entryPoint} exits customer review mode before moving to the Setup Gate`);
    }

    const sampleUi = uiState();
    const blockedSample = loadSampleSopFromSetup({
        customerReviewMode: false,
        generateFromSample: () => null,
        navigate: sampleUi.navigate,
    });
    check(!blockedSample.success && blockedSample.channel === 'validation', 'A blocked sample replacement returns a visible validation error');
    check(sampleUi.navigations.length === 0, 'A blocked sample replacement never navigates to Workspace');

    let applyFailureCalls = 0;
    const applyFailureUi = uiState();
    const applyFailure = await runSopSetupGeneration({
        customerReviewMode: false,
        requestParams: validRequest,
        apiParams: { member: SAMPLE_SOP_MEMBER, workLibrary: SAMPLE_WORK_LIBRARY, context: '테스트 맥락', setupConfig },
        setDocument: () => false,
        navigate: applyFailureUi.navigate,
        setIsGenerating: applyFailureUi.setIsGenerating,
        setValidationError: applyFailureUi.setValidationError,
        setAiError: applyFailureUi.setAiError,
        generate: async () => {
            applyFailureCalls++;
            return successfulGeneration();
        },
    });
    check(!applyFailure.success && applyFailure.channel === 'ai' && applyFailureCalls === 1, 'A generated SOP whose Store replacement is blocked is reported after exactly one API call');
    check(applyFailureUi.navigations.length === 0, 'A generated SOP whose Store replacement is blocked never navigates to Workspace');
    check(applyFailureUi.ai.some((message) => Boolean(message)) && applyFailureUi.spinner.at(-1) === false, 'A blocked Store replacement shows an error and always releases the generating spinner');

    let customerReviewApiCalls = 0;
    const customerReviewUi = uiState();
    const customerReviewAttempt = await runSopSetupGeneration({
        customerReviewMode: true,
        requestParams: validRequest,
        apiParams: { member: SAMPLE_SOP_MEMBER, workLibrary: SAMPLE_WORK_LIBRARY, context: '테스트 맥락', setupConfig },
        setDocument: () => true,
        navigate: customerReviewUi.navigate,
        setIsGenerating: customerReviewUi.setIsGenerating,
        setValidationError: customerReviewUi.setValidationError,
        setAiError: customerReviewUi.setAiError,
        generate: async () => {
            customerReviewApiCalls++;
            return successfulGeneration();
        },
    });
    check(!customerReviewAttempt.success && customerReviewApiCalls === 0, 'Customer review mode prevents an AI API call before generation begins');
    check(customerReviewUi.navigations.length === 0 && customerReviewUi.spinner.at(-1) === false, 'Customer review mode neither navigates nor leaves the generating spinner active');

    const invalidRequests: Array<[string, SopGenerationRequestBodyParams]> = [
        ['empty Activity name', { ...validRequest, activities: [{ ...validRequest.activities[0], name: '' }] }],
        ['empty SKILL name', { ...validRequest, skills: [{ name: '' }] }],
    ];
    for (const [label, requestParams] of invalidRequests) {
        let schemaFailureApiCalls = 0;
        const schemaFailureUi = uiState();
        const schemaFailure = await runSopSetupGeneration({
            customerReviewMode: false,
            requestParams,
            apiParams: { member: SAMPLE_SOP_MEMBER, workLibrary: SAMPLE_WORK_LIBRARY, context: '테스트 맥락', setupConfig },
            setDocument: () => true,
            navigate: schemaFailureUi.navigate,
            setIsGenerating: schemaFailureUi.setIsGenerating,
            setValidationError: schemaFailureUi.setValidationError,
            setAiError: schemaFailureUi.setAiError,
            generate: async () => {
                schemaFailureApiCalls++;
                return successfulGeneration();
            },
        });
        check(!schemaFailure.success && schemaFailure.channel === 'validation' && schemaFailureApiCalls === 0, `${label} is rejected before the AI API is called`);
        check(schemaFailureUi.navigations.length === 0 && schemaFailureUi.validation.some((message) => Boolean(message)), `${label} shows an error and never navigates to Workspace`);
        check(schemaFailureUi.spinner.join(',') === 'true,false', `${label} always restores isGenerating to false after the synchronous schema exception`);
    }

    const successUi = uiState();
    const success = await runSopSetupGeneration({
        customerReviewMode: false,
        requestParams: validRequest,
        apiParams: { member: SAMPLE_SOP_MEMBER, workLibrary: SAMPLE_WORK_LIBRARY, context: '테스트 맥락', setupConfig },
        setDocument: () => true,
        navigate: successUi.navigate,
        setIsGenerating: successUi.setIsGenerating,
        setValidationError: successUi.setValidationError,
        setAiError: successUi.setAiError,
        generate: successfulGeneration,
    });
    check(success.success && successUi.navigations.length === 1 && successUi.navigations[0] === '/sop/workspace', 'A normal generated SOP moves to Workspace only after setDocument succeeds');
    check(successUi.spinner.join(',') === 'true,false', 'A successful generation also releases isGenerating in finally');

    console.log(`ALL SOP SETUP ACTION TESTS PASSED (${passed})`);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
