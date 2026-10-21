import { hrefWith } from '@/components/ui/filter-href';
import { ListToolbar, type FilterChip } from '@/components/ui/list-toolbar';
import { cleanSearch } from '@/features/admin-ops/helpers';
import { RefreshRetry } from '@/features/admin-ops/retry';
import { Pager } from '@/features/admin-ops/status-badge';
import { PLACE_CATEGORIES } from '@/lib/contracts/admin';
import { PLACES_COPY as C, PRICING_COPY } from '@/lib/copy/settings';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { PlaceRow } from './place-form';
import { PlacesManager } from './places-manager';

export const PLACES_PAGE_SIZE = 30;

export interface PlacesQuery {
  q: string;
  cat: string;
  page: number;
}

export async function PlacesView({ query }: { query: PlacesQuery }) {
  let el: React.ReactNode = null;
  let failed = false;
  try {
    el = await renderPlaces(query);
  } catch (e) {
    console.error('[places] list failed', e instanceof Error ? e.message : e);
    failed = true;
  }
  return failed ? <RefreshRetry message={C.loadError} /> : el;
}

async function renderPlaces(query: PlacesQuery) {
  const sb = await getSupabaseServer();
  const cat = (PLACE_CATEGORIES as readonly string[]).includes(query.cat) ? query.cat : 'all';
  const search = cleanSearch(query.q);
  const from = (query.page - 1) * PLACES_PAGE_SIZE;

  let list = sb
    .from('places')
    .select('id, name_th, name_en, category, is_pickup, is_mountain, default_dwell_min, is_hidden, lat, lng', { count: 'exact' })
    .order('name_th', { ascending: true })
    .order('id')
    .range(from, from + PLACES_PAGE_SIZE - 1);
  if (cat !== 'all') list = list.eq('category', cat);
  if (search) list = list.or(`name_th.ilike.%${search}%,name_en.ilike.%${search}%`);

  const { data, error, count } = await list;
  if (error) throw new Error(`places: ${error.message}`);

  const rows: PlaceRow[] = (data ?? []).map((p) => ({
    id: p.id,
    nameTh: p.name_th,
    nameEn: p.name_en,
    category: p.category,
    isPickup: p.is_pickup,
    isMountain: p.is_mountain,
    defaultDwellMin: p.default_dwell_min,
    isHidden: p.is_hidden,
    lat: p.lat,
    lng: p.lng,
  }));

  const filters: FilterChip[] = [{ key: 'all', label: C.all }, ...PLACE_CATEGORIES.map((c) => ({ key: c, label: C.categories[c] }))];
  const params = { cat: cat === 'all' ? undefined : cat, q: search || undefined };
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PLACES_PAGE_SIZE));

  return (
    <>
      <PlacesManager
        rows={rows}
        total={total}
        filtered={cat !== 'all' || !!search}
        toolbar={
          <div data-testid="places-filters">
            <ListToolbar basePath="/admin/places" q={search} filters={filters} activeFilter={cat} filterParam="cat" placeholder={C.search} />
          </div>
        }
      />
      <Pager
        prevHref={query.page > 1 ? hrefWith('/admin/places', params, { page: query.page - 1 <= 1 ? null : query.page - 1 }) : null}
        nextHref={query.page < pages ? hrefWith('/admin/places', params, { page: query.page + 1 }) : null}
        label={PRICING_COPY.pageOf(query.page, pages)}
      />
    </>
  );
}
