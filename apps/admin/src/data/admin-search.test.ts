import { describe, expect, it } from "vitest";
import {
  navItems,
  mutationRows,
  deployRows,
  handoffRows,
  repoRows,
} from "./admin";
import { searchAdminResults, type AdminSearchResult } from "./admin-search";

const rows: AdminSearchResult[] = [
  {
    id: "person:ani",
    label: "Ani Potts",
    domain: "people",
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
    domain: "work",
    kind: "working",
    currentFact: "finish the quiet admin console",
    source: "codex",
    freshness: "2026-07-25T12:00:00.000Z",
    href: "/work?view=now",
    keywords: ["admin"],
  },
];

describe("admin search and navigation", () => {
  it("matches every query term across sanitized result fields", () => {
    expect(searchAdminResults(rows, "quiet codex")).toEqual([rows[1]]);
    expect(searchAdminResults(rows, "Ani owner")).toEqual([rows[0]]);
    expect(searchAdminResults(rows, "transcript recipient attachment")).toEqual(
      [],
    );
  });

  it("keeps Inbox pinned and Fleet nested under System", () => {
    expect(navItems[0]).toMatchObject({ href: "/inbox", group: "home" });
    expect(navItems.find((item) => item.href === "/fleet")).toMatchObject({
      group: "system",
      parent: "system",
    });
    expect(navItems.find((item) => item.href === "/system")).toBeDefined();
    expect(navItems.find((item) => item.href === "/handoffs")).toMatchObject({
      group: "work",
      parent: "work",
    });
    expect(navItems.find((item) => item.href === "/deploys")?.label).toBe(
      "Deployments",
    );
    expect(navItems.find((item) => item.href === "/content")).toMatchObject({
      group: "website",
      label: "Website",
    });
    expect(
      navItems.find((item) => item.href === "/content/review")?.label,
    ).toBe("Legacy content diagnostics");
    expect(navItems.some((item) => item.href === "/content/new")).toBe(false);
    expect(
      navItems.find((item) => item.href === "/knowledge?kind=people"),
    ).toMatchObject({ group: "knowledge", parent: "knowledge" });
    expect(
      navItems.find((item) => item.href === "/knowledge/locations"),
    ).toMatchObject({ group: "knowledge", parent: "knowledge" });
  });
});

// Reference tables must not masquerade as queried account/deployment status.
describe("static diagnostics evidence boundaries", () => {
  it("describes publication and authentication requirements without legacy or account-state claims", () => {
    const copy = JSON.stringify({
      mutationRows,
      handoffRows,
      repoRows,
      deployRows,
    });
    expect(copy).not.toMatch(
      /no active passkey|content_publish_events|page_content|production-reflective|return Cloudflare Access 302/,
    );
    expect(
      mutationRows.every((row) => row.evidence.startsWith("Required:")),
    ).toBe(true);
    expect(
      mutationRows.find((row) => row.title === "publish content edits")
        ?.evidence,
    ).toContain("Git-backed publication");
  });
  it("labels every static deployment proof as a verification requirement", () => {
    expect(deployRows.length).toBeGreaterThan(0);
    expect(deployRows.every((row) => row.proof.startsWith("Required:"))).toBe(
      true,
    );
  });
});
