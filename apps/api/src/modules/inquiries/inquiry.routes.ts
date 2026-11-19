import { Router, type Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { AuthConfig } from '../../config/auth.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { sendError } from '../../auth/errors.js';
import {
  createInquirySchema,
  inquiryIdSchema,
  listInquiriesSchema,
  updateStatusSchema,
} from './inquiry.schemas.js';
import {
  createInquiry,
  getInquiry,
  listInquiries,
  updateInquiryStatus,
} from './inquiry.service.js';

function ownerId(request: Request): string {
  if (!request.authUser) throw new Error('Authenticated user was not resolved');
  return request.authUser.id;
}

function readScope(request: Request): Prisma.InquiryWhereInput {
  const user = request.authUser!;
  if (user.role === 'ADMIN') return {};
  if (user.role === 'MANAGER')
    return {
      OR: [
        { createdById: user.id },
        { team: { active: true, managers: { some: { userId: user.id } } } },
      ],
    };
  return { createdById: user.id };
}

export function createInquiryRouter(
  database: PrismaClient,
  config: AuthConfig,
) {
  const router = Router();
  router.use(requireAuth(database, config));

  router.post('/', async (request, response) => {
    const parsed = createInquirySchema.safeParse(request.body);
    if (!parsed.success)
      return sendError(
        response,
        400,
        'INVALID_INPUT',
        'Invalid inquiry information.',
      );
    const created = await createInquiry(
      database,
      ownerId(request),
      parsed.data,
    );
    return response
      .status(201)
      .location(`/inquiries/${created.id}`)
      .json({ data: created });
  });

  router.get('/', async (request, response) => {
    const parsed = listInquiriesSchema.safeParse(request.query);
    if (!parsed.success)
      return sendError(
        response,
        400,
        'INVALID_INPUT',
        'Invalid inquiry filters.',
      );
    const result = await listInquiries(
      database,
      readScope(request),
      parsed.data,
    );
    return response.status(200).json(result);
  });

  router.get('/:id', async (request, response) => {
    const parsedId = inquiryIdSchema.safeParse(request.params.id);
    if (!parsedId.success)
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid inquiry ID.');
    const inquiry = await getInquiry(
      database,
      readScope(request),
      parsedId.data,
    );
    if (!inquiry)
      return sendError(response, 404, 'NOT_FOUND', 'Inquiry not found.');
    return response.status(200).json({ data: inquiry });
  });

  router.patch('/:id/status', async (request, response) => {
    const parsedId = inquiryIdSchema.safeParse(request.params.id);
    const parsedBody = updateStatusSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      return sendError(
        response,
        400,
        'INVALID_INPUT',
        'Invalid status update.',
      );
    }
    const result = await updateInquiryStatus(
      database,
      request.authUser?.role === 'ADMIN' ? null : ownerId(request),
      parsedId.data,
      parsedBody.data,
    );
    if (result.ok) return response.status(200).json({ data: result.data });
    if (result.error === 'NOT_FOUND')
      return sendError(response, 404, 'NOT_FOUND', 'Inquiry not found.');
    if (result.error === 'VERSION_CONFLICT') {
      return sendError(
        response,
        409,
        'VERSION_CONFLICT',
        'This inquiry has changed. Refresh and try again.',
      );
    }
    return sendError(
      response,
      409,
      'INVALID_STATUS_TRANSITION',
      'This status transition is not allowed.',
    );
  });

  return router;
}
