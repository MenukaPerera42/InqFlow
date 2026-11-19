import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedStaff, staffAccounts } from '../db/seed.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  new URL(testUrl).searchParams.get('schema') !== 'inquiry_test'
) {
  throw new Error(
    'Database integration tests require TEST_DATABASE_URL with schema=inquiry_test',
  );
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    'Database integration tests cannot use the development schema',
  );
}

const database = new PrismaClient({ datasources: { db: { url: testUrl } } });
const prefix = `integration-${crypto.randomUUID()}`;
const createdEmails: string[] = [];

async function createUser(suffix: string) {
  const email = `${prefix}-${suffix}@example.test`;
  const user = await database.user.create({
    data: {
      name: 'Integration Staff',
      email,
      passwordHash: bcrypt.hashSync('integration-password-123', 12),
    },
  });
  createdEmails.push(email);
  return user;
}

beforeAll(async () => {
  await database.$connect();
});

afterAll(async () => {
  await database.inquiry.deleteMany({
    where: { createdBy: { email: { in: createdEmails } } },
  });
  await database.user.deleteMany({ where: { email: { in: createdEmails } } });
  await database.$disconnect();
});

describe('database constraints', () => {
  it('persists team, category, assignment, comment, event, and notification links', async () => {
    const user = await createUser('v2-relations');
    const team = await database.team.create({
      data: { name: `${prefix}-team` },
    });
    const category = await database.category.create({
      data: { name: `${prefix}-category` },
    });
    try {
      await database.teamMembership.create({
        data: { teamId: team.id, userId: user.id },
      });
      await expect(
        database.teamMembership.create({
          data: { teamId: team.id, userId: user.id },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const inquiry = await database.inquiry.create({
        data: {
          customerName: 'Fictional Customer',
          customerContact: 'customer@example.test',
          subject: 'V2 relation check',
          description: 'Persistence only',
          createdById: user.id,
          assignedToId: user.id,
          teamId: team.id,
          categoryId: category.id,
        },
      });
      try {
        expect(inquiry.priority).toBe('MEDIUM');
        await database.assignmentHistory.create({
          data: {
            inquiryId: inquiry.id,
            actorId: user.id,
            assigneeId: user.id,
          },
        });
        await database.ticketComment.create({
          data: {
            inquiryId: inquiry.id,
            authorId: user.id,
            body: 'Test comment',
          },
        });
        await database.ticketEvent.create({
          data: { inquiryId: inquiry.id, actorId: user.id, type: 'TEST_EVENT' },
        });
        await database.notification.create({
          data: {
            inquiryId: inquiry.id,
            recipientId: user.id,
            type: 'TEST',
            message: 'Test notice',
          },
        });
        expect(
          (
            await database.inquiry.findUniqueOrThrow({
              where: { id: inquiry.id },
              include: {
                assignmentHistory: true,
                comments: true,
                events: true,
                notifications: true,
              },
            })
          ).comments,
        ).toHaveLength(1);
        expect(
          await database.notification.count({
            where: { recipientId: user.id },
          }),
        ).toBe(1);
      } finally {
        await database.notification.deleteMany({
          where: { inquiryId: inquiry.id },
        });
        await database.ticketEvent.deleteMany({
          where: { inquiryId: inquiry.id },
        });
        await database.ticketComment.deleteMany({
          where: { inquiryId: inquiry.id },
        });
        await database.assignmentHistory.deleteMany({
          where: { inquiryId: inquiry.id },
        });
        await database.inquiry.delete({ where: { id: inquiry.id } });
      }
    } finally {
      await database.teamMembership.deleteMany({ where: { teamId: team.id } });
      await database.category.delete({ where: { id: category.id } });
      await database.team.delete({ where: { id: team.id } });
    }
  });
  it('rejects duplicate user email', async () => {
    const user = await createUser('unique');
    await expect(
      database.user.create({
        data: {
          name: 'Duplicate',
          email: user.email,
          passwordHash: bcrypt.hashSync('integration-password-123', 12),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('persists inquiry ownership and defaults', async () => {
    const user = await createUser('owner');
    const inquiry = await database.inquiry.create({
      data: {
        customerName: 'Fictional Customer',
        customerContact: 'customer@example.test',
        subject: 'Service question',
        description: 'A short example inquiry.',
        createdById: user.id,
      },
      include: { createdBy: true },
    });
    expect(inquiry.createdBy.id).toBe(user.id);
    expect(inquiry.status).toBe('NEW');
    expect(inquiry.version).toBe(1);
    expect(inquiry.createdAt).toBeInstanceOf(Date);
    expect(inquiry.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects an unknown owner', async () => {
    await expect(
      database.inquiry.create({
        data: {
          customerName: 'Fictional Customer',
          customerContact: 'customer@example.test',
          subject: 'Service question',
          description: 'A short example inquiry.',
          createdById: crypto.randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('seeds staff idempotently without replacing existing hashes', async () => {
    await seedStaff(database, 'development-password-123');
    const first = await database.user.findMany({
      where: { email: { in: staffAccounts.map((account) => account.email) } },
    });
    await seedStaff(database, 'a-different-password-123');
    const second = await database.user.findMany({
      where: { email: { in: staffAccounts.map((account) => account.email) } },
    });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(second.map((user) => user.passwordHash)).toEqual(
      first.map((user) => user.passwordHash),
    );
    createdEmails.push(...staffAccounts.map((account) => account.email));
  });
});
