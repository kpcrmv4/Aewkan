import { hrefWith } from '@/components/ui/filter-href';
import { DRIVERS_COPY as C, JOBS_COPY } from '@/lib/copy/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { loadVehicles, vehicleName } from './data';
import { DriversManager, type DriverRow } from './drivers-manager';
import { RefreshRetry } from './retry';
import { Pager } from './status-badge';

const SIZE = 50;

export async function DriversView({ page }: { page: number }) {
  let el: React.ReactNode = null;
  let failed = false;
  try {
    el = await renderDrivers(page);
  } catch (e) {
    console.error('[drivers] failed', e instanceof Error ? e.message : e);
    failed = true;
  }
  return failed ? <RefreshRetry message={C.loadError} /> : el;
}

async function renderDrivers(page: number) {
  {
    const sb = await getSupabaseServer();
    const from = (page - 1) * SIZE;
    const [res, vehicles] = await Promise.all([
      sb
        .from('drivers')
        .select('id, full_name, nickname, name_en, phone, line_id, langs, langs_en, vehicle_key, car_th, car_en, plate, years, note, is_active', { count: 'exact' })
        .order('is_active', { ascending: false })
        .order('nickname', { ascending: true })
        .order('id')
        .range(from, from + SIZE - 1),
      loadVehicles(sb),
    ]);
    if (res.error) throw new Error(`drivers: ${res.error.message}`);
    const rows: DriverRow[] = (res.data ?? []).map((d) => ({
      id: d.id,
      fullName: d.full_name,
      nickname: d.nickname,
      nameEn: d.name_en,
      phone: d.phone,
      lineId: d.line_id,
      langs: d.langs,
      langsEn: d.langs_en,
      vehicleKey: d.vehicle_key,
      carTh: d.car_th,
      carEn: d.car_en,
      plate: d.plate,
      years: d.years,
      note: d.note,
      isActive: d.is_active,
    }));
    const options = Object.entries(vehicles)
      .sort((a, b) => (a[1].sort ?? 0) - (b[1].sort ?? 0))
      .map(([key]) => ({ key, label: vehicleName(vehicles, key) }));
    const labels = Object.fromEntries(Object.keys(vehicles).map((k) => [k, vehicleName(vehicles, k)]));
    const pages = Math.max(1, Math.ceil((res.count ?? 0) / SIZE));
    return (
      <>
        <DriversManager drivers={rows} vehicles={options} vehicleLabels={labels} />
        <Pager
          prevHref={page > 1 ? hrefWith('/admin/drivers', {}, { page: page - 1 <= 1 ? null : page - 1 }) : null}
          nextHref={page < pages ? hrefWith('/admin/drivers', {}, { page: page + 1 }) : null}
          label={JOBS_COPY.pageOf(page, pages)}
        />
      </>
    );
  }
}
