import { Router } from 'express';
import { z } from 'zod';
import type {
  PrismaClient,
  AccountAction,
  AccountStatus,
} from '@prisma/client';
import type { AuthConfig } from '../config/auth.js';
import { requireAuth } from '../middleware/require-auth.js';
import { sendError } from '../auth/errors.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  accountStatus: true,
  createdAt: true,
} as const;
const listSchema = z.strictObject({
  page: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(100000))
    .default(1),
  pageSize: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(50))
    .default(10),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
const idSchema = z.uuid();
const roleSchema = z.strictObject({
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']),
});
const actions: Record<
  string,
  { from: AccountStatus; to: AccountStatus; audit: AccountAction }
> = {
  approve: { from: 'PENDING', to: 'ACTIVE', audit: 'APPROVED' },
  reject: { from: 'PENDING', to: 'REJECTED', audit: 'REJECTED' },
  suspend: { from: 'ACTIVE', to: 'SUSPENDED', audit: 'SUSPENDED' },
  reactivate: { from: 'SUSPENDED', to: 'ACTIVE', audit: 'REACTIVATED' },
};

export function createAccountRouter(
  database: PrismaClient,
  config: AuthConfig,
) {
  const router = Router();
  router.use(requireAuth(database, config));
  router.use((request, response, next) => {
    if (request.authUser?.role !== 'ADMIN')
      return sendError(
        response,
        403,
        'FORBIDDEN',
        'Administrator access required.',
      );
    next();
  });
  router.get('/users', async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid user filters.');
    const { page, pageSize, status, role, search } = parsed.data;
    const where = {
      ...(status ? { accountStatus: status } : {}),
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await database.$transaction([
      database.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      database.user.count({ where }),
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
  router.get('/users/pending', async (request, response) => {
    const parsed = listSchema.safeParse({
      ...request.query,
      status: 'PENDING',
    });
    if (!parsed.success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid user filters.');
    const { page, pageSize } = parsed.data;
    const where = { accountStatus: 'PENDING' as const };
    const [data, total] = await database.$transaction([
      database.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      database.user.count({ where }),
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
  router.get('/users/:id', async (request, response) => {
    if (!idSchema.safeParse(request.params.id).success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid user ID.');
    const data = await database.user.findUnique({
      where: { id: request.params.id },
      select: {
        ...userSelect,
        teamMemberships: {
          select: {
            teamId: true,
            createdAt: true,
            team: { select: { name: true, active: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        managedTeams: {
          select: {
            teamId: true,
            createdAt: true,
            team: { select: { name: true, active: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!data) return sendError(response, 404, 'NOT_FOUND', 'User not found.');
    return response.json({ data });
  });
  router.patch('/users/:id/role', async (request, response) => {
    const id = request.params.id;
    const parsed = roleSchema.safeParse(request.body);
    if (!idSchema.safeParse(id).success || !parsed.success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid role change.');
    if (id === request.authUser!.id)
      return sendError(
        response,
        409,
        'ACCOUNT_CONFLICT',
        'Cannot change your own role.',
      );
    const result = await database.$transaction(async (tx) => {
      // All admin demotions share this lock, so two requests cannot both remove
      // what each observed as the last active administrator.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(736291, 3)::text`;
      const actor = await tx.user.findUnique({
        where: { id: request.authUser!.id },
        select: { role: true, accountStatus: true },
      });
      if (actor?.role !== 'ADMIN' || actor.accountStatus !== 'ACTIVE')
        return { error: 'FORBIDDEN' as const };
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id },
        select: { role: true, accountStatus: true },
      });
      if (!current) return { error: 'NOT_FOUND' as const };
      if (
        current.accountStatus !== 'ACTIVE' ||
        current.role === parsed.data.role
      )
        return { error: 'ACCOUNT_CONFLICT' as const };
      if (
        current.role === 'ADMIN' &&
        (await tx.user.count({
          where: { role: 'ADMIN', accountStatus: 'ACTIVE' },
        })) <= 1
      )
        return { error: 'ACCOUNT_CONFLICT' as const };
      const changed = await tx.user.updateMany({
        where: { id, role: current.role, accountStatus: 'ACTIVE' },
        data: { role: parsed.data.role },
      });
      if (changed.count !== 1) return { error: 'ACCOUNT_CONFLICT' as const };
      if (current.role === 'MANAGER')
        await tx.teamManager.deleteMany({ where: { userId: id } });
      await tx.managementAudit.create({
        data: {
          actorId: request.authUser!.id,
          targetType: 'USER',
          targetId: id,
          action: 'ROLE_CHANGED',
          before: { role: current.role },
          after: { role: parsed.data.role },
        },
      });
      await tx.$executeRaw`DELETE FROM "staff_sessions" WHERE sess::jsonb->>'userId' = ${id}`;
      const data = await tx.user.findUniqueOrThrow({
        where: { id },
        select: userSelect,
      });
      return { data };
    });
    if ('error' in result) {
      if (result.error === 'NOT_FOUND')
        return sendError(response, 404, 'NOT_FOUND', 'User not found.');
      if (result.error === 'FORBIDDEN')
        return sendError(
          response,
          403,
          'FORBIDDEN',
          'Administrator access required.',
        );
      return sendError(
        response,
        409,
        'ACCOUNT_CONFLICT',
        'Role change conflicts with current account state.',
      );
    }
    return response.json({ data: result.data });
  });
  for (const [name, action] of Object.entries(actions)) {
    router.post(`/users/:id/${name}`, async (request, response) => {
      if (
        !idSchema.safeParse(request.params.id).success ||
        Object.keys(request.body ?? {}).length
      )
        return sendError(
          response,
          400,
          'INVALID_INPUT',
          'Invalid account action.',
        );
      const id = request.params.id;
      if (id === request.authUser!.id)
        return sendError(
          response,
          409,
          'ACCOUNT_CONFLICT',
          'Cannot change your own account state.',
        );
      const result = await database.$transaction(async (tx) => {
        const current = await tx.user.findUnique({
          where: { id },
          select: { role: true, accountStatus: true },
        });
        if (!current) return { error: 'NOT_FOUND' as const };
        if (current.role === 'ADMIN')
          return { error: 'ACCOUNT_CONFLICT' as const };
        if (current.accountStatus !== action.from)
          return { error: 'ACCOUNT_CONFLICT' as const };
        if (
          (name === 'approve' || name === 'reject') &&
          current.role !== 'EMPLOYEE'
        )
          return { error: 'ACCOUNT_CONFLICT' as const };
        const changed = await tx.user.updateMany({
          where: { id, accountStatus: action.from, role: current.role },
          data: { accountStatus: action.to },
        });
        if (changed.count !== 1) return { error: 'ACCOUNT_CONFLICT' as const };
        await tx.accountAudit.create({
          data: {
            actorId: request.authUser!.id,
            targetId: id,
            action: action.audit,
            previousStatus: action.from,
            nextStatus: action.to,
          },
        });
        const data = await tx.user.findUniqueOrThrow({
          where: { id },
          select: userSelect,
        });
        return { data };
      });
      if ('error' in result)
        return result.error === 'NOT_FOUND'
          ? sendError(response, 404, 'NOT_FOUND', 'User not found.')
          : sendError(
              response,
              409,
              'ACCOUNT_CONFLICT',
              'Account state has changed or this action is not allowed.',
            );
      return response.json({ data: result.data });
    });
  }
  return router;
}
