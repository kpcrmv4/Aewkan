/**
 * PromptPay EMV payload (pure, works in the browser). The QR image is drawn from this
 * string with `qrcode`; the amount is the deposit in whole baht.
 */
import generatePayload from 'promptpay-qr';

export const PROMPTPAY_ID_RE = /^(\d{10}|\d{13}|\d{15})$/;

export function promptPayPayload(id: string, amountBaht: number): string {
  const clean = id.replace(/\D/g, '');
  if (!PROMPTPAY_ID_RE.test(clean)) throw new Error('bad_promptpay_id');
  if (!Number.isInteger(amountBaht) || amountBaht <= 0) throw new Error('bad_amount');
  return generatePayload(clean, { amount: amountBaht });
}

/** 0812345678 → 081-234-5678 · 13 digits → 1-2345-67890-12-3 · others unchanged */
export function formatPromptPayId(id: string): string {
  const d = id.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 13) return `${d.slice(0, 1)}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d.slice(12)}`;
  return d;
}

/** the forms a slip may print for this PromptPay ID (a phone also appears as 66…) */
export function promptPayVariants(id: string): string[] {
  const d = id.replace(/\D/g, '');
  if (!d) return [];
  const out = [d];
  if (d.length === 10 && d.startsWith('0')) out.push(`66${d.slice(1)}`, `0066${d.slice(1)}`);
  return out;
}
