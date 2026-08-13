# Repository agent instructions

## SOP customer-requirement work

For any task that changes or reviews the SOP member Home, creation paths, approval-status summary, Setup Gate, Task Library, Work Map, colleague or prior templates, SOP generation, Activity–Sub Action coverage, Workspace, Agentization traceability, leader/SME review, HR analytics, customer fixtures, or files under these paths:

- `src/app/sop/**`
- `src/app/api/sop/**`
- `src/components/sop/**`
- `src/lib/sop-*`
- `src/server/sop/**`
- `tests/sop*`

you must use the repository skill at:

`./.agents/skills/implement-sop-customer-requirements/SKILL.md`

Read that `SKILL.md` completely before planning or editing. Then read every reference it marks as required. These steps are mandatory even when the user supplies a detailed work order, because the skill contains repository invariants and source-of-truth boundaries not repeated in every prompt.

Run `npm run verify:sop-customer` before editing and `npm run verify:sop-customer -- --final` before handoff when implementing either the customer Task Library work order or the member Home/Activity–Sub Action work order.

For work based on the final customer scenario, also read:

- `./.agents/skills/implement-sop-customer-requirements/references/final-system-scenario-contract.md`
- `./SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`

Run `npm run verify:sop-customer -- --scenario-final` before that work order's handoff. The final scenario document is authoritative for functional flow; its screenshots are not visual-design requirements.

Do not modify `/flow` to satisfy an SOP request. Do not commit or push unless the user explicitly authorizes it in the current request.

## General change discipline

- Inspect the current branch, dirty worktree, and relevant code before editing.
- Preserve unrelated user changes; never reset or revert them.
- Prefer SOP-specific modules over adding more SOP branches to shared flow code.
- Use executable regression tests for behavior. Source-string assertions alone do not prove a user flow.
- Report confirmed customer requirements, implementation interpretations, and deferred items separately.
- When Gemini, Sonnet, and Terra share the work, keep one active code owner per file and require an explicit changed-file/test handoff before the next model continues. Never run concurrent writers against the same dirty worktree.
