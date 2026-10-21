import { after } from 'next/server';
import { z } from 'zod';
import { ApiError, publicRoute } from '@/lib/api/handler';
import type { VerifySlipResponse } from '@/lib/contracts/payment';
import type { Json } from '@/lib/database.types';
import { loadIntegration, payInfoFor, ready } from '@/lib/integrations/server';
import { callEasySlip } from '@/lib/integrations/slip/easyslip';
import { decideSlip } from '@/lib/integrations/slip/decide';
import { callSlipOk } from '@/lib/integrations/slip/slipok';
import type { SlipOutcome } from '@/lib/integrations/slip/types';
import { notifyBooking } from '@/lib/notify';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * POST /api/jobs/[token]/pay/verify — check the pending slip once with the configured
 * provider (R-002). Certain → paid + confirmed; anything else → stays for staff review.
 * Token first (404), then the service role (503 — the slip simply waits for staff).
 */
export const POST = publicRoute(
  async (_req, params) => payInfoFor(params.token),
  z.object({}),
  async ({ auth: info }): Promise<VerifySlipResponse> => {
    const slip = info.slip;
    if (!slip || (slip.status !== 'pending' && slip.status !== 'verifying')) throw new ApiError(409, 'no_pending_slip', 'ไม่มีสลิปรอตรวจ');
    if (slip.checked) return { result: 'review', reason: 'already_checked' };

    const admin = getSupabaseAdmin();
    const cfg = await loadIntegration(admin, 'slip');
    if (!ready(cfg)) throw new ApiError(503, 'provider_not_configured', 'ยังไม่ได้ตั้งค่าการตรวจสลิปอัตโนมัติ');

    // claim the slip (pending → verifying) so two calls never pay the provider twice
    const { data: claimed, error: cErr } = await admin
      .from('payments')
      .update({ status: 'verifying' })
      .eq('id', slip.id)
      .eq('status', 'pending')
      .select('id, booking_id, amount, slip_path, verify_result')
      .maybeSingle();
    if (cErr) throw new Error(`claim slip: ${cErr.message}`);
    if (!claimed?.slip_path) return { result: 'review', reason: 'in_progress' };

    const provider = cfg.config.provider === 'easyslip' ? 'easyslip' : 'slipok';
    let outcome: SlipOutcome;
    let decision: { result: 'paid' | 'review'; reason: string } = { result: 'review', reason: 'provider_error' };
    try {
      const file = await admin.storage.from('payment-slips').download(claimed.slip_path);
      if (file.error || !file.data) throw new Error(`download: ${file.error?.message}`);
      outcome =
        provider === 'easyslip'
          ? await callEasySlip({ apiKey: cfg.secret.apiKey }, file.data)
          : await callSlipOk({ apiKey: cfg.secret.apiKey, branchId: cfg.config.branchId ?? '' }, file.data);

      const ref = outcome.kind === 'facts' ? outcome.facts.transRef : null;
      const [pp, used, booking, due] = await Promise.all([
        loadIntegration(admin, 'promptpay'),
        ref
          ? admin.from('payments').select('id').eq('method', 'promptpay_slip').eq('provider_ref', ref).neq('id', claimed.id).limit(1)
          : Promise.resolve({ data: [], error: null }),
        admin.from('bookings').select('created_at').eq('id', claimed.booking_id).single(),
        admin.rpc('deposit_due', { p_booking: claimed.booking_id }),
      ]);
      if (used.error || booking.error || due.error) throw new Error(`lookups: ${(used.error ?? booking.error ?? due.error)?.message}`);
      decision = decideSlip(outcome, {
        due: Number(due.data ?? claimed.amount),
        promptpayId: pp.config.id ?? null,
        receiverAccount: cfg.config.receiverAccount ?? null,
        refUsedElsewhere: (used.data ?? []).length > 0,
        bookingCreatedAt: booking.data.created_at,
      });

      const check = {
        provider,
        result: decision.result,
        reason: decision.reason,
        facts: outcome.kind === 'facts' ? outcome.facts : (outcome.facts ?? null),
        error: outcome.kind === 'error' ? { code: outcome.code, message: outcome.message.slice(0, 200) } : null,
        at: new Date().toISOString(),
      };
      const prev = (claimed.verify_result ?? {}) as Record<string, unknown>;
      const { error: nErr } = await admin
        .from('payments')
        .update({ verify_result: JSON.parse(JSON.stringify({ ...prev, check })) as Json })
        .eq('id', claimed.id);
      if (nErr) throw new Error(`record check: ${nErr.message}`);

      if (decision.result === 'paid') {
        const { data: settled, error: sErr } = await admin.rpc('payment_settle', {
          p_payment: claimed.id,
          p_provider_ref: ref!,
          p_result: { provider, transRef: ref } as never,
          p_actor: `slip:${provider}`,
        });
        if (sErr) {
          // 23505: the transRef is already on another payment (race) → staff
          decision = { result: 'review', reason: sErr.code === '23505' ? 'duplicate_ref' : 'settle_failed' };
        } else if ((settled as { confirmed?: boolean } | null)?.confirmed) {
          after(() => notifyBooking(claimed.booking_id, 'confirmed').then(() => undefined));
        }
      }
    } catch (e) {
      console.error('[pay/verify] provider check failed', e instanceof Error ? e.message : e);
      decision = { result: 'review', reason: 'provider_error' };
    } finally {
      if (decision.result === 'review') {
        await admin.from('payments').update({ status: 'pending' }).eq('id', claimed.id).eq('status', 'verifying');
      }
    }
    if (decision.result === 'review') {
      after(async () => {
        await notifyBooking(claimed.booking_id, 'deposit_received');
        await notifyBooking(claimed.booking_id, 'slip_review');
      });
    }
    return decision;
  },
);
