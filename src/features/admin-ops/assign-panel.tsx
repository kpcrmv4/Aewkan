'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ASSIGN_COPY as C } from '@/lib/copy/admin';
import { postJson } from './api-client';
import { assignMessage } from './helpers';

export type DriverState = 'free' | 'busy' | 'off';

export interface DriverOption {
  id: string;
  nickname: string;
  fullName: string;
  nameEn: string;
  carTh: string;
  carEn: string;
  plate: string;
  langs: string[];
  state: DriverState;
}

export interface AssignContext {
  bookingId: string;
  bookingNo: string;
  date: string;
  time: string;
  lang: 'th' | 'en';
  pickupName: string;
  customerName: string;
  assigned: boolean;
  currentDriverId: string | null;
}

type Channel = keyof typeof C.channels;
const CHANNELS = Object.keys(C.channels) as Channel[];

interface Issued {
  customerPath: string | null;
  driverPath: string;
  message: string;
}

function LinkField({ label, path }: { label: string; path: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  function copy() {
    // the clipboard call must start inside the click; a refusal falls back to selecting the text
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(C.copied))
      .catch(() => {
        ref.current?.focus();
        ref.current?.select();
        toast.error(C.copyFailed);
      });
  }
  return (
    <div>
      <label className="label-base" htmlFor={`link-${path}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input id={`link-${path}`} ref={ref} readOnly value={url} className="input-base tnum min-w-0 flex-1 text-sm" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-secondary min-h-11 shrink-0" onClick={copy}>
          <Copy className="size-4" />
          {C.copyLink}
        </button>
      </div>
    </div>
  );
}

export function AssignPanel({ ctx, drivers, vehicleLabel }: { ctx: AssignContext; drivers: DriverOption[]; vehicleLabel: string }) {
  const router = useRouter();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('line');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [reissue, setReissue] = useState(false);

  const chosen = drivers.find((d) => d.id === driverId) ?? null;
  const preview = assignMessage({
    lang: ctx.lang,
    bookingNo: ctx.bookingNo,
    date: ctx.date,
    time: ctx.time,
    pickupName: ctx.pickupName,
    customerName: ctx.customerName,
    driver: chosen,
    link: reissue || !ctx.assigned ? C.linkPlaceholder : null,
  });
  const channelLabel = C.channels[channel];

  async function submit() {
    if (!chosen || busy) return;
    setBusy(true);
    const res = await postJson<Issued>('/api/admin/assign', { bookingId: ctx.bookingId, driverId: chosen.id, channel, reissueCustomerLink: reissue });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.assigned);
    setIssued(res.data);
    router.refresh();
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(issued?.message ?? preview);
      toast.success(C.copiedMessage);
    } catch {
      toast.error(C.copyFailed);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel order-2 lg:order-1">
        <div className="panel-head">
          {C.messageHead}
          <div role="group" aria-label={C.channelLabel} className="ml-auto inline-flex rounded-sm bg-surface-3 p-0.5">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={channel === c}
                onClick={() => setChannel(c)}
                className={`min-h-11 rounded-xs px-3 text-sm font-medium ${channel === c ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
              >
                {C.channels[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-3">
          <pre data-testid="assign-message" className="whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-[inherit] text-sm leading-6">
            {issued?.message ?? preview}
          </pre>
          <button type="button" className="btn-ghost mt-2 min-h-11" onClick={copyMessage}>
            <Copy className="size-4" />
            {C.copyMessage}
          </button>
        </div>
      </section>

      <section className="panel order-1 lg:order-2">
        <div className="panel-head">
          {C.driversMatch(vehicleLabel)}
        </div>
        {drivers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-token">{C.noDrivers}</p>
        ) : (
          <div role="radiogroup" aria-label={C.driversMatch(vehicleLabel)}>
            {drivers.map((d) => {
              const disabled = d.state === 'off';
              const on = driverId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => setDriverId(d.id)}
                  className={`flex min-h-14 w-full items-center gap-3 border-b border-line-soft px-4 py-2.5 text-left transition-colors last:border-b-0 disabled:opacity-60 ${on ? 'bg-brand-tint' : 'hover:bg-surface-2'}`}
                >
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'}`}>
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {d.nickname} <span className="font-normal text-muted-token">· {d.fullName}</span>
                    </span>
                    <span className="block truncate text-sm text-muted-token">
                      {d.carTh} · {d.plate}
                      {d.langs.length > 0 && ` · ${d.langs.join('/')}`}
                      {ctx.currentDriverId === d.id && ` · ${C.currentDriver}`}
                    </span>
                  </span>
                  {d.state === 'free' && <Badge tone="done">{C.free}</Badge>}
                  {d.state === 'busy' && <Badge tone="progress">{C.busy}</Badge>}
                  {d.state === 'off' && <Badge tone="pending">{C.off}</Badge>}
                </button>
              );
            })}
          </div>
        )}
        <div className="border-t border-line px-4 py-3">
          <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" checked={reissue} onChange={(e) => setReissue(e.target.checked)} />
            <span>{C.reissueCustomer}</span>
          </label>
          <button type="button" className="btn-primary w-full min-h-11" disabled={!chosen || busy} onClick={submit}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {ctx.assigned ? C.reassign(channelLabel) : channel === 'copy' ? C.confirmCopy : C.confirm(channelLabel)}
          </button>
        </div>
      </section>

      {issued && (
        <section className="panel order-3 lg:col-span-2" data-testid="issued-links">
          <div className="panel-head">{C.linksHead}</div>
          <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
            {issued.customerPath ? <LinkField label={C.customerLink} path={issued.customerPath} /> : <p className="text-sm text-muted-token">{C.customerKeeps}</p>}
            <LinkField label={C.driverLink} path={issued.driverPath} />
            <p className="text-sm text-muted-token md:col-span-2">{C.linksNote}</p>
          </div>
        </section>
      )}
    </div>
  );
}
