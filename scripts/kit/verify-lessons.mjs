#!/usr/bin/env node
/**
 * verify-lessons.mjs — a LESSONS.md that a script cannot read is a LESSONS.md
 * nobody merges into a skill at the end of the run.
 *
 * Three real ledgers (310 lessons, 614 KB) arrived in three formats, with the
 * word "กฎ" spelled four ways, headings 40–90 characters long, 2–6 rules per
 * field, no ids, no dates, owners pointing at slash commands, `<ชื่อสกิล>`
 * placeholders left in, and the same rule written up to 49 times across the
 * three projects because nothing could count it. This script refuses each of
 * those at write time, in the quick gate, so the file stays mergeable.
 *
 *   node verify-lessons.mjs [docs/LESSONS.md] [--rulings docs/RULINGS.md] [--json]
 *   node verify-lessons.mjs --self-test      # red-tests every rule against fixtures
 *
 * Exit 0 = clean · 1 = at least one violation (each printed as file:line · rule · detail)
 *
 * Exports parseLessons() for lessons-report.mjs, so the report and the checker
 * cannot disagree about what a lesson is.
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------- vocabulary -------------------------------------------------------

export function loadTags(dir = here) {
  const j = JSON.parse(readFileSync(join(dir, 'lessons-tags.json'), 'utf8'));
  return j.tags;
}

export function loadOwners(dir = here) {
  const j = JSON.parse(readFileSync(join(dir, 'lessons-owners.json'), 'utf8'));
  const skills = new Set(j.skills);
  // Inside the kit, the skills/ folder is the truth; the JSON list is the fallback.
  const skillsDir = resolve(dir, '..');
  try {
    for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
      if (d.isDirectory() && existsSync(join(skillsDir, d.name, 'SKILL.md'))) skills.add(d.name);
    }
  } catch { /* copied out of the kit — fallback list applies */ }
  return { skills, aliases: j.aliases || {} };
}

// ---------- parser ------------------------------------------------------------

const HEAD = /^## (L-\d{3,}) · (\d{4}-\d{2}-\d{2}) · ([^·]+?) · ([a-z0-9-]+)\s*$/;
const FIELD = /^- ([^:]+):\s?(.*)$/;
const REQUIRED = ['อาการ', 'สาเหตุ', 'หลักฐาน', 'กฎ', 'status'];
const OPTIONAL = ['เกิดซ้ำ', 'supersedes'];
const STATUS = /^(new|merged:[a-z0-9-]+@\d+\.\d+\.\d+|superseded-by:L-\d{3,}|project-only|expired)$/;
const LIMITS = { 'อาการ': 120, 'สาเหตุ': 200, 'หลักฐาน': 200, 'กฎ': 200 };
const PLACEHOLDER = /<[^>]{1,40}>/;
const SECRET = /(sk-ant-|sb_secret_|sbp_[a-z0-9]{20,}|eyJ[A-Za-z0-9_-]{30,}\.|SUPABASE_ACCESS_TOKEN\s*=\s*\S|SUPABASE_SECRET_KEY\s*=\s*\S|password\s*[:=]\s*\S{6,})/i;
const MULTI_RULE = /(\s·\s|\s\d\)\s|\s\(\d\)\s|;\s)/; // a rule that lists several rules

/**
 * Returns { lessons, problems }.  A "lesson" is every `## L-` heading with the
 * fields that follow it until the next `## `.  Lines before the first heading
 * (the template's own explanation, inside an HTML comment) are ignored.
 */
export function parseLessons(text, file = 'LESSONS.md') {
  const lines = text.split(/\r?\n/);
  const lessons = [];
  const problems = [];
  const bad = (line, rule, detail) => problems.push({ file, line, rule, detail });
  let cur = null;
  let inComment = false;
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (raw.includes('<!--')) inComment = true;
    if (inComment) { if (raw.includes('-->')) inComment = false; return; }
    if (raw.startsWith('## ')) {
      const m = raw.match(HEAD);
      if (!m) { bad(n, 'heading', `expected "## L-nnn · YYYY-MM-DD · <skill> · <tag>", got "${raw.slice(0, 80)}"`); cur = null; return; }
      cur = { id: m[1], date: m[2], owner: m[3].trim(), tag: m[4], line: n, fields: {}, repeats: [], supersedes: null };
      lessons.push(cur);
      return;
    }
    if (!cur) return;
    if (!raw.trim() || raw.startsWith('---') || raw.startsWith('#')) return;
    const f = raw.match(FIELD);
    if (!f) { bad(n, 'field', `line inside ${cur.id} is not "- <ช่อง>: …" (continuation lines are not allowed — one field is one line)`); return; }
    const [, name, value] = f;
    if (name === 'เกิดซ้ำ') { cur.repeats.push({ line: n, value: value.trim() }); return; }
    if (name === 'supersedes') { cur.supersedes = value.trim(); return; }
    if (!REQUIRED.includes(name)) { bad(n, 'field-name', `unknown field "${name}" in ${cur.id} — allowed: ${[...REQUIRED, ...OPTIONAL].join(' · ')}`); return; }
    if (name in cur.fields) { bad(n, 'field-dup', `"${name}" appears twice in ${cur.id}`); return; }
    cur.fields[name] = { line: n, value: value.trim() };
  });
  return { lessons, problems };
}

// ---------- rules -------------------------------------------------------------

export function checkLessons(text, { file = 'LESSONS.md', tags, owners } = {}) {
  const { lessons, problems } = parseLessons(text, file);
  const bad = (line, rule, detail) => problems.push({ file, line, rule, detail });
  const seen = new Map();
  let lastNum = 0;
  const ids = new Set(lessons.map((l) => l.id));

  for (const l of lessons) {
    // id: unique, monotonic
    const num = Number(l.id.slice(2));
    if (seen.has(l.id)) bad(l.line, 'id-dup', `${l.id} already used at line ${seen.get(l.id)}`);
    seen.set(l.id, l.line);
    if (num <= lastNum) bad(l.line, 'id-order', `${l.id} is not greater than the previous id (L-${String(lastNum).padStart(3, '0')})`);
    lastNum = Math.max(lastNum, num);

    // date sanity
    const d = new Date(l.date + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || l.date < '2024-01-01' || l.date.startsWith('25')) bad(l.line, 'date', `"${l.date}" is not a plausible ค.ศ. date (พ.ศ. must be converted: 2569 → 2026)`);

    // owner: a real skill, or an alias
    if (owners) {
      const o = l.owner;
      if (!owners.skills.has(o)) {
        const alias = owners.aliases[o];
        if (alias) bad(l.line, 'owner-alias', `"${o}" is not a skill — write its owner "${alias}"`);
        else bad(l.line, 'owner', `"${o}" is not a skill in this kit (see lessons-owners.json)`);
      }
    }
    // tag: in vocabulary
    if (tags && !(l.tag in tags)) bad(l.line, 'tag', `"${l.tag}" is not in lessons-tags.json — add it there first (with a one-line meaning and default owner)`);

    // required fields
    for (const r of REQUIRED) {
      if (!(r in l.fields)) { bad(l.line, 'missing', `${l.id} has no "- ${r}:" line`); continue; }
      const { line, value } = l.fields[r];
      if (!value) bad(line, 'empty', `"${r}" of ${l.id} is empty`);
      if (PLACEHOLDER.test(value) && !/`[^`]*<[^`]*`/.test(value)) bad(line, 'placeholder', `"${r}" of ${l.id} still holds a <placeholder>`);
      if (LIMITS[r] && value.length > LIMITS[r]) bad(line, 'length', `"${r}" of ${l.id} is ${value.length} chars (max ${LIMITS[r]}) — one field is one line, one rule is one sentence`);
      if (SECRET.test(value)) bad(line, 'secret', `"${r}" of ${l.id} looks like it contains a credential`);
    }
    const rule = l.fields['กฎ']?.value || '';
    if (MULTI_RULE.test(rule)) bad(l.fields['กฎ'].line, 'one-rule', `${l.id} "กฎ" lists several rules — split into separate lessons (one rule per id)`);
    const ev = l.fields['หลักฐาน']?.value || '';
    if (ev && !/[\/\\.]\w|\d/.test(ev)) bad(l.fields['หลักฐาน'].line, 'evidence', `${l.id} "หลักฐาน" has neither a path nor a number — "ดูแล้วพัง" is not evidence`);
    const st = l.fields.status?.value || '';
    if (st && !STATUS.test(st)) bad(l.fields.status.line, 'status', `${l.id} status "${st}" — allowed: new · merged:<skill>@<x.y.z> · superseded-by:L-nnn · project-only · expired`);
    if (l.tag === 'project-only' && st && st !== 'project-only') bad(l.fields.status.line, 'status', `${l.id} is tagged project-only, so its status must be project-only`);

    // supersedes: target exists and is marked
    if (l.supersedes) {
      if (!ids.has(l.supersedes)) bad(l.line, 'supersedes', `${l.id} supersedes ${l.supersedes}, which does not exist`);
      else {
        const t = lessons.find((x) => x.id === l.supersedes);
        const ts = t.fields.status?.value || '';
        if (ts !== `superseded-by:${l.id}`) bad(t.fields.status?.line ?? t.line, 'superseded', `${t.id} is superseded by ${l.id} but its status is "${ts}" — set "superseded-by:${l.id}"`);
      }
    }
    for (const r of l.repeats) {
      if (!/\d{4}-\d{2}-\d{2}/.test(r.value)) bad(r.line, 'repeat', `${l.id} "เกิดซ้ำ" needs "<task id> <YYYY-MM-DD>"`);
    }
  }
  // duplicate tag without recurrence line: same family recorded twice
  const byTag = new Map();
  for (const l of lessons) {
    if (l.tag === 'project-only') continue;
    const key = `${l.tag}`;
    if (byTag.has(key)) {
      const first = byTag.get(key);
      const sup = l.supersedes === first.id || (first.fields.status?.value || '').startsWith('superseded-by');
      if (!sup) bad(l.line, 'tag-dup', `${l.id} repeats tag "${l.tag}" already used by ${first.id} — add "- เกิดซ้ำ: <task> <date>" under ${first.id} instead of a new lesson, or "supersedes: ${first.id}" if the rule changed`);
    } else byTag.set(key, l);
  }
  return { lessons, problems };
}

export function checkRulings(text, file = 'RULINGS.md') {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const RUL = /^- (R-\d{3,}) · ([^·]+) · (\d{4}-\d{2}-\d{2}) · Ruling: .+ — เพราะ: .+ — ถ้าผิด: .+$/;
  const ids = new Map();
  let inComment = false;
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (raw.includes('<!--')) inComment = true;
    if (inComment) { if (raw.includes('-->')) inComment = false; return; }
    if (/^-\s.*กับดัก\s*:/.test(raw)) problems.push({ file, line: n, rule: 'trap-is-lesson', detail: 'a "กับดัก:" is a lesson, not a ruling — move it to LESSONS.md with an id, tag and owner' });
    if (!raw.startsWith('- ')) return;
    if (PLACEHOLDER.test(raw)) return; // template line
    const m = raw.match(RUL);
    if (!m) { problems.push({ file, line: n, rule: 'ruling', detail: 'expected "- R-nnn · <phase> · YYYY-MM-DD · Ruling: … — เพราะ: … — ถ้าผิด: …"' }); return; }
    if (ids.has(m[1])) problems.push({ file, line: n, rule: 'id-dup', detail: `${m[1]} already used at line ${ids.get(m[1])}` });
    ids.set(m[1], n);
  });
  return { problems };
}

// ---------- self-test -----------------------------------------------------------

const GOOD = `# LESSONS — demo

## L-001 · 2026-09-16 · kp-testing-cadence · checker-cannot-fail
- อาการ: ตัวตรวจ focus รายงาน 4,212 ปัญหาเท่าเดิมก่อนและหลังแก้
- สาเหตุ: probe อ่าน --brand จาก :root ไม่ใช่ outline-color ที่ fix ตั้ง
- หลักฐาน: docs/review/T5-04/focus.txt
- กฎ: ตัวตรวจต้องพิมพ์ counter ของกลางและตัวเลขต้องขยับเมื่อโค้ดที่มันเฝ้าเปลี่ยน
- status: new
- เกิดซ้ำ: T6-03a 2026-09-17

## L-002 · 2026-09-17 · supabase-rls-schema · grant-revoke
- อาการ: ทุก request ได้ 42501 หลัง migration
- สาเหตุ: policy สร้างแล้วแต่ไม่มี grant ให้ authenticated
- หลักฐาน: 24 ตาราง ใน docs/review/T1-00/grants.txt
- กฎ: migration ที่สร้างตารางต้องเปิดด้วย revoke all แล้ว grant ตามเจตนา
- status: merged:supabase-rls-schema@0.30.0
`;

function selfTest() {
  const tags = loadTags();
  const owners = loadOwners();
  const mutate = (name, fn, wantRule) => ({ name, text: fn(GOOD), wantRule });
  const cases = [
    { name: 'the template itself must be red (its placeholder heading cannot parse)', text: readFileSync(join(here, 'LESSONS-template.md'), 'utf8'), wantRule: 'heading' },
    { name: 'a clean file', text: GOOD, wantRule: null },
    mutate('heading with a title instead of the four slots', (t) => t.replace('## L-001 · 2026-09-16 · kp-testing-cadence · checker-cannot-fail', '## ตัวตรวจไม่แดง'), 'heading'),
    mutate('owner is a slash command', (t) => t.replace('kp-testing-cadence ·', 'new-kp-app ·'), 'owner-alias'),
    mutate('owner is unknown', (t) => t.replace('kp-testing-cadence ·', 'writing-stuff ·'), 'owner'),
    mutate('tag not in vocabulary', (t) => t.replace('· checker-cannot-fail', '· something-new'), 'tag'),
    mutate('the word กฎ spelled differently', (t) => t.replace('- กฎ: ตัวตรวจ', '- กฎกันซ้ำ: ตัวตรวจ'), 'field-name'),
    mutate('two rules in one field', (t) => t.replace('เมื่อโค้ดที่มันเฝ้าเปลี่ยน', 'เมื่อโค้ดที่มันเฝ้าเปลี่ยน · และต้อง fail ดังเมื่อ resolve ไม่ได้'), 'one-rule'),
    mutate('rule too long', (t) => t.replace('- กฎ: ตัวตรวจ', '- กฎ: ' + 'ยาว'.repeat(120) + ' ตัวตรวจ'), 'length'),
    mutate('evidence is a feeling', (t) => t.replace('- หลักฐาน: docs/review/T5-04/focus.txt', '- หลักฐาน: ดูแล้วพัง'), 'evidence'),
    mutate('placeholder left in', (t) => t.replace('- สาเหตุ: probe', '- สาเหตุ: <กลไกจริง> probe'), 'placeholder'),
    mutate('bad status word', (t) => t.replace('- status: new', '- status: done'), 'status'),
    mutate('พ.ศ. year in heading', (t) => t.replace('2026-09-16', '2569-09-16'), 'date'),
    mutate('duplicate id', (t) => t.replace('## L-002', '## L-001'), 'id-dup'),
    mutate('ids out of order', (t) => t.replace('## L-002', '## L-000'), 'id-order'),
    mutate('same tag twice without เกิดซ้ำ or supersedes', (t) => t.replace('· grant-revoke', '· checker-cannot-fail'), 'tag-dup'),
    mutate('continuation line', (t) => t.replace('- status: new\n', '- status: new\n  ต่ออีกบรรทัด\n'), 'field'),
    mutate('credential in evidence', (t) => t.replace('docs/review/T5-04/focus.txt', 'SUPABASE_ACCESS_TOKEN=sbp_abcdefghijklmnopqrstuvwxyz'), 'secret'),
    mutate('supersedes a missing id', (t) => t.replace('- เกิดซ้ำ: T6-03a 2026-09-17', '- supersedes: L-099'), 'supersedes'),
    mutate('supersedes without marking the old one', (t) => t.replace('- status: merged:supabase-rls-schema@0.30.0', '- status: new\n- supersedes: L-001'), 'superseded'),
  ];
  let failed = 0;
  for (const c of cases) {
    const { problems } = checkLessons(c.text, { tags, owners });
    const rules = new Set(problems.map((p) => p.rule));
    const ok = c.wantRule === null ? problems.length === 0 : rules.has(c.wantRule);
    console.log(`${ok ? '✅' : '❌'} ${c.name}${ok ? '' : ` — want ${c.wantRule ?? 'clean'}, got [${[...rules].join(', ')}]`}`);
    if (!ok) failed++;
  }
  // rulings
  const rGood = '- R-001 · P2 · 2026-09-14 · Ruling: งวดค่าเริ่มต้นคืองวด open — เพราะ: เปิดได้ทีละงวด — ถ้าผิด: เห็นงวดผิดครั้งเดียว\n';
  const rCases = [
    { name: 'rulings: clean', text: rGood, wantRule: null },
    { name: 'rulings: a trap hiding in rulings', text: rGood + '- กับดัก: heredoc กลืน backslash\n', wantRule: 'trap-is-lesson' },
    { name: 'rulings: missing ถ้าผิด', text: '- R-001 · P2 · 2026-09-14 · Ruling: x — เพราะ: y\n', wantRule: 'ruling' },
    { name: 'rulings: the template', text: readFileSync(join(here, 'RULINGS-template.md'), 'utf8'), wantRule: null },
  ];
  for (const c of rCases) {
    const { problems } = checkRulings(c.text);
    const rules = new Set(problems.map((p) => p.rule));
    const ok = c.wantRule === null ? problems.length === 0 : rules.has(c.wantRule);
    console.log(`${ok ? '✅' : '❌'} ${c.name}${ok ? '' : ` — want ${c.wantRule ?? 'clean'}, got [${[...rules].join(', ')}]`}`);
    if (!ok) failed++;
  }
  // the parser must count: a file with N lessons parses to N
  const { lessons } = parseLessons(GOOD);
  if (lessons.length !== 2 || lessons[0].repeats.length !== 1) { console.log('❌ parser count (want 2 lessons, 1 recurrence)'); failed++; } else console.log('✅ parser count');
  console.log(failed ? `\n${failed} self-test case(s) failed` : '\nall self-test cases passed');
  process.exit(failed ? 1 : 0);
}

// ---------- cli -----------------------------------------------------------------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) selfTest();
  else {
    const json = args.includes('--json');
    const ri = args.indexOf('--rulings');
    const rulingsPath = ri > -1 ? args[ri + 1] : (existsSync('docs/RULINGS.md') ? 'docs/RULINGS.md' : null);
    const file = args.find((a) => !a.startsWith('--') && a !== rulingsPath) || 'docs/LESSONS.md';
    if (!existsSync(file)) { console.error(`no ${file} — a run without a lessons ledger records nothing (copy LESSONS-template.md)`); process.exit(1); }
    const tags = loadTags();
    const owners = loadOwners();
    const { lessons, problems } = checkLessons(readFileSync(file, 'utf8'), { file, tags, owners });
    if (rulingsPath && existsSync(rulingsPath)) problems.push(...checkRulings(readFileSync(rulingsPath, 'utf8'), rulingsPath).problems);
    const repeats = lessons.reduce((a, l) => a + l.repeats.length, 0);
    if (json) console.log(JSON.stringify({ file, lessons: lessons.length, repeats, problems }, null, 2));
    else {
      for (const p of problems) console.log(`${p.file}:${p.line} · ${p.rule} · ${p.detail}`);
      console.log(`${problems.length ? '❌' : '✅'} ${file}: ${lessons.length} lessons · ${repeats} recurrences · ${problems.length} problem(s)`);
    }
    process.exit(problems.length ? 1 : 0);
  }
}
