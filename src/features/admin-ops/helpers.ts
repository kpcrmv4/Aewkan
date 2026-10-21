import { formatTripDate } from '@/lib/format';

export const PAGE_SIZE = 20;

/** 'HH:MM:SS' | 'HH:MM' → 'HH:MM' */
export const hhmm = (t: string) => t.slice(0, 5);

const toMin = (t: string) => {
  const [h, m] = hhmm(t).split(':').map(Number);
  return h * 60 + m;
};
export const clock = (min: number) => {
  const d = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

/**
 * Planned clock per stop. `planned_minutes` is the drive time of the leg that
 * reaches the stop; the previous stop's dwell is added before it.
 */
export function plannedTimes(pickupTime: string, stops: Array<{ planned_minutes: number; dwell_min: number }>): string[] {
  let t = toMin(pickupTime);
  const out: string[] = [];
  stops.forEach((s, i) => {
    if (i > 0) t += stops[i - 1].dwell_min;
    t += s.planned_minutes;
    out.push(clock(t));
  });
  return out;
}

/** strip characters that would break a PostgREST `or(...)` filter or act as wildcards */
export const cleanSearch = (q: string) => q.replace(/[,()%*_\\"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export const parsePage = (raw: string | undefined) => {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n >= 1 && n <= 10_000 ? n : 1;
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 'Place A → Place B' from the stop names (pickup first when given) */
export function tripTitle(names: string[], roundTrip: boolean, oneWayLabel: string, emptyLabel: string): string {
  if (names.length === 0) return emptyLabel;
  const base = names.join(' → ');
  return roundTrip ? base : `${base} (${oneWayLabel})`;
}

export function assignMessage(o: {
  lang: 'th' | 'en';
  bookingNo: string;
  date: string;
  time: string;
  pickupName: string;
  customerName: string;
  driver: { nickname: string; nameEn: string; carTh: string; carEn: string; plate: string } | null;
  /** null = the customer keeps the link they already have */
  link: string | null;
}): string {
  const date = formatTripDate(o.date, o.lang);
  const time = hhmm(o.time);
  if (o.lang === 'en') {
    const d = o.driver ? `${o.driver.nameEn || o.driver.nickname} · ${o.driver.carEn || o.driver.carTh} · ${o.driver.plate}` : '(select a driver)';
    return `Aewkan: your booking ${o.bookingNo} is confirmed.\n${date} · pickup ${time} at ${o.pickupName}\nDriver: ${d}\nItinerary, price and driver contact: ${o.link ?? 'the link you received when booking'}\nThank you, ${o.customerName}!`;
  }
  const d = o.driver ? `${o.driver.nickname} · ${o.driver.carTh} · ${o.driver.plate}` : '(ยังไม่ได้เลือกคนขับ)';
  return `แอ่วกัน ยืนยันการจอง ${o.bookingNo} แล้วค่ะ\n${date} · รับ ${time} ที่ ${o.pickupName}\nคนขับ: ${d}\nดูกำหนดการ ราคา และติดต่อคนขับได้ที่ ${o.link ?? 'ลิงก์เดิมที่ได้รับตอนจอง'}\nขอบคุณคุณ${o.customerName} ค่ะ`;
}

export interface DepositRule {
  pct: number;
  round: number;
  min: number;
}

/** same formula as pricing.depositFor, for the quote form's live default */
export function depositFromRules(total: number, r: DepositRule): number {
  const step = r.round > 0 ? r.round : 100;
  return Math.max(r.min, Math.round((total * r.pct) / 100 / step) * step);
}
