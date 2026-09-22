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
  it("finds a record by its address as well as its words", () => {
    const items = [
      { ...records[0], href: "/content/writing/lean-context" },
      { ...records[1], id: "shipping-notes" },
    ];
    expect(matchingRecords(items, "lean-context", "all")).toEqual([items[0]]);
    expect(matchingRecords(items, "shipping-notes", "all")).toEqual([items[1]]);
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
    // The sidebar names each library by its route.
    expect(html).toContain('href="/content/pages"');
    expect(html).not.toContain("?group=");
    expect(html).not.toContain('role="tree"');
    expect(html).toMatch(/<h1[^>]*>content<\/h1>/);
    expect(html).toContain("Updated");
    expect(html).not.toContain("recently updated first");
    expect(html).toContain(
      'href="/content/writing/music?returnTo=%2Fcontent%2Fpages"',
    );
    expect(html).toContain('class="workspace-time"');
    expect(html).toContain("Local edit");
    expect(html).toContain('dateTime="2026-09-08T10:00:00.000Z"');
    expect(html).not.toContain("·");
  });
  it.each([
    ["content", "record not found", "/content/pages"],
    ["newsletter", "draft not found", "/content/newsletter"],
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
        selectedGroup="writing"
        groups={[{ name: "writing", href: "/content/writing", records }]}
      />,
    );
    expect(html).toContain(
      'href="/content/writing/music?returnTo=%2Fcontent%2Fwriting"',
    );
    expect(html).toContain("Continue draft");
    expect(html).toContain('aria-label="Writing records"');
    // Each navigation item carries its record count.
    expect(html).toMatch(
      new RegExp(
        `>Writing</span><span[^>]*><span[^>]*aria-label="${records.length} records">${records.length}<`,
      ),
    );
    expect(html).toContain("Theme");
    expect(html.match(/aria-label="Theme"/g)).toHaveLength(1);
    expect(html).toContain("Visit site");
    const siteLink = html.match(/<a\b[^>]*aria-label="Visit site"[^>]*>/)?.[0];
    expect(siteLink).toContain('href="https://anipotts.com/"');
    expect(siteLink).toContain('target="_blank"');
    expect(siteLink).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("Log out");
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
    expect(html).toContain("No records yet");
    expect(html).not.toContain("Clear filters");
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

it.each([[records], [[]]])(
  "provides one explicit recovery action while retaining any available inventory",
  (availableRecords) => {
    const html = renderToStaticMarkup(
      <EditorialApp
        title="Writing"
        area="content"
        localPreview
        siteUrl="https://anipotts.com"
        inventoryError
        groups={[
          {
            name: "writing",
            href: "/content?group=writing",
            records: availableRecords,
          },
        ]}
      />,
    );
    expect(html).toContain("Private drafts couldn’t be loaded");
    expect(html.match(/aria-label="Reload"/g)).toHaveLength(1);
    expect(html).not.toContain(">Retry<");
    if (availableRecords.length) {
      expect(html).toContain("agent notes");
      expect(html).toContain("Draft status unavailable");
    } else expect(html).toContain("Records unavailable");
  },
);
it("sentence-cases generated metadata labels without changing authored values", () => {
  const html = renderToStaticMarkup(
    <EditorialApp
      title="Review"
      area="newsletter"
      localPreview
      siteUrl="https://anipotts.com"
      review={{
        back: "/newsletter",
        status: "draft",
        fields: { review_ready: true, personal_note: "i like this lowercase" },
      }}
    />,
  );
  expect(html).toContain("Review ready");
  expect(html).toContain("Enabled");
  expect(html).toContain("Personal note");
  expect(html).toContain("i like this lowercase");
});

it("titles each library page with its own name and no Overview heading", () => {
  for (const [selectedGroup, heading] of [
    ["website", "Pages"],
    ["writing", "Writing"],
    ["work", "Projects"],
  ]) {
    const html = renderToStaticMarkup(
      <EditorialApp
        title={heading}
        area="content"
        localPreview
        siteUrl="https://anipotts.com"
        selectedGroup={selectedGroup}
        groups={[{ name: selectedGroup, href: "/content/pages", records: [] }]}
      />,
    );
    expect(html).toMatch(new RegExp(`<h1[^>]*>${heading}</h1>`));
    expect(html).not.toMatch(/<h1[^>]*>Overview<\/h1>/);
  }
});
