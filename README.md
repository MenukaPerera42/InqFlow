# InqFlow

InqFlow is a staff customer inquiry management application. Stage 04 provides the authenticated backend inquiry workflow; the frontend remains a placeholder.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS; Express and TypeScript; PostgreSQL via Docker Compose. Vitest, Supertest, React Testing Library, ESLint, and Prettier provide quality checks. Prisma is used in the API workspace; server-side session authentication is implemented in the Express API.

## Prerequisites

Node.js 20.9 or newer, npm, and Docker with Compose for the local database. Node.js 22 LTS or newer is recommended.

## Install and run

```sh
npm ci
cp .env.example .env
# Edit .env and replace the development password.
docker compose up -d postgres
npm run dev:api
# In another terminal:
npm run dev:web
```

Open http://localhost:3000 for the placeholder page. The API health check is http://localhost:3001/health and returns `{"status":"ok"}`. The authentication API uses PostgreSQL for users and sessions. Docker Compose reads `.env`; the API uses `PORT` from its process environment and defaults to 3001.

Check database health with `docker compose ps`. Stop it with `docker compose down`; the named volume retains local data.

## Scripts

- `npm run dev:web` and `npm run dev:api`: development servers.
- `npm run build`: production builds for both workspaces.
- `npm run typecheck`: strict TypeScript checks.
- `npm run lint`: ESLint in both workspaces.
- `npm run test`: foundation tests in both workspaces.
- `npm run format:check` and `npm run format`: verify or apply Prettier formatting.

## Status

Implemented: workspace setup, placeholder web app, Express health endpoint, PostgreSQL development container configuration, and foundation tests. Authentication and inquiry APIs are implemented; frontend inquiry workflows are future work. Prisma schema, migration, seeding, and database integration tests were added in Stage 02. The assessment PDF was not present in the initial empty workspace but became available before Stage 02.

## Stage 02 database setup

Prisma 6.19.3 is owned by `apps/api`. The Stage 03 authentication API queries users; future inquiry services will use the same database client. The assessment PDF is now present and was reviewed for this stage.

After copying `.env.example` to `.env`, set `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL`, and `SEED_STAFF_PASSWORD`. Use matching database credentials in both URLs and URL-encode special password characters. Keep the URL schemas as `public` and `inquiry_test` respectively. Use a different `POSTGRES_PORT` and matching URL port if local port 5432 is occupied. Never commit `.env`.

```sh
npm ci
npm run db:generate
npm run db:validate
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run db:test:prepare
npm run test:db
```

`db:migrate` runs Prisma's development migration workflow. `db:deploy` applies committed migrations without creating new ones. The initial migration is committed under `apps/api/prisma/migrations`. `db:test:prepare` applies it to the separate test schema and refuses the development schema. The seed is safe to rerun and keeps existing password hashes. The fictional staff identifiers are `amina@example.test` and `ravi@example.test`; both use the local `SEED_STAFF_PASSWORD` only when first created. The login endpoint is available in Stage 03. Change the development password before sharing the environment.

Run all checks with `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run test:db`, and `npm run build`. Database tests require a running PostgreSQL container and the prepared test schema; the normal health and frontend tests do not.

Stage 02 added persistence structure. Stage 03 added authentication. Stage 04 adds inquiry APIs, creator-only ownership enforcement, and status transitions. Frontend workflows remain future work.

## Stage 03 authentication

The Express API implements server-side sessions persisted in PostgreSQL. The session cookie holds only an opaque signed session ID; the server-side session holds only `userId`. Sessions last up to eight hours from login, are not extended on reads, and survive an API restart while PostgreSQL is available. There is no login UI yet.

Set `SESSION_SECRETS` in ignored `.env` to a random value of at least 32 characters (for example, `openssl rand -base64 48`). Comma-separated values support rotation: the first signs new cookies and older values remain accepted. Set `FRONTEND_ORIGINS` to exact allowed origins, separated by commas if needed. The default local origin is `http://localhost:3000`; the API defaults to port 3001. Start the API with `npm run dev:api`, which loads `.env` from the repository root. In production, supply environment variables to the process and use direct HTTPS; secure cookies are enabled and the API does not trust proxy headers. A reverse-proxy deployment needs a separately reviewed proxy configuration.

The two seeded staff emails are `amina@example.test` and `ravi@example.test`. Their password is the value of `SEED_STAFF_PASSWORD` when they were first seeded. Reseeding does not change an existing password; use a new local database or explicitly update the hash for a local account if you have lost it.

Use an approved `Origin` header for every state-changing request, including command-line requests. This rejects missing origins as well as disallowed origins. The browser cookie uses `SameSite=Lax`, so the frontend and API must remain on the same site; different localhost ports work. CORS grants credentialed access only to configured frontend origins. Future browser requests must use `credentials: 'include'`. This origin policy is the CSRF defense for browser requests and is separate from CORS; non-browser clients can forge an Origin header and still require valid credentials.

```sh
curl -i -c /tmp/inquiry-cookies -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -d '{"email":"amina@example.test","password":"YOUR_LOCAL_SEED_PASSWORD"}' \
  http://localhost:3001/auth/login
curl -i -b /tmp/inquiry-cookies http://localhost:3001/auth/me
curl -i -b /tmp/inquiry-cookies -H 'Origin: http://localhost:3000' \
  -X POST http://localhost:3001/auth/logout
```

`POST /auth/login` returns 200 and `{ "user": { "id", "name", "email" } }`, 400 for invalid input, 401 for invalid credentials, and 403 for an invalid or missing Origin. `GET /auth/me` returns 200 with the same safe user object or 401 if the session is missing, expired, or its user has been deleted. `POST /auth/logout` returns 204 with no body or 401 without a valid session. Infrastructure failures return 500 with a generic error. Login attempts are limited to 20 per 15 minutes per IP in one API process.

Run `npm run db:test:prepare && npm run test:auth` for the real PostgreSQL authentication tests. The test suite uses the dedicated `inquiry_test` schema. Run `npm run test` for the foundation tests and `npm run test:db` for database constraints.

# InqFlow

## Stage 04 inquiry API

The backend supports inquiry creation, owner-only listing and detail, case-insensitive name/subject search, status filtering, pagination, and forward-only status updates with version conflicts. See [docs/API.md](docs/API.md) for exact requests and responses. Each successful POST creates a separate inquiry; no backend idempotency key or duplicate-detection engine is included.

```sh
docker compose up -d postgres
npm run db:deploy
npm run db:seed
npm run dev:api
# In another terminal, after login:
npm run db:test:prepare
npm run test:inquiries
```

Run the full verification set with `npm run test`, `npm run test:db`, `npm run test:auth`, `npm run test:inquiries`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`. Database integration tests require the dedicated `inquiry_test` schema. The web application has no inquiry UI yet.
