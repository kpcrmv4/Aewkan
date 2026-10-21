/**
 * Notification wording (pure — unit-tested in tests/unit/p4-notify.test.ts).
 * Customer messages follow the booking's language; staff alerts are Thai.
 * Push carries only title/body/booking number; LINE text may carry a job link when the
 * caller has the raw one (e.g. the assign route just issued it).
 */
import { BRAND } from '@/lib/copy/common';
import { baht, formatDeadline, formatTripDate } from '@/lib/format';

export const NOTIFY_KINDS = ['new_booking', 'quote_ready', 'deposit_received', 'slip_review', 'confirmed', 'driver_assigned', 'return_offer'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/** kinds that go to the staff LINE target instead of the customer */
export const STAFF_KINDS: readonly NotifyKind[] = ['new_booking', 'slip_review'];

export interface MessageInput {
  lang: 'th' | 'en';
  bookingNo: string;
  travelDate: string;
  pickupTime: string;
  pickupName: string;
  customerName: string;
  total: number;
  deposit: number;
  quote: { price: number; deposit: number; deadline: string | null } | null;
  driver: { nickname: string; plate: string; car: string } | null;
  returnOffer: { fromName: string; pct: number } | null;
  /** raw customer link, only when the caller holds it */
  customerUrl?: string | null;
  /** admin job page for staff alerts */
  adminUrl?: string | null;
}

export interface CustomerMessage {
  title: string;
  body: string;
  /** LINE text (longer, may end with the link) */
  text: string;
}

const hhmm = (t: string) => t.slice(0, 5);

export function customerMessage(kind: NotifyKind, m: MessageInput): CustomerMessage | null {
  const th = m.lang === 'th';
  const brand = th ? BRAND.th : BRAND.en;
  const when = `${formatTripDate(m.travelDate, m.lang)} · ${hhmm(m.pickupTime)}`;
  let title: string;
  let body: string;
  switch (kind) {
    case 'quote_ready': {
      if (!m.quote) return null;
      const by = m.quote.deadline ? formatDeadline(m.quote.deadline, m.lang) : '';
      title = th ? `${brand} · ราคาทริปของคุณมาแล้ว` : `${brand} · Your trip price is ready`;
      body = th
        ? `${when} · ${baht(m.quote.price)} · โอนมัดจำ ${baht(m.quote.deposit)}${by ? ` ภายใน ${by}` : ''}`
        : `${when} · ${baht(m.quote.price)} · deposit ${baht(m.quote.deposit)}${by ? ` due by ${by}` : ''}`;
      break;
    }
    case 'deposit_received':
      title = th ? `${brand} · ได้รับสลิปมัดจำแล้ว` : `${brand} · Deposit slip received`;
      body = th ? `การจอง ${m.bookingNo} · ทีมงานกำลังตรวจสอบและจะยืนยันให้เร็วที่สุด` : `Booking ${m.bookingNo} · we are checking it and will confirm shortly`;
      break;
    case 'confirmed':
      title = th ? `${brand} · ยืนยันการจองแล้ว` : `${brand} · Booking confirmed`;
      body = th ? `การจอง ${m.bookingNo} · ${when} · รับมัดจำแล้ว กำลังจัดคนขับให้` : `Booking ${m.bookingNo} · ${when} · deposit received, we are assigning your driver`;
      break;
    case 'driver_assigned': {
      const d = m.driver;
      title = th ? `${brand} · คนขับของคุณพร้อมแล้ว` : `${brand} · Your driver is confirmed`;
      body = d
        ? th
          ? `${when} · ${d.nickname} · ${d.car} · ทะเบียน ${d.plate}`
          : `${when} · ${d.nickname} · ${d.car} · plate ${d.plate}`
        : th
          ? `${when} · ดูรายละเอียดคนขับในลิงก์งาน`
          : `${when} · see your driver in the trip link`;
      break;
    }
    case 'return_offer': {
      const r = m.returnOffer;
      if (!r) return null;
      title = th ? `${brand} · จองขากลับล่วงหน้าได้เลย` : `${brand} · Book your ride back`;
      body = th ? `คุณอยู่ที่${r.fromName} · ส่วนลดขากลับ ${r.pct}% · ใช้ข้อมูลเดิม เลือกแค่วันและเวลา` : `You are in ${r.fromName} · ${r.pct}% off the return · same details, just pick a date and time`;
      break;
    }
    default:
      return null;
  }
  const link = m.customerUrl ? `\n${m.customerUrl}` : th ? '\nเปิดลิงก์งานที่ส่งไว้ในแชทนี้เพื่อดูรายละเอียด' : '\nOpen your trip link in this chat for the details.';
  return { title, body, text: `${title}\n${body}${link}` };
}

export function staffMessage(kind: NotifyKind, m: MessageInput): string | null {
  const head = `${m.bookingNo} · ${m.customerName} · ${formatTripDate(m.travelDate, 'th')} ${hhmm(m.pickupTime)} · ${m.pickupName}`;
  const link = m.adminUrl ? `\n${m.adminUrl}` : '';
  if (kind === 'new_booking') {
    const price = m.quote ? 'ขอราคา' : `${baht(m.total)} · มัดจำ ${baht(m.deposit)}`;
    return `งานใหม่ · ${head}\n${price}${link}`;
  }
  if (kind === 'slip_review') return `สลิปมัดจำรอตรวจ · ${head}\nยอดที่ต้องได้ ${baht(m.quote ? m.quote.deposit : m.deposit)}${link}`;
  return null;
}
