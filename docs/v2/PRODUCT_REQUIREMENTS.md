# Product requirements and acceptance criteria

## Original assessment (V1, five-page PDF)

A staff member signs in, captures customer name/contact/subject/description, finds inquiries, opens them, and changes status among New, In Progress, and Resolved. PostgreSQL and a Node/Express API persist data; backend authentication and a clear access rule are required. Missing input, duplicate submissions, invalid IDs, missing records, unauthorized links, loading/empty/save-failure states, and stale tabs need deliberate handling. The assessment also requests a concise README, decisions, purposeful backend/frontend tests, and a short screen recording. These remain distinct from V2. Existing evidence is in `docs/ASSESSMENT_COMPLIANCE.md`; live re-verification is blocked by Docker in this phase.

## Approved V2 direction

| Capability         | Acceptance criterion to implement later                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles and accounts | Exactly ADMIN, MANAGER, EMPLOYEE; public signup creates only pending employee; admin approves, rejects, suspends, activates, and assigns roles.                                           |
| Ticket access      | Employee sees created or assigned tickets; manager sees tickets in authorized teams; admin sees all. API scopes every list/detail/mutation and returns a nondisclosing denial.            |
| Teams              | Managers act only within teams they are authorized to manage; team changes immediately affect future authorization checks.                                                                |
| Assignment         | Deterministic suggestions use eligible active employees, expertise/category match, and workload; manager/admin explicitly confirms assignment. Invalid cross-team assignment is rejected. |
| Ticket metadata    | Category and priority are validated and displayed; existing inquiry records remain readable after migration.                                                                              |
| Collaboration      | Authorized comments and immutable activity history are owner/team scoped; events identify actor and time.                                                                                 |
| Notifications      | In-app, recipient-scoped notices for material ticket/account actions, with read state. No external delivery implied.                                                                      |
| Analytics          | Role-scoped, bounded aggregates computed from authorized tickets, with clear time/filter definitions.                                                                                     |
| Interface          | Functional role-specific navigation and pages, responsive layouts, keyboard operation, focus/feedback, and loading/empty/error states.                                                    |

## Out of scope without a new decision

Microservices, AI assignment model, email/SMS, real-time sockets, external identity provider, production deployment, and changes to the original status lifecycle. The approved direction does not settle retention, reassignment rights, cross-team ticket ownership, or analytics definitions; see `OPEN_DECISIONS.md`.
