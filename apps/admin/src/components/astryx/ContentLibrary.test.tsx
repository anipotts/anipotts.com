import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContentLibrary,
  changedFieldSummary,
  libraryFigures,
  matchingRecords,
  recentlyUpdated,
  Updated,
} from "./ContentLibrary";
const rows = [
  {
    title: "Post",
    href: "/content/writing/b",
    status: "published",
    changesPending: true,
  },
  {
    title: "Post",
    href: "/content/writing/a",
    status: "published",
    changesPending: false,
  },
];
describe("Content library", () => {
  it("keeps publication state while showing private changes", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        groups={[
          { name: "writing", href: "/content?group=writing", records: rows },
        ]}
        selectedGroup="writing"
      />,
    );
    expect(html).toContain("Review changes");
    // A record with nothing to act on carries no line beside its chip.
    expect(html).not.toContain("Up to date");
    expect(html).toContain("view=review");
    expect(html.indexOf("/content/writing/b?")).toBeLessThan(
      html.indexOf("/content/writing/a?"),
    );
    expect(matchingRecords(rows, "", "changes")).toEqual([rows[0]]);
    expect(matchingRecords(rows, "", "published")).toEqual(rows);
  });
  it("applies initial URL filters in server markup and retains return context", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        initialSearch="?group=writing&q=missing&theme=dark"
        groups={[
          { name: "writing", href: "/content?group=writing", records: rows },
        ]}
      />,
    );
    expect(html).toContain("No matching records");
    expect(html).toContain('value="missing"');
    expect(html).not.toContain("/content/writing/b");
  });
  it("breaks equal-title/date ties by record identity without mutating inventory", () => {
    expect(recentlyUpdated(rows).map((row) => row.href)).toEqual([
      rows[1].href,
      rows[0].href,
    ]);
    expect(rows[0].href).toBe("/content/writing/b");
  });
  it("distinguishes unavailable and empty inventory", () => {
    const groups = [
      { name: "writing", href: "/content?group=writing", records: [] },
    ];
    const failed = renderToStaticMarkup(
      <ContentLibrary groups={groups} inventoryError />,
    );
    expect(failed).toContain("Records unavailable");
    expect(failed).not.toContain("No records yet");
    expect(renderToStaticMarkup(<ContentLibrary groups={groups} />)).toContain(
      "New article",
    );
  });
});

describe("Quiet Precision library rows", () => {
  it("keeps public state separate from unpublished edits and provides the exact review destination", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        initialSearch="?group=work&q=Chained&sort=updated"
        selectedGroup="work"
        groups={[
          {
            name: "work",
            href: "/content?group=work",
            records: [
              {
                title: "ChainedChat",
                href: "/content/projects/chainedchat",
                collection: "projects",
                status: "listed",
                changesPending: true,
                summary: "Shared context across models",
                changedFields: ["Subtitle", "Card copy"],
              },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain("Listed");
    expect(html).toContain("Unpublished edits");
    expect(html).toContain('aria-label="Review changes: ChainedChat"');
    expect(html).toContain("view=review");
    expect(html).toContain(
      "returnTo=%2Fcontent%2Fprojects%3Fq%3DChained%26sort%3Dupdated",
    );
    expect(html).toContain("workspace-row-mark");
    expect(html).toContain("editorial-record-state");
    expect(html).toContain("editorial-record-action");
    expect(html).toContain("Shared context across models");
    expect(html).not.toContain("Next step");
  });
  it("keeps draft continuation and ordinary record opening distinct", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        selectedGroup="writing"
        groups={[
          {
            name: "writing",
            href: "/content?group=writing",
            records: [
              {
                title: "Private article",
                href: "/content/writing/private",
                status: "draft",
              },
              {
                title: "Published article",
                href: "/content/writing/public",
                status: "published",
              },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Continue draft: Private article"');
    expect(html).toContain('aria-label="Open record: Published article"');
    expect(html).toContain("Unpublished draft");
    expect(html).not.toContain("Up to date");
    expect(html).not.toContain("view=review");
  });
  it("does not offer a review action when private draft state is unavailable", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        inventoryError
        selectedGroup="writing"
        groups={[
          {
            name: "writing",
            href: "/content?group=writing",
            records: [
              {
                title: "Public article",
                href: "/content/writing/public",
                status: "published",
                changesPending: true,
              },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain("Published");
    expect(html).toContain("Draft status unavailable");
    expect(html).toContain('aria-label="Open record: Public article"');
    expect(html).not.toContain('aria-label="Review changes:');
    expect(html).not.toContain("Up to date");
  });
  it("renders one shared search and filter toolbar before the table, with no resume strip", () => {
    const records = ["One", "Two", "Three"].map((title, index) => ({
      title,
      href: `/content/writing/${title.toLowerCase()}`,
      status: "draft",
      updated: {
        at: `2026-09-1${index}T12:00:00Z`,
        source: "private" as const,
      },
    }));
    const html = renderToStaticMarkup(
      <ContentLibrary
        groups={[{ name: "pages", href: "/content", records }]}
      />,
    );
    expect(html).not.toContain("editorial-resume");
    expect(html).not.toContain("Recently edited</");
    expect(html).toContain("workspace-table");
    expect(html.indexOf("workspace-filter-bar")).toBeLessThan(
      html.indexOf("workspace-search"),
    );
    expect(html.indexOf("workspace-search")).toBeLessThan(
      html.indexOf("workspace-filters"),
    );
    expect(html.indexOf("workspace-filters")).toBeLessThan(
      html.indexOf("workspace-table-grid"),
    );
  });
  it("keeps unknown timestamps explicit and never renders an invalid date", () => {
    expect(
      renderToStaticMarkup(<Updated updated={undefined} column />),
    ).toContain("Not recorded");
    const html = renderToStaticMarkup(
      <Updated column updated={{ at: "not-a-date", source: "private" }} />,
    );
    expect(html).toContain("Not recorded");
    expect(html).not.toContain("Invalid Date");
  });
  it("preserves review-only destinations and escapes unusual record text", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        area="newsletter"
        groups={[
          {
            name: "issues",
            href: "/newsletter",
            records: [
              {
                title: "雨 <script>unsafe</script>",
                href: "/newsletter/example",
                status: "review",
                summary: "A long_".repeat(40),
                capabilities: {
                  editable: false,
                  previewable: false,
                  reviewOnly: true,
                },
              },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain('href="/newsletter/example');
    expect(html).toContain("Open record: 雨");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Continue draft");
    expect(html).not.toContain("Review changes");
  });
});

describe("Row actions", () => {
  it("opens changed public records in review and returns to the library route", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        groups={[
          {
            name: "pages",
            href: "/content/pages",
            records: [
              {
                title: "A revised project",
                href: "/content/projects/example",
                status: "listed",
                changesPending: true,
                updated: { at: "2026-09-13T12:00:00Z", source: "private" },
              },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain(
      'href="/content/projects/example?returnTo=%2Fcontent%2Fpages&amp;view=review"',
    );
    expect(html).toContain("Review changes: A revised project");
    expect(html).not.toContain("Continue draft");
  });

  it("names the record kind even when a summary replaces the section", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        groups={[
          {
            name: "everything",
            href: "/content",
            records: [
              {
                title: "A project",
                href: "/content/projects/example",
                status: "listed",
                summary: "A summary that takes the section label's place.",
              },
              {
                title: "An article",
                href: "/content/writing/example",
                status: "published",
                summary: "Another summary.",
              },
            ],
          },
        ]}
      />,
    );
    // The glyph is the only remaining kind signal, so the kind must be text.
    expect(html).toContain("Project");
    expect(html).toContain("Article");
    expect(html).toContain('title="Project"');
    expect(html).toContain('title="Article"');
    // The action column header is announced rather than empty.
    expect(html).toContain("Action");
  });
  it("bounds the changed-field description on the row action", () => {
    // The tooltip renders on the client, so assert the bounding directly.
    expect(
      changedFieldSummary(["title", "summary", "hero", "seo", "links"]),
    ).toBe("title, summary +3");
    expect(changedFieldSummary(["title", "summary"])).toBe("title, summary");
    expect(changedFieldSummary(["title"])).toBe("title");
    expect(changedFieldSummary([])).toBe("Source changes");
    expect(changedFieldSummary(["a", "b", "c"])).not.toContain("\u00b7");
  });
});

describe("table language", () => {
  const mixed = [
    { title: "Live", href: "/content/writing/live", status: "published" },
    { title: "Draft", href: "/content/writing/draft", status: "draft" },
    {
      title: "Pending",
      href: "/content/writing/pending",
      status: "published",
      changesPending: true,
    },
    { title: "Quiet", href: "/content/writing/quiet", status: "hidden" },
  ];
  it("tints only public states and sums the view under the table", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        groups={[
          { name: "writing", href: "/content?group=writing", records: mixed },
        ]}
        selectedGroup="writing"
      />,
    );
    // Published is the default: it draws no chip, only its spoken name. Every
    // other state stays neutral. Each row renders its state twice: the State
    // column and the line that replaces it on phones.
    expect(html.match(/astryx-token green/g)).toBeNull();
    expect(html.match(/astryx-token default/g)).toHaveLength(4);
    expect(html.match(/<span class="sr-only">Published<\/span>/g)).toHaveLength(
      4,
    );
    expect(libraryFigures(mixed)).toEqual([
      ["public", 2],
      ["drafts", 1],
      ["hidden", 1],
      ["with changes pending", 1],
    ]);
    // The count that screen readers hear sits under the table, once.
    expect(html.match(/workspace-table-count"/g)).toHaveLength(1);
    expect(html.indexOf("</table>")).toBeLessThan(
      html.indexOf('aria-label="4 records"'),
    );
    expect(html).toContain(" records in view</span>");
    expect(html).toContain("<strong>2</strong> public");
  });
  it("lists no figures for an empty view", () => {
    expect(libraryFigures([])).toEqual([]);
  });
});
