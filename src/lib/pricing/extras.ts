import { planTrip } from './plan';
import { depositFor, priceTrip, round10 } from './price';
import type { Catalog, Plan, Rules, TripInput } from './types';

// ── quote mode ────────────────────────────────────────────────────────────────

/** is a trip on `date` ('YYYY-MM-DD') priced by staff instead of instantly? */
export function quoteModeActive(rules: Rules, date: string): boolean {
  const q = rules.quote;
  if (!q.enabled) return false;
  if (!q.use_range) return true;
  return date >= q.from && date <= q.to;
}

/** staff's starting point: cheapest valid mode + quote pct, rounded to 100 */
export function suggestedQuote(catalog: Catalog, referenceTotal: number) {
  const price = Math.round((referenceTotal * (1 + catalog.rules.quote.pct / 100)) / 100) * 100;
  return { price, deposit: depositFor(catalog, price), hours: catalog.rules.quote.hours };
}

// ── return trip offer ─────────────────────────────────────────────────────────

export interface ReturnQuote {
  plan: Plan;
  ok: boolean;
  base: number;
  discount: number;
  total: number;
  deposit: number;
}

/**
 * The way back after a one-way drop-off: same vehicle, pax and options,
 * priced as a one-way from `fromId` to `toId`, minus the return discount.
 */
export function returnQuote(
  catalog: Catalog,
  outbound: TripInput,
  o: { fromId: string; toId: string; date: string; time: string },
): ReturnQuote {
  const input: TripInput = {
    ...outbound,
    pickupId: o.fromId,
    stops: [{ placeId: o.toId, dwell: 0 }],
    roundTrip: false,
    date: o.date,
    time: o.time,
  };
  const plan = planTrip(catalog, input);
  const res = priceTrip(catalog, input, plan);
  const one = res.modes.oneway;
  const fallback = res.best ? res.modes[res.best] : null;
  const base = one.ok ? one.total : (fallback?.total ?? 0);
  const discount = round10((base * catalog.rules.return_offer.pct) / 100);
  const total = base - discount;
  return { plan, ok: one.ok, base, discount, total, deposit: depositFor(catalog, total) };
}

/** 'YYYY-MM-DD' + n days, calendar arithmetic only (no time zone involved) */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ── commission (ค่าน้ำ) ───────────────────────────────────────────────────────

export interface CommissionRule {
  type: 'head' | 'booking' | 'sale';
  amount: number;
  split_key: string;
}

export interface CommissionEstimate {
  total: number;
  driver: number;
  company: number;
  /** true while a percent-of-sale rule has no reported sale yet */
  estimated: boolean;
}

export function commissionFor(
  rules: Rules,
  rule: CommissionRule,
  pax: number,
  reportedSale?: number | null,
): CommissionEstimate {
  const hasSale = typeof reportedSale === 'number' && reportedSale >= 0;
  const sale = hasSale ? (reportedSale as number) : rules.commission.assumed_spend * pax;
  const total =
    rule.type === 'head' ? rule.amount * pax : rule.type === 'booking' ? rule.amount : Math.round((sale * rule.amount) / 100);
  const pct = rules.commission.splits[rule.split_key]?.driver_pct ?? 0;
  const driver = Math.round((total * pct) / 100);
  return { total, driver, company: total - driver, estimated: rule.type === 'sale' && !hasSale };
}
