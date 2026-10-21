/**
 * Search-facing wording (SEO): page titles, descriptions, the crawlable home text
 * and the place landing pages. Th/en pairs; the page language comes from the URL.
 * Aimed at searches like "รถพร้อมคนขับ เชียงใหม่", "เช่ารถพร้อมคนขับเชียงใหม่ ราคา",
 * "Chiang Mai private driver", "car with driver Chiang Mai".
 */
import { fill } from '@/lib/copy/common';

type Pair = { th: string; en: string };

export const SEO = {
  siteName: { th: 'แอ่วกัน', en: 'AewKan' },
  // home
  homeTitle: {
    th: 'รถพร้อมคนขับ เชียงใหม่ · เช่ารถพร้อมคนขับ ราคาชัดเจน | แอ่วกัน',
    en: 'Chiang Mai Private Driver · Car with Driver, Instant Prices | AewKan',
  },
  homeDescription: {
    th: 'เช่ารถพร้อมคนขับเชียงใหม่ วางทริปบนแผนที่แล้วเห็นราคาทันที เปรียบเทียบเหมาชั่วโมง เหมาวัน เหมาทริป และขาเดียว ไปดอยสุเทพ ดอยอินทนนท์ ปาย เชียงราย พร้อมคนขับที่รู้ทาง จองออนไลน์ได้เลย',
    en: 'Book a private car with driver in Chiang Mai. Plan your trip on the map and see the price instantly: hourly, full-day, fixed-trip and one-way. Doi Suthep, Doi Inthanon, Pai, Chiang Rai and more, with local drivers.',
  },
  keywords: {
    th: ['รถพร้อมคนขับ เชียงใหม่', 'เช่ารถพร้อมคนขับเชียงใหม่ ราคา', 'เหมารถเชียงใหม่', 'รถรับส่งเชียงใหม่', 'ทัวร์ส่วนตัวเชียงใหม่'],
    en: ['Chiang Mai private driver', 'car with driver Chiang Mai', 'Chiang Mai private car hire', 'Chiang Mai day trip with driver', 'Chiang Mai airport transfer'],
  },
  // home: crawlable text under the trip builder
  introTitle: { th: 'รถพร้อมคนขับเชียงใหม่ วางทริปเองได้ เห็นราคาก่อนจอง', en: 'Private driver in Chiang Mai: plan it yourself, see the price before you book' },
  introBody: {
    th: 'แอ่วกันให้บริการรถพร้อมคนขับในเชียงใหม่ ทั้งรับส่งสนามบิน เที่ยวในเมือง ขึ้นดอย และไปต่างอำเภอหรือต่างจังหวัด เลือกจุดหมายบนแผนที่ ระบบคิดราคาให้ทั้ง 4 แบบจากทริปเดียวกัน คือเหมาชั่วโมง เหมาวัน เหมาทริป และขาเดียว แล้วบอกว่าแบบไหนคุ้มที่สุด ไม่ต้องรอใบเสนอราคา',
    en: 'AewKan is a private car-with-driver service in Chiang Mai: airport transfers, city sightseeing, mountain day trips and longer rides to other districts or provinces. Pick your destinations on the map and we price the same trip four ways (hourly, full day, fixed trip and one-way) and tell you which is the best value. No waiting for a quote.',
  },
  tplTitle: { th: 'ทริปแนะนำ', en: 'Suggested trips' },
  tplLead: { th: 'เลือกทริปที่คนนิยม แล้วปรับจุดแวะและเวลาได้เองในหน้าวางทริป', en: 'Start from a popular trip, then adjust the stops and timing in the planner.' },
  tplStops: { th: '{n} จุด', en: '{n} stops' },
  tplOneWay: { th: 'ขาเดียว', en: 'one-way' },
  destTitle: { th: 'ปลายทางยอดนิยมจากเชียงใหม่', en: 'Popular destinations from Chiang Mai' },
  destLead: { th: 'ดูราคารถพร้อมคนขับไป-กลับจากตัวเมืองเชียงใหม่ไปแต่ละที่', en: 'See the round-trip price of a private driver from Chiang Mai city to each place.' },
  howTitle: { th: 'ราคาคิดอย่างไร', en: 'How the price works' },
  howBody: {
    th: 'เหมาชั่วโมงคิดตามเวลาจริง เหมาวันรวมชั่วโมงและกิโลเมตรต่อวัน เหมาทริปเป็นราคารวมเหมาจ่าย ส่วนขาเดียวคิดตามระยะทางจริงสำหรับการส่งต่างอำเภอหรือต่างจังหวัด ราคาที่เห็นเป็นราคาประมาณ อาจเปลี่ยนตามช่วงเทศกาลหรือวันหยุดยาว',
    en: 'Hourly follows the real time you use. Full day includes hours and kilometres per day. A fixed trip is one all-in price. One-way is priced by real distance for rides to other districts or provinces. Prices shown are estimates and may change around festivals and long holidays.',
  },
  // place landing page
  placeTitle: {
    th: 'รถพร้อมคนขับไป{name} จากเชียงใหม่ ราคาเริ่ม {price} | แอ่วกัน',
    en: 'Private Driver to {name} from Chiang Mai · from {price} | AewKan',
  },
  placeTitleNoPrice: {
    th: 'รถพร้อมคนขับไป{name} จากเชียงใหม่ | แอ่วกัน',
    en: 'Private Driver to {name} from Chiang Mai | AewKan',
  },
  placeDescription: {
    th: 'เช่ารถพร้อมคนขับไป{name} จากตัวเมืองเชียงใหม่ ไป-กลับ ราคาเริ่มต้น {price} ระยะทางประมาณ {km} กม. เปรียบเทียบเหมาชั่วโมง เหมาวัน เหมาทริป แล้ววางทริปและจองออนไลน์ได้ทันที',
    en: 'Hire a private car with driver to {name} from Chiang Mai city. Round trip from {price}, about {km} km each way. Compare hourly, full-day and fixed-trip prices, then plan and book online.',
  },
  placeDescriptionNoPrice: {
    th: 'เช่ารถพร้อมคนขับไป{name} จากตัวเมืองเชียงใหม่ วางทริปบนแผนที่แล้วดูราคาและจองออนไลน์ได้ทันที',
    en: 'Hire a private car with driver to {name} from Chiang Mai city. Plan the trip on the map, see the price and book online.',
  },
  placeH1: { th: 'รถพร้อมคนขับไป{name} จากตัวเมืองเชียงใหม่', en: 'Private driver to {name} from Chiang Mai city' },
  breadcrumbAria: { th: 'เส้นทางหน้า', en: 'Breadcrumb' },
  home: { th: 'หน้าแรก', en: 'Home' },
  placeLead: {
    th: 'ไป{name} จาก{base} ไป-กลับ พร้อมคนขับที่รู้ทาง รถ{vehicle} นั่งได้ถึง {seats} คน อยู่ที่จุดหมายประมาณ {dwell} นาที',
    en: 'A round trip to {name} from {base} with a driver who knows the road. {vehicle}, up to {seats} passengers, about {dwell} min at the destination.',
  },
  catLine: { th: 'ประเภท: {cat} · โซนราคา {zone}', en: 'Type: {cat} · price zone {zone}' },
  mountainNote: {
    th: 'เส้นทางนี้ขึ้นเขา มีค่าทางภูเขา ฿{fee} ต่อจุด และใช้เวลาขับนานกว่าทางราบ',
    en: 'This route climbs a mountain road: a mountain fee of ฿{fee} per stop applies and driving takes longer than on flat roads.',
  },
  statKm: { th: 'ระยะทางเที่ยวเดียว', en: 'One-way distance' },
  statTime: { th: 'เวลาขับเที่ยวเดียว', en: 'One-way driving time' },
  statRound: { th: 'ไป-กลับรวมเวลาอยู่ที่หมาย', en: 'Round trip incl. your stay' },
  priceTitle: { th: 'ราคารถพร้อมคนขับไป{name}', en: 'Private driver price to {name}' },
  priceSub: { th: 'ไป-กลับจาก{base} · {vehicle} · ผู้โดยสาร 2 คน · ออก 08:00', en: 'Round trip from {base} · {vehicle} · 2 passengers · 08:00 start' },
  colMode: { th: 'แบบ', en: 'Type' },
  colPrice: { th: 'ราคา', en: 'Price' },
  colNote: { th: 'หมายเหตุ', en: 'Note' },
  noteHourly: { th: 'คิด {u} ชม.', en: '{u} h billed' },
  noteDaily: { th: '{u} วัน รวมชั่วโมงและกิโลเมตรต่อวัน', en: '{u} day(s), hours and km per day included' },
  noteTrip: { th: '{u} วัน เหมาจ่ายรวมทุกอย่าง', en: '{u} day(s), one all-in price' },
  noteOneway: { th: 'ส่งแล้วไม่กลับ ประมาณ {u} กม.', en: 'Drop-off only, about {u} km' },
  best: { th: 'คุ้มสุด', en: 'Best value' },
  noPrice: { th: 'ยังไม่มีราคาสำหรับจุดหมายนี้ วางทริปเพื่อขอราคา', en: 'No price yet for this place. Plan a trip to get one.' },
  priceDisclaimer: {
    th: 'ราคาประมาณ อาจเปลี่ยนตามช่วงเทศกาล · คิดตามกฎราคา เวอร์ชัน {v}',
    en: 'Estimated price, may change around festivals · rule set version {v}',
  },
  ctaPlan: { th: 'วางทริปนี้', en: 'Plan this trip' },
  ctaSub: { th: 'เพิ่มจุดแวะ เลือกรถ วันเวลา แล้วเห็นราคาจริงทันที', en: 'Add stops, pick the car, date and time, and see your exact price instantly.' },
  nearbyTitle: { th: 'ที่เที่ยวใกล้เคียง', en: 'Nearby places' },
  nearbyKm: { th: 'ห่างประมาณ {km} กม.', en: 'about {km} km away' },
  errTitle: { th: 'โหลดข้อมูลจุดหมายไม่สำเร็จ', en: 'Could not load this destination' },
  errBody: { th: 'ลองใหม่อีกครั้ง หรือกลับไปวางทริปจากหน้าแรก', en: 'Try again, or plan your trip from the home page.' },
  retry: { th: 'ลองใหม่', en: 'Try again' },
  backHome: { th: 'วางทริปจากหน้าแรก', en: 'Plan from the home page' },
  // structured data
  businessDescription: {
    th: 'บริการรถพร้อมคนขับในเชียงใหม่ เหมาชั่วโมง เหมาวัน เหมาทริป และขาเดียว',
    en: 'Private car with driver in Chiang Mai: hourly, full-day, fixed-trip and one-way.',
  },
  tripName: { th: 'รถพร้อมคนขับไป{name} จากเชียงใหม่', en: 'Private driver to {name} from Chiang Mai' },
  tripDescription: {
    th: 'ไป-กลับจากตัวเมืองเชียงใหม่ไป{name} พร้อมคนขับ ราคาเริ่มต้น {price}',
    en: 'Round trip from Chiang Mai city to {name} with a private driver, from {price}.',
  },
  // manifest + icons (kept here so the Thai/English names stay in one place)
  manifestName: { th: 'แอ่วกัน · รถพร้อมคนขับเชียงใหม่', en: 'AewKan · Chiang Mai private driver' },
} as const satisfies Record<string, Pair | { th: string[]; en: string[] }>;

export type SeoKey = Exclude<keyof typeof SEO, 'keywords'>;

export function seoText(lang: 'th' | 'en', key: SeoKey, vars: Record<string, string | number> = {}): string {
  return fill((SEO[key] as Pair)[lang], vars);
}

export const MODE_NOTE_KEY = { hourly: 'noteHourly', daily: 'noteDaily', trip: 'noteTrip', oneway: 'noteOneway' } as const satisfies Record<string, SeoKey>;
