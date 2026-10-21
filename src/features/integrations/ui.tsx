'use client';

import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { postJson } from '@/features/admin-ops/api-client';
import type { TestIntegrationResponse } from '@/lib/contracts/payment';
import { INTEG_COPY as C, integErrorText } from '@/lib/copy/pay';

export function Switch({ checked, onChange, label, disabled, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 disabled:opacity-50"
    >
      <span className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors ${checked ? 'bg-brand-solid' : 'bg-line-strong'}`}>
        <span className={`absolute top-0.5 size-5 rounded-pill bg-surface shadow-e1 transition-[left] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
      {checked ? C.enabled : C.disabled}
    </button>
  );
}

export function CopyField({ value, label, testId }: { value: string; label: string; testId?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(C.copied);
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error(integErrorText(undefined));
    }
  }
  return (
    <div>
      <span className="label-base">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={value} className="input-base tnum min-w-0 flex-1 text-sm" onFocus={(e) => e.currentTarget.select()} data-testid={testId} aria-label={label} />
        <button type="button" onClick={() => void copy()} className="btn-ghost min-h-11 shrink-0 border border-line" aria-label={C.copy}>
          {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{done ? C.copied : C.copy}</span>
        </button>
      </div>
    </div>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="label-base">
        {label}
        {required ? <span className="ml-1 text-xs font-normal text-muted-token">· {C.required}</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-token">{hint}</span> : null}
    </label>
  );
}

/** the per-integration "ทดสอบ" button */
export function useTest(key: string) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const r = await postJson<TestIntegrationResponse>('/api/admin/integrations/test', { key });
    setBusy(false);
    if (!r.ok) return toast.error(integErrorText(r.code, r.message));
    if (r.data.ok) toast.success(r.data.message);
    else toast.error(r.data.message);
  }
  return { busy, run };
}
