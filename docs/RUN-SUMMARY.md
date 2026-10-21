# RUN SUMMARY — แอ่วกัน (Aewkan) · run 2026-10-21

Mode รุม (3 workers per wave) · loop everything · verification เร็ว · branch `ccr-5e60b244-69x519` · not deployed.

## Result

| Gate (final, whole branch) | Result |
|---|---|
| typecheck · build · verify (portability, route guards) · types:check · lessons:check | pass |
| unit (vitest) | 168 passed |
| E2E (Playwright, desktop + phone, real Supabase) | **505 passed · 0 failed · 27 not run** |
| Supabase advisors — security | only intended items: token-checked RPCs for links/payments, permission-checked SECURITY DEFINER functions, "leaked password protection" off |
| Supabase advisors — performance | unused indexes only (new database) |

## Phases

| Phase | What | Status |
|---|---|---|
| P0 | scaffold, auth, schema + RLS + RBAC, pricing engine, contracts | done |
| P1 | trip builder: map, templates, along-route stops ±฿, 4 prices + best value, booking / quote request, bottom menu | done |
| P2a | jobs + KPIs, quotes with deposit deadline, assign driver + links, drivers + off days | done |
| P2b | pricing rules editor (versions), places by link / coords / map click, measured segments, ค่าน้ำ | done |
| P3 | customer / driver job link: photos, check-in, ค่าน้ำ, finish, return-trip offer | done |
| P4 | PromptPay QR + slip, slip check (SlipOK / EasySlip), Stripe, Beam, LINE OA, web push, การเชื่อมต่อ, การเงิน | done (live paths need keys) |
| P5 | team, invites, roles editor, ownership transfer | done |
| P6 | demo seed / every acceptance row run | **blocked** — see below |

## Not run (27 E2E rows) and why

- **Need `SUPABASE_SECRET_KEY`** (public booking insert, return booking, X-01, X-03): P1-API-03..06, P1-BOOK-03/04, P3-85, P3-87, P3-28.
- **Need a second, confirmed non-staff account** (`E2E_LIMITED_EMAIL` / `E2E_LIMITED_PASSWORD`): P5-04-06 / P5-06-02.
- **P3-21b** (paid / balance lines): can now be driven through the staff payment approval (P4) — follow-up.
- **Need provider keys** (manual after setup): Stripe / Beam / LINE / slip check live calls, routing fetch, real invite e-mail.
- **P6 demo seed** not created on purpose: tests run against the live project; a seed would have to be deleted by hand later.

## Owner actions (in order)

1. Add `SUPABASE_SECRET_KEY` to the environment (cloud environment settings / Vercel env) — never in chat.
2. Open `/admin/setup` → create the owner account.
3. Before real customers: run `supabase/cleanup/before-go-live.sql` in the Supabase SQL editor (removes ~786 test bookings and other E2E rows, resets booking numbers).
4. `/admin/integrations`: PromptPay ID + name · slip provider + key · Stripe secret + webhook secret · Beam merchant / key / HMAC · LINE basic id + channel secret + access token + staff group · routing provider + key · web push subject. Copy the webhook URLs shown there into Stripe / Beam / LINE Developers.
5. Supabase Auth: custom SMTP + redirect URL `<site>/admin/invite/**` (R-014), and turn on leaked-password protection.
6. `/admin/pricing`: replace the provisional v1 prices (R-005).
7. After deploy: schedule `/api/cron/notify` every 5 min via pg_cron + pg_net with `CRON_SECRET` (R-017).

## Decisions made for you (docs/RULINGS.md)

R-012 bottom menu on small screens · R-013 team rules (no one grants more than they hold, roles archived) ·
R-014 invite e-mail confirmation · R-015 two migration owners in wave 2 · R-016 assigning a driver keeps the customer's link ·
R-017 notification cron via pg_cron, not Vercel · earlier: R-001..R-011.

## Lessons (docs/LESSONS.md)

L-001 Playwright browser path in cloud containers · L-002 Supabase connector cancels destructive SQL (recurred in P5) ·
L-003 `browser.newContext()` inherits storageState.

## Known follow-ups

- Repo-wide eslint has 2 `react-hooks/set-state-in-effect` errors in `src/features/job-link/job-client.ts` (lint is not a gate here).
- Each E2E run adds test rows and one identical pricing version to the live database — move E2E to a Supabase branch before going live.
- A role with `commission.manage` but not `pricing.manage` cannot reach the ค่าน้ำ tab (it lives under กฎราคา).
