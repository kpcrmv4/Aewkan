import { expect, type Page } from '@playwright/test';
import { catalogFromJson, effectiveMode, planTrip, priceTrip, type Catalog, type PublicCatalogJson, type TripInput } from '../../src/lib/pricing';
import { formatTripDate } from '../../src/lib/format';
import { initialState, toInput } from '../../src/features/trip-builder/state';

/** the same public catalog the page renders from (anon RPC), so expected values come from src/lib/pricing */
export async function loadCatalog(): Promise<{ json: PublicCatalogJson; catalog: Catalog }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_public_catalog`, {
    method: 'POST',
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const json = (await res.json()) as PublicCatalogJson;
  return { json, catalog: catalogFromJson(json) };
}

export const NORMAL_DATE = '2026-11-10';
export const QUOTE_DATE = '2026-12-28';

/** what the page shows on first paint, with the date pinned */
export function firstScreen(catalog: Catalog, json: PublicCatalogJson, date = NORMAL_DATE) {
  const state = { ...initialState(catalog, json.templates, '2026-10-21'), date };
  const input: TripInput = toInput(state);
  const plan = planTrip(catalog, input);
  const res = priceTrip(catalog, input, plan);
  return { state, input, plan, res, mode: effectiveMode(res, state.mode) };
}

export async function openBuilder(page: Page, date = NORMAL_DATE, path = '/') {
  await page.context().addCookies([{ name: 'lang', value: 'th', url: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100' }]);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // wait for hydration (React attaches its props to the node): an earlier fill would be lost
  await page.waitForFunction(() => {
    const el = document.querySelector('input[type=date]');
    return Boolean(el) && Object.keys(el as object).some((k) => k.startsWith('__reactProps'));
  });
  await page.getByLabel('วันเดินทาง').fill(date);
  await expect(page.locator('#trip-title + span')).toHaveText(formatTripDate(date, 'th'));
}

export const hasKey = Boolean(process.env.SUPABASE_SECRET_KEY);
export const NEEDS_KEY = 'NOT RUN: needs SUPABASE_SECRET_KEY';
