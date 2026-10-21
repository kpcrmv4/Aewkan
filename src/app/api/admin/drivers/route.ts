import { ApiError, staffRoute } from '@/lib/api/handler';
import { UpsertDriverRequest } from '@/lib/contracts/admin';
import type { Database } from '@/lib/database.types';
import { getSupabaseServer } from '@/lib/supabase/server';

type DriverInsert = Database['public']['Tables']['drivers']['Insert'];

/** create or update a driver; activate/deactivate is the same call with isActive flipped */
export const POST = staffRoute('drivers.manage', UpsertDriverRequest, async ({ body }) => {
  const sb = await getSupabaseServer();

  const { data: rules, error: rErr } = await sb.from('pricing_rule_sets').select('rules').eq('is_current', true).maybeSingle();
  if (rErr) throw new Error(`rules read: ${rErr.message}`);
  const vehicles = (rules?.rules as { vehicles?: Record<string, unknown> } | null)?.vehicles ?? {};
  if (!Object.hasOwn(vehicles, body.vehicleKey)) throw new ApiError(422, 'invalid_vehicle', 'ประเภทรถนี้ไม่มีในกฎราคาปัจจุบัน');

  const values: DriverInsert = {
    full_name: body.fullName,
    nickname: body.nickname,
    name_en: body.nameEn,
    phone: body.phone,
    line_id: body.lineId,
    langs: body.langs,
    langs_en: body.langsEn,
    vehicle_key: body.vehicleKey,
    car_th: body.carTh,
    car_en: body.carEn,
    plate: body.plate,
    years: body.years,
    note: body.note,
    is_active: body.isActive,
  };

  if (body.id) {
    const { data, error } = await sb.from('drivers').update(values).eq('id', body.id).select('id').maybeSingle();
    if (error) throw new Error(`driver update: ${error.message}`);
    if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้หรือไม่พบคนขับ');
    return { ok: true as const, id: data.id };
  }
  const { data, error } = await sb.from('drivers').insert(values).select('id').maybeSingle();
  if (error) throw new Error(`driver insert: ${error.message}`);
  if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  return { ok: true as const, id: data.id };
});
