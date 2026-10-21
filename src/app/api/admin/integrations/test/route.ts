import { staffRoute } from '@/lib/api/handler';
import { TestIntegrationRequest, type TestIntegrationResponse } from '@/lib/contracts/payment';
import { beamPing } from '@/lib/integrations/beam';
import { resendRequest, resendSend } from '@/lib/integrations/email';
import { lineBotInfo } from '@/lib/integrations/line';
import { formatPromptPayId, promptPayPayload, PROMPTPAY_ID_RE } from '@/lib/integrations/promptpay';
import { checkVapid } from '@/lib/integrations/push';
import { loadIntegration, ready, type Admin } from '@/lib/integrations/server';
import { stripeBalanceCheck } from '@/lib/integrations/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

const ok = (message: string): TestIntegrationResponse => ({ ok: true, message });
const fail = (message: string): TestIntegrationResponse => ({ ok: false, message });

/**
 * POST /api/admin/integrations/test — one live check per integration. PromptPay is checked
 * from its config with the staff session; every other one must read its secret from Vault,
 * so it needs the service role (503 server_not_configured without it).
 */
export const POST = staffRoute('integrations.manage', TestIntegrationRequest, async ({ staff, body }): Promise<TestIntegrationResponse> => {
  if (body.key === 'promptpay') {
    const sb = await getSupabaseServer();
    const { data, error } = await sb.from('integrations').select('config').eq('key', 'promptpay').maybeSingle();
    if (error) throw new Error(`integrations read: ${error.message}`);
    const id = String((data?.config as Record<string, unknown> | null)?.id ?? '');
    if (!PROMPTPAY_ID_RE.test(id)) return fail('ยังไม่ได้ใส่พร้อมเพย์ หรือรูปแบบไม่ถูกต้อง (บันทึกก่อนทดสอบ)');
    const payload = promptPayPayload(id, 1);
    return ok(`สร้าง QR ได้ · พร้อมเพย์ ${formatPromptPayId(id)} · payload ${payload.length} ตัวอักษร (ทดลองสแกน ฿1 จากแอปธนาคารได้)`);
  }

  const admin = getSupabaseAdmin(); // MissingEnvError → 503 server_not_configured
  if (body.key === 'push') return testPush(admin);
  const i = await loadIntegration(admin, body.key);
  if (!ready(i)) return fail('ยังตั้งค่าไม่ครบหรือยังไม่ได้เปิดใช้งาน');
  try {
    switch (body.key) {
      case 'line': {
        const info = await lineBotInfo(i.secret.channelAccessToken);
        const same = !i.config.basicId || i.config.basicId === info.basicId;
        return ok(`เชื่อมต่อ OA "${info.displayName}" (${info.basicId}) สำเร็จ${same ? '' : ` · Basic ID ที่กรอกไว้ (${i.config.basicId}) ไม่ตรงกับ OA`}`);
      }
      case 'stripe':
        return ok(`เชื่อมต่อ Stripe สำเร็จ (โหมด ${await stripeBalanceCheck(i.secret.secretKey)})`);
      case 'beam': {
        const status = await beamPing(i.config.merchantId, i.secret.apiKey, i.config.environment ?? 'playground');
        return status === 401 || status === 403 ? fail(`Beam ปฏิเสธคีย์ (HTTP ${status})`) : ok(`เชื่อมต่อ Beam ${i.config.environment ?? 'playground'} สำเร็จ`);
      }
      case 'slip':
        return await testSlip(i.config, i.secret.apiKey);
      case 'routing':
        return await testRouting(i.config.provider ?? 'ors', i.secret.apiKey);
      case 'email': {
        // a real e-mail to the staff member pressing the button
        const req = resendRequest(
          { fromEmail: i.config.fromEmail, fromName: i.config.fromName ?? '', replyTo: i.config.replyTo },
          staff.email,
          { lang: 'th', title: 'แอ่วกัน · ทดสอบอีเมล', body: 'ถ้าได้รับอีเมลนี้ แปลว่าการส่งอีเมลถึงลูกค้าผ่าน Resend พร้อมใช้งานแล้ว', bookingNo: 'TEST', url: null },
        );
        const id = await resendSend(i.secret.apiKey, req);
        return ok(`ส่งอีเมลทดสอบไปที่ ${staff.email} แล้ว${id ? ` · id ${id}` : ''} (ดูในกล่องจดหมายหรือสแปม)`);
      }
    }
  } catch (e) {
    return fail(`ทดสอบไม่ผ่าน: ${e instanceof Error ? e.message.slice(0, 200) : 'ไม่ทราบสาเหตุ'}`);
  }
  return fail('ไม่รู้จักการเชื่อมต่อนี้');
});

async function testPush(admin: Admin): Promise<TestIntegrationResponse> {
  const { data, error } = await admin.rpc('get_push_private_key');
  if (error) throw new Error(`push keys: ${error.message}`);
  const k = data as { public_key?: string; private_key?: string; subject?: string } | null;
  if (!k?.private_key || !k.public_key || !k.subject) return fail('ยังไม่มีกุญแจ หรือปิดใช้งานอยู่');
  try {
    checkVapid({ publicKey: k.public_key, privateKey: k.private_key, subject: k.subject });
    return ok('กุญแจ VAPID ใช้งานได้');
  } catch (e) {
    return fail(`กุญแจไม่ถูกต้อง: ${e instanceof Error ? e.message : ''}`);
  }
}

async function testSlip(config: Record<string, string>, apiKey: string): Promise<TestIntegrationResponse> {
  if ((config.provider ?? 'slipok') === 'easyslip') {
    const res = await fetch('https://api.easyslip.com/v2/info', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? ok('เชื่อมต่อ EasySlip สำเร็จ') : fail(`EasySlip ตอบ HTTP ${res.status}`);
  }
  const res = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(config.branchId ?? '')}/quota`, {
    headers: { 'x-authorization': apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  const b = (await res.json().catch(() => null)) as { data?: { quota?: number } } | null;
  return res.ok ? ok(`เชื่อมต่อ SlipOK สำเร็จ${typeof b?.data?.quota === 'number' ? ` · โควตาคงเหลือ ${b.data.quota}` : ''}`) : fail(`SlipOK ตอบ HTTP ${res.status}`);
}

async function testRouting(provider: string, apiKey: string): Promise<TestIntegrationResponse> {
  // Tha Phae Gate → Nimman, a short drive in Chiang Mai
  if (provider === 'google') {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 18.7877, longitude: 98.9933 } } },
        destination: { location: { latLng: { latitude: 18.7966, longitude: 98.9676 } } },
        travelMode: 'DRIVE',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ok('เชื่อมต่อ Google Routes สำเร็จ') : fail(`Google Routes ตอบ HTTP ${res.status}`);
  }
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=98.9933,18.7877&end=98.9676,18.7966`;
  const res = await fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(10_000) });
  return res.ok ? ok('เชื่อมต่อ OpenRouteService สำเร็จ') : fail(`OpenRouteService ตอบ HTTP ${res.status}`);
}
