import { Prisma, type InquiryStatus, type PrismaClient } from '@prisma/client';
import type {
  CreateInquiryInput,
  ListInquiriesInput,
  UpdateStatusInput,
} from './inquiry.schemas.js';

export const inquirySelect = {
  id: true,
  customerName: true,
  customerContact: true,
  subject: true,
  description: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InquirySelect;

const nextStatus: Record<InquiryStatus, InquiryStatus | null> = {
  NEW: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
  RESOLVED: null,
};

type StatusError =
  'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_STATUS_TRANSITION';

export async function createInquiry(
  database: PrismaClient,
  ownerId: string,
  input: CreateInquiryInput,
) {
  return database.inquiry.create({
    data: { ...input, createdById: ownerId },
    select: inquirySelect,
  });
}

export async function listInquiries(
  database: PrismaClient,
  scope: Prisma.InquiryWhereInput,
  input: ListInquiriesInput,
) {
  const where: Prisma.InquiryWhereInput = {
    ...scope,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { customerName: { contains: input.search, mode: 'insensitive' } },
            { subject: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [data, total] = await database.$transaction([
    database.inquiry.findMany({
      where,
      select: inquirySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    database.inquiry.count({ where }),
  ]);
  return {
    data,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function getInquiry(
  database: PrismaClient,
  scope: Prisma.InquiryWhereInput,
  id: string,
) {
  return database.inquiry.findFirst({
    where: { id, ...scope },
    select: inquirySelect,
  });
}

export async function updateInquiryStatus(
  database: PrismaClient,
  ownerId: string | null,
  id: string,
  input: UpdateStatusInput,
): Promise<
  | {
      ok: true;
      data: Prisma.InquiryGetPayload<{ select: typeof inquirySelect }>;
    }
  | { ok: false; error: StatusError }
> {
  const current = await getInquiry(
    database,
    ownerId ? { createdById: ownerId } : {},
    id,
  );
  if (!current) return { ok: false, error: 'NOT_FOUND' };
  if (current.version !== input.version)
    return { ok: false, error: 'VERSION_CONFLICT' };
  if (nextStatus[current.status] !== input.status) {
    return { ok: false, error: 'INVALID_STATUS_TRANSITION' };
  }

  const updated = await database.inquiry.updateManyAndReturn({
    where: {
      id,
      ...(ownerId ? { createdById: ownerId } : {}),
      version: input.version,
      status: current.status,
    },
    data: { status: input.status, version: { increment: 1 } },
    select: inquirySelect,
  });
  if (updated[0]) return { ok: true, data: updated[0] };

  // Another request changed or removed the owned row after the initial read.
  const latest = await getInquiry(
    database,
    ownerId ? { createdById: ownerId } : {},
    id,
  );
  if (!latest) return { ok: false, error: 'NOT_FOUND' };
  if (latest.version !== input.version)
    return { ok: false, error: 'VERSION_CONFLICT' };
  return { ok: false, error: 'INVALID_STATUS_TRANSITION' };
}
