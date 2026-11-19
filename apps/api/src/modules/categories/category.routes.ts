import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { AuthConfig } from '../../config/auth.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { sendError } from '../../auth/errors.js';

const id = z.uuid();
const select = { id: true, name: true, description: true } as const;
const list = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export function createCategoryReadRouter(
  database: PrismaClient,
  config: AuthConfig,
) {
  const router = Router();
  router.use(requireAuth(database, config));
  router.get('/', async (request, response) => {
    const parsed = list.safeParse(request.query);
    if (!parsed.success)
      return sendError(
        response,
        400,
        'INVALID_INPUT',
        'Invalid category filters.',
      );
    const { page, pageSize } = parsed.data;
    const [data, total] = await database.$transaction([
      database.category.findMany({
        where: { active: true },
        select,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      database.category.count({ where: { active: true } }),
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
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid category ID.');
    const data = await database.category.findFirst({
      where: { id: request.params.id, active: true },
      select,
    });
    return data
      ? response.json({ data })
      : sendError(response, 404, 'NOT_FOUND', 'Category not found.');
  });
  return router;
}
