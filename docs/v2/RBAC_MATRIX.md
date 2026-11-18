# Proposed deny-by-default permission matrix

`Own` means creator or assignee; `team` means a ticket assigned to an authorized team or created under that team, pending the team-ownership decision. All checks occur in API middleware/service queries and mutation transactions. Pending, rejected, and suspended users have no ticket access; only approved active users can establish or continue protected sessions.

| Action                       | EMPLOYEE                     | MANAGER                                 | ADMIN                                    |
| ---------------------------- | ---------------------------- | --------------------------------------- | ---------------------------------------- |
| Self-register                | Public pending employee only | Public pending employee only            | Public pending employee only             |
| Review/approve/reject users  | Deny                         | Deny                                    | Allow                                    |
| Activate/suspend/change role | Deny                         | Deny                                    | Allow; prevent last active admin removal |
| Manage teams/memberships     | Deny                         | View authorized teams; edits unresolved | Allow                                    |
| Manage categories            | Read active                  | Read active                             | Create/edit/archive                      |
| Create ticket                | Allow as creator             | Allow as creator                        | Allow                                    |
| List/detail ticket           | Own                          | Authorized team plus own                | All                                      |
| Suggest assignment           | Deny                         | Authorized team                         | All                                      |
| Confirm/reassign ticket      | Deny                         | Authorized team and eligible assignee   | All, subject to integrity rules          |
| Change ticket status         | Own, if policy permits       | Authorized team                         | All                                      |
| Add comment/read history     | Own                          | Authorized team                         | All                                      |
| Read notifications           | Recipient only               | Recipient only                          | Recipient only                           |
| Analytics                    | Own summary if approved      | Authorized teams                        | Global                                   |

## Edge cases

- **Unassigned:** visible to admin and the authorized team queue; an employee creator keeps access. Teamless unassigned visibility is an open decision.
- **Cross-team:** manager cannot assign outside authorized teams or to ineligible employees; service must check both ticket and assignee team membership in one transaction.
- **Role/team changes:** new authorization applies immediately to subsequent requests; clear or invalidate old sessions/caches on revocation. Never trust a role stored only in the session.
- **Creator vs assignee:** both may view; status/comment rights and creator visibility after transfer require final product approval.
- **Hidden IDs:** consistent 404 for inaccessible ticket details/updates prevents enumeration. Administrative list endpoints may use 403 for denied operations.
- **Pending/rejected/suspended:** login response should be generic enough to limit account enumeration; signup duplicate email response must not reveal account state. Suspended users lose access even with an existing cookie.

This is a proposal, not implemented policy. Unresolved scope choices are listed in `OPEN_DECISIONS.md`.
