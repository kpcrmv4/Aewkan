'use client';

import { useEffect } from 'react';
import { rememberTrip } from '@/lib/my-trips';

export { HidePublicNav as HideNav } from '@/components/public/public-bottom-nav';

export interface RememberedTrip {
  token: string;
  bookingNo: string;
  travelDate: string;
  title: string;
}

/** remember this link under "ทริปของฉัน" once the job view has loaded (customer view only) */
export function useRememberTrip(trip: RememberedTrip | null) {
  const key = trip ? `${trip.token}|${trip.bookingNo}|${trip.travelDate}|${trip.title}` : '';
  useEffect(() => {
    if (trip) rememberTrip(trip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
