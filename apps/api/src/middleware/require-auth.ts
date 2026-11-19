import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { sendError } from '../auth/errors.js';
import { clearSessionCookie } from '../auth/session.js';
import type { AuthConfig } from '../config/auth.js';
import { z } from 'zod';

export function requireAuth(database: PrismaClient, config: AuthConfig) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const userId = request.session.userId;
    if (!userId || !z.uuid().safeParse(userId).success) {
      sendError(response, 401, 'UNAUTHORIZED', 'Authentication required.');
      return;
    }
    try {
      const user = await database.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountStatus: true,
        },
      });
      if (!user || user.accountStatus !== 'ACTIVE') {
        request.session.destroy((error) => {
          if (error) return next(error);
          clearSessionCookie(response, config);
          sendError(response, 401, 'UNAUTHORIZED', 'Authentication required.');
        });
        return;
      }
      request.authUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: {
      id: string;
      name: string;
      email: string;
      role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
    };
  }
}
