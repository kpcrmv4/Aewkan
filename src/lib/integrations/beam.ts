import 'server-only';

/**
 * Beam Checkout payment links (docs.beamcheckout.com, checked 2026-10-21):
 *   POST {base}/api/v1/payment-links   Basic base64(merchantId:apiKey) · x-beam-idempotency-key
 *   body { order: { currency, netAmount (satang), description, referenceId, orderItems[] },
 *          linkSettings, redirectUrl, expiresAt }  →  { id, url }
 *   webhook header x-beam-event: payment_link.paid (payload = the payment link) or
 *   charge.succeeded (payload = the charge: source PAYMENT_LINK, sourceId = link id)
 *   playground  https://playground.api.beamcheckout.com · production https://api.beamcheckout.com
 */
export type BeamEnv = 'playground' | 'production';

export const beamBase = (env: string) => (env === 'production' ? 'https://api.beamcheckout.com' : 'https://playground.api.beamcheckout.com');

export interface BeamLinkInput {
  merchantId: string;
  apiKey: string;
  env: string;
  paymentId: string;
  bookingNo: string;
  amountBaht: number;
  lang: 'th' | 'en';
  redirectUrl: string;
}

const auth = (merchantId: string, apiKey: string) => `Basic ${Buffer.from(`${merchantId}:${apiKey}`).toString('base64')}`;

export async function createBeamLink(i: BeamLinkInput, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  const satang = i.amountBaht * 100;
  const description = i.lang === 'th' ? `มัดจำการจอง ${i.bookingNo}` : `Deposit for booking ${i.bookingNo}`;
  const res = await fetchImpl(`${beamBase(i.env)}/api/v1/payment-links`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: auth(i.merchantId, i.apiKey),
      'x-beam-idempotency-key': `aewkan-${i.paymentId}`,
    },
    body: JSON.stringify({
      order: {
        currency: 'THB',
        netAmount: satang,
        description,
        referenceId: i.paymentId,
        orderItems: [{ itemName: description, description, price: satang, quantity: 1, sku: i.bookingNo, productId: 'deposit' }],
      },
      linkSettings: {
        card: { isEnabled: true },
        qrPromptPay: { isEnabled: true },
        eWallets: { isEnabled: true },
        mobileBanking: { isEnabled: true },
        buyNowPayLater: { isEnabled: false },
      },
      collectDeliveryAddress: false,
      redirectUrl: i.redirectUrl,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown } | null;
  if (!res.ok || !body || typeof body.id !== 'string' || typeof body.url !== 'string') {
    throw new Error(`beam: create link failed (HTTP ${res.status})`);
  }
  return { id: body.id, url: body.url };
}

/** GET the link — used by the integrations "test" button (a 404 still proves the credentials) */
export async function beamPing(merchantId: string, apiKey: string, env: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(`${beamBase(env)}/api/v1/payment-links/aewkan-ping`, {
    headers: { authorization: auth(merchantId, apiKey) },
    signal: AbortSignal.timeout(10_000),
  });
  return res.status;
}

export interface BeamPaid {
  /** payment link id (our provider_ref) */
  linkId: string;
  /** satang */
  amount: number | null;
  currency: string | null;
  referenceId: string | null;
  eventKey: string;
}

/** the paid link from either event shape; null when the event is not a successful payment */
export function beamPaidFrom(event: string | null, body: unknown): BeamPaid | null {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!b) return null;
  if (event === 'payment_link.paid' && b.status === 'PAID' && typeof b.paymentLinkId === 'string') {
    const order = (b.order ?? {}) as Record<string, unknown>;
    return {
      linkId: b.paymentLinkId,
      amount: typeof order.netAmount === 'number' ? order.netAmount : null,
      currency: typeof order.currency === 'string' ? order.currency : null,
      referenceId: typeof order.referenceId === 'string' ? order.referenceId : null,
      eventKey: `${event}:${b.paymentLinkId}`,
    };
  }
  if (event === 'charge.succeeded' && b.status === 'SUCCEEDED' && b.source === 'PAYMENT_LINK' && typeof b.sourceId === 'string') {
    return {
      linkId: b.sourceId,
      amount: typeof b.amount === 'number' ? b.amount : null,
      currency: typeof b.currency === 'string' ? b.currency : null,
      referenceId: typeof b.referenceId === 'string' ? b.referenceId : null,
      eventKey: `${event}:${typeof b.chargeId === 'string' ? b.chargeId : b.sourceId}`,
    };
  }
  return null;
}
