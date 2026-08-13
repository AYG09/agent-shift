# SOP customer implementation contract

Apply this contract together with [final-system-scenario-contract.md](final-system-scenario-contract.md). The final scenario is newer where it expands the member-only prototype to leader, SME, and HR demonstration flows. Its screenshots are not visual-design requirements.

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

For the newer member Task path, follow the stricter Activity–Sub Action contract in `member-home-subaction-contract.md`: each newly generated business node is a Sub Action mapped to exactly one Activity. The earlier multi-Activity-step rule remains a legacy compatibility rule, not the target shape for new Task SOPs.

Apply `subaction-semantics-contract.md` before graph construction:

- classify Activity clauses as action, input/prior result, output, purpose, or control;
- create nodes only for executable actions;
- store prior results/source material as inputs and produced artifacts as outputs;
- split independently executable actions and preserve their dependency order;
- express independent actions as parallel branches only when a downstream action needs both results;
- do not create pure fork/join gateway nodes or include them in Agentization;
- keep `activity-derived` and `context-derived` Sub Actions distinguishable through `subActionOrigin`; require `subActionOriginRationale` for context-derived additions;
- route missing-Activity findings back to Work Map as unaccepted AI proposals instead of inventing or force-mapping Activity IDs.

## 4. Gate contract

- Present member identity as prototype login data, not normal free-form business input.
- Add brief work input → Task recommendation → explicit member selection.
- Keep manual Task search/selection.
- Use customer-facing term `Task Library`; internal type renaming is optional.
- Edit Task name and definition.
- Show ordered Activity list sized for 12–15 rows with an independently scrollable detail pane.
- Edit Activity name, description, and order; add/delete/reorder Activities.
- Edit/add/delete Skill name and description.
- Show AI-proposed Activities derived from member context in a separate unaccepted state with name, definition, rationale, and proposed Skills. Only an explicit member accept action may add one to the authoritative Work Map.
- Do not enforce exactly five Skills after member editing; five is a sample fact, not a confirmed edit rule.
- Any T-A-S mutation clears Task Library confirmation.
- Keep Task-wide generation as the primary member path. Preserve selected-Activity documents only for compatibility unless a later explicit requirement restores that creation path.
- Warn when workflow step/node limits are too small to represent the selected source; never silently truncate Activities.

Desktop acceptance viewports: 1440×900 and 1920×1080 at 100% zoom. The fixed footer must not hide controls or data.

## 5. Workspace contract

- Keep node bodies title-first; no content-display level selector.
- Show whether a Sub Action was derived from the Activity definition or added from member context. Context-derived steps must expose a short rationale in the Inspector without expanding node body text.
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

## 10. Member home and lifecycle contract

- Add a member home before the Setup Gate.
- Display read-only prototype identity including employee number, organization, grade, and primary job.
- Keep approval lifecycle separate from content `reviewStatus`.
- Show Task, Activity, and Skill totals derived from the member's current Work Map or stored records in addition to SOP lifecycle counts.
- Model the detailed prototype lifecycle as `draft | leader-review | sme-review | approved | rejected`, with an explicit rejected-edit/resubmit transition.
- Aggregate `leader-review` and `sme-review` under the member-facing `승인 요청 중` summary while showing the exact stage in record details.
- Never allow a member API call to set `sme-review`, `approved`, or `rejected` directly.
- Keep the in-memory repository visibly non-durable until real infrastructure is supplied.
- A local unsaved draft may contribute to `작성 중` only when deduplicated by document ID and labelled as browser-local prototype data.

## 11. Creation-path contract

- Task-based creation is active and routes to the existing Setup Gate.
- Colleague-template creation is active only when it can list approved, template-eligible, sanitized records and clone one into a new independent member draft.
- Own-prior creation is active and lists only the current member's previous records. Preview and clone a selected Work Map and SOP into a new independent draft with safe provenance.
- A template clone receives a new ID/current member and resets review, approval, and Agentization confirmation. Never copy colleague identity or comments.
- Work-material creation is disabled and labelled `향후 제공 (TBD)`. Do not add ingestion implementation.
- Keep old Activity-scoped data readable, but do not expose selected-Activity generation in the primary member Task path.

## 12. Activity–Sub Action and Agentization contract

- Add a new-document discriminator for the Activity–Sub Action structure; migrate legacy documents without rewriting their graph meaning.
- Treat each nonterminal business node in a new Task SOP as one Sub Action with an integer order and exactly one catalog-backed source Activity ID.
- Represent Activity as grouping/navigation rather than a duplicate process node.
- Require at least one Sub Action per selected Task Activity; reject unknown or cross-Task IDs. The DEFAULT expectation is 2–3 Sub Actions per Activity (confirmed direction, 2026-08): generation capacity floors minSteps at 2× the Activity count on both client and server, and an Activity left with a single Sub Action triggers one repair round, then a surfaced warning — never a hard rejection, because genuinely atomic Activities must not be force-split.
- Generate a separate AI-Agent applicability suggestion and rationale per Sub Action.
- Keep the AI suggestion separate from the member's authoritative `agentizationReview.stepModes` and `confirmedAt`.
- Do not add confidence scores or a human-only application mode.
- Show AI suggestion and member-confirmed judgement distinctly on canvas and Inspector.
- Keep all Agentization selection, per-node override, confirmation, invalidation, terminal exclusion, and customer-review guards working.

## 13. Additional executable tests

Add executable component/domain/API tests for:

- member-home identity and exact status buckets;
- status-count deduplication and zero-state behavior;
- content review status not being interpreted as leader approval;
- member inability to forge approved/rejected lifecycle states;
- Task, colleague-template, and disabled TBD route cards;
- Task path navigation and removal of selected-Activity generation from that path;
- sanitized template listing and independent clone/reset behavior;
- new Task generation returning Activity-grouped Sub Actions with one source Activity each;
- every selected Activity having at least one Sub Action;
- unknown/cross-Task mappings and duplicate Sub Action order rejection;
- AI suggestion generation without automatic member confirmation;
- the two customer sentence examples producing action-only 2/3-step and 2-step reference plans without input/purpose/output pseudo-nodes;
- `activity-derived` versus `context-derived` provenance preservation;
- AI Activity proposal remaining outside generation scope until member acceptance;
- accepted AI Activity receiving a valid Work Map identity and participating in generation coverage;
- pure fork/join control not contributing to Sub Action or Agentization counts;
- different Sub Actions retaining different member judgements;
- AI suggestion/member-decision visual distinction;
- legacy document migration and rendering;
- 1440×900 and 1920×1080 desktop layout without footer obstruction.

## 14. Approval prototype contract

- Provide one approval entry point for both leader and SME roles, with role-scoped queue contents and actions.
- Display requester, request date, prototype priority, organization, job, Task, and exact stage.
- Filter by organization, job, and status. Support row selection, selected approval, and all-visible approval.
- Keep review read-only. Show the submitted Work Map snapshot, SOP flow, Activity-Sub Action provenance, Agentization suggestions, and member decisions.
- Leader approval moves only `leader-review → sme-review`; SME approval moves only `sme-review → approved`.
- Rejection requires a prototype reason code and non-empty free-text feedback. Preserve the rejecting stage for display and return the record to a member-editable rejected state.
- The member sees feedback and can open the editor, modify the record through normal invalidation paths, reconfirm, and resubmit.
- Show organization-level participation and approval-completion metrics derived from repository records.
- Keep assignment and permission checks in the repository/API boundary; disabled buttons alone are not sufficient.

## 15. HR prototype contract

- Provide an HR-scoped page using repository-wide records, never UI-only fixture numbers.
- Show enterprise and organization breakdowns for participating members, record count, approval count/rate, and lifecycle distribution.
- Rank Tasks by saved-record frequency with visible numerator and aggregation period or a `현재 프로토타입 데이터` label.
- Show approved Agentization evidence by Task. Use explicit counts of approved records and member-confirmed Sub Action modes; do not invent a threshold or probability.
- Group approved SOPs by Task as representative standard-SOP candidates. Let HR select a group and generate a previewable AI standard draft from approved, PII-sanitized source records. Keep source record IDs as provenance and never auto-confirm the result as an official standard.
- A deterministic group summary may support candidate listing, but it must not masquerade as the requested AI standard-draft action. Do not claim production clustering or process mining is implemented.
- Export the currently filtered detail rows as CSV. Add XLSX only if the existing dependency/runtime makes it reliable and testable; otherwise expose CSV and label XLSX as deferred.
- HR is read-only in this prototype unless a later explicit work order adds a standard-SOP decision action.

## 16. Scenario seed and role contract

- Provide deterministic member, leader, SME, and HR prototype actors and enough records to demonstrate every lifecycle branch.
- Keep role selection clearly labelled as a prototype substitute for production authentication.
- Make member-created requests visible to leader, leader-approved requests visible to SME, and SME-approved records visible to member and HR within the same running application.
- Keep the in-memory adapter's non-durability visible. Do not hide process-restart loss behind a success claim.
- Keep sample seed creation idempotent and separate from customer Task Library fixture normalization.

## 17. Final-scenario executable tests

Add executable tests for:

- three active Home creation paths plus one disabled TBD path;
- exact member identity, SOP lifecycle, and T-A-S counts without fabricated values;
- own-prior preview and independent clone/reset behavior;
- Task path Work Map edits flowing into Task-wide generation;
- member submission creating a leader-review record;
- leader queue scoping, filters, read-only preview, selected approval, and bulk approval;
- leader approval producing SME review rather than final approval;
- SME approval producing final approval and locking member edits;
- mandatory rejection reason and free-text feedback;
- rejected-record feedback, edit, reconfirmation, and resubmission;
- member self-approval and cross-role transition rejection at the API/repository boundary;
- HR metrics derived from records, organization filtering, Task frequency, and Agentization evidence counts;
- export contents matching the filtered detail rows;
- standard-draft generation using only approved records from one Task, with PII removed and no automatic official confirmation;
- complete member → leader → SME → member/HR scenario through executable orchestration or component tests.
