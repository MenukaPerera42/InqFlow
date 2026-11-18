import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import type { Response } from 'express';
import { Pool } from 'pg';
import type { AuthConfig } from '../config/auth.js';

export const sessionCookieName = 'inquiry.sid';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;

export function createSessionStore(config: AuthConfig) {
  const url = new URL(config.databaseUrl);
  const schemaName = url.searchParams.get('schema') || 'public';
  url.searchParams.delete('schema');
  const pool = new Pool({ connectionString: url.toString(), max: 5 });
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    pool,
    schemaName,
    tableName: 'staff_sessions',
    createTableIfMissing: true,
    disableTouch: true,
    errorLog: () => console.error('Session store background error'),
  });
  return { store, pool };
}

export function createSessionMiddleware(
  config: AuthConfig,
  store: session.Store,
) {
  return session({
    name: sessionCookieName,
    secret: config.sessionSecrets,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      maxAge: sessionLifetimeMs,
      path: '/',
    },
  });
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export function clearSessionCookie(
  response: Response,
  config: AuthConfig,
): void {
  response.clearCookie(sessionCookieName, {
    path: '/',
    sameSite: 'lax',
    secure: config.production,
    httpOnly: true,
  });
}
