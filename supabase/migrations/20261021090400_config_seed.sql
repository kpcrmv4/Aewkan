-- Aewkan · P0 · configuration the app cannot run without (not demo data).
-- Values come from the approved demo (docs/design/demo.html) and are provisional
-- (RULINGS R-005): the owner edits them in /admin and publishes new versions.

insert into public.places (slug, name_th, name_en, lat, lng, category, is_pickup, is_mountain, default_dwell_min, label_pos) values
  ('tp',        'ประตูท่าแพ (โรงแรมในเมือง)', 'Tha Phae Gate (city hotels)',  18.7877, 99.0003, 'pickup',   true,  false, 0,   'r'),
  ('airport',   'สนามบินเชียงใหม่',           'Chiang Mai Airport',           18.7668, 98.9627, 'pickup',   true,  false, 0,   'l'),
  ('nimman',    'นิมมานเหมินท์',              'Nimman',                       18.8000, 98.9680, 'city',     true,  false, 60,  't'),
  ('wualai',    'ถนนคนเดินวัวลาย',            'Wualai Walking Street',        18.7800, 98.9840, 'city',     true,  false, 90,  'b'),
  ('suthep',    'วัดพระธาตุดอยสุเทพ',          'Doi Suthep Temple',            18.8048, 98.9217, 'temple',   false, true,  60,  'b'),
  ('doipui',    'หมู่บ้านม้งดอยปุย',           'Doi Pui Hmong Village',        18.8130, 98.8870, 'nature',   false, true,  60,  'l'),
  ('htt',       'ห้วยตึงเฒ่า',                 'Huay Tueng Tao',               18.8530, 98.9410, 'nature',   false, false, 60,  'r'),
  ('ratcha',    'อุทยานหลวงราชพฤกษ์',          'Royal Park Rajapruek',         18.7467, 98.9263, 'nature',   false, false, 90,  'b'),
  ('maesa',     'น้ำตกแม่สา',                  'Mae Sa Waterfall',             18.9067, 98.8993, 'nature',   false, false, 60,  'r'),
  ('monjam',    'ม่อนแจ่ม',                    'Mon Jam',                      18.9387, 98.8283, 'nature',   false, true,  90,  'l'),
  ('bosang',    'บ่อสร้าง หมู่บ้านทำร่ม',       'Bo Sang Umbrella Village',     18.7613, 99.0917, 'craft',    false, false, 45,  'r'),
  ('hotspring', 'น้ำพุร้อนสันกำแพง',            'San Kamphaeng Hot Springs',    18.8131, 99.2304, 'nature',   false, false, 60,  'r'),
  ('mkp',       'แม่กำปอง',                    'Mae Kampong',                  18.8653, 99.3503, 'nature',   false, true,  120, 'r'),
  ('baantawai', 'บ้านถวาย หางดง',              'Baan Tawai, Hang Dong',        18.6680, 98.9440, 'craft',    false, false, 60,  'b'),
  ('lamphun',   'วัดพระธาตุหริภุญชัย ลำพูน',     'Hariphunchai Temple, Lamphun', 18.5771, 99.0088, 'temple',   false, false, 60,  'b'),
  ('inthanon',  'ดอยอินทนนท์',                 'Doi Inthanon',                 18.5880, 98.4868, 'nature',   false, true,  120, 'l'),
  ('chiangdao', 'ถ้ำเชียงดาว',                 'Chiang Dao Cave',              19.3950, 98.9280, 'nature',   false, false, 60,  'r'),
  ('pai',       'ปาย',                         'Pai',                          19.3590, 98.4400, 'province', true,  true,  0,   'l'),
  ('angkhang',  'ดอยอ่างขาง',                  'Doi Ang Khang',                19.9290, 99.0470, 'province', false, true,  90,  'r'),
  ('chiangrai', 'วัดร่องขุ่น เชียงราย',          'White Temple, Chiang Rai',     19.8243, 99.7633, 'province', true,  false, 0,   'l')
on conflict (slug) do nothing;

update public.app_settings set base_place_id = (select id from public.places where slug = 'tp')
where id and base_place_id is null;

insert into public.pricing_rule_sets (version, rules, note, is_current)
select 1, $json${
  "zones": [
    {"id": 1, "name_th": "ในเมือง",        "name_en": "In town",                   "max_km": 10,   "surcharge": 0},
    {"id": 2, "name_th": "รอบเมือง",       "name_en": "Around town",               "max_km": 25,   "surcharge": 200},
    {"id": 3, "name_th": "ดอยและอำเภอไกล", "name_en": "Mountains & far districts", "max_km": 60,   "surcharge": 500},
    {"id": 4, "name_th": "ต่างจังหวัด",     "name_en": "Other provinces",           "max_km": null, "surcharge": 900}
  ],
  "vehicles": {
    "sedan": {"name_th": "รถเก๋ง",     "name_en": "Sedan",   "seats": 3, "hourly": 350, "daily": 2800, "per_km": 12, "sort": 1},
    "suv":   {"name_th": "SUV",        "name_en": "SUV",     "seats": 5, "hourly": 450, "daily": 3400, "per_km": 14, "sort": 2},
    "van":   {"name_th": "รถตู้ VIP",   "name_en": "VIP van", "seats": 9, "hourly": 500, "daily": 3800, "per_km": 16, "sort": 3}
  },
  "min_hours": 4, "daily_inc_hours": 10, "daily_inc_km": 150, "ot_per_hour": 300, "extra_km_rate": 10,
  "max_day_hours": 14, "tight_day_hours": 12,
  "trip_pct": 15, "mountain_fee": 300, "night_pct": 15, "season_pct": 10, "lang_driver_fee": 200,
  "deposit_pct": 30, "deposit_round": 100, "deposit_min": 100,
  "empty_return_pct": 40, "stop_fee": 150, "road_factor": 1.3,
  "speeds": {"1": 25, "2": 45, "3": 40, "4": 60, "mountain": 35},
  "night": {"from": "22:00", "to": "06:00"},
  "quote": {"enabled": true, "use_range": true, "from": "2026-12-25", "to": "2027-01-05", "hours": 2, "pct": 20,
            "reason_th": "ช่วงปีใหม่ รถและคนขับมีจำกัด", "reason_en": "New Year period, cars and drivers are limited"},
  "return_offer": {"enabled": true, "pct": 10, "default_days": 2, "valid_days": 7, "send_when": "drop"},
  "commission": {
    "assumed_spend": 800,
    "splits": {
      "driver":  {"name_th": "คนขับ 100%",        "name_en": "Driver 100%",  "driver_pct": 100},
      "half":    {"name_th": "แบ่งคนละครึ่ง",       "name_en": "Split 50/50",  "driver_pct": 50},
      "company": {"name_th": "เข้าบริษัททั้งหมด",   "name_en": "Company 100%", "driver_pct": 0}
    },
    "policy_th": "รับค่าน้ำได้เฉพาะจุดที่อยู่ในตารางนี้และตามสัดส่วนที่กำหนด แจ้งยอดจริงในแอปภายในวันเดียวกัน ห้ามพาลูกค้าแวะร้านนอกกำหนดการเพื่อค่าน้ำ ถ้าลูกค้าขอเพิ่มจุด ให้กดเพิ่มในแอปเพื่อให้ราคาและค่าน้ำถูกบันทึก"
  }
}$json$::jsonb, 'ค่าตั้งต้นจากเดโม่ (ชั่วคราว)', true
where not exists (select 1 from public.pricing_rule_sets);

insert into public.commission_rules (place_id, type, amount, split_key, note)
select p.id, v.type, v.amount, v.split_key, v.note
from (values
  ('bosang',    'head',    100, 'driver',  'ร้านร่มและผ้าไหมจ่ายเมื่อพาลูกค้าเข้าชม'),
  ('baantawai', 'sale',    10,  'half',    'ร้านไม้แกะสลักจ่ายจากยอดซื้อ ต้องแจ้งยอดจริง'),
  ('ratcha',    'booking', 150, 'company', 'ค่าแนะนำจากอุทยาน โอนเข้าบัญชีบริษัท'),
  ('hotspring', 'head',    20,  'driver',  'บัตรเข้าชมแบบกรุ๊ป')
) as v(slug, type, amount, split_key, note)
join public.places p on p.slug = v.slug
on conflict (place_id) do nothing;

insert into public.trip_templates (name_th, name_en, sub_th, sub_en, stops, round_trip, vehicle_key, date_hint, sort)
select v.name_th, v.name_en, v.sub_th, v.sub_en,
  (select jsonb_agg(jsonb_build_object('place_id', p.id, 'dwell', s.dwell) order by s.ord)
     from jsonb_array_elements(v.stops) with ordinality as e(item, ord)
     cross join lateral (select e.item->>'slug' as slug, (e.item->>'dwell')::int as dwell, e.ord) s
     join public.places p on p.slug = s.slug),
  v.round_trip, v.vehicle_key, v.date_hint, v.sort
from (values
  ('ดอยสุเทพ + ม่อนแจ่ม', 'Doi Suthep + Mon Jam', 'ครึ่งวันเช้า · ยอดนิยม', 'Half day · most booked',
   '[{"slug":"suthep","dwell":60},{"slug":"monjam","dwell":90}]'::jsonb, true, 'sedan', null::date, 1),
  ('แม่กำปอง + น้ำพุร้อน + บ่อสร้าง', 'Mae Kampong + Hot Springs + Bo Sang', 'เต็มวัน · สายธรรมชาติ', 'Full day · nature',
   '[{"slug":"mkp","dwell":120},{"slug":"hotspring","dwell":60},{"slug":"bosang","dwell":45}]'::jsonb, true, 'sedan', null, 2),
  ('ส่งปาย แวะถ้ำเชียงดาว', 'Drop-off in Pai via Chiang Dao Cave', 'ขาเดียว · แวะได้บนทาง', 'One-way · stop on the road',
   '[{"slug":"chiangdao","dwell":60},{"slug":"pai","dwell":0}]'::jsonb, false, 'sedan', null, 3),
  ('ดอยอินทนนท์ เต็มวัน', 'Doi Inthanon full day', 'ยอดสูงสุดในไทย · นางพญาเสือโคร่ง ม.ค.', 'Highest peak · cherry blossoms in Jan',
   '[{"slug":"inthanon","dwell":150},{"slug":"ratcha","dwell":60}]'::jsonb, true, 'suv', null, 4),
  ('ส่งท้ายปี: อ่างขาง + เชียงดาว', 'New Year: Ang Khang + Chiang Dao', '31 ธ.ค. · ช่วงเทศกาล เปิดโหมดเสนอราคา', '31 Dec · festival period, quote mode',
   '[{"slug":"angkhang","dwell":120},{"slug":"chiangdao","dwell":60}]'::jsonb, true, 'suv', date '2026-12-31', 5)
) as v(name_th, name_en, sub_th, sub_en, stops, round_trip, vehicle_key, date_hint, sort)
where not exists (select 1 from public.trip_templates);

insert into public.segments (place_a, place_b, source, km, minutes, samples, note)
select least(a.id, b.id), greatest(a.id, b.id), v.source, v.km, v.minutes, v.samples, v.note
from (values
  ('tp','suthep',     'driven',   16,  40,  1,  'ขับวัดจริง 12 ต.ค. 69'),
  ('suthep','monjam', 'driven',   34,  65,  1,  'ขับวัดจริง 12 ต.ค. 69'),
  ('monjam','maesa',  'driven',   14,  25,  1,  'ขับวัดจริง 12 ต.ค. 69'),
  ('tp','maesa',      'checkins', 24,  45,  6,  'จากเช็กอินคนขับ 6 ทริป'),
  ('tp','mkp',        'checkins', 50,  85,  4,  'จากเช็กอินคนขับ 4 ทริป'),
  ('tp','airport',    'checkins', 4,   15,  22, 'จากเช็กอินคนขับ 22 ทริป'),
  ('tp','pai',        'driven',   135, 200, 1,  'ขับวัดจริง 3 ต.ค. 69'),
  ('tp','inthanon',   'driven',   95,  150, 1,  'ขับวัดจริง 3 ต.ค. 69'),
  ('pai','airport',   'driven',   138, 205, 1,  'ขับวัดจริง 3 ต.ค. 69'),
  ('pai','nimman',    'driven',   133, 198, 1,  'ขับวัดจริง 3 ต.ค. 69')
) as v(sa, sb, source, km, minutes, samples, note)
join public.places a on a.slug = v.sa
join public.places b on b.slug = v.sb
on conflict (place_a, place_b, source) do nothing;
