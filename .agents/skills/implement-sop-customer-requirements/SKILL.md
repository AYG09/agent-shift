---
name: implement-sop-customer-requirements
description: Implement or review the agent-shift SOP member Setup Gate, Task Library, AI Task recommendation, SOP generation contract, Activity coverage, or Workspace UI against the SK Hynix customer-response workbook. Use for any change touching src/components/sop, src/lib/sop-*, src/server/sop, src/app/sop, or src/app/api/sop when the work concerns customer Task-Activity-Skill data, Gate/Workspace behavior, sample fixtures, generation scope, or Agentization traceability.
---

# Implement SOP customer requirements

Use the customer workbook as evidence and the repository as the implementation baseline. Preserve existing SOP invariants and isolate all work from `/flow`.

## Required reading

Before planning or editing, read both files completely:

1. [references/customer-requirements.md](references/customer-requirements.md) — confirmed facts, sample statistics, unresolved items, and excluded scope.
2. [references/implementation-contract.md](references/implementation-contract.md) — target data/API/UI contracts, migration rules, tests, and file boundaries.

If the assigned work order conflicts with either reference, follow the newer explicit user instruction and report the conflict. Do not silently reconcile incompatible requirements.

## Workflow

### 1. Establish the baseline

- Run `git status --short --branch` and `git log -1 --oneline`.
- Preserve every pre-existing user change. Never reset or revert unrelated work.
- Run `npm run verify:sop-customer` before editing.
- Inspect the actual implementation paths named in the work order; do not implement from the prompt alone.
- Read the customer workbook with a spreadsheet-capable tool. Read only the relevant sheets; never modify, move, export, or commit the workbook.
- If the workbook is unavailable, stop source-dependent fixture work and report the blocker. Do not reconstruct the 690 rows from memory or the reference summary.

### 2. Separate evidence from implementation judgment

Maintain three categories in the plan and final report:

- **Confirmed customer requirement**: explicitly answered in the workbook.
- **Implementation interpretation**: necessary to make the confirmed requirement testable in this prototype.
- **Deferred/unresolved**: unanswered or explicitly out of scope.

Do not convert unresolved items into product requirements. In particular, do not invent Skill proficiency levels, mobile support, chatbot features, final SOP document formats, production auth, or leader/HR screens.

### 3. Implement in dependency order

Use this order unless the task is narrower:

1. Normalize the customer fixture and add deterministic identifiers.
2. Update types, Zod schemas, selectors, and persist migration.
3. Add the isolated Task recommendation request/response boundary.
4. Implement the dense desktop Gate workflow.
5. Extend SOP generation input and Activity coverage validation.
6. Add Workspace Activity provenance and editable mapping.
7. Add regression tests and visual verification.

Do not begin with a broad UI rewrite while the data contract is unsettled.

### 4. Apply UI review discipline

- For material Gate or Workspace layout changes, consult Stitch MCP before implementation when it is callable.
- Give Stitch the real density constraints: 10 Tasks, 12–15 Activities per Task, 5 Skills per Activity, 1440×900 desktop, fixed action footer.
- Treat Stitch output as a design review, not as authority over customer requirements or repository invariants.
- If the work order requires Stitch and it is unavailable or unauthenticated, state that explicitly. Never claim it was used.
- Keep flow nodes title-first. Do not restore node content-display modes or place long definitions/Skill lists inside nodes.

### 5. Protect critical invariants

- Keep `WorkLibrarySelection.sourceType` as the sole generation-scope authority.
- Keep ordered `Activity.skills` relationships authoritative; never flatten away repeated Activity-Skill relations.
- Use deterministic IDs for imported rows. Never use timestamps for imported fixture identity.
- Keep Task-wide generation inclusive of every selected Task Activity in source order.
- Validate Activity coverage by ID, not by labels or array length.
- Preserve customer-review read-only guards for every new Store mutation.
- Invalidate document review and Agentization confirmation after meaningful Activity mapping edits.
- Keep legacy persisted documents readable through an explicit migration.
- Keep each member's SOP independent. Do not add cross-member merging in the member workspace.

### 6. Keep scope narrow

Never change these paths for this work unless a user explicitly expands scope:

- `src/app/flow/**`
- `src/components/flow/**`
- `/flow` behavior or its tests

Treat changes to shared files such as `src/app/api/ai/route.ts`, `src/lib/graph-validation.ts`, `src/lib/flow-shapes.ts`, and `src/lib/store.ts` as high risk. Prefer SOP-specific modules and routes. If a shared-file change is unavoidable, prove with tests and diff review that non-SOP branches are unchanged.

Do not implement production database/auth/audit infrastructure, leader/SME UI, HR dashboards, enterprise standard-SOP consolidation, chatbot, mobile, multilingual UI, or on-prem deployment in this task.

### 7. Verify before handoff

Run all commands:

```text
npx tsc --noEmit
npm run lint
npm run test:sop
npm run test:sop-demo
npm run build
npm run verify:sop-customer -- --final
```

Also inspect `git diff --check`, `git status --short`, and the final changed-file list. The guard script complements tests; it does not replace them.

For Gate/Workspace UI changes, verify at 1440×900 and 1920×1080 with browser zoom 100%. Check that the footer does not cover content and that independently scrollable panels remain usable.

Do not commit or push unless the user separately authorizes it after review.

## Handoff format

Report:

- changed files;
- confirmed requirements implemented;
- implementation interpretations introduced;
- data normalization and migration approach;
- API and Activity coverage contracts;
- tests and visual checks performed;
- Stitch usage or exact unavailability;
- deferred customer requirements and known limits.

Never describe a feature as complete when only a schema, Store helper, or source-string test exists without the corresponding user flow.
