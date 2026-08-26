# Wave 2 Integration HANDOFF

## 1. baseline commit / branch / worktree

- baseline commit (top of tree at session start): `2c337fe` (docs commit adding the 3A supplement)
- branch: `wave0/sop-foundation`
- worktree: `C:\Users\USER\Desktop\NOCODE\agent-shift` (single writer, single worktree — Wave 2 integration owner)
- Source worktrees consumed (all branched from the Wave 1 baseline commit, still uncommitted in place — nothing was merged via git, files were read from these worktrees and reapplied by hand):
  - `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1a-login-context` (branch `wave1/sop-login-context`)
  - `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1b-recommendation` (branch `wave1/sop-recommendation`)
  - `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1c-work-map-simple` (branch `wave1/sop-work-map-simple`)
  - `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1d-work-map-detailed` (branch `wave1/sop-work-map-detailed`)
  - `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1e-member-node-generation` (branch `wave1/sop-member-node-generation`)
  - `C:\Users\USER\Desktop\NOCODE\agent-shift-wt\wave1f-standard-draft-generation` (branch `wave1/sop-standard-draft-generation`)
- No commits made in this worktree at any point. Everything described below is still an uncommitted dirty working tree, per the explicit "do not commit/push without authorization" instruction repeated in every supplement.

## 2. Integrated Wave 1 sessions and changed files

Integration ran in this order across three sessions of work: (1) 08_WAVE2_INTEGRATION.md's initial pass (Wave 1B/1C/1D + the `confirmWorkMapAndProceed` seam unification + `package.json` registration), (2) 2A_INTEGRATION.md's supplement (Wave 1E, Wave 1F, Wave 1A, then Home/Gate/legacy wiring + the 12 acceptance scenarios), (3) 3A_DESIGN_VERIFICATION.md's supplement (5 accessibility fixes + 2 test-coverage gaps). File ownership below reflects the union of all three passes.

### Wave 1B — Task recommendation/loading

New: `src/app/sop/recommendation/page.tsx`, `src/components/sop/SopRecommendationLoading.tsx` (+ A11Y-4 fix), `src/components/sop/SopTaskRecommendationFlow.tsx` (+ A11Y-5 fix), `src/lib/sop-task-recommendation-meta.ts`, `tests/sop-task-recommendation-flow.test.tsx` (+ A11Y-4/A11Y-5 regression assertions)
Modified: `src/lib/sop-task-recommendation.ts` (added `signal`/`fetchImpl` params)

### Wave 1C — Simple Work Map

New: `src/app/sop/work-map/simple/page.tsx`, `src/components/sop/SopWorkMapSimpleEditDrawer.tsx`, `src/components/sop/SopWorkMapSimpleView.tsx` (seam-unified, see §4), `tests/sop-work-map-simple.test.tsx`

### Wave 1D — Detailed Work Map

New: `src/app/sop/work-map/detailed/page.tsx`, `src/components/sop/SopWorkMapActivityDetail.tsx` (+ A11Y-1 fix), `src/components/sop/SopWorkMapDetailedView.tsx` (seam-unified, + A11Y-3 fixes), `tests/sop-work-map-detailed.test.tsx` (+ A11Y-1/A11Y-3 regression assertions)

### Wave 1E — Personal SOP node generation (agent-ready node authoring contract)

Modified: `src/lib/sop-normalizer.ts` (executionSpec/agentInstruction/instructionContractVersion plumbing), `src/server/sop/sop-generation-runner.ts` (wires `validateSopNodeAuthoring` into the existing repair round — no second repair budget), `src/server/sop/sop-prompt.ts` (Mission + Agent-ready execution-spec instructions, gated to `structureVersion === 'activity-subaction-v1'` only), `tests/sop-subaction-agentization.test.ts` (fixtures updated with a neutral `executionSpec` so they keep testing exactly one defect each)
New: `tests/sop-node-authoring-generation.test.ts`

### Wave 1F — Representative standard draft

Modified: `src/server/sop/sop-standard-draft-prompt.ts` (`sanitizeStandardDraftSource` carries responsible-role/inputs/outputs/tools/decision-criteria/tool-policy through, de-identified; strengthened prompt requesting the same 5 node-authoring rules + `standardizationIssues` conflict reporting), `src/server/sop/sop-standard-draft-runner.ts` (node-authoring validation + repair round; **+ 3A: added the `generate?` DI seam threaded from `POST`**), `src/lib/sop-standard-draft-schemas.ts` (`SopStandardizationIssueSchema`/`SopNodeQualityReportSchema` added to the response), `src/app/api/sop/standard-drafts/route.ts` (uses `sanitizeStandardDraftSource`, returns `qualityReport`/`standardizationIssues`; **+ 3A: optional second `testOnly: { generate? }` parameter, always `undefined` in real Next.js invocation — see §6**)
New: `tests/sop-standard-draft-node-contract.test.ts`

### Wave 1A — Login/context

New: `src/app/sop/login/page.tsx`, `src/app/sop/context/page.tsx`, `src/components/sop/SopMemberLoginGate.tsx`, `src/components/sop/SopMemberContextForm.tsx` (+ A11Y-2 fix), `tests/sop-member-login-context.test.tsx` (+ A11Y-2 regression assertion)

### package.json

`test:sop` now chains all 19 SOP test files, including the 6 new ones above, inserted following the existing placement convention (domain tests → flow/UI tests → generation/runner tests, scenario test near the end).

### Home/Gate/legacy connection (this integration session's own work, not ported from any Wave 1 worktree)

Modified: `src/components/sop/SopMemberHome.tsx`, `src/components/sop/SopSetupGate.tsx`, `src/lib/sop-setup-actions.ts` (added `confirmWorkMapAndProceed`), `tests/sop-member-home.test.ts` (routing assertions updated), `tests/sop-customer-scenario.test.ts` (added the 11-scenario new-flow orchestration + FUNC-1 assertion)

### 3A accessibility + test-coverage fixes (this session)

See §5 and §6 below for the itemized before/after and new assertions.

## 3. Satisfied SPEC requirements / test IDs

- `REQ-AUTH-001`/`002`, `INT-AUTH-002` (login)
- `REQ-CTX-002`/`004`, `INT-CTX-001`, `TST-STATE-001`/`004` (context)
- `REQ-REC-004`, `TST-REC-001`~`005`, `TST-STATE-003` (recommendation)
- `REQ-WM-001`~`006`, `INT-WM-001`~`003`, `TST-WM-001`~`008`, `TST-STATE-006` (Work Map)
- `REQ-NODE-001`~`005`, `REQ-AOP-001`~`004`, `TST-NODE-*`, `TST-AOP-001`/`002` (personal SOP node authoring)
- `REQ-STD-002`/`003`, `TST-STD-001`~`006`, `TST-GEN-004`~`006` (representative standard draft)
- `REQ-WM-006` (Setup Gate reduction reusing `runSopSetupGeneration`)
- `implementation-contract.md §1` (nested Activity–Skill relations preserved through generation, FUNC-1)
- `DESIGN_CONVENTIONS.md §6` (toggle `aria-expanded`, A11Y-5), `SPEC.md §7.3` (labelled inputs/field errors/focus indicator/reduced motion, A11Y-1~4)

## 4. Home/Gate/legacy connection decisions and old-deep-link compatibility

- **Entry**: `/sop` Home stays reachable without authentication and keeps showing existing status/colleague/own-prior/approval-tracking cards unconditionally — nothing about visiting Home itself changed. Only the **Task 기반 생성** card's click handler changed: anonymous (or not-yet-hydrated, via `useSopStoreHydrated()`) → `navigate('/sop/login')`; authenticated → `navigate(resolvePostLoginRoute(...))` (resumes at context/recommendation/work-map-simple depending on progress, same function `SopMemberLoginGateView`'s "계속 진행" button already uses). `enterTaskCreationPath` was dropped from this card since it no longer enters `/sop/setup` directly.
- **Setup Gate reduction**: `SopSetupGate` branches on `workMapDraft !== null` — the one reliable signal a session came through the new sequential flow, since the legacy `WorkLibrarySelector`'s own "검토 완료 · 확정" button only ever sets `workLibrary.confirmed`, never `workMapDraft`. When present, sections 1 (member info) / 2 (Task Library editor + legacy recommendation panel) / the free-text context textarea collapse into: a read-only "Work Map 확정됨" summary card, `SopActivityProposalPanel` (kept — orthogonal capability), and a read-only business-context block with a "업무맥락 수정" link back to `/sop/context`. Generation settings (4/5) and the `runSopSetupGeneration` call are unchanged and reused verbatim.
- **Old deep link compatibility**: when `workMapDraft` is absent (a pre-redesign persisted session, or a genuinely direct `/sop/setup` visit that never touched the new flow), the full legacy editor renders exactly as before — nothing is redirected or discarded. That full-editor render *is* the compatibility resume path the work order asked for, chosen over a forced redirect specifically so an old in-progress `workLibrary` selection is never silently dropped.
- **Legacy dedup**: `SopTaskRecommendationPanel` and `WorkLibrarySelector` are untouched and fully functional; they are simply not rendered for new-flow sessions. Colleague-template and own-prior-clone pickers were confirmed to never use either component (they navigate straight to `/sop/workspace`), so no adapter was needed there. No dead code was removed — both components remain live for the old-entry compatibility path.

## 5. Accessibility fixes (Wave 3 review, A11Y-1~5) — before/after

| ID | File:line (before fix) | Before | After |
|---|---|---|---|
| A11Y-1 | `SopWorkMapActivityDetail.tsx:173` | Skill description textarea: `outline-none` with no replacement focus indicator | Added `rounded focus:ring-1 focus:ring-indigo-500`, matching the sibling Activity name/description inputs |
| A11Y-2 | `SopMemberContextForm.tsx:105-116` | Context textarea had `aria-invalid`/`aria-describedby` but no accessible name | `<h1>` given `id="sop-context-heading"`; textarea references it via `aria-labelledby` |
| A11Y-3 | `SopWorkMapDetailedView.tsx:163-170, 159` | "TASK 정의" textarea sat next to a bare `<span>`, not a `<label>`; the "Task명을 입력하세요." error had no `id` and was not connected via `aria-describedby` | Definition field's wrapping `<div>` changed to `<label>`; error `<span>` given `id="sop-work-map-task-name-error"` + `role="alert"`; Task명 `<input>` given `aria-describedby`/`aria-invalid` wired to it |
| A11Y-4 | `SopRecommendationLoading.tsx:59` | `<Loader2 className="... animate-spin" />` ignored the already-subscribed `reducedMotion` value | `animate-spin` now conditional on `!reducedMotion` (reuses the existing hook, no new hook added) |
| A11Y-5 | `SopTaskRecommendationFlow.tsx:171, 213` | Both "Task 직접 찾기" buttons (error-state and ready-state) toggled `showManualSearch` with no `aria-expanded` | Both buttons given `aria-expanded={showManualSearch}` + `aria-controls`; target `<section>` given the matching `id="sop-manual-task-search-section"` |

No new colors/typography/spacing constants were introduced — every fix reuses an existing sibling pattern already present in the same file.

### New regression assertions (per file)

- `tests/sop-work-map-detailed.test.tsx`: Skill description textarea's className carries the focus-ring classes (A11Y-1); "TASK 정의" textarea is wrapped in a `<label>` (A11Y-3, structural accessible-name proxy since react-test-renderer has no real accessible-name computation); Task명 error `id` + input `aria-describedby`/`aria-invalid` connection (A11Y-3) — all pass (48/48 total in file).
- `tests/sop-member-login-context.test.tsx`: context textarea's `aria-labelledby` resolves to an existing, non-empty-text heading element (A11Y-2) — passes (23/23 total in file).
- `tests/sop-task-recommendation-flow.test.tsx`: "Task 직접 찾기" toggle's `aria-expanded` flips `false → true` on click (A11Y-5); spinner's `animate-spin` class is absent under a stubbed `prefers-reduced-motion: reduce` (A11Y-4, tested by rendering `SopRecommendationLoading` directly with a minimal `window.matchMedia` stub, scoped to that one block and restored immediately after — `usePrefersReducedMotion` has no window in this test environment otherwise) — all pass (40 checks total in file).

## 6. FUNC-1 / FUNC-2 test-coverage gaps — assertions added

- **FUNC-1** (`tests/sop-customer-scenario.test.ts`, inside the new-flow scenario 10 block): compares the generation request's per-Activity Skill-ID arrays (`activitiesForGeneration[i].skills.map(s => s.id)`) against the confirmed Work Map draft's own per-Activity Skill-ID arrays, in the same Activity order — proving the nested Activity–Skill relationship survives into the generation request rather than being flattened (`implementation-contract.md §1`). Passes as part of the 57-check new-flow scenario run.
- **FUNC-2** (`tests/sop-hr-analytics.test.ts`, new block after the existing validation-boundary tests): drives `POST /api/sop/standard-drafts` through its actual **success** path — approved same-Task sources, a compliant fake AI response — and asserts the repository's total record count and every existing record's `lifecycleStatus` are byte-identical before and after, and that the generated preview document itself was never persisted. This required a small, minimal addition to `standard-drafts/route.ts`: an optional second parameter `testOnly?: { params?: Promise<Record<string, never>>; generate?: SopStandardDraftGenerate }`, forwarded as `generateStandardDraftDocument`'s existing `generate?` DI seam (the exact same pattern `generateSopFromSetup`'s own `generate?` param already uses). Production safety does **not** rest on Next.js omitting a second argument — Next does pass a route context (`{ params }`) to every handler, dynamic segments or not. It rests on that context carrying no `generate` property, so `testOnly?.generate` is `undefined` for every real request and the route falls through to the real `generateObject`-backed implementation unchanged. An HTTP request cannot supply a function, so the seam is unreachable from outside the process. The `params` field exists only so the parameter type overlaps with what Next's generated route-type validator expects (`{ params: Promise<{}> }`) — TypeScript's "weak type" check rejects a completely disjoint optional-properties type as a route handler's second parameter (confirmed by `npx tsc --noEmit` initially failing, then passing after this adjustment; see §7 for why this is unrelated to the `src/app/api/ai/route.ts` baseline note). Passes (6 new checks; 42 total in file).

## 7. `/flow` and `src/app/api/ai/route.ts` — zero changes

- `git status --short` (see §9) shows no path under `src/app/flow/**` or `src/components/flow/**`.
- `src/app/api/ai/route.ts` does not appear in `git status --short` at all — confirmed unmodified throughout all three integration passes.
- `npm run test:shapes` and `npm run test:flow-branches` both pass in full (6/6 and 37/37) as a bonus sanity check, even though neither was required since `api/ai/route.ts` was never touched.
- The `standard-drafts/route.ts` type-signature change (§6) is a **different** file from `api/ai/route.ts` and has no bearing on the pre-existing `api/ai/route.ts` non-route-export note. That note is **not** editor-only: `npx tsc --noEmit` was observed failing on `.next/types/app/api/ai/route.ts` (`getAsIsPrompt` incompatible with the generated route-type constraint) in the `wave1a-login-context` worktree during Wave 1 review, because `tsconfig.json` includes `.next/types/**/*.ts`. It does not reproduce in this worktree's current `.next` state, so treat it as a baseline issue whose visibility depends on which route-type artifacts a given build left behind — not as a settled cosmetic diagnostic.

## 8. 12 acceptance scenarios — PASS list

All 12 of `08_WAVE2_INTEGRATION.md §실행 가능한 수용 시나리오` pass, executed in `tests/sop-customer-scenario.test.ts`:

| # | Scenario | Evidence |
|---|---|---|
| 1 | anonymous → login validation → context | `runMemberIntakeScenarios()` step 1 |
| 2 | context submit → recommendation request exactly once | step 2 |
| 3 | loading → validated recommendations | step 3~4 |
| 4 | recommendation success alone does not confirm a Task | step 3~4 |
| 5 | explicit confirm → member-owned Work Map snapshot | step 5 |
| 6 | simple edit → detailed reflects it, detailed edit → simple drawer reflects it | step 6 |
| 7 | Task Library source is immutable | step 7 |
| 8 | Work Map confirm → generation request includes every Activity | step 8~9 |
| 9 | the same context string is used for recommendation and generation | step 8~9 |
| 10 | generation success → Workspace | step 10 |
| 11 | recommendation/generation failure preserves input, retry possible | step 11 |
| 12 | no regression in existing colleague/own-prior/approval/HR scenarios | proven by `run()` (the file's original approval/reject/HR-visibility flow, 25 checks) + full `test:sop` suite passing (colleague/own-prior covered by `tests/sop-member-home.test.ts`) |

Total: 57 checks in `runMemberIntakeScenarios()` + 25 checks in `run()` = 82 checks in this one file, all passing.

## 9. Commands run and PASS/FAIL

All commands below were run after the 3A accessibility/test-coverage fixes (the final state of this worktree).

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) |
| `npm run test:sop` | PASS (19 files, full chain) |
| `npm run test:sop-demo` | PASS |
| `npm run build` | PASS (all 29 routes, including `/sop/login`, `/sop/context`, `/sop/recommendation`, `/sop/work-map/{simple,detailed}`) |
| `npm run verify:quality` | PASS (7 rules · 184 files) |
| `npm run verify:sop-customer -- --final` | PASS (pre-existing `api/ai/route.ts` WARN unrelated to this session, unchanged) |
| `npm run verify:sop-customer -- --scenario-final` | PASS (same WARN) |
| `git diff --check` | clean |
| `git status --short` | 16 modified + 20 untracked (including this handoff doc itself) + pre-existing untracked `.claude/`, not part of this work |
| `npm run test:shapes` (bonus, `/flow`) | PASS (6/6) |
| `npm run test:flow-branches` (bonus, `/flow`) | PASS (37/37) |

No command failed at any point in the final state. (Two transient failures were hit and fixed during this session: a wrong `extractText` variant that only read `props.children` instead of also reading the top-level `children` field `renderer.toJSON()` uses — fixed by using the dual-check version already established in `tests/sop-task-recommendation-flow.test.tsx`; and a `flushEffects()` helper with too few microtask ticks for the recommendation flow's deeper async chain — fixed by bumping it to the same 6-iteration loop that file already uses.)

## 10. Known limitations (not closed by this work — do not claim these were done)

Per `3A_DESIGN_VERIFICATION.md §항목 4`, these two mandatory gates remain genuinely unperformed:

- **Claude design-review capability / Stitch MCP**: not called at any point in this integration. No design review tool was available/invoked.
- **Real browser verification at 1440×900 and 1920×1080, zoom 100%**: not performed. This session has no browser-automation tool (Playwright/Puppeteer/screenshot) available — only a non-interactive `WebFetch`. As a partial substitute, a dev-server smoke test was run: all 7 touched/new routes (`/sop`, `/sop/login`, `/sop/context`, `/sop/recommendation`, `/sop/work-map/simple`, `/sop/work-map/detailed`, `/sop/setup`) returned HTTP 200 with zero server-side errors or warnings in the dev log. This proves the routes render without crashing; it proves **nothing** about keyboard traversal, real focus rings, screen-reader announcements, OS-level reduced-motion, or visual layout at either target resolution. The browser checklist in `3A_DESIGN_VERIFICATION.md`'s appendix still needs a human or a browser-capable session to run.

Everything else asked of this integration — accessibility fixes, FUNC-1/FUNC-2 coverage, the 12 acceptance scenarios, Home/Gate/legacy wiring, and all machine-checkable gates — is genuinely complete and verified above.

## 11. commit / push

Not committed, not pushed. No explicit authorization was given in this session's requests.
