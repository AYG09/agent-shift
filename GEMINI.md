# Gemini/Antigravity repository instructions

Read and follow `AGENTS.md` for every task in this repository.

For any SOP member, Work Map, Task Library, generation, Workspace, approval, HR analytics, or customer-source task, read and use:

`./.agents/skills/implement-sop-customer-requirements/SKILL.md`

Read every reference marked required by the skill before planning or editing. For the final customer scenario, also read `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`. Run the skill's preflight and final guards, including `npm run verify:sop-customer -- --scenario-final` for that work order.

Treat the customer DOCX screenshots as functional references only. Use the existing SOP design system or an actually called Stitch review; do not imitate the screenshots' layout. Preserve `/flow`, dirty worktree changes, executable tests, read-only Store guards, lifecycle boundaries, and review/Agentization invalidation.

Do not edit the same files concurrently with Sonnet or Terra. Begin from an explicit handoff, inspect the current diff, and report exact changed files and test results. Do not claim Stitch was used unless called. Do not commit or push unless the user explicitly authorizes it in the current request.
