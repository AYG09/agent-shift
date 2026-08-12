import { NextResponse } from 'next/server';
import { runSopValidationPipeline } from '@/lib/sop-generation-pipeline';
import type { SopStructuralConstraints } from '@/lib/graph-validation';
import type { SopGenerationRequest } from '@/lib/sop-ai-request';

export type SopGenerationRunResult =
    | { ok: true; object: unknown; warnings: string[] }
    | { ok: false; response: NextResponse };

/**
 * Runs the generate -> validate -> repair -> fallback -> revalidate pipeline for
 * a raw SOP generation object. `sopRequest` is the already-schema-validated request
 * (see parseSopGenerationRequest / SopGenerationRequestSchema) — every field here is
 * already correctly typed, so no field-by-field cast of a raw request body is needed.
 * Defaults (minSteps, branchPolicy, etc.) are applied with the same fallback values as
 * the client's DEFAULT_SETUP_CONFIG so a missing value never silently diverges between
 * what the prompt asked for and what the pipeline validates against.
 */
export async function runSopGenerationPostProcessing(params: {
    object: unknown;
    prompt: string;
    sopRequest: SopGenerationRequest;
    generateRepair: (repairPrompt: string) => Promise<unknown>;
}): Promise<SopGenerationRunResult> {
    const { object, prompt, sopRequest, generateRepair } = params;
    // minSteps/maxSteps/branchPolicy/maxBranches/allowRework are required by
    // SopGenerationRequestSchema, so they need no fallback here — only
    // maxTotalNodes/maxLoops are genuinely optional in that schema, and their
    // defaults match DEFAULT_SETUP_CONFIG (the same defaults getSopPrompt used
    // to build the prompt this object was generated from).
    const sopConstraints: SopStructuralConstraints = {
        minSteps: sopRequest.minSteps,
        maxSteps: sopRequest.maxSteps,
        maxTotalNodes: sopRequest.maxTotalNodes ?? 15,
        branchPolicy: sopRequest.branchPolicy,
        maxBranches: sopRequest.maxBranches,
        allowRework: sopRequest.allowRework,
        maxLoops: sopRequest.maxLoops ?? 3,
    };

    const pipelineResult = await runSopValidationPipeline(object, prompt, generateRepair, sopConstraints);

    if (!pipelineResult.ok) {
        return {
            ok: false,
            response: NextResponse.json({ error: pipelineResult.error, issues: pipelineResult.issues }, { status: 400 }),
        };
    }
    return { ok: true, object: pipelineResult.object, warnings: pipelineResult.warnings };
}
