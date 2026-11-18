import { PrismaClient } from '@prisma/client';
import session from 'express-session';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AuthConfig } from '../config/auth.js';

const config: AuthConfig = {
  databaseUrl: 'postgresql://unused:unused@localhost:5432/unused',
  sessionSecrets: ['a-health-test-secret-with-at-least-32-characters'],
  frontendOrigins: ['http://localhost:3000'],
  production: false,
};

describe('GET /health', () => {
  it('returns an OK response without external services', async () => {
    const response = await request(
      createApp(config, new PrismaClient(), new session.MemoryStore()),
    ).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
