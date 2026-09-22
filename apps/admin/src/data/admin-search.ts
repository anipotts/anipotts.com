type AdminSearchDomain = "navigation" | "content" | "data" | "system";

export type AdminSearchResult = {
  id: string;
  label: string;
  domain: AdminSearchDomain;
  kind: string;
  currentFact: string;
  source: string;
  freshness: string;
  href: string;
  keywords: string[];
  /** The glyph a provider leads its row with, over the palette's default. */
  icon?: import("@phosphor-icons/react").Icon;
};

export function searchAdminResults(
  rows: AdminSearchResult[],
  query: string,
): AdminSearchResult[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows.slice(0, 12);

  return rows
    .filter((row) => {
      const haystack = [
        row.label,
        row.domain,
        row.kind,
        row.currentFact,
        row.source,
        ...row.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 24);
}
