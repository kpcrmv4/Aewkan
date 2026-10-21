#!/usr/bin/env node
/**
 * verify-ts-hygiene — the two things `strict: true` does not tell you.
 *
 * TS-01  Escape-hatch census.
 *        Banning `any` is the advice everyone gives, and it leaves four other
 *        doors open: `as never`, `as unknown as X`, `@ts-ignore`, and
 *        `@ts-expect-error`. This repo has zero `any` and three `as never` —
 *        and CLAUDE.md Trap #9 is a production bug caused by exactly one of
 *        those: a Buffer cast to string to quiet @react-pdf, which then died at
 *        render with `dataUrl.substring is not a function`. The types were
 *        right. The cast was the bug.
 *
 *        Known casts are listed in DEBT with a reason, and the check is a
 *        ratchet: a new one fails, and a DEBT entry that no longer matches
 *        anything also fails, so the list cannot quietly outlive the code.
 *
 * TS-02  `strict` is only as strong as what it checks against.
 *        `lib/database.types.ts` was a 58-line stub — enums, no tables, no
 *        functions — for twelve phases. tsconfig was maximally strict the whole
 *        time and the entire data layer was unchecked: `tsc` could not tell a
 *        real column from a typo, a live RPC from a deleted one, or a nullable
 *        field from a required one. Generating the real file surfaced 102
 *        errors, every one of them genuine.
 *
 * Copy into scripts/ and edit DEBT / PATTERN_DEBT to match the project. The
 * point is not the specific casts listed here — it is that the register exists,
 * every entry carries a reason, and both directions fail: a new hatch, and an
 * entry that no longer matches anything.
 *
 * Usage:  node scripts/verify-ts-hygiene.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

// ---------------------------------------------------------------------------
// TS-01 — escape-hatch census
// ---------------------------------------------------------------------------

/**
 * Casts that exist today, each with why it is still here. Paying one off means
 * deleting its entry; the check fails if an entry stops matching, so the list
 * is a debt register rather than a permanent amnesty.
 */
const DEBT = [
  {
    file: 'app/(org)/settings/rooms/page.tsx',
    snippet: 'building={property as never}',
    why: 'the row shape from the query has drifted from RoomsSettings\' prop type',
  },
  {
    file: 'components/settings/rates-form.tsx',
    snippet: 'set(key, Number(e.target.value) as never)',
    why: '`num` widens the key to all of PropertySettings, so the value type becomes a union — needs a NumericKey helper',
  },
  {
    file: 'components/settings/rates-form.tsx',
    snippet: 'electricity_tiers: form.electricity_tiers as never',
    why: 'the tier array is not assignable to the generated `Json` union',
  },
];

/**
 * Debt that is one decision repeated, not one site. Counted rather than listed,
 * because 74 entries would be a wall nobody reads — and because the number
 * going *down* is the only progress worth tracking.
 *
 * `as unknown as XRow[]`: every query with a PostgREST embed discards the
 * generated row type and substitutes a hand-written interface. TS-02 below is
 * green — the types are real — and these 74 sites opt out of them anyway. If a
 * `.select()` stops fetching a column the interface still promises, nothing
 * here notices; it is Trap #31 wearing a different hat. Unwinding it needs the
 * embed types themselves, not a sweep of casts.
 */
const PATTERN_DEBT = [
  {
    name: 'as unknown as',
    max: 74,
    why: 'embed queries substitute a hand-written row interface for the generated one',
  },
];

const HATCHES = [
  { name: 'any', re: /(?:[:<,|&(]\s*any\b|\bas\s+any\b|\bany\s*\[\])/ },
  { name: 'as never', re: /\bas\s+never\b/ },
  { name: 'as unknown as', re: /\bas\s+unknown\s+as\b/ },
  { name: '@ts-ignore', re: /@ts-ignore/ },
  { name: '@ts-expect-error', re: /@ts-expect-error/ },
];

/**
 * Directories in, extensions filtered here — NOT `lib/**\/*.ts` as a pathspec.
 * That glob silently skips the 23 files sitting directly in `lib/`, so the first
 * run of this check reported a clean 72 while a stray cast planted in
 * `lib/cn.ts` went unseen. An inventory that decides membership with a glob is
 * blind to whatever the glob's shape excludes, and says nothing about it —
 * the same way an audit keyed on `route.ts` never saw four `route.tsx` files.
 */
const files = execSync('git ls-files app lib components', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

/**
 * Comments are stripped before searching. A file that explains in prose why it
 * avoids `any` would otherwise be reported for containing the word — the same
 * failure that made an earlier check go red exactly when the code became
 * right, which is how checks get deleted.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const found = [];
for (const file of files) {
  const src = stripComments(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    for (const h of HATCHES) {
      if (h.re.test(line)) found.push({ file, line: i + 1, name: h.name, text: line.trim() });
    }
  });
}

const matchesDebt = (f) =>
  DEBT.some((d) => d.file === f.file && f.text.includes(d.snippet));

const patternNames = new Set(PATTERN_DEBT.map((p) => p.name));
const undeclared = found.filter((f) => !matchesDebt(f) && !patternNames.has(f.name));

for (const p of PATTERN_DEBT) {
  const n = found.filter((f) => f.name === p.name).length;
  check(
    `TS-01 \`${p.name}\` has not spread further`,
    n <= p.max,
    n <= p.max
      ? `${n}/${p.max} — ${p.why}${n < p.max ? ' (lower `max` to lock the win in)' : ''}`
      : `${n} sites, up from ${p.max} — ${p.why}`,
  );
}
const stale = DEBT.filter(
  (d) => !found.some((f) => f.file === d.file && f.text.includes(d.snippet)),
);

check(
  'TS-01 no undeclared type escape hatch',
  undeclared.length === 0,
  undeclared.length === 0
    ? `${found.length} total, all ${DEBT.length} declared in DEBT`
    : undeclared.map((f) => `${f.file}:${f.line} ${f.name}`).join(' · '),
);

check(
  'TS-01 the DEBT register still describes real code',
  stale.length === 0,
  stale.length === 0 ? 'no stale entries' : stale.map((d) => `${d.file}: ${d.snippet}`).join(' · '),
);

if (DEBT.length > 0) {
  console.log(`   ↳ ${DEBT.length} cast(s) outstanding:`);
  for (const d of DEBT) console.log(`     · ${d.file} — ${d.why}`);
}

// ---------------------------------------------------------------------------
// TS-02 — the generated types are real
// ---------------------------------------------------------------------------
const types = readFileSync('lib/database.types.ts', 'utf8');
const tables = [...types.matchAll(/^ {6}(\w+): \{\n {8}Row: \{/gm)].length;
const hasFunctions = /Functions: \{\n {6}\w+:/.test(types);

check(
  'TS-02 database.types.ts declares real tables',
  tables >= 20,
  `${tables} tables with a Row type` +
    (tables < 20 ? ' — a stub makes every .from() unchecked while tsc stays green' : ''),
);
check(
  'TS-02 …and the RPC signatures with them',
  hasFunctions,
  hasFunctions ? 'Functions block present' : 'no Functions — every .rpc() call is unchecked',
);

console.log(failures === 0 ? '\nTS HYGIENE CLEAN' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
