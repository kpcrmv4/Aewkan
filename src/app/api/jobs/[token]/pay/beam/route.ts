import { z } from 'zod';
import { ApiError, publicRoute } from '@/lib/api/handler';
import type { CheckoutResponse } from '@/lib/contracts/payment';
import { onlinePayment } from '@/lib/integrations/online';
import { createBeamLink } from '@/lib/integrations/beam';
import { loadIntegration, payInfoFor, ready } from '@/lib/integrations/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[token]/pay/beam — a Beam payment link (Thai cards, e-wallets, mobile
 * banking, PromptPay) for the deposit still owed. Returns the hosted page URL.
 */
export const POST = publicRoute(
  async (_req, params) => ({ info: await payInfoFor(params.token), token: params.token }),
  z.object({}),
  async ({ auth: { info, token }, req }): Promise<CheckoutResponse> => {
    if (!info.open || info.due <= 0) throw new ApiError(409, 'not_payable', 'การจองนี้ไม่อยู่ในขั้นที่ชำระมัดจำได้');
    const admin = getSupabaseAdmin();
    const beam = await loadIntegration(admin, 'beam');
    if (!ready(beam) || !beam.config.merchantId) throw new ApiError(503, 'provider_not_configured', 'ยังไม่ได้ตั้งค่า Beam');
    const origin = new URL(req.url).origin;
    return onlinePayment(admin, info, 'beam', {
      // the link lives 60 min; an attempt younger than 25 min is handed back as is
      reuse: async (_ref, url) => url,
      create: (paymentId) =>
        createBeamLink({
          merchantId: beam.config.merchantId,
          apiKey: beam.secret.apiKey,
          env: beam.config.environment ?? 'playground',
          paymentId,
          bookingNo: info.booking_no,
          amountBaht: info.due,
          lang: info.lang,
          redirectUrl: `${origin}/j/${token}?paid=beam`,
        }),
    });
  },
);
