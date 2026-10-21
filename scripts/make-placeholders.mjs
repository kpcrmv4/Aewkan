// One-off scaffold helper (P0): writes the admin section placeholder pages.
// Each page is replaced by the phase that owns it; this script never overwrites.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const pages = [
  ['jobs', 'jobs.read', 'งานเข้า', 'P2'],
  ['quotes', 'quotes.manage', 'เสนอราคา', 'P2'],
  ['assign', 'jobs.manage', 'จัดคนขับ', 'P2'],
  ['drivers', 'drivers.manage', 'คนขับและรถ', 'P2'],
  ['payments', 'finance.read', 'การเงิน', 'P4'],
  ['pricing', 'pricing.manage', 'กฎราคา', 'P2'],
  ['places', 'places.manage', 'จุดหมาย', 'P2'],
  ['integrations', 'integrations.manage', 'การเชื่อมต่อ', 'P4'],
  ['team', 'team.manage', 'ทีมงานและสิทธิ์', 'P5'],
];

for (const [slug, perm, title, phase] of pages) {
  const file = join('src', 'app', 'admin', '(shell)', slug, 'page.tsx');
  if (existsSync(file)) continue;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    [
      "import { ComingSoon } from '@/components/shell/coming-soon';",
      "import { requirePerm } from '@/lib/auth/require';",
      '',
      `export const metadata = { title: '${title}' };`,
      '',
      'export default async function Page() {',
      `  await requirePerm('${perm}');`,
      `  return <ComingSoon title="${title}" phase="${phase}" />;`,
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  console.log('wrote', file);
}
