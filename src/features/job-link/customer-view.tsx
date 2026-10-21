'use client';

import { Check } from 'lucide-react';
import { useLang } from '@/components/public/lang';
import { NotifyOptIn } from '@/features/payments/notify-opt-in';
import { PayDeposit } from '@/features/payments/pay-deposit';
import { formatTime } from '@/lib/format';
import { latestPhoto, name, type JobModel } from './model';
import { useRememberTrip } from './orchestrator-hooks';
import { DriverCard, HeaderCard, ItineraryPanel, Panel, PricePanel, useJt } from './parts';
import { QuoteBox } from './quote-box';
import { ReturnOffer } from './return-panel';

const DRIVER_STAGES = ['confirmed', 'assigned', 'traveling', 'done'];

/** audience `customer`: status, driver, itinerary, price, proof lines and the return offer. No photos, no commission. */
export function CustomerView({ job, token, now, vehicle, refresh }: { job: JobModel; token: string; now: number; vehicle: string; refresh: () => void }) {
  const { lang } = useLang();
  const t = useJt();
  useRememberTrip({
    token,
    bookingNo: job.bookingNo,
    travelDate: job.travelDate,
    title: job.stops.length ? job.stops.map((s) => name(s, lang)).join(' · ') : name(job.pickup, lang),
  });

  const pickup = latestPhoto(job.photos, 'pickup');
  const dropoff = latestPhoto(job.photos, 'dropoff');
  const proof = (job.status === 'traveling' || job.status === 'done') && (pickup || dropoff);

  return (
    <div className="space-y-4" data-testid="customer-view">
      <HeaderCard job={job} vehicle={vehicle} />
      <QuoteBox job={job} now={now} />
      <PayDeposit token={token} status={job.status} onChanged={refresh} />
      {job.status === 'done' ? <ReturnOffer job={job} token={token} onChanged={refresh} /> : null}
      {proof ? (
        <Panel>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" data-testid="proof-lines">
            {pickup ? (
              <span data-testid="proof-pickup">
                <Check className="mr-1 inline size-4 text-status-done" aria-hidden />
                {t('pickedAt', { t: formatTime(pickup.takenAt) })} · <span className="text-muted-token">{t('photoProof')}</span>
              </span>
            ) : null}
            {dropoff ? (
              <span data-testid="proof-dropoff">
                <Check className="mr-1 inline size-4 text-status-done" aria-hidden />
                {t('droppedAt', { t: formatTime(dropoff.takenAt) })} · <span className="text-muted-token">{t('photoProof')}</span>
              </span>
            ) : null}
          </div>
        </Panel>
      ) : null}
      {DRIVER_STAGES.includes(job.status) ? <DriverCard job={job} /> : null}
      <NotifyOptIn token={token} status={job.status} />
      <ItineraryPanel job={job} />
      <PricePanel job={job} />
    </div>
  );
}
