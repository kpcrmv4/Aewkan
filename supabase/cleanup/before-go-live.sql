-- ════════════════════════════════════════════════════════════════════════
-- แอ่วกัน — ล้างข้อมูลทดสอบก่อนเปิดใช้งานจริง (รันครั้งเดียว ด้วยมือ)
--
-- ไม่ใช่ migration: เปิด Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ทั้งไฟล์อยู่ใน transaction เดียว: ส่วนแรกแสดงจำนวนที่จะลบ ถ้าไม่ตรงที่คาด
-- ให้เปลี่ยน `commit` ท้ายไฟล์เป็น `rollback` แล้วรันใหม่เพื่อดูอย่างเดียว
--
-- ลบเฉพาะแถวที่ชุดทดสอบอัตโนมัติสร้าง (ชื่อขึ้นต้น "E2E", อีเมล @aewkan.test,
-- slug e2e-*, role ที่ archive แล้วชื่อ "E2E …") — ข้อมูลจริงไม่ถูกแตะ
-- ไม่ลบ: บัญชีทดสอบ e2e-staff@aewkan.test และ role e2e_all (ชุดทดสอบยังใช้อยู่ ·
-- ปิดใช้งานได้ที่หน้าทีมงานเมื่อไม่ต้องการแล้ว) · กฎราคาเวอร์ชัน "E2E … identical copy"
-- (เนื้อหาเหมือนเวอร์ชันก่อนหน้า และเวอร์ชันล่าสุดอาจเป็นหนึ่งในนั้น)
-- ไฟล์รูปและสลิปทดสอบใน Storage (job-photos, payment-slips) ลบที่หน้า Storage
-- ════════════════════════════════════════════════════════════════════════
begin;

create temp table _e2e_bookings on commit drop as
  select id from public.bookings
   where customer_name like 'E2E%' or customer_contact like '%e2e%' or booking_no = 'TESTP0';

create temp table _e2e_places on commit drop as
  select id from public.places where name_th like 'E2E%' or slug like 'e2e-%';

create temp table _e2e_drivers on commit drop as
  select id from public.drivers where nickname like 'E2E%' or full_name like 'E2E%';

select 'bookings' as what, count(*) from _e2e_bookings
union all select 'places', count(*) from _e2e_places
union all select 'drivers', count(*) from _e2e_drivers
union all select 'staff_invites', count(*) from public.staff_invites where email like '%@aewkan.test' and email <> 'e2e-staff@aewkan.test'
union all select 'roles (archived E2E)', count(*) from public.roles where archived_at is not null and name_th like 'E2E%';

-- bookings first: stops, links (+ push subscriptions), photos, payments,
-- commission reports, return offers, events, notification log, LINE links cascade
update public.bookings set parent_booking_id = null
 where parent_booking_id in (select id from _e2e_bookings) and id not in (select id from _e2e_bookings);
delete from public.bookings where id in (select id from _e2e_bookings);

-- places only when nothing real still points at them (segments + commission rules cascade)
delete from public.places p
 where p.id in (select id from _e2e_places)
   and not exists (select 1 from public.bookings b where b.pickup_place_id = p.id)
   and not exists (select 1 from public.booking_stops s where s.place_id = p.id)
   and not exists (select 1 from public.app_settings a where a.base_place_id = p.id);

delete from public.drivers where id in (select id from _e2e_drivers);  -- off days cascade

delete from public.staff_invites where email like '%@aewkan.test' and email <> 'e2e-staff@aewkan.test';
delete from public.roles r
 where r.archived_at is not null and r.name_th like 'E2E%'
   and not exists (select 1 from public.staff s where s.role_key = r.key);

-- booking numbers restart after the last real booking of each month
update public.doc_counters c
   set last_no = coalesce((select max(right(b.booking_no, length(b.booking_no) - 6)::int)
                             from public.bookings b
                            where left(b.booking_no, 6) = c.prefix and b.booking_no ~ '^[0-9]+$'), 0);

commit;
