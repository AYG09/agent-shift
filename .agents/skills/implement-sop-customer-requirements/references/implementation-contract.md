# SOP customer implementation contract

## 1. Data contract

Normalize the workbook into `src/data/sop-task-library-sample.json` with this hierarchy:

```text
Job { id, sourceJobId, name, tasks[] }
Task { id, name, description, activities[] }
Activity { id, order, name, description, skills[] }
Skill { id, name, description }
```

Rules:

- Store `sourceJobId` as a string.
- Derive stable IDs from source identity and ordinal context; handle collisions deterministically.
- Preserve source text and Activity order.
- Keep each Activity-Skill relation even when the Skill name repeats.
- Do not normalize near-synonyms such as `Excel`, `엑셀`, and `MS Excel` into one value.
- Use `Activity.skills` as source data. A flat scoped Skill list must be a pure derived selector, not a second mutable source.
- Migrate legacy persisted data by assigning Activity order from array position and keeping existing document IDs and edits.

## 2. Task recommendation contract

Use an SOP-only boundary, preferably `POST /api/sop/task-recommendations`.

Request must contain:

- member/job context;
- non-empty brief work description;
- candidate Task IDs, names, definitions, and Job identity;
- existing model, reasoning, and API-key settings.

Response must contain at most three unique candidate Task IDs plus rank and reason. Validate every returned ID against the submitted catalog. Recommendation never selects, edits, or confirms the Store automatically. API failure must leave manual Task search usable.

Do not add a fabricated probability/confidence value.

## 3. Generation contract

`WorkLibrarySelection.sourceType` remains authoritative.

Pass through the full selected source:

- Job ID/name;
- Task ID/name/definition;
- Activity ID/order/name/description;
- each Activity's Skill ID/name/description;
- detailed member context and workflow settings.

Task scope sends every selected Task Activity in order. Activity scope sends exactly one catalog-backed Activity. Never infer scope from Activity count.

Add backward-compatible `sourceActivityIds` (or a clearly equivalent ID field) to SOP business steps. AI generation output must cover every Task-scope Activity ID at least once. A step may cover multiple Activities. Reject unknown/cross-Task IDs. Validate or repair missing coverage before applying the document to the Store.

## 4. Gate contract

- Present member identity as prototype login data, not normal free-form business input.
- Add brief work input → Task recommendation → explicit member selection.
- Keep manual Task search/selection.
- Use customer-facing term `Task Library`; internal type renaming is optional.
- Edit Task name and definition.
- Show ordered Activity list sized for 12–15 rows with an independently scrollable detail pane.
- Edit Activity name, description, and order; add/delete/reorder Activities.
- Edit/add/delete Skill name and description.
- Do not enforce exactly five Skills after member editing; five is a sample fact, not a confirmed edit rule.
- Any T-A-S mutation clears Task Library confirmation.
- Keep Task-wide and selected-Activity generation choices.
- Warn when workflow step/node limits are too small to represent the selected source; never silently truncate Activities.

Desktop acceptance viewports: 1440×900 and 1920×1080 at 100% zoom. The fixed footer must not hide controls or data.

## 5. Workspace contract

- Keep node bodies title-first; no content-display level selector.
- Show Job, Task definition, generation scope, Activity count, and Activity coverage in Overview.
- Allow selecting an Activity to highlight its mapped nodes.
- Show and edit source Activity mappings in the step Inspector.
- Use a compact `A03`/`+N` badge or tooltip only if provenance is placed on nodes.
- Mapping mutations invalidate step/document review and Agentization confirmation.
- Customer review mode blocks mapping mutations.
- Preserve existing node/edge editing, routing, review, confirmation, and Agentization behavior.
- Do not add a separate human-only Agentization mode.

## 6. Sample contract

- Customer fixture must validate 2 Jobs, 10 Tasks, 138 Activities, and 690 Activity-Skill relations.
- The representative member persona may use `Talent Acquisition`.
- Prefer representative Task `채용 프로세스 운영 및 최적화`, which must expose 14 Activities and 5 Skills per Activity.
- Gate sample metadata and sample SOP document metadata must reference the same normalized Task.
- Do not replace `/sop/demo` fixture content unless shared-type compatibility requires it.

## 7. State and schema guardrails

- Introduce one explicit persist-version migration for the new model.
- Keep draft/reviewed documents permissive and confirmed-document server validation strict.
- Preserve member/document ownership invariants.
- Preserve deterministic `setCustomerReviewMode(false)` transitions and Store read-only guards.
- Any new document mutation must use the same central review/Agentization invalidation path.
- Do not add duplicated scope or derived fields that can drift.

## 8. Required tests

Add executable tests for:

- exact fixture counts, no missing source fields, stable IDs, and source order;
- no global loss of repeated Activity-Skill relations;
- empty recommendation input makes zero API calls;
- invalid/duplicate recommendation IDs are rejected;
- recommendation does not select before member confirmation;
- failure preserves manual selection;
- Task definition and Activity order edits clear confirmation;
- representative Task exposes 14×5 relationships;
- Task scope sends all ordered Activities; Activity scope sends exactly one;
- every generated Task Activity ID is covered and unknown IDs fail;
- legacy migration preserves existing data;
- Activity mapping edits invalidate review and Agentization;
- customer review mode blocks mapping edits;
- Gate navigation and AI-application failure behavior remain correct.

Run the existing suites plus `npm run verify:sop-customer -- --final`.

## 9. Protected scope

Direct modifications under `src/app/flow/**` and `src/components/flow/**` are forbidden for this work. Prefer SOP-specific routes/modules over shared AI or graph files. If a shared file must change, isolate the SOP branch and prove `/flow` behavior is unchanged.
