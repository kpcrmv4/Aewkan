/**
 * Shared wording (owned by P0). Feature copy lives next to its feature:
 *   trip.ts (P1) · admin.ts (P2) · job.ts (P3). Labels are final copy lifted
 * from the approved demo — change them there first.
 */
import type { BookingStatus } from '@/lib/contracts/common';

export const BRAND = { th: 'แอ่วกัน', en: 'AewKan', mark: 'แอ่ว' } as const;
/** owner's wordmark (scripts/brand-assets.mjs → public/brand) · aspect 2062:713 */
export const LOGO = { src: '/brand/aewkan-logo-480.webp', png: '/brand/aewkan-logo-480.png', ratio: 2062 / 713, icon: '/brand/aewkan-mark.svg' } as const;

export const STATUS_LABEL: Record<BookingStatus, { th: string; en: string; tone: 'pending' | 'progress' | 'done' | 'info' | 'urgent' }> = {
  quote_requested: { th: 'รอเสนอราคา', en: 'Waiting for our quote', tone: 'urgent' },
  quoted: { th: 'เสนอราคาแล้ว รอมัดจำ', en: 'Quoted, deposit pending', tone: 'info' },
  quote_expired: { th: 'หมดเวลามัดจำ', en: 'Deposit deadline passed', tone: 'pending' },
  awaiting_deposit: { th: 'รอมัดจำ', en: 'Awaiting deposit', tone: 'progress' },
  deposit_review: { th: 'รอตรวจสลิป', en: 'Checking your payment', tone: 'progress' },
  confirmed: { th: 'รอจัดคนขับ', en: 'Assigning driver', tone: 'progress' },
  assigned: { th: 'จัดคนขับแล้ว', en: 'Driver confirmed', tone: 'info' },
  traveling: { th: 'กำลังเดินทาง', en: 'On the way', tone: 'progress' },
  done: { th: 'เสร็จสิ้น', en: 'Completed', tone: 'done' },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled', tone: 'pending' },
};

export const MODE_LABEL = {
  hourly: { th: 'เหมาชั่วโมง', en: 'Hourly' },
  daily: { th: 'เหมาวัน', en: 'Full day' },
  trip: { th: 'เหมาทริป', en: 'Fixed trip' },
  oneway: { th: 'ขาเดียว', en: 'One-way' },
  quote: { th: 'เสนอราคา', en: 'Quoted' },
} as const;

export const CATEGORY_LABEL = {
  pickup: { th: 'จุดรับ', en: 'Pickup' },
  city: { th: 'ในเมือง', en: 'In town' },
  temple: { th: 'วัด', en: 'Temples' },
  nature: { th: 'ธรรมชาติและดอย', en: 'Nature & mountains' },
  craft: { th: 'หัตถกรรม', en: 'Crafts' },
  province: { th: 'ต่างจังหวัด', en: 'Other provinces' },
} as const;

/** price-line copy keys produced by src/lib/pricing (vars in {braces}) */
export const PRICE_LINE: Record<string, { th: string; en: string }> = {
  'price.hours': { th: '{h} ชม. × ฿{rate}', en: '{h} h × ฿{rate}' },
  'price.days': { th: '{d} วัน × ฿{rate}', en: '{d} day(s) × ฿{rate}' },
  'price.overtime': { th: 'ล่วงเวลา {h} ชม. × ฿{rate}', en: 'Overtime {h} h × ฿{rate}' },
  'price.extraKm': { th: 'กม.ส่วนเกิน {km} กม. × ฿{rate}', en: 'Extra {km} km × ฿{rate}' },
  'price.tripAllIn': { th: 'เหมารวมทุกอย่าง +{pct}% (ไม่มี OT และกม.ส่วนเกิน)', en: 'All-inclusive +{pct}% (no overtime, no extra km)' },
  'price.perKm': { th: '{km} กม. × ฿{rate}/กม.', en: '{km} km × ฿{rate}/km' },
  'price.emptyReturn': { th: 'ค่าขากลับรถเปล่า {km} กม. × {pct}%', en: 'Empty return {km} km × {pct}%' },
  'price.stopFee': { th: 'ค่าแวะระหว่างทาง {n} จุด', en: '{n} stop(s) on the way' },
  'price.zone': { th: 'ค่าโซน {zone}', en: 'Zone {zone} surcharge' },
  'price.mountain': { th: 'ค่าทางภูเขา {n} จุด', en: 'Mountain road, {n} place(s)' },
  'price.langDriver': { th: 'คนขับสื่อสารภาษาต่างประเทศ', en: 'Foreign-language driver' },
  'price.night': { th: 'ช่วงกลางคืน 22:00–06:00 +{pct}%', en: 'Night hours 22:00–06:00 +{pct}%' },
  'price.festival': { th: 'ช่วงเทศกาล +{pct}%', en: 'Holiday period +{pct}%' },
  'price.quote': { th: 'ราคาเสนอโดยทีมงาน', en: 'Price quoted by our team' },
  'price.returnDiscount': { th: 'ส่วนลดขากลับ {pct}%', en: 'Return discount {pct}%' },
};

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function priceLineText(key: string, vars: Record<string, string | number>, lang: 'th' | 'en'): string {
  const t = PRICE_LINE[key];
  return t ? fill(t[lang], vars) : key;
}
