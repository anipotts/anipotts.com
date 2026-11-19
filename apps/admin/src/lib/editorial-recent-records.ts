import type { CatalogRecord } from "../components/astryx/EditorialApp";

export function recentlyUpdated<Record extends CatalogRecord>(
  records: Record[],
): Record[] {
  const latest = (record: CatalogRecord) =>
    Date.parse(record.updated?.at ?? "") || 0;
  return [...records].sort(
    (a, b) =>
      latest(b) - latest(a) ||
      a.title.localeCompare(b.title) ||
      a.href.localeCompare(b.href),
  );
}
