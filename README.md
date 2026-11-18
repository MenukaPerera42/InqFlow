# InqFlow

InqFlow lets staff sign in, capture customer inquiries, find them later, and move them from New to In Progress to Resolved. It is a small full-stack assessment application built as npm workspaces: Next.js/React/Tailwind in `apps/web`, Express/TypeScript in `apps/api`, and PostgreSQL/Prisma for persistence. The API owns authentication, authorization, validation, and inquiry rules; the browser calls it with an HttpOnly session cookie.

## Prerequisites

Node.js 22 LTS or newer, npm, and Docker with Compose. PostgreSQL must be reachable from the host. The included Compose file starts PostgreSQL 17 and retains data in a named volume.

## Local setup

```sh
npm ci
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Edit .env: set matching PostgreSQL credentials/URLs, a 12+ character seed password,
# and a random 32+ character SESSION_SECRETS value. Keep both files uncommitted.
npm run db:generate
docker compose up -d postgres
npm run db:deploy
npm run db:seed
```

The example URLs use port 5432; change `POSTGRES_PORT`, `DATABASE_URL`, and `TEST_DATABASE_URL` together if that port is occupied. The development seed creates `amina@example.test` and `ravi@example.test`. Both use `SEED_STAFF_PASSWORD` **when first created**; reseeding preserves existing password hashes. These are fictional development accounts, not production credentials.

Start the services in separate terminals from the repository root:

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

The ownership rule is creator-only. Status changes are forward-only and version-protected. Each successful POST creates a separate inquiry; the UI disables an in-flight submit but cannot guarantee exactly-once creation after a lost response. The login limiter is process-local. A production deployment and the assessment's required 3–5 minute screen recording are outside this repository. See [DECISIONS.md](DECISIONS.md), [assessment matrix](docs/ASSESSMENT_COMPLIANCE.md), and [security review](docs/SECURITY_REVIEW.md) for rationale, evidence, and remaining risks.
