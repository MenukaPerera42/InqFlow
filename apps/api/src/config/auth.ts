import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.url().startsWith('postgresql://'),
  SESSION_SECRETS: z.string().min(32),
  FRONTEND_ORIGINS: z.string().min(1),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export interface AuthConfig {
  databaseUrl: string;
  sessionSecrets: string[];
  frontendOrigins: string[];
  production: boolean;
}

export function readAuthConfig(environment: NodeJS.ProcessEnv): AuthConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(
      'DATABASE_URL, SESSION_SECRETS, and FRONTEND_ORIGINS must be configured correctly',
    );
  }
  const sessionSecrets = parsed.data.SESSION_SECRETS.split(',').map((secret) =>
    secret.trim(),
  );
  if (
    sessionSecrets.some(
      (secret) => secret.length < 32 || secret.includes('replace_with'),
    )
  ) {
    throw new Error(
      'Each SESSION_SECRETS entry must be a non-placeholder secret of at least 32 characters',
    );
  }
  const frontendOrigins = parsed.data.FRONTEND_ORIGINS.split(',').map(
    (origin) => origin.trim(),
  );
  for (const origin of frontendOrigins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      (parsed.data.NODE_ENV === 'production' && url.protocol !== 'https:')
    ) {
      throw new Error(
        'FRONTEND_ORIGINS must contain exact origins and use HTTPS in production',
      );
    }
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    sessionSecrets,
    frontendOrigins,
    production: parsed.data.NODE_ENV === 'production',
  };
}
