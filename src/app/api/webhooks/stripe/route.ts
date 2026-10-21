import { ApiError } from '@/lib/api/handler';
import { loadIntegration } from '@/lib/integrations/server';
import { verifyStripeSignature } from '@/lib/integrations/signatures';
import type { StripeSessionLike } from '@/lib/integrations/stripe';
import { markEvent, rawRoute, seenEvent, settleOnline } from '@/lib/integrations/webhook';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Stripe → POST /api/webhooks/stripe. Raw body + Stripe-Signature (whsec in Vault, so the
 * service role is needed first → 503 and Stripe retries). Idempotent on the event id.
 *   checkout.session.completed (payment_status paid) · checkout.session.async_payment_succeeded → paid
 *   checkout.session.expired · checkout.session.async_payment_failed → the pending row is closed
 */
export async function POST(req: Request) {
  return rawRoute(async () => {
    const raw = await req.text();
    const admin = getSupabaseAdmin();
    const st = await loadIntegration(admin, 'stripe');
    const secret = st.secret.webhookSecret;
    if (!secret) throw new ApiError(503, 'provider_not_configured', 'stripe webhook secret not set');
    if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret)) {
      throw new ApiError(400, 'bad_signature', 'invalid signature');
    }
    const event = JSON.parse(raw) as { id: string; type: string; data: { object: StripeSessionLike } };
    if (!event?.id || !event.type) throw new ApiError(400, 'bad_event', 'invalid event');
    if (await seenEvent(admin, 'stripe', event.id)) return { received: true, duplicate: true };

    const s = event.data?.object;
    const paymentId = s?.metadata?.payment_id ?? s?.client_reference_id ?? null;
    let outcome: string = 'ignored';
    if (paymentId && /^[0-9a-f-]{36}$/.test(paymentId)) {
      if (
        (event.type === 'checkout.session.completed' && s.payment_status === 'paid') ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const intent = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null);
        const r = await settleOnline(admin, paymentId, {
          method: 'stripe',
          amountSatang: s.amount_total ?? null,
          currency: s.currency ?? null,
          providerRef: s.id,
          result: { event: event.id, session: s.id, payment_intent: intent },
        });
        outcome = r.settled ? 'paid' : (r.reason ?? 'not_settled');
      } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        const { error } = await admin
          .from('payments')
          .update({ status: event.type === 'checkout.session.expired' ? 'cancelled' : 'failed' })
          .eq('id', paymentId)
          .eq('method', 'stripe')
          .eq('status', 'pending');
        if (error) throw new Error(`stripe close: ${error.message}`);
        outcome = 'closed';
      }
    }
    await markEvent(admin, 'stripe', event.id);
    return { received: true, outcome };
  });
}
