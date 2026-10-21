# CLAUDE.md — แอ่วกัน (Aewkan)

เว็บจองรถพร้อมคนขับเชียงใหม่ · บริษัทเดียว · ลูกค้าไทย + ต่างชาติ
การตัดสินใจทั้งหมด → `docs/design/DESIGN.md` · หน้าตาที่อนุมัติ → `docs/design/demo.html` · วิธีรัน build → `LOOP.md`

> 🔴 ไฟล์นี้ **ห้ามแก้ระหว่าง run** — กับดักที่เจอจดลง `docs/LESSONS.md` · การตัดสินใจแทนเจ้าของจดลง `docs/RULINGS.md`

## 0. ลำดับความสำคัญของ skill

ชุด `kp-supabase-nextjs` ชนะเรื่อง auth/session, RLS/grants/migrations และกลไก Next 16 (`proxy.ts`, `getClaims()`, ห้าม mock Supabase client)
· `vercel-react-best-practices` และ `supabase-postgres-best-practices` ชนะเรื่อง query plan, index, pooling, การ render และขนาด bundle

## 1. บทบาทและสิทธิ์

| ใคร | เข้าระบบ | ขอบเขต |
|---|---|---|
| ลูกค้า | ไม่ล็อกอิน · `/j/<token>` (audience `customer`) | เฉพาะการจองของตัวเอง ผ่าน RPC/route ที่ตรวจโทเคน |
| คนขับ | ไม่ล็อกอิน · `/j/<token>` (audience `driver`) | เฉพาะงานที่ถูกจัด ผ่าน RPC/route ที่ตรวจโทเคน |
| ทีมงาน | อีเมล + รหัสผ่าน (`/admin/*`) | ตาม `role_permissions` |
| เจ้าของ | อีเมล + รหัสผ่าน | ทุกสิทธิ์ · `app_settings.owner_id` |

สิทธิ์ (permission keys) — ตรวจด้วย `public.has_perm(key)` ทั้งใน RLS และ server:

`jobs.read` · `jobs.manage` · `quotes.manage` · `drivers.manage` · `pricing.manage` · `places.manage`
· `commission.manage` · `finance.read` · `integrations.manage` · `team.manage`

role เริ่มต้น: `owner` (ทุกสิทธิ์, ลบไม่ได้) · `admin` (ทุกสิทธิ์ยกเว้น team/integrations) · `dispatcher` (jobs, quotes, drivers.read ผ่าน jobs.read) · `finance` (jobs.read, finance.read)

ไม่มี `org_id` (บริษัทเดียว) · ไม่มี PIN · ไม่มี demo tenant

## 2. Tech stack

| ชั้น | ใช้ |
|---|---|
| Framework | Next.js 16 App Router · React 19 · TypeScript strict · `proxy.ts` (ไม่ใช่ middleware.ts) |
| Style | Tailwind v4 CSS-first · token จากเดโม่ใน `src/app/globals.css` · next-themes (class `dark`) |
| UI | lucide-react (ห้าม emoji) · sonner (ห้าม `alert()`) · radix dialog |
| Data | @supabase/ssr + supabase-js รุ่นล่าสุด · @tanstack/react-query · zod |
| แผนที่ | maplibre-gl + OpenStreetMap tiles |
| ฟอนต์ | Prompt (display) + Anuphan (body) ผ่าน `next/font/google` |
| Push | web-push (VAPID) + service worker เขียนเอง |
| เงิน | promptpay-qr + qrcode · stripe · Beam (REST) · ตรวจสลิปผ่าน adapter |
| ทดสอบ | vitest (pure logic เท่านั้น) · @playwright/test (E2E, workers: 1) |
| Host | Vercel `sin1` (ยังไม่ deploy รอบนี้) · Supabase ap-southeast-1 |

## 3. Design system

กฎเดียว: **page kit ให้โครงสร้างและพฤติกรรม · ค่าสีทุกค่ามาจาก token ของเดโม่**
ค่าใน `:root` / `.dark` ของ `globals.css` คัดลอกตรงจากเดโม่ · ตาราง token mapping อยู่ใน `DESIGN.md`
ข้อความที่ผู้ใช้เห็นอยู่ใน `src/lib/copy/*.ts` (ไทย + อังกฤษสำหรับหน้าลูกค้า) · ห้ามมี element `data-demo-only` ในแอป

## 4. Supabase

- โปรเจกต์ `aewkan` · ref `kgjsycellzuiumudzdxl` · URL `https://kgjsycellzuiumudzdxl.supabase.co`
- เชื่อมผ่าน Supabase connector ของบัญชี (OAuth) — **ตรวจ `get_project_url` ให้ตรง URL นี้ก่อน migration ทุกครั้ง**
- ทุกการเปลี่ยน schema = ไฟล์ `supabase/migrations/<ts>_<name>.sql` **และ** `apply_migration` → `generate_typescript_types` → `src/lib/database.types.ts` (ตรวจว่าไม่ใช่ stub: `npm run types:check`) → advisors ครั้งเดียวต่อเฟส
- ทุกตาราง: `revoke all ... from public, anon, authenticated` แล้ว grant เท่าที่ตั้งใจ · RLS เปิด · policy แยกต่อ action
- ฟังก์ชันทุกตัว `set search_path = ''` และอ้างชื่อ schema เต็ม
- เวลาแถวมาจาก `now()` ในฐานข้อมูลเท่านั้น
- ทุก list query `.order()` + `.range()` · ตัวเลขสรุปใช้ head count หรือ RPC
- สาธารณะ (anon) อ่าน/เขียนผ่าน route handler ฝั่ง server ที่ใช้ secret key หรือ RPC `security definer` ที่ตรวจโทเคน · ห้าม grant ตารางให้ anon

### Data model

- `app_settings` (แถวเดียว) owner_id · company_name · base_place_id · timezone
- `roles` · `permissions` · `role_permissions` · `staff` (id = auth.users.id, role_key, full_name, is_active) · `staff_invites`
- `places` (ชื่อไทย/อังกฤษ lat lng category is_pickup is_mountain default_dwell_min is_hidden)
- `segments` (place_a < place_b, km, minutes, source driven|checkins|routing, samples)
- `pricing_rule_sets` (version, rules jsonb = zones, vehicles, ค่าคงที่, quote mode, return offer, commission splits/policy) · เวอร์ชันล่าสุด = `is_current`
- `commission_rules` (place_id, type head|booking|sale, amount, split_key, note)
- `trip_templates`
- `drivers` · `driver_off_days`
- `bookings` (booking_no, status, ลูกค้า, ทริป, mode, rule_version, ราคา snapshot jsonb, quote_*, driver_id, parent_booking_id ขากลับ, cash_collected)
- `booking_stops` (seq, place_id, dwell_min, planned_minutes, checked_in_at)
- `job_links` (booking_id, audience customer|driver, token_hash) — ลิงก์มีโทเคนดิบ ฐานข้อมูลเก็บ sha256
- `booking_photos` (kind pickup|dropoff, storage_path) · bucket ส่วนตัว `job-photos`
- `payments` (method promptpay_slip|stripe|beam|cash, status, amount, provider_ref, slip_path, verify_result) · bucket ส่วนตัว `payment-slips`
- `commission_reports` · `return_offers` · `booking_events` (audit) · `doc_counters` (เลขจองไม่ข้าม)
- `push_subscriptions` (ผูกกับ job_link) · `notification_log`
- `integrations` (key line|stripe|beam|slip|routing|promptpay, config jsonb ไม่ลับ, secret_id → vault)

สถานะการจอง: `quote_requested` → `quoted` → (`quote_expired`) · `awaiting_deposit` → `deposit_review` → `confirmed` → `assigned` → `traveling` → `done` · `cancelled`

## 5. โครงโฟลเดอร์

```
src/app/(public)/page.tsx            วางทริป
src/app/(public)/j/[token]/          ลิงก์งาน (ลูกค้า/คนขับ)
src/app/admin/(shell)/...            หลังบ้าน
src/app/api/...                      route handlers (public ตรวจโทเคน · admin ตรวจ has_perm)
src/lib/supabase/                    client.ts server.ts admin.ts middleware.ts
src/lib/pricing/                     เครื่องคิดราคา (pure TS + vitest)
src/lib/contracts/                   zod schema ของทุก API (Phase 0 contract)
src/lib/copy/                        ข้อความ th/en
src/features/<feature>/              โค้ดของแต่ละฟีเจอร์ — 1 worker = 1 โฟลเดอร์
supabase/migrations/                 SQL
tests/e2e/ · tests/unit/             Playwright · vitest
docs/test-plan/<phase>.md            acceptance matrix
```

## 6. กฎ

- UI ภาษาไทย หน้าลูกค้าสลับ EN · lucide ไม่ใช่ emoji · sonner ไม่ใช่ alert · radix สำหรับยืนยัน
- ทุก view มี 4 สถานะ: skeleton / error+retry / empty / success · ปุ่มระหว่างรอ disabled + spinner
- destructure `error` จากทุกคำสั่ง Supabase · write ที่ RLS ปฏิเสธคืน 0 แถว → `.select('id').maybeSingle()` แล้วเช็ก null
- route adapter: ตรวจตัวตน (401) ก่อน validate body (422) เสมอ · `redirect()` ไม่อยู่ใน try
- วันที่ทุกค่า `timeZone: 'Asia/Bangkok'` · จัดกลุ่มวันใน SQL ด้วย `at time zone 'Asia/Bangkok'`
- ไฟล์ < 800 บรรทัด · ไม่มี `console.log` ใน prod · import ตรงตัวพิมพ์เล็กใหญ่ · script หลายบรรทัดเป็น `scripts/*.mjs`
- เขียนซอร์สด้วย Write/Edit เท่านั้น (hook `guard-shell-writes` บล็อก heredoc/sed/node -e)
- ห้าม `cat` ไฟล์ env หรือ settings · ดูชื่อคีย์ด้วย `cut -d= -f1`
- ทุก endpoint ต้องมี UI ที่เรียกมันจริง และสิทธิ์ตรงกับที่ UI อยู่
- เงินเป็นบาทจำนวนเต็ม (`int`) ทุกที่ · ราคาฝั่ง server คำนวณใหม่ด้วย `src/lib/pricing` เสมอ ไม่เชื่อตัวเลขจาก client

## 7. Gate (โหมดตรวจ: เร็ว)

| ระดับ | เมื่อไหร่ | คำสั่ง |
|---|---|---|
| quick | จบทุก task | `npm run typecheck` |
| batch | ทุก 8 task | `npm run typecheck && npm run build && npm run test:unit && npm run verify` |
| full | จบเฟส + ทุก task ที่แตะ auth / RLS / เงิน | batch + `npm run test:e2e` + `get_advisors` (security, performance) + `npm run types:check` |

## 8. เฟส

| เฟส | ขอบเขต | Tier |
|---|---|---|
| P0 contract | scaffold, token, shell, auth, migration ทั้งหมด, types, pricing lib, contracts, copy, route skeleton | orchestrator คนเดียว |
| P1 ลูกค้า | `/` วางทริป แผนที่ แวะรายทาง จอง ขอราคา ขั้นมัดจำ (UI) | worker A |
| P2 หลังบ้านงาน | งานเข้า เสนอราคา จัดคนขับ กฎราคา จุดหมาย ระยะจริง ค่าน้ำ คนขับและรถ | worker B |
| P3 ลิงก์งาน | มุมมองลูกค้า/คนขับ รูป เช็กอิน ค่าน้ำ ปิดงาน ขากลับ | worker C |
| P4 เงินและการแจ้งเตือน | PromptPay+สลิป ตรวจสลิป Stripe Beam webhook · LINE OA · web push · การเชื่อมต่อ · pg_cron | single owner (เงิน) |
| P5 ทีมงาน RBAC | เชิญ role สิทธิ์ โอนเจ้าของ | single owner (auth) |
| P6 seed + E2E | seed ครบทุกสถานะ · spec ทุกเฟสเสี่ยง · acceptance matrix | orchestrator |
