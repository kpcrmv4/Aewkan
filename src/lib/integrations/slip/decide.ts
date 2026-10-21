/**
 * Auto-confirm only when everything is certain; anything else goes to staff review.
 *   paid  ⇐ amount ≥ due · receiver matches the PromptPay ID or the configured account ·
 *           a transRef no other payment used · not a provider duplicate · not older than the booking
 */
import { promptPayVariants } from '../promptpay';
import type { SlipDecision, SlipFacts, SlipOutcome } from './types';

/**
 * Compare a masked number printed on a slip ("xxx-x-x5678-x", "08xxxxxxxx89") with the real one.
 * true = every visible digit agrees · false = a visible digit disagrees · null = too little to tell.
 */
export function matchMasked(masked: string | null, actual: string): boolean | null {
  if (!masked) return null;
  const m = masked.replace(/[\s-]/g, '').toLowerCase();
  const a = actual.replace(/\D/g, '');
  if (!a || !/^[0-9x*•]+$/.test(m)) return null;
  const visible = m.replace(/\D/g, '');
  if (visible.length < 3) return null;
  if (m.length === a.length) return [...m].every((c, i) => !/\d/.test(c) || c === a[i]);
  const lead = /^\d+/.exec(m)?.[0] ?? '';
  const trail = /\d+$/.exec(m)?.[0] ?? '';
  const runs = m.split(/[^0-9]+/).filter(Boolean);
  return a.startsWith(lead) && a.endsWith(trail) && runs.every((r) => a.includes(r));
}

export function receiverMatches(facts: SlipFacts, expected: { promptpayId?: string | null; account?: string | null }): boolean | null {
  const candidates = [...(expected.promptpayId ? promptPayVariants(expected.promptpayId) : []), ...(expected.account ? [expected.account] : [])];
  if (!candidates.length) return null;
  let sawFalse = false;
  for (const printed of [facts.receiverProxy, facts.receiverAccount]) {
    for (const c of candidates) {
      const r = matchMasked(printed, c);
      if (r === true) return true;
      if (r === false) sawFalse = true;
    }
  }
  return sawFalse ? false : null;
}

export interface DecideInput {
  due: number;
  promptpayId: string | null;
  receiverAccount: string | null;
  /** another payment already carries this transRef */
  refUsedElsewhere: boolean;
  bookingCreatedAt: string;
}

export function decideSlip(outcome: SlipOutcome, input: DecideInput): SlipDecision {
  if (outcome.kind === 'error') return { result: 'review', reason: outcome.code };
  const f = outcome.facts;
  if (f.duplicate) return { result: 'review', reason: 'duplicate' };
  if (!f.transRef) return { result: 'review', reason: 'no_ref' };
  if (input.refUsedElsewhere) return { result: 'review', reason: 'duplicate_ref' };
  if (f.amount === null || f.amount < input.due) return { result: 'review', reason: 'amount_low' };
  // a transfer made more than a day before the booking existed cannot be this deposit
  if (f.at && Date.parse(f.at) < Date.parse(input.bookingCreatedAt) - 24 * 3600_000) return { result: 'review', reason: 'slip_too_old' };
  const match = receiverMatches(f, { promptpayId: input.promptpayId, account: input.receiverAccount });
  if (match === false) return { result: 'review', reason: 'receiver_mismatch' };
  if (match === null) return { result: 'review', reason: 'receiver_unknown' };
  return { result: 'paid', reason: 'verified' };
}
