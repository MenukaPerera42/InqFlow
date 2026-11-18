import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import type { AuthConfig } from '../config/auth.js';
import { sendError } from '../auth/errors.js';

export function browserCors(config: AuthConfig) {
  return cors({
    origin: (origin, callback) =>
      callback(
        null,
        origin !== undefined && config.frontendOrigins.includes(origin),
      ),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });
}

export function requireApprovedOrigin(config: AuthConfig) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    const origin = request.get('Origin');
    if (!origin || !config.frontendOrigins.includes(origin)) {
      sendError(
        response,
        403,
        'INVALID_ORIGIN',
        'Request origin is not allowed.',
      );
      return;
    }
    next();
  };
}
