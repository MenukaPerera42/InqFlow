# InqFlow

InqFlow lets staff sign in, capture customer inquiries, find them later, and move them from New to In Progress to Resolved. It is a small full-stack assessment application built as npm workspaces: Next.js/React/Tailwind in `apps/web`, Express/TypeScript in `apps/api`, and PostgreSQL/Prisma for persistence. The API owns authentication, authorization, validation, and inquiry rules; the browser calls it with an HttpOnly session cookie.

## Prerequisites

Node.js 22 LTS or newer, npm, and Docker with Compose. PostgreSQL must be reachable from the host. The included Compose file starts PostgreSQL 17 and retains data in a named volume.

## Local setup

```sh
npm ci
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Edit .env: set matching PostgreSQL credentials/URLs and a 12+ character seed password.
# Generate SESSION_SECRETS with `openssl rand -hex 32` and paste it into .env.
# Keep both environment files uncommitted.
npm run db:generate
docker compose up -d postgres
npm run db:deploy
npm run db:seed
```

The example URLs use port 5432; change `POSTGRES_PORT`, `DATABASE_URL`, and `TEST_DATABASE_URL` together if that port is occupied. The development seed creates `amina@example.test` and `ravi@example.test`. Both use `SEED_STAFF_PASSWORD` **when first created**; reseeding preserves existing password hashes. These are fictional development accounts, not production credentials.

For an existing checkout, keep your current `.env` instead of copying the example over it. An existing Docker volume retains its initialized database password even if `.env` changes. See [local startup troubleshooting](docs/LOCAL_SETUP_TROUBLESHOOTING.md).

Start both services from the repository root with `npm run dev`. It checks that ports 3000 and 3001 are free and stops both child processes on Ctrl-C. Alternatively, start them in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. The API health endpoint is `http://localhost:3001/health`. `apps/web/.env.local` sets the browser-visible API and site origins. Root `.env` sets `FRONTEND_ORIGINS`; it must include the exact web origin. Keep web and API on the same site for the `SameSite=Lax` cookie. Browser requests use `credentials: 'include'`. Production needs direct HTTPS and a separately reviewed proxy/cookie setup; this repository does not provide deployment configuration.

## Verification

```sh
npm run db:validate
npm run db:test:prepare
npm test
npm run test:db
npm run test:auth
npm run test:inquiries
npm run typecheck
npm run lint
npm run format:check
npm run build
npm audit
npm audit --omit=dev
```

Database tests use the dedicated `inquiry_test` schema and require the running PostgreSQL container. `db:deploy` applies committed migrations; `db:migrate` is for creating development migrations. Stop local PostgreSQL with `docker compose down` (the named volume remains). The browser app covers sign-in, listing, search, status filtering, pagination, creation, detail, stale-version refresh, and logout. API examples and error codes are in [docs/API.md](docs/API.md).

## Limits and submission notes

Employees retain creator-only inquiry access. Managers can also read inquiries explicitly linked to active teams they currently manage. Status changes remain creator-scoped (or admin-wide), forward-only, and version-protected. Each successful POST creates a separate inquiry; the UI disables an in-flight submit but cannot guarantee exactly-once creation after a lost response. The login limiter is process-local. A production deployment and the assessment's required 3–5 minute screen recording are outside this repository. See [DECISIONS.md](DECISIONS.md), [assessment matrix](docs/ASSESSMENT_COMPLIANCE.md), and [security review](docs/SECURITY_REVIEW.md) for rationale, evidence, and remaining risks.

## V2 Phase 01 persistence and administrator bootstrap

Run `npm run db:deploy` and `npm run db:generate` after updating the repository. The additive `20261119050000_v2_foundation` migration preserves V1 records and backfills existing users to ACTIVE EMPLOYEE. New users default to PENDING EMPLOYEE; there is no public registration yet. Existing inquiry routes and response shapes remain V1-compatible.

The initial admin is **not** created by migration or seed. To create it once, supply `INQFLOW_ADMIN_EMAIL` and `INQFLOW_ADMIN_PASSWORD` in the process environment from a secure interactive prompt or secret manager, then run `npm run db:bootstrap-admin`. The password must be at least 16 characters and contain uppercase, lowercase, digit, and symbol characters. Do not pass it as a command-line argument, store it in `.env`, or commit it. The command refuses to promote an existing employee or create a second admin. An administrator UI is deferred to a later V2 phase.

For isolated persistence and bootstrap checks, run `npm run db:test:prepare`, `npm run test:db`, and `npm run test:bootstrap`. The dedicated `inquiry_test` schema is required. Migration and backup evidence is recorded in [the V2 migration plan](docs/v2/DATABASE_MIGRATION_PLAN.md).

## V2 Phase 02 account API

`POST /auth/register` creates a pending employee registration without a login session. An ACTIVE ADMIN can review pending users and approve/reject them through `/admin/users` routes, and suspend/reactivate non-admin accounts. Team assignment is optional. The existing inquiry workflow remains available to active staff; admins can access all inquiries. See [docs/API.md](docs/API.md) for exact contracts. Run `npm run test:accounts` for the PostgreSQL-backed account lifecycle tests after `npm run db:test:prepare`.

## V2 Phase 03 management API

`npm run db:deploy` applies the additive Phase 03 migration. Administrators can change active users' roles, manage teams and categories, add or remove team members, and assign managers to teams. Team membership and manager authority are separate relationships: either can span multiple teams, and neither is required for registration or personal inquiries. Managers may read only active teams they explicitly manage and their membership lists. Employees may read only active teams they belong to. Active categories are readable by authenticated staff. Managers can read inquiries explicitly linked to active managed teams; status mutation retains the V1 creator/admin rule. No API assigns an inquiry to a team in this phase. Run `npm run test:management` after `npm run db:test:prepare`.
