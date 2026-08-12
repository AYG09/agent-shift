# Customer evidence baseline

## Source of truth

- Workbook: `C:\Users\USER\Desktop\HR Advisor 아카이빙\HRAX 플젝\SK Hynix\SOP\SOP 작성 및 분석 플랫폼_답변 회신.xlsx`
- Customer answers: `질문리스트!F2:F45`
- Customer sample: `Task-Activity-Skill 샘플!A1:I691`
- Treat the workbook as read-only and external to Git.
- This summary routes analysis; it does not replace reading the relevant workbook cells.

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

## Unresolved items — do not invent

- AI quality thresholds and validation policy: unanswered.
- Annual version/history requirements: unanswered.
- Required member T-A-S fields and edit limits: undecided.
- HR dashboard metrics and standard-SOP management details: undecided.
- Exact SOP document/flow artifact definition: customer did not understand the question.
- Per-step content display level: customer will provide a later sample.
- Technology stack, approved inference infrastructure, and model policy: deferred to BR.

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

## Prototype scope for this implementation

Implement only the member Setup Gate and Workspace capabilities required to demonstrate:

1. brief work input;
2. Task recommendation;
3. member selection and T-A-S editing;
4. Task- or Activity-scoped SOP generation;
5. Activity coverage and Workspace editing;
6. existing step-level Agentization judgment with Activity traceability.

Do not implement leader/SME screens, HR screens, enterprise standard-SOP consolidation, production authentication, production database adoption, audit history, chatbot, mobile, multilingual UI, or on-prem deployment.
