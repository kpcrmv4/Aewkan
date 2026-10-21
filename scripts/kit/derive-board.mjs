#!/usr/bin/env node
/**
 * derive-board.mjs — compute worker status from git (and `gh`, when present).
 *
 * Status is NEVER stored. WORKERS.md holds durable facts only; everything you
 * see here is recomputed at read time. A stale board is worse than no board.
 *
 * CLI:   node derive-board.mjs [projectDir] [--json] [--workers WORKERS.md]
 * Lib:   import { deriveProject } from './derive-board.mjs'
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changedFiles, overlaps, parseSet } from './verify-write-set.mjs';

const IDLE_MINUTES = 45;

function git(dir, args, { timeout = 8000 } = {}) {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
function gitOk(dir, args) {
  try {
    execFileSync('git', args, { cwd: dir, timeout: 8000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
/**
 * `git merge-tree --write-tree` exits 1 on conflict, so the exit code IS the
 * answer — a non-zero exit is not an error here. Returns null on a git older
 * than 2.38, which simply means "unknown", never "clean".
 */
function mergeConflict(dir, base, ref) {
  const r = spawnSync('git', ['merge-tree', '--write-tree', base, ref],
    { cwd: dir, encoding: 'utf8', timeout: 10000 });
  if (r.error || r.status === null) return null;
  if (r.status === 0) return false;
  if (r.status === 1) return true;
  return null;
}

function gh(dir, args, { timeout = 12000 } = {}) {
  try {
    return execFileSync('gh', args, { cwd: dir, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Parse the durable-facts table out of WORKERS.md. No status column exists, by design. */
export function parseWorkers(text) {
  const rows = [];
  let inTable = false;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) { inTable = false; continue; }
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (/^\s*ID\s*$/i.test(cells[0] || '')) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^:?-{2,}/.test(cells[0] || '')) continue;
    const [id, branch, closes, writeSet, gate, push, model] = cells;
    if (!id || !branch) continue;
    rows.push({
      id,
      branch: branch.replace(/`/g, ''),
      closes: (closes || '').split(/[,\s]+/).filter(Boolean),
      writeSet: (writeSet || '').replace(/`/g, ''),
      gate: (gate || '').replace(/`/g, ''),
      push: /^y/i.test(push || ''),
      model: (model || '').replace(/`/g, '') || null,
    });
  }
  return rows;
}

function readMeta(text) {
  const base = text.match(/^Base branch:\s*`?([^\s`]+)`?/m);
  const remote = text.match(/^Remote:\s*`?([^\s`]+)`?/m);
  return { base: base ? base[1] : 'main', remote: remote ? remote[1] : 'origin' };
}

function worktreeMap(dir) {
  const out = git(dir, ['worktree', 'list', '--porcelain']) || '';
  const map = {};
  let path = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    else if (line.startsWith('branch ')) map[line.slice(7).replace('refs/heads/', '')] = path;
  }
  return map;
}

function prFacts(dir, branch) {
  const raw = gh(dir, ['pr', 'view', branch, '--json',
    'number,url,state,isDraft,mergeable,reviewDecision,statusCheckRollup']);
  if (!raw) return null;
  let pr;
  try { pr = JSON.parse(raw); } catch { return null; }
  const checks = pr.statusCheckRollup || [];
  const norm = checks.map((c) => (c.conclusion || c.state || '').toUpperCase());
  const failed = norm.filter((s) => ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ERROR', 'ACTION_REQUIRED'].includes(s));
  const pending = norm.filter((s) => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'EXPECTED', ''].includes(s));
  return {
    number: pr.number,
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision,
    ci: failed.length ? 'failing' : pending.length ? 'pending' : norm.length ? 'passing' : 'none',
    failingChecks: checks
      .filter((c) => ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ERROR', 'ACTION_REQUIRED'].includes((c.conclusion || c.state || '').toUpperCase()))
      .map((c) => c.name || c.context)
      .filter(Boolean),
  };
}

/**
 * Precedence matters and is deliberate: terminal state first, then things that
 * need a human, then the pipeline, then activity. A failed probe is not proof
 * of death — a worker with no recent commit is idle, never done.
 */
function deriveStatus(w) {
  if (w.merged) return { key: 'merged', column: 'merged', label: 'merged' };
  if (!w.branchExists) return { key: 'not-started', column: 'working', label: 'not started' };
  if (w.conflict || w.pr?.mergeable === 'CONFLICTING') return { key: 'merge-conflict', column: 'needs-you', label: 'merge conflict' };
  if (w.pr?.ci === 'failing') return { key: 'ci-failed', column: 'needs-you', label: 'CI failing' };
  if (w.pr?.reviewDecision === 'CHANGES_REQUESTED') return { key: 'changes-requested', column: 'needs-you', label: 'changes requested' };
  if (w.pr && w.pr.state === 'OPEN') {
    if (w.pr.isDraft || w.pr.ci === 'pending') return { key: 'in-review', column: 'in-review', label: w.pr.isDraft ? 'draft PR' : 'checks running' };
    if (w.pr.reviewDecision === 'APPROVED' || w.pr.mergeable === 'MERGEABLE') return { key: 'ready-to-merge', column: 'ready-to-merge', label: 'ready to merge' };
    return { key: 'in-review', column: 'in-review', label: 'in review' };
  }
  if (w.idleMinutes !== null && w.idleMinutes > IDLE_MINUTES) return { key: 'idle', column: 'needs-you', label: `idle ${Math.round(w.idleMinutes)}m` };
  return { key: 'working', column: 'working', label: 'working' };
}

/** Commits per day over the last `days` days, across the base and every worker branch. */
function activity(dir, refs, days = 14) {
  const out = git(dir, ['log', `--since=${days}.days`, '--date=short', '--pretty=%cd', '--no-merges', ...refs]);
  const counts = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    counts[d] = 0;
  }
  for (const d of (out || '').split('\n').filter(Boolean)) if (d in counts) counts[d]++;
  return Object.entries(counts).map(([date, commits]) => ({ date, commits }));
}

/**
 * Progress, and only what an artifact can back.
 * Structural: merged workers / declared workers — pure git.
 * Rows: rows closed by MERGED workers, over the plan's total when a TEST-PLAN.md
 * exists, else over the rows this run declared. Rows on unmerged branches are not
 * progress; a row is not "done" because someone is working on it.
 */
function progressOf(root, workers, crossRows) {
  const declared = new Set();
  const merged = new Set();
  for (const w of workers) for (const r of w.closes) {
    declared.add(r);
    if (w.merged) merged.add(r);
  }
  for (const r of crossRows) declared.add(r);

  let planRows = null, planFile = null;
  for (const f of ['TEST-PLAN.md', 'docs/TEST-PLAN.md', 'docs/test-plan.md']) {
    if (existsSync(join(root, f))) {
      const ids = new Set((readFileSync(join(root, f), 'utf8').match(/\bAC-\d+\b/g) || []));
      if (ids.size) { planRows = ids.size; planFile = f; }
      break;
    }
  }
  return {
    workersTotal: workers.length,
    workersMerged: workers.filter((w) => w.merged).length,
    rowsDeclared: declared.size,
    rowsMerged: merged.size,
    crossWorkerRows: crossRows.length,
    planRows, planFile,
  };
}

/** Row IDs the orchestrator owns at the merge gate — no worker may tick them. */
function crossWorkerRows(text) {
  const m = text.match(/##\s*Rows the workers may NOT tick[\s\S]*?(?=\n##\s|$)/i);
  return m ? [...new Set(m[0].match(/\bAC-\d+\b/g) || [])] : [];
}

export function deriveProject({ name, dir, workersFile = 'WORKERS.md', base, usePr = true }) {
  const root = resolve(dir);
  const project = { name: name || root.split('/').pop(), dir: root, derivedAt: new Date().toISOString() };

  if (!existsSync(join(root, '.git')) && !git(root, ['rev-parse', '--git-dir'])) {
    return { ...project, error: 'not a git repository', workers: [] };
  }
  const wf = join(root, workersFile);
  if (!existsSync(wf)) return { ...project, error: `${workersFile} not found`, workers: [] };

  const text = readFileSync(wf, 'utf8');
  const meta = readMeta(text);
  const baseBranch = base || meta.base;
  const wts = worktreeMap(root);

  const workers = parseWorkers(text).map((row) => {
    const b = row.branch;
    const branchExists = gitOk(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]) ||
      gitOk(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/${meta.remote}/${b}`]);
    const ref = gitOk(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]) ? b : `${meta.remote}/${b}`;

    const w = { ...row, branchExists, worktree: wts[b] || null, base: baseBranch };

    if (branchExists) {
      const log = git(root, ['log', '-1', '--format=%h%x1f%cI%x1f%s', ref]);
      if (log) {
        const [sha, iso, subject] = log.split('\x1f');
        w.lastCommit = { sha, at: iso, subject };
        w.idleMinutes = (Date.now() - new Date(iso).getTime()) / 60000;
      } else w.idleMinutes = null;

      const counts = git(root, ['rev-list', '--left-right', '--count', `${baseBranch}...${ref}`]);
      if (counts) {
        const [behind, ahead] = counts.split(/\s+/).map(Number);
        w.ahead = ahead; w.behind = behind;
      }
      w.merged = gitOk(root, ['merge-base', '--is-ancestor', ref, baseBranch]);
      w.conflict = w.merged ? false : mergeConflict(root, baseBranch, ref);

      if (w.worktree) {
        const dirty = git(w.worktree, ['status', '--porcelain']);
        w.dirtyFiles = dirty ? dirty.split('\n').filter(Boolean).length : 0;
      }
      if (usePr) w.pr = prFacts(root, b);
    } else {
      w.idleMinutes = null;
    }

    w.status = deriveStatus(w);
    return w;
  });

  // Predicted collisions: two unmerged workers that changed the same file, or
  // that declare the same write-set glob. Found here, while both branches are
  // still cheap to re-split, instead of at the merge gate as a conflict on logic.
  const live = workers.filter((w) => w.branchExists && !w.merged).map((w) => ({
    id: w.id, writeSet: parseSet(w.writeSet),
    files: changedFiles(root, baseBranch, gitOk(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${w.branch}`]) ? w.branch : `${meta.remote}/${w.branch}`, { includeWorktree: false }),
  }));
  const overlapList = overlaps(live);
  for (const w of workers) {
    w.overlaps = overlapList.filter((o) => o.a === w.id || o.b === w.id).map((o) => ({ with: o.a === w.id ? o.b : o.a, files: o.files || [], declared: o.declared || [] }));
    if (w.overlaps.length && !w.merged && w.branchExists && !['merge-conflict', 'ci-failed'].includes(w.status.key)) {
      w.status = { key: 'overlap', column: 'needs-you', label: `overlaps ${w.overlaps.map((o) => o.with).join(', ')}` };
    }
  }

  const columns = { working: [], 'needs-you': [], 'in-review': [], 'ready-to-merge': [], merged: [] };
  for (const w of workers) columns[w.status.column].push(w.id);

  const refs = [baseBranch, ...workers.filter((w) => w.branchExists).map((w) => w.branch)];
  return {
    ...project,
    base: baseBranch,
    workers,
    counts: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v.length])),
    progress: progressOf(root, workers, crossWorkerRows(text)),
    overlaps: overlapList,
    activity: activity(root, refs),
  };
}

// ---- CLI ----------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const wfIdx = args.indexOf('--workers');
  const workersFile = wfIdx > -1 ? args[wfIdx + 1] : 'WORKERS.md';
  const dir = args.find((a) => !a.startsWith('--') && a !== workersFile) || process.cwd();

  const board = deriveProject({ dir, workersFile, usePr: !args.includes('--no-pr') });
  if (json) { console.log(JSON.stringify(board, null, 2)); process.exit(0); }

  if (board.error) { console.error(`${board.name}: ${board.error}`); process.exit(1); }
  const icon = { working: '·', 'needs-you': '!', 'in-review': '?', 'ready-to-merge': '+', merged: '✓' };
  console.log(`\n${board.name}  (base ${board.base})  derived ${board.derivedAt}\n`);
  for (const col of ['needs-you', 'working', 'in-review', 'ready-to-merge', 'merged']) {
    const rows = board.workers.filter((w) => w.status.column === col);
    if (!rows.length) continue;
    console.log(`${col.toUpperCase()}`);
    for (const w of rows) {
      const pr = w.pr ? ` PR#${w.pr.number} ci:${w.pr.ci}` : '';
      const pos = w.ahead != null ? ` +${w.ahead}/-${w.behind}` : '';
      console.log(`  ${icon[col]} ${w.id.padEnd(4)} ${w.branch}${pos}${pr}  — ${w.status.label}`);
      if (w.lastCommit) console.log(`       ${w.lastCommit.sha} ${w.lastCommit.subject}`);
      if (w.pr?.failingChecks?.length) console.log(`       failing: ${w.pr.failingChecks.join(', ')}`);
    }
    console.log('');
  }
  const n = board.counts['needs-you'];
  console.log(n ? `${n} item(s) need you.\n` : 'Nothing needs you.\n');
}
