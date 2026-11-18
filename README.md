# Customer Inquiry System

Stage 01 foundation for a staff customer inquiry management application. Business features are planned but not implemented.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS; Express and TypeScript; PostgreSQL via Docker Compose. Vitest, Supertest, React Testing Library, ESLint, and Prettier provide quality checks. Prisma is used in the API workspace; server-side session authentication is planned for a later stage.

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

Open http://localhost:3000 for the placeholder page. The API health check is http://localhost:3001/health and returns `{"status":"ok"}`. The API does not use PostgreSQL yet. Docker Compose reads `.env`; the API uses `PORT` from its process environment and defaults to 3001.

Check database health with `docker compose ps`. Stop it with `docker compose down`; the named volume retains local data.

## Scripts

- `npm run dev:web` and `npm run dev:api`: development servers.
- `npm run build`: production builds for both workspaces.
- `npm run typecheck`: strict TypeScript checks.
- `npm run lint`: ESLint in both workspaces.
- `npm run test`: foundation tests in both workspaces.
- `npm run format:check` and `npm run format`: verify or apply Prettier formatting.

## Status

Implemented: workspace setup, placeholder web app, Express health endpoint, PostgreSQL development container configuration, and foundation tests. Authentication and inquiry workflows are future work. Prisma schema, migration, seeding, and database integration tests were added in Stage 02. The assessment PDF was not present in the initial empty workspace but became available before Stage 02.

## Stage 02 database setup

Prisma 6.19.3 is owned by `apps/api`. The API does not query the database yet; future backend services will use its database client. The assessment PDF is now present and was reviewed for this stage.

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

`db:migrate` runs Prisma's development migration workflow. `db:deploy` applies committed migrations without creating new ones. The initial migration is committed under `apps/api/prisma/migrations`. `db:test:prepare` applies it to the separate test schema and refuses the development schema. The seed is safe to rerun and keeps existing password hashes. The fictional staff identifiers are `amina@example.test` and `ravi@example.test`; both use the local `SEED_STAFF_PASSWORD` only when first created. There is no login endpoint yet. Change the development password before sharing the environment.

Run all checks with `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run test:db`, and `npm run build`. Database tests require a running PostgreSQL container and the prepared test schema; the normal health and frontend tests do not.

Stage 02 adds only persistence structure. Authentication, inquiry APIs, authorization, status transition validation, and frontend workflows remain future work.
