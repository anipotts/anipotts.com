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

  it("names a restore that was never proven, so it never reads all clear", () => {
    const value = structuredClone(snapshot) as Record<string, any>;
    // Every entry ok, so only the drill can keep the section.
    for (const row of value.status) Object.assign(row, { state: "ok" });
    value.catalog.push({
      ...value.catalog[1],
      id: "backup.restore-drill",
      name: "restore drill",
      group: "recovery",
      kind: "job",
      freshness_budget_s: null,
      schedule: "monthly",
    });
    value.status.push({
      id: "backup.restore-drill",
      state: "ok",
      detail: "never_run",
      last_success_at: null,
      last_run_at: null,
      last_exit: null,
    });
    // No firing alerts: before this, the section was absent and read clear.
    const quiet = { ...events, items: [] };
    const host = render({ fixture: value, eventsFixture: quiet });
    expect(headings(host)).toContain("Alerts");
    const link = host.querySelector("a.overview-unverified")!;
    expect(link.textContent).toBe("1 Unverified");
    expect(link.getAttribute("href")).toBe(
      "/observability/status?entry=backup.restore-drill",
    );
    expect(host.querySelector('table[aria-label="Firing alerts"]')).toBeNull();
  });

  // A-31: a problem the snapshot shows with no opening transition in the
  // events held (older than System's 35 days, or not read yet) still fires.
  it("A-31: lists a snapshot problem with no transition as firing, its start unknown", () => {
    const quiet = { ...events, items: [] };
    const host = render({ fixture: snapshot, eventsFixture: quiet });
    const table = host.querySelector('table[aria-label="Firing alerts"]')!;
    const text = table.textContent ?? "";
    // pc.inference is failing in System's sample.
    expect(
      [...table.querySelectorAll("a.workspace-row-link")]
        .map((link) => link.getAttribute("title"))
        .join(" "),
    ).toContain("pc.inference");
    expect(text).toContain("Failing");
    // No event is held, so no start is made up.
    expect(text).toContain("Unknown");
    expect(text).not.toMatch(/\d+[smhd] ago/);
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

  it("keeps a draft's state and its pending changes whole in the state column (A-29)", () => {
    const host = render({
      content: [
        {
          ...content[0]!,
          status: "draft",
          changesPending: true,
        },
      ],
    });
    const table = host.querySelector(
      'table[aria-label="Recently updated content"]',
    )!;
    const state = table.querySelectorAll("tbody td")[1]!;
    // One chip for the state, one named glyph for the pending changes, and
    // no second chip to be cut at the column's edge.
    expect(state.querySelectorAll(".workspace-state")).toHaveLength(1);
    expect(state.textContent).toBe("Draft");
    const pending = state.querySelector(".overview-pending")!;
    expect(pending.getAttribute("role")).toBe("img");
    expect(pending.getAttribute("aria-label")).toBe("Changes pending");
    expect(pending.getAttribute("title")).toBe("Changes pending");
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
    expect(tail("Firing alerts")).toEqual(["144px", "116px"]);
    expect(tail("Recently updated content")).toEqual(["144px", "116px"]);
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
    // No recent record has a state to show, so the column holds the tier
    // glyphs under an assistive heading, never an empty "State" over them.
    const heads = [...table.querySelectorAll("thead th")];
    expect(heads.map((th) => th.textContent)).toEqual([
      "Record",
      "Source",
      "Tier",
      "Occurred",
    ]);
    expect(heads[2]!.querySelector(".sr-only")).not.toBeNull();
    expect(
      heads.slice(-2).map((th) => (th as HTMLElement).style.width),
    ).toEqual(["56px", "116px"]);
    expect(
      table.querySelectorAll('tbody td[data-column="state"] .workspace-tier')
        .length,
    ).toBe(table.querySelectorAll("tbody tr").length);
    // System's order: newest occurred date first, as stored text.
    const titles = [...table.querySelectorAll("tbody tr")].map(
      (row) => row.querySelector(".workspace-row-title")?.textContent,
    );
    expect(titles.slice(0, 2)).toEqual([
      "Received message",
      "Browsing, Sep 21",
    ]);
    const browsing = table.querySelectorAll("tbody tr")[1]!;
    expect(browsing.querySelector('[data-mark="chrome"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/\bAni\b/);
    act(() => root.unmount());
  });

  it("marks synthetic data once", () => {
    const host = render({ dataEnabled: true, dataFixture: data });
    expect(host.textContent?.match(/Sample data/g)).toHaveLength(1);
  });
});
