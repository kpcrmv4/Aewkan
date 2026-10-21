// Create or complete .env.local without ever overwriting a value that exists.
//   node scripts/init-env.mjs
// Public Supabase values are written (they are not secret). SUPABASE_SECRET_KEY
// is never written: it comes from the environment (cloud session settings,
// Vercel) — this script only reports whether it is present, by name.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const FILE = '.env.local';
const PUBLIC = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://kgjsycellzuiumudzdxl.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_DIJtGEqqlCSWLT_fajkKig_PPih7Fqe',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
};

const existing = new Map();
if (existsSync(FILE)) {
  for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) existing.set(m[1], m[2]);
  }
}

const add = new Map();
for (const [k, v] of Object.entries(PUBLIC)) if (!existing.get(k)) add.set(k, v);
if (!existing.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY') || !existing.get('VAPID_PRIVATE_KEY')) {
  const keys = webpush.generateVAPIDKeys();
  add.set('NEXT_PUBLIC_VAPID_PUBLIC_KEY', keys.publicKey);
  add.set('VAPID_PRIVATE_KEY', keys.privateKey);
}
if (!existing.get('VAPID_SUBJECT')) add.set('VAPID_SUBJECT', 'mailto:hello@aewkan.app');
if (!existing.get('CRON_SECRET')) add.set('CRON_SECRET', randomBytes(24).toString('base64url'));

if (add.size) {
  const prefix = existsSync(FILE) && !readFileSync(FILE, 'utf8').endsWith('\n') ? '\n' : '';
  writeFileSync(FILE, prefix + [...add].map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'a' });
}
console.log(`added: ${[...add.keys()].join(', ') || 'nothing'}`);
console.log(`SUPABASE_SECRET_KEY: ${process.env.SUPABASE_SECRET_KEY || existing.get('SUPABASE_SECRET_KEY') ? 'present' : 'MISSING (set it in the environment, never in chat)'}`);
