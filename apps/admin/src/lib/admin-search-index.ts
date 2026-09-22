import type { AdminSearchResult } from "../data/admin-search";

/**
 * What the one command palette can find beyond the sidebar's destinations.
 * Each workspace provides the rows it has already read, under its own name:
 * Content its inventory, Observability its live services and alerts, Data
 * the records of an open session. The palette reads the union whenever it
 * searches, so a source that arrives later is searchable from then on, and a
 * source that is withdrawn (a Data session closing) stops being found.
 */
const sources = new Map<string, readonly AdminSearchResult[]>();

/** Provides `entries` under `source`, replacing what it provided before.
 * Returns a function that withdraws exactly these entries. */
export function provideSearchEntries(
  source: string,
  entries: readonly AdminSearchResult[],
): () => void {
  sources.set(source, entries);
  return () => {
    if (sources.get(source) === entries) sources.delete(source);
  };
}

/** Every provided row, in the order the sources arrived. */
export function providedSearchEntries(): AdminSearchResult[] {
  return [...sources.values()].flat();
}
