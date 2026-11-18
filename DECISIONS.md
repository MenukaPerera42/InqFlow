# InqFlow decisions

## Assumptions

The assessment permits seeded staff accounts and leaves inquiry ownership, status transitions, and duplicate handling to engineering judgment. InqFlow is a small same-site application: the web app and API can use different localhost ports, while production would require direct HTTPS and an explicit origin configuration. This repository provides a local development setup, not a production deployment.

## Three design choices

1. **Creator-only access.** Every inquiry belongs to the staff member who captured it. The API filters list, detail, and update queries by the authenticated user's ID. Missing and inaccessible IDs both return 404, avoiding record disclosure. Two seeded users and real PostgreSQL integration tests exercise this rule.
2. **Forward-only lifecycle with version checks.** Inquiries move `NEW → IN_PROGRESS → RESOLVED`. Reopening and same-status updates are rejected. A conditional database update checks ID, owner, status, and version, then increments the version atomically. A stale tab receives 409 and can refresh. This is simpler than real-time synchronization while preventing lost updates.
3. **Cookie sessions and a browser API client.** Express stores sessions in PostgreSQL and sends an HttpOnly, SameSite=Lax cookie. Browser requests include credentials; exact-origin CORS and Origin checks protect unsafe methods. The Next.js workspace checks `/auth/me` before showing inquiry data, and TanStack Query clears cached data on logout or unauthorized responses. Express remains the authorization boundary.

The UI uses the supplied InqFlow brand, Tailwind, native semantic controls, React Hook Form, Zod, and a small typed Fetch client. These libraries keep forms and server state clear without adding an admin framework or a second backend. Prisma owns the database schema and migrations; Docker Compose supports reproducible local testing.

## Accepted trade-off and next improvement

Each successful creation request makes a distinct inquiry. The form disables submission while pending and warns that a lost response may still have saved the record; it cannot guarantee exactly-once creation. If duplicate capture becomes a real operational issue, add a narrowly scoped idempotency key with server persistence. For production, separately review reverse-proxy handling, secret delivery, distributed rate limiting, and cross-site cookie policy before deployment. No production hosting is part of this assessment.

## AI assistance

Codex assisted with code, tests, design, and documentation. The suggestion to use server-side sessions with strict Origin validation was accepted for the same-site workflow. A more elaborate token or CSRF service and real-time status synchronization were rejected because the current security model and version-conflict handling cover the assessment workflow with less complexity. The developer submitting this work should be able to explain each decision and test. Detailed implementation history and earlier risk notes are preserved in [docs/TECHNICAL_HISTORY.md](docs/TECHNICAL_HISTORY.md); the current security analysis is in [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).
