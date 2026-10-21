import { z } from 'zod';
import { dbFail } from '@/features/admin-settings/db-error';
import { orderPair } from '@/features/admin-settings/segments';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { uuid } from '@/lib/contracts/common';
import { isRoutingError, routeDistance } from '@/lib/routing';
import { loadRoutingConfig } from '@/lib/routing/config';
import { getSupabaseServer } from '@/lib/supabase/server';

const FetchSegmentRequest = z.object({ fromId: uuid, toId: uuid });

const ROUTING_FAILURES: Record<string, [number, string]> = {
  auth: [502, 'ผู้ให้บริการเส้นทางไม่รับคีย์ ตรวจที่หน้าการเชื่อมต่อ'],
  rate_limited: [429, 'ผู้ให้บริการเส้นทางจำกัดจำนวนครั้ง ลองใหม่ภายหลัง'],
  no_route: [422, 'ผู้ให้บริการหาเส้นทางระหว่างสองจุดนี้ไม่พบ'],
  timeout: [504, 'ผู้ให้บริการเส้นทางตอบช้าเกินไป ลองใหม่อีกครั้ง'],
  bad_response: [502, 'ผู้ให้บริการเส้นทางตอบผิดรูปแบบ'],
  upstream: [502, 'เชื่อมต่อผู้ให้บริการเส้นทางไม่ได้'],
};

/**
 * "Fetch road distance": ask the routing provider (R-003) for one pair and store
 * it as a `routing` segment. The primary key includes the source, so this can
 * only ever create or refresh the routing row; driven / checkins rows are not
 * touched and still outrank it (R-004).
 */
export const POST = staffRoute('places.manage', FetchSegmentRequest, async ({ body }) => {
  if (body.fromId === body.toId) throw new ApiError(422, 'same_place', 'เลือกจุดต้นทางและปลายทางคนละจุด');
  const sb = await getSupabaseServer();

  const { data: places, error: pErr } = await sb.from('places').select('id, lat, lng').in('id', [body.fromId, body.toId]).order('id').range(0, 1);
  if (pErr) dbFail(pErr, 'places read');
  const from = places?.find((p) => p.id === body.fromId);
  const to = places?.find((p) => p.id === body.toId);
  if (!from || !to) throw new ApiError(404, 'not_found', 'ไม่พบจุดหมาย');

  // throws MissingEnvError(SUPABASE_SECRET_KEY) -> 503 server_not_configured
  const cfg = await loadRoutingConfig();
  if (!cfg) throw new ApiError(409, 'routing_not_configured', 'ยังไม่ได้เปิดใช้การเชื่อมต่อเส้นทาง ใส่คีย์ที่หน้าการเชื่อมต่อก่อน');

  let result;
  try {
    result = await routeDistance({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, cfg);
  } catch (e) {
    if (isRoutingError(e)) {
      const [status, message] = ROUTING_FAILURES[e.code] ?? ROUTING_FAILURES.upstream;
      console.error('[segments/fetch] routing failed', e.code, e.message);
      throw new ApiError(status, `routing_${e.code}`, message);
    }
    throw e;
  }

  const [placeA, placeB] = orderPair(body.fromId, body.toId);
  const { data, error } = await sb
    .from('segments')
    .upsert(
      { place_a: placeA, place_b: placeB, source: 'routing', km: result.km, minutes: result.minutes, note: cfg.provider, measured_at: 'now' },
      { onConflict: 'place_a,place_b,source' },
    )
    .select('place_a')
    .maybeSingle();
  if (error) dbFail(error, 'segment upsert');
  if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  return { ok: true as const, km: result.km, minutes: result.minutes, provider: cfg.provider };
});
