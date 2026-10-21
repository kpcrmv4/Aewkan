import { notifyBooking } from '@/lib/notify';
import { rawRoute, requireCron } from '@/lib/integrations/webhook';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/cron/notify — Vercel Cron (Authorization: Bearer CRON_SECRET), every 5 minutes.
 * Sends what no request of ours could send at the moment it happened:
 *   · return-trip offers opened by the driver's job_finish (a database RPC)
 *   · staff alerts for slips waiting for review (uploads go straight to the database)
 * Each booking + kind is sent once: the notification_log row (sent/failed/skipped) is the marker.
 */
export async function GET(req: Request) {
  return rawRoute(async () => {
    requireCron(req);
    const admin = getSupabaseAdmin();
    const since = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();

    const [offers, slips] = await Promise.all([
      admin
        .from('return_offers')
        .select('booking_id, sent_at')
        .is('dismissed_at', null)
        .is('return_booking_id', null)
        .gte('sent_at', since)
        .order('sent_at')
        .range(0, 49),
      admin
        .from('payments')
        .select('booking_id, updated_at')
        .eq('method', 'promptpay_slip')
        .eq('status', 'pending')
        .gte('updated_at', since)
        .order('updated_at')
        .range(0, 49),
    ]);
    if (offers.error || slips.error) throw new Error(`cron lookups: ${(offers.error ?? slips.error)?.message}`);

    let sent = 0;
    const todo: { bookingId: string; kind: 'return_offer' | 'slip_review'; after: string }[] = [
      ...(offers.data ?? []).map((o) => ({ bookingId: o.booking_id, kind: 'return_offer' as const, after: o.sent_at })),
      ...(slips.data ?? []).map((p) => ({ bookingId: p.booking_id, kind: 'slip_review' as const, after: p.updated_at })),
    ];
    for (const t of todo) {
      const { count, error } = await admin
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', t.bookingId)
        .eq('kind', t.kind)
        .gte('created_at', t.after);
      if (error) throw new Error(`notification_log: ${error.message}`);
      if ((count ?? 0) > 0) continue;
      await notifyBooking(t.bookingId, t.kind);
      sent++;
    }
    return { ok: true, checked: todo.length, sent };
  });
}
