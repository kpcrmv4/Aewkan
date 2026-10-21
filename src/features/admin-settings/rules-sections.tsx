'use client';

import type { Rules } from '@/lib/pricing';
import { PRICING_COPY as C } from '@/lib/copy/settings';
import { NumField, Section, TextField } from './fields';

export type Update = (fn: (d: Rules) => void) => void;
interface Props {
  rules: Rules;
  update: Update;
}

export function ZonesSection({ rules, update }: Props) {
  return (
    <Section title={C.sections.zones} sub={C.sections.zonesSub} testId="rules-zones">
      <div className="grid gap-3 md:grid-cols-2">
        {rules.zones.map((z, i) => (
          <div key={z.id} className="min-w-0 space-y-3 rounded-sm border border-line-soft p-3">
            <div className="text-sm font-semibold text-ink">{C.zone(z.id)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={C.f.nameTh} value={z.name_th} onChange={(v) => update((d) => (d.zones[i].name_th = v))} testId={`zone-${z.id}-name_th`} />
              <TextField label={C.f.nameEn} value={z.name_en} onChange={(v) => update((d) => (d.zones[i].name_en = v))} testId={`zone-${z.id}-name_en`} />
              {z.max_km === null ? (
                <div className="flex items-end pb-2 text-sm text-muted-token">{C.lastZone}</div>
              ) : (
                <NumField label={C.f.maxKm} value={z.max_km} step={0.5} onChange={(n) => update((d) => (d.zones[i].max_km = n))} testId={`zone-${z.id}-max_km`} />
              )}
              <NumField label={C.f.surcharge} value={z.surcharge} step={50} onChange={(n) => update((d) => (d.zones[i].surcharge = Math.round(n)))} testId={`zone-${z.id}-surcharge`} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function VehiclesSection({ rules, update }: Props) {
  const keys = Object.keys(rules.vehicles).sort((a, b) => rules.vehicles[a].sort - rules.vehicles[b].sort);
  return (
    <Section title={C.sections.vehicles} sub={C.sections.vehiclesSub} testId="rules-vehicles">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {keys.map((k) => {
          const v = rules.vehicles[k];
          const int = (field: 'hourly' | 'daily' | 'per_km' | 'seats') => (n: number) => update((d) => (d.vehicles[k][field] = Math.round(n)));
          return (
            <div key={k} className="min-w-0 space-y-3 rounded-sm border border-line-soft p-3" data-testid={`vehicle-${k}`}>
              <div className="text-sm font-semibold text-ink">
                {v.name_th} <span className="font-normal text-muted-token">({k})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label={C.f.nameTh} value={v.name_th} onChange={(s) => update((d) => (d.vehicles[k].name_th = s))} testId={`veh-${k}-name_th`} />
                <TextField label={C.f.nameEn} value={v.name_en} onChange={(s) => update((d) => (d.vehicles[k].name_en = s))} testId={`veh-${k}-name_en`} />
                <NumField label={C.f.seats} value={v.seats} min={1} onChange={int('seats')} testId={`veh-${k}-seats`} />
                <NumField label={C.f.hourly} value={v.hourly} step={50} onChange={int('hourly')} testId={`veh-${k}-hourly`} />
                <NumField label={C.f.daily} value={v.daily} step={100} onChange={int('daily')} testId={`veh-${k}-daily`} />
                <NumField label={C.f.perKm} value={v.per_km} onChange={int('per_km')} testId={`veh-${k}-per_km`} />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

type NumKey = {
  [K in keyof Rules]: Rules[K] extends number ? K : never;
}[keyof Rules];

interface Num {
  key: NumKey;
  label: string;
  step?: number;
  int?: boolean;
  min?: number;
}

const MODE_FIELDS: Num[] = [
  { key: 'min_hours', label: C.f.minHours, int: true, min: 1 },
  { key: 'daily_inc_hours', label: C.f.dailyIncHours, int: true, min: 1 },
  { key: 'daily_inc_km', label: C.f.dailyIncKm, step: 10, int: true },
  { key: 'ot_per_hour', label: C.f.otPerHour, step: 50, int: true },
  { key: 'extra_km_rate', label: C.f.extraKmRate, int: true },
  { key: 'max_day_hours', label: C.f.maxDayHours, int: true, min: 1 },
  { key: 'tight_day_hours', label: C.f.tightDayHours, int: true, min: 1 },
  { key: 'trip_pct', label: C.f.tripPct, step: 1 },
  { key: 'empty_return_pct', label: C.f.emptyReturnPct, step: 5 },
  { key: 'stop_fee', label: C.f.stopFee, step: 50, int: true },
  { key: 'road_factor', label: C.f.roadFactor, step: 0.05 },
];

const EXTRA_FIELDS: Num[] = [
  { key: 'mountain_fee', label: C.f.mountainFee, step: 50, int: true },
  { key: 'lang_driver_fee', label: C.f.langDriverFee, step: 50, int: true },
  { key: 'night_pct', label: C.f.nightPct },
  { key: 'season_pct', label: C.f.seasonPct },
  { key: 'deposit_pct', label: C.f.depositPct, step: 5 },
  { key: 'deposit_round', label: C.f.depositRound, step: 50, int: true, min: 1 },
  { key: 'deposit_min', label: C.f.depositMin, step: 50, int: true },
];

function NumGrid({ rules, update, fields }: Props & { fields: Num[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((f) => (
        <NumField
          key={f.key}
          label={f.label}
          value={rules[f.key]}
          step={f.step ?? 1}
          min={f.min ?? 0}
          testId={`rule-${f.key}`}
          onChange={(n) => update((d) => void Object.assign(d, { [f.key]: f.int ? Math.round(n) : n }))}
        />
      ))}
    </div>
  );
}

export function ModesSection({ rules, update }: Props) {
  return (
    <Section title={C.sections.modes} testId="rules-modes">
      <NumGrid rules={rules} update={update} fields={MODE_FIELDS} />
    </Section>
  );
}

export function ExtrasSection({ rules, update }: Props) {
  return (
    <Section title={C.sections.extras} testId="rules-extras">
      <NumGrid rules={rules} update={update} fields={EXTRA_FIELDS} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <TextField label={C.f.nightFrom} type="time" value={rules.night.from} onChange={(v) => update((d) => (d.night.from = v))} testId="rule-night-from" />
        <TextField label={C.f.nightTo} type="time" value={rules.night.to} onChange={(v) => update((d) => (d.night.to = v))} testId="rule-night-to" />
      </div>
      <div>
        <div className="label-base">{C.sections.speeds}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {['1', '2', '3', '4', 'mountain'].map((k) => (
            <NumField key={k} label={C.f.speedZone(k)} value={rules.speeds[k] ?? 0} min={1} onChange={(n) => update((d) => (d.speeds[k] = n))} testId={`speed-${k}`} />
          ))}
        </div>
      </div>
    </Section>
  );
}
