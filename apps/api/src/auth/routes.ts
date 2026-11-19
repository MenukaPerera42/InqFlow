import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { rateLimit } from 'express-rate-limit';
import { loginSchema, registrationSchema } from './validation.js';
import { sendError } from './errors.js';
import { requireAuth } from '../middleware/require-auth.js';
import { clearSessionCookie } from './session.js';
import type { AuthConfig } from '../config/auth.js';

function regenerate(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) =>
    request.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
}

function save(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) =>
    request.session.save((error) => (error ? reject(error) : resolve())),
  );
}

function destroy(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) =>
    request.session.destroy((error) => (error ? reject(error) : resolve())),
  );
}

export function createAuthRouter(database: PrismaClient, config: AuthConfig) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) =>
      sendError(
        response,
        429,
        'RATE_LIMITED',
        'Too many login attempts. Try again later.',
      ),
  });

  const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) =>
      sendError(
        response,
        429,
        'RATE_LIMITED',
        'Too many registration attempts. Try again later.',
      ),
  });

  router.post('/register', registrationLimiter, async (request, response) => {
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success)
      return sendError(
        response,
        400,
        'INVALID_INPUT',
        'Invalid registration information.',
      );
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    try {
      await database.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
          role: 'EMPLOYEE',
          accountStatus: 'PENDING',
        },
      });
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ))
        throw error;
    }
    return response.status(201).json({
      message: 'Registration submitted for administrator review.',
      accountStatus: 'PENDING',
    });
  });

  router.post('/login', loginLimiter, async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        response,
        400,
        'INVALID_INPUT',
        'A valid email and password are required.',
      );
    }
    const user = await database.user.findUnique({
      where: { email: parsed.data.email },
    });
    const valid = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;
    if (!user || !valid || user.accountStatus !== 'ACTIVE') {
      return sendError(
        response,
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      );
    }
    await regenerate(request);
    request.session.userId = user.id;
    await save(request);
    return response
      .status(200)
      .json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  router.get('/me', requireAuth(database, config), (request, response) => {
    const user = request.authUser!;
    response
      .status(200)
      .json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  router.post(
    '/logout',
    requireAuth(database, config),
    async (request, response) => {
      await destroy(request);
      clearSessionCookie(response, config);
      response.status(204).end();
    },
  );

  return router;
}
