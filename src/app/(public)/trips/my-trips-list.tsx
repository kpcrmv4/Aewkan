'use client';

import { ChevronRight, Map, Ticket, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLang, useT } from '@/components/public/lang';
import { PublicHeader } from '@/components/public/public-header';
import { forgetTrip, listTrips, type MyTrip } from '@/lib/my-trips';

const COPY = {
  title: { th: 'ทริปของฉัน', en: 'My trips' },
  sub: {
    th: 'ทริปที่เคยจองหรือเปิดลิงก์บนเครื่องนี้ · ลิงก์ฉบับเต็มอยู่ในข้อความที่เราส่งให้ทาง LINE หรืออีเมล',
    en: 'Trips booked or opened on this device. Your full link is also in the LINE message or e-mail we sent.',
  },
  emptyTitle: { th: 'ยังไม่มีทริปบนเครื่องนี้', en: 'No trips on this device yet' },
  emptyBody: {
    th: 'วางทริปแล้วจอง หรือเปิดลิงก์งานที่ได้รับ ทริปจะแสดงที่นี่',
    en: 'Plan and book a trip, or open the job link you received, and it will show up here.',
  },
  plan: { th: 'วางทริป', en: 'Plan a trip' },
  remove: { th: 'ลบออกจากเครื่องนี้', en: 'Remove from this device' },
} as const;

export function MyTripsList() {
  const t = useT();
  const { lang } = useLang();
  const [trips, setTrips] = useState<MyTrip[] | null>(null);

  useEffect(() => {
    setTrips(listTrips());
  }, []);

  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00+07:00`).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
      timeZone: 'Asia/Bangkok',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-[720px] pb-8 pt-4" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
        <h1 className="font-heading text-[26px] font-semibold">{t(COPY.title)}</h1>
        <p className="mb-4 mt-1 text-sm text-muted-token">{t(COPY.sub)}</p>

        {trips === null ? (
          <div className="panel divide-y divide-line-soft" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4">
                <div className="size-10 animate-pulse rounded-md bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="panel flex flex-col items-center px-6 py-10 text-center">
            <Ticket className="mb-3 size-8 text-muted-token" aria-hidden />
            <p className="font-semibold">{t(COPY.emptyTitle)}</p>
            <p className="mb-4 mt-1 max-w-[36ch] text-sm text-muted-token">{t(COPY.emptyBody)}</p>
            <Link href="/" className="btn-primary">
              <Map className="size-4" aria-hidden />
              {t(COPY.plan)}
            </Link>
          </div>
        ) : (
          <ul className="panel divide-y divide-line-soft">
            {trips.map((trip) => (
              <li key={trip.token} className="flex items-center gap-1 pr-2">
                <Link href={`/j/${trip.token}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-tint text-brand-on-tint">
                    <Ticket className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{trip.title || trip.bookingNo}</span>
                    <span className="block truncate text-[13px] text-muted-token">
                      <span className="tabular-nums">{trip.bookingNo}</span> · {fmtDate(trip.travelDate)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-token" aria-hidden />
                </Link>
                <button
                  type="button"
                  aria-label={t(COPY.remove)}
                  className="btn-ghost btn-sm min-h-11 min-w-11 !px-2"
                  onClick={() => {
                    forgetTrip(trip.token);
                    setTrips(listTrips());
                  }}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
