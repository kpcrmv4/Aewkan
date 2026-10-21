'use client';

import { Coins, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/states';
import { Sheet } from '@/features/admin-ops/sheet';
import { COMMISSION_COPY as C } from '@/lib/copy/settings';
import { postJson } from './api';
import { Field } from './fields';

export type CommissionType = 'head' | 'booking' | 'sale';

export interface CommissionRow {
  placeId: string;
  placeName: string;
  type: CommissionType;
  amount: number;
  splitKey: string;
  note: string;
}
export interface PlaceOption {
  id: string;
  name: string;
  hidden: boolean;
}
export interface SplitOption {
  key: string;
  label: string;
  driverPct: number;
}

interface Form {
  placeId: string;
  isNew: boolean;
  type: CommissionType;
  amount: string;
  splitKey: string;
  note: string;
}

export function CommissionManager({ rows, places, splits, canManage }: { rows: CommissionRow[]; places: PlaceOption[]; splits: SplitOption[]; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<CommissionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = new Set(rows.map((r) => r.placeId));
  const free = places.filter((p) => !used.has(p.id));
  const splitLabel = (k: string) => splits.find((s) => s.key === k)?.label ?? k;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const openAdd = () => {
    setError(null);
    setForm({ placeId: '', isNew: true, type: 'head', amount: '', splitKey: splits[0]?.key ?? '', note: '' });
  };
  const openEdit = (r: CommissionRow) => {
    setError(null);
    setForm({ placeId: r.placeId, isNew: false, type: r.type, amount: String(r.amount), splitKey: r.splitKey, note: r.note });
  };

  async function save(f: Form) {
    const amount = Number(f.amount);
    const okAmount = f.amount.trim() !== '' && Number.isInteger(amount) && amount >= 0 && (f.type !== 'sale' || amount <= 100);
    if (!f.placeId || !okAmount || !f.splitKey) {
      setError(C.required);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await postJson('/api/admin/commission', { placeId: f.placeId, type: f.type, amount, splitKey: f.splitKey, note: f.note });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success(C.saved);
    setForm(null);
    router.refresh();
  }

  async function remove(r: CommissionRow) {
    setBusy(true);
    const res = await postJson('/api/admin/commission/delete', { placeId: r.placeId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.removed);
    setRemoving(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{C.title}</h2>
          <p className="text-sm text-muted-token">{C.sub}</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary min-h-11" onClick={openAdd} disabled={free.length === 0} data-testid="comm-add">
            <Plus className="size-4" />
            {C.add}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Coins} message={C.empty} />
      ) : (
        <div className="panel" data-testid="commission-list">
          {rows.map((r) => (
            <ListRow
              key={r.placeId}
              title={r.placeName}
              meta={r.note || undefined}
              aside={
                <>
                  <Badge tone="info">{C.typeShort[r.type]}</Badge>
                  <span className="num-display tnum text-base">{C.amountOf(r.type, r.amount)}</span>
                  <span className="text-sm text-ink-2">{splitLabel(r.splitKey)}</span>
                  {canManage && (
                    <>
                      <button type="button" className="btn-secondary btn-sm min-h-11" onClick={() => openEdit(r)} aria-label={`${C.edit} ${r.placeName}`}>
                        <Pencil className="size-4" />
                        {C.edit}
                      </button>
                      <button type="button" className="btn-ghost min-h-11" onClick={() => setRemoving(r)} aria-label={`${C.remove} ${r.placeName}`}>
                        <Trash2 className="size-4" />
                        {C.remove}
                      </button>
                    </>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      <Sheet open={form !== null} onOpenChange={(o) => !o && !busy && setForm(null)} title={form?.isNew ? C.formAdd : C.formEdit}>
        {form && (
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(form);
            }}
          >
            <Field label={C.place}>
              <select className="input-base min-h-11" value={form.placeId} disabled={!form.isNew} data-testid="comm-place" onChange={(e) => set('placeId', e.target.value)}>
                {form.isNew && <option value="">{C.pickPlace}</option>}
                {(form.isNew ? free : places.filter((p) => p.id === form.placeId)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.hidden ? ' (ซ่อน)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={C.type}>
                <select className="input-base min-h-11" value={form.type} onChange={(e) => set('type', e.target.value as CommissionType)}>
                  {(['head', 'booking', 'sale'] as const).map((t) => (
                    <option key={t} value={t}>
                      {C.types[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={form.type === 'sale' ? C.amountPct : C.amount}>
                <input className="input-base tnum min-h-11" type="number" inputMode="numeric" min={0} max={form.type === 'sale' ? 100 : 100000} step={1} value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              </Field>
            </div>
            <Field label={C.split}>
              <select className="input-base min-h-11" value={form.splitKey} onChange={(e) => set('splitKey', e.target.value)}>
                {splits.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} · {C.driverShare(s.driverPct)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={C.note}>
              <textarea className="input-base min-h-20" maxLength={300} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-urgent">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => setForm(null)}>
                {C.cancel}
              </button>
              <button type="submit" className="btn-primary min-h-11" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {C.save}
              </button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet open={removing !== null} onOpenChange={(o) => !o && !busy && setRemoving(null)} title={removing ? C.confirmRemove(removing.placeName) : C.remove} description={C.confirmRemoveBody}>
        {removing && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => setRemoving(null)}>
              {C.cancel}
            </button>
            <button type="button" className="btn-danger min-h-11" disabled={busy} onClick={() => void remove(removing)} data-testid="comm-confirm-remove">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {C.remove}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
