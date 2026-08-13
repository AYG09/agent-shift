# Claude/Sonnet repository instructions

Read and follow `AGENTS.md` for every task in this repository.

For SOP member Gate, Task Library, Work Map, generation, Activity coverage, Workspace, approval, HR analytics, or customer-source work, it is mandatory to read and use:

`./.agents/skills/implement-sop-customer-requirements/SKILL.md`

Read the skill's required references completely before planning or editing. Run its preflight and final guard commands. Preserve `/flow`, existing tests, dirty worktree changes, read-only Store guards, and review/Agentization invalidation rules.

For the final end-to-end scenario, also read `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md` and run `npm run verify:sop-customer -- --scenario-final`. Reproduce the functional sequence, not the source DOCX screenshots. Do not work concurrently with Gemini or Terra on the same files; start from their explicit handoff and re-run verification.

Do not claim Stitch MCP was used unless it was actually called. Do not commit or push unless the user explicitly authorizes it in the current request.
