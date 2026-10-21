/** segments are stored once per unordered pair with place_a < place_b (db check) */
export function orderPair(x: string, y: string): [string, string] {
  // uuid text compares like the uuid bytes (same case, same positions)
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  return a < b ? [a, b] : [b, a];
}

export type SegSource = 'driven' | 'checkins' | 'routing';

/** R-004: lower number = more trusted */
export const SOURCE_RANK: Record<SegSource, number> = { driven: 1, checkins: 2, routing: 3 };

/** the source that would be used for a pair, given what is stored */
export function bestSource(sources: readonly SegSource[], samplesBySource: Partial<Record<SegSource, number>> = {}): SegSource | null {
  const usable = sources.filter((s) => s !== 'checkins' || (samplesBySource.checkins ?? 0) >= 3);
  return [...usable].sort((a, b) => SOURCE_RANK[a] - SOURCE_RANK[b])[0] ?? null;
}
