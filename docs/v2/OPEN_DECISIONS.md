# Decisions requiring product approval before V2 implementation

| Decision                               | Recommended default                                                                                | Alternative and consequence                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Initial administrator                  | Explicit operator-only provisioned account with a new secret                                       | Promote an existing seeded account only after identity confirmation; never public admin signup. |
| Existing staff roles                   | Preserve both as active employees; separately provision admin                                      | Promote one to admin, which changes access to all historical tickets.                           |
| Team ownership of historical inquiries | Keep creator access and null team until reviewed                                                   | Auto-assign teams, which could expose old records to managers.                                  |
| Who may create/team-route tickets?     | Creator may create; manager/admin choose team and assignment                                       | Creator selects team, increasing validation and cross-team exposure risk.                       |
| Employee status/comment rights         | Creator or assignee may advance status and comment; no reopening                                   | Assignee-only edits simplify accountability but block creator follow-up.                        |
| Manager team-edit rights               | Admin manages membership; manager views own teams                                                  | Manager-managed membership needs anti-escalation checks.                                        |
| Assignment eligibility                 | Active employee in ticket team; category expertise then lower active workload, stable ID tie-break | Cross-team assignment requires explicit authorization and new access rules.                     |
| Rejection and reapplication            | Keep rejected account record; admin can reconsider; public response remains generic                | Allow resubmission, requiring careful duplicate-email and retention policy.                     |
| Session revocation                     | Recheck account state/role each request plus session version on sensitive changes                  | Store role in session, which risks stale privilege after suspension.                            |
| Category/priority defaults             | Legacy category null and neutral priority; new tickets require category after rollout              | Mandatory immediate backfill risks arbitrary classification.                                    |
| Notifications                          | In-app only, recipient-scoped, for assignment/status/approval                                      | Email/SMS adds external delivery, privacy, and retry infrastructure.                            |
| Analytics                              | Counts by status/priority and bounded date range within authorization scope                        | Broader metrics need definitions, indexes, and privacy review.                                  |
| Data retention and audit               | No automatic deletion; archive categories/teams                                                    | Deletion needs legal retention policy and FK/history design.                                    |

Confirm these choices before Phase 01. Implementing the recommended defaults without approval would turn proposals into product policy.

## Resolved for Phase 01

The initial admin uses a one-time CLI; V1 staff migrate to ACTIVE EMPLOYEE without password changes; historical inquiries keep null team/assignee and creator visibility; future creator rights are view/comment and assignee rights include status progression. Phase 01 keeps V1 creator status behavior until Phase 02 policy enforcement. Remaining rows above still need product review where they conflict with these decisions.

## Resolved for Phase 03

Users may have multiple or zero memberships; managers may manage multiple or zero teams through a separate explicit relation. Admins alone edit teams, memberships, manager assignments, and categories. Category default team is optional; an inactive team's existing default link remains for history and cannot be chosen for a new default. Managers may read current active team-linked inquiries but gain no new assignment or status power. Existing teamless inquiries remain creator/admin visible. The remaining assignment eligibility, cross-team routing, comments, retention, and analytics choices are still open for later phases.
