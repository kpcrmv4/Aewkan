import { z } from 'zod';
import { dbFail } from '@/features/admin-settings/db-error';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { uuid } from '@/lib/contracts/common';
import { getSupabaseServer } from '@/lib/supabase/server';

const DeleteCommissionRequest = z.object({ placeId: uuid });

export const POST = staffRoute('commission.manage', DeleteCommissionRequest, async ({ body }) => {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from('commission_rules').delete().eq('place_id', body.placeId).select('place_id').maybeSingle();
  if (error) dbFail(error, 'commission delete');
  if (!data) throw new ApiError(404, 'not_found', 'ไม่พบค่าน้ำของจุดนี้หรือถูกลบไปแล้ว');
  return { ok: true as const };
});
