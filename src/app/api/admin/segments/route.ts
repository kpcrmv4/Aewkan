import { dbFail } from '@/features/admin-settings/db-error';
import { orderPair } from '@/features/admin-settings/segments';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { UpsertSegmentRequest } from '@/lib/contracts/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

/** enter or correct a measured segment (one row per pair and source) */
export const POST = staffRoute('places.manage', UpsertSegmentRequest, async ({ body }) => {
  if (body.fromId === body.toId) throw new ApiError(422, 'same_place', 'เลือกจุดต้นทางและปลายทางคนละจุด');
  const [placeA, placeB] = orderPair(body.fromId, body.toId);

  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from('segments')
    .upsert(
      // 'now' is read by the database (timestamptz input), not the app server clock
      { place_a: placeA, place_b: placeB, source: body.source, km: body.km, minutes: body.minutes, note: body.note, measured_at: 'now' },
      { onConflict: 'place_a,place_b,source' },
    )
    .select('place_a')
    .maybeSingle();
  if (error) dbFail(error, 'segment upsert');
  if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  return { ok: true as const };
});
