import { SegmentedFilter } from '@/components/ui/filter-bar';
import { hrefWith } from '@/components/ui/filter-href';
import { FilterSelect } from '@/components/ui/filter-select';
import { UUID_RE } from '@/features/admin-ops/helpers';
import { RefreshRetry } from '@/features/admin-ops/retry';
import { Pager } from '@/features/admin-ops/status-badge';
import { PRICING_COPY, SEGMENTS_COPY as C } from '@/lib/copy/settings';
import { getSupabaseServer } from '@/lib/supabase/server';
import { SegmentsManager, type SegmentRow, type SegmentPlace } from './segments-manager';
import { stamp } from './stamp';

export const SEGMENTS_PAGE_SIZE = 30;
const SOURCES = ['driven', 'checkins', 'routing'] as const;

export interface SegmentsQuery {
  src: string;
  place: string;
  page: number;
}

export async function SegmentsView({ query }: { query: SegmentsQuery }) {
  let el: React.ReactNode = null;
  let failed = false;
  try {
    el = await renderSegments(query);
  } catch (e) {
    console.error('[segments] list failed', e instanceof Error ? e.message : e);
    failed = true;
  }
  return failed ? <RefreshRetry message={C.loadError} /> : el;
}

async function renderSegments(query: SegmentsQuery) {
  const sb = await getSupabaseServer();
  const src = (SOURCES as readonly string[]).includes(query.src) ? query.src : 'all';
  const place = UUID_RE.test(query.place) ? query.place.toLowerCase() : 'all';
  const from = (query.page - 1) * SEGMENTS_PAGE_SIZE;

  let list = sb
    .from('segments')
    .select('place_a, place_b, source, km, minutes, samples, note, measured_at', { count: 'exact' })
    .order('measured_at', { ascending: false })
    .order('place_a')
    .order('place_b')
    .order('source')
    .range(from, from + SEGMENTS_PAGE_SIZE - 1);
  if (src !== 'all') list = list.eq('source', src);
  if (place !== 'all') list = list.or(`place_a.eq.${place},place_b.eq.${place}`);

  const [listRes, placesRes] = await Promise.all([list, sb.from('places').select('id, name_th').order('name_th').order('id').range(0, 999)]);
  if (listRes.error) throw new Error(`segments: ${listRes.error.message}`);
  if (placesRes.error) throw new Error(`places: ${placesRes.error.message}`);

  const places: SegmentPlace[] = (placesRes.data ?? []).map((p) => ({ id: p.id, name: p.name_th }));
  const names = new Map(places.map((p) => [p.id, p.name]));
  const rows: SegmentRow[] = (listRes.data ?? []).map((s) => ({
    a: s.place_a,
    b: s.place_b,
    aName: names.get(s.place_a) ?? '—',
    bName: names.get(s.place_b) ?? '—',
    source: s.source as SegmentRow['source'],
    km: Number(s.km),
    minutes: s.minutes,
    samples: s.samples,
    note: s.note,
    measuredLabel: stamp(s.measured_at),
  }));

  const params = { tab: 'segments', src: src === 'all' ? undefined : src, place: place === 'all' ? undefined : place };
  const total = listRes.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / SEGMENTS_PAGE_SIZE));

  const filters = (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="segments-filters">
      <div className="max-w-full overflow-x-auto no-scrollbar">
        <SegmentedFilter
          basePath="/admin/places"
          params={params}
          name="src"
          value={src}
          label={C.sourceLabel}
          options={[
            { value: 'all', label: C.sources.all },
            { value: 'driven', label: C.sources.driven },
            { value: 'checkins', label: C.sources.checkins },
            { value: 'routing', label: C.sources.routing },
          ]}
        />
      </div>
      <div className="min-w-0 sm:w-64">
        <FilterSelect
          basePath="/admin/places"
          params={params}
          name="place"
          value={place}
          label={C.placeLabel}
          options={[{ value: 'all', label: C.allPlaces }, ...places.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </div>
    </div>
  );

  return (
    <>
      <SegmentsManager rows={rows} places={places} filtered={src !== 'all' || place !== 'all'} filters={filters} total={total} />
      <Pager
        prevHref={query.page > 1 ? hrefWith('/admin/places', params, { page: query.page - 1 <= 1 ? null : query.page - 1 }) : null}
        nextHref={query.page < pages ? hrefWith('/admin/places', params, { page: query.page + 1 }) : null}
        label={PRICING_COPY.pageOf(query.page, pages)}
      />
    </>
  );
}
