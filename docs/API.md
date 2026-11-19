# InqFlow API contract (Stage 04)

Base URL for local development: `http://localhost:3001`. All inquiry routes require the signed `inquiry.sid` cookie obtained through `POST /auth/login`. Browser requests from `http://localhost:3000` use `credentials: 'include'`; every `POST` or `PATCH` request must include an approved `Origin` header. The same rule applies to command-line calls. Unapproved or missing origins return 403. All errors use `{ "error": { "code": "...", "message": "..." } }`.

## Inquiry fields

Successful inquiry responses include `id`, `customerName`, `customerContact`, `subject`, `description`, `status`, `version`, `createdAt`, and `updatedAt`. Timestamps are ISO 8601 strings in JSON. Creator IDs and authentication data are omitted.

## POST /inquiries

Creates one inquiry belonging to the signed-in staff member. Each successful POST creates a separate record; clients should disable repeat submissions while a request is pending and avoid automatic retries after an uncertain response.

```json
{
  "customerName": "Alex Fernando",
  "customerContact": "+94 77 123 4567",
  "subject": "Connection issue",
  "description": "Intermittent connection problem."
}
```

Returns 201 with `Location: /inquiries/{id}` and `{ "data": { ...inquiry fields... } }`. New records start at `NEW`, version `1`. Text is trimmed and must be nonempty. Maximum lengths are 120, 200, 160, and 2000 characters in the order shown. Unknown fields are rejected. Contact may be an email address, phone number, or another useful contact string.

## GET /inquiries

Returns only the current staff member's inquiries. Optional query parameters: `page` (default 1, maximum 1,000,000), `pageSize` (default 10, maximum 50), `status` (`NEW`, `IN_PROGRESS`, or `RESOLVED`), and `search` (1–100 trimmed characters). Search is case-insensitive across customer name and subject. Ordering is `createdAt` descending, then `id` descending.

Example: `GET /inquiries?page=1&pageSize=10&status=NEW&search=connection`.

```json
{
  "data": [],
  "pagination": { "page": 1, "pageSize": 10, "total": 0, "totalPages": 0 }
}
```

Returns 200, including for an empty result. `total` counts records under the same owner and filters as `data`.

## GET /inquiries/:id

The ID must be a UUID. Returns 200 with `{ "data": { ...inquiry fields... } }`, 400 for an invalid ID, or 404 when the record is missing or belongs to someone else.

## PATCH /inquiries/:id/status

```json
{ "status": "IN_PROGRESS", "version": 1 }
```

The ID must be a UUID and `version` a positive integer. Allowed transitions are `NEW → IN_PROGRESS → RESOLVED`; `RESOLVED` is final. Same-status requests are rejected. A successful update returns 200 with `{ "data": { ...updated inquiry fields... } }` and increments `version` by one. The update is conditional on ID, owner, current status, and submitted version, so competing requests using the same version cannot both succeed.

A stale version returns 409 `VERSION_CONFLICT`; an invalid transition returns 409 `INVALID_STATUS_TRANSITION`. Missing or inaccessible records return 404. The frontend should refresh the inquiry after a version conflict.

## Common responses

- 400 `INVALID_INPUT`: invalid body, query, or ID; 400 `INVALID_JSON`: malformed JSON.
- 401 `UNAUTHORIZED`: missing, expired, or invalid session.
- 413 `PAYLOAD_TOO_LARGE`: JSON request body exceeds the 16 KB limit.
- 403 `INVALID_ORIGIN`: missing or unapproved Origin on an unsafe method.
- 404 `NOT_FOUND`: missing or inaccessible inquiry.
- 409 `INVALID_STATUS_TRANSITION` or `VERSION_CONFLICT`: status rule or stale data.
- 500 `INTERNAL_ERROR`: unexpected infrastructure failure; internal details are not returned.

Authentication routes remain `POST /auth/login`, `GET /auth/me`, and `POST /auth/logout` as described in the README.

## V2 Phase 02 account API

`POST /auth/register` accepts only `{ "name", "email", "password" }`. Name is trimmed (2–120 characters), email is normalized to lowercase, and password must be 16–1024 characters with uppercase, lowercase, digit, and symbol. Unknown fields are rejected. A valid request returns 201 `{ "message": "Registration submitted for administrator review.", "accountStatus": "PENDING" }` without setting a session. An existing email receives the same public response; it does not create another account. The registration endpoint has a process-local 30-per-15-minute IP limit. Unsafe requests still require an approved Origin.

All `/admin` routes require an authenticated ACTIVE ADMIN. Employees and managers receive 403. Responses project only `id`, `name`, `email`, `role`, `accountStatus`, and `createdAt`; password hashes and session data are omitted.

- `GET /admin/users?page=1&pageSize=10&status=PENDING`: paginated users, with optional status. Page size is at most 50.
- `GET /admin/users/pending?page=1&pageSize=10`: paginated pending registrations.
- `GET /admin/users/:id`: safe user detail.
- `POST /admin/users/:id/approve`: PENDING → ACTIVE for an employee, no team required.
- `POST /admin/users/:id/reject`: PENDING → REJECTED for an employee.
- `POST /admin/users/:id/suspend`: ACTIVE → SUSPENDED for a non-admin account.
- `POST /admin/users/:id/reactivate`: SUSPENDED → ACTIVE for a non-admin account.

Account-action POST bodies must be empty JSON objects. Successful actions return 200 `{ "data": { ...safe user fields... } }`. Invalid input returns 400, missing authentication 401, non-admin 403, missing ID 404, conflicting/stale state or self-action 409 `ACCOUNT_CONFLICT`, and rate-limit excess 429. Each successful state change writes an `AccountAudit` row atomically. Suspended users lose protected access on their next request, including with an existing session cookie. Administrator accounts cannot be suspended through these routes. Role changes and team management are deferred.

Admins may list, view, and update inquiries system-wide through the existing inquiry endpoints. Managers and employees retain creator-scoped inquiry access. Existing V1 response shapes and status rules are unchanged.
