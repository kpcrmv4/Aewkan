'use client';

import { BellRing, Check, Loader2, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useLang } from '@/components/public/lang';
import type { PayInfoJson } from '@/lib/contracts/payment';
import { pt, type PayCopyKey } from '@/lib/copy/pay';
import { lineOaMessageUrl } from '@/lib/integrations/line-link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { usePayInfo } from './pay-client';

export interface NotifyOptInProps {
  token: string;
  status: string;
}

/**
 * "Booking updates" panel for the customer job link: web push on this device (when VAPID
 * keys exist) and "add our LINE OA" with a pre-filled message carrying this job link.
 * Renders nothing when neither is set up.
 */
export function NotifyOptIn({ token, status }: NotifyOptInProps) {
  const { lang } = useLang();
  const q = usePayInfo(token, status);
  const push = usePushSupport(q.data?.push_key ?? null);
  const info = q.data;
  if (!info || (!info.line && !push)) return null;
  return (
    <section className="panel" data-testid="notify-opt-in">
      <div className="panel-head">
        <BellRing className="size-4" aria-hidden />
        <h2 className="font-heading text-sm font-semibold">{pt('notifyTitle', lang)}</h2>
      </div>
      <div className="space-y-4 p-4">
        {push ? <PushOptIn token={token} info={info} /> : null}
        {info.line ? <LineOptIn token={token} info={info} /> : null}
      </div>
    </section>
  );
}

const noSubscribe = () => () => undefined;

/** browser capability, read on the client only (false while server-rendering) */
function usePushSupport(key: string | null): boolean {
  const supported = useSyncExternalStore(
    noSubscribe,
    () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    () => false,
  );
  return Boolean(key) && supported;
}

const b64urlToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const bytesToB64url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

async function saveSubscription(token: string, sub: PushSubscription, bookingNo: string): Promise<string | null> {
  const j = sub.toJSON();
  const { error } = await getSupabaseBrowser().rpc('job_push_subscribe', {
    p_token: token,
    p_endpoint: j.endpoint ?? sub.endpoint,
    p_p256dh: j.keys?.p256dh ?? '',
    p_auth: j.keys?.auth ?? '',
  });
  // the service worker opens this link when a notification for the booking is tapped
  navigator.serviceWorker.controller?.postMessage({ type: 'aewkan-link', bookingNo, url: window.location.pathname });
  const reg = await navigator.serviceWorker.getRegistration('/');
  reg?.active?.postMessage({ type: 'aewkan-link', bookingNo, url: window.location.pathname });
  return error ? error.message : null;
}

/** web push for this device; re-binds silently when the browser already has a subscription */
export function PushOptIn({ token, info }: { token: string; info: PayInfoJson }) {
  const { lang } = useLang();
  const t = (k: PayCopyKey) => pt(k, lang);
  const key = info.push_key!;
  const [state, setState] = useState<'idle' | 'on' | 'denied' | 'busy'>('idle');

  // already subscribed with the current key → keep it bound to this (possibly new) link
  useEffect(() => {
    let live = true;
    (async () => {
      if (Notification.permission === 'denied') return live && setState('denied');
      if (Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (!sub || bytesToB64url(sub.options.applicationServerKey) !== key) return;
      const err = await saveSubscription(token, sub, info.booking_no);
      if (live && !err) setState('on');
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token, key, info.booking_no]);

  const enable = useCallback(async () => {
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub && bytesToB64url(sub.options.applicationServerKey) !== key) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) });
      const err = await saveSubscription(token, sub, info.booking_no);
      if (err) throw new Error(err);
      setState('on');
      toast.success(t('pushDone'));
    } catch {
      setState('idle');
      toast.error(t('pushFail'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, key, info.booking_no, lang]);

  if (state === 'on') {
    return (
      <p className="flex items-center gap-2 text-sm text-status-done" data-testid="push-on">
        <Check className="size-4" aria-hidden />
        {t('pushDone')}
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="text-sm text-muted-token" data-testid="push-denied">
        {t('pushDenied')}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="push-opt-in">
      <button type="button" className="btn-secondary min-h-11" onClick={() => void enable()} disabled={state === 'busy'} aria-busy={state === 'busy' || undefined}>
        {state === 'busy' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
        {t('pushOn')}
      </button>
      <span className="min-w-0 flex-1 basis-56 text-sm text-muted-token">{t('pushOnSub')}</span>
    </div>
  );
}

/** "add our LINE OA" with the booking number and this job link pre-filled (the OA webhook binds it) */
export function LineOptIn({ token, info }: { token: string; info: PayInfoJson }) {
  const { lang } = useLang();
  const line = info.line!;
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => '');
  const href = origin ? lineOaMessageUrl(line.basic_id, pt('lineMessage', lang, { no: info.booking_no, url: `${origin}/j/${token}` })) : null;

  if (line.bound) {
    return (
      <p className="flex items-center gap-2 text-sm text-status-done" data-testid="line-bound">
        <Check className="size-4" aria-hidden />
        {pt('lineBound', lang)}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="line-opt-in">
      <a
        href={href ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary min-h-11"
        aria-disabled={!href || undefined}
        data-testid="line-add"
      >
        <MessageCircle className="size-4" aria-hidden />
        {pt('lineAdd', lang)}
      </a>
      <span className="min-w-0 flex-1 basis-56 text-sm text-muted-token">{pt('lineAddSub', lang)}</span>
    </div>
  );
}
