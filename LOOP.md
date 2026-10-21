# LOOP.md — แอ่วกัน (Aewkan) build runbook

> อ่านไฟล์นี้ **ครั้งเดียวต่อ context** — ตอนเริ่ม session, ตอน resume, และหลัง compaction (ถ้ายังอยู่ใน context ห้ามอ่านซ้ำ) ·
> ส่วน `.loop/state.json` อ่านทุก iteration (เล็ก) · ไฟล์นี้ 25KB × 12 iteration คือการอ่านซ้ำของที่อยู่ในความจำอยู่แล้ว
> อ่านแล้ว**ต้อง**ตัดสินใจตามนี้ก่อนทำอะไร
> ไฟล์นี้ควบคุม **การลงมือตามแผนที่อนุมัติแล้ว** เท่านั้น — การออกแบบ/อนุมัติเกิดที่
> `docs/design/demo.html` + `docs/design/DESIGN.md` (อนุมัติ 2026-10-21) **ก่อน** loop เริ่ม
> ถ้ายังไม่มีแผนที่อนุมัติ ให้หยุดแล้วกลับไปที่ `kp-design-brainstorm` — ห้าม loop ข้ามขั้นนี้

---

## 0 · Environment (ปักหมุด — ห้ามเดา)

| อะไร | ค่า |
|---|---|
| Supabase MCP server | `Supabase` (connector ของบัญชี, OAuth — เห็นทุกโปรเจกต์) · project_ref `kgjsycellzuiumudzdxl` (ชื่อ `aewkan`) |
| ตรวจก่อนใช้ | `get_project_url` ต้องเป็น `https://kgjsycellzuiumudzdxl.supabase.co` = `NEXT_PUBLIC_SUPABASE_URL` · โปรเจกต์อื่นในบัญชี (kpcrm-scb, standwalkth …) **ห้ามแตะ** |
| git remote / branch | `origin` / `ccr-5e60b244-69x519` |
| dev port | `3100` |
| ห้ามแตะ | `.env*` · `docs/design/demo.html` (สัญญาการออกแบบ) · Supabase project อื่นทุกตัว · `auth.users` ด้วย SQL ตรง |
| hook | `guard-shell-writes.mjs` ลงทะเบียนใน `.claude/settings.json` (PreToolUse Bash) — เขียนโค้ดผ่าน `node -e`/heredoc/`sed -i` ถูกบล็อกก่อนรัน · พังซ้ำ 17 ครั้งใน 3 โปรเจ็ค |

**โหมดทำงาน** (`kp-work-routing` "The mode switch" — เจ้าของเลือก ไม่ใช่ agent):

| คันโยก | ค่าที่เลือก |
|---|---|
| โหมด | **รุม** — worker แยก worktree (Agent `isolation: worktree`) ทุกที่ที่ write-set แยกได้ |
| max workers (ถ้ารุม) | **3** · collapse กลับ Tier 1 เมื่อ 2 worker ติดไฟล์เดียวกัน หรือ `verify-write-set --all` เจอ overlap |
| Phase 0 contract ก่อน fan-out | migration + types + `src/lib/contracts` + route skeleton + copy keys + tokens + deps — เจ้าของ: orchestrator |
| โหมดตรวจสอบ | **เร็ว** (§3) · ขนาด batch **8** (§6) |

**write set ต่อ worker (P1–P3 ขนานกันได้ · P4 P5 คนเดียวตามลำดับ):**

| worker | เฟส | เขียนได้ | ห้ามแตะ |
|---|---|---|---|
| A | P1 ลูกค้า | `src/app/(public)/page.tsx` `src/features/trip-builder/**` `src/lib/copy/trip.ts` `tests/e2e/p1-*` `docs/test-plan/P1.md` | migrations · globals.css · src/lib/pricing · src/lib/contracts · package.json |
| B | P2 หลังบ้าน | `src/app/admin/(shell)/{jobs,quotes,assign,pricing,places,drivers}/**` `src/features/admin-ops/**` `src/app/api/admin/{jobs,quotes,assign,pricing,places,drivers,segments,commission}/**` `src/lib/copy/admin.ts` `tests/e2e/p2-*` `docs/test-plan/P2.md` | เหมือน A |
| C | P3 ลิงก์งาน | `src/app/(public)/j/**` `src/features/job-link/**` `src/app/api/jobs/**` `src/lib/copy/job.ts` `tests/e2e/p3-*` `docs/test-plan/P3.md` | เหมือน A |

**โมเดลต่อบทบาท** (เพดานและพื้นเป็นของเจ้าของ · agent เสนอต่อ task ภายในช่วงนี้ · ไม่เขียน = ไม่สืบทอด · ปรับ effort ก่อนสลับโมเดล เพราะ cache แยกตามโมเดล):

| บทบาท | โมเดล / effort | เหตุผล |
|---|---|---|
| orchestrator / planner | `claude-opus-5-5 / high` | ถือภาพรวม เขียน contract (session นี้) |
| worker งาน judgement (RLS, migration, auth, เงิน) — P4 P5 | `claude-opus-5-5 / high` | ungated — ผิดแล้ว gate จับไม่ได้ |
| worker งาน UI ที่ gate จับได้ — P1 P2 P3 | `claude-sonnet-5-5 / medium` | tsc/build/spec จับให้ · ราคาคิดจาก lib ที่ทดสอบแล้ว |
| reviewer มิติ RLS / เงิน | `claude-opus-5-5 / high` | ungated judgement |
| reviewer มิติ convention / performance | `claude-sonnet-5-5 / low` | verifier scripts คุม |
| Explore / read-only fan-out | `claude-sonnet-5-5 / low` | อ่านอย่างเดียว |

**อนุญาตล่วงหน้า** (ไม่เขียน = ไม่อนุญาต):
- push ไป `origin/ccr-5e60b244-69x519` : **ใช่** (เฉพาะ branch รวม · branch ของ worker อยู่ในเครื่อง ไม่ push)
- deploy : **ไม่** ← เป็นสิทธิ์คนละอันกับ push
- apply migration ตรงโปรเจ็คจริง `kgjsycellzuiumudzdxl` : **ใช่** (ไม่มีข้อมูลจริง · ห้าม DROP/TRUNCATE/DELETE ไม่มี WHERE)

**ค่าที่ผู้ใช้ต้องให้เอง — loop หาเองไม่ได้ และห้ามอ่านค่า** (ตรวจแค่ชื่อคีย์:
`cut -d= -f1 .env.local` · ห้าม `cat`) — ทุกแถวต้อง **มีแล้ว** ก่อนรัน iteration แรก:

| กลุ่ม | คีย์ / สิ่งที่ต้องมี | สถานะ |
|---|---|---|
| `.env.local` Supabase (สาธารณะ) | `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — loop เขียนเองจาก MCP ได้ (ไม่ลับ) | มีแล้ว |
| env ลับ Supabase | `SUPABASE_SECRET_KEY` — **ผู้ใช้ใส่ใน environment ของ cloud session** (Edit environment → environment variable) · ใช้กับ route สาธารณะ webhook push LINE | **ว่าง** |
| `.env.local` MCP (PAT) | ข้าม — ใช้ OAuth connector | ไม่ใช้ |
| `.env.local` generated | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` · `CRON_SECRET` · `LINK_TOKEN_PEPPER` *(scaffold สร้าง ห้ามทับของเดิม)* | มีแล้ว (P0) |
| คีย์บริการภายนอก | LINE OA · Stripe · Beam · ตรวจสลิป · routing · PromptPay ID — **ไม่ใช่ env**: เจ้าของกรอกในหน้า "การเชื่อมต่อ" เก็บใน Vault · loop ทดสอบด้วยโหมด sandbox/ปิดใช้งานเท่านั้น | ไม่ต้องใช้ก่อนเริ่ม |
| git | `origin/ccr-5e60b244-69x519` push ได้ | มีแล้ว |
| MCP | `get_project_url` = `https://kgjsycellzuiumudzdxl.supabase.co` | มีแล้ว |

ถ้ามีแถวไหน **ว่าง** → ยังไม่เริ่ม · แจ้งชื่อคีย์ที่ขาดให้ผู้ใช้กรอกในไฟล์เอง (ไม่ใช่วางในแชท)

---

## 1 · Resume — ลำดับที่ทำทุกครั้งที่กลับมา

1. อ่าน `.loop/state.json` — เฟส/task ไหนเสร็จ ค้างที่ไหน (รูปแบบตามหัวไฟล์ `progress.mjs`)
2. **ยืนยันด้วย git ไม่ใช่ความจำ** — `git log --oneline | head -20` · `git status --short`
   **state ขัดกับ git → เชื่อ git**
3. **เครื่องต้องไม่ล้าสมัยกว่า remote** — `git fetch origin` แล้ว
   `git rev-list --left-right --count HEAD...@{u}` → `<ahead> <behind>`
   · behind = 0 → ไปต่อ (ahead ได้ = ของเราใหม่กว่า)
   · behind > 0 → **หยุด แจ้งผู้ใช้**: branch ไหน · ตามหลังกี่ commit ·
     `git log -1 --format=%s @{u}` — **ห้าม pull เอง** (อาจชนกับงานค้าง) ·
     บันทึก `blocked_reason: behind remote by <n>` ลง state แล้วจบ run
4. ตรวจของค้างจากรอบก่อน: `list_pages` · เช็คพอร์ตด้วยคำสั่งที่รันได้ทุก OS
   `node -e "fetch('http://127.0.0.1:<port>',{signal:AbortSignal.timeout(2000)}).then(r=>console.log('busy',r.status)).catch(()=>console.log('free'))"`
   → จดว่าอะไร**มีอยู่ก่อน = ไม่ใช่ของเรา** (ดู §5 · ตาราง PID/kill ต่อ OS อยู่ใน `kp-cross-platform` §5)
5. เริ่มที่งานแรกที่ยังไม่ `done` — **ทำต่อโดยไม่หยุดถาม**

---

## 2 · สองรอบที่ไม่สลับกัน — write sprint แล้วค่อย verify sprint

🔴 **เขียนไป ตรวจไป คือที่เวลาหายไป** — ของจริงรอบหนึ่ง task เฉลี่ย 22 นาที เป็นการตรวจ 15 นาที
และ `next build` ถูกรันทุก task ทั้งที่ทุก task ในเฟสเดียวกันแก้ไฟล์คนละชุด
กติกาว่าอะไรอยู่ระดับไหนเป็นของ `kp-testing-cadence` ("Write sprint, verify sprint")

### 2a · write iteration — ทำซ้ำจนถึงเงื่อนไขปิด batch (§6)

```
1) เลือกงานแรกที่ยังไม่เสร็จ และ dependency ครบแล้ว → mark doing
   — **หนึ่ง task = หนึ่งงานในแผน** ไม่ใช่หนึ่งชุดไฟล์ (ดู §6 "ขนาดงาน")
   — task ติดป้ายเสี่ยง (auth / RLS / เงิน-สต็อก) → ไม่เข้า batch: ทำแล้ว **full gate ทันที** (2b ทั้งชุดสำหรับงานเดียว)
   — task ถัดไปต้องพึ่งของที่ `written` แต่ยังไม่ verify → **ปิด batch ก่อน** (ไป 2b) แล้วค่อยเริ่ม
2) ทำงานให้จบทั้ง task · **ห้ามรีวิวงานตัวเอง** — สิ่งที่ไม่แน่ใจไปช่อง `unsure` ของ ledger
3) รัน **quick gate** (§3) = tsc + verify-lessons (วินาที ไม่ใช่นาที) · แดง → แก้ ≤ <N> รอบ · ยังแดง → blocked แล้วไปงานอื่น
4) เขียว → mark **written** (ไม่ใช่ done) · เขียน `.loop/state.json` + ต่อท้าย `.loop/changes.jsonl` + LESSONS.md
        · commit ครั้งเดียวรวมงาน + state + ledger: "<type>(<scope>): <desc> [<id>]" <· push ถ้าอนุญาต>
   <· `node <skill>/progress.mjs` ถ้าไม่มีคน run `--watch` อยู่ — ห้ามแตะ index.html เอง>
5) เช็คเงื่อนไขปิด batch (§6) → ยังไม่ถึง → write iteration ถัดไป · ถึงแล้ว → 2b
```

### 2b · verify iteration — ครั้งเดียวต่อ batch

```
1) ชั้น 0 ไม่ใช้โมเดล — รัน **batch gate** (§3) ครั้งเดียวทั้ง batch: build · spec ที่ครอบไฟล์ของทุก task ใน batch ·
   verify-* ทุกตัว · red-test เฉพาะ check ที่เกิดใหม่ใน batch
2) ชั้น 1 reviewer แยกมิติ อ่านอย่างเดียว ขนานกัน (`kp-work-routing` "Review fan-out") — input = `changes.jsonl` + `git diff <base>...HEAD`
   อ่านช่อง `unsure` ก่อน diff · ผลเป็น findings file:line + row id + severity
3) ชั้น 2 verify findings แบบ adversarial — มิติไหนเสร็จก่อน findings ของมันเข้า verify ทันที
4) ชั้น 3 แก้ findings ที่ยืนยันแล้ว — หนึ่ง commit ต่อกลุ่ม · รันซ้ำ **เฉพาะ check ที่ fix แตะ** ไม่ใช่ทั้ง batch
5) เขียนคำสั่ง spec จาก `should_assert` ของ ledger + แถว matrix → ติ๊กแถวได้เฉพาะตอนนี้ (§4)
6) ทุก task ใน batch → mark **done** · เขียน state + LESSONS.md (dedupe ตาม tag) · commit
7) จบเฟส → **full gate** (§3) + `docs/PHASE-SUMMARY.md` ถ้าเลือกสรุปท้ายเฟส
8) เช็ค stop conditions (§6) → ไม่เข้าเงื่อนไข → กลับไป 2a
```

**`.loop/changes.jsonl` — บรรทัดละ task ใน commit เดียวกับงาน** (นี่คือ input ของ reviewer ไม่ใช่ diary):

```json
{"task":"P3-STK-02","rows":["AC-12","AC-13"],"commit":"a1b2c3d","files":["app/(app)/stock/page.tsx","lib/stock/alerts.ts"],
 "did":"เพิ่ม low-stock alert อ่านจาก view v_stock_level","should_assert":["qty < threshold ขึ้นป้าย","qty = threshold ไม่ขึ้น"],
 "unsure":["view นี้กรอง org แล้วหรือยัง"],"risk":"none","tsc":"green"}
```

`unsure` ว่างได้แต่ต้องมีช่อง — writer รู้ว่าตรงไหนเดา แต่ก่อนหน้านี้ไม่มีที่ให้บอก ·
`should_assert` กลายเป็น spec ใน 2b ข้อ 5 · reviewer ที่อ่าน ledger ก่อน diff รู้ทันทีว่าไฟล์ไหนปิดแถวไหน

ข้อ 4 ของ 2a คือข้อที่ทำให้ context ถูก compact ตอนไหนก็ไม่เสียหาย — iteration ถัดไป
**อ่านไฟล์** ไม่ใช่ **นึกย้อน** · และ state ไป**ใน commit เดียวกับงาน** ไม่ใช่ commit แยก
(สอง commit ต่องานคือสัญญาณว่างานถูกซอยเล็กเกินไป — ของจริงรอบหนึ่งได้ 153 commit จาก 28 งาน) ·
หนึ่ง commit ต่อ task + ledger คือสิ่งที่ทำให้ verify ตอนจบหาต้นตอได้ใน log(N) ด้วย `git bisect`

---

## 3 · Gate — สามระดับ ต้องเขียวก่อน mark done

🔴 **ชุดเต็มเป็น gate ของ "เฟส" ไม่ใช่ของ "งาน" และ build เป็น gate ของ "batch" ไม่ใช่ของ "งาน"**
(ของจริงรอบหนึ่ง: full 45 รอบ 149 นาที · อีกรอบ task เฉลี่ย 22 นาทีเป็นการตรวจ 15)
กติกาว่าอะไรอยู่ระดับไหนเป็นของ **`kp-testing-cadence`** — ที่นี่ใส่แค่คำสั่งจริงของโปรเจ็ค

**โหมดตรวจสอบที่เลือกไว้:** **เร็ว** — ทุก task: typecheck อย่างเดียว · build + unit + verify ทุก batch (8 task) · E2E จบเฟส · งานเสี่ยงได้ full gate ทันทีเสมอ

`<kit>` = ที่อยู่ของ plugin `kp-supabase-nextjs` (cloud session: `~/.claude/plugins/.../kp-supabase-nextjs` หรือ clone `/home/user/kp-supabase-nextjs/plugins/kp-supabase-nextjs`)

### quick — จบทุก task (วินาที)

```
npm run typecheck && npm run lessons:check
```

- [ ] `npm run typecheck` = `next typegen && tsc --noEmit` *(ห้ามเลื่อน — type error ทบต้นข้าม task)*
- [ ] `npm run lessons:check` = `node scripts/verify-lessons.mjs` *(รูปแบบ LESSONS.md / RULINGS.md)*
- [ ] worker: `node scripts/verify-write-set.mjs --worker <A|B|C>`

### batch — ปิด batch (§6) ครั้งเดียวทั้ง batch

- [ ] `npm run build`
- [ ] `npx playwright test <spec ที่ครอบไฟล์ของทุก task ใน batch>`
- [ ] unit *(เฉพาะเมื่อแตะ pure logic — ห้าม mock Supabase)*
- [ ] `node <kit>/skills/kp-cross-platform/verify-portability.mjs` และ verify-* อื่นของโปรเจ็ค
- [ ] `node <kit>/skills/nextjs-gotchas/verify-route-guards.mjs` *(loading.tsx เหนือหน้าที่ notFound/redirect — พังซ้ำ 8 ครั้งใน 3 โปรเจ็ค)*
- [ ] `node <kit>/skills/kp-acceptance-test-matrix/verify-red-tested.mjs scripts` *(ทุก checker มีหลักฐานว่าแดงได้)*
- [ ] `node <kit>/skills/kp-e2e-playwright-real-db/verify-run-json.mjs results.json --expect-min <n>` *(0 skipped, ไม่มี spec ว่าง)*
- [ ] `node <kit>/skills/kp-work-routing/verify-write-set.mjs --worker <ID>` *(เฉพาะโหมดรุม — ไฟล์นอก write set)*
- [ ] red-test **เฉพาะ check ที่เกิดใหม่ใน batch** — ครั้งเดียวตอนเกิด (`kp-acceptance-test-matrix`)
- [ ] review แยกมิติ (correctness · RLS/auth/เงิน · convention/UI-kit · performance) — read-only ขนาน แล้ว verify findings
- [ ] `node <skill>/lessons-report.mjs --json` เพื่อ dedupe LESSONS.md ตาม tag

### full — จบเฟส **และ** ทุก task ที่ติดป้ายเสี่ยง (ทำทันที ไม่รอ batch)

ป้ายเสี่ยง = **auth / session / login** · **RLS หรือการมองเห็นตาม role** ·
**การเขียนเงิน / สต็อก / สถานะ** — ป้ายนี้อยู่ที่ตัวงาน ไม่ขึ้นกับโหมดที่เลือก

- [ ] ทุกอย่างใน quick และ batch
- [ ] `npx playwright test` — spec ของเฟสนี้ **และเฟสก่อนหน้า**
- [ ] `get_advisors(security)` ไม่มี ERROR ใหม่ *(ถ้าแตะ DB)*
- [ ] RLS cross-tenant/role test *(ถ้าแตะตาราง — leak = critical)*
- [ ] Chrome MCP sweep *(ตาม `kp-testing-cadence`)*
- [ ] acceptance matrix ของเฟส (§4)

นอกรอบทั้งสามระดับ: **แตะของที่พังเฉพาะในเบราว์เซอร์** (cookie/middleware/redirect,
RLS-visible, realtime, PWA/SW, PDF, responsive) → smoke สั้น ๆ ทันที ไม่ต้องรอจบเฟส

**exit code 0 ไม่ใช่หลักฐาน** — อ่าน output จริงว่าไม่มี error ปนมา
**HTTP 200 ก็ไม่ใช่** — `error.tsx` ของ Next render ด้วยสถานะ 200 · ต้องตรวจ*เนื้อหา*

---

## 4 · Acceptance matrix — loop ติ๊กเองได้แค่ไหน

- ติ๊กได้ **เฉพาะแถวที่มีคำสั่งซึ่งแดงได้จริง**ผูกอยู่
- แถวที่ต้องใช้ตาคนดู (ส่งจริงเข้า LINE, e-sign บนมือถือ, งานพิมพ์) →
  `manual_verify: true` **mark ได้แค่ระดับ code-green** แล้วรอคน
- ห้ามติ๊กสิ่งที่พิสูจน์ไม่ได้ — กฎของ `kp-acceptance-test-matrix`
- 🔴 **แถวที่ `manual_verify` ต้องถูกส่งคืนให้คนตอนจบ run ไม่ใช่แค่ list ทิ้งไว้ท้ายเฟส** —
  ดู §9 "ตอนจบ build" · **run ยังไม่จบตราบใดที่ยังมีแถวรอคน**

---

## 5 · ของที่เปิด = ของที่ต้องเก็บ

```
ก่อนเริ่ม : list_pages → จด id ที่มีอยู่ = ไม่ใช่ของเรา ห้ามแตะ
            port ไม่ว่างและไม่ใช่ของเรา → ใช้พอร์ตอื่น ห้ามฆ่า
ระหว่าง   : ใช้ page เดิมซ้ำ · เปิดใหม่เมื่อจำเป็น → จด id ทันที
จบรอบ     : close_page เฉพาะของเรา · หยุด dev server เฉพาะ PID ที่เราสตาร์ต
```

**จดลงไฟล์ `<.loop/owned.json>` ไม่ใช่จำเอา** — compact แล้วความจำหาย
เหลือสองทางที่ผิดทั้งคู่: ปล่อยกองไว้ หรือฆ่าของคนอื่น

**เพดาน**: page เปิดเกิน `<5>` หรือมี dev server ตัวที่สอง → **หยุดแล้วรายงาน**
ว่ามีอะไรค้างและเป็นของใคร ไม่ใช่เปิดเพิ่ม

---

## 6 · ขอบเขตและเงื่อนไขหยุด

| ขอบเขต | ค่า |
|---|---|
| แก้ต่องาน | **3** รอบ → blocked |
| **ขนาด batch** | **8** task → ปิด batch (verify sprint §2b) · ตัวเลขนี้ไป `run.batch.size` ใน state.json |
| **ปิด batch ก่อนกำหนดเมื่อ** | task ถัดไปพึ่งของที่ยัง `written` · จบเฟส · เจอป้ายเสี่ยง · `unsure` สะสม ≥ **5** · iteration budget เหลือ ≤ 1 |
| **ขนาดงาน** | **1 task = 1 งานในแผน** (กลุ่มแถว matrix ที่ปิดด้วยกัน) — ไม่ใช่ 1 ชุดไฟล์ |
| ไฟล์ต่อ task | **20** → **เขียนไว้ในสรุป ไม่ใช่ blocked** · blocked เฉพาะงานที่แตะ migration / auth / tokens |
| iteration ต่อ run | **60** |
| blocked ติดกัน | **2** → หยุดทั้ง run |
| **สืบหาสาเหตุ** | **วัดครบ 1 รอบแล้วทำซ้ำไม่ได้ → หยุด รายงานตัวเลขที่วัดได้ + คำถามที่ต้องการคำตอบ** |
| จบเฟส | **ไปต่อทันที** ← ดู §7 |
| **สรุปรายงาน** | **ทำยาวจนเสร็จค่อยสรุป** — `docs/RUN-SUMMARY.md` + run report ครั้งเดียวตอนจบ |

🔴 **เพดานไฟล์เป็นสัญญาณเตือน ไม่ใช่หน่วยของงาน** — ตั้งไว้ต่ำ (เช่น 8) แล้วบังคับ blocked
จะทำให้งาน 1 งานในแผนถูกหั่นเป็น 4–5 งานย่อย และ**ทุกงานย่อยจ่ายค่า gate ซ้ำทั้งชุด**
ของจริงรอบหนึ่ง: เฟส 1 จาก 7 งานในแผนกลายเป็น 36 งานย่อย เฟส 0 จาก 10 เป็น 36
ของที่ต้องคุมเข้มจริง ๆ คือ **write-set** ไม่ใช่จำนวนไฟล์ (`kp-work-routing`):
migration, design tokens, auth/proxy, lockfile, RPC ที่ใช้ร่วมกัน — มีเจ้าของเดียวเสมอ

**หยุดถามเฉพาะ 4 กรณี:**
1. งานที่ย้อนกลับไม่ได้ / ทำลายข้อมูล
2. ความปลอดภัย (คีย์ ความลับ สิทธิ์)
3. ผลกระทบนอกเครื่อง (push / deploy / publish) ที่ยังไม่ได้อนุญาตไว้ใน §0
4. แผนพังจนทุกทางเลือกเป็นการเดา

นอกนั้น **ตัดสินเองแล้วบันทึก**:
`Ruling: <ตัดสินอะไร> — <เพราะอะไร> — <ถ้าผิดเสียอะไร>`

เรื่องที่เป็นการตัดสินใจของเจ้าของ (ราคา ข้อความการตลาด นโยบาย) → ใช้ค่าชั่วคราวที่
สมเหตุสมผล ระบุว่าชั่วคราว **ทำส่วนอื่นต่อ** แล้วรวบรวมไว้แจ้งตอนจบ

---

## 7 · สามสวิตช์ที่ต้องตั้งใจเลือก

| | หยุดท้ายเฟส | วิ่งยาว |
|---|---|---|
| เลือกเมื่อ | multi-tenant · มีข้อมูลลูกค้าจริง · leak = หายนะ | greenfield · ยังไม่มีข้อมูลจริง |
| branch | `loop/<phase>` ห้าม commit ลง main | commit ลง main |
| migration | dev branch เท่านั้น · merge prod = งานคน | apply ตรงได้ |

**โปรเจ็คนี้เลือก:** วิ่งยาว · commit ลง `ccr-5e60b244-69x519` (ไม่ใช่ main — เป็น branch ที่ได้รับมอบหมาย) · migration apply ตรง **เพราะ** greenfield ยังไม่มีลูกค้าจริง โปรเจกต์ Supabase ว่าง และเจ้าของอนุญาตไว้ใน §0

---

## 8 · ห้ามเด็ดขาด

- destructive DB: `DROP` / `TRUNCATE` / `DELETE` ไม่มี `WHERE` / reset branch ที่มีข้อมูลจริง
- `push --force` · `reset --hard` บน commit ที่ push แล้ว · `rm -rf`
- แตะ `.env*` / secrets / path ในรายการห้ามแตะ
- **`cat` ไฟล์ env หรือ settings ทั้งไฟล์** — ดูแค่ชื่อคีย์: `grep -o '"[a-z_]*":' <file>`
  (อ่านทั้งไฟล์ = ความลับหลุดลง transcript ต่อให้ไฟล์อยู่ใน `.gitignore` ถูกต้องแล้วก็ตาม)
- รัน seed ที่ล้างข้อมูลขณะมีคนกำลังเทส
- ไม่มั่นใจว่าปลอดภัย = ไม่ปลอดภัย → หยุด

---

## 9 · บทเรียน — จดตอนเจอ ไม่ใช่ตอนจบ

`docs/LESSONS.md` (จาก `LESSONS-template.md`) · เขียนทันทีที่จับได้ (compact แล้วรายละเอียดหายหมด)
· การตัดสินใจของโปรเจ็ค → `docs/RULINGS.md` ไม่ใช่ที่นี่

```markdown
## L-014 · 2026-09-16 · kp-testing-cadence · checker-cannot-fail
- อาการ: <สิ่งที่คนเห็น ≤120>
- สาเหตุ: <กลไกจริง ไม่ใช่ที่เดาครั้งแรก>
- หลักฐาน: <path ของไฟล์หลักฐาน หรือตัวเลขจริง — ห้าม "ดูแล้วพัง">
- กฎ: <หนึ่งประโยค หนึ่งกฎ ≤200 — มีสองกฎ = สองบทเรียน>
- status: new
```

- หัวข้อ = id ที่ไม่ซ้ำ · วันที่ ค.ศ. · skill เจ้าของ (ต้องมีจริง) · tag จาก `lessons-tags.json`
- 🔴 **ก่อนเพิ่ม grep tag ก่อน** — มีแล้ว → เพิ่ม `- เกิดซ้ำ: <task> <วันที่>` ใต้ข้อเดิม ไม่เขียนใหม่
- กฎเปลี่ยน → ข้อใหม่ใส่ `- supersedes: L-nnn` และข้อเก่า `status: superseded-by:L-ใหม่`
- `node <skill>/verify-lessons.mjs` อยู่ใน quick gate (§3) — ไฟล์ที่สคริปต์อ่านไม่ได้ ตอนจบไม่มีใครรวมเข้า skill ได้

**นับเป็นบทเรียนเมื่อ:** ถ้าเป็นโปรเจ็คอื่นแล้วมันจะกัดอีก · พิมพ์ผิดไม่นับ · ราคา/งวด/นโยบายเป็น ruling

**ตอนจบ build — ข้อความเดียว สองครึ่ง** (`kp-autonomous-loop` "Closing step")

ครึ่งแรก **สิ่งที่ต้องให้คนเดินเอง** — นับจากไฟล์ matrix ไม่ใช่จากความจำ
(`node <skill>/../kp-work-routing/run-report.mjs --project . --playwright results.json`
พิมพ์บรรทัด `<n>/<total> proven · <m> awaiting a person` ให้จากไฟล์โดยตรง):

> เดินด้วยตัวเอง `<m>` แถวก่อนเรียกว่าจบ
> - `<row-id>` `<ทำอะไร>` — `<หน้าไหน/ปุ่มไหน>`
> - …
> **ยังไม่เคยมีใครตรวจ `<k>` แถว** ← พูดถึงก่อนและแยกจากพวก manual
>   แถวแบบนี้อาจเป็นฟีเจอร์ที่เขียนไว้ในแผนแล้วไม่เคยถูกสร้าง

🔴 **run ยังไม่จบถ้าตัวเลขนี้ยังไม่เป็นศูนย์** — เขียนตัวเลขลงในข้อความ ไม่ใช่บอกว่า "เสร็จแล้ว"

ครึ่งหลัง **บทเรียน** — ไม่ใช่ถามลอย ๆ ว่า "มีอะไรให้อัปสกิลไหม" แต่รัน
`node <skill>/lessons-report.mjs` แล้ววางผล: มันเทียบทุก tag กับทะเบียนของ kit
(`lessons-merged.jsonl`) แล้วแบ่งเป็น 🔴 อยู่ใน kit แล้วแต่ยังเกิด (→ ต้องเป็นสคริปต์/แถว template)
· 🟢 ใหม่ (→ ประโยคในการ์ดกฎ) · ⚪ เฉพาะโปรเจ็ค:

> รอบนี้ได้ `<n>` บทเรียน → `<skill-a>` ×2 · `<skill-b>` ×1 — 🔴 `<k>` ข้อเคยอยู่ใน kit แล้วยังเกิด — เพิ่มไหม

สองครึ่งนี้ตอบคำถามสองข้อที่เจ้าของมีจริงตอนจบ run: **เหลืออะไรให้ผมทำ** และ
**รอบนี้เสียอะไรไปที่โปรเจ็คหน้าไม่ควรเสียอีก**

---

## 10 · คำถามก่อนเริ่ม loop

> **หัวข้อนี้ต้องถูกตอบก่อนรัน iteration แรกเสมอ** — เป็นจุดสุดท้ายที่จับสมมติฐานผิดได้
> ก่อนปล่อยให้เดินเองหลายชั่วโมง · ตอบแล้วเขียนคำตอบทับลงไปในไฟล์นี้

1. **ขอบเขต** — รอบนี้เอาถึงไหน (เฟสไหนถึงเฟสไหน / ต้องได้อะไรถึงเรียกว่าจบ)
2. **ใบอนุญาต** — push ได้ไหม · deploy ได้ไหม · apply migration ลงโปรเจ็คจริงได้ไหม
3. **สามสวิตช์ (§7)** — หยุดท้ายเฟสหรือวิ่งยาว · branch policy · migration policy
4. **งบ (§6)** — รับได้กี่ iteration ต่อรอบ · แก้กี่รอบก่อนยอมแพ้ · **ขนาดของ 1 task
   คืองานในแผน ไม่ใช่ชุดไฟล์** ใช่ไหม
4b. **โหมดตรวจสอบ (§3)** — เร็ว / มาตรฐาน / ละเอียด · เขียน**คำสั่งจริง**ของแต่ละระดับลง §3
   ไม่ใช่แค่ชื่อโหมด · งานที่ติดป้ายเสี่ยงได้ full gate เสมอไม่ว่าเลือกอะไร
4c. **ขนาด batch (§6)** — กี่ task ก่อนปิด batch (แนะนำ 6–8 · ละเอียด = 3) และเงื่อนไขปิดก่อนกำหนดตรงกับโปรเจ็คไหม
5. **ห้ามแตะ** — ไฟล์/ตาราง/บริการไหนที่ห้ามยุ่งเด็ดขาด
6. **ข้อมูลจริง** — มีข้อมูลลูกค้าจริงในระบบไหม มีใครกำลังเทสอยู่ไหม
7. **ค้างจากรอบก่อน** — มี task `doing` ค้าง หรือ dev server/page ค้างไหม ·
   เครื่องเท่ากับหรือใหม่กว่า remote แล้ว (§1 ข้อ 3) ใช่ไหม
8. **ตัดสินใจแทนได้แค่ไหน** — เรื่องไหนที่ต้องรอเจ้าของจริง ๆ นอกจาก 4 ข้อใน §6
8b. **ใครเดินแถว manual** — แถวที่เครื่องพิสูจน์ไม่ได้ (ส่งจริงเข้า LINE, e-sign, งานพิมพ์)
   ใครจะเป็นคนเดิน และเดินตอนไหน · ตอนจบ run loop ต้องส่งรายการนี้คืนพร้อมขั้นตอน (§9)
9. **สรุปเมื่อไหร่** — สรุปท้ายทุกเฟส (append `docs/PHASE-SUMMARY.md`: สิ่งที่ส่ง ·
   ผล gate · ruling ที่ตัดสินไป · แถว `manual_verify` ที่รอคน — แล้ว**ไปต่อ**)
   หรือทำยาวจนเสร็จค่อยสรุปครั้งเดียวพร้อม run report
10. **ค่าที่ต้องให้ (§0) ครบไหม** — ทุกแถว มีแล้ว? ถ้ายัง ให้หยุดตรงนี้ แจ้งชื่อคีย์ที่ขาด
11. **ความคืบหน้า (§12)** — ผู้ใช้จะ run `--watch` ในเทอร์มินัลเอง หรือให้ loop เรียก `progress.mjs` ทุก iteration · ต้องการหน้าเว็บด้วยไหม (`--init`)

**ตอบครบแล้วค่อยเริ่ม** — ถ้าข้อไหนตอบไม่ได้ ให้ถามก่อน อย่าเดา

### คำตอบของโปรเจ็คนี้ (2026-10-21)

1. ขอบเขต: P0 → P6 ทั้งหมดใน `CLAUDE.md` §8 · จบเมื่อทุกเฟสผ่าน full gate และ acceptance matrix ไม่มีช่องว่าง (แถว manual ส่งคืนเจ้าของ)
2. ใบอนุญาต: push `origin/ccr-5e60b244-69x519` ใช่ · deploy ไม่ · apply migration โปรเจกต์ `kgjsycellzuiumudzdxl` ใช่
3. สามสวิตช์: วิ่งยาว · branch ที่มอบหมาย · migration apply ตรง
4. งบ: 60 iteration · แก้ 3 รอบ · 1 task = 1 งานในแผน
4b. โหมดตรวจ: เร็ว (คำสั่งจริงใน §3 และ `CLAUDE.md` §7)
4c. batch: 8 task · ปิดก่อนเมื่อแตะงานเสี่ยงหรือจบเฟส
5. ห้ามแตะ: ตาม §0
6. ข้อมูลจริง: ไม่มี · ไม่มีใครเทสอยู่
7. ค้าง: ไม่มี · เครื่อง = remote (ahead 0 behind 0 ณ 2026-10-21)
8. ตัดสินแทนได้: ทุกอย่างนอก 4 ข้อใน §6 · เรื่องราคา/ข้อความการตลาด/นโยบายใช้ค่าจากเดโม่เป็นค่าชั่วคราว
8b. แถว manual (ส่ง LINE จริง, ตัดบัตร Stripe/Beam จริง, ตรวจสลิปจริง, push บนมือถือ, กล้องถ่ายรูปบนมือถือ): เจ้าของเดินเองหลังกรอกคีย์ในหน้าการเชื่อมต่อ
9. สรุป: ทำยาวจนเสร็จค่อยสรุปครั้งเดียว
10. ค่า §0: ขาด `SUPABASE_SECRET_KEY` เท่านั้น — loop ทำ P0–P3 ได้ระหว่างรอ · งานที่ต้องใช้ (route สาธารณะที่เขียนข้อมูล webhook push LINE) ทำโค้ดได้แต่บันทึกว่า **ยังไม่ได้ตรวจกับฐานข้อมูลจริง** จนกว่าคีย์จะมา
11. ความคืบหน้า: cloud session → publish หน้า progress เป็น Artifact ตอนจบเฟส

---

## 11 · คำสั่งเริ่ม loop (ให้ผู้ใช้ก๊อปเมื่อ §0 และ §10 ครบเท่านั้น)

```
/loop อ่าน LOOP.md ก่อน แล้ว resume ตาม §1 · ทำ iteration ถัดไปตาม §2 · หยุดเฉพาะเมื่อเข้าเงื่อนไข §6 · สรุปตาม §10 ข้อ 9
```

ไม่ใส่ช่วงเวลา = โมเดลกำหนดจังหวะเอง (เหมาะกับ build ล้วน) · ใส่ `/loop 20m …` เฉพาะเมื่อ
ต้องรอของนอกเครื่อง (deploy, CI) ระหว่าง iteration

---

## 12 · ความคืบหน้า (ไม่เปลือง token)

ผู้ใช้ดูได้เองตลอด run โดย agent ไม่ต้องเขียนอะไรนอกจาก state.json:

```
node <skill>/progress.mjs --watch     # เทอร์มินัล VS Code (แบ่งครึ่ง panel): แถบสด redraw ทุก 15 วิ
                                      # เสร็จครบ → ขึ้นบรรทัด ✓ และดังติ๊งครั้งเดียว
node <skill>/progress.mjs --init      # (ถ้าต้องการหน้าเว็บด้วย) → docs/progress/index.html เปิดจาก file://
```

- แหล่งข้อมูลเดียวคือ `.loop/state.json` (§2 ข้อ 5) + git — ทั้งเทอร์มินัลและหน้าเว็บ**คำนวณ**จากไฟล์ ไม่มีใครพิมพ์สถานะลงไป
- ครบทุก task = `done` → เทอร์มินัลขึ้น ✓ + bell · หน้าเว็บขึ้นแบนเนอร์ "เสร็จแล้ว" และหยุด poll เอง
- state ไม่ขยับเกิน 45 นาทีทั้งที่ยัง `running` → แจ้งว่า loop อาจหยุดไปแล้ว
- **agent ห้ามรัน `--watch` เอง (บล็อก shell ตัวเอง) และห้ามเปิด/อ่าน/แก้ `index.html`** — ถ้าที่แสดงผิด แปลว่า state.json ผิด แก้ที่นั่น
- cloud session: publish หน้า + `state.js` เป็น Artifact ครั้งเดียว แล้ว republish เฉพาะ `state.js`
  ตอนจบเฟส (ไม่ใช่ทุก iteration)
