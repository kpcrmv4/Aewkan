'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLang } from '@/components/public/lang';
import { jobErrorText } from '@/lib/copy/job';
import { baht } from '@/lib/format';
import { callJob } from './job-client';
import { commissionRows, commissionSums, name, type JobModel, type StopModel } from './model';
import { BusyButton, Panel, useJt } from './parts';

type CopyFn = ReturnType<typeof useJt>;

export function commissionLabel(c: NonNullable<StopModel['commission']>, t: CopyFn): string {
  const a = c.amount.toLocaleString('en-US');
  return c.type === 'head' ? t('commHead', { a }) : c.type === 'booking' ? t('commBooking', { a }) : t('commSale', { a });
}

/** the chip under each stop in the itinerary: "ค่าน้ำ ฿200/คน" or "ไม่มีค่าน้ำ" */
export function CommissionChip({ stop }: { stop: StopModel }) {
  const t = useJt();
  return (
    <span className={`pill mt-1.5 py-0.5 text-xs ${stop.commission ? 'border-brand-tint-strong bg-brand-tint text-brand-on-tint' : ''}`} data-testid={`comm-chip-${stop.seq}`}>
      {stop.commission ? `${t('commLbl')} ${commissionLabel(stop.commission, t)}` : t('commNone')}
    </span>
  );
}

/** commission totals + the purchase amount input for percent-of-sale stops */
export function CommissionPanel({ job, token, canReport, onChanged }: { job: JobModel; token: string; canReport: boolean; onChanged: () => void }) {
  const { lang } = useLang();
  const t = useJt();
  const rows = commissionRows(job);
  const sums = commissionSums(rows);
  const [sale, setSale] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function save(seq: number, current: string | undefined) {
    const raw = current ?? '';
    const n = raw.trim() === '' ? null : Number(raw);
    setBusy(seq);
    const { error } = await callJob('job_commission', { p_token: token, p_seq: seq, p_sale: n });
    setBusy(null);
    if (error) {
      toast.error(jobErrorText(error, lang));
      return;
    }
    toast.success(t('commSaved'));
    onChanged();
  }

  return (
    <Panel title={t('commTitle')} right={job.policy ? `${t('commPolicy')} ${job.ruleVersion}` : null}>
      <div data-testid="commission-panel">
        {!rows.length ? <p className="text-sm text-muted-token">{t('commNoneTrip')}</p> : null}
        <div className="space-y-3">
          {rows.map((r) => {
            const c = r.stop.commission!;
            const value = sale[r.stop.seq] ?? (r.stop.report?.saleAmount != null ? String(r.stop.report.saleAmount) : '');
            return (
              <div key={r.stop.seq} className="flex flex-wrap items-start justify-between gap-3 text-sm" data-testid={`comm-row-${r.stop.seq}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {job.stops.findIndex((s) => s.seq === r.stop.seq) + 1}. {name(r.stop, lang)}
                  </div>
                  <div className="text-muted-token">
                    {commissionLabel(c, t)}
                    {job.policy?.splits[c.splitKey] ? ` · ${lang === 'en' ? job.policy.splits[c.splitKey].name_en : job.policy.splits[c.splitKey].name_th}` : ''}
                    {c.note ? ` · ${c.note}` : ''}
                  </div>
                  {c.type === 'sale' && canReport ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="max-w-[220px] flex-1">
                        <span className="label-base">{t('commReport')}</span>
                        <input
                          className="input-base tnum"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={100}
                          value={value}
                          placeholder={String((job.policy?.assumedSpend ?? 0) * job.pax)}
                          onChange={(e) => setSale((s) => ({ ...s, [r.stop.seq]: e.target.value }))}
                          data-testid={`comm-sale-${r.stop.seq}`}
                        />
                      </label>
                      <BusyButton className="btn-secondary btn-sm" busy={busy === r.stop.seq} disabled={busy !== null} onClick={() => save(r.stop.seq, value)} data-testid={`comm-save-${r.stop.seq}`}>
                        {t('commSend')}
                      </BusyButton>
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="tnum font-semibold" data-testid={`comm-driver-${r.stop.seq}`}>
                    {r.estimated ? `${t('commEst')} ` : ''}
                    {baht(r.driver)}
                  </div>
                  <div className="text-muted-token">
                    {t('commDriver')}
                    {r.company ? ` · ${t('commCompany')} ${baht(r.company)}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {rows.length ? (
          <div className="mt-3 space-y-1 border-t border-line-soft pt-3 text-sm">
            <div className="flex justify-between font-semibold">
              <span>{t('commTotalDriver')}</span>
              <span className="tnum" data-testid="comm-total-driver">
                {baht(sums.driver)}
              </span>
            </div>
            {sums.company ? (
              <div className="flex justify-between text-muted-token">
                <span>{t('commTotalCompany')}</span>
                <span className="tnum" data-testid="comm-total-company">
                  {baht(sums.company)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        {job.policy?.policyTh ? <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted-token" data-testid="comm-policy">{job.policy.policyTh}</p> : null}
      </div>
    </Panel>
  );
}
