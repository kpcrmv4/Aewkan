import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* credentials missing: specs skip */
}

export const HAS_STAFF = Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_PASSWORD);
export const HAS_SECRET = Boolean(process.env.SUPABASE_SECRET_KEY);
export const RUN = Date.now().toString(36);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const newClient = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export async function staffClient(): Promise<SupabaseClient> {
  const sb = newClient();
  const { error } = await sb.auth.signInWithPassword({ email: process.env.E2E_STAFF_EMAIL!, password: process.env.E2E_STAFF_PASSWORD! });
  if (error) throw new Error(`staff sign-in: ${error.message}`);
  return sb;
}

export const token = () => randomBytes(32).toString('base64url');

/** a valid 1x1 JPEG for the RPC-level photo uploads */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/** width and height from a JPEG's SOF marker */
export function jpegSize(buf: Buffer): { w: number; h: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export interface Fixture {
  id: string;
  bookingNo: string;
  customerToken: string;
  driverToken: string;
}

export interface Catalogish {
  nimman: string;
  airport: string;
  bosang: string; // commission: head 100, driver 100%
  baantawai: string; // commission: sale 10%, half
  maesa: string; // no commission
  driverId: string;
  vehicleName: { th: string; en: string };
}

export async function lookups(sb: SupabaseClient): Promise<Catalogish> {
  const { data: places, error } = await sb.from('places').select('id,slug').in('slug', ['nimman', 'airport', 'bosang', 'baantawai', 'maesa']);
  if (error) throw error;
  const id = (slug: string) => places!.find((p) => p.slug === slug)!.id as string;
  const { data: drivers } = await sb.from('drivers').select('id').eq('is_active', true).order('nickname').limit(1);
  const cat = await sb.rpc('get_public_catalog');
  const v = cat.data.rules.rules.vehicles.sedan as { name_th: string; name_en: string };
  return {
    nimman: id('nimman'),
    airport: id('airport'),
    bosang: id('bosang'),
    baantawai: id('baantawai'),
    maesa: id('maesa'),
    driverId: drivers![0].id as string,
    vehicleName: { th: v.name_th, en: v.name_en },
  };
}

export interface MakeJob {
  status?: string;
  lang?: 'th' | 'en';
  mode?: string;
  roundTrip?: boolean;
  withDriver?: boolean;
  quote?: { price: number; deposit: number; deadline: string; message?: string };
  label: string;
  travelDate?: string;
  noStops?: boolean;
}

/** a booking + 3 stops through staff RLS and two live links (customer, driver) */
export async function makeJob(sb: SupabaseClient, c: Catalogish, o: MakeJob): Promise<Fixture> {
  const withDriver = o.withDriver ?? ['assigned', 'traveling', 'done'].includes(o.status ?? 'assigned');
  const { data: b, error } = await sb
    .from('bookings')
    .insert({
      booking_no: '',
      status: o.status ?? 'assigned',
      customer_name: `E2E P3 ${RUN} ${o.label}`,
      customer_contact: '@e2e-p3',
      contact_channel: 'line',
      customer_lang: o.lang ?? 'th',
      hotel: 'E2E Hotel Nimman',
      note: 'E2E note: child seat',
      travel_date: o.travelDate ?? '2026-10-24',
      pickup_time: '08:00',
      pickup_place_id: c.nimman,
      vehicle_key: 'sedan',
      pax: 2,
      round_trip: o.roundTrip ?? false,
      lang_driver: true,
      mode: o.mode ?? 'trip',
      rule_version: 1,
      price_total: 3000,
      deposit: 900,
      price_lines: [{ key: 'price.hours', vars: { h: 8, rate: 375 }, amount: 3000 }],
      plan: {},
      driver_id: withDriver ? c.driverId : null,
      quote_price: o.quote?.price ?? null,
      quote_deposit: o.quote?.deposit ?? null,
      quote_deadline: o.quote?.deadline ?? null,
      quote_sent_at: o.quote ? new Date().toISOString() : null,
      quote_message: o.quote?.message ?? null,
    })
    .select('id,booking_no')
    .single();
  if (error || !b) throw new Error(`insert booking: ${error?.message}`);
  const stops = [c.bosang, c.baantawai, c.maesa].map((place_id, i) => ({
    booking_id: b.id,
    seq: i + 1,
    place_id,
    dwell_min: 60,
    planned_minutes: 40 + i * 10,
    planned_km: 12 + i * 5,
  }));
  if (o.noStops !== true) {
    const st = await sb.from('booking_stops').insert(stops);
    if (st.error) throw new Error(`insert stops: ${st.error.message}`);
  }
  const customerToken = token();
  const driverToken = token();
  for (const [aud, t] of [['customer', customerToken], ['driver', driverToken]] as const) {
    const r = await sb.rpc('issue_job_link', { p_booking: b.id, p_audience: aud, p_token: t });
    if (r.error) throw new Error(`issue_job_link: ${r.error.message}`);
  }
  return { id: b.id, bookingNo: b.booking_no, customerToken, driverToken };
}

/** the driver's life cycle through the real RPCs (anon): photo, start, photo, finish */
export async function driveToDone(f: Fixture, cash = 3000): Promise<void> {
  const anon = newClient();
  for (const kind of ['pickup', 'dropoff'] as const) {
    const path = `${f.id}/${kind}/${randomUUID()}.jpg`;
    const up = await anon.storage.from('job-photos').upload(path, TINY_JPEG, { contentType: 'image/jpeg' });
    if (up.error) throw new Error(`upload ${kind}: ${up.error.message}`);
    const rec = await anon.rpc('job_record_photo', { p_token: f.driverToken, p_kind: kind, p_path: path });
    if (rec.error) throw new Error(`record ${kind}: ${rec.error.message}`);
    if (kind === 'pickup') {
      const s = await anon.rpc('job_start', { p_token: f.driverToken });
      if (s.error) throw new Error(`start: ${s.error.message}`);
    }
  }
  const fin = await anon.rpc('job_finish', { p_token: f.driverToken, p_cash: cash });
  if (fin.error) throw new Error(`finish: ${fin.error.message}`);
}

/** bookings → cancelled, links revoked (staff cannot delete) */
export async function cleanup(sb: SupabaseClient | undefined, fixtures: Fixture[]): Promise<void> {
  if (!sb) return;
  const ids = fixtures.map((f) => f.id);
  if (!ids.length) return;
  await sb.from('bookings').update({ status: 'cancelled' }).in('id', ids);
  await sb.from('job_links').update({ revoked_at: new Date().toISOString() }).in('booking_id', ids);
}
