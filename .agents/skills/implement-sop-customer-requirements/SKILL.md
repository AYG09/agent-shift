---
name: implement-sop-customer-requirements
description: Implement or review the agent-shift SOP prototype against SK Hynix customer requirements and the final end-to-end system scenario. Use for member Home, creation paths, Setup Gate, Task Library, Work Map, AI Task recommendation, Activity-Sub Action generation, Workspace, Agentization, approval inbox and review, HR dashboard and analytics, sample fixtures, lifecycle, provenance, or changes under src/app/sop, src/app/api/sop, src/components/sop, src/lib/sop-*, src/server/sop, and tests/sop*.
---

# Implement SOP customer requirements

Treat customer evidence as product authority and the repository as the implementation baseline. Reproduce the confirmed scenario flow without copying the source document's visual design. Preserve existing SOP invariants and isolate all work from `/flow`.

## Required reading

Before planning or editing, read all five files completely:

1. [references/final-system-scenario-contract.md](references/final-system-scenario-contract.md) — newest role, screen, action, state, and analytics contract.
2. [references/customer-requirements.md](references/customer-requirements.md) — workbook facts, T-A-S sample statistics, and evidence boundaries.
3. [references/implementation-contract.md](references/implementation-contract.md) — data, API, UI, migration, and test contracts.
4. [references/member-home-subaction-contract.md](references/member-home-subaction-contract.md) — member Home, creation provenance, Activity-Sub Action, and Agentization details.
5. [references/subaction-semantics-contract.md](references/subaction-semantics-contract.md) — executable-action semantics, input/output separation, parallelism, context-derived additions, and AI Activity proposal rules.

For final-scenario implementation, also read `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md` completely.

If the assigned work order conflicts with any reference, follow the newer explicit user instruction and report the conflict. Do not silently reconcile incompatible requirements.

## Workflow

### 1. Establish the baseline

- Run `git status --short --branch` and `git log -1 --oneline`.
- Preserve every pre-existing user change. Never reset or revert unrelated work.
- Run `npm run verify:sop-customer` before editing.
- Inspect the actual implementation paths named in the work order; do not implement from the prompt alone.
- Read external customer files with the matching document or spreadsheet tool only when the assigned work depends on source content. Never modify, move, export, or commit them.
- Use the repository references as a verified snapshot when an external source is unavailable. Do not reconstruct source rows or requirements from memory.

### 2. Separate evidence from implementation judgment

Maintain three categories in the plan and final report:

- **Confirmed customer requirement**: explicitly present in the final scenario document, customer workbook, or later customer statement.
- **Implementation interpretation**: necessary to make the confirmed requirement testable in this prototype.
- **Deferred/unresolved**: unanswered or explicitly out of scope.

Do not convert unresolved items into product requirements. In particular, do not invent Skill proficiency levels, mobile support, chatbot features, final SOP document formats, production auth, audit history, approval SLA, analytics thresholds, or standard-SOP algorithms.

Apply this source priority when evidence differs: final customer scenario document, later explicit user decision, customer workbook and T-A-S sample, repository contracts, then existing prototype UI and fixtures.

### 3. Implement in dependency order

Use this order unless the task is narrower:

1. Normalize the customer fixture and add deterministic identifiers.
2. Update types, Zod schemas, selectors, and persist migration.
3. Define member-home lifecycle and creation-provenance contracts without conflating them with content review.
4. Add the isolated Task recommendation request/response boundary.
5. Implement member Home, status/T-A-S counts, creation provenance, and the dense desktop Task Gate workflow.
6. Extend SOP generation to the Activity-Sub Action structure and coverage validation.
7. Add Workspace Activity grouping, Sub Action provenance, AI suggestions, and member judgement.
8. Add sanitized colleague and own-prior cloning.
9. Add the leader then SME approval flow with read-only review, rejection feedback, and resubmission.
10. Add HR dashboards, transparent rule-based aggregation, and safe export.
11. Add deterministic scenario data, regression tests, and visual verification.

Do not begin with a broad UI rewrite while the data contract is unsettled.

### 4. Apply UI review discipline

- For material Home, Gate, Workspace, approval, or HR layout changes, consult Stitch MCP before implementation when it is callable.
- Give Stitch the real density constraints: 10 Tasks, 12–15 Activities per Task, 5 Skills per Activity, 1440×900 and 1920×1080 at 100% zoom, fixed action footer, multi-role navigation, and read-only review.
- Treat Stitch output as a design review, not as authority over customer requirements or repository invariants.
- If the work order requires Stitch and it is unavailable or unauthenticated, state that explicitly. Never claim it was used.
- Keep flow nodes title-first. Do not restore node content-display modes or place long definitions/Skill lists inside nodes.
- Treat screenshots in the final scenario document as functional references only. Do not copy their layout, colors, node routing, component shapes, or information density.

### 5. Protect critical invariants

- Keep `WorkLibrarySelection.sourceType` as the sole generation-scope authority.
- Keep ordered `Activity.skills` relationships authoritative; never flatten away repeated Activity-Skill relations.
- Use deterministic IDs for imported rows. Never use timestamps for imported fixture identity.
- Keep Task-wide generation inclusive of every selected Task Activity in source order.
- Validate Activity coverage by ID, not by labels or array length.
- For newly generated member Task SOPs, require one source Activity per Sub Action and at least one Sub Action per Activity. Preserve legacy multi-Activity steps through a discriminator/migration.
- The node unit is the Sub Action, never a 1:1 Activity copy: the DEFAULT decomposition expectation is 2–3 Sub Actions per Activity (confirmed direction, 2026-08 — a 14-Activity Task ≈ 28–42 business nodes). Capacity floors minSteps at 2× Activity count (client AND server); under-decomposition triggers one repair, then degrades to a warning — never a 400 or a confirm rule.
- Treat a Sub Action as a minimum useful executable action, not an input, purpose, deliverable noun, or pure graph connector. Follow `subaction-semantics-contract.md` for decomposition.
- Keep the SOP generation wire schema tolerant of mechanically-normalizable violations (normalize after parse; repair genuine gaps) and keep its output-token budget sized for 28–42+ node responses, separate from /flow's budget — a parse-time death never reaches the repair loop.
- Keep Activity-description-derived baseline steps distinguishable from member-context-derived additions.
- Never force a context-derived action into an unrelated Activity. Propose a missing Activity in Work Map and require explicit member acceptance before generation.
- Keep AI-generated Agentization suggestions separate from member-confirmed `stepModes` and `confirmedAt`.
- Keep approval lifecycle separate from editor `reviewStatus`; a member cannot self-approve or self-reject.
- Clone colleague templates into independent drafts with sanitized identity and reset review/Agentization state.
- Clone a member's prior SOP into a new independent draft and reset approval, review, and Agentization state while preserving safe provenance.
- Use the sequential prototype path `member request → leader review → SME review → approved`; do not present it as a confirmed production assignment policy.
- Require a structured rejection reason and free-text feedback, and make the rejected SOP editable before resubmission.
- Derive HR counts from repository records; never fabricate UI-only counts or an Agentization threshold.
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

Do not implement production database/auth/audit infrastructure, real notifications, realtime collaboration, chatbot, mobile, multilingual UI, on-prem deployment, or the TBD work-material upload/video path. Leader/SME and HR prototype screens are in scope only when the final-scenario work order or the user explicitly requests them.

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

For Home/Gate/Workspace UI changes, verify at 1440×900 and 1920×1080 with browser zoom 100%. Check that the footer does not cover content and that independently scrollable panels remain usable.

For final-scenario work, also verify the executable role handoff: a member request appears in the leader inbox; leader approval appears in the SME inbox; SME approval appears in member and HR views; and rejection feedback returns to the member editor.

Run `npm run verify:sop-customer -- --scenario-final` when completing `SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md`.

Do not commit or push unless the user separately authorizes it after review.

## Multi-agent handoff

- Keep one active code owner for a file at a time. Do not let Gemini, Sonnet, and Terra edit the same dirty worktree concurrently.
- Require every model to read `AGENTS.md`, its model adapter (`CLAUDE.md` or `GEMINI.md` when applicable), this skill, all required references, and the active work order.
- Include exact changed files, remaining checklist items, failing commands, and unresolved decisions in every handoff.
- Re-run baseline checks after every model handoff. Do not trust a narrative completion claim without inspecting the diff and executing tests.

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
