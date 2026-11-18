# Technical decisions

- **npm workspaces:** Native npm support keeps installation and shared scripts simple without another build system.
- **Separate web and API apps:** Next.js handles the interface; Express owns future HTTP and business operations. This preserves independent testing and clear server-side security boundaries.
- **Docker Compose PostgreSQL:** Provides a reproducible local database and persistent named volume. Credentials come from an ignored `.env` file; no production credentials are supplied.
- **Planned sessions:** A later stage will use server-side sessions with Secure and HttpOnly cookies, backend authorization, and a suitable persistent session store. Stage 01 has no authentication placeholder.
- **Minimal health endpoint:** It tests API availability without requiring PostgreSQL, so foundation tests stay deterministic.

## Limitations

Stage 01 had no database integration. Stage 02 added Prisma schema, migrations, and seeding, but no business endpoints, forms, authentication, or deployment configuration. The assessment PDF became available before Stage 02 implementation.

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
