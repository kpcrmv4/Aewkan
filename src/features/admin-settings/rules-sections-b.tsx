'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PRICING_COPY as C } from '@/lib/copy/settings';
import { CheckField, Field, NumField, Section, TextField } from './fields';
import type { Update } from './rules-sections';
import { SPLIT_KEY } from './rules-schema';
import type { Rules } from '@/lib/pricing';

interface Props {
  rules: Rules;
  update: Update;
}

export function QuoteSection({ rules, update }: Props) {
  const q = rules.quote;
  return (
    <Section
      title={C.sections.quote}
      sub={C.quoteHint}
      testId="rules-quote"
      aside={<CheckField label={C.f.quoteEnabled} checked={q.enabled} onChange={(v) => update((d) => (d.quote.enabled = v))} testId="quote-enabled" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label={C.f.quoteRange}>
          <select className="input-base min-h-11" value={q.use_range ? '1' : '0'} data-testid="quote-use-range" onChange={(e) => update((d) => (d.quote.use_range = e.target.value === '1'))}>
            <option value="1">{C.f.quoteRangeOnly}</option>
            <option value="0">{C.f.quoteRangeAll}</option>
          </select>
        </Field>
        <TextField label={C.f.quoteFrom} type="date" value={q.from} disabled={!q.use_range} onChange={(v) => update((d) => (d.quote.from = v))} testId="quote-from" />
        <TextField label={C.f.quoteTo} type="date" value={q.to} disabled={!q.use_range} onChange={(v) => update((d) => (d.quote.to = v))} testId="quote-to" />
        <Field label={C.f.quoteHours}>
          <select className="input-base min-h-11" value={String(q.hours)} data-testid="quote-hours" onChange={(e) => update((d) => (d.quote.hours = Number(e.target.value)))}>
            {[...new Set([1, 2, 3, 6, 12, 24, q.hours])]
              .sort((a, b) => a - b)
              .map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
          </select>
        </Field>
        <NumField label={C.f.quotePct} value={q.pct} step={5} onChange={(n) => update((d) => (d.quote.pct = n))} testId="quote-pct" />
      </div>
      <TextField label={C.f.quoteReasonTh} value={q.reason_th} maxLength={200} onChange={(v) => update((d) => (d.quote.reason_th = v))} testId="quote-reason-th" />
      <TextField label={C.f.quoteReasonEn} value={q.reason_en} maxLength={200} onChange={(v) => update((d) => (d.quote.reason_en = v))} testId="quote-reason-en" />
    </Section>
  );
}

export function ReturnOfferSection({ rules, update }: Props) {
  const r = rules.return_offer;
  return (
    <Section
      title={C.sections.returnOffer}
      sub={C.returnHint}
      testId="rules-return"
      aside={<CheckField label={C.f.returnEnabled} checked={r.enabled} onChange={(v) => update((d) => (d.return_offer.enabled = v))} testId="return-enabled" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={C.f.returnWhen}>
          <select className="input-base min-h-11" value={r.send_when} data-testid="return-when" onChange={(e) => update((d) => (d.return_offer.send_when = e.target.value === 'morning' ? 'morning' : 'drop'))}>
            <option value="drop">{C.f.returnWhenDrop}</option>
            <option value="morning">{C.f.returnWhenMorning}</option>
          </select>
        </Field>
        <NumField label={C.f.returnPct} value={r.pct} step={5} onChange={(n) => update((d) => (d.return_offer.pct = n))} testId="return-pct" />
        <NumField label={C.f.returnDefaultDays} value={r.default_days} onChange={(n) => update((d) => (d.return_offer.default_days = Math.round(n)))} testId="return-default-days" />
        <NumField label={C.f.returnValidDays} value={r.valid_days} min={1} onChange={(n) => update((d) => (d.return_offer.valid_days = Math.round(n)))} testId="return-valid-days" />
      </div>
    </Section>
  );
}

export function CommissionRulesSection({ rules, update }: Props) {
  const c = rules.commission;
  const [newKey, setNewKey] = useState('');
  const keyOk = SPLIT_KEY.test(newKey) && !Object.hasOwn(c.splits, newKey);
  return (
    <Section title={C.sections.commission} sub={C.splitHint} testId="rules-commission">
      <NumField label={C.f.assumedSpend} value={c.assumed_spend} step={50} onChange={(n) => update((d) => (d.commission.assumed_spend = Math.round(n)))} testId="comm-assumed" />
      <div className="space-y-3">
        {Object.entries(c.splits).map(([key, s]) => (
          <div key={key} className="grid min-w-0 gap-3 rounded-sm border border-line-soft p-3 sm:grid-cols-[8rem_1fr_1fr_8rem]" data-testid={`split-${key}`}>
            <div className="flex items-end pb-2 text-sm font-semibold text-ink">{key}</div>
            <TextField label={C.f.nameTh} value={s.name_th} onChange={(v) => update((d) => (d.commission.splits[key].name_th = v))} testId={`split-${key}-name_th`} />
            <TextField label={C.f.nameEn} value={s.name_en} onChange={(v) => update((d) => (d.commission.splits[key].name_en = v))} testId={`split-${key}-name_en`} />
            <NumField label={C.f.splitDriverPct} value={s.driver_pct} onChange={(n) => update((d) => (d.commission.splits[key].driver_pct = n))} testId={`split-${key}-pct`} />
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={C.splitNewKey} className="w-48 max-w-full">
            <input className="input-base min-h-11" value={newKey} maxLength={30} data-testid="split-new-key" onChange={(e) => setNewKey(e.target.value.toLowerCase())} />
          </Field>
          <button
            type="button"
            className="btn-secondary min-h-11"
            disabled={!keyOk}
            data-testid="split-add"
            onClick={() => {
              update((d) => (d.commission.splits[newKey] = { name_th: newKey, name_en: newKey, driver_pct: 50 }));
              setNewKey('');
            }}
          >
            <Plus className="size-4" />
            {C.splitAdd}
          </button>
          {newKey && !keyOk ? <span className="pb-3 text-sm text-urgent">{C.splitKeyBad}</span> : null}
        </div>
      </div>
      <Field label={C.f.policy}>
        <textarea className="input-base min-h-28" maxLength={1500} value={c.policy_th} data-testid="comm-policy" onChange={(e) => update((d) => (d.commission.policy_th = e.target.value))} />
      </Field>
    </Section>
  );
}
