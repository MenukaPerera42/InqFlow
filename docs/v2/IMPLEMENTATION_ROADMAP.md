# Incremental V2 roadmap (proposal)

No phase below is authorized by completion of Phase 00. Each checkpoint requires review of code, migration safety, tests, and user approval before the next phase.

| Phase                               | Dependency and deliverable                                                                                  | Verification and approval gate                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 00 — discovery                      | Current audit and seven planning documents                                                                  | Approve unresolved policy and migration decisions. No V2 code.                                                         |
| 01 — account foundation             | Expand schema; secure admin provisioning; registration pending approval; admin review and suspension        | Migration/backfill rehearsal on isolated copy; auth/session and anti-enumeration tests; approve before real migration. |
| 02 — teams and RBAC                 | Team membership, manager scope, policy helpers, owner/assignee access                                       | Two-user and cross-team API tests; session revocation and direct-link browser tests.                                   |
| 03 — ticket metadata and assignment | Category/priority, unassigned queue, deterministic suggestions, explicit confirmation, versioned assignment | Suggestion scoring and tie-break tests; concurrent assignment tests; historical-record compatibility.                  |
| 04 — collaboration                  | Comments, immutable events, recipient-scoped notifications                                                  | Transaction/visibility tests; no duplicate or leaked notifications; responsive UI flow.                                |
| 05 — analytics and UI completion    | Bounded role-scoped metrics; full role-specific pages and navigation                                        | Aggregate correctness, accessibility scan, keyboard/mobile review, API load sanity.                                    |
| 06 — V2 hardening                   | Full regression, data migration verification, security/dependency review, docs                              | Clean install/build, isolated DB tests, end-to-end browser role workflows, approval for handover.                      |

Every phase preserves the V1 sign-in → capture → find → advance lifecycle. Do not add deployment, external messaging, real-time infrastructure, or AI assignment without a new decision. Migrations are designed and reviewed before application to persistent data.

Phase 01 database foundation and bootstrap implementation completed on 19 November 2026; Phase 02 remains unstarted. Before Phase 02, confirm the final RBAC and account-recovery policies and review the Phase 01 migration evidence and remaining dependency advisories.
