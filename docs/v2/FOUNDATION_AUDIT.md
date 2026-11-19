# Phase 00 foundation audit

## Evidence and state

18 November 2026: `main` at `2d88b26`, working tree clean before these documents. No branch, commit, code, migration, or database change was made. Original five-page assessment, existing decisions, API/security/compliance documents, source, migration, tests, brand assets, scripts, and environment examples were inspected. Node 26.11.1 and npm 12.2.0 are installed; README recommends Node 22 LTS. Root `dev` and port preflight scripts exist. The ignored `.env` has a non-placeholder session secret and URLs targeting localhost:55432; values were not disclosed. `.gitignore` excludes `.env` and `.env.*` except examples.

Docker daemon is unavailable at its configured socket. Consequently container health, migrations, seed, database-backed tests, API startup with DB, login, and browser workflow are **not verified in this phase**. A healthy state reported in earlier sessions is historical evidence, not a Phase 00 result. Do not modify or reset the existing volume.

## Architecture inventory

- Web: Next.js App Router routes `/login`, `/dashboard`, `/inquiries/new`, `/inquiries/[id]`; client-side auth guard and TanStack Query; typed credentialed Fetch; React Hook Form/Zod; supplied InqFlow assets. Status/search/pagination and conflict refresh are present.
- API: Express health, auth login/me/logout, inquiry create/list/detail/status routes; Zod validation, rate limiting, exact-origin CORS and unsafe-method Origin check, PostgreSQL session store. Inquiry queries filter by creator; transition is `NEW → IN_PROGRESS → RESOLVED` with atomic version check.
- Data: `User` and `Inquiry` only, UUID IDs, unique email, owner foreign key, status/version/timestamps, owner/time and owner/status indexes. One initial migration. No V2 role, team, assignment, or event entities exist.
- Tests: API health, DB, auth, inquiries, frontend components, root port check. Database suites use a dedicated `inquiry_test` schema when Docker is available. No committed browser automation suite.

## Findings and priorities

| Finding                                     | Classification                                  | Evidence                                                        | Recommendation                                                                                               |
| ------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Docker daemon unreachable                   | Environment blocker, high for live verification | `docker compose ps` connection error                            | Start Docker Desktop, then run safe health and dedicated test-schema checks; do not reset data.              |
| Node 26 used; Node 22 recommended           | Compatibility risk, medium                      | Runtime and README                                              | Verify clean install and build under Node 22 before V2 implementation. No global runtime change in Phase 00. |
| 19 high audit entries (historical baseline) | Dependency risk                                 | `docs/SECURITY_REVIEW.md`; fresh audit recorded in checks below | Review live advisory output and safe upgrades before deployment; do not force major updates.                 |
| No V2 permission model or schema            | Expected product gap, not a V1 defect           | Prisma and routes                                               | Follow RBAC and migration plans after approval.                                                              |
| No screen recording/published repository    | Assessment handover gap                         | Compliance matrix                                               | Keep outside Phase 00; do not publish automatically.                                                         |

No confirmed broken V1 control was found by static inspection. A source review cannot establish runtime correctness. The earlier issue where npm install scripts were blocked has an explicit `db:generate` setup step; test this under the target Node/npm version. `npm ls --all` previously reported an optional Ajv peer mismatch; confirm again before dependency changes. Existing security limitations (same-site cookies, direct HTTPS deployment, process-local rate limit) remain documented.

## Phase 00 checks executed

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (20 tests: API health 1, web 18, port check 1), and `npm run build` passed. The build generated Prisma Client without connecting to PostgreSQL. Fresh audits returned 19 high and 0 critical overall, and 3 high with `--omit=dev`, matching the documented baseline. Database integration suites and browser checks were not executed because Docker was unavailable. These results do not supersede a later clean-install or live-database verification.

## Phase 01 environment update

Docker 28.4.0 became available on 19 November 2026. PostgreSQL 17 in Compose was healthy on host port 55432. Development held two users, 13 inquiries, seven sessions, no orphaned inquiry owners, and one completed V1 migration before Phase 01. A custom-format backup restored successfully into an isolated PostgreSQL container before any development migration. The additive V2 migration then applied successfully. Node 26.11.1/npm 12.2.0 remained in use; no global runtime switch or dependency upgrade occurred.

Phase 01 fresh audits on 19 November 2026 report 3 high entries both overall and with `--omit=dev`: `prisma`, `@prisma/config`, and `deepmerge-ts`. The earlier 19-entry result was a point-in-time advisory result; no dependency was upgraded in Phase 01. The remaining chain is documented in `docs/SECURITY_REVIEW.md` and needs a separately reviewed Prisma major-version decision.
