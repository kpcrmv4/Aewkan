#!/usr/bin/env node
/**
 * verify-write-set.mjs — a worker's write set is a promise; this makes it a gate.
 *
 * WORKERS.md declares, per worker, the files it may touch. Nothing enforced
 * that: two workers each "knew" their set and both edited the shared RPC, and
 * the collision surfaced at the merge gate as the most expensive kind of
 * conflict — both sides changed the same logic. This script turns the table
 * into a check that goes red in the worker's own quick gate, before the push.
 *
 *   node verify-write-set.mjs --worker W1 [--workers ../WORKERS.md] [--base main]
 *       run inside the worker's worktree: every file changed on this branch
 *       since the base must match the worker's write-set globs, and none of
 *       the single-owner paths (migrations, tokens, proxy/middleware, the
 *       lockfile) may appear unless the write set names them explicitly.
 *
 *   node verify-write-set.mjs --all [--workers WORKERS.md] [--base main]
 *       run from the base checkout: every declared worker branch is diffed
 *       against the base and the pairwise intersections are printed — the
 *       collision the merge gate would otherwise find, found while both
 *       branches are still cheap to re-split.
 *
 *   node verify-write-set.mjs --self-test
 *
 * Globs: `**` any depth · `*` within one segment · everything else literal.
 * A set is comma-separated in the table cell (backticks tolerated).
 * Exit 0 = clean · 1 = a file outside the set, a shared path, or an overlap.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkers } from './derive-board.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Paths that have exactly one owner per run (kp-work-routing, "What must never run in parallel"). */
export const SINGLE_OWNER = [
  { glob: 'supabase/migrations/**', why: 'migrations — one owner per run; they conflict on order, not on text' },
  { glob: '**/tokens.css', why: 'design tokens — land the token change first, alone' },
  { glob: 'app/globals.css', why: 'design tokens — land the token change first, alone' },
  { glob: 'proxy.ts', why: 'auth gate — one owner, always' },
  { glob: 'middleware.ts', why: 'auth gate — one owner, always' },
  { glob: 'src/proxy.ts', why: 'auth gate — one owner, always' },
  { glob: 'src/middleware.ts', why: 'auth gate — one owner, always' },
  { glob: 'package.json', why: 'a lockfile merge is a regeneration, not a resolution' },
  { glob: 'package-lock.json', why: 'a lockfile merge is a regeneration, not a resolution' },
  { glob: 'pnpm-lock.yaml', why: 'a lockfile merge is a regeneration, not a resolution' },
];

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more directories; a trailing `**` matches the rest
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if ('.+?^${}()|[]\\'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  return new RegExp('^' + re + '$');
}

export function parseSet(cell) {
  return String(cell || '').replace(/`/g, '').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}

export function matchesAny(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}

function git(dir, args) {
  try { return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

export function changedFiles(dir, base, ref = 'HEAD', { includeWorktree = true } = {}) {
  const committed = git(dir, ['diff', '--name-only', `${base}...${ref}`]) || '';
  const staged = includeWorktree ? (git(dir, ['diff', '--name-only', 'HEAD']) || '') : '';
  const untracked = includeWorktree ? (git(dir, ['ls-files', '--others', '--exclude-standard']) || '') : '';
  return [...new Set([committed, staged, untracked].join('\n').split('\n').map((s) => s.trim()).filter(Boolean))].sort();
}

/** One worker, one checkout: files outside its set, and shared paths it did not declare. */
export function checkWorker(files, writeSet) {
  const outside = files.filter((f) => !matchesAny(f, writeSet));
  const shared = files
    .map((f) => ({ f, rule: SINGLE_OWNER.find((r) => globToRegExp(r.glob).test(f)) }))
    .filter((x) => x.rule && !writeSet.some((g) => g === x.f || g === x.rule.glob));
  return { outside, shared };
}

/** All workers, one base checkout: predicted collisions before the merge gate. */
export function overlaps(workers) {
  const out = [];
  for (let i = 0; i < workers.length; i++) for (let j = i + 1; j < workers.length; j++) {
    const a = workers[i], b = workers[j];
    const files = a.files.filter((f) => b.files.includes(f));
    if (files.length) out.push({ a: a.id, b: b.id, files });
    const declared = a.writeSet.filter((g) => b.writeSet.some((h) => h === g));
    if (declared.length) out.push({ a: a.id, b: b.id, declared });
  }
  return out;
}

// ---------- self-test ---------------------------------------------------------

function sh(dir, args) { return execFileSync('git', args, { cwd: dir, stdio: 'ignore' }); }

function selfTest() {
  let failed = 0;
  const t = (name, ok, detail = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' — ' + detail}`); if (!ok) failed++; };

  // glob semantics
  t('** matches any depth', matchesAny('app/(app)/stock/[id]/page.tsx', ['app/(app)/stock/**']));
  t('** does not leak across siblings', !matchesAny('app/(app)/orders/page.tsx', ['app/(app)/stock/**']));
  t('* stays inside one segment', matchesAny('lib/stock/alerts.ts', ['lib/stock/*.ts']) && !matchesAny('lib/stock/x/alerts.ts', ['lib/stock/*.ts']));
  t('literal path', matchesAny('lib/copy.ts', ['lib/copy.ts']) && !matchesAny('lib/copy.tsx', ['lib/copy.ts']));
  t('parens and brackets are literal', matchesAny('app/(app)/[org]/page.tsx', ['app/(app)/[org]/**']));

  // worker check
  const r = checkWorker(['app/(app)/stock/page.tsx', 'lib/pdf/x.ts', 'supabase/migrations/2026_x.sql', 'package-lock.json'], ['app/(app)/stock/**']);
  t('file outside the set is reported', r.outside.includes('lib/pdf/x.ts'));
  t('migration is reported as shared even if outside', r.shared.some((x) => x.f.startsWith('supabase/migrations/')));
  t('lockfile is reported as shared', r.shared.some((x) => x.f === 'package-lock.json'));
  const r2 = checkWorker(['supabase/migrations/2026_x.sql'], ['supabase/migrations/**']);
  t('a declared single-owner path is allowed for its owner', r2.outside.length === 0 && r2.shared.length === 0);

  // overlaps
  const o = overlaps([
    { id: 'W1', files: ['lib/shared/rpc.ts', 'app/a.tsx'], writeSet: ['app/a/**', 'lib/shared/**'] },
    { id: 'W2', files: ['lib/shared/rpc.ts', 'app/b.tsx'], writeSet: ['app/b/**', 'lib/shared/**'] },
    { id: 'W3', files: ['app/c.tsx'], writeSet: ['app/c/**'] },
  ]);
  t('overlap on a changed file is found', o.some((x) => x.files && x.files.includes('lib/shared/rpc.ts')));
  t('overlap in declared sets is found', o.some((x) => x.declared && x.declared.includes('lib/shared/**')));
  t('disjoint workers do not overlap', !o.some((x) => x.a === 'W3' || x.b === 'W3'));

  // a throwaway repo, end to end
  const dir = mkdtempSync(join(tmpdir(), 'kp-ws-'));
  try {
    sh(dir, ['init', '-q', '-b', 'main']);
    sh(dir, ['config', 'user.email', 't@t']); sh(dir, ['config', 'user.name', 't']);
    mkdirSync(join(dir, 'app', 'stock'), { recursive: true }); mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'app', 'stock', 'page.tsx'), 'a'); writeFileSync(join(dir, 'lib', 'x.ts'), 'a');
    writeFileSync(join(dir, 'WORKERS.md'), `Base branch: \`main\`\n\n| ID | Branch | Closes rows | Write set | Gate | Push | Model / effort |\n|----|--------|---|---|---|---|---|\n| W1 | \`feat/stock\` | AC-1 | \`app/stock/**\` | tsc | yes | x |\n`);
    sh(dir, ['add', '-A']); sh(dir, ['commit', '-q', '-m', 'base']);
    sh(dir, ['checkout', '-q', '-b', 'feat/stock']);
    writeFileSync(join(dir, 'app', 'stock', 'page.tsx'), 'b'); writeFileSync(join(dir, 'lib', 'x.ts'), 'b');
    sh(dir, ['commit', '-q', '-am', 'w1']);
    const files = changedFiles(dir, 'main');
    const res = checkWorker(files, parseSet('`app/stock/**`'));
    t('end to end: lib/x.ts is outside W1\'s set', res.outside.length === 1 && res.outside[0] === 'lib/x.ts', JSON.stringify(res));
    writeFileSync(join(dir, 'lib', 'y.ts'), 'new');
    t('end to end: an uncommitted new file counts too', changedFiles(dir, 'main').includes('lib/y.ts'));
  } finally { rmSync(dir, { recursive: true, force: true }); }

  console.log(failed ? `\n${failed} self-test case(s) failed` : '\nall self-test cases passed');
  process.exit(failed ? 1 : 0);
}

// ---------- cli --------------------------------------------------------------------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (f, d) => { const i = args.indexOf(f); return i > -1 && args[i + 1] ? args[i + 1] : d; };
  if (args.includes('--self-test')) selfTest();
  const workersFile = opt('--workers', existsSync('WORKERS.md') ? 'WORKERS.md' : '../WORKERS.md');
  if (!existsSync(workersFile)) { console.error(`no ${workersFile} — pass --workers <path>`); process.exit(1); }
  const text = readFileSync(workersFile, 'utf8');
  const base = opt('--base', (text.match(/^Base branch:\s*`?([^\s`]+)`?/m) || [])[1] || 'main');
  const workers = parseWorkers(text);
  const json = args.includes('--json');

  if (args.includes('--all')) {
    const root = process.cwd();
    const rows = workers.map((w) => {
      const ref = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${w.branch}`]) ? w.branch : null;
      return { id: w.id, branch: w.branch, writeSet: parseSet(w.writeSet), files: ref ? changedFiles(root, base, ref, { includeWorktree: false }) : [] };
    });
    const o = overlaps(rows);
    if (json) console.log(JSON.stringify({ base, workers: rows, overlaps: o }, null, 2));
    else {
      for (const r of rows) console.log(`${r.id} ${r.branch}: ${r.files.length} file(s) changed since ${base}`);
      for (const x of o) console.log(`❌ ${x.a} ↔ ${x.b} ${x.files ? 'both changed: ' + x.files.join(', ') : 'both declare: ' + x.declared.join(', ')}`);
      console.log(o.length ? `\n${o.length} overlap(s) — the split was wrong; collapse or re-split before the merge gate` : `✅ no overlap between ${rows.length} workers`);
    }
    process.exit(o.length ? 1 : 0);
  }

  const id = opt('--worker', null);
  const w = id ? workers.find((x) => x.id === id) : null;
  if (!w) { console.error(`--worker <ID> required (one of: ${workers.map((x) => x.id).join(', ') || 'none in table'})`); process.exit(1); }
  const set = parseSet(w.writeSet);
  const files = changedFiles(process.cwd(), base);
  const { outside, shared } = checkWorker(files, set);
  if (json) console.log(JSON.stringify({ worker: w.id, base, writeSet: set, files, outside, shared }, null, 2));
  else {
    for (const f of outside) console.log(`❌ ${f} — outside ${w.id}'s write set (${set.join(', ')})`);
    for (const { f, rule } of shared) console.log(`❌ ${f} — single-owner path: ${rule.why}; if ${w.id} owns it this run, name it in the write set, otherwise it belongs in Phase 0`);
    console.log(outside.length || shared.length ? `\n${outside.length + shared.length} problem(s) in ${files.length} changed file(s)` : `✅ ${w.id}: ${files.length} changed file(s), all inside the write set`);
  }
  process.exit(outside.length || shared.length ? 1 : 0);
}
