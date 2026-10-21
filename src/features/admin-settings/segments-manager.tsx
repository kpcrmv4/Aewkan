'use client';

import { Loader2, Pencil, Plus, Route, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/states';
import { Sheet } from '@/features/admin-ops/sheet';
import { SEGMENTS_COPY as C } from '@/lib/copy/settings';
import { postJson } from './api';
import { Field } from './fields';
import type { SegSource } from './segments';

export interface SegmentRow {
  a: string;
  b: string;
  aName: string;
  bName: string;
  source: SegSource;
  km: number;
  minutes: number;
  samples: number;
  note: string;
  measuredLabel: string;
}
export interface SegmentPlace {
  id: string;
  name: string;
}

interface Form {
  from: string;
  to: string;
  km: string;
  minutes: string;
  note: string;
  source: SegSource;
  /** editing keeps the pair fixed */
  editing: boolean;
}

const TONE: Record<SegSource, BadgeTone> = { driven: 'done', checkins: 'info', routing: 'pending' };
const EMPTY: Form = { from: '', to: '', km: '', minutes: '', note: '', source: 'driven', editing: false };

/** list of measured segments with add / edit / delete and "fetch road distance" */
export function SegmentsManager({ rows, places, filtered, filters, total }: { rows: SegmentRow[]; places: SegmentPlace[]; filtered: boolean; filters: ReactNode; total: number }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<SegmentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const open = (f: Form) => {
    setError(null);
    setForm(f);
  };
  const fromRow = (r: SegmentRow, source: SegSource, editing: boolean): Form => ({ from: r.a, to: r.b, km: String(r.km), minutes: String(r.minutes), note: r.note, source, editing });

  function valid(f: Form) {
    const km = Number(f.km);
    const min = Number(f.minutes);
    return !!f.from && !!f.to && f.from !== f.to && Number.isFinite(km) && km > 0 && km <= 2000 && Number.isInteger(min) && min > 0 && min <= 2000;
  }

  async function save(f: Form) {
    if (!valid(f)) {
      setError(C.required);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await postJson('/api/admin/segments', { fromId: f.from, toId: f.to, km: Number(f.km), minutes: Number(f.minutes), source: f.source, note: f.note });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success(C.saved);
    setForm(null);
    router.refresh();
  }

  async function fetchRoute(f: Form) {
    if (!f.from || !f.to || f.from === f.to) {
      setError(C.required);
      return;
    }
    setError(null);
    setFetching(true);
    const res = await postJson<{ km: number; minutes: number }>('/api/admin/segments/fetch', { fromId: f.from, toId: f.to });
    setFetching(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success(C.fetched(res.data.km, res.data.minutes));
    setForm(null);
    router.refresh();
  }

  async function remove(r: SegmentRow) {
    setBusy(true);
    const res = await postJson('/api/admin/segments/delete', { fromId: r.a, toId: r.b, source: r.source });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.removed);
    setRemoving(null);
    router.refresh();
  }

  const working = busy || fetching;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-lg font-semibold text-ink">{C.title}</h2>
          <p className="text-sm text-muted-token">{C.sub}</p>
        </div>
        <button type="button" className="btn-primary min-h-11" onClick={() => open(EMPTY)} data-testid="segment-add">
          <Plus className="size-4" />
          {C.add}
        </button>
      </div>
      {filters}

      {rows.length === 0 ? (
        <EmptyState
          icon={Route}
          message={filtered ? C.emptyFiltered : C.empty}
          action={
            filtered ? (
              <Link href="/admin/places?tab=segments" className="btn-secondary mx-auto">
                {C.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="panel" data-testid="segments-list" data-total={total}>
          {rows.map((r) => (
            <ListRow
              key={`${r.a}|${r.b}|${r.source}`}
              title={
                <>
                  {r.aName} <span className="text-muted-token">↔</span> {r.bName}
                </>
              }
              meta={`${C.km(r.km)} · ${C.min(r.minutes)} · ${C.samples(r.samples)} · ${C.measured(r.measuredLabel)}${r.note ? ` · ${r.note}` : ''}`}
              aside={
                <>
                  <Badge tone={TONE[r.source]}>{C.sources[r.source]}</Badge>
                  {r.source !== 'driven' && (
                    <button type="button" className="btn-ghost min-h-11" onClick={() => open(fromRow(r, 'driven', false))}>
                      {C.asDriven}
                    </button>
                  )}
                  <button type="button" className="btn-secondary btn-sm min-h-11" onClick={() => open(fromRow(r, r.source, true))} aria-label={`${C.edit} ${r.aName} ${r.bName}`}>
                    <Pencil className="size-4" />
                    {C.edit}
                  </button>
                  <button type="button" className="btn-ghost min-h-11" onClick={() => setRemoving(r)} aria-label={`${C.remove} ${r.aName} ${r.bName}`}>
                    <Trash2 className="size-4" />
                    {C.remove}
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      <Sheet open={form !== null} onOpenChange={(o) => !o && !working && setForm(null)} title={form?.editing ? C.formEdit : C.formAdd} description={form && form.source !== 'driven' ? `${C.sources[form.source]} · ${C.routingNote}` : undefined}>
        {form && (
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(form);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={C.from}>
                <select className="input-base min-h-11" value={form.from} disabled={form.editing} data-testid="segment-from" onChange={(e) => set('from', e.target.value)}>
                  <option value="">{C.pick}</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={C.to}>
                <select className="input-base min-h-11" value={form.to} disabled={form.editing} data-testid="segment-to" onChange={(e) => set('to', e.target.value)}>
                  <option value="">{C.pick}</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={C.kmField}>
                <input className="input-base tnum min-h-11" type="number" inputMode="decimal" min={0} step="any" value={form.km} data-testid="segment-km" onChange={(e) => set('km', e.target.value)} />
              </Field>
              <Field label={C.minField}>
                <input className="input-base tnum min-h-11" type="number" inputMode="numeric" min={0} step={1} value={form.minutes} data-testid="segment-minutes" onChange={(e) => set('minutes', e.target.value)} />
              </Field>
            </div>
            <Field label={C.note}>
              <input className="input-base min-h-11" maxLength={200} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-urgent" data-testid="segment-error">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button type="button" className="btn-secondary min-h-11" disabled={working} onClick={() => setForm(null)}>
                {C.cancel}
              </button>
              {!form.editing && (
                <button type="button" className="btn-secondary min-h-11" disabled={working} onClick={() => void fetchRoute(form)} data-testid="segment-fetch">
                  {fetching ? <Loader2 className="size-4 animate-spin" /> : <Route className="size-4" />}
                  {fetching ? C.fetching : C.fetch}
                </button>
              )}
              <button type="submit" className="btn-primary min-h-11" disabled={working} data-testid="segment-save">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {form.editing ? C.saveEdit : C.save}
              </button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet open={removing !== null} onOpenChange={(o) => !o && !busy && setRemoving(null)} title={removing ? C.confirmRemove(removing.aName, removing.bName) : C.remove} description={C.confirmRemoveBody}>
        {removing && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => setRemoving(null)}>
              {C.cancel}
            </button>
            <button type="button" className="btn-danger min-h-11" disabled={busy} onClick={() => void remove(removing)} data-testid="segment-confirm-remove">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {C.remove}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
