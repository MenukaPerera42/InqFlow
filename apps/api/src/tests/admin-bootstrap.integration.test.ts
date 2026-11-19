import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../identity/admin-bootstrap.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  testUrl === process.env.DATABASE_URL ||
  new URL(testUrl).searchParams.get('schema') !== 'inquiry_test'
) {
  throw new Error(
    'Admin bootstrap tests require the dedicated inquiry_test schema',
  );
}
const database = new PrismaClient({ datasources: { db: { url: testUrl } } });
const prefix = `bootstrap-${crypto.randomUUID()}`;
const password = 'Strong-Admin-Password-123!';
const email = (suffix: string) => `${prefix}-${suffix}@example.test`;

beforeAll(async () => {
  await database.$connect();
});
afterEach(async () => {
  await database.user.deleteMany({ where: { email: { startsWith: prefix } } });
});
afterAll(async () => {
  await database.$disconnect();
});

describe.sequential('one-time administrator bootstrap', () => {
  it('creates an active administrator with a password hash', async () => {
    const result = await bootstrapAdmin(database, {
      email: email('first'),
      password,
    });
    const stored = await database.user.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(stored.role).toBe('ADMIN');
    expect(stored.accountStatus).toBe('ACTIVE');
    expect(stored.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true);
  });
  it('refuses a second bootstrap without changing the existing admin', async () => {
    await bootstrapAdmin(database, { email: email('one'), password });
    await expect(
      bootstrapAdmin(database, { email: email('two'), password }),
    ).rejects.toThrow('already completed');
    expect(
      await database.user.count({
        where: { role: 'ADMIN', email: { startsWith: prefix } },
      }),
    ).toBe(1);
  });
  it('rejects an existing employee email without promotion', async () => {
    const employee = await database.user.create({
      data: {
        name: 'Employee',
        email: email('employee'),
        passwordHash: 'unchanged',
        accountStatus: 'ACTIVE',
      },
    });
    await expect(
      bootstrapAdmin(database, { email: employee.email, password }),
    ).rejects.toThrow('already belongs');
    const stored = await database.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(stored.role).toBe('EMPLOYEE');
    expect(stored.passwordHash).toBe('unchanged');
  });
  it('rejects invalid input without creating an account', async () => {
    await expect(
      bootstrapAdmin(database, { email: 'bad', password }),
    ).rejects.toThrow('valid email');
    await expect(
      bootstrapAdmin(database, { email: email('weak'), password: 'weak' }),
    ).rejects.toThrow('strong password');
    expect(
      await database.user.count({ where: { email: { startsWith: prefix } } }),
    ).toBe(0);
  });
  it('serializes competing bootstrap processes so exactly one succeeds', async () => {
    const other = new PrismaClient({ datasources: { db: { url: testUrl } } });
    try {
      const results = await Promise.allSettled([
        bootstrapAdmin(database, { email: email('race-a'), password }),
        bootstrapAdmin(other, { email: email('race-b'), password }),
      ]);
      expect(results.map((item) => item.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(
        await database.user.count({
          where: { role: 'ADMIN', email: { startsWith: prefix } },
        }),
      ).toBe(1);
    } finally {
      await other.$disconnect();
    }
  });
});
