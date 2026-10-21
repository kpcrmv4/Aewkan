import type { SupabaseClient } from '@supabase/supabase-js';
import { deflateSync } from 'node:zlib';
import { newClient, RUN, token, type Catalogish } from './p3-helpers';

export { HAS_SECRET, HAS_STAFF, lookups, newClient, RUN, staffClient, token, TINY_JPEG, type Catalogish } from './p3-helpers';

export interface P4Job {
  id: string;
  bookingNo: string;
  customerToken: string;
  driverToken: string;
}

export interface P4MakeJob {
  label: string;
  status: string;
  lang?: 'th' | 'en';
  deposit?: number;
  quote?: { price: number; deposit: number; deadline: string; hours?: number };
}

/** a booking through the staff session (RLS) + live customer and driver links; name prefix `E2E P4` */
export async function makeP4Job(sb: SupabaseClient, c: Catalogish, o: P4MakeJob): Promise<P4Job> {
  const { data: b, error } = await sb
    .from('bookings')
    .insert({
      booking_no: '',
      status: o.status,
      customer_name: `E2E P4 ${RUN} ${o.label}`,
      customer_contact: '@e2e-p4',
      contact_channel: 'line',
      customer_lang: o.lang ?? 'th',
      travel_date: '2026-11-24',
      pickup_time: '08:00',
      pickup_place_id: c.nimman,
      vehicle_key: 'sedan',
      pax: 2,
      round_trip: true,
      mode: o.quote ? 'quote' : 'trip',
      rule_version: 1,
      price_total: 3000,
      deposit: o.deposit ?? 900,
      price_lines: [{ key: 'price.hours', vars: { h: 8, rate: 375 }, amount: 3000 }],
      plan: {},
      quote_price: o.quote?.price ?? null,
      quote_deposit: o.quote?.deposit ?? null,
      quote_hours: o.quote ? (o.quote.hours ?? 3) : null,
      quote_deadline: o.quote?.deadline ?? null,
      quote_sent_at: o.quote ? new Date().toISOString() : null,
    })
    .select('id, booking_no')
    .single();
  if (error || !b) throw new Error(`insert booking: ${error?.message}`);
  const customerToken = token();
  const driverToken = token();
  for (const [aud, t] of [['customer', customerToken], ['driver', driverToken]] as const) {
    const r = await sb.rpc('issue_job_link', { p_booking: b.id, p_audience: aud, p_token: t });
    if (r.error) throw new Error(`issue_job_link: ${r.error.message}`);
  }
  return { id: b.id, bookingNo: b.booking_no, customerToken, driverToken };
}

export async function cleanupP4(sb: SupabaseClient | undefined, jobs: P4Job[]): Promise<void> {
  if (!sb || !jobs.length) return;
  const ids = jobs.map((j) => j.id);
  // pending slips would sit in the staff queue forever: close them through the staff RPC (no deletes)
  const { data: pending } = await sb.from('payments').select('id').in('booking_id', ids).in('status', ['pending', 'verifying']);
  for (const p of pending ?? []) await sb.rpc('admin_review_payment', { p_payment: p.id, p_approve: false, p_note: 'E2E cleanup' });
  await sb.from('bookings').update({ status: 'cancelled' }).in('id', ids);
  await sb.from('job_links').update({ revoked_at: new Date().toISOString() }).in('booking_id', ids);
}

/** upload a slip as the customer would (anon storage) and record it */
export async function slipByRpc(job: P4Job, bytes: Buffer = PNG_SLIP): Promise<{ path: string; error: string | null; data: unknown }> {
  const anon = newClient();
  const path = `${job.id}/${crypto.randomUUID()}.jpg`;
  const up = await anon.storage.from('payment-slips').upload(path, bytes, { contentType: 'image/png' });
  if (up.error) return { path, error: `upload: ${up.error.message}`, data: null };
  const r = await anon.rpc('job_pay_slip', { p_token: job.customerToken, p_path: path });
  return { path, error: r.error?.message ?? null, data: r.data };
}

// ── integrations snapshot / restore (specs touch the shared rows) ──────────────
export interface IntegrationSnap {
  key: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  has_secret: boolean;
}

export async function snapshotIntegrations(sb: SupabaseClient, keys: string[]): Promise<IntegrationSnap[]> {
  const { data, error } = await sb.from('integrations').select('key, is_enabled, config, has_secret').in('key', keys);
  if (error) throw new Error(`snapshot: ${error.message}`);
  return (data ?? []) as IntegrationSnap[];
}

/** back to the snapshot; a secret that did not exist before is cleared (one that did is left alone) */
export async function restoreIntegrations(sb: SupabaseClient, snaps: IntegrationSnap[]): Promise<void> {
  for (const s of snaps) {
    if (!s.has_secret) await sb.rpc('set_integration_secret', { p_key: s.key, p_secret: '' });
    await sb.from('integrations').update({ is_enabled: s.is_enabled, config: s.config }).eq('key', s.key);
  }
}

export async function setIntegration(sb: SupabaseClient, key: string, isEnabled: boolean, config: Record<string, unknown>, secret?: string): Promise<void> {
  if (secret !== undefined) {
    const r = await sb.rpc('set_integration_secret', { p_key: key, p_secret: secret });
    if (r.error) throw new Error(`secret ${key}: ${r.error.message}`);
  }
  const { error } = await sb.from('integrations').update({ is_enabled: isEnabled, config }).eq('key', key);
  if (error) throw new Error(`integration ${key}: ${error.message}`);
}

export const PROMPTPAY_ID = '0812345678';

// ── a small real PNG (a "slip") so browser-image-compression has pixels to work on ──
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const v = (x >> 3) % 2 === (y >> 3) % 2 ? 230 : 40;
      row[1 + x * 3] = v;
      row[2 + x * 3] = v;
      row[3 + x * 3] = 255 - v;
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
export const PNG_SLIP = makePng(120, 200);

export type Sb = SupabaseClient;
