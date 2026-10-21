import {
  effectiveMode,
  planTrip,
  priceTrip,
  quoteModeActive,
  tripWarnings,
  type Catalog,
  type Mode,
  type Plan,
  type PriceResult,
  type TripInput,
  type TripWarning,
} from '@/lib/pricing';
import type { Lang } from '@/components/public/lang';
import { toInput, type BuilderState } from './state';

/** everything the panels render, derived from state + catalog in one pass */
export interface Model {
  catalog: Catalog;
  lang: Lang;
  state: BuilderState;
  input: TripInput;
  plan: Plan;
  res: PriceResult;
  /** the card that is selected (picked if valid, else cheapest) */
  mode: Mode | null;
  warnings: TripWarning[];
  quote: boolean;
}

export function buildModel(catalog: Catalog, state: BuilderState, lang: Lang): Model {
  const input = toInput(state);
  const plan = planTrip(catalog, input);
  const res = priceTrip(catalog, input, plan);
  return {
    catalog,
    lang,
    state,
    input,
    plan,
    res,
    mode: effectiveMode(res, state.mode),
    warnings: tripWarnings(catalog, input, plan),
    quote: quoteModeActive(catalog.rules, state.date),
  };
}

export const nameOf = (p: { name_th: string; name_en: string }, lang: Lang) => (lang === 'en' ? p.name_en : p.name_th);

/** can the customer send this trip? */
export function bookable(m: Model): boolean {
  return m.state.stops.length > 0 && m.mode !== null && !m.warnings.some((w) => w.kind === 'too_many_pax');
}
