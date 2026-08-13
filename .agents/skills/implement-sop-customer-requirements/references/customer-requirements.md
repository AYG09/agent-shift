# Customer evidence baseline

## Source of truth

- Final scenario document: `C:\Users\USER\Desktop\HR Advisor 아카이빙\HRAX 플젝\SK Hynix\SOP\SOP시스템 시나리오.docx`
- Workbook: `C:\Users\USER\Desktop\HR Advisor 아카이빙\HRAX 플젝\SK Hynix\SOP\SOP 작성 및 분석 플랫폼_답변 회신.xlsx`
- Customer answers: `질문리스트!F2:F45`
- Customer sample: `Task-Activity-Skill 샘플!A1:I691`
- Treat both customer source files as read-only and external to Git.
- The final scenario document is the newest authority for roles, screens, actions, and state flow. Use [final-system-scenario-contract.md](final-system-scenario-contract.md) as its verified functional snapshot.
- This summary routes analysis; it does not replace reading an available source when the assigned task depends on source-specific details.

## Confirmed customer requirements

| Area | Confirmed statement | Evidence |
|---|---|---|
| Priority | The current-year priority is completing the platform; members complete individual SOPs later. | 질문 1 |
| Success | Alignment with purpose and low-confusion member usability are key success conditions. | 질문 2 |
| Population | The intended population is enterprise-wide. | 질문 4 |
| Source data | SK Hynix will build the enterprise T-A-S dataset, called the Task Library. | 질문 5 |
| Member AI flow | A member enters brief work information; AI recommends Tasks from the Task Library; AI creates an initial SOP from the recommended Task. | 질문 6 |
| Enterprise AI flow | Enterprise view later creates Task-level standard SOPs from member SOPs. | 질문 6, 43 |
| Optional feature | The SOP-writing AI Assistant/chatbot is not required. | 질문 11 |
| Evolving schema | T-A-S data and schema will evolve during development; sample data is used first and production data is loaded later. | 질문 16–17 |
| Identity | Login integration only needs employee identifier, name, and organization for this system. | 질문 19 |
| Member authority | Members modify their own T-A-S and SOP. | 질문 25 |
| Leader/SME authority | A future leader/SME view reviews, approves, rejects, and comments within its assigned scope. | 질문 25 |
| HR authority | A future HR view sees enterprise-wide inputs. | 질문 25 |
| Device | Mobile is not planned. | 질문 27 |
| Infrastructure | Target runtime is on-premises; detailed stack/model policy is deferred to BR. | 질문 30–32 |
| SOP ownership | Even when people perform the same Task, each person edits and owns a separate SOP; no member-level consolidation is required. | 질문 42–43 |

## Confirmed follow-up requirements

The customer later supplied an explicit member-screen and creation-flow description. Treat it as newer evidence where it narrows an earlier prototype choice.

| Area | Confirmed statement |
|---|---|
| Member first screen | Show name, employee number, organization, grade, and primary job. |
| Member SOP status | Show counts for drafting, approval requested, approved, and rejected. |
| Creation path | Offer Task-based creation and colleague-SOP-template creation. |
| Future path | Work-material upload or video capture is TBD and belongs to a later phase. |
| Task input | The member briefly describes “what I do” in natural language, approximately five sentences. |
| Task recommendation | Use the description plus organization/job context to recommend a Task from the Task Library. |
| Task selection | The member selects a recommendation or directly searches/edits a Task. |
| Creation unit | Generate one SOP draft for the selected Task. |
| SOP hierarchy | The Task SOP contains Activities and Sub Actions. |
| Agentization | Include AI-Agent applicability information for each Sub Action. |

The Task-level creation statement supersedes selected-Activity generation as a primary member-facing path. Activity scope may remain only for backward compatibility or an explicitly approved future use case.

## Confirmed final-scenario additions

| Area | Confirmed statement |
|---|---|
| Home metrics | In addition to SOP lifecycle counts, show the member's Task, Activity, and Skill counts. |
| Active creation paths | Provide Task-based, colleague-SOP-based, and own-prior-content-based creation. |
| Future path | Show work-material upload/video capture only as a disabled TBD path. |
| Work Map | Load the selected Task's Activities and Skills, then let the member select, delete, add, and edit them before SOP generation. |
| Member management | Let the member temporarily save, request approval, track progress, see rejection feedback, edit, and resubmit. |
| Approval stages | Demonstrate first review by a leader and second review by an SME. |
| Approval inbox | List, filter, select, bulk approve, and open a read-only Work Map/SOP review view. |
| Rejection | Require a selected reason and free-text feedback. |
| Organization progress | Show SOP completion and approval completion for the approver's organization. |
| HR dashboard | Show enterprise/organization participation, record counts, approval rate, and lifecycle distribution. |
| HR export | Export detailed dashboard data as Excel or CSV. |
| HR analysis | Rank Tasks by frequency, count approved member Agentization tags by Task, and show standard-SOP candidates from approved SOP groups. |

The final scenario's screenshots are not design requirements. They provide functional semantics only.

## Unresolved items — do not invent

- AI quality thresholds and validation policy: unanswered.
- Annual version/history requirements: unanswered.
- Required member T-A-S fields and edit limits: undecided.
- HR dashboard metrics and standard-SOP management details: undecided.
- Exact SOP document/flow artifact definition: customer did not understand the question.
- Per-step content display level: customer will provide a later sample.
- Technology stack, approved inference infrastructure, and model policy: deferred to BR.
- Exact Sub Action fields and the required number of Sub Actions per Activity.
- Approval authority, notification, comment, resubmission, and status-transition policy.
- Colleague-template eligibility, visibility scope, and anonymization policy.
- Source systems for grade and primary job.
- Work-material file/video ingestion requirements, explicitly deferred as TBD.

Do not add Skill proficiency levels. The sample only supplies Skill name and Skill description.

## Verified customer-sample facts

- 690 non-header relationship rows.
- 2 Jobs:
  - `50100208` — `Application Marketing`
  - `50100245` — `Talent Acquisition`
- 10 Tasks total; 5 per Job.
- 138 Activities total.
- 12–15 Activities per Task; average 13.8.
- Exactly 5 Skills per Activity in this sample.
- 690 Activity-Skill relationships and 339 distinct Skill names.
- No missing values in the nine supplied columns.

Source columns:

1. 직무 ID
2. 직무명
3. Task 명
4. Task 정의
5. 순서
6. Activity 명
7. Activity 설명
8. Skill 명
9. Skill 설명

The workbook has no Task, Activity, or Skill IDs. Generate stable internal identifiers without changing the source values.

## Prototype scope after the final scenario

Implement the smallest end-to-end prototype required to demonstrate:

1. member identity and SOP-status overview;
2. SOP and T-A-S count overview;
3. three active creation paths plus one disabled future path;
4. brief work input and Task recommendation;
5. member Task selection and T-A-S editing;
6. Task-wide SOP generation;
7. Activity-to-Sub-Action coverage and Workspace editing;
8. AI suggestion plus member-confirmed Agentization judgement per Sub Action;
9. sanitized colleague-SOP and own-prior cloning into independent member drafts;
10. member approval request, status tracking, feedback, editing, and resubmission;
11. leader then SME read-only review and decision flow;
12. approver inbox, filtering, selection, bulk approval, and organization progress;
13. HR status, Task-frequency, Agentization-tag, standard-SOP-candidate, and export views.

Do not implement production authentication, production database adoption, audit history, real notifications, realtime collaboration, chatbot, mobile, multilingual UI, on-prem deployment, work-material ingestion, or a production standard-SOP clustering engine. Use explicit prototype labels for reversible demo assumptions.
