import { dbFail } from '@/features/admin-settings/db-error';
import { makeSlug } from '@/features/admin-settings/coords';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { UpsertPlaceRequest } from '@/lib/contracts/admin';
import type { Database } from '@/lib/database.types';
import { getSupabaseServer } from '@/lib/supabase/server';

type PlaceInsert = Database['public']['Tables']['places']['Insert'];

/** create or update a place; the slug is made once and never changes */
export const POST = staffRoute('places.manage', UpsertPlaceRequest, async ({ body }) => {
  const sb = await getSupabaseServer();
  const values: Omit<PlaceInsert, 'slug'> = {
    name_th: body.nameTh,
    name_en: body.nameEn,
    lat: body.lat,
    lng: body.lng,
    category: body.category,
    is_pickup: body.isPickup,
    is_mountain: body.isMountain,
    default_dwell_min: body.defaultDwellMin,
    is_hidden: body.isHidden,
  };

  if (body.id) {
    const { data, error } = await sb.from('places').update(values).eq('id', body.id).select('id').maybeSingle();
    if (error) dbFail(error, 'place update');
    if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้หรือไม่พบจุดหมาย');
    return { ok: true as const, id: data.id };
  }

  // slug is unique: retry with a fresh random tail on the rare collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await sb.from('places').insert({ ...values, slug: makeSlug(body.nameEn) }).select('id').maybeSingle();
    if (error?.code === '23505') continue;
    if (error) dbFail(error, 'place insert');
    if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
    return { ok: true as const, id: data.id };
  }
  throw new ApiError(409, 'duplicate', 'สร้างรหัสจุดหมายไม่สำเร็จ ลองอีกครั้ง');
});
