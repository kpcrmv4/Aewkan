/**
 * Webhook signature checks (pure, node:crypto). Every check works on the RAW request
 * body — read it with `await req.text()` before any JSON parsing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Stripe: header `Stripe-Signature: t=<unix>,v1=<hex>[,v1=…]`; signed payload `${t}.${body}`,
 * HMAC-SHA256 keyed with the whole `whsec_…` string; reject outside the tolerance window.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't' && /^\d+$/.test(v)) t = Number(v);
    else if (k === 'v1' && /^[0-9a-f]{64}$/.test(v)) v1.push(v);
  }
  if (t === null || v1.length === 0) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest();
  return v1.some((sig) => safeEqual(Buffer.from(sig, 'hex'), expected));
}

/** Beam: `X-Beam-Signature` = base64(HMAC-SHA256(base64-decoded key, raw body)) */
export function verifyBeamSignature(rawBody: string, header: string | null, keyBase64: string): boolean {
  if (!header || !keyBase64) return false;
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key).update(rawBody, 'utf8').digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.trim(), 'base64');
  } catch {
    return false;
  }
  return safeEqual(given, expected);
}

/** LINE Messaging API: `x-line-signature` = base64(HMAC-SHA256(channel secret, raw body)) */
export function verifyLineSignature(rawBody: string, header: string | null, channelSecret: string): boolean {
  if (!header || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();
  return safeEqual(Buffer.from(header.trim(), 'base64'), expected);
}
