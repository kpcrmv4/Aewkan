#!/usr/bin/env node
/**
 * progress.mjs — a progress page for a `/loop` run that costs the agent
 * nothing to keep current.
 *
 * The loop already flushes `.loop/state.json` at the end of every iteration
 * (kp-autonomous-loop invariant 3). This script turns that file + git into
 * `docs/progress/state.js`, which `docs/progress/index.html` loads with a
 * plain <script src> — so the page works from file:// with no server, no
 * dependencies, and no HTML ever written by the agent.
 *
 *   node progress.mjs --init            # copy progress.html → docs/progress/index.html once
 *   node progress.mjs                   # derive once (the loop runs this in iteration step 5)
 *   node progress.mjs --watch [sec]     # a human runs this in a spare terminal (VS Code's panel
 *                                       # works): re-derives every N s (default 15) and, when
 *                                       # stdout is a terminal, redraws a progress view in place —
 *                                       # then the loop spends 0 tokens on status
 *
 * Options: --state <path> (default .loop/state.json) · --out <dir> (default docs/progress)
 *          --tty (force the terminal view even when piped) · --no-tty (file only) · NO_COLOR honoured
 *
 * state.json shape (kept small on purpose — the agent writes this by hand):
 * {
 *   "project": "kp-crm",
 *   "run": { "status": "running|done|blocked|stopped", "iteration": 7, "budget": 12, "started": "2026-09-13T08:00+07:00",
 *            "batch": { "size": 6 } },
 *   "phases": [
 *     { "id": "P1", "name": "Scaffold + auth",
 *       "tasks": [ { "id": "P1-01", "name": "…", "status": "done|written|doing|todo|blocked", "reason": "" } ] }
 *   ]
 * }
 *
 * `written` = code committed with tsc green, not yet through the batch gate
 * (write sprint → verify sprint, LOOP.md §2). It is not progress: the overall
 * percentage counts `done` only, and the view shows how many tasks are waiting
 * for the batch to close so the owner can see unverified work pile up.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt; };
const has = (name) => args.includes(name);

const dir = resolve(process.cwd());
const statePath = resolve(dir, opt('--state', '.loop/state.json'));
const outDir = resolve(dir, opt('--out', 'docs/progress'));
const here = dirname(fileURLToPath(import.meta.url));

function git(a) {
  try { return execFileSync('git', a, { cwd: dir, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

function readState() {
  if (!existsSync(statePath)) return { error: `ไม่พบ ${statePath}` };
  try { return JSON.parse(readFileSync(statePath, 'utf8')); }
  catch (e) { return { error: `state.json อ่านไม่ได้: ${e.message}` }; }
}

export function derive() {
  const st = readState();
  const phases = Array.isArray(st.phases) ? st.phases : [];
  const count = { done: 0, written: 0, doing: 0, todo: 0, blocked: 0 };
  const out = phases.map((p) => {
    const tasks = Array.isArray(p.tasks) ? p.tasks : [];
    const c = { done: 0, written: 0, doing: 0, todo: 0, blocked: 0 };
    for (const t of tasks) { const s = c[t.status] !== undefined ? t.status : 'todo'; c[s]++; count[s]++; }
    return {
      id: p.id, name: p.name, total: tasks.length, ...c,
      pct: tasks.length ? Math.round((c.done / tasks.length) * 100) : 0,
      doing: tasks.filter((t) => t.status === 'doing').map((t) => `${t.id} ${t.name}`),
      blocked: tasks.filter((t) => t.status === 'blocked').map((t) => `${t.id} ${t.name}${t.reason ? ' — ' + t.reason : ''}`),
    };
  });
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  const run = st.run || {};
  const batchSize = run.batch && Number(run.batch.size) ? Number(run.batch.size) : null;
  const allDone = total > 0 && count.done === total;
  const status = st.error ? 'error' : allDone ? 'done' : (run.status || 'running');
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const last = git(['log', '-1', '--format=%h|%ct|%s']);
  const [hash, ts, ...subj] = last ? last.split('|') : [];
  const dirty = (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length;
  let stateMtime = null;
  try { stateMtime = statSync(statePath).mtimeMs; } catch {}
  return {
    project: st.project || dir.split(/[\\/]/).pop(),
    status, error: st.error || null,
    pct: total ? Math.round((count.done / total) * 100) : 0,
    total, ...count,
    run: { iteration: run.iteration ?? null, budget: run.budget ?? null, started: run.started ?? null, batchSize },
    phases: out,
    git: { branch, hash: hash || null, commitAt: ts ? Number(ts) * 1000 : null, subject: subj.join('|') || null, dirty },
    stateAt: stateMtime,
    generatedAt: Date.now(),
  };
}

function write() {
  mkdirSync(outDir, { recursive: true });
  const data = derive();
  writeFileSync(join(outDir, 'state.js'), `window.PROGRESS=${JSON.stringify(data)};\n`);
  return data;
}

// ── terminal view ─────────────────────────────────────────────────────────
const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || has('--tty'));
const c = (code, t) => (useColor ? `\x1b[${code}m${t}\x1b[0m` : t);
const COL = { done: '32', written: '36', doing: '33', blocked: '31', todo: '90', dim: '2', bold: '1', cyan: '36' };
const LABEL = { running: 'กำลังทำ', done: 'เสร็จแล้ว', blocked: 'ติดขัด', stopped: 'หยุด', error: 'อ่าน state ไม่ได้' };
const ago = (ms) => { if (!ms) return '—'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`; };

function bar(done, doing, blocked, total, width, written = 0) {
  if (!total) return c(COL.todo, '░'.repeat(width));
  const n = (x) => Math.round((x / total) * width);
  const d = n(done), wr = Math.min(n(written), width - d), g = Math.min(n(doing), width - d - wr), b = Math.min(n(blocked), width - d - wr - g);
  const rest = Math.max(0, width - d - wr - g - b);
  return c(COL.done, '█'.repeat(d)) + c(COL.written, '█'.repeat(wr)) + c(COL.doing, '█'.repeat(g)) + c(COL.blocked, '█'.repeat(b)) + c(COL.todo, '░'.repeat(rest));
}

export function renderTty(d) {
  const w = Math.min(60, Math.max(20, (process.stdout.columns || 80) - 22));
  const L = [];
  const statusCol = { running: COL.doing, done: COL.done, blocked: COL.blocked, error: COL.blocked, stopped: COL.dim }[d.status] || COL.dim;
  L.push(`${c(COL.bold, d.project)}  ${c(statusCol, LABEL[d.status] || d.status)}${d.run.iteration != null ? c(COL.dim, `  iteration ${d.run.iteration}${d.run.budget ? '/' + d.run.budget : ''}`) : ''}`);
  L.push(`${bar(d.done, d.doing, d.blocked, d.total, w, d.written)} ${c(COL.bold, String(d.pct).padStart(3) + '%')} ${c(COL.dim, `${d.done}/${d.total}`)}`);
  L.push(c(COL.dim, `เสร็จ ${d.done} · เขียนแล้วรอตรวจ ${d.written}${d.run.batchSize ? ` (ปิด batch ที่ ${d.run.batchSize})` : ''} · กำลังทำ ${d.doing} · ติด ${d.blocked} · รอ ${d.todo}`)
    + (d.run.batchSize && d.written >= d.run.batchSize ? c(COL.written, '  ← ถึงเวลา verify sprint') : ''));
  L.push('');
  const pw = Math.max(16, Math.floor(w / 2));
  for (const ph of d.phases) {
    const name = `${ph.id ? ph.id + ' ' : ''}${ph.name}`.slice(0, 28).padEnd(28);
    L.push(`${name} ${bar(ph.done, ph.doing.length, ph.blocked.length, ph.total, pw, ph.written)} ${String(ph.pct).padStart(3)}% ${c(COL.dim, `${ph.done}/${ph.total}${ph.written ? ' +' + ph.written + ' รอตรวจ' : ''}`)}`);
    for (const t of ph.doing) L.push(`  ${c(COL.doing, '▶ ' + t)}`);
    for (const t of ph.blocked) L.push(`  ${c(COL.blocked, '✕ ' + t)}`);
  }
  if (!d.phases.length) L.push(c(COL.dim, 'ยังไม่มีเฟสใน state.json'));
  L.push('');
  const g = d.git || {};
  L.push(c(COL.dim, `${g.branch || '—'} · ${g.hash ? `${g.hash} ${g.subject || ''} (${ago(g.commitAt)})` : 'ยังไม่มี commit'}${g.dirty ? ` · ค้าง ${g.dirty} ไฟล์` : ''}`));
  const staleMin = d.stateAt ? (Date.now() - d.stateAt) / 60000 : 0;
  L.push(c(COL.dim, `state อัปเดต ${ago(d.stateAt)}`) + (d.status === 'running' && staleMin > 45 ? c(COL.blocked, `  ← ไม่ขยับมา ${Math.round(staleMin)} นาที loop อาจหยุดไปแล้ว`) : ''));
  if (d.error) L.push(c(COL.blocked, d.error));
  if (d.status === 'done') L.push('', c(COL.done, `✓ เสร็จครบทุกงานแล้ว ${d.done}/${d.total} — ดูสรุปที่ docs/PHASE-SUMMARY.md หรือ run report`));
  return L.join('\n');
}

function draw(d, { clear }) {
  const out = renderTty(d);
  if (clear && process.stdout.isTTY) process.stdout.write('\x1b[H\x1b[2J');
  process.stdout.write(out + '\n');
}

function init() {
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, 'index.html');
  if (!existsSync(target)) copyFileSync(join(here, 'progress.html'), target);
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (has('--init')) console.log(`page: ${init()}`);
  const tty = has('--tty') || (has('--watch') && process.stdout.isTTY && !has('--no-tty'));
  const line = (d) => `${d.status} ${d.pct}% (${d.done}/${d.total})${d.written ? ` written ${d.written}` : ''}${d.blocked ? ` blocked ${d.blocked}` : ''}`;
  let d = write();
  if (tty) draw(d, { clear: has('--watch') }); else console.log(line(d));   // one line: what the loop sees
  if (has('--watch')) {
    const sec = Number(opt('--watch', '15')) || 15;
    if (!tty) console.log(`watching every ${sec}s — open ${join(outDir, 'index.html')}`);
    else process.stdout.write(c(COL.dim, `\nรีเฟรชทุก ${sec} วิ · Ctrl+C เพื่อออก · หน้าเว็บ: ${join(outDir, 'index.html')}\n`));
    let wasDone = d.status === 'done';
    setInterval(() => {
      const n = write();
      if (tty) { draw(n, { clear: true }); process.stdout.write(c(COL.dim, `\nรีเฟรชทุก ${sec} วิ · Ctrl+C เพื่อออก\n`)); }
      else if (line(n) !== line(d)) console.log(line(n));
      if (n.status === 'done' && !wasDone) { process.stdout.write('\x07'); wasDone = true; }   // terminal bell once, when it finishes
      d = n;
    }, sec * 1000);
  }
}
