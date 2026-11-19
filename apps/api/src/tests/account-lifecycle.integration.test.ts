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
)
  throw new Error('Dedicated test schema required');
const database = new PrismaClient({ datasources: { db: { url: testUrl } } });
const origin = 'http://localhost:3000';
const config = readAuthConfig({
  ...process.env,
  DATABASE_URL: testUrl,
  SESSION_SECRETS: 'phase-two-test-secret-with-at-least-32-characters',
  FRONTEND_ORIGINS: origin,
  NODE_ENV: 'test',
});
const { store, pool } = createSessionStore(config);
const app = createApp(config, database, store);
const prefix = `phase02-${crypto.randomUUID()}`;
const password = 'Strong-Password-For-Tests-123!';
const registration = (suffix: string) => ({
  name: 'New Employee',
  email: `${prefix}-${suffix}@example.test`,
  password,
});
let admin: { id: string };
let manager: { id: string };
let employee: { id: string };
let adminAgent: ReturnType<typeof request.agent>;
let managerAgent: ReturnType<typeof request.agent>;
let employeeAgent: ReturnType<typeof request.agent>;
const signIn = async (email: string) => {
  const agent = request.agent(app);
  expect(
    (
      await agent
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email, password })
    ).status,
  ).toBe(200);
  return agent;
};
const act = (
  agent: ReturnType<typeof request.agent>,
  id: string,
  action: string,
) => agent.post(`/admin/users/${id}/${action}`).set('Origin', origin).send({});

beforeAll(async () => {
  await database.$connect();
  const passwordHash = await bcrypt.hash(password, 12);
  admin = await database.user.create({
    data: {
      name: 'Admin',
      email: `${prefix}-admin@example.test`,
      passwordHash,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
    },
  });
  manager = await database.user.create({
    data: {
      name: 'Manager',
      email: `${prefix}-manager@example.test`,
      passwordHash,
      role: 'MANAGER',
      accountStatus: 'ACTIVE',
    },
  });
  employee = await database.user.create({
    data: {
      name: 'Employee',
      email: `${prefix}-employee@example.test`,
      passwordHash,
      role: 'EMPLOYEE',
      accountStatus: 'ACTIVE',
    },
  });
  adminAgent = await signIn(`${prefix}-admin@example.test`);
  managerAgent = await signIn(`${prefix}-manager@example.test`);
  employeeAgent = await signIn(`${prefix}-employee@example.test`);
});
afterEach(async () => {
  await database.accountAudit.deleteMany({
    where: { target: { email: { startsWith: prefix } } },
  });
  await database.inquiry.deleteMany({
    where: { createdBy: { email: { startsWith: prefix } } },
  });
  await database.user.deleteMany({
    where: {
      email: { startsWith: prefix },
      id: { notIn: [admin.id, manager.id, employee.id] },
    },
  });
});
afterAll(async () => {
  await database.accountAudit.deleteMany({
    where: { target: { email: { startsWith: prefix } } },
  });
  await database.inquiry.deleteMany({
    where: { createdBy: { email: { startsWith: prefix } } },
  });
  await database.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await pool.query('DELETE FROM "inquiry_test"."staff_sessions"');
  await Promise.resolve(store.close());
  await pool.end();
  await database.$disconnect();
});

describe.sequential('Phase 02 account lifecycle', () => {
  it('registers a pending employee without a session and normalizes email', async () => {
    const input = registration('new');
    const response = await request(app)
      .post('/auth/register')
      .set('Origin', origin)
      .send({ ...input, email: input.email.toUpperCase() });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Registration submitted for administrator review.',
      accountStatus: 'PENDING',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    const stored = await database.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    expect(stored.role).toBe('EMPLOYEE');
    expect(stored.accountStatus).toBe('PENDING');
    expect(stored.passwordHash).not.toBe(password);
    expect(
      (
        await request(app)
          .post('/auth/login')
          .set('Origin', origin)
          .send({ email: input.email, password })
      ).status,
    ).toBe(401);
  });
  it('rejects mass assignment and weak or missing registration data', async () => {
    const input = registration('invalid');
    for (const body of [
      { ...input, role: 'ADMIN' },
      { ...input, accountStatus: 'ACTIVE' },
      { ...input, teamId: crypto.randomUUID() },
      { ...input, password: 'weak' },
      { email: input.email, password },
    ]) {
      expect(
        (
          await request(app)
            .post('/auth/register')
            .set('Origin', origin)
            .send(body)
        ).status,
      ).toBe(400);
    }
    expect(await database.user.count({ where: { email: input.email } })).toBe(
      0,
    );
  });
  it('gives a duplicate email the same public response and creates one row', async () => {
    const input = registration('duplicate');
    const first = await request(app)
      .post('/auth/register')
      .set('Origin', origin)
      .send(input);
    const second = await request(app)
      .post('/auth/register')
      .set('Origin', origin)
      .send(input);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await database.user.count({ where: { email: input.email } })).toBe(
      1,
    );
  });
  it('allows only admin to list and review pending users with safe projection', async () => {
    const input = registration('review');
    await request(app).post('/auth/register').set('Origin', origin).send(input);
    expect((await employeeAgent.get('/admin/users/pending')).status).toBe(403);
    expect((await managerAgent.get('/admin/users/pending')).status).toBe(403);
    expect((await request(app).get('/admin/users/pending')).status).toBe(401);
    const list = await adminAgent.get(
      '/admin/users/pending?page=1&pageSize=10',
    );
    expect(list.status).toBe(200);
    expect(
      list.body.data.some(
        (item: { email: string }) => item.email === input.email,
      ),
    ).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
  });
  it('approves without a team and records the action', async () => {
    const input = registration('approve');
    await request(app).post('/auth/register').set('Origin', origin).send(input);
    const target = await database.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    const response = await act(adminAgent, target.id, 'approve');
    expect(response.status).toBe(200);
    expect(response.body.data.accountStatus).toBe('ACTIVE');
    expect(
      await database.teamMembership.count({ where: { userId: target.id } }),
    ).toBe(0);
    expect(
      await database.accountAudit.count({
        where: { actorId: admin.id, targetId: target.id, action: 'APPROVED' },
      }),
    ).toBe(1);
    expect(
      (
        await request(app)
          .post('/auth/login')
          .set('Origin', origin)
          .send({ email: input.email, password })
      ).status,
    ).toBe(200);
  });
  it('rejects pending users and refuses an invalid repeat transition', async () => {
    const input = registration('reject');
    await request(app).post('/auth/register').set('Origin', origin).send(input);
    const target = await database.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    expect((await act(adminAgent, target.id, 'reject')).status).toBe(200);
    expect((await act(adminAgent, target.id, 'approve')).status).toBe(409);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: target.id } }))
        .accountStatus,
    ).toBe('REJECTED');
  });
  it('serializes concurrent approval and rejection', async () => {
    const input = registration('race');
    await request(app).post('/auth/register').set('Origin', origin).send(input);
    const target = await database.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    const [a, b] = await Promise.all([
      act(adminAgent, target.id, 'approve'),
      act(adminAgent, target.id, 'reject'),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(
      await database.accountAudit.count({ where: { targetId: target.id } }),
    ).toBe(1);
  });
  it('suspends and reactivates a user while revoking an existing session', async () => {
    const response = await act(adminAgent, employee.id, 'suspend');
    expect(response.status).toBe(200);
    expect((await employeeAgent.get('/auth/me')).status).toBe(401);
    expect((await employeeAgent.get('/inquiries')).status).toBe(401);
    expect(
      (
        await managerAgent
          .post(`/admin/users/${employee.id}/reactivate`)
          .set('Origin', origin)
          .send({})
      ).status,
    ).toBe(403);
    expect((await act(adminAgent, employee.id, 'reactivate')).status).toBe(200);
    expect((await employeeAgent.get('/auth/me')).status).toBe(401);
    employeeAgent = await signIn(`${prefix}-employee@example.test`);
    expect((await employeeAgent.get('/auth/me')).status).toBe(200);
    expect(
      await database.accountAudit.count({ where: { targetId: employee.id } }),
    ).toBe(2);
  });
  it('protects admins from self-suspension and other admin suspension', async () => {
    expect((await act(adminAgent, admin.id, 'suspend')).status).toBe(409);
    expect((await act(adminAgent, admin.id, 'approve')).status).toBe(409);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: admin.id } }))
        .accountStatus,
    ).toBe('ACTIVE');
  });
  it('allows admin global inquiry access but keeps manager and employee scoped', async () => {
    const created = await employeeAgent
      .post('/inquiries')
      .set('Origin', origin)
      .send({
        customerName: 'Customer',
        customerContact: 'customer@example.test',
        subject: 'Private',
        description: 'Owned inquiry',
      });
    const id = created.body.data.id;
    expect((await adminAgent.get(`/inquiries/${id}`)).status).toBe(200);
    expect((await managerAgent.get(`/inquiries/${id}`)).status).toBe(404);
    expect(
      (await adminAgent.get('/inquiries')).body.data.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(true);
    expect(
      (await managerAgent.get('/inquiries')).body.data.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(false);
    expect(
      (
        await managerAgent
          .patch(`/inquiries/${id}/status`)
          .set('Origin', origin)
          .send({ status: 'IN_PROGRESS', version: 1 })
      ).status,
    ).toBe(404);
    const updated = await adminAgent
      .patch(`/inquiries/${id}/status`)
      .set('Origin', origin)
      .send({ status: 'IN_PROGRESS', version: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);
  });
  it('uses the current database role for an existing session', async () => {
    await database.user.update({
      where: { id: admin.id },
      data: { role: 'EMPLOYEE' },
    });
    try {
      expect((await adminAgent.get('/admin/users')).status).toBe(403);
      expect((await adminAgent.get('/auth/me')).status).toBe(200);
    } finally {
      await database.user.update({
        where: { id: admin.id },
        data: { role: 'ADMIN' },
      });
    }
  });
  it('requires an approved Origin for registration and account actions', async () => {
    expect(
      (await request(app).post('/auth/register').send(registration('origin')))
        .status,
    ).toBe(403);
    expect(
      (await adminAgent.post(`/admin/users/${employee.id}/suspend`).send({}))
        .status,
    ).toBe(403);
  });
  it('limits repeated public registration attempts', async () => {
    const input = registration('limit');
    let limited = false;
    for (let i = 0; i < 35; i++) {
      const response = await request(app)
        .post('/auth/register')
        .set('Origin', origin)
        .send({
          ...input,
          email: `${prefix}-limit-${i}@example.test`,
          password: 'weak',
        });
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
