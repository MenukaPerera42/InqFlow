import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { disconnectDatabase, getDatabase } from './client.js';

export const staffAccounts = [
  { name: 'Amina Perera', email: 'amina@example.test' },
  { name: 'Ravi Silva', email: 'ravi@example.test' },
] as const;

export async function seedStaff(
  database: PrismaClient,
  password: string,
): Promise<void> {
  if (password.length < 12) {
    throw new Error('SEED_STAFF_PASSWORD must contain at least 12 characters');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  for (const account of staffAccounts) {
    await database.user.upsert({
      where: { email: account.email },
      create: {
        ...account,
        passwordHash,
        role: 'EMPLOYEE',
        accountStatus: 'ACTIVE',
      },
      update: {},
    });
  }
}

if (require.main === module) {
  seedStaff(getDatabase(), process.env.SEED_STAFF_PASSWORD ?? '')
    .then(() => console.info('Development staff accounts are ready.'))
    .catch((error: unknown) => {
      console.error('Seeding failed:', error);
      process.exitCode = 1;
    })
    .finally(disconnectDatabase);
}
