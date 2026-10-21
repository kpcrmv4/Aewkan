/**
 * Environment access in one place. Public values are inlined at build time
 * (NEXT_PUBLIC_*); server secrets are read lazily so a missing secret fails the
 * one route that needs it, with a message that names the key, instead of
 * failing the whole build.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100';
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export class MissingEnvError extends Error {
  readonly code = 'missing_env';
  constructor(readonly key: string) {
    super(`${key} is not configured`);
  }
}

export function serverEnv(key: 'SUPABASE_SECRET_KEY' | 'LINK_TOKEN_PEPPER' | 'CRON_SECRET' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'): string {
  const v = process.env[key];
  if (!v) throw new MissingEnvError(key);
  return v;
}

export const hasServerEnv = (key: string) => Boolean(process.env[key]);
