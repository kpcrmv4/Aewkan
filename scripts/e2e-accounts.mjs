// Provision the two E2E test accounts in a fresh container and record their
// credentials in .env.local (gitignored). Passwords are generated here and never printed.
//   node scripts/e2e-accounts.mjs
// - E2E_STAFF_*   e2e-staff@aewkan.test — existing staff row with role e2e_all (password reset)
// - E2E_LIMITED_* e2e-limited@aewkan.test — confirmed auth account, not active staff
// Needs SUPABASE_SECRET_KEY in the environment. Uses the Auth admin API, never SQL on auth.users.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const FILE = '.env.local';
try {
  process.loadEnvFile(FILE);
} catch {
  /* init-env not run yet: the URL check below says so */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (url !== 'https://kgjsycellzuiumudzdxl.supabase.co') throw new Error('NEXT_PUBLIC_SUPABASE_URL is not the aewkan project — run npm run env:init');
if (!key) throw new Error('SUPABASE_SECRET_KEY missing from the environment');

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit || data.users.length < 200) return hit ?? null;
  }
  return null;
}

async function ensureUser(email, fullName) {
  const password = randomBytes(18).toString('base64url');
  const found = await findUser(email);
  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    if (error) throw new Error(`update ${email}: ${error.message}`);
    return { id: found.id, password, created: false };
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw new Error(`create ${email}: ${error?.message}`);
  return { id: data.user.id, password, created: true };
}

const STAFF = 'e2e-staff@aewkan.test';
const LIMITED = 'e2e-limited@aewkan.test';

const staff = await ensureUser(STAFF, 'E2E staff');
const { data: row, error: rowErr } = await admin.from('staff').select('role_key, is_active').eq('id', staff.id).maybeSingle();
if (rowErr) throw new Error(`staff row: ${rowErr.message}`);
if (!row || row.role_key !== 'e2e_all' || !row.is_active) {
  throw new Error(`${STAFF} is not active staff with role e2e_all (${JSON.stringify(row)}) — fix the staff row first`);
}

const limited = await ensureUser(LIMITED, 'E2E limited');
const { data: lim, error: limErr } = await admin.from('staff').select('is_active').eq('id', limited.id).maybeSingle();
if (limErr) throw new Error(`limited staff row: ${limErr.message}`);
if (lim?.is_active) throw new Error(`${LIMITED} is active staff — deactivate it in /admin/team first`);

const values = {
  E2E_STAFF_EMAIL: STAFF,
  E2E_STAFF_PASSWORD: staff.password,
  E2E_LIMITED_EMAIL: LIMITED,
  E2E_LIMITED_PASSWORD: limited.password,
};
const kept = existsSync(FILE)
  ? readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l && !Object.keys(values).some((k) => l.startsWith(`${k}=`)))
  : [];
writeFileSync(FILE, [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n');
console.log(`staff: ${STAFF} password reset · limited: ${LIMITED} ${limited.created ? 'created' : 'password reset'} · written: ${Object.keys(values).join(', ')}`);
