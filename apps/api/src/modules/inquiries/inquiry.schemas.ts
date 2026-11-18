import { z } from 'zod';

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const positiveQueryInteger = (maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe().max(maximum));

export const createInquirySchema = z.strictObject({
  customerName: requiredText(120),
  customerContact: requiredText(200),
  subject: requiredText(160),
  description: requiredText(2000),
});

export const listInquiriesSchema = z.strictObject({
  page: positiveQueryInteger(1_000_000).default(1),
  pageSize: positiveQueryInteger(50).default(10),
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const inquiryIdSchema = z.uuid();

export const updateStatusSchema = z.strictObject({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']),
  version: z.number().int().positive().safe(),
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type ListInquiriesInput = z.infer<typeof listInquiriesSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
