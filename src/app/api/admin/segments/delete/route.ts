import { dbFail } from '@/features/admin-settings/db-error';
import { orderPair } from '@/features/admin-settings/segments';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { DeleteSegmentRequest } from '@/lib/contracts/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

export const POST = staffRoute('places.manage', DeleteSegmentRequest, async ({ body }) => {
  const [placeA, placeB] = orderPair(body.fromId, body.toId);
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from('segments')
    .delete()
    .eq('place_a', placeA)
    .eq('place_b', placeB)
    .eq('source', body.source)
    .select('place_a')
    .maybeSingle();
  if (error) dbFail(error, 'segment delete');
  if (!data) throw new ApiError(404, 'not_found', 'ไม่พบช่วงนี้หรือถูกลบไปแล้ว');
  return { ok: true as const };
});
