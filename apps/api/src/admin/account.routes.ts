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
});
const idSchema = z.uuid();
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
    const { page, pageSize, status } = parsed.data;
    const where = status ? { accountStatus: status } : {};
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
      select: userSelect,
    });
    if (!data) return sendError(response, 404, 'NOT_FOUND', 'User not found.');
    return response.json({ data });
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
