import { Router } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuthConfig } from '../../config/auth.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { sendError } from '../../auth/errors.js';

const teamSelect = {
  id: true,
  name: true,
  description: true,
  active: true,
} as const;
const id = z.uuid();
const list = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export function createTeamReadRouter(
  database: PrismaClient,
  config: AuthConfig,
) {
  const router = Router();
  router.use(requireAuth(database, config));
  router.get('/', async (request, response) => {
    const parsed = list.safeParse(request.query);
    if (!parsed.success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid team filters.');
    const user = request.authUser!;
    const where: Prisma.TeamWhereInput =
      user.role === 'ADMIN'
        ? {}
        : user.role === 'MANAGER'
          ? { active: true, managers: { some: { userId: user.id } } }
          : { active: true, memberships: { some: { userId: user.id } } };
    const { page, pageSize } = parsed.data;
    const [data, total] = await database.$transaction([
      database.team.findMany({
        where,
        select: teamSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
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
  router.get('/:id', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid team ID.');
    const user = request.authUser!;
    const where: Prisma.TeamWhereInput = {
      id: request.params.id,
      ...(user.role === 'ADMIN'
        ? {}
        : user.role === 'MANAGER'
          ? { active: true, managers: { some: { userId: user.id } } }
          : { active: true, memberships: { some: { userId: user.id } } }),
    };
    const data = await database.team.findFirst({ where, select: teamSelect });
    return data
      ? response.json({ data })
      : sendError(response, 404, 'NOT_FOUND', 'Team not found.');
  });
  router.get('/:id/members', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid team ID.');
    const user = request.authUser!;
    const team = await database.team.findFirst({
      where: {
        id: request.params.id,
        ...(user.role === 'ADMIN'
          ? {}
          : { active: true, managers: { some: { userId: user.id } } }),
      },
      select: { id: true },
    });
    if (!team) return sendError(response, 404, 'NOT_FOUND', 'Team not found.');
    const data = await database.teamMembership.findMany({
      where: { teamId: team.id },
      select: {
        user: { select: { id: true, name: true, role: true } },
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
    return response.json({ data });
  });
  return router;
}
