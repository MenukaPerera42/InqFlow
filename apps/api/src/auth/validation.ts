import { z } from 'zod';

export const loginSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});

export const registrationSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z
    .string()
    .min(16)
    .max(1024)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});
