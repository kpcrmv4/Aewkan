'use client';

import { Loader2, RotateCcw, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/features/admin-ops/sheet';
import { PRICING_COPY as C } from '@/lib/copy/settings';
import type { Catalog, Rules } from '@/lib/pricing';
import { postJson } from './api';
import { firstRulesIssue, RulesSchema } from './rules-schema';
import { RulesPreview } from './rules-preview';
import { ExtrasSection, ModesSection, VehiclesSection, ZonesSection, type Update } from './rules-sections';
import { CommissionRulesSection, QuoteSection, ReturnOfferSection } from './rules-sections-b';

/**
 * The draft is a deep copy of the current rule set; fields the editor does not
 * show stay as they were. Publishing sends the whole object to
 * POST /api/admin/pricing/publish (validated again on the server).
 */
export function RulesEditor({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const current = catalog.rules;
  const [draft, setDraft] = useState<Rules>(() => structuredClone(current));
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update: Update = (fn) =>
    setDraft((d) => {
      const next = structuredClone(d);
      fn(next);
      return next;
    });

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(current), [draft, current]);
  const problem = useMemo(() => {
    const r = RulesSchema.safeParse(draft);
    return r.success ? null : firstRulesIssue(r.error);
  }, [draft]);
  const next = catalog.ruleVersion + 1;

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await postJson<{ version: number }>('/api/admin/pricing/publish', { rules: draft, note: note.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success(C.published(res.data.version));
    setOpen(false);
    setNote('');
    router.refresh();
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <ZonesSection rules={draft} update={update} />
          <VehiclesSection rules={draft} update={update} />
          <ModesSection rules={draft} update={update} />
          <ExtrasSection rules={draft} update={update} />
          <QuoteSection rules={draft} update={update} />
          <ReturnOfferSection rules={draft} update={update} />
          <CommissionRulesSection rules={draft} update={update} />
        </div>
        <div className="order-1 min-w-0 lg:sticky lg:top-4 lg:order-2">
          <RulesPreview catalog={catalog} draft={draft} />
        </div>
      </div>

      <div
        className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 shadow-e2 lg:bottom-0"
        data-testid="rules-bar"
      >
        <p className="min-w-0 flex-1 basis-48 text-sm" role="status" data-testid="rules-bar-status">
          {problem ? (
            <span className="text-urgent">
              {C.bar.invalid}: {problem}
            </span>
          ) : dirty ? (
            <span className="text-ink">{C.bar.dirty}</span>
          ) : (
            <span className="text-muted-token">{C.bar.clean}</span>
          )}
        </p>
        <button type="button" className="btn-secondary min-h-11" disabled={!dirty || busy} data-testid="rules-reset" onClick={() => setDraft(structuredClone(current))}>
          <RotateCcw className="size-4" />
          {C.bar.reset}
        </button>
        <button
          type="button"
          className="btn-primary min-h-11"
          disabled={!dirty || problem !== null || busy}
          data-testid="rules-publish"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <Upload className="size-4" />
          {C.bar.publish(next)}
        </button>
      </div>

      <Sheet open={open} onOpenChange={(o) => !busy && setOpen(o)} title={C.publishSheet.title} description={C.publishSheet.body(next)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <label className="block">
            <span className="label-base">{C.publishSheet.note}</span>
            <input className="input-base min-h-11" value={note} maxLength={200} placeholder={C.publishSheet.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-urgent">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => setOpen(false)}>
              {C.publishSheet.cancel}
            </button>
            <button type="submit" className="btn-primary min-h-11" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {C.publishSheet.confirm}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
