'use client';

import imageCompression from 'browser-image-compression';
import { useQuery } from '@tanstack/react-query';
import type { CheckoutResponse, PayInfoJson, VerifySlipResponse } from '@/lib/contracts/payment';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const BUCKET = 'payment-slips';
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export const payInfoKey = (token: string) => ['pay-info', token] as const;

/** rpc('job_pay_info') with the publishable key; null for a driver link */
export function usePayInfo(token: string, status: string, opts: { pollMs?: number; maxPolls?: number } = {}) {
  return useQuery({
    queryKey: [...payInfoKey(token), status],
    staleTime: 15_000,
    refetchInterval: (query) =>
      opts.pollMs && query.state.data?.open !== false && query.state.dataUpdateCount < (opts.maxPolls ?? Infinity) ? opts.pollMs : false,
    queryFn: async (): Promise<PayInfoJson | null> => {
      const { data, error } = await getSupabaseBrowser().rpc('job_pay_info', { p_token: token });
      if (error) throw new Error(error.message);
      return (data as unknown as PayInfoJson | null) ?? null;
    },
  });
}

export class SlipError extends Error {
  constructor(readonly code: 'not_image' | 'too_big' | 'compress' | 'upload' | string) {
    super(code);
  }
}

/** '<booking_id>/<uuid>.jpg' — the storage policy only accepts this shape for a booking that takes a deposit */
export const slipPath = (bookingId: string, id: string) => `${bookingId}/${id}.jpg`;

/** compress to a readable JPEG, upload with the anon client, then record it (SQL recomputes the amount) */
export async function uploadSlip(token: string, bookingId: string, file: File): Promise<{ paymentId: string }> {
  if (!file.type.startsWith('image/')) throw new SlipError('not_image');
  if (file.size > MAX_INPUT_BYTES) throw new SlipError('too_big');
  let blob: Blob;
  try {
    // the QR on the slip must stay sharp: keep up to 2000 px and good quality
    blob = await imageCompression(file, { maxWidthOrHeight: 2000, maxSizeMB: 2, fileType: 'image/jpeg', initialQuality: 0.85, useWebWorker: false });
  } catch {
    throw new SlipError('compress');
  }
  const sb = getSupabaseBrowser();
  const path = slipPath(bookingId, crypto.randomUUID());
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new SlipError('upload');
  const { data, error } = await sb.rpc('job_pay_slip', { p_token: token, p_path: path });
  if (error) throw new SlipError(error.message);
  return { paymentId: (data as { payment_id: string }).payment_id };
}

type Api<T> = { ok: true; data: T } | { ok: false; code: string; status: number };

async function post<T>(url: string): Promise<Api<T>> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const json = (await res.json().catch(() => null)) as (T & { error?: { code: string } }) | null;
    if (!res.ok || !json || json.error) return { ok: false, code: json?.error?.code ?? 'internal', status: res.status };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: 'network', status: 0 };
  }
}

/** ask the server to check the slip now; 503 (no provider / no service role) just means "staff will check" */
export const verifySlip = (token: string) => post<VerifySlipResponse>(`/api/jobs/${encodeURIComponent(token)}/pay/verify`);

export const startCheckout = (token: string, method: 'stripe' | 'beam') => post<CheckoutResponse>(`/api/jobs/${encodeURIComponent(token)}/pay/${method}`);
