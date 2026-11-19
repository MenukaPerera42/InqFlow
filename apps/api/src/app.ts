import express from 'express';
import session from 'express-session';
import type { PrismaClient } from '@prisma/client';
import type { AuthConfig } from './config/auth.js';
import { createAuthRouter } from './auth/routes.js';
import { createSessionMiddleware } from './auth/session.js';
import { sendError } from './auth/errors.js';
import { createInquiryRouter } from './modules/inquiries/inquiry.routes.js';
import { createAccountRouter } from './admin/account.routes.js';
import { createManagementRouter } from './admin/management.routes.js';
import { createTeamReadRouter } from './modules/teams/team.routes.js';
import { createCategoryReadRouter } from './modules/categories/category.routes.js';
import {
  browserCors,
  requireApprovedOrigin,
} from './middleware/browser-security.js';

export function createApp(
  config: AuthConfig,
  database: PrismaClient,
  store: session.Store,
) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  app.use(browserCors(config));
  app.use(requireApprovedOrigin(config));
  app.use(express.json({ limit: '16kb' }));
  app.use(createSessionMiddleware(config, store));
  app.use('/auth', createAuthRouter(database, config));
  app.use('/admin', createAccountRouter(database, config));
  app.use('/admin', createManagementRouter(database, config));
  app.use('/teams', createTeamReadRouter(database, config));
  app.use('/categories', createCategoryReadRouter(database, config));
  app.use('/inquiries', createInquiryRouter(database, config));
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (
        error instanceof SyntaxError &&
        'status' in error &&
        error.status === 400
      ) {
        sendError(response, 400, 'INVALID_JSON', 'Malformed JSON request.');
        return;
      }
      if (
        error instanceof Error &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        sendError(
          response,
          413,
          'PAYLOAD_TOO_LARGE',
          'Request body is too large.',
        );
        return;
      }
      console.error('API request failed');
      sendError(
        response,
        500,
        'INTERNAL_ERROR',
        'An unexpected error occurred.',
      );
    },
  );
  return app;
}
