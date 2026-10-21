import { z } from 'zod';
import { ApiError, publicRoute } from '@/lib/api/handler';
import type { CheckoutResponse } from '@/lib/contracts/payment';
import { onlinePayment } from '@/lib/integrations/online';
import { loadIntegration, payInfoFor, ready } from '@/lib/integrations/server';
import { createStripeCheckout, openStripeSession } from '@/lib/integrations/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[token]/pay/stripe — a Stripe Checkout Session for the deposit still owed
 * (amount recomputed in SQL, never from the client). Returns the hosted page URL.
 */
export const POST = publicRoute(
  async (_req, params) => ({ info: await payInfoFor(params.token), token: params.token }),
  z.object({}),
  async ({ auth: { info, token }, req }): Promise<CheckoutResponse> => {
    if (!info.open || info.due <= 0) throw new ApiError(409, 'not_payable', 'การจองนี้ไม่อยู่ในขั้นที่ชำระมัดจำได้');
    const admin = getSupabaseAdmin();
    const st = await loadIntegration(admin, 'stripe');
    if (!ready(st)) throw new ApiError(503, 'provider_not_configured', 'ยังไม่ได้ตั้งค่า Stripe');
    const origin = new URL(req.url).origin;
    return onlinePayment(admin, info, 'stripe', {
      reuse: (ref) => openStripeSession(st.secret.secretKey, ref),
      create: (paymentId) =>
        createStripeCheckout({
          secretKey: st.secret.secretKey,
          paymentId,
          bookingId: info.booking_id,
          bookingNo: info.booking_no,
          amountBaht: info.due,
          lang: info.lang,
          successUrl: `${origin}/j/${token}?paid=stripe`,
          cancelUrl: `${origin}/j/${token}`,
        }),
    });
  },
);
