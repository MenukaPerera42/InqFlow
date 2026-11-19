import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
const origin = 'http://localhost:3000';
const config = readAuthConfig({
  ...process.env,
  DATABASE_URL: testUrl,
  SESSION_SECRETS: 'phase-three-integration-secret-at-least-32-characters',
  FRONTEND_ORIGINS: origin,
  NODE_ENV: 'test',
});
const { store, pool } = createSessionStore(config);
const app = createApp(config, db, store);
const prefix = `phase03-${crypto.randomUUID()}`;
const password = 'Strong-Password-For-Tests-123!';
let admin: { id: string; email: string };
let secondAdmin: { id: string; email: string };
let manager: { id: string; email: string };
let employee: { id: string; email: string };
let outsider: { id: string; email: string };
let adminAgent: ReturnType<typeof request.agent>;
let secondAdminAgent: ReturnType<typeof request.agent>;
let managerAgent: ReturnType<typeof request.agent>;
let employeeAgent: ReturnType<typeof request.agent>;
let outsiderAgent: ReturnType<typeof request.agent>;
const post = (
  agent: ReturnType<typeof request.agent>,
  path: string,
  body: object = {},
) => agent.post(path).set('Origin', origin).send(body);
const patch = (
  agent: ReturnType<typeof request.agent>,
  path: string,
  body: object,
) => agent.patch(path).set('Origin', origin).send(body);
const remove = (agent: ReturnType<typeof request.agent>, path: string) =>
  agent.delete(path).set('Origin', origin);
const signIn = async (email: string) => {
  const agent = request.agent(app);
  expect((await post(agent, '/auth/login', { email, password })).status).toBe(
    200,
  );
  return agent;
};
const createTeam = async (name: string) => {
  const response = await post(adminAgent, '/admin/teams', { name });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

beforeAll(async () => {
  await db.$connect();
  const passwordHash = await bcrypt.hash(password, 12);
  const create = (label: string, role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE') =>
    db.user.create({
      data: {
        name: label,
        email: `${prefix}-${label.toLowerCase()}@example.test`,
        passwordHash,
        role,
        accountStatus: 'ACTIVE',
      },
    });
  admin = await create('Admin', 'ADMIN');
  secondAdmin = await create('SecondAdmin', 'ADMIN');
  manager = await create('Manager', 'MANAGER');
  employee = await create('Employee', 'EMPLOYEE');
  outsider = await create('Outsider', 'EMPLOYEE');
  adminAgent = await signIn(admin.email);
  secondAdminAgent = await signIn(secondAdmin.email);
  managerAgent = await signIn(manager.email);
  employeeAgent = await signIn(employee.email);
  outsiderAgent = await signIn(outsider.email);
});
afterAll(async () => {
  await db.managementAudit.deleteMany({
    where: { actor: { email: { startsWith: prefix } } },
  });
  await db.accountAudit.deleteMany({
    where: { target: { email: { startsWith: prefix } } },
  });
  await db.inquiry.deleteMany({
    where: { createdBy: { email: { startsWith: prefix } } },
  });
  await db.category.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.teamManager.deleteMany({
    where: { team: { name: { startsWith: prefix } } },
  });
  await db.teamMembership.deleteMany({
    where: { team: { name: { startsWith: prefix } } },
  });
  await db.team.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await pool.query(
    'DELETE FROM "inquiry_test"."staff_sessions" WHERE sess::jsonb->>\'userId\' = ANY($1::text[])',
    [[admin.id, secondAdmin.id, manager.id, employee.id, outsider.id]],
  );
  await Promise.resolve(store.close());
  await pool.end();
  await db.$disconnect();
});

describe.sequential('Phase 03 management and authorization', () => {
  it('lists safe users with search, role and status filters', async () => {
    const response = await adminAgent.get(
      `/admin/users?search=${prefix}-employee&role=EMPLOYEE&status=ACTIVE&pageSize=2`,
    );
    expect(response.status).toBe(200);
    expect(
      response.body.data.some(
        (user: { id: string }) => user.id === employee.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect((await adminAgent.get('/admin/users?role=OWNER')).status).toBe(400);
    expect((await managerAgent.get('/admin/users')).status).toBe(403);
  });
  it('changes a role, revokes old sessions, audits, and grants no team authority', async () => {
    const result = await patch(adminAgent, `/admin/users/${outsider.id}/role`, {
      role: 'MANAGER',
    });
    expect(result.status).toBe(200);
    expect(result.body.data.role).toBe('MANAGER');
    expect((await outsiderAgent.get('/teams')).status).toBe(401);
    outsiderAgent = await signIn(outsider.email);
    expect((await outsiderAgent.get('/teams')).body.data).toEqual([]);
    expect(await db.teamManager.count({ where: { userId: outsider.id } })).toBe(
      0,
    );
    expect(
      await db.managementAudit.count({
        where: { targetId: outsider.id, action: 'ROLE_CHANGED' },
      }),
    ).toBe(1);
    expect(
      (
        await patch(managerAgent, `/admin/users/${employee.id}/role`, {
          role: 'ADMIN',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await patch(adminAgent, `/admin/users/${employee.id}/role`, {
          role: 'OWNER',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await patch(adminAgent, `/admin/users/${admin.id}/role`, {
          role: 'EMPLOYEE',
        })
      ).status,
    ).toBe(409);
  });
  it('prevents concurrent removal of the last active administrator', async () => {
    const [a, b] = await Promise.all([
      patch(adminAgent, `/admin/users/${secondAdmin.id}/role`, {
        role: 'EMPLOYEE',
      }),
      patch(secondAdminAgent, `/admin/users/${admin.id}/role`, {
        role: 'EMPLOYEE',
      }),
    ]);
    expect(
      [a.status, b.status].filter((status) => status === 200),
    ).toHaveLength(1);
    expect([401, 403]).toContain(a.status === 200 ? b.status : a.status);
    expect(
      await db.user.count({
        where: {
          role: 'ADMIN',
          accountStatus: 'ACTIVE',
          email: { startsWith: prefix },
        },
      }),
    ).toBe(1);
    // Restore the demoted fixture through the remaining administrator.
    const winner = a.status === 200 ? adminAgent : secondAdminAgent;
    const demoted = a.status === 200 ? secondAdmin : admin;
    expect(
      (
        await patch(winner, `/admin/users/${demoted.id}/role`, {
          role: 'ADMIN',
        })
      ).status,
    ).toBe(200);
    if (a.status === 200) secondAdminAgent = await signIn(secondAdmin.email);
    else adminAgent = await signIn(admin.email);
  });
  it('creates, updates, deactivates and reactivates teams with normalized uniqueness', async () => {
    const teamId = await createTeam(`${prefix}-Operations`);
    expect(
      (await post(adminAgent, '/admin/teams', { name: `${prefix}-operations` }))
        .status,
    ).toBe(409);
    expect(
      (
        await patch(adminAgent, `/admin/teams/${teamId}`, {
          description: 'Support',
        })
      ).body.data.description,
    ).toBe('Support');
    expect(
      (await post(adminAgent, `/admin/teams/${teamId}/deactivate`)).status,
    ).toBe(200);
    expect(
      (await post(adminAgent, `/admin/teams/${teamId}/deactivate`)).status,
    ).toBe(409);
    expect(
      (await post(adminAgent, `/admin/teams/${teamId}/reactivate`)).status,
    ).toBe(200);
    expect(
      (await post(employeeAgent, '/admin/teams', { name: 'Forbidden' })).status,
    ).toBe(403);
    expect((await adminAgent.get('/admin/teams/not-a-uuid')).status).toBe(400);
    expect(
      await db.managementAudit.count({ where: { targetId: teamId } }),
    ).toBe(4);
  });
  it('serializes duplicate team and category names through database constraints', async () => {
    const [a, b] = await Promise.all([
      post(adminAgent, '/admin/teams', { name: `${prefix}-ConcurrentTeam` }),
      post(adminAgent, '/admin/teams', { name: `${prefix}-concurrentteam` }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const [c, d] = await Promise.all([
      post(adminAgent, '/admin/categories', {
        name: `${prefix}-ConcurrentCategory`,
      }),
      post(adminAgent, '/admin/categories', {
        name: `${prefix}-concurrentcategory`,
      }),
    ]);
    expect([c.status, d.status].sort()).toEqual([201, 409]);
  });
  it('supports multiple memberships, no-team users, and immediate removal', async () => {
    const one = await createTeam(`${prefix}-MemberA`);
    const two = await createTeam(`${prefix}-MemberB`);
    expect(
      (
        await post(adminAgent, `/admin/teams/${one}/members`, {
          userId: employee.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(adminAgent, `/admin/teams/${two}/members`, {
          userId: employee.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(adminAgent, `/admin/teams/${one}/members`, {
          userId: employee.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (await employeeAgent.get('/teams')).body.data
        .map((team: { id: string }) => team.id)
        .sort(),
    ).toEqual([one, two].sort());
    expect((await outsiderAgent.get('/teams')).body.data).toEqual([]);
    expect(
      (
        await post(employeeAgent, `/admin/teams/${one}/members`, {
          userId: employee.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(managerAgent, `/admin/teams/${one}/members`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (await remove(adminAgent, `/admin/teams/${one}/members/${employee.id}`))
        .status,
    ).toBe(204);
    expect((await employeeAgent.get(`/teams/${one}`)).status).toBe(404);
    expect((await employeeAgent.get(`/teams/${two}`)).status).toBe(200);
    expect(
      (await remove(adminAgent, `/admin/teams/${one}/members/${employee.id}`))
        .status,
    ).toBe(404);
  });
  it('handles concurrent membership creation and removal without duplicates', async () => {
    const teamId = await createTeam(`${prefix}-RaceMembers`);
    const [a, b] = await Promise.all([
      post(adminAgent, `/admin/teams/${teamId}/members`, {
        userId: employee.id,
      }),
      post(adminAgent, `/admin/teams/${teamId}/members`, {
        userId: employee.id,
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await db.teamMembership.count({ where: { teamId, userId: employee.id } }),
    ).toBe(1);
    const removed = await Promise.all([
      remove(adminAgent, `/admin/teams/${teamId}/members/${employee.id}`),
      remove(adminAgent, `/admin/teams/${teamId}/members/${employee.id}`),
    ]);
    expect(removed.map((result) => result.status).sort()).toEqual([204, 404]);
  });
  it('limits manager reads to explicitly managed active teams and current assignment', async () => {
    const one = await createTeam(`${prefix}-ManagedA`);
    const two = await createTeam(`${prefix}-ManagedB`);
    expect((await managerAgent.get(`/teams/${one}`)).status).toBe(404);
    expect(
      (
        await post(adminAgent, `/admin/teams/${one}/managers`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(adminAgent, `/admin/teams/${two}/managers`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(adminAgent, `/admin/teams/${one}/members`, {
          userId: employee.id,
        })
      ).status,
    ).toBe(201);
    expect((await managerAgent.get(`/teams/${one}`)).status).toBe(200);
    expect(
      (await managerAgent.get(`/teams/${one}/members`)).body.data[0].user.id,
    ).toBe(employee.id);
    expect((await employeeAgent.get(`/teams/${one}/members`)).status).toBe(404);
    expect(
      (await managerAgent.get('/teams')).body.data.map(
        (team: { id: string }) => team.id,
      ),
    ).toEqual(expect.arrayContaining([one, two]));
    expect(
      (
        await post(managerAgent, `/admin/teams/${one}/managers`, {
          userId: outsider.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (await remove(adminAgent, `/admin/teams/${one}/managers/${manager.id}`))
        .status,
    ).toBe(204);
    expect((await managerAgent.get(`/teams/${one}`)).status).toBe(404);
    expect((await managerAgent.get(`/teams/${two}`)).status).toBe(200);
    expect(
      (await post(adminAgent, `/admin/teams/${two}/deactivate`)).status,
    ).toBe(200);
    expect((await managerAgent.get(`/teams/${two}`)).status).toBe(404);
  });
  it('denies a suspended manager even while assignments remain stored', async () => {
    const teamId = await createTeam(`${prefix}-SuspendedManager`);
    expect(
      (
        await post(adminAgent, `/admin/teams/${teamId}/managers`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(201);
    expect((await managerAgent.get(`/teams/${teamId}`)).status).toBe(200);
    expect(
      (await post(adminAgent, `/admin/users/${manager.id}/suspend`)).status,
    ).toBe(200);
    expect((await managerAgent.get(`/teams/${teamId}`)).status).toBe(401);
    expect(
      (await post(adminAgent, `/admin/users/${manager.id}/reactivate`)).status,
    ).toBe(200);
    managerAgent = await signIn(manager.email);
    expect((await managerAgent.get(`/teams/${teamId}`)).status).toBe(200);
  });
  it('demotion removes manager assignments but keeps ordinary membership', async () => {
    const teamId = await createTeam(`${prefix}-Demotion`);
    expect(
      (
        await post(adminAgent, `/admin/teams/${teamId}/managers`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(adminAgent, `/admin/teams/${teamId}/members`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await patch(adminAgent, `/admin/users/${manager.id}/role`, {
          role: 'EMPLOYEE',
        })
      ).status,
    ).toBe(200);
    expect((await managerAgent.get(`/teams/${teamId}`)).status).toBe(401);
    managerAgent = await signIn(manager.email);
    expect((await managerAgent.get(`/teams/${teamId}`)).status).toBe(200);
    expect((await managerAgent.get(`/teams/${teamId}/members`)).status).toBe(
      404,
    );
    expect(await db.teamManager.count({ where: { userId: manager.id } })).toBe(
      0,
    );
    expect(
      await db.teamMembership.count({ where: { userId: manager.id, teamId } }),
    ).toBe(1);
  });
  it('preserves creator access and allows managed team inquiry reads without status powers', async () => {
    expect(
      (
        await patch(adminAgent, `/admin/users/${manager.id}/role`, {
          role: 'MANAGER',
        })
      ).status,
    ).toBe(200);
    managerAgent = await signIn(manager.email);
    const teamId = await createTeam(`${prefix}-InquiryTeam`);
    expect(
      (
        await post(adminAgent, `/admin/teams/${teamId}/managers`, {
          userId: manager.id,
        })
      ).status,
    ).toBe(201);
    const created = await post(employeeAgent, '/inquiries', {
      customerName: 'Customer',
      customerContact: 'customer@example.test',
      subject: 'Team ticket',
      description: 'Team-scoped read',
    });
    expect(created.status).toBe(201);
    const inquiryId = created.body.data.id;
    expect((await managerAgent.get(`/inquiries/${inquiryId}`)).status).toBe(
      404,
    );
    await db.inquiry.update({ where: { id: inquiryId }, data: { teamId } });
    expect((await managerAgent.get(`/inquiries/${inquiryId}`)).status).toBe(
      200,
    );
    expect((await outsiderAgent.get(`/inquiries/${inquiryId}`)).status).toBe(
      404,
    );
    expect(
      (
        await patch(managerAgent, `/inquiries/${inquiryId}/status`, {
          status: 'IN_PROGRESS',
          version: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await remove(
          adminAgent,
          `/admin/teams/${teamId}/managers/${manager.id}`,
        )
      ).status,
    ).toBe(204);
    expect((await managerAgent.get(`/inquiries/${inquiryId}`)).status).toBe(
      404,
    );
    expect((await employeeAgent.get(`/inquiries/${inquiryId}`)).status).toBe(
      200,
    );
  });
  it('manages categories and validates optional active default team', async () => {
    const teamId = await createTeam(`${prefix}-CategoryTeam`);
    const categoryName = `${prefix}-Technical`;
    const created = await post(adminAgent, '/admin/categories', {
      name: categoryName,
    });
    expect(created.status).toBe(201);
    const categoryId = created.body.data.id;
    expect(created.body.data.defaultTeamId).toBeNull();
    expect(
      (
        await post(adminAgent, '/admin/categories', {
          name: categoryName.toLowerCase(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await patch(adminAgent, `/admin/categories/${categoryId}`, {
          defaultTeamId: teamId,
        })
      ).body.data.defaultTeamId,
    ).toBe(teamId);
    expect(
      (await post(adminAgent, `/admin/teams/${teamId}/deactivate`)).status,
    ).toBe(200);
    expect(
      (
        await post(adminAgent, '/admin/categories', {
          name: `${prefix}-Invalid`,
          defaultTeamId: teamId,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await patch(adminAgent, `/admin/categories/${categoryId}`, {
          defaultTeamId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (await post(adminAgent, `/admin/categories/${categoryId}/deactivate`))
        .status,
    ).toBe(200);
    expect((await employeeAgent.get(`/categories/${categoryId}`)).status).toBe(
      404,
    );
    expect(
      (await post(adminAgent, `/admin/categories/${categoryId}/reactivate`))
        .status,
    ).toBe(200);
    expect(
      (await employeeAgent.get(`/categories/${categoryId}`)).body.data,
    ).toEqual({ id: categoryId, name: categoryName, description: null });
    expect(
      (
        await patch(adminAgent, `/admin/categories/${categoryId}`, {
          defaultTeamId: null,
        })
      ).body.data.defaultTeamId,
    ).toBeNull();
    expect(
      (await post(employeeAgent, '/admin/categories', { name: 'Forbidden' }))
        .status,
    ).toBe(403);
    expect(
      await db.managementAudit.count({ where: { targetId: categoryId } }),
    ).toBe(5);
  });
  it('preserves historical inquiry references after category and team deactivation', async () => {
    const teamId = await createTeam(`${prefix}-HistoryTeam`);
    const category = await post(adminAgent, '/admin/categories', {
      name: `${prefix}-HistoryCategory`,
      defaultTeamId: teamId,
    });
    const inquiry = await post(employeeAgent, '/inquiries', {
      customerName: 'History',
      customerContact: 'history@example.test',
      subject: 'History',
      description: 'Preservation',
    });
    await db.inquiry.update({
      where: { id: inquiry.body.data.id },
      data: { teamId, categoryId: category.body.data.id },
    });
    expect(
      (await post(adminAgent, `/admin/teams/${teamId}/deactivate`)).status,
    ).toBe(200);
    expect(
      (
        await post(
          adminAgent,
          `/admin/categories/${category.body.data.id}/deactivate`,
        )
      ).status,
    ).toBe(200);
    const stored = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.body.data.id },
    });
    expect(stored.teamId).toBe(teamId);
    expect(stored.categoryId).toBe(category.body.data.id);
    expect((await employeeAgent.get(`/inquiries/${stored.id}`)).status).toBe(
      200,
    );
  });
});
