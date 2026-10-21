# Workers — durable facts only

> No status column: status is derived from git (`derive-board.mjs`) and `.loop/state.json`.

Base branch: `ccr-5e60b244-69x519`
Remote: `origin` (workers never push; the orchestrator merges and pushes)
Mode: `รุม` · max workers: `3` · collapse trigger below
Full-suite gate (orchestrator only, at the merge gate): `npx playwright test`
Overlap check (orchestrator, before every merge): `node scripts/kit/verify-write-set.mjs --all --workers WORKERS.md --base ccr-5e60b244-69x519`

## Phase 0 — landed on the base branch before the fan-out

- [x] migrations + RLS + grants + types — `supabase/migrations/*`, `src/lib/database.types.ts`
- [x] pricing engine — `src/lib/pricing/**` (read-only for workers)
- [x] API contracts — `src/lib/contracts/**` (read-only for workers)
- [x] route skeleton — `src/app/(public)/**`, `src/app/admin/(shell)/*/page.tsx` placeholders
- [x] shared copy — `src/lib/copy/common.ts` · tokens `src/app/globals.css` · kit UI `src/components/ui/*`
- [x] `package.json` + lockfile — every dependency the wave needs is installed
- [x] `src/proxy.ts` — gates `/admin/*` only

## Workers — wave 1

| ID | Branch | Closes rows | Write set | Gate | Push | Model / effort | Shape · read |
|----|--------|-------------|-----------|------|------|----------------|--------------|
| A | `feat/p1-trip-builder` | P1-* in docs/test-plan/P1.md | `src/app/(public)/page.tsx`, `src/app/(public)/trip-builder-placeholder.tsx`, `src/features/trip-builder/**`, `src/app/api/bookings/**`, `src/lib/copy/trip.ts`, `tests/e2e/p1-*`, `tests/unit/p1-*`, `docs/test-plan/P1.md` | `npm run typecheck && node scripts/kit/verify-write-set.mjs --worker A --workers WORKERS.md --base ccr-5e60b244-69x519` | no | `claude-sonnet-5-5` / medium — UI on a tested pricing lib; tsc/build/spec gate it | subagent+worktree · CLAUDE.md, DESIGN.md, demo.html (trip builder), contracts/booking.ts, `nextjs-supabase-ssr-auth` route adapter |
| B | `feat/p2-admin-ops` | P2-01..04 in docs/test-plan/P2.md | `src/app/admin/(shell)/jobs/**`, `src/app/admin/(shell)/quotes/**`, `src/app/admin/(shell)/assign/**`, `src/app/admin/(shell)/drivers/**`, `src/features/admin-ops/**`, `src/app/api/admin/quotes/**`, `src/app/api/admin/assign/**`, `src/app/api/admin/bookings/**`, `src/app/api/admin/drivers/**`, `src/lib/copy/admin.ts`, `tests/e2e/p2-*`, `tests/unit/p2-*`, `docs/test-plan/P2.md` | `npm run typecheck && node scripts/kit/verify-write-set.mjs --worker B --workers WORKERS.md --base ccr-5e60b244-69x519` | no | `claude-sonnet-5-5` / medium — CRUD and lists under RLS already written in P0 | subagent+worktree · CLAUDE.md, DESIGN.md, demo.html (admin), contracts/admin.ts, `thai-admin-page-kit`, `supabase-large-data` |
| C | `feat/p3-job-link` | P3-* in docs/test-plan/P3.md | `src/app/(public)/j/**`, `src/features/job-link/**`, `src/app/api/jobs/**`, `src/lib/copy/job.ts`, `tests/e2e/p3-*`, `tests/unit/p3-*`, `docs/test-plan/P3.md` | `npm run typecheck && node scripts/kit/verify-write-set.mjs --worker C --workers WORKERS.md --base ccr-5e60b244-69x519` | no | `claude-sonnet-5-5` / medium — views over contracts/job.ts; tsc/build/spec gate it | subagent+worktree · CLAUDE.md, DESIGN.md, demo.html (job link), contracts/job.ts |

Every worker keeps `.loop/changes.jsonl` lines in its own commits (task, rows, files, should_assert, unsure).

## Rows the workers may NOT tick

| Row | Why it is cross-worker |
|-----|------------------------|
| X-01 | booking from P1 appears in P2 jobs list with the same total |
| X-02 | assign in P2 produces a driver link that P3 opens in driver view |
| X-03 | return booking from P3 appears in P2 as a linked job |

## Rulings

Recorded in `docs/RULINGS.md` (R-001 … R-010).

## Collapse trigger

Collapse to Tier 1 when two workers report the same file outside their write set, when
`verify-write-set --all` shows any overlap, or when the merge gate needs more than two
fix rounds for one worker.
