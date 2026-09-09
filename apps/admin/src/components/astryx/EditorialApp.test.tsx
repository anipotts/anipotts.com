import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EditorialApp,
  matchingRecords,
  recentlyUpdated,
  type CatalogRecord,
} from "./EditorialApp";

const records = [
  {
    title: "agent notes",
    summary: "context and tools",
    status: "published",
    href: "/content/writing/agent-notes",
  },
  { title: "music", status: "draft", href: "/content/writing/music" },
];

describe("editorial catalog", () => {
  const datedRecords: CatalogRecord[] = [
    {
      title: "systems",
      status: "published",
      href: "/content/systemsPage/systems",
      updated: { at: "2026-09-01T10:00:00Z", source: "git" },
    },
    {
      ...records[0],
      updated: { at: "2026-08-01T10:00:00Z", source: "git" },
    },
    {
      ...records[1],
      updated: { at: "2026-09-08T10:00:00Z", source: "local" },
    },
    { title: "unknown", status: "draft", href: "/unknown" },
  ];
  it("orders records by update time without mutating input", () => {
    const sorted = recentlyUpdated(datedRecords);
    expect(sorted.map((item) => item.title)).toEqual([
      "music",
      "systems",
      "agent notes",
      "unknown",
    ]);
    expect(datedRecords[0].title).toBe("systems");
  });
  it("returns only the matching records, without hierarchy scaffolding", () => {
    const result = matchingRecords(datedRecords, "music", "draft");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("music");
    expect(matchingRecords(datedRecords, "missing", "all")).toEqual([]);
  });
  it("combines multiple sections with search and status, including an empty selection", () => {
    const items = [
      { ...records[0], section: "writing" },
      { ...records[1], section: "work" },
      {
        title: "home",
        status: "published",
        href: "/content/home/home",
        section: "home",
      },
    ];
    expect(matchingRecords(items, "", "all", ["work", "writing"])).toEqual(
      items.slice(0, 2),
    );
    expect(matchingRecords(items, "context", "published", ["writing"])).toEqual(
      [items[0]],
    );
    expect(matchingRecords(items, "", "all", [])).toEqual([]);
    expect(matchingRecords(items, "", "all", ["missing"])).toEqual([]);
    expect(matchingRecords(items, "writing", "all", ["writing"])).toEqual([
      items[0],
    ]);
  });
  it("renders all pages as a flat table with a dedicated readable date column", () => {
    const html = renderToStaticMarkup(
      <EditorialApp
        title="content"
        area="content"
        localPreview
        siteUrl="http://anipotts.localhost:1355/"
        groups={[
          {
            name: "pages",
            href: "/content?group=pages",
            records: datedRecords,
          },
          {
            name: "systems",
            href: "/content?group=systems",
            records: [datedRecords[0]],
          },
        ]}
      />,
    );
    expect(html).toContain('href="/content?group=systems"');
    expect(html).not.toContain('role="tree"');
    expect(html).toContain("all pages");
    expect(html).toContain("last updated");
    expect(html).not.toContain("recently updated first");
    expect(html).toContain('href="/content/writing/music"');
    expect(html).toContain("Sep 8, 2026");
    expect(html).toContain("local edit");
    expect(html).toContain('dateTime="2026-09-08T10:00:00.000Z"');
    expect(html).not.toContain("·");
  });
  it.each([
    ["content", "record not found", "/content"],
    ["newsletter", "draft not found", "/newsletter"],
  ] as const)(
    "renders one missing-record heading and the %s return link",
    (area, title, href) => {
      const html = renderToStaticMarkup(
        <EditorialApp
          title={title}
          area={area}
          localPreview
          siteUrl="https://anipotts.com/"
        />,
      );
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).not.toContain("<h3");
      expect(html).toContain(title);
      expect(html).toContain(`href="${href}"`);
    },
  );
  it("combines case-insensitive search and publication filters", () => {
    expect(matchingRecords(records, "  CONTEXT ", "published")).toEqual([
      records[0],
    ]);
    expect(matchingRecords(records, "context", "draft")).toEqual([]);
    expect(matchingRecords(records, "", "all")).toEqual(records);
    expect(matchingRecords(records, "missing", "all")).toEqual([]);
  });
  it("server renders accessible navigation, records, statuses, and theme controls", () => {
    const html = renderToStaticMarkup(
      <EditorialApp
        title="content"
        area="content"
        localPreview
        siteUrl="http://anipotts.localhost:1355/"
        groups={[{ name: "writing", href: "/content?group=writing", records }]}
      />,
    );
    expect(html).toContain('href="/content/writing/music"');
    expect(html).toContain("draft");
    expect(html).toContain('aria-label="writing records"');
    expect(html).toContain('aria-label="light theme: switch to dark"');
    expect(html.match(/aria-label="[^"]*theme[^"]*"/g)).toHaveLength(1);
    expect(html).toContain("live site");
    const siteLink = html.match(/<a\b[^>]*aria-label="live site"[^>]*>/)?.[0];
    expect(siteLink).toContain('href="https://anipotts.com/"');
    expect(siteLink).toContain('target="_blank"');
    expect(siteLink).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("log out");
    expect(html).not.toContain("·");
  });
  it("renders an empty collection with a usable empty state", () => {
    const html = renderToStaticMarkup(
      <EditorialApp
        title="newsletter"
        area="newsletter"
        localPreview
        siteUrl="https://anipotts.com/"
        groups={[{ name: "drafts", href: "/newsletter", records: [] }]}
      />,
    );
    expect(html).toContain("no matching records");
    expect(html).toContain("clear filters");
  });
  it("does not invent a public link for a private review", () => {
    const html = renderToStaticMarkup(
      <EditorialApp
        title="music"
        area="content"
        localPreview
        siteUrl="https://anipotts.com/"
        review={{
          back: "/content?group=writing",
          status: "draft",
          summary: "private preview",
        }}
      />,
    );
    expect(html).toContain("private preview");
    expect(html).not.toContain("view published page");
    expect(html).toContain('href="/content?group=writing"');
  });
  it("groups named workflow steps and preserves long prose outside metadata tokens", () => {
    const paragraph =
      "this is a full paragraph that belongs in the record body and should remain readable as prose rather than becoming a tiny metadata chip";
    const html = renderToStaticMarkup(
      <EditorialApp
        title="systems"
        area="content"
        localPreview
        siteUrl="https://anipotts.com/"
        review={{
          back: "/content?group=systems",
          status: "published",
          contentFields: {
            steps: [
              {
                id: "context",
                label: "retrieve context",
                detail: "find the relevant files",
                marks: ["obsidian", "github"],
              },
            ],
            paragraphs: [paragraph],
          },
        }}
      />,
    );
    expect(html).toContain("retrieve context");
    expect(html).toContain("obsidian");
    expect(html).toContain(paragraph);
    expect(html).toContain('href="/content?group=systems"');
    expect(html).not.toContain(">id<");
  });
  it("server renders a local public review link without browser globals", () => {
    const html = renderToStaticMarkup(
      <EditorialApp
        title="agent notes"
        area="content"
        localPreview
        siteUrl="http://anipotts.localhost:1355/"
        review={{
          back: "/content?group=writing",
          status: "published",
          publicUrl: "http://anipotts.localhost:1355/writing/agent-notes",
        }}
      />,
    );
    expect(html).toContain(
      'href="http://anipotts.localhost:1355/writing/agent-notes?theme=light"',
    );
  });
});
