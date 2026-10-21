import { formatTime, formatTripDate, TZ } from '@/lib/format';

/** a database timestamp -> 'ส. 24 ต.ค. 69 14:30' in Bangkok time */
export function stamp(ts: string): string {
  const ymd = new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
  return `${formatTripDate(ymd, 'th', { shortYear: true })} ${formatTime(ts)}`;
}
