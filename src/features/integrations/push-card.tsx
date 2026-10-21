'use client';

import { FlaskConical, KeyRound, Loader2, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { postJson } from '@/features/admin-ops/api-client';
import { Sheet } from '@/features/admin-ops/sheet';
import type { PushConfigState } from '@/lib/contracts/payment';
import { INTEG_COPY as C, integErrorText } from '@/lib/copy/pay';
import { CopyField, Switch, useTest } from './ui';

/** web-push VAPID keys (R-010): generate once on the server; rotating needs an explicit confirm */
export function PushCard({ initial, defaultSubject }: { initial: PushConfigState | null; defaultSubject: string }) {
  const [cfg, setCfg] = useState(initial);
  const [subject, setSubject] = useState(initial?.subject ?? defaultSubject);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const test = useTest('push');

  async function act(action: 'generate' | 'rotate' | 'enable' | 'disable' | 'subject') {
    if (busy) return;
    setBusy(action);
    const r = await postJson<PushConfigState | null>('/api/admin/integrations/push', { action, subject });
    setBusy(null);
    if (!r.ok) return toast.error(integErrorText(r.code, r.message));
    setCfg(r.data);
    if (r.data) setSubject(r.data.subject);
    setConfirmRotate(false);
    toast.success(action === 'generate' || action === 'rotate' ? C.pushGenerated : C.saved);
  }

  return (
    <section className="panel" data-testid="integ-push">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{C.pushTitle}</h2>
          <p className="text-sm text-muted-token">{C.pushSub}</p>
        </div>
        {cfg ? (
          <Switch checked={cfg.isEnabled} onChange={(v) => void act(v ? 'enable' : 'disable')} label={C.pushTitle} disabled={busy !== null} testId="toggle-push" />
        ) : null}
      </div>
      <div className="space-y-4 p-4">
        <label className="block">
          <span className="label-base">{C.pushSubject}</span>
          <div className="flex gap-2">
            <input className="input-base min-w-0 flex-1" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} data-testid="push-subject" />
            {cfg && subject !== cfg.subject ? (
              <button type="button" className="btn-secondary min-h-11 shrink-0" onClick={() => void act('subject')} disabled={busy !== null}>
                {busy === 'subject' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {C.save}
              </button>
            ) : null}
          </div>
        </label>
        {cfg ? (
          <CopyField value={cfg.publicKey} label={C.pushPublic} testId="push-public-key" />
        ) : (
          <p className="rounded-md bg-surface-2 px-3 py-3 text-sm text-ink-2" data-testid="push-none">
            {C.pushNone}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-3">
          {cfg ? (
            <>
              <button type="button" className="btn-secondary min-h-11" onClick={() => void test.run()} disabled={test.busy} aria-busy={test.busy || undefined} data-testid="test-push">
                {test.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
                {C.test}
              </button>
              <button type="button" className="btn-danger min-h-11" onClick={() => setConfirmRotate(true)} disabled={busy !== null} data-testid="push-rotate">
                <RefreshCcw className="size-4" aria-hidden />
                {C.pushRotate}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary min-h-11" onClick={() => void act('generate')} disabled={busy !== null} aria-busy={busy === 'generate' || undefined} data-testid="push-generate">
              {busy === 'generate' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              {C.pushGenerate}
            </button>
          )}
        </div>
      </div>
      <Sheet open={confirmRotate} onOpenChange={(o) => !o && busy === null && setConfirmRotate(false)} title={C.pushRotateTitle} description={C.pushRotateBody}>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary min-h-11" onClick={() => setConfirmRotate(false)} disabled={busy !== null}>
            {C.cancel}
          </button>
          <button type="button" className="btn-danger min-h-11" onClick={() => void act('rotate')} disabled={busy !== null} aria-busy={busy === 'rotate' || undefined}>
            {busy === 'rotate' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {C.confirm}
          </button>
        </div>
      </Sheet>
    </section>
  );
}
