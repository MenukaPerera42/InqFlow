# Architecture plan

## Current boundary

Next.js renders a client-authenticated workspace and calls Express with a credentialed session cookie. Express owns HTTP validation, sessions, authorization, and business rules; Prisma accesses PostgreSQL. Preserve this modular monolith and the existing InqFlow visual system. No client-side permission check is authoritative.

## Proposed V2 modules

Keep auth/session and inquiry modules; evolve the inquiry resource as a ticket without discarding existing IDs or statuses. Add focused API modules for accounts/approval, teams/memberships, categories, assignment/suggestions, comments/events, notifications, and analytics. Each module owns schemas, service logic, and routes; shared authorization policy functions accept current user and resource scope. Services apply database filters before returning data and recheck permissions inside mutations. Deny by default; use 404 for hidden ticket IDs where appropriate.

Request flow: browser → credentialed Fetch → Express Origin/session validation → active-account check → role/team policy → service transaction → Prisma/PostgreSQL. Query keys include identity-sensitive scope; clear cache on logout, approval/role/team changes, and 401. Sessions remain server-side. A role/approval change must be checked against current database state on every protected request, with a session-version or explicit session revocation strategy selected before implementation.

## Boundaries and trade-offs

- Keep exact-origin CORS and same-site cookie assumptions; a cross-site deployment needs separate review.
- Use transactionally written ticket changes and events. Notifications may be created in the same transaction for in-app delivery; no queue is required at this scale.
- Prefer deterministic SQL-backed suggestion scoring, not an AI model. Read workload from bounded indexed queries and revalidate eligibility at confirmation time.
- Analytics use role-scoped aggregate queries and explicit date ranges; no decorative fetch of every ticket.
- Extend the current typed Fetch client and TanStack Query incrementally. No new global store is justified.

Proposed endpoint families (contracts to finalize in Phase 01): `/auth/register`, `/admin/users`, `/teams`, `/categories`, `/inquiries` plus assignment/comments/events, `/notifications`, and `/analytics`. Endpoint creation is not authorized in Phase 00. Every interactive frontend control must map to a permitted API action.

## Phase 01 implementation boundary

The schema and CLI bootstrap now exist. Existing HTTP routes and browser pages remain unchanged. Authentication additionally requires ACTIVE account status at login and on each protected request; it does not grant role-specific access yet. Role/team RBAC, assignment writes, comment/event/notification APIs, and analytics remain future work. Admin bootstrap is a direct operator CLI, outside Express routing.
