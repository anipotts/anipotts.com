// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import snapshot from "../../fixtures/ops_v1.sample.json";
import events from "../../fixtures/ops_events_v1.synthetic.json";
import data from "../../fixtures/data_v1.synthetic.json";
import { AdminOverview } from "./AdminOverview";

const NOW = Date.parse("2026-09-21T18:00:00Z");
const content = [
  {
    title: "Synthetic article",
    href: "/content/writing/synthetic",
    status: "published",
    collection: "writing",
    updated: { at: "2026-09-20T10:00:00Z", source: "git" as const },
  },
];

function render(props: Partial<React.ComponentProps<typeof AdminOverview>>) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <AdminOverview
      content={content}
      dataEnabled={false}
      enabled={false}
      now={NOW}
      {...props}
    />,
  );
  return host;
}
const headings = (host: HTMLElement) =>
  [...host.querySelectorAll("h1, h2")].map((heading) => heading.textContent);

describe("the one overview", () => {
  it("is alerts when firing, then recent content, then recent records", () => {
    expect(
      headings(render({ fixture: snapshot, eventsFixture: events })),
    ).toEqual(["Overview", "Alerts", "Recent content", "Recent records"]);
  });

  it("shows no alerts section and no health strip when nothing is firing", () => {
    const host = render({});
    expect(headings(host)).toEqual([
      "Overview",
      "Recent content",
      "Recent records",
    ]);
    expect(host.querySelector('[aria-label="Hosts"]')).toBeNull();
  });

  it("lists only firing alerts, from the same rules as Alerts", () => {
    const host = render({ fixture: snapshot, eventsFixture: events });
    const table = host.querySelector('table[aria-label="Firing alerts"]')!;
    const rows = [...table.querySelectorAll("tbody tr")].map(
      (row) =>
        `${row.textContent} ${row.querySelector("a.workspace-row-link")?.getAttribute("title")}`,
    );
    expect(
      [...table.querySelectorAll("thead th")].map((th) => th.textContent),
    ).toEqual(["Alert", "State", "Since"]);
    const link = table.querySelector("tbody a.workspace-row-link")!;
    expect(link.getAttribute("aria-label")).toMatch(/^Open runbook for /);
    expect(link.getAttribute("target")).toBe("_blank");
    // No runbook column and no link buttons: the row is the link.
    expect(table.querySelectorAll("a")).toHaveLength(3);
    expect(rows).toHaveLength(3);
    expect(rows.join(" ")).toContain("pc.inference");
    expect(rows.join(" ")).not.toContain("agents.sync");
  });

  it("shows each recent Content row as title, type, state and updated", () => {
    const host = render({});
    const table = host.querySelector(
      'table[aria-label="Recently updated content"]',
    )!;
    expect(
      [...table.querySelectorAll("thead th")].map((th) => th.textContent),
    ).toEqual(["Title", "Type", "State", "Updated"]);
    const link = table.querySelector('a[href="/content/writing/synthetic"]');
    expect(link?.textContent).toBe("Synthetic article");
    expect(table.querySelector("tbody tr")?.textContent).toContain("Writing");
  });

  it("opens the private session without a click and narrates nothing", () => {
    const host = render({ dataEnabled: true });
    expect(host.textContent).not.toContain("Open private session");
    expect(host.textContent).not.toMatch(/memory only|credential/i);
    expect(
      host.querySelector(
        '[aria-label="Loading recent records"], [aria-label="Loading records"]',
      ),
    ).not.toBeNull();
  });

  it("marks synthetic data once", () => {
    const host = render({ dataEnabled: true, dataFixture: data });
    expect(host.textContent?.match(/Sample data/g)).toHaveLength(1);
  });
});
