// Fail when src/lib/database.types.ts is a stub (supabase-rls-schema: the types
// file that stayed a 58-line placeholder for twelve phases).
import { readFileSync } from 'node:fs';

const FLOOR = 20;
const src = readFileSync('src/lib/database.types.ts', 'utf8');
const rows = (src.match(/\n\s+Row: \{/g) ?? []).length;
const fns = (src.match(/Args: /g) ?? []).length;
console.log(`database.types.ts: ${rows} tables/views · ${fns} functions`);
if (rows < FLOOR) {
  console.error(`FAIL: expected at least ${FLOOR} Row blocks — regenerate types from the aewkan project`);
  process.exit(1);
}
