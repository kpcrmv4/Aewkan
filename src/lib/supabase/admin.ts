import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { SUPABASE_URL, serverEnv } from '@/lib/env';

/**
 * SERVER ONLY — bypasses RLS. Used by public routes after they have verified
 * a job-link token, by webhooks, and by first-run setup / invite acceptance.
 * Throws MissingEnvError('SUPABASE_SECRET_KEY') when the key is not set.
 */
export function getSupabaseAdmin() {
  return createClient<Database>(SUPABASE_URL, serverEnv('SUPABASE_SECRET_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
