import 'server-only';
import { loadIntegration, ready, siteOrigin, type Admin } from '@/lib/integrations/server';
import { lineText, linePush } from '@/lib/integrations/line';
import { sendPush, type PushKeys } from '@/lib/integrations/push';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { customerMessage, STAFF_KINDS, staffMessage, type MessageInput, type NotifyKind } from './messages';

export { NOTIFY_KINDS, type NotifyKind } from './messages';

export type ChannelResult = 'sent' | 'failed' | 'skipped';
export interface NotifyResult {
  push: ChannelResult;
  line: ChannelResult;
  reason?: string;
}

export interface NotifyOptions {
  /** the raw customer link when the caller holds it (assign issues a new one) — LINE text only */
  customerUrl?: string | null;
}

/**
 * Tell the customer (push + LINE) or the staff (LINE group) about a booking event.
 * Never throws and never blocks the caller's own result — call it inside `after()`.
 * Every channel writes one notification_log row: sent / failed / skipped (+ reason).
 * Without SUPABASE_SECRET_KEY it logs `skipped · server_not_configured` through the
 * caller's staff session (rpc log_notification) and the copy-text flow stays the fallback.
 */
export async function notifyBooking(bookingId: string, kind: NotifyKind, opts: NotifyOptions = {}): Promise<NotifyResult> {
  let admin: Admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    await logViaStaff(bookingId, kind, 'server_not_configured');
    return { push: 'skipped', line: 'skipped', reason: 'server_not_configured' };
  }
  const log: { channel: 'push' | 'line'; status: ChannelResult; error: string | null }[] = [];
  const result: NotifyResult = { push: 'skipped', line: 'skipped' };
  try {
    const input = await loadMessageInput(admin, bookingId, opts);
    if (!input) return { push: 'skipped', line: 'skipped', reason: 'booking_not_found' };
    const staff = STAFF_KINDS.includes(kind);

    // LINE
    const line = await loadIntegration(admin, 'line');
    if (!ready(line)) {
      log.push({ channel: 'line', status: 'skipped', error: 'line_not_configured' });
    } else if (staff) {
      const text = staffMessage(kind, input);
      const to = line.config.staffTo;
      if (!text || !to) log.push({ channel: 'line', status: 'skipped', error: 'no_staff_target' });
      else result.line = await tryLine(line.secret.channelAccessToken, [to], text, log);
    } else {
      const msg = customerMessage(kind, input);
      const { data: bound, error } = await admin.from('line_links').select('line_user_id').eq('booking_id', bookingId).order('created_at').range(0, 9);
      if (error) throw new Error(`line_links: ${error.message}`);
      const to = (bound ?? []).map((r) => r.line_user_id);
      if (!msg || !to.length) log.push({ channel: 'line', status: 'skipped', error: msg ? 'not_bound' : 'no_message' });
      else result.line = await tryLine(line.secret.channelAccessToken, to, msg.text, log);
    }

    // web push (customers only)
    if (staff) {
      // staff use the admin app; no push channel for them in v1
    } else {
      const msg = customerMessage(kind, input);
      result.push = msg ? await pushToCustomer(admin, bookingId, kind, input.bookingNo, msg, log) : 'skipped';
      if (!msg) log.push({ channel: 'push', status: 'skipped', error: 'no_message' });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[notify] failed', bookingId, kind, message);
    log.push({ channel: 'line', status: 'failed', error: message.slice(0, 300) });
    result.reason = 'error';
  } finally {
    if (log.length) {
      const { error } = await admin
        .from('notification_log')
        .insert(log.map((l) => ({ booking_id: bookingId, channel: l.channel, kind, status: l.status, error: l.error })));
      if (error) console.error('[notify] log failed', error.message);
    }
  }
  return result;
}

async function tryLine(token: string | undefined, to: string[], text: string, log: { channel: 'push' | 'line'; status: ChannelResult; error: string | null }[]): Promise<ChannelResult> {
  if (!token) {
    log.push({ channel: 'line', status: 'skipped', error: 'no_token' });
    return 'skipped';
  }
  let sent = 0;
  let lastErr = '';
  for (const id of to) {
    try {
      await linePush(token, id, [lineText(text)]);
      sent++;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  const status: ChannelResult = sent ? 'sent' : 'failed';
  log.push({ channel: 'line', status, error: sent ? null : lastErr.slice(0, 300) });
  return status;
}

async function pushToCustomer(
  admin: Admin,
  bookingId: string,
  kind: NotifyKind,
  bookingNo: string,
  msg: { title: string; body: string },
  log: { channel: 'push' | 'line'; status: ChannelResult; error: string | null }[],
): Promise<ChannelResult> {
  const { data: keysJson, error: kErr } = await admin.rpc('get_push_private_key');
  if (kErr) throw new Error(`push keys: ${kErr.message}`);
  const k = keysJson as { public_key?: string; private_key?: string; subject?: string } | null;
  if (!k?.public_key || !k.private_key || !k.subject) {
    log.push({ channel: 'push', status: 'skipped', error: 'push_not_configured' });
    return 'skipped';
  }
  const keys: PushKeys = { publicKey: k.public_key, privateKey: k.private_key, subject: k.subject };
  // every customer link of the booking: assign re-issues the link, the device stays the customer's
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, job_links!inner(booking_id, audience)')
    .eq('job_links.booking_id', bookingId)
    .eq('job_links.audience', 'customer')
    .order('created_at')
    .range(0, 19);
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  if (!subs?.length) {
    log.push({ channel: 'push', status: 'skipped', error: 'no_subscription' });
    return 'skipped';
  }
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs) {
    const r = await sendPush(keys, s, { title: msg.title, body: msg.body, tag: `${bookingNo}:${kind}`, bookingNo });
    if (r === 'sent') sent++;
    if (r === 'gone') gone.push(s.id);
  }
  if (gone.length) {
    const { error: dErr } = await admin.from('push_subscriptions').delete().in('id', gone);
    if (dErr) console.error('[notify] prune subscriptions', dErr.message);
  }
  const status: ChannelResult = sent ? 'sent' : 'failed';
  log.push({ channel: 'push', status, error: sent ? null : `${subs.length - gone.length} failed · ${gone.length} gone` });
  return status;
}

async function loadMessageInput(admin: Admin, bookingId: string, opts: NotifyOptions): Promise<MessageInput | null> {
  const { data: b, error } = await admin
    .from('bookings')
    .select('id, booking_no, customer_name, customer_lang, travel_date, pickup_time, pickup_place_id, price_total, deposit, quote_price, quote_deposit, quote_deadline, driver_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw new Error(`booking: ${error.message}`);
  if (!b) return null;
  const lang = b.customer_lang === 'en' ? 'en' : 'th';
  const [pickup, driver, offer] = await Promise.all([
    admin.from('places').select('name_th, name_en').eq('id', b.pickup_place_id).maybeSingle(),
    b.driver_id ? admin.from('drivers').select('nickname, name_en, car_th, car_en, plate').eq('id', b.driver_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    admin.from('return_offers').select('discount_pct, places!return_offers_from_place_id_fkey(name_th, name_en)').eq('booking_id', bookingId).maybeSingle(),
  ]);
  const failed = pickup.error ?? driver.error ?? offer.error;
  if (failed) throw new Error(`message lookups: ${failed.message}`);
  const d = driver.data;
  const fromPlace = offer.data ? (Array.isArray(offer.data.places) ? offer.data.places[0] : offer.data.places) : null;
  return {
    lang,
    bookingNo: b.booking_no,
    travelDate: b.travel_date,
    pickupTime: b.pickup_time,
    pickupName: (lang === 'en' ? pickup.data?.name_en : pickup.data?.name_th) ?? '',
    customerName: b.customer_name,
    total: b.quote_price ?? b.price_total,
    deposit: b.quote_price != null ? (b.quote_deposit ?? b.deposit) : b.deposit,
    quote: b.quote_price != null ? { price: b.quote_price, deposit: b.quote_deposit ?? b.deposit, deadline: b.quote_deadline } : null,
    driver: d ? { nickname: lang === 'en' ? d.name_en || d.nickname : d.nickname, plate: d.plate, car: lang === 'en' ? d.car_en : d.car_th } : null,
    returnOffer: offer.data
      ? { fromName: (lang === 'en' ? fromPlace?.name_en : fromPlace?.name_th) ?? '', pct: offer.data.discount_pct }
      : null,
    customerUrl: opts.customerUrl ?? null,
    adminUrl: `${siteOrigin()}/admin/jobs/${b.id}`,
  };
}

/** no service role: record the skip with the caller's staff session (outside a staff request this is a no-op) */
async function logViaStaff(bookingId: string, kind: NotifyKind, reason: string): Promise<void> {
  try {
    const sb = await getSupabaseServer();
    for (const channel of ['push', 'line'] as const) {
      const { error } = await sb.rpc('log_notification', { p_booking: bookingId, p_channel: channel, p_kind: kind, p_status: 'skipped', p_error: reason });
      if (error) return;
    }
  } catch {
    /* not inside a request with cookies (cron, webhook) — nothing to log with */
  }
}
