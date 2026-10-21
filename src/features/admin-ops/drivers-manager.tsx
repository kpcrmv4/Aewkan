'use client';

import { CalendarOff, Loader2, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/states';
import { DRIVERS_COPY as C } from '@/lib/copy/admin';
import { postJson } from './api-client';
import { OffDays } from './off-days';
import { Sheet } from './sheet';

export interface DriverRow {
  id: string;
  fullName: string;
  nickname: string;
  nameEn: string;
  phone: string;
  lineId: string;
  langs: string[];
  langsEn: string[];
  vehicleKey: string;
  carTh: string;
  carEn: string;
  plate: string;
  years: number;
  note: string;
  isActive: boolean;
}

export interface VehicleOption {
  key: string;
  label: string;
}

interface Form {
  id?: string;
  fullName: string;
  nickname: string;
  nameEn: string;
  phone: string;
  lineId: string;
  langs: string;
  langsEn: string;
  vehicleKey: string;
  carTh: string;
  carEn: string;
  plate: string;
  years: string;
  note: string;
  isActive: boolean;
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const toForm = (d: DriverRow | null, vehicleKey: string): Form =>
  d
    ? { ...d, langs: d.langs.join(', '), langsEn: d.langsEn.join(', '), years: String(d.years) }
    : { fullName: '', nickname: '', nameEn: '', phone: '', lineId: '', langs: 'ไทย', langsEn: 'Thai', vehicleKey, carTh: '', carEn: '', plate: '', years: '0', note: '', isActive: true };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      {children}
    </label>
  );
}

export function DriversManager({ drivers, vehicles, vehicleLabels }: { drivers: DriverRow[]; vehicles: VehicleOption[]; vehicleLabels: Record<string, string> }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [offFor, setOffFor] = useState<DriverRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save(f: Form) {
    if (!f.fullName.trim() || !f.nickname.trim()) {
      setFormError(C.required);
      return;
    }
    setFormError(null);
    setBusy(true);
    const res = await postJson('/api/admin/drivers', {
      id: f.id,
      fullName: f.fullName,
      nickname: f.nickname,
      nameEn: f.nameEn,
      phone: f.phone,
      lineId: f.lineId,
      langs: list(f.langs),
      langsEn: list(f.langsEn),
      vehicleKey: f.vehicleKey,
      carTh: f.carTh,
      carEn: f.carEn,
      plate: f.plate,
      years: Number.parseInt(f.years, 10) || 0,
      note: f.note,
      isActive: f.isActive,
    });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    toast.success(C.saved);
    setForm(null);
    router.refresh();
  }

  async function toggle(d: DriverRow) {
    setToggling(d.id);
    const res = await postJson('/api/admin/drivers', { ...d, isActive: !d.isActive });
    setToggling(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.statusChanged);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn-primary min-h-11" onClick={() => { setFormError(null); setForm(toForm(null, vehicles[0]?.key ?? '')); }}>
          <Plus className="size-4" />
          {C.add}
        </button>
      </div>

      {drivers.length === 0 ? (
        <EmptyState message={C.empty} />
      ) : (
        <div className="panel" data-testid="drivers-list">
          {drivers.map((d) => (
            <ListRow
              key={d.id}
              title={
                <>
                  {d.nickname} <span className="font-normal text-muted-token">· {d.fullName}</span>
                </>
              }
              meta={`${vehicleLabels[d.vehicleKey] ?? d.vehicleKey} · ${d.carTh} · ${d.plate}${d.phone ? ` · ${d.phone}` : ''}`}
              aside={
                <>
                  <Badge tone={d.isActive ? 'done' : 'pending'}>{d.isActive ? C.active : C.inactive}</Badge>
                  <button type="button" className="btn-secondary btn-sm min-h-11" onClick={() => { setFormError(null); setForm(toForm(d, d.vehicleKey)); }} aria-label={`${C.edit} ${d.nickname}`}>
                    <Pencil className="size-4" />
                    {C.edit}
                  </button>
                  <button type="button" className="btn-ghost min-h-11" onClick={() => setOffFor(d)} aria-label={`${C.offDays} ${d.nickname}`}>
                    <CalendarOff className="size-4" />
                    {C.offDays}
                  </button>
                  <button type="button" className="btn-ghost min-h-11" disabled={toggling === d.id} onClick={() => toggle(d)} aria-label={`${d.isActive ? C.deactivate : C.activate} ${d.nickname}`}>
                    {toggling === d.id && <Loader2 className="size-4 animate-spin" />}
                    {d.isActive ? C.deactivate : C.activate}
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}
      <p className="mt-3 text-sm text-muted-token">{C.jobsHint}</p>

      <Sheet open={form !== null} onOpenChange={(o) => !o && !busy && setForm(null)} title={form?.id ? C.formEdit : C.formAdd}>
        {form && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(form);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={C.fields.fullName}>
                <input className="input-base" value={form.fullName} maxLength={120} onChange={(e) => set('fullName', e.target.value)} />
              </Field>
              <Field label={C.fields.nickname}>
                <input className="input-base" value={form.nickname} maxLength={60} onChange={(e) => set('nickname', e.target.value)} />
              </Field>
              <Field label={C.fields.nameEn}>
                <input className="input-base" value={form.nameEn} maxLength={60} onChange={(e) => set('nameEn', e.target.value)} />
              </Field>
              <Field label={C.fields.phone}>
                <input className="input-base" inputMode="tel" value={form.phone} maxLength={30} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label={C.fields.lineId}>
                <input className="input-base" value={form.lineId} maxLength={60} onChange={(e) => set('lineId', e.target.value)} />
              </Field>
              <Field label={C.fields.vehicleKey}>
                <select className="input-base" value={form.vehicleKey} onChange={(e) => set('vehicleKey', e.target.value)}>
                  {vehicles.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={C.fields.carTh}>
                <input className="input-base" value={form.carTh} maxLength={120} onChange={(e) => set('carTh', e.target.value)} />
              </Field>
              <Field label={C.fields.carEn}>
                <input className="input-base" value={form.carEn} maxLength={120} onChange={(e) => set('carEn', e.target.value)} />
              </Field>
              <Field label={C.fields.plate}>
                <input className="input-base" value={form.plate} maxLength={20} onChange={(e) => set('plate', e.target.value)} />
              </Field>
              <Field label={C.fields.years}>
                <input className="input-base" type="number" inputMode="numeric" min={0} max={60} value={form.years} onChange={(e) => set('years', e.target.value)} />
              </Field>
              <Field label={C.fields.langs}>
                <input className="input-base" value={form.langs} onChange={(e) => set('langs', e.target.value)} />
              </Field>
              <Field label={C.fields.langsEn}>
                <input className="input-base" value={form.langsEn} onChange={(e) => set('langsEn', e.target.value)} />
              </Field>
            </div>
            <Field label={C.fields.note}>
              <textarea className="input-base min-h-20" maxLength={300} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
            {formError && (
              <p role="alert" className="text-sm text-urgent">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary min-h-11" onClick={() => setForm(null)} disabled={busy}>
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

      <Sheet open={offFor !== null} onOpenChange={(o) => !o && setOffFor(null)} title={offFor ? C.offDaysFor(offFor.nickname) : C.offDays}>
        {offFor && <OffDays driverId={offFor.id} />}
      </Sheet>
    </>
  );
}
