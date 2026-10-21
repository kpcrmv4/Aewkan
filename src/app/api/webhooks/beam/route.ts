import { ApiError } from '@/lib/api/handler';
import { beamPaidFrom } from '@/lib/integrations/beam';
import { loadIntegration } from '@/lib/integrations/server';
import { verifyBeamSignature } from '@/lib/integrations/signatures';
import { markEvent, rawRoute, seenEvent, settleOnline } from '@/lib/integrations/webhook';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Beam → POST /api/webhooks/beam. X-Beam-Signature = base64 HMAC-SHA256 of the raw body with
 * the base64-decoded webhook key (in Vault → service role first, else 503 and Beam retries).
 * payment_link.paid and charge.succeeded (source PAYMENT_LINK) both settle the same row once.
 */
export async function POST(req: Request) {
  return rawRoute(async () => {
    const raw = await req.text();
    const admin = getSupabaseAdmin();
    const beam = await loadIntegration(admin, 'beam');
    const key = beam.secret.webhookKey;
    if (!key) throw new ApiError(503, 'provider_not_configured', 'beam webhook key not set');
    if (!verifyBeamSignature(raw, req.headers.get('x-beam-signature'), key)) throw new ApiError(400, 'bad_signature', 'invalid signature');

    const event = req.headers.get('x-beam-event');
    const paid = beamPaidFrom(event, JSON.parse(raw));
    if (!paid) return { received: true, outcome: 'ignored' };
    if (await seenEvent(admin, 'beam', paid.eventKey)) return { received: true, duplicate: true };

    const { data: p, error } = await admin.from('payments').select('id').eq('method', 'beam').eq('provider_ref', paid.linkId).maybeSingle();
    if (error) throw new Error(`beam payment lookup: ${error.message}`);
    let outcome = 'unknown_link';
    if (p && (!paid.referenceId || paid.referenceId === p.id)) {
      const r = await settleOnline(admin, p.id, {
        method: 'beam',
        amountSatang: paid.amount,
        currency: paid.currency,
        providerRef: paid.linkId,
        result: { event, link: paid.linkId },
      });
      outcome = r.settled ? 'paid' : (r.reason ?? 'not_settled');
    }
    await markEvent(admin, 'beam', paid.eventKey);
    return { received: true, outcome };
  });
}
