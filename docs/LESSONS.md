# LESSONS — <PROJECT>

> จดทันทีที่จับได้ ไม่ใช่ตอนจบ · นับเป็นบทเรียนเมื่อโปรเจ็คอื่นจะโดนอีก (พิมพ์ผิดไม่นับ) ·
> ห้ามมีข้อมูลบุคคลหรือ credential · **การตัดสินใจของโปรเจ็ค (ราคา งวด นโยบาย) ไม่ใช่บทเรียน → `docs/RULINGS.md`**
>
> ตรวจรูปแบบด้วย `node <kit>/skills/kp-autonomous-loop/verify-lessons.mjs` (อยู่ใน quick gate) —
> ไฟล์ที่สคริปต์อ่านไม่ได้คือไฟล์ที่ตอนจบ run ไม่มีใครรวมเข้า skill ได้
>
> **ก่อนเพิ่มข้อใหม่ ให้ grep `tag` เดิมก่อน** — ถ้ามีอยู่แล้ว เพิ่มบรรทัด `เกิดซ้ำ:` ใต้ข้อเดิม
> ไม่ใช่เขียนข้อใหม่ · จำนวน `เกิดซ้ำ` คือหลักฐานว่ากฎนี้ต้องกลายเป็นสคริปต์ ไม่ใช่ประโยค

<!-- รูปแบบ (ทุกข้อ ทุกช่อง ชื่อช่องตรงตัว บรรทัดละช่อง):

## L-001 · 2026-09-16 · kp-testing-cadence · checker-cannot-fail
- อาการ: ตัวตรวจ focus-contrast รายงาน 4,212 ปัญหาเท่าเดิมทั้งก่อนและหลังแก้
- สาเหตุ: probe อ่าน `--brand` จาก :root ไม่ใช่ `outline-color` ที่ fix ตั้งไว้
- หลักฐาน: docs/review/T5-04/focus-20260916T0010Z.txt
- กฎ: ตัวตรวจต้องพิมพ์ counter ของกลาง (sheets/rulesSeen) และตัวเลขต้องขยับเมื่อโค้ดที่มันเฝ้าเปลี่ยน
- status: new
- เกิดซ้ำ: T6-03a 2026-09-17
- supersedes: L-000

หัวข้อ = `## <id> · <วันที่ ค.ศ.> · <skill เจ้าของ> · <tag>`
  id       L-001, L-002 … ไม่ซ้ำ ไม่ย้อน · ไม่มีชื่อเรื่อง (อาการอยู่ในช่องของมัน)
  เจ้าของ  ต้องเป็น skill ที่มีจริง (รายชื่อ + alias ของ command ใน lessons-owners.json)
  tag      จาก lessons-tags.json — คำใหม่ต้องเพิ่มในไฟล์นั้นก่อน จึงจะใช้ได้
ช่อง
  อาการ     สิ่งที่คนเห็น ≤ 120 ตัวอักษร
  สาเหตุ    กลไกจริง ไม่ใช่ที่เดาครั้งแรก ≤ 200
  หลักฐาน   path ของไฟล์หลักฐาน หรือตัวเลข/สตริงจริง — ไม่ใช่ย่อหน้า ≤ 200
  กฎ        **หนึ่งประโยค หนึ่งกฎ** ≤ 200 · มีสองกฎ = สองบทเรียน
  status    new | merged:<skill>@<version> | superseded-by:L-nnn | project-only | expired
  เกิดซ้ำ   (ไม่บังคับ ซ้ำได้) <task id> <วันที่> — เพิ่มเมื่อเจออีกครั้ง แทนการเขียนข้อใหม่
  supersedes (ไม่บังคับ) L-nnn — ข้อเก่าต้องถูกเปลี่ยน status เป็น superseded-by
-->

---

## L-001 · 2026-10-21 · kp-e2e-playwright-real-db · env-drift
- อาการ: Playwright 1.64.1 ล้มทุก spec ที่เปิดเบราว์เซอร์ "Executable doesn't exist … npx playwright install"
- สาเหตุ: container มี Chromium build 1194 ติดตั้งไว้ แต่ @playwright/test เวอร์ชันล่าสุดชี้หา build ที่ใหม่กว่า
- หลักฐาน: 6 failed · 4 passed (เฉพาะ spec ที่ใช้ request) → ตั้ง executablePath แล้ว 10 passed
- กฎ: ใน cloud container ให้ playwright.config ชี้ executablePath ไป /opt/pw-browsers/chromium ถ้ามีอยู่ แทนการ playwright install
- status: new

## L-002 · 2026-10-21 · supabase-rls-schema · scaffold-tooling
- อาการ: apply_migration ตอบ cancelled และ execute_sql ที่มี DELETE ค้างจน timeout 60 วิ ทั้งที่ DB ไม่มีอะไรล็อก
- สาเหตุ: Supabase connector รอผู้ใช้ยืนยันคำสั่งที่ดูเป็น destructive (drop … if exists, delete) เมื่อไม่มีคนกดก็ยกเลิกเงียบ ๆ
- หลักฐาน: timeout 60 s ×2 · pg_stat_activity 0 แถว · bookings ยังเป็น 1 แถว · migration เดียวกันที่ตัด drop 21 บรรทัดผ่านทันที
- กฎ: migration ของ DB ใหม่ไม่ใส่ drop if exists และงาน cleanup ใน run ที่ไม่มีคนเฝ้าใช้ update สถานะแทน delete ผ่าน MCP
- status: new
- เกิดซ้ำ: P5 2026-10-21
- เกิดซ้ำ: cron-notify 2026-10-21

## L-003 · 2026-10-21 · kp-e2e-playwright-real-db · false-green
- อาการ: spec "ผู้ไม่ได้ล็อกอินเปิดลิงก์เชิญ" ผ่าน แต่จริง ๆ เปิดด้วย session ทีมงาน
- สาเหตุ: ภายใน `test.use({ storageState })` คำสั่ง `browser.newContext()` สืบทอด storageState ของ project/describe มาด้วย
- หลักฐาน: P5 accept spec เห็นหน้า /admin แทนฟอร์มยอมรับ · แก้ด้วย `newContext({ storageState: { cookies: [], origins: [] } })` แล้ว 32 passed
- กฎ: context ที่ตั้งใจให้เป็นผู้ไม่ได้ล็อกอินต้องส่ง storageState ว่างอย่างชัดเจนทุกครั้ง
- status: new
