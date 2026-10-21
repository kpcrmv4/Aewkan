'use client';

import { FlaskConical, Loader2, Save, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { postJson } from '@/features/admin-ops/api-client';
import type { IntegrationState, PushConfigState } from '@/lib/contracts/payment';
import { INTEG_COPY as C, integErrorText } from '@/lib/copy/pay';
import { INTEGRATIONS, type IntegrationDef } from '@/lib/integrations/catalog';
import { PushCard } from './push-card';
import { CopyField, Field, Switch, useTest } from './ui';

export function IntegrationsBoard({
  initial,
  push,
  siteUrl,
  defaultSubject,
}: {
  initial: IntegrationState[];
  push: PushConfigState | null;
  siteUrl: string;
  defaultSubject: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-testid="integrations">
      {INTEGRATIONS.map((def) => {
        const state = initial.find((s) => s.key === def.key);
        return state ? <IntegrationCard key={def.key} def={def} initial={state} siteUrl={siteUrl} /> : null;
      })}
      <PushCard initial={push} defaultSubject={defaultSubject} />
    </div>
  );
}

function IntegrationCard({ def, initial, siteUrl }: { def: IntegrationDef; initial: IntegrationState; siteUrl: string }) {
  const [state, setState] = useState(initial);
  const [enabled, setEnabled] = useState(initial.isEnabled);
  const [config, setConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(def.config.map((f) => [f.name, String(initial.config[f.name] ?? f.defaultValue ?? '')])),
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [clearing, setClearing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const test = useTest(def.key);

  async function save() {
    if (busy) return;
    const patch: Record<string, string> = {};
    for (const s of def.secrets) {
      if (clearing.has(s.name)) patch[s.name] = '';
      else if (secrets[s.name]?.trim()) patch[s.name] = secrets[s.name].trim();
    }
    setBusy(true);
    const r = await postJson<IntegrationState>('/api/admin/integrations', {
      key: def.key,
      isEnabled: enabled,
      config,
      ...(Object.keys(patch).length ? { secrets: patch } : {}),
    });
    setBusy(false);
    if (!r.ok) return toast.error(integErrorText(r.code, r.message));
    setState(r.data);
    setEnabled(r.data.isEnabled);
    setSecrets({});
    setClearing(new Set());
    toast.success(C.saved);
  }

  const toggleClear = (name: string) =>
    setClearing((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <section className="panel" data-testid={`integ-${def.key}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{def.title}</h2>
            <p className="text-sm text-muted-token">{def.sub}</p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} label={`${def.title} ${C.enabled}`} testId={`toggle-${def.key}`} />
        </div>
        <div className="space-y-4 p-4">
          {def.config.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {def.config.map((f) => (
                <Field key={f.name} label={f.label} hint={f.hint ?? f.patternHint} required={f.required === true || typeof f.required === 'function'}>
                  {f.kind === 'select' ? (
                    <select className="input-base" name={f.name} value={config[f.name] ?? ''} onChange={(e) => setConfig({ ...config, [f.name]: e.target.value })}>
                      {f.options!.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input-base"
                      name={f.name}
                      value={config[f.name] ?? ''}
                      placeholder={f.placeholder}
                      maxLength={200}
                      autoComplete="off"
                      onChange={(e) => setConfig({ ...config, [f.name]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : null}

          {def.secrets.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {def.secrets.map((s) => {
                const isSet = state.secretFields.includes(s.name);
                const willClear = clearing.has(s.name);
                return (
                  <div key={s.name}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink-2">{s.label}</span>
                      <span data-testid={`secret-state-${def.key}-${s.name}`}>
                        {willClear ? <Badge tone="urgent">{C.secretWillClear}</Badge> : isSet ? <Badge tone="done">{C.secretSet}</Badge> : <Badge tone="pending">{C.secretUnset}</Badge>}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="input-base min-w-0 flex-1"
                        autoComplete="new-password"
                        spellCheck={false}
                        disabled={willClear}
                        value={secrets[s.name] ?? ''}
                        placeholder={isSet ? C.secretReplace : C.secretNew}
                        aria-label={s.label}
                        onChange={(e) => setSecrets({ ...secrets, [s.name]: e.target.value })}
                        data-testid={`secret-${def.key}-${s.name}`}
                      />
                      {isSet ? (
                        <button type="button" className="btn-ghost min-h-11 shrink-0 border border-line" onClick={() => toggleClear(s.name)} data-testid={`secret-clear-${def.key}-${s.name}`}>
                          {willClear ? <Undo2 className="size-4" aria-hidden /> : null}
                          {willClear ? C.undo : C.secretClear}
                        </button>
                      ) : null}
                    </div>
                    {s.patternHint ? <span className="mt-1 block text-xs text-muted-token">{s.patternHint}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {def.webhookPath ? (
            <div>
              <CopyField value={`${siteUrl}${def.webhookPath}`} label={C.webhook} testId={`webhook-${def.key}`} />
              {def.webhookHint ? <p className="mt-1 text-xs text-muted-token">{def.webhookHint}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-3">
            <button type="button" className="btn-secondary min-h-11" onClick={() => void test.run()} disabled={test.busy} aria-busy={test.busy || undefined} data-testid={`test-${def.key}`}>
              {test.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
              {C.test}
            </button>
            <button type="submit" className="btn-primary min-h-11" disabled={busy} aria-busy={busy || undefined} data-testid={`save-${def.key}`}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {C.save}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
