# Backward-compatible database evolution plan

Current tables remain: `User`, `Inquiry`, PostgreSQL-backed `staff_sessions`. Preserve existing IDs, owner links, status values, versions, and timestamps. No migration is generated or applied in Phase 00.

## Proposed schema

- `User`: add role (`EMPLOYEE` default for new public registrations), approval state (`PENDING`, `ACTIVE`, `REJECTED`, `SUSPENDED`), and `sessionVersion` or equivalent revocation marker. Keep unique normalized email and password hash. Existing staff must be backfilled before new authorization is enforced.
- `Team`, `TeamMembership`: UUID keys, unique `(teamId,userId)`, active membership interval or state, and indexes by user/team. Define manager authorization through membership plus a managed-team relation, not role alone.
- `Category`: unique stable key/name and active/archive state. Ticket category FK may initially be nullable for existing inquiries; priority enum can default to a neutral value after product approval.
- `Inquiry`: retain table and public API identity; add nullable `teamId`, `assignedToId`, `categoryId`, and priority with safe default. FK assignee → User; FK team/category with restricted deletion or archived records. Index `(teamId,status,createdAt)`, `(assignedToId,status,createdAt)`, and category/priority paths based on actual query plans. Keep version on assignment and status mutation.
- `Comment`: ticket/author FKs, immutable creation time, bounded body; index `(inquiryId,createdAt,id)`.
- `TicketEvent`: ticket/actor FKs, type, structured but validated payload, creation time; append-only with `(inquiryId,createdAt,id)` index. Avoid storing secrets or arbitrary customer payload snapshots.
- `Notification`: recipient FK, optional ticket/event FK, type, created/read timestamps; index `(recipientId,readAt,createdAt)`. Recipient visibility enforced in queries.

Use DB constraints for required FK links, enum values, unique membership, positive version, and valid priority where feasible. Application authorization and transition rules remain service responsibilities. Do not cascade-delete audit history or tickets during user/team changes.

## Expand → backfill → enforce

1. **Expand:** add nullable fields/tables and indexes without changing V1 reads or writes. Back up/inspect the existing database first; no reset. Keep V1 routes working.
2. **Backfill:** map existing staff accounts to safe initial roles and `ACTIVE` only after an explicit admin-provisioning decision. Map existing inquiries to creator access; leave team/assignee/category null initially and use a documented default priority if approved. Verify row counts, FK checks, and representative historical tickets.
3. **Dual behavior:** update services to understand nullable legacy fields; preserve old status lifecycle and version checks. Migrate browser queries and RBAC behind validated tests.
4. **Enforce/contract:** only after every record has valid values and old code is retired, consider non-null constraints or removal of compatibility paths. No destructive change without explicit approval and rollback plan.

Initial admin must be provisioned by an operator-only command or secure one-time process, never public signup. Do not infer that either seeded staff member should become admin without approval. Existing session IDs may remain structurally valid, but every request must load current approval/role state; revoke sessions after privilege or account-state changes. Migration tests should use a copy or isolated test schema and verify old data remains accessible.

## Phase 01 implemented (19 November 2026)

`20261119050000_v2_foundation` is a single additive PostgreSQL migration wrapped in `BEGIN`/`COMMIT`. It adds `UserRole`, `AccountStatus`, `TicketPriority`, User role/status columns, nullable Inquiry team/assignee/category columns, priority default MEDIUM, Team, TeamMembership, Category, AssignmentHistory, TicketComment, TicketEvent, and Notification tables. Foreign keys restrict deletion; indexes cover memberships, assignee/team/category queues, and ticket-linked history. Existing users are backfilled ACTIVE EMPLOYEE inside the migration; future newly created users default PENDING EMPLOYEE. Existing inquiries keep null team/assignee/category and MEDIUM as a migration fallback, not a historical severity claim. The Inquiry row is authoritative for current assignee; AssignmentHistory will be appended transactionally by a later phase.

Safety verification: a restricted-permission custom-format `pg_dump` of the development database was restored into a separate temporary PostgreSQL 17 container. Before migration it contained two users, 13 inquiries, seven sessions, and the V1 migration. The migration succeeded there. User ID/email/password-hash and inquiry ID/owner/status/version checksums matched the development database; session count remained seven. The same migration then applied successfully to development, with no pending migrations. No schema/table/column was dropped. The backup is outside Git at `/tmp/inqflow-phase01-before.dump`; protect or remove it according to local data-handling policy after independent review. The temporary rehearsal container remains separate from development.

## Phase 02 account audit migration (19 November 2026)

`20261119070000_account_audit` adds only the `AccountAction` enum and `AccountAudit` table with actor/target foreign keys and history indexes. It has no default or backfill and changes no V1 row. A custom-format backup at `/tmp/inqflow-phase02-before.dump` restored into a separate PostgreSQL 17 container before the migration was rehearsed there. The restored copy contained 2 users, 13 inquiries, and 8 sessions; counts were unchanged after rehearsal. The same transaction-wrapped migration then applied to development and the dedicated test schema. No existing table or column was dropped. The backup remains outside Git.

## Phase 03 management migration (19 November 2026)

`20261119110000_phase03_management` adds `TeamManager`, nullable `Category.defaultTeamId`, and `ManagementAudit`, with restrictive foreign keys and lookup indexes. It adds case-insensitive unique indexes for Team and Category names. It drops no table or column and changes no existing row. A custom-format backup at `/tmp/inqflow-phase03-before.dump` (mode 600, outside Git) was restored into the isolated `inqflow-phase03-rehearsal` PostgreSQL 17 container. Before and after rehearsal, it had 2 users, 13 inquiries, 9 sessions, and 0 account audits. Checksums of user ID/email/password hash and inquiry ID/creator/status/version were unchanged. The migration then applied to development and the dedicated test schema; both report four migrations. No backup file was placed in the repository.
