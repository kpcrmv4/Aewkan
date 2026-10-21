'use client';

import { Crosshair, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/features/admin-ops/sheet';
import { PLACE_CATEGORIES } from '@/lib/contracts/admin';
import { PLACES_COPY as C } from '@/lib/copy/settings';
import { postJson } from './api';
import { classifyPaste, inServiceArea, type Coords } from './coords';
import { CheckField, Field, TextField } from './fields';
import { PlaceMap } from './place-map';

export interface PlaceRow {
  id: string;
  nameTh: string;
  nameEn: string;
  category: string;
  isPickup: boolean;
  isMountain: boolean;
  defaultDwellMin: number;
  isHidden: boolean;
  lat: number;
  lng: number;
}

interface Form {
  id?: string;
  nameTh: string;
  nameEn: string;
  category: string;
  isPickup: boolean;
  isMountain: boolean;
  dwell: string;
  isHidden: boolean;
  lat: string;
  lng: string;
}

const EMPTY: Form = { nameTh: '', nameEn: '', category: 'city', isPickup: false, isMountain: false, dwell: '60', isHidden: false, lat: '', lng: '' };

const toForm = (p: PlaceRow | null): Form =>
  p ? { id: p.id, nameTh: p.nameTh, nameEn: p.nameEn, category: p.category, isPickup: p.isPickup, isMountain: p.isMountain, dwell: String(p.defaultDwellMin), isHidden: p.isHidden, lat: String(p.lat), lng: String(p.lng) } : EMPTY;

function pointOf(f: Form): Coords | null {
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  return f.lat.trim() !== '' && f.lng.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** add / edit sheet: names + flags, and the location from a pasted link, typed coordinates or the map */
export function PlaceForm({ place, open, onClose }: { place: PlaceRow | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={place ? C.formEdit : C.formAdd}>
      {/* remount per place so the form always starts from the row being edited */}
      {open && <PlaceFormBody key={place?.id ?? 'new'} place={place} onClose={onClose} />}
    </Sheet>
  );
}

function PlaceFormBody({ place, onClose }: { place: PlaceRow | null; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => toForm(place));
  const [paste, setPaste] = useState('');
  const [locMsg, setLocMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const point = pointOf(form);
  const outside = point !== null && !inServiceArea(point);
  const setPoint = (c: Coords) => setForm((f) => ({ ...f, lat: String(c.lat), lng: String(c.lng) }));

  async function applyPaste() {
    const r = classifyPaste(paste);
    if (r.coords) {
      setPoint(r.coords);
      setLocMsg({ kind: 'ok', text: C.loc.found });
      return;
    }
    if (r.kind === 'short_link') {
      setFinding(true);
      const res = await postJson<{ lat: number; lng: number }>('/api/admin/places/resolve', { url: paste });
      setFinding(false);
      if (res.ok) {
        setPoint({ lat: res.data.lat, lng: res.data.lng });
        setLocMsg({ kind: 'ok', text: C.loc.found });
      } else {
        setLocMsg({ kind: 'error', text: res.message });
      }
      return;
    }
    setLocMsg({ kind: 'error', text: C.loc.notFound });
  }

  async function save() {
    if (!form.nameTh.trim() || !form.nameEn.trim() || !point) {
      setError(C.required);
      return;
    }
    if (outside) {
      setError(C.loc.outside);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await postJson('/api/admin/places', {
      id: form.id,
      nameTh: form.nameTh,
      nameEn: form.nameEn,
      lat: point.lat,
      lng: point.lng,
      category: form.category,
      isPickup: form.isPickup,
      isMountain: form.isMountain,
      defaultDwellMin: Math.max(0, Math.min(600, Number.parseInt(form.dwell, 10) || 0)),
      isHidden: form.isHidden,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success(C.saved);
    onClose();
    router.refresh();
  }

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={C.f.nameTh} value={form.nameTh} onChange={(v) => set('nameTh', v)} testId="place-name-th" />
        <TextField label={C.f.nameEn} value={form.nameEn} onChange={(v) => set('nameEn', v)} testId="place-name-en" />
        <Field label={C.f.category}>
          <select className="input-base min-h-11" value={form.category} data-testid="place-category" onChange={(e) => set('category', e.target.value)}>
            {PLACE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {C.categories[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={C.f.dwell}>
          <input className="input-base tnum min-h-11" type="number" inputMode="numeric" min={0} max={600} step={1} value={form.dwell} data-testid="place-dwell" onChange={(e) => set('dwell', e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <CheckField label={C.f.isPickup} checked={form.isPickup} onChange={(v) => set('isPickup', v)} testId="place-is-pickup" />
        <CheckField label={C.f.isMountain} checked={form.isMountain} onChange={(v) => set('isMountain', v)} testId="place-is-mountain" />
        <CheckField label={C.f.hidden} checked={form.isHidden} onChange={(v) => set('isHidden', v)} testId="place-hidden" />
      </div>

      <fieldset className="space-y-3 rounded-sm border border-line-soft p-3">
        <legend className="px-1 text-sm font-semibold text-ink">{C.loc.title}</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={C.loc.paste} hint={C.loc.pasteHint} className="flex-1">
            <input
              className="input-base min-h-11"
              value={paste}
              maxLength={2000}
              data-testid="place-paste"
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void applyPaste();
                }
              }}
            />
          </Field>
          <button type="button" className="btn-secondary min-h-11 shrink-0" disabled={finding || !paste.trim()} onClick={() => void applyPaste()} data-testid="place-use-paste">
            {finding ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            {finding ? C.loc.finding : C.loc.use}
          </button>
        </div>
        {locMsg && (
          <p role={locMsg.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${locMsg.kind === 'error' ? 'text-urgent' : 'text-status-done'}`} data-testid="place-loc-msg">
            {locMsg.text}
          </p>
        )}
        <PlaceMap point={point && !outside ? point : null} onPick={setPoint} />
        <p className="text-xs text-muted-token">{C.loc.clickMap}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={C.f.lat}>
            <input className="input-base tnum min-h-11" inputMode="decimal" value={form.lat} data-testid="place-lat" onChange={(e) => set('lat', e.target.value)} />
          </Field>
          <Field label={C.f.lng}>
            <input className="input-base tnum min-h-11" inputMode="decimal" value={form.lng} data-testid="place-lng" onChange={(e) => set('lng', e.target.value)} />
          </Field>
        </div>
        {outside && (
          <p role="alert" className="text-sm text-urgent">
            {C.loc.outside}
          </p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-urgent" data-testid="place-error">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={onClose}>
          {C.cancel}
        </button>
        <button type="submit" className="btn-primary min-h-11" disabled={busy} data-testid="place-save">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {C.save}
        </button>
      </div>
    </form>
  );
}
