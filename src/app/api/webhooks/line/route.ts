import { ApiError } from '@/lib/api/handler';
import { lineReply, lineText } from '@/lib/integrations/line';
import { tokenInText } from '@/lib/integrations/line-link';
import { loadIntegration, siteOrigin } from '@/lib/integrations/server';
import { verifyLineSignature } from '@/lib/integrations/signatures';
import { markEvent, rawRoute, seenEvent } from '@/lib/integrations/webhook';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

interface LineEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type: 'user' | 'group' | 'room'; userId?: string; groupId?: string; roomId?: string };
  message?: { type: string; text?: string };
}

const WELCOME =
  'ขอบคุณที่เพิ่มเพื่อนกับแอ่วกัน · ส่งลิงก์งานของคุณ (ลิงก์ /j/…) มาในแชทนี้ เพื่อรับแจ้งเตือนราคา การยืนยัน และคนขับ\n' +
  'Thanks for adding Aewkan. Send your trip link (/j/…) in this chat to get price, confirmation and driver updates here.';

/**
 * LINE OA → POST /api/webhooks/line. x-line-signature over the raw body with the channel
 * secret (Vault → service role first). Binding (no LINE Login): a customer sends their own
 * job link → line_bind(token, userId) → we reply in their language. A message with only a
 * booking number never binds (numbers are sequential). In a group, "groupid" / joining
 * replies the group id for the staff-alert setting.
 */
export async function POST(req: Request) {
  return rawRoute(async () => {
    const raw = await req.text();
    const admin = getSupabaseAdmin();
    const line = await loadIntegration(admin, 'line');
    const secret = line.secret.channelSecret;
    const token = line.secret.channelAccessToken;
    if (!secret) throw new ApiError(503, 'provider_not_configured', 'line channel secret not set');
    if (!verifyLineSignature(raw, req.headers.get('x-line-signature'), secret)) throw new ApiError(400, 'bad_signature', 'invalid signature');

    const body = JSON.parse(raw) as { events?: LineEvent[] };
    const origin = siteOrigin(req);
    let handled = 0;
    for (const ev of (body.events ?? []).slice(0, 20)) {
      try {
        if (ev.webhookEventId && (await seenEvent(admin, 'line', ev.webhookEventId))) continue;
        const reply = await handle(admin, ev, origin);
        if (reply && ev.replyToken && token) await lineReply(token, ev.replyToken, [lineText(reply)]);
        if (ev.webhookEventId) await markEvent(admin, 'line', ev.webhookEventId);
        handled++;
      } catch (e) {
        // LINE does not retry by default: log and keep answering 200 for the batch
        console.error('[webhook/line] event failed', ev.type, e instanceof Error ? e.message : e);
      }
    }
    return { ok: true, handled };
  });
}

async function handle(admin: ReturnType<typeof getSupabaseAdmin>, ev: LineEvent, origin: string): Promise<string | null> {
  const src = ev.source;
  if (ev.type === 'follow') return WELCOME;
  if (ev.type === 'join' && src?.groupId) return `Group ID สำหรับแจ้งเตือนทีมงาน: ${src.groupId}`;
  if (ev.type !== 'message' || ev.message?.type !== 'text' || !ev.message.text) return null;
  const text = ev.message.text;
  if (src?.type === 'group' && /^(groupid|group id|รหัสกลุ่ม)$/i.test(text.trim()) && src.groupId) return `Group ID: ${src.groupId}`;
  const jobToken = tokenInText(text);
  if (!jobToken || src?.type !== 'user' || !src.userId) return null;
  const { data, error } = await admin.rpc('line_bind', { p_token: jobToken, p_user: src.userId });
  if (error) throw new Error(`line_bind: ${error.message}`);
  const bound = data as { booking_no: string; lang: string } | null;
  if (!bound) {
    return 'ไม่พบลิงก์งานนี้ หรือเป็นลิงก์เก่าที่ถูกแทนแล้ว กรุณาส่งลิงก์ล่าสุด\nThis trip link was not found or was replaced. Please send the latest link.';
  }
  const url = `${origin}/j/${jobToken}`;
  return bound.lang === 'en'
    ? `Linked booking ${bound.booking_no}. We will send your updates here.\n${url}`
    : `เชื่อมการจอง ${bound.booking_no} แล้ว เราจะแจ้งความคืบหน้าทางแชทนี้\n${url}`;
}
