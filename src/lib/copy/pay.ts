/**
 * P4 wording: the customer deposit panel (th + en), the staff payments page and the
 * integrations page (Thai). Variables use {braces} — see `fill()`.
 */
import { fill } from './common';

export type Lang = 'th' | 'en';
type Pair = { th: string; en: string };

export const PAY_COPY = {
  payTitle: { th: 'ชำระมัดจำ {d}', en: 'Pay the deposit {d}' },
  paySub: { th: 'มัดจำล็อกรถและคนขับให้คุณ ส่วนที่เหลือจ่ายคนขับหน้างาน', en: 'The deposit locks your car and driver. Pay the rest to the driver on the day.' },
  payBy: { th: 'โอนมัดจำภายใน {t}', en: 'Pay the deposit by {t}' },
  qrTitle: { th: 'สแกนจ่ายด้วย PromptPay', en: 'Scan to pay with PromptPay' },
  qrAlt: { th: 'QR PromptPay ยอด {d}', en: 'PromptPay QR for {d}' },
  qrAccount: { th: 'พร้อมเพย์ {id}', en: 'PromptPay {id}' },
  qrSave: { th: 'บันทึก QR', en: 'Save QR' },
  qrStep: { th: 'โอนแล้วแนบสลิปด้านล่าง ระบบจะตรวจและยืนยันให้', en: 'After the transfer, attach the slip below. We check it and confirm your trip.' },
  slipUpload: { th: 'แนบสลิปโอนเงิน', en: 'Attach the transfer slip' },
  slipReplace: { th: 'ส่งสลิปใหม่แทน', en: 'Send a different slip' },
  slipUploading: { th: 'กำลังส่งสลิป…', en: 'Sending the slip…' },
  slipSent: { th: 'ส่งสลิปแล้ว', en: 'Slip sent' },
  slipReviewTitle: { th: 'ได้รับสลิปแล้ว กำลังตรวจสอบ', en: 'Slip received, we are checking it' },
  slipReviewSub: {
    th: 'ทีมงานจะยืนยันการจองให้เร็วที่สุด เราจะแจ้งเมื่อตรวจเสร็จ ส่งเมื่อ {t}',
    en: 'We will confirm your booking as soon as possible and let you know. Sent {t}.',
  },
  slipAutoOk: { th: 'ตรวจสลิปผ่านแล้ว ยืนยันการจองเรียบร้อย', en: 'Slip verified. Your booking is confirmed.' },
  slipRejectedTitle: { th: 'สลิปไม่ผ่านการตรวจ', en: 'The slip was not accepted' },
  slipRejectedSub: { th: 'กรุณาโอนและแนบสลิปใหม่ หรือติดต่อทีมงาน', en: 'Please transfer again and attach a new slip, or contact us.' },
  slipReason: { th: 'เหตุผล: {r}', en: 'Reason: {r}' },
  notImage: { th: 'กรุณาเลือกไฟล์รูปภาพของสลิป', en: 'Please choose an image of the slip.' },
  tooBig: { th: 'ไฟล์ใหญ่เกินไป', en: 'The file is too large.' },
  uploadFail: { th: 'ส่งสลิปไม่สำเร็จ ลองใหม่อีกครั้ง', en: 'Could not send the slip. Please try again.' },
  cardTitle: { th: 'หรือจ่ายด้วยบัตร / e-wallet', en: 'Or pay by card / e-wallet' },
  payStripe: { th: 'จ่ายด้วยบัตรเครดิต/เดบิต', en: 'Pay by credit / debit card' },
  payBeam: { th: 'บัตร / e-wallet / โมบายแบงก์กิ้ง', en: 'Card / e-wallet / mobile banking' },
  redirecting: { th: 'กำลังไปหน้าชำระเงิน…', en: 'Opening the payment page…' },
  returnPaid: { th: 'กำลังยืนยันการชำระเงิน ใช้เวลาไม่เกินหนึ่งนาที', en: 'Confirming your payment. This takes up to a minute.' },
  noMethod: {
    th: 'ทีมงานจะติดต่อคุณทางช่องทางที่ให้ไว้เพื่อรับมัดจำ',
    en: 'Our team will contact you on the channel you gave us to take the deposit.',
  },
  loadFail: { th: 'โหลดข้อมูลการชำระเงินไม่สำเร็จ', en: 'Could not load the payment details.' },
  retry: { th: 'ลองใหม่', en: 'Try again' },
  // notifications
  notifyTitle: { th: 'รับแจ้งเตือนการจอง', en: 'Booking updates' },
  pushOn: { th: 'รับแจ้งเตือนบนเครื่องนี้', en: 'Notify me on this device' },
  pushOnSub: { th: 'แจ้งราคา การยืนยัน และคนขับ ทันทีที่มีความคืบหน้า', en: 'Price, confirmation and driver updates as they happen.' },
  pushDone: { th: 'เปิดแจ้งเตือนบนเครื่องนี้แล้ว', en: 'Notifications are on for this device' },
  pushDenied: { th: 'เบราว์เซอร์ปิดการแจ้งเตือนไว้ เปิดได้ในการตั้งค่าเว็บไซต์', en: 'Notifications are blocked in the browser site settings.' },
  pushFail: { th: 'เปิดแจ้งเตือนไม่สำเร็จ', en: 'Could not turn on notifications' },
  lineAdd: { th: 'แจ้งเตือนทาง LINE', en: 'Get updates on LINE' },
  lineAddSub: {
    th: 'เพิ่มเพื่อน LINE ของเรา แล้วกดส่งข้อความที่เตรียมไว้ (มีลิงก์งานนี้) เพื่อรับแจ้งเตือน',
    en: 'Add our LINE account and send the prepared message (it contains this trip link) to get updates.',
  },
  lineBound: { th: 'เชื่อม LINE กับการจองนี้แล้ว', en: 'LINE is linked to this booking' },
  lineMessage: { th: 'แอ่วกัน การจอง {no}\n{url}', en: 'AewKan booking {no}\n{url}' },
} satisfies Record<string, Pair>;

export type PayCopyKey = keyof typeof PAY_COPY;

export function pt(key: PayCopyKey, lang: Lang, vars: Record<string, string | number> = {}): string {
  return fill(PAY_COPY[key][lang], vars);
}

/** RPC / route error codes → customer copy */
const PAY_ERRORS: Record<string, Pair> = {
  not_payable: { th: 'การจองนี้ไม่อยู่ในขั้นที่ชำระมัดจำได้แล้ว', en: 'This booking no longer takes a deposit.' },
  nothing_due: { th: 'ไม่มียอดมัดจำค้างชำระ', en: 'There is no deposit left to pay.' },
  too_many_slips: { th: 'ส่งสลิปหลายครั้งเกินไป กรุณาติดต่อทีมงาน', en: 'Too many slips sent. Please contact us.' },
  link_not_found: { th: 'ไม่พบลิงก์นี้', en: 'This link was not found.' },
  server_not_configured: { th: 'ช่องทางนี้ยังไม่พร้อม ลองช่องทางอื่นหรือติดต่อทีมงาน', en: 'This option is not ready yet. Try another one or contact us.' },
  provider_not_configured: { th: 'ช่องทางนี้ยังไม่พร้อม ลองช่องทางอื่นหรือติดต่อทีมงาน', en: 'This option is not ready yet. Try another one or contact us.' },
  provider_error: { th: 'ผู้ให้บริการชำระเงินขัดข้อง ลองใหม่อีกครั้ง', en: 'The payment provider had a problem. Please try again.' },
};

export function payErrorText(code: string | null | undefined, lang: Lang): string {
  const hit = code ? PAY_ERRORS[code] : undefined;
  return hit ? hit[lang] : PAY_COPY.uploadFail[lang];
}

// ── staff: การเงิน ─────────────────────────────────────────────────────────────
export const PAYMENTS_COPY = {
  title: 'การเงิน',
  subtitle: 'ตรวจสลิปมัดจำ และรายการรับเงินทั้งหมด',
  tabReview: 'รอตรวจสลิป',
  tabAll: 'รายการทั้งหมด',
  kpiPending: 'สลิปรอตรวจ',
  kpiOnline: 'รอชำระออนไลน์',
  kpiPaidMonth: 'รับแล้วเดือนนี้',
  kpiPaidCount: 'รายการที่รับเดือนนี้',
  emptyQueue: 'ไม่มีสลิปรอตรวจ เมื่อลูกค้าแนบสลิปจากลิงก์งาน รายการจะขึ้นที่นี่',
  emptyAll: 'ยังไม่มีรายการชำระเงิน',
  emptyFiltered: 'ไม่พบรายการตามตัวกรองนี้',
  clearFilters: 'ล้างตัวกรอง',
  loadError: 'โหลดข้อมูลการเงินไม่สำเร็จ',
  due: 'ยอดที่ต้องได้',
  slipAmount: 'ยอดในสลิป',
  uploaded: 'ส่งเมื่อ',
  noPreview: 'เปิดรูปสลิปไม่ได้',
  openSlip: 'เปิดสลิปขนาดเต็ม',
  verifyNone: 'ยังไม่ได้ตรวจอัตโนมัติ',
  verifyOk: 'ตรวจอัตโนมัติ: ผ่าน',
  verifyReview: 'ตรวจอัตโนมัติ: {r}',
  approve: 'อนุมัติ',
  reject: 'ไม่ผ่าน',
  approveTitle: 'อนุมัติมัดจำนี้?',
  approveBody: (no: string, amount: string) => `การจอง ${no} · ${amount} จะเปลี่ยนเป็น "ยืนยันแล้ว รอจัดคนขับ"`,
  rejectTitle: 'สลิปนี้ไม่ผ่าน?',
  rejectBody: 'ลูกค้าจะเห็นเหตุผลในลิงก์งานและแนบสลิปใหม่ได้ ราคาที่เสนอไว้จะได้เวลาโอนเท่าเดิมนับจากตอนนี้',
  rejectReason: 'เหตุผล (ลูกค้าเห็น)',
  rejectPlaceholder: 'เช่น ยอดไม่ครบ / สลิปไม่ชัด / ไม่พบรายการโอน',
  cancel: 'ยกเลิก',
  approved: 'อนุมัติมัดจำแล้ว',
  rejected: 'บันทึกว่าสลิปไม่ผ่านแล้ว',
  bookingStatus: 'สถานะงาน',
  filterAll: 'ทั้งหมด',
  filterMethod: 'ช่องทาง',
  filterStatus: 'สถานะ',
  pageOf: (p: number, n: number) => `หน้า ${p} จาก ${n}`,
  method: { promptpay_slip: 'PromptPay + สลิป', stripe: 'Stripe', beam: 'Beam', cash: 'เงินสด' } as Record<string, string>,
  status: { pending: 'รอตรวจ', verifying: 'กำลังตรวจ', paid: 'รับแล้ว', failed: 'ไม่ผ่าน', refunded: 'คืนเงินแล้ว', cancelled: 'ยกเลิก' } as Record<string, string>,
  purpose: { deposit: 'มัดจำ', balance: 'ส่วนที่เหลือ' } as Record<string, string>,
  bookingPayments: 'การชำระเงิน',
  noPayments: 'ยังไม่มีรายการชำระเงิน',
  dueNow: 'มัดจำค้าง',
  replacedSlips: (n: number) => `ส่งสลิปใหม่แทน ${n} ครั้ง`,
  reasonLabel: 'เหตุผล',
} as const;

/** why an automatic slip check did not auto-confirm (verify_result.check.reason) */
export const VERIFY_REASON: Record<string, string> = {
  verified: 'ผ่าน',
  amount_low: 'ยอดในสลิปน้อยกว่าที่ต้องได้',
  receiver_mismatch: 'ผู้รับเงินไม่ตรงกับพร้อมเพย์/บัญชีของเรา',
  receiver_unknown: 'ระบุผู้รับเงินในสลิปไม่ได้',
  duplicate: 'สลิปนี้เคยถูกตรวจแล้ว (ซ้ำ)',
  duplicate_ref: 'เลขอ้างอิงซ้ำกับรายการอื่น',
  no_ref: 'ไม่พบเลขอ้างอิงในสลิป',
  no_qr: 'ไม่พบ QR ในรูป',
  not_payment_qr: 'QR ไม่ใช่สลิปโอนเงิน',
  qr_expired: 'QR ในสลิปหมดอายุ',
  bank_delay: 'ธนาคารยังไม่ยืนยันรายการ ลองตรวจใหม่ภายหลัง',
  amount_mismatch: 'ยอดไม่ตรง',
  slip_too_old: 'สลิปเก่ากว่าการจอง',
  provider_error: 'ระบบตรวจสลิปขัดข้อง',
  provider_quota: 'โควตาตรวจสลิปหมด',
  provider_auth: 'คีย์ตรวจสลิปไม่ถูกต้อง',
  settle_failed: 'บันทึกผลไม่สำเร็จ',
};

// ── staff: การเชื่อมต่อ ─────────────────────────────────────────────────────────
export const INTEG_COPY = {
  title: 'การเชื่อมต่อ',
  subtitle: 'ตั้งค่าช่องทางรับเงิน การแจ้งเตือน และแผนที่ · คีย์ลับเก็บใน Supabase Vault และไม่แสดงซ้ำ',
  enabled: 'เปิดใช้งาน',
  disabled: 'ปิดอยู่',
  save: 'บันทึก',
  saved: 'บันทึกการตั้งค่าแล้ว',
  secretSet: 'ตั้งค่าแล้ว',
  secretUnset: 'ยังไม่ได้ตั้ง',
  secretReplace: 'ใส่ค่าใหม่เพื่อแทนที่',
  secretNew: 'วางค่าที่ได้จากผู้ให้บริการ',
  secretClear: 'ล้าง',
  secretWillClear: 'จะล้างเมื่อบันทึก',
  undo: 'ไม่ล้าง',
  webhook: 'Webhook URL',
  copy: 'คัดลอก',
  copied: 'คัดลอกแล้ว',
  test: 'ทดสอบ',
  testOk: 'ทดสอบผ่าน',
  loadError: 'โหลดการตั้งค่าไม่สำเร็จ',
  pushTitle: 'Web push (แจ้งเตือนบนมือถือ)',
  pushSub: 'กุญแจ VAPID ชุดเดียวใช้ทุกเครื่อง สร้างครั้งเดียว · คีย์ส่วนตัวเก็บใน Vault',
  pushNone: 'ยังไม่มีกุญแจ ลูกค้าจะยังไม่เห็นปุ่มรับแจ้งเตือน',
  pushGenerate: 'สร้างกุญแจ',
  pushRotate: 'สร้างกุญแจใหม่',
  pushRotateTitle: 'สร้างกุญแจใหม่?',
  pushRotateBody: 'ลูกค้าทุกคนที่เปิดรับแจ้งเตือนไว้จะไม่ได้รับอีกจนกว่าจะกดรับใหม่ ใช้เมื่อคีย์รั่วเท่านั้น',
  pushPublic: 'Public key',
  pushSubject: 'ผู้ติดต่อ (mailto: หรือ https://)',
  pushGenerated: 'สร้างกุญแจแล้ว',
  confirm: 'ยืนยัน',
  cancel: 'ยกเลิก',
  required: 'จำเป็นเมื่อเปิดใช้งาน',
} as const;

export const INTEG_ERRORS: Record<string, string> = {
  config_incomplete: 'กรอกข้อมูลที่จำเป็นให้ครบก่อนเปิดใช้งาน',
  bad_config: 'รูปแบบข้อมูลไม่ถูกต้อง',
  push_keys_exist: 'มีกุญแจอยู่แล้ว ใช้ "สร้างกุญแจใหม่" ถ้าต้องการเปลี่ยน',
  push_keys_missing: 'ยังไม่มีกุญแจ',
  server_not_configured: 'ทดสอบไม่ได้: เซิร์ฟเวอร์ยังไม่ได้ตั้ง SUPABASE_SECRET_KEY (ต้องใช้เพื่ออ่านคีย์ลับจาก Vault)',
  not_configured: 'ยังตั้งค่าไม่ครบ',
  payment_already_reviewed: 'รายการนี้ถูกตรวจไปแล้ว รีเฟรชหน้า',
  payment_not_found: 'ไม่พบรายการชำระเงินนี้',
  note_too_long: 'เหตุผลยาวเกิน 300 ตัวอักษร',
};

export const integErrorText = (code: string | undefined, fallback?: string) => (code && INTEG_ERRORS[code]) || fallback || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
