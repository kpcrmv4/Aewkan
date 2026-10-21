'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorRetry } from '@/components/ui/error-retry';
import { Skeleton } from '@/components/ui/states';
import { DRIVERS_COPY as C } from '@/lib/copy/admin';
import { formatTripDate, todayInBangkok } from '@/lib/format';
import { getSupabaseBrowser } from '@/lib/supabase/client';

interface OffDay {
  day: string;
  reason: string;
}

/** off days of one driver; RLS (drivers.manage) decides whether writes land */
export function OffDays({ driverId }: { driverId: string }) {
  const [rows, setRows] = useState<OffDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser()
      .from('driver_off_days')
      .select('day, reason')
      .eq('driver_id', driverId)
      .gte('day', todayInBangkok())
      .order('day', { ascending: true })
      .range(0, 199);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data ?? []);
  }, [driverId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function add() {
    if (!day || busy) {
      if (!day) toast.error(C.offPick);
      return;
    }
    setBusy(true);
    const { data, error } = await getSupabaseBrowser().from('driver_off_days').insert({ driver_id: driverId, day, reason: reason.trim() }).select('day').maybeSingle();
    setBusy(false);
    if (error) {
      toast.error(error.code === '23505' ? C.offDuplicate : C.offDenied);
      return;
    }
    if (!data) {
      toast.error(C.offDenied);
      return;
    }
    toast.success(C.offAdded);
    setDay('');
    setReason('');
    void load();
  }

  async function remove(d: string) {
    const { data, error } = await getSupabaseBrowser().from('driver_off_days').delete().eq('driver_id', driverId).eq('day', d).select('day');
    if (error || !data || data.length === 0) {
      toast.error(C.offDenied);
      return;
    }
    toast.success(C.offRemoved);
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
        <label className="block">
          <span className="label-base">{C.offDay}</span>
          <input type="date" className="input-base" min={todayInBangkok()} value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="block">
          <span className="label-base">{C.offReason}</span>
          <input className="input-base" maxLength={100} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button type="button" className="btn-primary w-full min-h-11" onClick={add} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {C.offAdd}
          </button>
        </div>
      </div>

      {failed ? (
        <ErrorRetry onRetry={() => void load()} message={C.loadError} />
      ) : rows === null ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-token">{C.offNone}</p>
      ) : (
        <ul data-testid="off-days" className="divide-y divide-line-soft rounded-lg border border-line">
          {rows.map((r) => (
            <li key={r.day} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="tnum font-medium">{formatTripDate(r.day, 'th')}</span>
                {r.reason && <span className="text-muted-token"> · {r.reason}</span>}
              </span>
              <button type="button" className="btn-ghost size-11 shrink-0 p-0" aria-label={`${C.offRemove} ${formatTripDate(r.day, 'th')}`} onClick={() => remove(r.day)}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
