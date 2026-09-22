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

  it("lists only firing alerts, each opening its alert in admin", () => {
    const host = render({ fixture: snapshot, eventsFixture: events });
    const table = host.querySelector('table[aria-label="Firing alerts"]')!;
    expect(
      [...table.querySelectorAll("thead th")].map((th) => th.textContent),
    ).toEqual(["Alert", "State", "Since"]);
    // An alert opens in admin first; its runbook is an action there.
    const links = [...table.querySelectorAll("tbody a.workspace-row-link")];
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        /^\/observability\/alerts\?alert=/,
      );
      expect(link.getAttribute("target")).toBeNull();
    }
    // No runbook column, no link buttons and no outside link: the row is the
    // link, and the mono id rides in the tooltip.
    expect(table.querySelectorAll("a")).toHaveLength(3);
    const tooltips = links.map((link) => link.getAttribute("title")).join(" ");
    expect(tooltips).toContain("pc.inference");
    expect(tooltips).not.toContain("agents.sync");
    // The brand word is the tile's: "1password connect" reads "Connect".
    expect(links.map((link) => link.textContent)).toContain("Connect");
    expect(table.querySelector('[data-mark="1password"]')).not.toBeNull();
  });

  it("links every section heading to its page, and nothing says View all", () => {
    const host = render({ fixture: snapshot, eventsFixture: events });
    const heading = (name: string) =>
      [...host.querySelectorAll("h2")].find((h) => h.textContent === name)!;
    expect(heading("Alerts").querySelector("a")?.getAttribute("href")).toBe(
      "/observability/alerts",
    );
    expect(
      heading("Recent records").querySelector("a")?.getAttribute("href"),
    ).toBe("/data/records");
    expect(
      heading("Recent content").querySelector("a")?.getAttribute("href"),
    ).toBe("/content/pages");
    expect(host.textContent).not.toContain("View all");
    expect(host.textContent).not.toContain("session");
  });

  it("shows each recent Content row as its type tile, title, state and time", () => {
    const host = render({});
    const table = host.querySelector(
      'table[aria-label="Recently updated content"]',
    )!;
    expect(
      [...table.querySelectorAll("thead th")].map((th) => th.textContent),
    ).toEqual(["Title", "State", "Updated"]);
    const link = table.querySelector('a[href="/content/writing/synthetic"]');
    expect(link?.textContent).toBe("Synthetic article");
    // The kind is the tile alone, named for assistive technology.
    const tile = table.querySelector("tbody .workspace-row-mark")!;
    expect(tile.getAttribute("title")).toBe("Writing");
    expect(table.querySelectorAll(".workspace-kind")).toHaveLength(0);
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

  it("lines the state and time columns up across its sections", () => {
    const host = render({ fixture: snapshot, eventsFixture: events });
    const tail = (label: string) =>
      [...host.querySelectorAll(`table[aria-label="${label}"] thead th`)]
        .slice(-2)
        .map((th) => (th as HTMLElement).style.width);
    expect(tail("Firing alerts")).toEqual(["144px", "112px"]);
    expect(tail("Recently updated content")).toEqual(["144px", "112px"]);
  });

  it("shows each recent record as one row: tile, title, source, state and time", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <AdminOverview
          content={content}
          dataEnabled
          dataFixture={data as never}
          enabled={false}
          now={NOW}
        />,
      ),
    );
    for (let i = 0; i < 10; i++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const table = host.querySelector('table[aria-label="Recent records"]')!;
    expect(
      [...table.querySelectorAll("thead th")].map((th) => th.textContent),
    ).toEqual(["Record", "Source", "State", "Observed"]);
    expect(
      [...table.querySelectorAll("thead th")]
        .slice(-2)
        .map((th) => (th as HTMLElement).style.width),
    ).toEqual(["144px", "112px"]);
    const first = table.querySelector("tbody tr")!;
    expect(first.querySelector(".workspace-row-title")?.textContent).toBe(
      "Browsing, Sep 21",
    );
    expect(first.querySelector('[data-mark="chrome"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/\bAni\b/);
    act(() => root.unmount());
  });

  it("marks synthetic data once", () => {
    const host = render({ dataEnabled: true, dataFixture: data });
    expect(host.textContent?.match(/Sample data/g)).toHaveLength(1);
  });
});
