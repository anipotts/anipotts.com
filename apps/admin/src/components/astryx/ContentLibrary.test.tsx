import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContentLibrary,
  matchingRecords,
  recentlyUpdated,
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
    expect(html).toContain("Up to date");
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
  it("offers recent acknowledged work before the attention-ordered library", () => {
    const html = renderToStaticMarkup(
      <ContentLibrary
        groups={[
          {
            name: "pages",
            href: "/content",
            records: [
              {
                title: "Older local work",
                href: "/content/writing/older",
                status: "draft",
                updated: { at: "2026-09-10T12:00:00Z", source: "local" },
              },
              {
                title: "Fresh draft",
                href: "/content/writing/fresh",
                status: "draft",
                updated: { at: "2026-09-11T12:00:00Z", source: "private" },
              },
              {
                title: "Git update",
                href: "/content/writing/git",
                status: "published",
                updated: { at: "2026-09-12T12:00:00Z", source: "git" },
              },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain("Recently edited");
    expect(html).toContain("Needs attention");
    const resume = html.slice(
      html.indexOf("Recently edited"),
      html.indexOf('placeholder="Search records"'),
    );
    expect(resume.indexOf("Fresh draft")).toBeLessThan(
      resume.indexOf("Older local work"),
    );
    expect(resume).not.toContain("Git update");
  });
});
