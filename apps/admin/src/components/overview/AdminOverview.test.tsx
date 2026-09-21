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
  it("orders alerts, health, recent content, then recent records", () => {
    expect(headings(render({}))).toEqual([
      "Overview",
      "Alerts",
      "Health",
      "Recent content",
      "Recent records",
    ]);
  });

  it("says not connected, honestly, while ops reads are off", () => {
    const host = render({});
    const alerts = host.querySelector("section")!;
    expect(alerts.textContent).toContain("Not connected");
    expect(alerts.querySelector("table")).toBeNull();
  });

  it("lists only firing alerts, from the same rules as Alerts", () => {
    const host = render({ fixture: snapshot, eventsFixture: events });
    const table = host.querySelector('table[aria-label="Firing alerts"]')!;
    const rows = [...table.querySelectorAll("tbody tr")].map(
      (row) => row.textContent,
    );
    expect(rows).toHaveLength(3);
    expect(rows.join(" ")).toContain("keepalive.onepassword-connect");
    expect(rows.join(" ")).toContain("pc.inference");
    expect(rows.join(" ")).toContain("pc.snapshot");
    expect(rows.join(" ")).not.toContain("agents.sync");
    expect(host.querySelector('ul[aria-label="Hosts"]')?.textContent).toContain(
      "ap-mini",
    );
  });

  it("links recent content to its editor", () => {
    const link = render({}).querySelector(
      'a[href="/content/writing/synthetic"]',
    );
    expect(link?.textContent).toBe("Synthetic article");
  });

  it("asks for a private session before any record shows", () => {
    const host = render({ dataEnabled: true });
    expect(host.textContent).toContain("Private session closed");
    expect(host.textContent).toContain("Open private session");
    expect(host.textContent).not.toContain("Sample person");
  });

  it("labels the synthetic Data preview as a fixture", () => {
    const host = render({ dataEnabled: true, dataFixture: data });
    expect(host.textContent).toContain("Synthetic fixture");
  });
});
