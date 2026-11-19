import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import session from 'express-session';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createSessionStore } from '../auth/session.js';
import { readAuthConfig } from '../config/auth.js';
import { seedStaff, staffAccounts } from '../db/seed.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  testUrl === process.env.DATABASE_URL ||
  new URL(testUrl).searchParams.get('schema') !== 'inquiry_test'
) {
  throw new Error(
    'Authentication tests require the dedicated inquiry_test schema',
  );
}
const origin = 'http://localhost:3000';
const password = 'auth-test-password-123';
const database = new PrismaClient({ datasources: { db: { url: testUrl } } });
const config = readAuthConfig({
  ...process.env,
  DATABASE_URL: testUrl,
  SESSION_SECRETS: 'a-test-signing-secret-with-at-least-32-characters',
  FRONTEND_ORIGINS: origin,
  NODE_ENV: 'test',
});
const { store, pool } = createSessionStore(config);
const app = createApp(config, database, store);
const credentials = { email: staffAccounts[0].email, password };

async function login(agent = request.agent(app)) {
  const response = await agent
    .post('/auth/login')
    .set('Origin', origin)
    .send(credentials);
  return { agent, response };
}

beforeAll(async () => {
  await database.$connect();
  await seedStaff(database, password);
});

afterAll(async () => {
  await pool.query('DELETE FROM "inquiry_test"."staff_sessions"');
  await database.user.deleteMany({
    where: { email: { in: staffAccounts.map((account) => account.email) } },
  });
  await Promise.resolve(store.close());
  await pool.end();
  await database.$disconnect();
});

describe.sequential('authentication API', () => {
  it('logs in a seeded user with a safe response and persistent HttpOnly cookie', async () => {
    const { agent, response } = await login();
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        name: staffAccounts[0].name,
        email: credentials.email,
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('inquiry.sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    const current = await agent.get('/auth/me');
    expect(current.status).toBe(200);
    expect(current.body.user.email).toBe(credentials.email);
    const sessions = await pool.query(
      'SELECT count(*)::int AS count FROM "inquiry_test"."staff_sessions"',
    );
    expect(sessions.rows[0].count).toBeGreaterThan(0);
  });

  it('normalizes email and returns the same generic error for wrong or unknown credentials', async () => {
    const normalized = await request(app)
      .post('/auth/login')
      .set('Origin', origin)
      .send({ ...credentials, email: credentials.email.toUpperCase() });
    expect(normalized.status).toBe(200);
    const wrong = await request(app)
      .post('/auth/login')
      .set('Origin', origin)
      .send({ ...credentials, password: 'wrong-password' });
    const unknown = await request(app)
      .post('/auth/login')
      .set('Origin', origin)
      .send({ ...credentials, email: 'unknown@example.test' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rejects missing, malformed, invalid, and unexpected login input', async () => {
    for (const body of [
      {},
      { ...credentials, email: 'bad' },
      { ...credentials, extra: true },
    ]) {
      const response = await request(app)
        .post('/auth/login')
        .set('Origin', origin)
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    }
    const malformed = await request(app)
      .post('/auth/login')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects unauthenticated, invalid, and expired sessions', async () => {
    expect((await request(app).get('/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/auth/me').set('Cookie', 'inquiry.sid=invalid'))
        .status,
    ).toBe(401);
    const previous = await pool.query(
      'SELECT sid FROM "inquiry_test"."staff_sessions"',
    );
    const previousIds = new Set(
      previous.rows.map((row: { sid: string }) => row.sid),
    );
    const { response } = await login();
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const current = await pool.query(
      'SELECT sid FROM "inquiry_test"."staff_sessions"',
    );
    const sid = current.rows.find(
      (row: { sid: string }) => !previousIds.has(row.sid),
    )?.sid;
    expect(sid).toBeDefined();
    await pool.query(
      'UPDATE "inquiry_test"."staff_sessions" SET expire = NOW() - INTERVAL \'1 second\' WHERE sid = $1',
      [sid],
    );
    // A store-expired session is rejected; other active sessions are unaffected.
    const expired = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(expired.status).toBe(401);
  });

  it('regenerates on login and invalidates the previous cookie', async () => {
    const agent = request.agent(app);
    const first = await agent
      .post('/auth/login')
      .set('Origin', origin)
      .send(credentials);
    const oldCookie = first.headers['set-cookie'][0].split(';')[0];
    const second = await agent
      .post('/auth/login')
      .set('Origin', origin)
      .send(credentials);
    const newCookie = second.headers['set-cookie'][0].split(';')[0];
    expect(second.status).toBe(200);
    expect(newCookie).not.toBe(oldCookie);
    expect(
      (await request(app).get('/auth/me').set('Cookie', oldCookie)).status,
    ).toBe(401);
    expect((await agent.get('/auth/me')).status).toBe(200);
  });

  it('logs out and rejects the old cookie', async () => {
    const { agent, response } = await login();
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const loggedOut = await agent.post('/auth/logout').set('Origin', origin);
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.text).toBe('');
    expect((await agent.get('/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/auth/me').set('Cookie', cookie)).status,
    ).toBe(401);
    expect(
      (await request(app).post('/auth/logout').set('Origin', origin)).status,
    ).toBe(401);
  });

  it('rejects a session when its user has been deleted', async () => {
    const email = `deleted-${crypto.randomUUID()}@example.test`;
    const user = await database.user.create({
      data: {
        name: 'Deleted Staff',
        email,
        passwordHash: await bcrypt.hash(password, 12),
        accountStatus: 'ACTIVE',
      },
    });
    const agent = request.agent(app);
    const signedIn = await agent
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email, password });
    expect(signedIn.status).toBe(200);
    await database.user.delete({ where: { id: user.id } });
    expect((await agent.get('/auth/me')).status).toBe(401);
  });

  it('denies pending accounts and invalidates a session after suspension', async () => {
    const email = `status-${crypto.randomUUID()}@example.test`;
    const user = await database.user.create({
      data: {
        name: 'Status Test',
        email,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    try {
      const agent = request.agent(app);
      const pending = await agent
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email, password });
      expect(pending.status).toBe(401);
      expect(pending.body.error.code).toBe('INVALID_CREDENTIALS');
      await database.user.update({
        where: { id: user.id },
        data: { accountStatus: 'ACTIVE' },
      });
      expect(
        (
          await agent
            .post('/auth/login')
            .set('Origin', origin)
            .send({ email, password })
        ).status,
      ).toBe(200);
      await database.user.update({
        where: { id: user.id },
        data: { accountStatus: 'SUSPENDED' },
      });
      expect((await agent.get('/auth/me')).status).toBe(401);
      expect((await agent.get('/inquiries')).status).toBe(401);
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });

  it('allows approved CORS and rejects disallowed or missing state-changing origins', async () => {
    const preflight = await request(app)
      .options('/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(origin);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    const unapproved = await request(app)
      .options('/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(unapproved.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      (await request(app).post('/auth/login').send(credentials)).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/auth/login')
          .set('Origin', 'https://evil.example')
          .send(credentials)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/auth/login')
          .set('Origin', origin)
          .send(credentials)
      ).status,
    ).toBe(200);
  });

  it('does not issue a Secure cookie over HTTP in production mode', async () => {
    const production = createApp(
      { ...config, production: true },
      database,
      new session.MemoryStore(),
    );
    const response = await request(production)
      .post('/auth/login')
      .set('Origin', origin)
      .send(credentials);
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns a server error when the session store fails', async () => {
    const { response } = await login();
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const failingStore = new session.MemoryStore();
    failingStore.get = (_sid, callback) => callback(new Error('unavailable'));
    const failingApp = createApp(config, database, failingStore);
    const result = await request(failingApp)
      .get('/auth/me')
      .set('Cookie', cookie);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('limits repeated login attempts', async () => {
    const limitedApp = createApp(config, database, new session.MemoryStore());
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(limitedApp)
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email: 'unknown@example.test', password });
      expect(response.status).toBe(401);
    }
    const blocked = await request(limitedApp)
      .post('/auth/login')
      .set('Origin', origin)
      .send(credentials);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('keeps health available', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
