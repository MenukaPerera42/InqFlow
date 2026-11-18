import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function getDatabase(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database access');
  }
  client ??= new PrismaClient();
  return client;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
