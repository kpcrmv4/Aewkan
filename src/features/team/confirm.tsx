'use client';

import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Sheet } from '@/features/admin-ops/sheet';
import { TEAM_COPY as C } from '@/lib/copy/team';

/**
 * radix confirm: a bottom sheet on phones, a card from sm up. With
 * `typeWord`, the confirm button stays disabled until that word is typed.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel = C.confirm,
  danger = false,
  busy,
  typeWord,
  typeLabel,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy: boolean;
  typeWord?: string;
  typeLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const ready = !typeWord || typed.trim() === typeWord;
  const close = () => {
    if (busy) return;
    setTyped('');
    onCancel();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} title={title} description={body}>
      {children}
      {typeWord && (
        <label className="mb-3 block">
          <span className="label-base">{typeLabel ?? typeWord}</span>
          <input className="input-base" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </label>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary min-h-11" onClick={close} disabled={busy}>
          {C.cancel}
        </button>
        <button
          type="button"
          className={`${danger ? 'btn-danger' : 'btn-primary'} min-h-11`}
          disabled={busy || !ready}
          onClick={() => {
            onConfirm();
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
