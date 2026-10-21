import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* credentials may come from the real environment */
}

export type Sb = SupabaseClient<Database>;

/** staff session through RLS — the same permissions the back office has */
export async function staffClient(): Promise<Sb> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const sb = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: process.env.E2E_STAFF_EMAIL!, password: process.env.E2E_STAFF_PASSWORD! });
  if (error) throw new Error(`staff sign-in failed: ${error.message}`);
  return sb;
}

export const newRunId = () => Math.random().toString(36).slice(2, 8);

export const addDaysIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const todayBkk = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

/** a date far enough ahead that no other data uses it, spread by run id */
export const farDate = (run: string, offset = 0) => addDaysIso(todayBkk(), 60 + (parseInt(run, 36) % 500) + offset);

export interface Fixture {
  pickupId: string;
  stopIds: [string, string];
  ruleVersion: number;
  vehicleKeys: string[];
}

export async function loadFixture(sb: Sb): Promise<Fixture> {
  const [places, rules] = await Promise.all([
    sb.from('places').select('id, is_pickup, is_hidden, name_th').eq('is_hidden', false).order('name_th').range(0, 199),
    sb.from('pricing_rule_sets').select('version, rules').eq('is_current', true).maybeSingle(),
  ]);
  if (places.error || rules.error || !rules.data) throw new Error('fixture load failed');
  const pickup = places.data!.find((p) => p.is_pickup && p.name_th.startsWith('ประตูท่าแพ')) ?? places.data!.find((p) => p.is_pickup)!;
  const stops = places.data!.filter((p) => !p.is_pickup).slice(0, 2);
  const vehicles = (rules.data.rules as { vehicles: Record<string, unknown> }).vehicles;
  return { pickupId: pickup.id, stopIds: [stops[0].id, stops[1].id], ruleVersion: rules.data.version, vehicleKeys: Object.keys(vehicles) };
}

export interface NewBooking {
  name: string;
  status: string;
  travelDate: string;
  vehicleKey?: string;
  lang?: 'th' | 'en';
  driverId?: string;
  time?: string;
  quote?: boolean;
}

export interface Created {
  id: string;
  booking_no: string;
  name: string;
}

export async function createBookings(sb: Sb, fx: Fixture, items: NewBooking[]): Promise<Created[]> {
  const rows = items.map((i) => ({
    booking_no: '',
    status: i.status,
    customer_name: i.name,
    customer_contact: 'LINE @e2e-p2',
    customer_lang: i.lang ?? 'th',
    pax: 2,
    vehicle_key: i.vehicleKey ?? 'sedan',
    pickup_place_id: fx.pickupId,
    travel_date: i.travelDate,
    pickup_time: i.time ?? '09:00',
    round_trip: true,
    mode: i.quote ? 'quote' : 'trip',
    rule_version: 1,
    price_total: i.quote ? 0 : 3000,
    deposit: i.quote ? 0 : 900,
    driver_id: i.driverId ?? null,
  }));
  const { data, error } = await sb.from('bookings').insert(rows).select('id, booking_no, customer_name');
  if (error || !data) throw new Error(`booking insert failed: ${error?.message}`);
  const stops = data.flatMap((b) =>
    fx.stopIds.map((placeId, k) => ({ booking_id: b.id, seq: k + 1, place_id: placeId, dwell_min: 60, planned_minutes: 30 })),
  );
  const { error: sErr } = await sb.from('booking_stops').insert(stops);
  if (sErr) throw new Error(`stops insert failed: ${sErr.message}`);
  // keep the input order
  return items.map((i) => {
    const b = data.find((d) => d.customer_name === i.name)!;
    return { id: b.id, booking_no: b.booking_no, name: i.name };
  });
}

/** staff cannot delete bookings: park every row this run made as cancelled */
export async function cancelBookings(sb: Sb, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await sb.from('bookings').update({ status: 'cancelled' }).in('id', ids);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
}

export async function bookingRow(sb: Sb, id: string) {
  const { data, error } = await sb.from('bookings').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error(`booking read failed: ${error?.message}`);
  return data;
}

export async function countStatus(sb: Sb, status: string) {
  const { count, error } = await sb.from('bookings').select('id', { count: 'exact', head: true }).eq('status', status);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
