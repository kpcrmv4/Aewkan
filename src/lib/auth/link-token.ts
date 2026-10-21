import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Job links and staff invites carry a random 32-byte token in the URL; the
 * database stores only sha256(pepper:token) (RULINGS R-006). A leaked table
 * dump therefore cannot be turned back into working links.
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Pepper: LINK_TOKEN_PEPPER when set, otherwise derived from the secret key so
 * it is identical in every environment that holds that one secret (a pepper
 * generated per machine would break every existing link — R-009).
 */
function pepper(): string {
  const explicit = process.env.LINK_TOKEN_PEPPER;
  if (explicit) return explicit;
  return createHash('sha256').update(`aewkan-link-pepper:${serverEnv('SUPABASE_SECRET_KEY')}`).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(`${pepper()}:${token}`).digest('hex');
}

export function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** cheap shape check before touching the database */
export const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{40,60}$/.test(t);
