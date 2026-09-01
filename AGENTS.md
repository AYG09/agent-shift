# Repository agent instructions

## General change discipline

- Inspect the current branch, dirty worktree, and relevant code before editing.
- Preserve unrelated user changes; never reset or revert them.
- Prefer SOP-specific modules over adding more SOP branches to shared flow code.
- Use executable regression tests for behavior. Source-string assertions alone do not prove a user flow.
- Report confirmed customer requirements, implementation interpretations, and deferred items separately.
- When Gemini, Sonnet, and Terra share the work, keep one active code owner per file and require an explicit changed-file/test handoff before the next model continues. Never run concurrent writers against the same dirty worktree.
- Do not commit or push unless the user explicitly authorizes it in the current request.

## Code quality conventions

For every code change in `src/**`, follow the quality and design conventions and run their mechanical guard:

- `docs/QUALITY_CONVENTIONS.md` — six quality axes (readability, type unification, SSOT, AI-provider swappability, design conventions, no dead code) with their source-of-truth modules.
- `docs/DESIGN_CONVENTIONS.md` — frontend color semantics, typography, container specs, density/accordion rules, and the meta/token modules UI must use.
- `npm run verify:quality` — enforces the machine-checkable rules (provider imports confined to `src/server/ai/model-factory.ts`, no inline enum/format/label re-definitions). Run it before handoff alongside lint/tests.

If a requirement conflicts with these conventions, update the convention document first — never silently bypass the guard's allowlists.
