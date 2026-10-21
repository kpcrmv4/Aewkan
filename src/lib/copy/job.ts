/**
 * Job-link wording (P3). Thai + English for both audiences; the labels are lifted
 * from the approved demo (`T.th` / `T.en`). Variables use {braces} — see `fill()`.
 */
import { fill } from './common';

export type Lang = 'th' | 'en';
type Pair = { th: string; en: string };

export const JOB_COPY = {
  // header + steps
  jlTitle: { th: 'รายละเอียดงาน', en: 'Job details' },
  start: { th: 'รับ', en: 'Pickup' },
  pax: { th: '{n} คน', en: '{n} pax' },
  sp1: { th: 'จองแล้ว', en: 'Booked' },
  sp2: { th: 'ยืนยันคนขับ', en: 'Driver confirmed' },
  sp3: { th: 'ออกเดินทาง', en: 'On the way' },
  sp4: { th: 'เสร็จสิ้น', en: 'Completed' },
  qs1: { th: 'ขอราคา', en: 'Requested' },
  qs2: { th: 'ได้รับราคา', en: 'Quoted' },
  qs3: { th: 'มัดจำ', en: 'Deposit' },
  qs4: { th: 'ยืนยันคนขับ', en: 'Driver confirmed' },
  qs5: { th: 'ออกเดินทาง', en: 'On the way' },
  jlRule: { th: 'คิดราคาด้วยกฎ {v}', en: 'Priced with rule set {v}' },
  // quote box
  quoteTitle: { th: 'ราคาที่ทีมงานเสนอ', en: 'Your quoted price' },
  quoteDeadline: { th: 'โอนมัดจำภายใน {t}', en: 'Deposit due by {t}' },
  quoteTotal: { th: 'ราคารวม', en: 'Total' },
  quoteDepositDue: { th: 'มัดจำ {d}', en: 'Deposit {d}' },
  expiredTitle: { th: 'หมดเวลาโอนมัดจำ', en: 'Deposit deadline passed' },
  expiredSub: {
    th: 'ราคาที่เสนอไว้ถูกยกเลิก คุณขอราคาใหม่ได้ ทีมงานอาจเสนอราคาต่างจากเดิมตามรถที่เหลืออยู่',
    en: 'The quote was cancelled. You can request a new one. The price may differ depending on what is still available.',
  },
  qrOkTitle: { th: 'ส่งคำขอราคาแล้ว', en: 'Quote request sent' },
  qrOkSub: {
    th: 'ทีมงานจะแจ้งราคาผ่านการแจ้งเตือนภายใน 30 นาที พร้อมกำหนดเวลาโอนมัดจำ',
    en: 'We will send your price as a notification within 30 minutes, with the deposit deadline.',
  },
  // driver card
  jlDriver: { th: 'คนขับของคุณ', en: 'Your driver' },
  jlWaiting: {
    th: 'ทีมงานกำลังจัดคนขับให้ จะอัปเดตที่หน้านี้และแจ้งทาง LINE ภายใน 30 นาที',
    en: 'We are assigning your driver. This page updates itself and we message you within 30 minutes.',
  },
  jlContact: { th: 'ติดต่อคนขับ', en: 'Contact the driver' },
  jlCopy: { th: 'คัดลอก', en: 'Copy' },
  jlCopied: { th: 'คัดลอกแล้ว', en: 'Copied' },
  jlCopyFail: { th: 'คัดลอกไม่ได้ กดค้างที่เบอร์เพื่อเลือกข้อความ', en: 'Could not copy. Press and hold the number to select it.' },
  years: { th: '{n} ปี', en: '{n} yrs' },
  // itinerary
  jlItin: { th: 'กำหนดการ', en: 'Itinerary' },
  km: { th: 'กม.', en: 'km' },
  hr: { th: 'ชม.', en: 'h' },
  min: { th: 'น.', en: 'min' },
  stay: { th: 'อยู่', en: 'stay' },
  drive: { th: 'ขับ', en: 'drive' },
  back: { th: 'กลับถึงจุดรับ', en: 'Back at pickup' },
  jlNoStops: { th: 'ยังไม่มีจุดแวะในงานนี้', en: 'No stops on this job yet.' },
  jlAddStopNote: {
    th: 'เพิ่มจุดแวะหน้างานได้ คนขับกดเพิ่มในแอปแล้วราคาจะคำนวณใหม่ตามกฎเดิม คุณเห็นราคาใหม่ก่อนตกลง',
    en: 'Stops can be added on the day. The driver adds it in the app and the price is recalculated with the same rules. You see the new price before agreeing.',
  },
  // price
  jlPrice: { th: 'ค่าใช้จ่าย', en: 'Price' },
  lTotal: { th: 'ราคารวม (รวมน้ำมัน ทางด่วน และค่าจอด)', en: 'Total (fuel, tolls and parking included)' },
  jlPaid: { th: 'มัดจำชำระแล้ว', en: 'Deposit paid' },
  jlRest: { th: 'คงเหลือจ่ายคนขับหน้างาน (เงินสดหรือโอน)', en: 'Balance paid to the driver (cash or transfer)' },
  jlDue: { th: 'ต้องโอนมัดจำภายใน {t}', en: 'Deposit due by {t}' },
  refPrice: { th: 'ราคาอ้างอิง ยังไม่ได้ชำระมัดจำ', en: 'Reference price, deposit not paid yet' },
  // proof lines (customers never see the photos)
  pickedAt: { th: 'รับผู้โดยสารแล้ว {t}', en: 'Guests picked up {t}' },
  droppedAt: { th: 'ส่งผู้โดยสารแล้ว {t}', en: 'Guests dropped off {t}' },
  photoProof: { th: 'มีรูปยืนยัน', en: 'photo attached' },
  taken: { th: 'ถ่ายเมื่อ {t}', en: 'taken {t}' },
  // return trip
  retTitle: { th: 'จองขากลับจาก{from}', en: 'Book the return from {from}' },
  retSub: {
    th: 'ใช้รถ จำนวนคน และผู้ติดต่อเดิม เลือกแค่วัน เวลา และจุดส่ง',
    en: 'Same vehicle, passengers and contact. Just pick the date, time and drop-off point.',
  },
  retTo: { th: 'ส่งที่', en: 'Drop-off' },
  retDate: { th: 'วันกลับ', en: 'Return date' },
  retTime: { th: 'เวลารับ', en: 'Pickup time' },
  retBase: { th: 'ราคาขาเดียวปกติ', en: 'Standard one-way price' },
  retDisc: { th: 'ส่วนลดขากลับ {p}%', en: 'Return discount {p}%' },
  retTotal: { th: 'ราคารวมขากลับ', en: 'Return total' },
  retDepositLine: { th: 'มัดจำ {d}', en: 'Deposit {d}' },
  retConfirm: { th: 'ยืนยันขากลับ · มัดจำ ฿{d}', en: 'Confirm return · ฿{d} deposit' },
  retDoneTitle: { th: 'จองขากลับแล้ว', en: 'Return trip booked' },
  retDoneSub: {
    th: 'เลขที่จอง {id} · ทีมงานจะยืนยันคนขับและส่งลิงก์งานให้เหมือนเดิม',
    en: 'Booking {id} · we confirm the driver and send the job link as before',
  },
  retValid: { th: 'ข้อเสนอนี้ใช้ได้ถึง {d}', en: 'Offer valid until {d}' },
  retLater: { th: 'ไว้ก่อน', en: 'Maybe later' },
  retRoute: { th: '{km} กม. · ประมาณ {h}', en: '{km} km · about {h}' },
  retNoPrice: { th: 'คำนวณราคาไม่ได้ ลองเลือกจุดส่งอื่น', en: 'Could not price this route. Try another drop-off.' },
  retBooked: { th: 'จองขากลับเรียบร้อย เลขที่จอง {id}', en: 'Return trip booked. Booking {id}' },
  retDismissed: { th: 'เก็บข้อเสนอไว้แล้ว', en: 'Offer set aside' },
  // driver
  dvCust: { th: 'ลูกค้า', en: 'Customer' },
  dvContact: { th: 'ติดต่อลูกค้า', en: 'Contact' },
  dvHotel: { th: 'โรงแรม / จุดนัดพบ', en: 'Hotel / meeting point' },
  dvNote: { th: 'หมายเหตุจากลูกค้า', en: 'Note from the customer' },
  dvLangNeed: { th: 'ต้องการคนขับสื่อสารภาษาต่างประเทศ', en: 'Needs a foreign-language driver' },
  dvLangThai: { th: 'ภาษาไทยได้', en: 'Thai is fine' },
  dvStart: { th: 'เริ่มงาน · รับลูกค้า', en: 'Start job · pick up' },
  dvPhotoPickup: { th: 'ถ่ายรูปลูกค้าตอนรับ', en: 'Photo of the guests at pickup' },
  dvPhotoDrop: { th: 'ถ่ายรูปตอนส่งลูกค้า', en: 'Photo at drop-off' },
  dvPhotoWhy: {
    th: 'ถ่ายให้เห็นลูกค้ากับรถ ใช้ยืนยันการรับ-ส่งและคุ้มครองทั้งสองฝ่าย ระบบบันทึกเวลาและตำแหน่งให้อัตโนมัติ',
    en: 'Show the guests with the car. It confirms pickup and drop-off and protects both sides. Time and location are recorded automatically.',
  },
  dvRetake: { th: 'ถ่ายใหม่', en: 'Retake' },
  dvUploading: { th: 'กำลังอัปโหลดรูป…', en: 'Uploading photo…' },
  dvConfirmStart: { th: 'ยืนยันรับลูกค้าแล้ว เริ่มงาน', en: 'Guests on board, start job' },
  dvNeedPhoto: { th: 'แนบรูปก่อนจึงกดได้', en: 'Attach a photo first' },
  dvFinish: { th: 'จบงาน · ส่งลูกค้า', en: 'Finish job · drop-off' },
  dvCollected: { th: 'เงินที่รับหน้างาน (บาท)', en: 'Cash collected (฿)' },
  dvClose: { th: 'ปิดงานและส่งรายงาน', en: 'Close job and send report' },
  dvDoneTitle: { th: 'ปิดงานแล้ว', en: 'Job closed' },
  dvDoneSub: {
    th: 'รายงานพร้อมรูปรับ-ส่งและยอดเงินถูกส่งเข้าระบบ แอดมินเห็นในงาน {id} แล้ว',
    en: 'The report with pickup and drop-off photos and the amount collected is in the system. Admin sees it on job {id}.',
  },
  dvCheck: { th: 'ถึงแล้ว', en: 'Arrived' },
  dvCheckedAt: { th: 'ถึงแล้ว {t}', en: 'Arrived {t}' },
  dvNavigate: { th: 'นำทาง', en: 'Navigate' },
  dvStarted: { th: 'เริ่มงานแล้ว {t}', en: 'Started {t}' },
  // commission
  commLbl: { th: 'ค่าน้ำ', en: 'Commission' },
  commNone: { th: 'ไม่มีค่าน้ำ', en: 'No commission' },
  commHead: { th: '฿{a}/คน', en: '฿{a}/pax' },
  commBooking: { th: '฿{a}/ทริป', en: '฿{a}/trip' },
  commSale: { th: '{a}% ของยอดซื้อ', en: '{a}% of purchases' },
  commTitle: { th: 'ค่าน้ำในทริปนี้', en: 'Commissions on this trip' },
  commEst: { th: 'ประมาณ', en: 'approx.' },
  commDriver: { th: 'ส่วนของคนขับ', en: 'Driver share' },
  commCompany: { th: 'ส่วนของบริษัท', en: 'Company share' },
  commReport: { th: 'ยอดซื้อจริง (บาท)', en: 'Actual purchases (฿)' },
  commSend: { th: 'บันทึกยอด', en: 'Save amount' },
  commPolicy: { th: 'นโยบายค่าน้ำ', en: 'Commission policy' },
  commNoneTrip: {
    th: 'ทริปนี้ไม่มีจุดที่มีค่าน้ำ รับค่าตอบแทนจากค่าจ้างทริปเท่านั้น',
    en: 'No commission stops on this trip. Pay comes from the trip fee only.',
  },
  commTotalDriver: { th: 'รวมส่วนของคนขับ', en: 'Total driver share' },
  commTotalCompany: { th: 'รวมส่วนบริษัท (แจ้งยอดหลังทริป)', en: 'Total company share (report after the trip)' },
  commSaved: { th: 'บันทึกค่าน้ำแล้ว', en: 'Commission saved' },
  // states
  loading: { th: 'กำลังโหลดรายละเอียดงาน…', en: 'Loading job details…' },
  loadFail: { th: 'โหลดรายละเอียดงานไม่สำเร็จ', en: 'Could not load the job details' },
  retry: { th: 'ลองใหม่', en: 'Try again' },
  notFoundTitle: { th: 'ไม่พบลิงก์นี้', en: 'Link not found' },
  notFoundSub: {
    th: 'ลิงก์อาจหมดอายุหรือพิมพ์ไม่ครบ ขอลิงก์ใหม่จากทีมงานหรือกลับไปหน้าแรก',
    en: 'The link may have expired or been copied incompletely. Ask us for a new one or go back to the home page.',
  },
  goHome: { th: 'กลับหน้าแรก', en: 'Back to home' },
  genericError: { th: 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง', en: 'Something went wrong. Please try again.' },
  photoTooLarge: { th: 'ไฟล์รูปใหญ่เกินไป', en: 'The photo is too large' },
  photoFail: { th: 'อัปโหลดรูปไม่สำเร็จ ลองถ่ายใหม่', en: 'Photo upload failed. Please retake it.' },
  photoNotImage: { th: 'กรุณาเลือกไฟล์รูปภาพ', en: 'Please choose an image file' },
} as const satisfies Record<string, Pair>;

export type JobCopyKey = keyof typeof JOB_COPY;

/** translate a job-link string, filling {vars} */
export function jt(key: JobCopyKey, lang: Lang, vars: Record<string, string | number> = {}): string {
  return fill(JOB_COPY[key][lang], vars);
}

/** database error codes (PostgREST `message`) → copy, both languages */
export const JOB_ERRORS: Record<string, Pair> = {
  pickup_photo_required: { th: 'ต้องแนบรูปตอนรับลูกค้าก่อนเริ่มงาน', en: 'Attach the pickup photo before starting the job' },
  not_assigned: { th: 'งานนี้เริ่มไปแล้วหรือยังไม่ได้จัดคนขับ', en: 'This job has already started or has no driver yet' },
  not_traveling: { th: 'งานนี้ไม่ได้อยู่ระหว่างเดินทาง', en: 'This job is not on the way' },
  dropoff_photo_required: { th: 'ต้องแนบรูปตอนส่งลูกค้าก่อนปิดงาน', en: 'Attach the drop-off photo before closing the job' },
  sale_required: { th: 'กรอกยอดซื้อจริงก่อน', en: 'Enter the actual purchase amount first' },
  link_not_found: { th: 'ลิงก์นี้ใช้ไม่ได้แล้ว ขอลิงก์ใหม่จากทีมงาน', en: 'This link no longer works. Ask us for a new one.' },
  driver_only: { th: 'ลิงก์ของลูกค้าทำรายการนี้ไม่ได้', en: 'A customer link cannot do this' },
  cash_required: { th: 'กรอกจำนวนเงินที่รับหน้างาน', en: 'Enter the cash collected' },
  no_commission_here: { th: 'จุดนี้ไม่มีค่าน้ำ', en: 'No commission at this stop' },
  stop_not_found: { th: 'ไม่พบจุดแวะนี้', en: 'Stop not found' },
};

/** map an error `message` (or any thrown value) to display copy */
export function jobErrorText(message: string | undefined | null, lang: Lang): string {
  const code = (message ?? '').trim();
  const hit = JOB_ERRORS[code];
  return hit ? hit[lang] : JOB_COPY.genericError[lang];
}
