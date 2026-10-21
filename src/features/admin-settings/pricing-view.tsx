import { History } from 'lucide-react';
import { hrefWith } from '@/components/ui/filter-href';
import { ListRow } from '@/components/ui/list-row';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { RefreshRetry } from '@/features/admin-ops/retry';
import { Pager } from '@/features/admin-ops/status-badge';
import { can, type StaffSession } from '@/lib/auth/staff';
import { loadPublicCatalog } from '@/lib/catalog/server';
import { PRICING_COPY as C } from '@/lib/copy/settings';
import type { Rules } from '@/lib/pricing';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CommissionManager, type CommissionRow, type PlaceOption, type SplitOption } from './commission-manager';
import { RulesEditor } from './rules-editor';
import { stamp } from './stamp';

const HISTORY_SIZE = 20;

export type PricingTab = 'rules' | 'commission' | 'history';

/** each tab renders inside its own try/catch so a failed query shows retry, not a crashed page */
export async function PricingView({ tab, page, staff }: { tab: PricingTab; page: number; staff: StaffSession }) {
  let el: React.ReactNode = null;
  let version: number | null = null;
  let failed = false;
  try {
    const sb = await getSupabaseServer();
    const { data, error } = await sb.from('pricing_rule_sets').select('version').eq('is_current', true).maybeSingle();
    if (error) throw new Error(`version: ${error.message}`);
    version = data?.version ?? null;
    el = tab === 'history' ? await renderHistory(page) : tab === 'commission' ? await renderCommission(staff) : await renderRules();
  } catch (e) {
    console.error('[pricing] view failed', tab, e instanceof Error ? e.message : e);
    failed = true;
  }
  if (failed) return <RefreshRetry message={C.loadError} />;
  return (
    <>
      <p className="mb-3 text-sm text-muted-token" data-testid="rules-version">
        {version === null ? C.noRules : C.version(version)}
      </p>
      {el}
    </>
  );
}

async function renderRules() {
  const { catalog } = await loadPublicCatalog();
  // key by version: after a publish the draft restarts from the new current rules
  return <RulesEditor key={catalog.ruleVersion} catalog={catalog} />;
}

async function renderHistory(page: number) {
  const sb = await getSupabaseServer();
  const from = (page - 1) * HISTORY_SIZE;
  const { data, error, count } = await sb
    .from('pricing_rule_sets')
    .select('version, note, is_current, created_by, created_at', { count: 'exact' })
    .order('version', { ascending: false })
    .range(from, from + HISTORY_SIZE - 1);
  if (error) throw new Error(`history: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: staff, error: sErr } = await sb.from('staff').select('id, full_name').in('id', ids).order('id').range(0, 199);
    if (sErr) throw new Error(`staff: ${sErr.message}`);
    for (const s of staff ?? []) names.set(s.id, s.full_name);
  }
  const pages = Math.max(1, Math.ceil((count ?? 0) / HISTORY_SIZE));
  if (rows.length === 0) return <EmptyState icon={History} message={C.history.empty} />;
  return (
    <>
      <div className="panel" data-testid="rules-history">
        {rows.map((r) => (
          <ListRow
            key={r.version}
            title={
              <>
                <span className="tnum">v{r.version}</span> · {r.note || C.history.noNote}
              </>
            }
            meta={`${stamp(r.created_at)} · ${C.history.by} ${r.created_by ? (names.get(r.created_by) ?? C.history.unknownUser) : C.history.unknownUser}`}
            aside={r.is_current ? <Badge tone="done">{C.history.current}</Badge> : undefined}
          />
        ))}
      </div>
      <Pager
        prevHref={page > 1 ? hrefWith('/admin/pricing', { tab: 'history' }, { page: page - 1 <= 1 ? null : page - 1 }) : null}
        nextHref={page < pages ? hrefWith('/admin/pricing', { tab: 'history' }, { page: page + 1 }) : null}
        label={C.pageOf(page, pages)}
      />
    </>
  );
}

async function renderCommission(staff: StaffSession) {
  const sb = await getSupabaseServer();
  const [rulesRes, commRes, placesRes] = await Promise.all([
    sb.from('pricing_rule_sets').select('rules').eq('is_current', true).maybeSingle(),
    sb.from('commission_rules').select('place_id, type, amount, split_key, note').order('place_id').range(0, 499),
    sb.from('places').select('id, name_th, is_hidden').order('name_th').order('id').range(0, 999),
  ]);
  if (rulesRes.error) throw new Error(`rules: ${rulesRes.error.message}`);
  if (commRes.error) throw new Error(`commission: ${commRes.error.message}`);
  if (placesRes.error) throw new Error(`places: ${placesRes.error.message}`);
  const rules = rulesRes.data?.rules as Partial<Rules> | undefined;
  const splits: SplitOption[] = Object.entries(rules?.commission?.splits ?? {}).map(([key, s]) => ({ key, label: s.name_th, driverPct: s.driver_pct }));
  const places: PlaceOption[] = (placesRes.data ?? []).map((p) => ({ id: p.id, name: p.name_th, hidden: p.is_hidden }));
  const byId = new Map(places.map((p) => [p.id, p.name]));
  const rows: CommissionRow[] = (commRes.data ?? [])
    .map((c) => ({
      placeId: c.place_id,
      placeName: byId.get(c.place_id) ?? '—',
      type: c.type as CommissionRow['type'],
      amount: c.amount,
      splitKey: c.split_key,
      note: c.note,
    }))
    .sort((a, b) => a.placeName.localeCompare(b.placeName, 'th'));
  return <CommissionManager rows={rows} places={places} splits={splits} canManage={can(staff, 'commission.manage')} />;
}
