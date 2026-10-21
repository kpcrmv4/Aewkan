import type { Catalog, Mode, ModePrice, NotOkReason, Plan, PriceLine, PriceResult, TripInput } from './types';
import { MODES } from './types';

export const round10 = (n: number) => Math.round(n / 10) * 10;

/** deposit = pct of total, rounded to deposit_round, never below deposit_min */
export function depositFor(catalog: Catalog, total: number): number {
  const r = catalog.rules;
  const step = r.deposit_round > 0 ? r.deposit_round : 100;
  return Math.max(r.deposit_min, Math.round((total * r.deposit_pct) / 100 / step) * step);
}

/**
 * Surcharges shared by every mode, applied in this order so the numbers are
 * reproducible: zone (not for one-way, which is priced by real km), mountain
 * stops, foreign-language driver, then night % and festival % on the subtotal.
 */
function withCommon(catalog: Catalog, input: TripInput, plan: Plan, base: PriceLine[], perKm: boolean) {
  const r = catalog.rules;
  const lines = [...base];
  const zone = r.zones.find((z) => z.id === plan.maxZone);
  if (zone && zone.surcharge && !perKm) {
    lines.push({ key: 'price.zone', vars: { zone: zone.id }, amount: zone.surcharge });
  }
  if (plan.mountainStops) {
    lines.push({ key: 'price.mountain', vars: { n: plan.mountainStops }, amount: r.mountain_fee * plan.mountainStops });
  }
  if (input.langDriver) lines.push({ key: 'price.langDriver', vars: {}, amount: r.lang_driver_fee });
  let sub = lines.reduce((s, l) => s + l.amount, 0);
  if (plan.night) {
    const a = round10((sub * r.night_pct) / 100);
    lines.push({ key: 'price.night', vars: { pct: r.night_pct }, amount: a });
    sub += a;
  }
  if (input.festival) {
    const a = round10((sub * r.season_pct) / 100);
    lines.push({ key: 'price.festival', vars: { pct: r.season_pct }, amount: a });
    sub += a;
  }
  return { lines, total: round10(sub) };
}

export function priceTrip(catalog: Catalog, input: TripInput, plan: Plan): PriceResult {
  const r = catalog.rules;
  const v = r.vehicles[input.vehicle];
  if (!v) throw new Error(`unknown_vehicle:${input.vehicle}`);
  const hours = plan.billMinutes / 60;
  const noStops = input.stops.length === 0;
  const notOk = (mode: Mode, reason: NotOkReason): ModePrice => ({ mode, ok: false, reason, lines: [], total: 0, units: 0 });

  const modes = {} as Record<Mode, ModePrice>;

  // hourly — billed hours rounded up, never below the minimum
  {
    const h = Math.max(r.min_hours, Math.ceil(hours - 1e-9));
    const base: PriceLine[] = [{ key: 'price.hours', vars: { h, rate: v.hourly }, amount: h * v.hourly }];
    const c = withCommon(catalog, input, plan, base, false);
    modes.hourly = noStops ? notOk('hourly', 'no_stops') : { mode: 'hourly', ok: true, reason: null, ...c, units: h };
  }
  // daily — includes hours and km per day, overtime and extra km on top
  const days = Math.max(1, Math.ceil(hours / r.max_day_hours - 1e-9));
  {
    const base: PriceLine[] = [{ key: 'price.days', vars: { d: days, rate: v.daily }, amount: days * v.daily }];
    const ot = Math.max(0, Math.ceil(hours - r.daily_inc_hours * days - 1e-9));
    if (ot) base.push({ key: 'price.overtime', vars: { h: ot, rate: r.ot_per_hour }, amount: ot * r.ot_per_hour });
    const xk = Math.max(0, Math.round(plan.km - r.daily_inc_km * days));
    if (xk) base.push({ key: 'price.extraKm', vars: { km: xk, rate: r.extra_km_rate }, amount: xk * r.extra_km_rate });
    const c = withCommon(catalog, input, plan, base, false);
    modes.daily = noStops ? notOk('daily', 'no_stops') : { mode: 'daily', ok: true, reason: null, ...c, units: days };
  }
  // trip — one all-inclusive price: daily + trip_pct, no overtime or extra km later
  {
    const b = days * v.daily;
    const base: PriceLine[] = [
      { key: 'price.days', vars: { d: days, rate: v.daily }, amount: b },
      { key: 'price.tripAllIn', vars: { pct: r.trip_pct }, amount: round10((b * r.trip_pct) / 100) },
    ];
    const c = withCommon(catalog, input, plan, base, false);
    modes.trip = noStops ? notOk('trip', 'no_stops') : { mode: 'trip', ok: true, reason: null, ...c, units: days };
  }
  // one-way — real km, empty repositioning share, paid stops on the way, no zone fee
  {
    const kmR = Math.round(plan.km);
    const base: PriceLine[] = [{ key: 'price.perKm', vars: { km: kmR, rate: v.per_km }, amount: kmR * v.per_km }];
    const er = Math.round(plan.emptyReturnKm);
    if (er) base.push({ key: 'price.emptyReturn', vars: { km: er, pct: r.empty_return_pct }, amount: round10((er * v.per_km * r.empty_return_pct) / 100) });
    const paidStops = input.stops.slice(0, -1).filter((s) => s.dwell > 0).length;
    if (paidStops) base.push({ key: 'price.stopFee', vars: { n: paidStops }, amount: paidStops * r.stop_fee });
    const c = withCommon(catalog, input, plan, base, true);
    if (noStops) modes.oneway = notOk('oneway', 'no_stops');
    else if (input.roundTrip) modes.oneway = { mode: 'oneway', ok: false, reason: 'needs_one_way', ...c, units: kmR };
    else if (plan.farZone < 3) modes.oneway = { mode: 'oneway', ok: false, reason: 'needs_far_zone', ...c, units: kmR };
    else modes.oneway = { mode: 'oneway', ok: true, reason: null, ...c, units: kmR };
  }

  const ok = MODES.filter((m) => modes[m].ok).sort((a, b) => modes[a].total - modes[b].total);
  return { modes, best: ok[0] ?? null };
}

/** the mode the customer sees selected: their pick if valid, else the cheapest */
export function effectiveMode(result: PriceResult, picked: Mode | null): Mode | null {
  if (picked && result.modes[picked].ok) return picked;
  return result.best;
}
