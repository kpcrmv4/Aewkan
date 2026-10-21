/**
 * EasySlip adapter (API v2, document.easyslip.com/en/v2/verify/bank/image).
 *   POST https://api.easyslip.com/v2/verify/bank
 *   header  Authorization: Bearer <api key>
 *   body    multipart: image=<file>, checkDuplicate=true
 * Success: { success: true, data: { isDuplicate, amountInSlip, rawSlip: { transRef, date, amount: { amount },
 *            receiver: { account: { name: { th, en }, bank?: { account }, proxy?: { account } } } } } }
 * Error:   { success: false, error: { code: 'SLIP_NOT_FOUND' | 'SLIP_PENDING' | 'QUOTA_EXCEEDED' | … , message } }
 */
import type { SlipFacts, SlipOutcome } from './types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function factsFromEasySlip(data: Obj): SlipFacts {
  const raw = obj(data.rawSlip) ?? {};
  const receiver = obj(raw.receiver) ?? {};
  const account = obj(receiver.account) ?? {};
  const name = obj(account.name) ?? {};
  const at = str(raw.date);
  return {
    transRef: str(raw.transRef),
    amount: num(obj(raw.amount)?.amount) ?? num(data.amountInSlip),
    receiverAccount: str(obj(account.bank)?.account),
    receiverProxy: str(obj(account.proxy)?.account),
    receiverName: str(name.th) ?? str(name.en),
    at: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null,
    duplicate: data.isDuplicate === true,
  };
}

const CODE: Record<string, string> = {
  SLIP_NOT_FOUND: 'no_qr',
  SLIP_PENDING: 'bank_delay',
  QUOTA_EXCEEDED: 'provider_quota',
  INVALID_API_KEY: 'provider_auth',
  MISSING_API_KEY: 'provider_auth',
  IP_NOT_ALLOWED: 'provider_auth',
  IMAGE_SIZE_TOO_LARGE: 'image_too_large',
  INVALID_IMAGE_FORMAT: 'not_image',
};

export function parseEasySlip(httpStatus: number, body: unknown): SlipOutcome {
  const b = obj(body);
  if (!b) return { kind: 'error', code: 'provider_bad_response', message: `HTTP ${httpStatus}` };
  const data = obj(b.data);
  if (b.success === true && data && obj(data.rawSlip)) {
    const facts = factsFromEasySlip(data);
    return facts.duplicate ? { kind: 'error', code: 'duplicate', message: 'duplicate slip', facts } : { kind: 'facts', facts };
  }
  const err = obj(b.error);
  const raw = str(err?.code) ?? '';
  return { kind: 'error', code: CODE[raw] ?? (raw ? `easyslip_${raw.toLowerCase()}` : 'provider_error'), message: str(err?.message) ?? `HTTP ${httpStatus}` };
}

export async function callEasySlip(cfg: { apiKey: string }, image: Blob, fetchImpl: typeof fetch = fetch): Promise<SlipOutcome> {
  const form = new FormData();
  form.append('image', image, 'slip.jpg');
  form.append('checkDuplicate', 'true');
  const res = await fetchImpl('https://api.easyslip.com/v2/verify/bank', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  return parseEasySlip(res.status, body);
}
