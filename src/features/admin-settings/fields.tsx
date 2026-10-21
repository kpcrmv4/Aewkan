'use client';

import { useState, type ReactNode } from 'react';

/** labelled form control; the label wraps the input so it is also the click target */
export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label-base">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-token">{hint}</span> : null}
    </label>
  );
}

/**
 * Number input that lets the user type freely (empty, "1.", "0.5") and only
 * reports values that are real numbers; when it loses focus it shows the
 * committed value again. No effect needed: the typed text only shows while focused.
 */
export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  testId,
  hint,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  testId?: string;
  hint?: string;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint} className={className}>
      <input
        className="input-base tnum min-h-11"
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        step={step}
        min={min}
        data-testid={testId}
        value={text ?? String(value)}
        onFocus={() => setText(String(value))}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(null)}
      />
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength = 120,
  testId,
  className,
  type = 'text',
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  testId?: string;
  className?: string;
  type?: 'text' | 'date' | 'time';
  disabled?: boolean;
}) {
  return (
    <Field label={label} className={className}>
      <input className="input-base min-h-11" type={type} value={value} maxLength={maxLength} data-testid={testId} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function CheckField({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--brand-solid)]" checked={checked} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** a titled block of the rules form */
export function Section({ title, sub, aside, children, testId }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="panel" data-testid={testId}>
      <div className="panel-head flex-wrap">
        <span className="min-w-0 flex-1">{title}</span>
        {aside}
      </div>
      <div className="space-y-3 p-4">
        {sub ? <p className="text-sm text-muted-token">{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}
