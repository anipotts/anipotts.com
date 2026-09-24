import { describe, expect, it } from "vitest";
import { searchAdminResults, type AdminSearchResult } from "./admin-search";

const rows: AdminSearchResult[] = [
  {
    id: "person:ani",
    label: "Ani Potts",
    domain: "data",
    kind: "person",
    currentFact: "owner of the current work",
    source: "brain",
    freshness: "2026-07-25T12:00:00.000Z",
    href: "/knowledge?kind=people",
    keywords: ["owner"],
  },
  {
    id: "work:site",
    label: "chief/site",
    domain: "system",
    kind: "working",
    currentFact: "finish the quiet admin console",
    source: "codex",
    freshness: "2026-07-25T12:00:00.000Z",
    href: "/work?view=now",
    keywords: ["admin"],
  },
];

describe("admin search", () => {
  it("matches every query term across sanitized result fields", () => {
    expect(searchAdminResults(rows, "quiet codex")).toEqual([rows[1]]);
    expect(searchAdminResults(rows, "Ani owner")).toEqual([rows[0]]);
    expect(searchAdminResults(rows, "transcript recipient attachment")).toEqual(
      [],
    );
  });
});
