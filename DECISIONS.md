# Technical decisions

- **npm workspaces:** Native npm support keeps installation and shared scripts simple without another build system.
- **Separate web and API apps:** Next.js handles the interface; Express owns future HTTP and business operations. This preserves independent testing and clear server-side security boundaries.
- **Docker Compose PostgreSQL:** Provides a reproducible local database and persistent named volume. Credentials come from an ignored `.env` file; no production credentials are supplied.
- **Sessions:** Stage 03 uses server-side sessions with HttpOnly cookies and PostgreSQL persistence. Stage 01 had no authentication placeholder.
- **Minimal health endpoint:** It tests API availability without requiring PostgreSQL, so foundation tests stay deterministic.

## Limitations

Stage 01 had no database integration. Stage 02 added Prisma schema, migrations, and seeding. Stage 03 added authentication endpoints. Inquiry endpoints, forms, and deployment configuration remain absent. The assessment PDF became available before Stage 02 implementation.

## AI assistance

Codex assisted with foundation code, configuration, tests, and documentation. All generated work requires review against the assessment before submission.

## Stage 02 database decisions

- **Assessment alignment:** The assessment permits seeded accounts and leaves ownership and status rules to engineering judgment. We choose creator-only inquiry access and a forward-only lifecycle (`NEW` → `IN_PROGRESS` → `RESOLVED`). Future API services must enforce both; the schema alone does not authorize access or validate transitions.
- **Prisma 6.19.3 in the API workspace:** Its standard PostgreSQL client keeps configuration small and avoids a separate database package or driver adapter. Only the Express backend imports database code. The client is initialized lazily and reused, without connecting at application import time.
- **Integrity and lookup paths:** Email is unique, every inquiry has a required user foreign key with restricted deletion, and required fields are non-nullable. Indexes on `(createdById, createdAt)` and `(createdById, status)` support owner-scoped listing and status filtering. UUIDs avoid sequential record IDs; timestamps use PostgreSQL `timestamptz`.
- **Optimistic concurrency:** `version` starts at 1. A future status update will match both inquiry ID and expected version, increment the version atomically, and return HTTP 409 if the version is stale. No locking or real-time sync is planned.
- **Seed credentials:** bcrypt hashes the local development password with cost 12. Upsert creates the two fictional staff accounts once and leaves existing passwords untouched on later runs. The password comes from ignored `.env` configuration.
- **Integration isolation:** Real PostgreSQL constraint tests use a dedicated `inquiry_test` schema. The setup and tests reject the public development schema, and tests remove only their own rows. This shares the local database server without risking development data cleanup.

The accepted trade-off is that field lengths, email normalization, and lifecycle rules are deferred to later API validation. Prisma types and database non-null constraints do not replace runtime validation. AI assistance proposed the schema and test setup; the isolation guard and narrow Stage 02 scope were retained after review.

Dependency audit at Stage 02 reports 19 high-severity advisories, primarily in development tooling; the reported production-path chain is through Prisma CLI configuration and `deepmerge-ts`. Resolving it requires evaluating a Prisma major upgrade or dependency override, so it remains a documented limitation rather than an untested version change.

## Stage 03 authentication and security review

- **Server-side sessions:** Express Session stores only `userId` in PostgreSQL through `connect-pg-simple`. Cookie values are opaque, signed IDs; session regeneration on login and destruction on logout reduce fixation and reuse risks. The store creates its small `staff_sessions` table in the configured schema. This is independent of Prisma business tables.
- **Cookie policy:** `inquiry.sid` is HttpOnly, `SameSite=Lax`, path `/`, and has an eight-hour lifetime. It is Secure in production. Reads do not roll the cookie or extend store expiration. The API deliberately does not trust proxy headers; production requires direct HTTPS until proxy handling is explicitly designed. Signing secrets come from `SESSION_SECRETS`, with the first value used for new cookies and older values accepted during rotation.
- **CORS and CSRF:** Credentialed CORS accepts only exact configured origins. Every unsafe method requires an approved `Origin`; missing headers are rejected. This protects the browser cookie flow, including login and logout, without a token service. It relies on browser Origin behavior and same-site deployment; non-browser clients can spoof Origin but still need authentication. Cross-site frontend hosting would require revisiting cookies and CSRF.
- **Authentication and authorization:** Zod rejects malformed login shapes; bcrypt checks the stored hash; failures use generic 401 responses. `requireAuth` checks the session UUID and resolves a current user on each protected request. Future inquiry queries must filter by both record ID and authenticated `createdById`, returning 404 when no owned row exists. Record-level checks are Stage 04 work.
- **Rate limit:** Login allows 20 attempts per IP per 15 minutes with an in-memory limiter. It is process-local and not sufficient for distributed production deployment.
- **Dependency audit:** Before and after Stage 03, `npm audit` reports 19 high advisories and no critical advisories. Affected direct packages are `eslint-config-next`, `typescript-eslint`, `vitest`, and Prisma CLI; transitive reports include `micromatch`, `picomatch`, `fdir`, `fast-glob`, `tinyglobby`, `vite`, `eslint-import-resolver-typescript`, and `deepmerge-ts`. The pattern-matching issues are in lint/build/test tooling, not the authentication request path. `npm audit --omit=dev` reports three linked advisories in Prisma CLI configuration through `deepmerge-ts`; the API runs the generated Prisma Client, not the CLI or config merger, on requests. The CLI receives trusted local configuration, so recursive untrusted merge inputs are not part of this application. Audit dry-run did not reduce the advisory count with compatible updates. Reported fixes for the direct packages require major or incompatible version changes (including Prisma 7); these were deferred to avoid destabilizing the working assessment. No advisory was suppressed or overridden. The new session, PostgreSQL, CORS, rate-limit, and Zod packages had no reported direct advisory in this audit.

AI assistance helped implement and review the authentication middleware and integration tests. A token-based CSRF service was considered and rejected for this same-site application in favor of strict Origin validation plus SameSite cookies; this choice must be revisited if hosting becomes cross-site.

## Stage 04 inquiry API

- **Owner-scoped queries:** Creation takes the owner from `requireAuth`; list, detail, and status updates constrain Prisma queries by `createdById`. Missing and inaccessible records share a 404 response. This implements the creator-only rule selected in Stage 02 without disclosing another user's records.
- **Lifecycle and stale data:** A single transition map permits `NEW → IN_PROGRESS → RESOLVED`; same-status requests and reopening are conflicts. The status update uses Prisma `updateManyAndReturn` with inquiry ID, owner ID, expected version, and expected current status in the database condition. It increments the version atomically. A competing request receives 409, and the client should refresh. This prevents the two-tab overwrite scenario without real-time synchronization.
- **Capture and retrieval:** Zod trims and limits required input, rejects unknown writable fields, and validates filters and UUID IDs. Offset pagination has bounded page sizes and a deterministic `createdAt`/`id` order. Case-insensitive search covers customer name and subject. Every successful POST creates a separate inquiry; there is no exactly-once guarantee or fuzzy deduplication. The frontend should disable repeat submission while pending and avoid automatic retries after uncertain responses.

No schema migration or new dependency was needed. Inquiry integration tests use the dedicated `inquiry_test` schema and real sessions. AI assistance helped draft the API and tests; the conditional update and owner-scoped 404 policy were kept to match the assessment's stale-data and direct-link scenarios.
