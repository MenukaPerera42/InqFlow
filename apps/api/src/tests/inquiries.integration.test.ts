import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createSessionStore } from '../auth/session.js';
import { readAuthConfig } from '../config/auth.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  testUrl === process.env.DATABASE_URL ||
  new URL(testUrl).searchParams.get('schema') !== 'inquiry_test'
) {
  throw new Error('Inquiry tests require the dedicated inquiry_test schema');
}
const origin = 'http://localhost:3000';
const password = 'inquiry-test-password-123';
const database = new PrismaClient({ datasources: { db: { url: testUrl } } });
const config = readAuthConfig({
  ...process.env,
  DATABASE_URL: testUrl,
  SESSION_SECRETS: 'inquiry-test-signing-secret-with-32-plus-characters',
  FRONTEND_ORIGINS: origin,
  NODE_ENV: 'test',
});
const { store, pool } = createSessionStore(config);
const app = createApp(config, database, store);
const emailA = `inquiry-a-${crypto.randomUUID()}@example.test`;
const emailB = `inquiry-b-${crypto.randomUUID()}@example.test`;
let userA: { id: string };
let userB: { id: string };
let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;

const inquiryBody = {
  customerName: 'Alex Fernando',
  customerContact: 'alex@example.test',
  subject: 'Connection issue',
  description: 'Intermittent connection problem.',
};

async function create(
  agent: ReturnType<typeof request.agent>,
  body = inquiryBody,
) {
  return agent.post('/inquiries').set('Origin', origin).send(body);
}

async function change(
  agent: ReturnType<typeof request.agent>,
  id: string,
  status: string,
  version: number,
) {
  return agent
    .patch(`/inquiries/${id}/status`)
    .set('Origin', origin)
    .send({ status, version });
}

beforeAll(async () => {
  await database.$connect();
  const passwordHash = await bcrypt.hash(password, 12);
  userA = await database.user.create({
    data: { name: 'Inquiry Staff A', email: emailA, passwordHash },
  });
  userB = await database.user.create({
    data: { name: 'Inquiry Staff B', email: emailB, passwordHash },
  });
  agentA = request.agent(app);
  agentB = request.agent(app);
  expect(
    (
      await agentA
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email: emailA, password })
    ).status,
  ).toBe(200);
  expect(
    (
      await agentB
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email: emailB, password })
    ).status,
  ).toBe(200);
});

afterEach(async () => {
  await database.inquiry.deleteMany({
    where: { createdById: { in: [userA.id, userB.id] } },
  });
});

afterAll(async () => {
  await database.inquiry.deleteMany({
    where: { createdById: { in: [userA.id, userB.id] } },
  });
  await database.user.deleteMany({
    where: { id: { in: [userA.id, userB.id] } },
  });
  await pool.query('DELETE FROM "inquiry_test"."staff_sessions"');
  await Promise.resolve(store.close());
  await pool.end();
  await database.$disconnect();
});

describe.sequential('inquiry API', () => {
  it('creates an owned inquiry with defaults and accepts email or phone contact', async () => {
    const first = await create(agentA, {
      ...inquiryBody,
      customerName: '  Alex Fernando  ',
    });
    expect(first.status).toBe(201);
    expect(first.headers.location).toBe(`/inquiries/${first.body.data.id}`);
    expect(first.body.data).toEqual(
      expect.objectContaining({
        customerName: 'Alex Fernando',
        status: 'NEW',
        version: 1,
      }),
    );
    expect(first.body.data.createdById).toBeUndefined();
    expect(first.body.data.createdAt).toBeTruthy();
    const stored = await database.inquiry.findUniqueOrThrow({
      where: { id: first.body.data.id },
    });
    expect(stored.createdById).toBe(userA.id);
    const second = await create(agentA, {
      ...inquiryBody,
      customerContact: '+94 77 123 4567',
    });
    expect(second.status).toBe(201);
    expect(second.body.data.customerContact).toBe('+94 77 123 4567');
    expect(second.body.data.id).not.toBe(first.body.data.id);
  });

  it('rejects missing, blank, long, and client-controlled fields', async () => {
    for (const body of [
      { customerName: 'Alex' },
      { ...inquiryBody, customerName: '   ' },
      { ...inquiryBody, description: 'x'.repeat(2001) },
      { ...inquiryBody, customerContact: '' },
      { ...inquiryBody, createdById: userB.id },
      { ...inquiryBody, status: 'RESOLVED' },
      { ...inquiryBody, version: 99 },
    ]) {
      const response = await agentA
        .post('/inquiries')
        .set('Origin', origin)
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    }
    expect(
      await database.inquiry.count({ where: { createdById: userA.id } }),
    ).toBe(0);
  });

  it('requires authentication and an approved origin', async () => {
    const preflight = await request(app)
      .options(`/inquiries/${crypto.randomUUID()}/status`)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PATCH');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toContain(
      'PATCH',
    );
    expect((await request(app).get('/inquiries')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/inquiries')
          .set('Origin', origin)
          .send(inquiryBody)
      ).status,
    ).toBe(401);
    expect((await agentA.post('/inquiries').send(inquiryBody)).status).toBe(
      403,
    );
    expect(
      (
        await agentA
          .post('/inquiries')
          .set('Origin', 'https://evil.example')
          .send(inquiryBody)
      ).status,
    ).toBe(403);
    expect(
      (
        await agentA
          .patch(`/inquiries/${crypto.randomUUID()}/status`)
          .send({ status: 'IN_PROGRESS', version: 1 })
      ).status,
    ).toBe(403);
  });

  it('returns an empty list and validates query parameters', async () => {
    const empty = await agentA.get('/inquiries');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    for (const query of [
      'page=0',
      'page=-1',
      'pageSize=51',
      'pageSize=0',
      'status=INVALID',
      'search=',
      'search=' + 'x'.repeat(101),
      'page=1&page=2',
      'extra=value',
    ]) {
      const response = await agentA.get(`/inquiries?${query}`);
      expect(response.status).toBe(400);
    }
  });

  it('paginates, searches, filters, and counts only the owner records', async () => {
    const one = await create(agentA, {
      ...inquiryBody,
      customerName: 'Maya Silva',
      subject: 'Internet connection',
    });
    await create(agentA, {
      ...inquiryBody,
      customerName: 'Ravi Perera',
      subject: 'Billing question',
    });
    await create(agentA, {
      ...inquiryBody,
      customerName: 'Nina Silva',
      subject: 'Connection setup',
    });
    await create(agentB, {
      ...inquiryBody,
      customerName: 'Other Customer',
      subject: 'Connection private',
    });
    expect(
      (await change(agentA, one.body.data.id, 'IN_PROGRESS', 1)).status,
    ).toBe(200);
    const pageOne = await agentA.get('/inquiries?page=1&pageSize=2');
    const pageTwo = await agentA.get('/inquiries?page=2&pageSize=2');
    expect(pageOne.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(pageOne.body.data).toHaveLength(2);
    expect(pageTwo.body.data).toHaveLength(1);
    const ids = [...pageOne.body.data, ...pageTwo.body.data].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(ids).size).toBe(3);
    const filtered = await agentA.get(
      '/inquiries?status=IN_PROGRESS&search=maya',
    );
    expect(filtered.body.pagination.total).toBe(1);
    expect(filtered.body.data[0].id).toBe(one.body.data.id);
    const searched = await agentA.get('/inquiries?search=CONNECTION');
    expect(searched.body.pagination.total).toBe(2);
    expect(JSON.stringify(searched.body)).not.toContain('Other Customer');
    expect((await agentB.get('/inquiries')).body.pagination.total).toBe(1);
  });

  it('returns detail only to the owner and validates IDs', async () => {
    const created = await create(agentA);
    const id = created.body.data.id;
    expect((await agentA.get(`/inquiries/${id}`)).body.data.id).toBe(id);
    expect((await agentB.get(`/inquiries/${id}`)).status).toBe(404);
    expect((await agentA.get(`/inquiries/${crypto.randomUUID()}`)).status).toBe(
      404,
    );
    expect((await agentA.get('/inquiries/not-a-uuid')).status).toBe(400);
  });

  it('enforces forward-only transitions and increments the version', async () => {
    const created = await create(agentA);
    const id = created.body.data.id;
    expect((await change(agentA, id, 'RESOLVED', 1)).body.error.code).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    expect((await change(agentA, id, 'NEW', 1)).status).toBe(409);
    const progress = await change(agentA, id, 'IN_PROGRESS', 1);
    expect(progress.status).toBe(200);
    expect(progress.body.data.version).toBe(2);
    expect((await change(agentA, id, 'NEW', 2)).status).toBe(409);
    const resolved = await change(agentA, id, 'RESOLVED', 2);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.version).toBe(3);
    for (const status of ['NEW', 'IN_PROGRESS', 'RESOLVED']) {
      const response = await change(agentA, id, status, 3);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
    expect(
      (await database.inquiry.findUniqueOrThrow({ where: { id } })).version,
    ).toBe(3);
  });

  it('rejects malformed status updates and inaccessible records', async () => {
    const created = await create(agentA);
    const id = created.body.data.id;
    for (const body of [
      {},
      { status: 'UNKNOWN', version: 1 },
      { status: 'IN_PROGRESS', version: 0 },
      { status: 'IN_PROGRESS', version: '1' },
      { status: 'IN_PROGRESS', version: 1, createdById: userB.id },
    ]) {
      expect(
        (
          await agentA
            .patch(`/inquiries/${id}/status`)
            .set('Origin', origin)
            .send(body)
        ).status,
      ).toBe(400);
    }
    expect((await change(agentA, 'bad-id', 'IN_PROGRESS', 1)).status).toBe(400);
    expect((await change(agentB, id, 'IN_PROGRESS', 1)).status).toBe(404);
    expect(
      (await change(agentA, crypto.randomUUID(), 'IN_PROGRESS', 1)).status,
    ).toBe(404);
    expect(
      (await database.inquiry.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('NEW');
  });

  it('rejects stale and competing updates without overwriting the winner', async () => {
    const created = await create(agentA);
    const id = created.body.data.id;
    const [first, second] = await Promise.all([
      change(agentA, id, 'IN_PROGRESS', 1),
      change(agentA, id, 'IN_PROGRESS', 1),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const stale = await change(agentA, id, 'RESOLVED', 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const stored = await database.inquiry.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe('IN_PROGRESS');
    expect(stored.version).toBe(2);
    expect((await change(agentB, id, 'RESOLVED', 2)).status).toBe(404);
  });

  it('keeps authentication and health routes functional without exposing internals', async () => {
    expect((await agentA.get('/auth/me')).status).toBe(200);
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    const missing = await agentA.get(`/inquiries/${crypto.randomUUID()}`);
    expect(JSON.stringify(missing.body)).not.toMatch(
      /passwordHash|DATABASE_URL|Prisma|inquiry.sid/,
    );
  });
});
