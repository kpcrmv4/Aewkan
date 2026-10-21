import type { Metadata } from 'next';
import { MyTripsList } from './my-trips-list';

export const metadata: Metadata = { title: 'ทริปของฉัน · My trips' };

export default function MyTripsPage() {
  return <MyTripsList />;
}
