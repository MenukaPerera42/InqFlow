import { z } from 'zod';

export const loginSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});
