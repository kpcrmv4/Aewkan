import 'server-only';
import Stripe from 'stripe';

/**
 * Stripe Checkout for the deposit. Amount in satang (baht × 100), THB, one line item.
 * The payment row id is the idempotency key and travels in metadata, so the webhook
 * settles exactly that row.
 */
export interface StripeCheckoutInput {
  secretKey: string;
  paymentId: string;
  bookingId: string;
  bookingNo: string;
  amountBaht: number;
  lang: 'th' | 'en';
  successUrl: string;
  cancelUrl: string;
}

const client = (key: string) => new Stripe(key, { maxNetworkRetries: 1, timeout: 20_000 });

export async function createStripeCheckout(i: StripeCheckoutInput): Promise<{ id: string; url: string }> {
  const session = await client(i.secretKey).checkout.sessions.create(
    {
      mode: 'payment',
      locale: i.lang === 'th' ? 'th' : 'en',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'thb',
            unit_amount: i.amountBaht * 100,
            product_data: { name: i.lang === 'th' ? `มัดจำการจอง ${i.bookingNo}` : `Deposit for booking ${i.bookingNo}` },
          },
        },
      ],
      client_reference_id: i.paymentId,
      metadata: { payment_id: i.paymentId, booking_id: i.bookingId, booking_no: i.bookingNo },
      payment_intent_data: { metadata: { payment_id: i.paymentId, booking_id: i.bookingId, booking_no: i.bookingNo } },
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
      // Stripe's minimum lifetime; the payment row is cancelled by pg_cron after a day
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    },
    { idempotencyKey: `aewkan-${i.paymentId}` },
  );
  if (!session.url) throw new Error('stripe: session without url');
  return { id: session.id, url: session.url };
}

/** an earlier session for the same payment, if the customer can still use it */
export async function openStripeSession(secretKey: string, sessionId: string): Promise<string | null> {
  const s = await client(secretKey).checkout.sessions.retrieve(sessionId);
  return s.status === 'open' && s.url ? s.url : null;
}

export async function stripeBalanceCheck(secretKey: string): Promise<string> {
  const b = await client(secretKey).balance.retrieve();
  return b.livemode ? 'live' : 'test';
}

/** the parts of a Checkout Session event we act on */
export interface StripeSessionLike {
  id: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  payment_intent?: string | { id: string } | null;
}
