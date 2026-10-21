/**
 * P4 money + notifications contract (worker F). Import from '@/lib/contracts/payment'.
 *
 * Customer (job-link token, publishable key — no server needed, R-011):
 *   rpc('job_pay_info', { p_token })              → PayInfoJson | null (null = unknown/revoked/driver link)
 *   storage 'payment-slips' upload at '<booking_id>/<uuid>.jpg' (anon, insert-only policy)
 *   rpc('job_pay_slip', { p_token, p_path })      → { payment_id, amount, replaced } · errors: not_payable, bad_path,
 *                                                    slip_not_uploaded, nothing_due, too_many_slips, link_not_found
 *   rpc('job_push_subscribe', …)                  (P0)
 *
 * Customer routes (token checked first → 404, then the service role → 503):
 *   POST /api/jobs/[token]/pay/verify   {}                    → VerifySlipResponse
 *   POST /api/jobs/[token]/pay/stripe   {}                    → CheckoutResponse
 *   POST /api/jobs/[token]/pay/beam     {}                    → CheckoutResponse
 *
 * Staff:
 *   POST /api/admin/payments/confirm      ReviewPaymentRequest      jobs.manage
 *   POST /api/admin/integrations          SaveIntegrationRequest    integrations.manage
 *   POST /api/admin/integrations/test     TestIntegrationRequest    integrations.manage
 *   POST /api/admin/integrations/push     PushKeysRequest           integrations.manage
 *
 * Providers (signature first; the secret lives in Vault so the service role is required → 503 otherwise):
 *   POST /api/webhooks/stripe · /api/webhooks/beam · /api/webhooks/line
 * Cron (Authorization: Bearer CRON_SECRET):
 *   GET  /api/cron/notify
 */
import { z } from 'zod';
import { ConfirmPaymentRequest, INTEGRATION_KEYS, UpdateIntegrationRequest } from './admin';

export const ReviewPaymentRequest = ConfirmPaymentRequest.extend({
  /** reject reason — the customer sees it on the job link */
  note: z.string().trim().max(300).default(''),
});

export const SaveIntegrationRequest = UpdateIntegrationRequest.extend({
  /** per-field secrets for integrations with several (Stripe key + webhook secret …): undefined keep · '' clear */
  secrets: z.record(z.string().regex(/^[A-Za-z]{2,40}$/), z.string().max(4000)).optional(),
});

export const TestIntegrationRequest = z.object({ key: z.enum([...INTEGRATION_KEYS, 'push']) });

export const PushKeysRequest = z.object({
  action: z.enum(['generate', 'rotate', 'enable', 'disable', 'subject']),
  subject: z.string().trim().max(200).optional(),
});

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

/** rpc('job_pay_info') */
export interface PayInfoJson {
  booking_id: string;
  booking_no: string;
  status: string;
  lang: 'th' | 'en';
  /** a deposit can be paid now */
  open: boolean;
  /** baht still owed for the deposit (recomputed in SQL) */
  due: number;
  deadline: string | null;
  promptpay: { id: string; name: string } | null;
  stripe: boolean;
  beam: boolean;
  slip_auto: boolean;
  slip: {
    id: string;
    status: 'pending' | 'verifying' | 'paid' | 'failed' | 'refunded' | 'cancelled';
    amount: number;
    uploaded_at: string;
    checked: boolean;
    note: string | null;
  } | null;
  paid: number;
  line: { basic_id: string; bound: boolean } | null;
  push_key: string | null;
}

export interface VerifySlipResponse {
  /** paid = auto-confirmed · review = staff checks it · */
  result: 'paid' | 'review';
  reason?: string;
}

export interface CheckoutResponse {
  url: string;
}

export interface ReviewPaymentResponse {
  payment_id: string;
  status: 'paid' | 'failed';
  booking_id: string;
  booking_status: string;
}

/** what the integrations page may show — never a secret value */
export interface IntegrationState {
  key: IntegrationKey;
  isEnabled: boolean;
  config: Record<string, string | number | boolean>;
  /** names of the secret fields that are set */
  secretFields: string[];
  updatedAt: string | null;
}

export interface PushConfigState {
  publicKey: string;
  subject: string;
  isEnabled: boolean;
  createdAt: string;
}

export interface TestIntegrationResponse {
  ok: boolean;
  message: string;
}
