/**
 * SlipOK adapter (R-002 default).
 *   POST https://api.slipok.com/api/line/apikey/<branchId>
 *   header  x-authorization: <api key>
 *   body    multipart: files=<image>, log=true (SlipOK remembers the slip → later 1012 duplicate)
 * Success: { success: true, data: { transRef, amount, transTimestamp | transDate+transTime,
 *            receiver: { displayName, name, proxy: { type, value }, account: { type, value } } } }
 * Error:   HTTP 400 { code: 1012, message, data? } — 1010 bank delay · 1012 duplicate ·
 *          1013 amount mismatch · 1014 receiver mismatch · 1007/1008/1011 no / not a payment QR.
 * Shape from SlipOK's public API page (their docs site refused automated fetches — 403); parsing
 * is defensive and anything unexpected ends in staff review, never in an auto-confirm.
 */
import type { SlipFacts, SlipOutcome } from './types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};

function slipOkTime(d: Obj): string | null {
  const ts = str(d.transTimestamp);
  if (ts && !Number.isNaN(Date.parse(ts))) return new Date(ts).toISOString();
  const date = str(d.transDate);
  const time = str(d.transTime);
  if (date && /^\d{8}$/.test(date)) {
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time && /^\d{2}:\d{2}(:\d{2})?$/.test(time) ? time : '00:00:00'}+07:00`;
    return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
  }
  return null;
}

export function factsFromSlipOk(d: Obj, duplicate = false): SlipFacts {
  const receiver = obj(d.receiver) ?? {};
  return {
    transRef: str(d.transRef),
    amount: num(d.amount),
    receiverAccount: str(obj(receiver.account)?.value),
    receiverProxy: str(obj(receiver.proxy)?.value),
    receiverName: str(receiver.displayName) ?? str(receiver.name),
    at: slipOkTime(d),
    duplicate,
  };
}

const CODE: Record<string, string> = {
  '1010': 'bank_delay',
  '1012': 'duplicate',
  '1013': 'amount_mismatch',
  '1014': 'receiver_mismatch',
  '1007': 'no_qr',
  '1008': 'not_payment_qr',
  '1011': 'qr_expired',
  '1002': 'provider_auth',
  '1003': 'provider_quota',
  '1004': 'provider_quota',
};

export function parseSlipOk(httpStatus: number, body: unknown): SlipOutcome {
  const b = obj(body);
  if (!b) return { kind: 'error', code: 'provider_bad_response', message: `HTTP ${httpStatus}` };
  const data = obj(b.data);
  if (httpStatus >= 200 && httpStatus < 300 && b.success === true && data && data.success !== false) {
    return { kind: 'facts', facts: factsFromSlipOk(data) };
  }
  const raw = str(b.code) ?? '';
  const code = CODE[raw] ?? (raw ? `slipok_${raw}` : 'provider_error');
  const message = str(b.message) ?? `HTTP ${httpStatus}`;
  return { kind: 'error', code, message, facts: data ? factsFromSlipOk(data, code === 'duplicate') : undefined };
}

export async function callSlipOk(cfg: { apiKey: string; branchId: string }, image: Blob, fetchImpl: typeof fetch = fetch): Promise<SlipOutcome> {
  const form = new FormData();
  form.append('files', image, 'slip.jpg');
  form.append('log', 'true');
  const res = await fetchImpl(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(cfg.branchId)}`, {
    method: 'POST',
    headers: { 'x-authorization': cfg.apiKey },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  return parseSlipOk(res.status, body);
}
