# Member Home and Activity–Sub Action contract

## 1. New customer statements

The customer supplied the following member experience after the workbook response.

- The member's first screen shows name, employee number, organization, grade, and primary job.
- The first screen shows counts for `작성 중`, `승인 요청 중`, `승인 완료`, and `반려` SOPs.
- The member chooses one of three active SOP creation paths and sees one disabled future path:
  1. Task-based creation;
  2. colleague-SOP-based creation;
  3. own-prior-content-based creation;
  4. work-material-based creation, explicitly marked TBD for a later phase.
- In the Task path, the member briefly describes “what I do” in natural language.
- AI recommends Tasks from the Task Library using that description and the member's organization/job context.
- The member selects a recommendation or directly searches/edits a Task.
- AI creates one SOP draft for the selected Task.
- The resulting SOP is composed of Activity, Sub Action, and an AI-Agent applicability assessment for each Sub Action.

These statements supersede the earlier prototype assumption that selected-Activity generation is a normal member-facing creation path. Preserve old Activity-scoped documents for compatibility, but the current customer-facing Task path creates a Task-wide SOP.

## 2. Required implementation interpretations

The following decisions make the customer statements executable in the current prototype. They are implementation interpretations, not additional customer claims.

### 2.1 Member home

- Add a member home before Setup Gate. Prefer `/sop` as the route and keep `/sop/setup` as the Task-path gate.
- Treat identity fields as read-only prototype login context. Do not build production authentication.
- Extend member data with optional grade and primary-job fields while keeping old drafts readable.
- Derive status counts from actual member-scoped records and the current local draft. Deduplicate by SOP ID and label non-durable/local data honestly.
- Do not show invented non-zero counts merely to make the dashboard look populated.

### 2.2 Approval lifecycle

- Model member/leader workflow status separately from `SopDocument.reviewStatus`.
- `reviewStatus` means content-editing readiness inside the SOP editor; it is not leader approval.
- Expand the lifecycle to represent the demonstrable two-stage path without conflating it with content review: `draft | leader-review | sme-review | approved | rejected` or an equivalent explicit state machine.
- A member may submit their own confirmed SOP to leader review and may resubmit an editable rejected record. A member must never move a record to SME review, approved, or rejected.
- A leader may approve only a leader-review record; approval moves it to SME review. An SME may approve only an SME-review record; approval moves it to approved.
- Either reviewer may reject only the record currently assigned to that review stage and must provide a structured reason plus free-text feedback.
- The member Home may aggregate leader-review and SME-review as `승인 요청 중`, but detailed rows must show the current stage.

### 2.3 Creation paths

- Task path is active and primary.
- Colleague-template path must produce a new independent member draft, not open or mutate the colleague's record.
- Only approved, explicitly template-eligible records may appear. Hide colleague employee IDs, names, comments, and other personal information from template cards and cloned content.
- On clone, assign a new document ID and current member, reset timestamps, content review status, approval lifecycle, and member Agentization confirmation. Structure/content provenance may be retained through a source-template ID.
- Own-prior creation lists only the current member's existing Work Maps and SOPs and clones the selected record into a new independent draft. Preserve current-member ownership and safe source provenance, but reset review, approval, and Agentization confirmation.
- Do not merge SOPs across members.
- Work-material path is a disabled `향후 제공` card. Do not add upload controls, storage, OCR, video capture, permissions, or APIs in this phase.

### 2.4 Activity and Sub Action

- Keep Task Library Activity as the authoritative source unit.
- Apply [subaction-semantics-contract.md](subaction-semantics-contract.md) as the canonical business definition and decomposition rule.
- For newly generated Task SOPs, every nonterminal canvas business node represents one Sub Action.
- Each new Sub Action belongs to exactly one source Activity. Continue using `sourceActivityIds` for backward compatibility, but require exactly one ID for the new Activity–Sub Action structure.
- Add an explicit document structure discriminator or version. Legacy documents without it retain the existing multi-Activity step semantics.
- Add a stable Sub Action order within each Activity. Do not derive identity from labels or timestamps.
- Render Activity as a grouping/section/lane or navigational hierarchy; do not duplicate it as a business node merely to show a label.
- Every selected Task Activity must contain at least one generated Sub Action. Unknown and cross-Task Activity IDs are invalid.
- The customer has not specified an exact Sub Action count per Activity. Derive the count from independently executable actions and their dependencies; do not hard-code one or claim that a generated count is customer mandated.
- Classify prior results and source materials as inputs, resulting artifacts as outputs, and purposes as context. Do not create a Sub Action unless an actual executable action exists.
- Use parallel branches only for independently executable actions whose results converge into a dependent action. Do not count pure fork/join connectors as Sub Actions or Agentization candidates.
- Generate baseline `activity-derived` Sub Actions from the confirmed Activity. Mark context-driven additions separately as `context-derived` with a rationale.
- If member context implies work outside every confirmed Activity, propose a new Activity in Work Map and wait for member acceptance. Do not invent an Activity ID or force-map the step.
- Existing 6–8-step workflow settings cannot silently truncate a 12–15 Activity Task. For the Task path, derive sufficient capacity or block generation with a clear explanation.

### 2.5 AI-Agent applicability

- Reuse the existing SOP Agentization domain and UI rather than creating an unrelated scoring feature.
- Keep two concepts separate:
  - AI suggestion generated for a Sub Action;
  - member-confirmed Agentization judgement stored in `agentizationReview.stepModes`.
- A generated suggestion may be `AI Agent 후보`, `AI 지원`, or `권장 안 함`, with a short rationale. Do not add an uncalibrated probability/confidence score.
- A suggestion must never populate `confirmedAt` or masquerade as the member's decision.
- The member can accept or override a suggestion per Sub Action. Different Sub Actions can retain different modes.
- Unset member judgement remains human-performed; do not reintroduce a separate human-only mode into `SopAiApplicationMode`.
- Terminal nodes are never candidates.
- Show suggestion and confirmed judgement with visually distinct labels on the canvas and in the Inspector.
- Any meaningful Sub Action, Activity mapping, or required-Skill edit invalidates prior content and Agentization confirmation through the existing central mutation path.

## 3. Still unresolved — do not invent

- Final production field names for Sub Action origin and context rationale. The business meaning is defined in `subaction-semantics-contract.md`.
- Minimum or maximum Sub Actions per Activity.
- Exact approval authority, comments, notifications, service-level targets, and resubmission rules.
- Production assignment rules for leader and SME, including whether either stage can be skipped.
- Which colleague SOPs are visible across organization boundaries and who marks a record template-eligible.
- Whether grade and primary job come from SSO, HR master data, or another interface.
- File types, size limits, retention, OCR, video capture, and privacy policy for the TBD work-material path.
- Production database, authentication, organizational hierarchy, and audit history.

When one of these decisions becomes necessary for the implementation, keep the smallest reversible prototype behavior, label it as an assumption, and do not present it as customer-confirmed policy.

## 4. Acceptance boundary

The member flow is complete only when the following executable path works:

```text
Member Home
→ Task-based creation
→ brief work description
→ AI recommendation or manual Task selection
→ explicit member confirmation
→ Task-wide generation
→ Activity-grouped Sub Actions
→ per-Sub-Action AI suggestion
→ member review/override
→ Workspace save/confirmation without losing provenance
```

The colleague path is complete only when an approved, sanitized template can be selected and cloned into an independent draft. A disabled card alone is sufficient only for the explicitly TBD work-material path.

The own-prior path is complete only when the current member can preview and clone a prior record into a new independent draft without mutating the source record.
