import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const inputSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  password: z
    .string()
    .min(16)
    .max(1024)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export type BootstrapInput = { email: string; password: string };

export async function bootstrapAdmin(
  database: PrismaClient,
  input: BootstrapInput,
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new Error('A valid email and strong password are required.');
  const hash = await bcrypt.hash(parsed.data.password, 12);
  return database.$transaction(async (tx) => {
    // A transaction-scoped PostgreSQL lock serializes independent CLI processes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(627171, 1)::text`;
    if (await tx.user.count({ where: { role: 'ADMIN' } })) {
      throw new Error('Administrator bootstrap has already completed.');
    }
    if (await tx.user.findUnique({ where: { email: parsed.data.email } })) {
      throw new Error('This email already belongs to an existing account.');
    }
    return tx.user.create({
      data: {
        email: parsed.data.email,
        name: 'Administrator',
        passwordHash: hash,
        role: 'ADMIN',
        accountStatus: 'ACTIVE',
      },
      select: { id: true },
    });
  });
}
