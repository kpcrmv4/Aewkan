import 'server-only';
import type { getSupabaseServer } from '@/lib/supabase/server';

export type Sb = Awaited<ReturnType<typeof getSupabaseServer>>;

export interface VehicleInfo {
  name_th: string;
  name_en: string;
  seats: number;
  sort?: number;
}

/** vehicle key → names, from the current rule set */
export async function loadVehicles(sb: Sb): Promise<Record<string, VehicleInfo>> {
  const { data, error } = await sb.from('pricing_rule_sets').select('rules').eq('is_current', true).maybeSingle();
  if (error) throw new Error(`rules: ${error.message}`);
  const v = (data?.rules as { vehicles?: Record<string, VehicleInfo> } | null)?.vehicles ?? {};
  return v;
}

export const vehicleName = (v: Record<string, VehicleInfo>, key: string) => (v[key]?.name_th ?? key).split(' (')[0];

export interface PlaceName {
  name_th: string;
  name_en: string;
}

export async function loadPlaceNames(sb: Sb, ids: string[]): Promise<Map<string, PlaceName>> {
  const out = new Map<string, PlaceName>();
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return out;
  const { data, error } = await sb.from('places').select('id, name_th, name_en').in('id', uniq).order('id').range(0, 999);
  if (error) throw new Error(`places: ${error.message}`);
  for (const p of data ?? []) out.set(p.id, { name_th: p.name_th, name_en: p.name_en });
  return out;
}

/** booking id → ordered stop place ids */
export async function loadStopPlaceIds(sb: Sb, bookingIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (bookingIds.length === 0) return out;
  const { data, error } = await sb
    .from('booking_stops')
    .select('booking_id, seq, place_id')
    .in('booking_id', bookingIds)
    .order('booking_id')
    .order('seq')
    .range(0, 1999);
  if (error) throw new Error(`stops: ${error.message}`);
  for (const s of data ?? []) {
    const list = out.get(s.booking_id) ?? [];
    list.push(s.place_id);
    out.set(s.booking_id, list);
  }
  return out;
}
