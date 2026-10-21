import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * Job links and staff invites carry a random 32-byte token in the URL. Hashing
 * happens only in the database (`public.token_hash`, pepper in Vault — R-011),
 * so the app never holds the pepper and every environment agrees on it.
 *   issue:   rpc('issue_job_link', { p_booking, p_audience, p_token })
 *   resolve: rpc('get_job_view', { p_token }) and the job_* action functions
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** cheap shape check before touching the database (43 chars for 32 bytes) */
export const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{40,60}$/.test(t);
