import { Prisma, type PrismaClient } from '@prisma/client';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthConfig } from '../config/auth.js';
import { requireAuth } from '../middleware/require-auth.js';
import { sendError } from '../auth/errors.js';

const id = z.uuid();
const name = z.string().trim().min(2).max(120);
const description = z.string().trim().max(1000).nullable().optional();
const teamCreate = z.strictObject({ name, description });
const teamUpdate = teamCreate
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const categoryCreate = z.strictObject({
  name,
  description,
  defaultTeamId: id.nullable().optional(),
});
const categoryUpdate = categoryCreate
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const memberBody = z.strictObject({ userId: id });
const emptyBody = z.strictObject({});
const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  active: z.enum(['true', 'false']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
const teamSelect = {
  id: true,
  name: true,
  description: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;
const categorySelect = { ...teamSelect, defaultTeamId: true } as const;
const memberSelect = {
  userId: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
    },
  },
} as const;
const managerSelect = memberSelect;

function failure(
  response: Response,
  code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_INPUT',
) {
  const status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : 400;
  return sendError(
    response,
    status,
    code,
    code === 'NOT_FOUND'
      ? 'Resource not found.'
      : code === 'CONFLICT'
        ? 'Operation conflicts with current state.'
        : 'Invalid request.',
  );
}
function unique(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetType: string,
  targetId: string,
  action: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
) {
  await tx.managementAudit.create({
    data: { actorId, targetType, targetId, action, before, after },
  });
}
async function lockedTeam(tx: Prisma.TransactionClient, teamId: string) {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId}::uuid FOR UPDATE`;
  return tx.team.findUnique({
    where: { id: teamId },
    select: { id: true, active: true, name: true, description: true },
  });
}

export function createManagementRouter(
  database: PrismaClient,
  config: AuthConfig,
) {
  const router = Router();
  router.use(requireAuth(database, config));
  router.use((request, response, next) =>
    request.authUser?.role === 'ADMIN'
      ? next()
      : sendError(response, 403, 'FORBIDDEN', 'Administrator access required.'),
  );

  router.get('/teams', async (request, response) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return failure(response, 'INVALID_INPUT');
    const { page, pageSize, active, search } = parsed.data;
    const where: Prisma.TeamWhereInput = {
      ...(active ? { active: active === 'true' } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await database.$transaction([
      database.team.findMany({
        where,
        select: teamSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      database.team.count({ where }),
    ]);
    return response.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });
  router.post('/teams', async (request, response) => {
    const parsed = teamCreate.safeParse(request.body);
    if (!parsed.success) return failure(response, 'INVALID_INPUT');
    try {
      const data = await database.$transaction(async (tx) => {
        const created = await tx.team.create({
          data: parsed.data,
          select: teamSelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'TEAM',
          created.id,
          'CREATED',
          undefined,
          { name: created.name, active: true },
        );
        return created;
      });
      return response
        .status(201)
        .location(`/admin/teams/${data.id}`)
        .json({ data });
    } catch (error) {
      if (unique(error)) return failure(response, 'CONFLICT');
      throw error;
    }
  });
  router.get('/teams/:id', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
      return failure(response, 'INVALID_INPUT');
    const data = await database.team.findUnique({
      where: { id: request.params.id },
      select: {
        ...teamSelect,
        memberships: { select: memberSelect, orderBy: { createdAt: 'asc' } },
        managers: { select: managerSelect, orderBy: { createdAt: 'asc' } },
      },
    });
    return data ? response.json({ data }) : failure(response, 'NOT_FOUND');
  });
  router.patch('/teams/:id', async (request, response) => {
    const parsed = teamUpdate.safeParse(request.body);
    if (!id.safeParse(request.params.id).success || !parsed.success)
      return failure(response, 'INVALID_INPUT');
    try {
      const result = await database.$transaction(async (tx) => {
        const current = await lockedTeam(tx, request.params.id);
        if (!current) return null;
        const data = await tx.team.update({
          where: { id: current.id },
          data: parsed.data,
          select: teamSelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'TEAM',
          current.id,
          'UPDATED',
          { name: current.name, description: current.description },
          { name: data.name, description: data.description },
        );
        return data;
      });
      return result
        ? response.json({ data: result })
        : failure(response, 'NOT_FOUND');
    } catch (error) {
      if (unique(error)) return failure(response, 'CONFLICT');
      throw error;
    }
  });
  for (const [action, active] of [
    ['deactivate', false],
    ['reactivate', true],
  ] as const) {
    router.post(`/teams/:id/${action}`, async (request, response) => {
      if (
        !id.safeParse(request.params.id).success ||
        !emptyBody.safeParse(request.body).success
      )
        return failure(response, 'INVALID_INPUT');
      const result = await database.$transaction(async (tx) => {
        const current = await lockedTeam(tx, request.params.id);
        if (!current) return 'NOT_FOUND';
        if (current.active === active) return 'CONFLICT';
        const data = await tx.team.update({
          where: { id: current.id },
          data: { active },
          select: teamSelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'TEAM',
          current.id,
          active ? 'REACTIVATED' : 'DEACTIVATED',
          { active: current.active },
          { active },
        );
        return data;
      });
      return typeof result === 'string'
        ? failure(response, result)
        : response.json({ data: result });
    });
  }
  router.get('/teams/:id/members', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
      return failure(response, 'INVALID_INPUT');
    const team = await database.team.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!team) return failure(response, 'NOT_FOUND');
    const data = await database.teamMembership.findMany({
      where: { teamId: team.id },
      select: memberSelect,
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
    return response.json({ data });
  });
  router.post('/teams/:id/members', async (request, response) => {
    const parsed = memberBody.safeParse(request.body);
    if (!id.safeParse(request.params.id).success || !parsed.success)
      return failure(response, 'INVALID_INPUT');
    try {
      const result = await database.$transaction(async (tx) => {
        const team = await lockedTeam(tx, request.params.id);
        if (!team) return 'NOT_FOUND';
        if (!team.active) return 'CONFLICT';
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${parsed.data.userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: parsed.data.userId },
          select: { accountStatus: true },
        });
        if (!user) return 'NOT_FOUND';
        if (user.accountStatus !== 'ACTIVE') return 'CONFLICT';
        const data = await tx.teamMembership.create({
          data: { teamId: team.id, userId: parsed.data.userId },
          select: memberSelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'TEAM',
          team.id,
          'MEMBER_ADDED',
          undefined,
          { userId: parsed.data.userId },
        );
        return data;
      });
      return typeof result === 'string'
        ? failure(response, result)
        : response.status(201).json({ data: result });
    } catch (error) {
      if (unique(error)) return failure(response, 'CONFLICT');
      throw error;
    }
  });
  router.delete('/teams/:id/members/:userId', async (request, response) => {
    if (
      !id.safeParse(request.params.id).success ||
      !id.safeParse(request.params.userId).success
    )
      return failure(response, 'INVALID_INPUT');
    const result = await database.$transaction(async (tx) => {
      const team = await lockedTeam(tx, request.params.id);
      if (!team) return 'NOT_FOUND';
      const removed = await tx.teamMembership.deleteMany({
        where: { teamId: team.id, userId: request.params.userId },
      });
      if (!removed.count) return 'NOT_FOUND';
      await audit(tx, request.authUser!.id, 'TEAM', team.id, 'MEMBER_REMOVED', {
        userId: request.params.userId,
      });
      return 'OK';
    });
    return result === 'OK'
      ? response.status(204).send()
      : failure(response, result);
  });
  router.post('/teams/:id/managers', async (request, response) => {
    const parsed = memberBody.safeParse(request.body);
    if (!id.safeParse(request.params.id).success || !parsed.success)
      return failure(response, 'INVALID_INPUT');
    try {
      const result = await database.$transaction(async (tx) => {
        const team = await lockedTeam(tx, request.params.id);
        if (!team) return 'NOT_FOUND';
        if (!team.active) return 'CONFLICT';
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${parsed.data.userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: parsed.data.userId },
          select: { role: true, accountStatus: true },
        });
        if (!user) return 'NOT_FOUND';
        if (user.role !== 'MANAGER' || user.accountStatus !== 'ACTIVE')
          return 'CONFLICT';
        const data = await tx.teamManager.create({
          data: { teamId: team.id, userId: parsed.data.userId },
          select: managerSelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'TEAM',
          team.id,
          'MANAGER_ADDED',
          undefined,
          { userId: parsed.data.userId },
        );
        return data;
      });
      return typeof result === 'string'
        ? failure(response, result)
        : response.status(201).json({ data: result });
    } catch (error) {
      if (unique(error)) return failure(response, 'CONFLICT');
      throw error;
    }
  });
  router.delete('/teams/:id/managers/:userId', async (request, response) => {
    if (
      !id.safeParse(request.params.id).success ||
      !id.safeParse(request.params.userId).success
    )
      return failure(response, 'INVALID_INPUT');
    const result = await database.$transaction(async (tx) => {
      const team = await lockedTeam(tx, request.params.id);
      if (!team) return 'NOT_FOUND';
      const removed = await tx.teamManager.deleteMany({
        where: { teamId: team.id, userId: request.params.userId },
      });
      if (!removed.count) return 'NOT_FOUND';
      await audit(
        tx,
        request.authUser!.id,
        'TEAM',
        team.id,
        'MANAGER_REMOVED',
        { userId: request.params.userId },
      );
      return 'OK';
    });
    return result === 'OK'
      ? response.status(204).send()
      : failure(response, result);
  });

  router.get('/categories', async (request, response) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return failure(response, 'INVALID_INPUT');
    const { page, pageSize, active, search } = parsed.data;
    const where: Prisma.CategoryWhereInput = {
      ...(active ? { active: active === 'true' } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await database.$transaction([
      database.category.findMany({
        where,
        select: categorySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      database.category.count({ where }),
    ]);
    return response.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });
  router.post('/categories', async (request, response) => {
    const parsed = categoryCreate.safeParse(request.body);
    if (!parsed.success) return failure(response, 'INVALID_INPUT');
    try {
      const result = await database.$transaction(async (tx) => {
        if (parsed.data.defaultTeamId) {
          const team = await lockedTeam(tx, parsed.data.defaultTeamId);
          if (!team || !team.active) return 'CONFLICT';
        }
        const data = await tx.category.create({
          data: parsed.data,
          select: categorySelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'CATEGORY',
          data.id,
          'CREATED',
          undefined,
          { name: data.name, defaultTeamId: data.defaultTeamId, active: true },
        );
        return data;
      });
      return typeof result === 'string'
        ? failure(response, result)
        : response
            .status(201)
            .location(`/admin/categories/${result.id}`)
            .json({ data: result });
    } catch (error) {
      if (unique(error)) return failure(response, 'CONFLICT');
      throw error;
    }
  });
  router.get('/categories/:id', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
      return failure(response, 'INVALID_INPUT');
    const data = await database.category.findUnique({
      where: { id: request.params.id },
      select: categorySelect,
    });
    return data ? response.json({ data }) : failure(response, 'NOT_FOUND');
  });
  router.patch('/categories/:id', async (request, response) => {
    const parsed = categoryUpdate.safeParse(request.body);
    if (!id.safeParse(request.params.id).success || !parsed.success)
      return failure(response, 'INVALID_INPUT');
    try {
      const result = await database.$transaction(async (tx) => {
        if (parsed.data.defaultTeamId) {
          const team = await lockedTeam(tx, parsed.data.defaultTeamId);
          if (!team || !team.active) return 'CONFLICT';
        }
        const current = await tx.category.findUnique({
          where: { id: request.params.id },
          select: categorySelect,
        });
        if (!current) return 'NOT_FOUND';
        const data = await tx.category.update({
          where: { id: current.id },
          data: parsed.data,
          select: categorySelect,
        });
        await audit(
          tx,
          request.authUser!.id,
          'CATEGORY',
          current.id,
          'UPDATED',
          {
            name: current.name,
            description: current.description,
            defaultTeamId: current.defaultTeamId,
          },
          {
            name: data.name,
            description: data.description,
            defaultTeamId: data.defaultTeamId,
          },
        );
        return data;
      });
      return typeof result === 'string'
        ? failure(response, result)
        : response.json({ data: result });
    } catch (error) {
      if (unique(error)) return failure(response, 'CONFLICT');
      throw error;
    }
  });
  for (const [action, active] of [
    ['deactivate', false],
    ['reactivate', true],
  ] as const) {
    router.post(`/categories/:id/${action}`, async (request, response) => {
      if (
        !id.safeParse(request.params.id).success ||
        !emptyBody.safeParse(request.body).success
      )
        return failure(response, 'INVALID_INPUT');
      const result = await database.$transaction(async (tx) => {
        const current = await tx.category.findUnique({
          where: { id: request.params.id },
          select: { id: true, active: true },
        });
        if (!current) return 'NOT_FOUND';
        if (current.active === active) return 'CONFLICT';
        const changed = await tx.category.updateMany({
          where: { id: current.id, active: current.active },
          data: { active },
        });
        if (!changed.count) return 'CONFLICT';
        await audit(
          tx,
          request.authUser!.id,
          'CATEGORY',
          current.id,
          active ? 'REACTIVATED' : 'DEACTIVATED',
          { active: current.active },
          { active },
        );
        return tx.category.findUniqueOrThrow({
          where: { id: current.id },
          select: categorySelect,
        });
      });
      return typeof result === 'string'
        ? failure(response, result)
        : response.json({ data: result });
    });
  }
  return router;
}
