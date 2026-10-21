/**
 * Formatting with the time zone pinned (Vercel and containers run UTC).
 * Thai dates show the Buddhist year (พ.ศ.) as the demo does.
 */
export const TZ = 'Asia/Bangkok';

export const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;

export const bahtDelta = (d: number) => (d > 0 ? `+${baht(d)}` : d < 0 ? `−${baht(-d)}` : '±฿0');

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** 'YYYY-MM-DD' (a calendar date, no time zone) → 'ส. 24 ต.ค. 2569' or 'Sat, 24 Oct 2026' */
export function formatTripDate(iso: string, lang: 'th' | 'en' = 'th', opts: { shortYear?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (lang === 'en') {
    return dt.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  const be = y + 543;
  return `${TH_DAYS[dt.getUTCDay()]} ${d} ${TH_MONTHS[m - 1]} ${opts.shortYear ? String(be).slice(2) : be}`;
}

/** a timestamp → 'HH:MM' in Bangkok */
export function formatTime(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

/** customers abroad read every clock as Thailand time — say so next to it */
export const TZ_NOTE = { th: 'เวลาไทย', en: 'Thailand time, GMT+7' } as const;

/** a timestamp → '24 ต.ค. 14:30 (เวลาไทย)' / '24 Oct 14:30 (Thailand time, GMT+7)' */
export function formatDeadline(ts: string | number | Date, lang: 'th' | 'en' = 'th'): string {
  const ymd = new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
  const [, m, d] = ymd.split('-').map(Number);
  const day = lang === 'en' ? `${d} ${new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' })}` : `${d} ${TH_MONTHS[m - 1]}`;
  return `${day} ${formatTime(ts)} (${TZ_NOTE[lang]})`;
}

/** today in Bangkok as 'YYYY-MM-DD' */
export function todayInBangkok(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** minutes → '1.5 ชม.' / '45 น.' */
export function formatDuration(minutes: number, lang: 'th' | 'en' = 'th'): string {
  if (minutes >= 60) {
    const h = (minutes / 60).toFixed(1).replace(/\.0$/, '');
    return lang === 'en' ? `${h} h` : `${h} ชม.`;
  }
  return lang === 'en' ? `${Math.round(minutes)} min` : `${Math.round(minutes)} น.`;
}
