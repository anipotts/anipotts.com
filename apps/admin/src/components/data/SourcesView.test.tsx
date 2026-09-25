// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import opsSample from "../../fixtures/ops_v1.sample.json";
import { createFixtureReader } from "../../lib/data-fixture-reader";
import { SourcesExplorer } from "./SourcesView";

// Synthetic source rows in System's shapes; no personal data.
const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const source = (id: string, extra: Record<string, unknown> = {}) => ({
  source_id: id,
  first_observed_at: ago(90_000),
  last_observed_at: ago(30),
  record_count: 5,
  revision_count: 6,
  ...extra,
});
const discovered = (id: string, extra: Record<string, unknown> = {}) =>
  source(id, {
    first_observed_at: null,
    last_observed_at: null,
    record_count: 0,
    revision_count: 0,
    ...extra,
  });
const sources = [
  // pc.writer in System's sample: ok, with a 75 minute budget.
  source("ani-browsing", {
    status: "current",
    host: "ap-pro",
    collection: "live",
    job: "pc.writer",
    last_success_at: ago(15),
  }),
  // pc.snapshot in System's sample: stale.
  source("ani-messages-1to1", {
    status: "current",
    host: "ap-pro",
    collection: "live",
    job: "pc.snapshot",
    last_success_at: ago(600),
  }),
  // As the reader serves it since system#231.
  source("ani-health", {
    status: "excluded",
    first_observed_at: "2026-09-22T17:44:54.119Z",
    last_observed_at: "2026-09-22T17:44:53.979Z",
    record_count: 0,
    revision_count: 92,
  }),
  // No status: an older reader.
  source("ani-contacts"),
  source("ani-contact-identity-map", { record_count: 1200 }),
  source("ani-food-orders", { collection: "one_shot" }),
  discovered("gmail-work"),
  discovered("gmail-school", { discovered_count: 40 }),
  discovered("gmail-personal"),
  ...Array.from({ length: 20 }, (_, index) =>
    discovered(`notes-extra-${index}`),
  ),
];

let root: Root;
let host: HTMLElement;
const settle = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      for (let j = 0; j < 5; j++) await Promise.resolve();
    });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("main");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(withOps = true) {
  const onCount = vi.fn();
  const reader = createFixtureReader({ status: {}, records: [], sources });
  await act(async () =>
    root.render(
      <SourcesExplorer
        reader={reader}
        onCount={onCount}
        ops={withOps ? { enabled: false, fixture: opsSample } : undefined}
      />,
    ),
  );
  await settle();
  return onCount;
}
const button = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) =>
      item.getAttribute("aria-label") === name ||
      item.textContent?.trim().startsWith(name),
  );

describe("Sources by connector", () => {
  it("A-4: reads every page and groups by lifecycle, discovered last and folded", async () => {
    const onCount = await render();
    // 28 rows over two fixture pages of 20.
    expect(onCount).toHaveBeenLastCalledWith(sources.length);
    const headings = [...host.querySelectorAll("th[scope=rowgroup]")].map(
      (cell) => cell.textContent,
    );
    expect(headings.slice(0, 4)).toEqual([
      "Live",
      "Imported once",
      // Records but no status or lifecycle from System: not "Connected".
      "Status not reported",
      "Excluded",
    ]);
    expect(headings[4]).toContain("Discovered, not connected");
    const fold = host.querySelector<HTMLButtonElement>(
      ".workspace-group-toggle",
    )!;
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("Gmail");
    // The folded heading counts the 23 discovered sources, not the two
    // family rows it draws or the 25 it draws open.
    expect(fold.textContent).toContain("23");
    await act(async () => fold.click());
    await act(async () => button("Gmail, 3 accounts")!.click());
    expect(fold.textContent).toContain("23");
    // A discovered source shows no 0/0 figures and no invented last sync.
    const gmail = button("Gmail, 3 accounts")!.closest("tr")!;
    expect(gmail.textContent).not.toMatch(/\b0\b/);
    expect(gmail.textContent).not.toContain("Never");
  });

  it("mirrors each live source's job, and shows only exceptions as chips", async () => {
    await render();
    const table = host.querySelector('table[aria-label="Sources"]')!;
    // Browsing's job is ok; Messages' job is stale in System's sample.
    expect(table.querySelector('[aria-label="Live"]')).not.toBeNull();
    expect(table.textContent).toContain("Stale");
    expect(table.textContent).not.toContain("Failed");
    expect(table.textContent).not.toContain("Unjudged");
  });

  it("A-7: calls a live source Unjudged, never Live, without the ops snapshot", async () => {
    await render(false);
    const table = host.querySelector('table[aria-label="Sources"]')!;
    expect(table.textContent).not.toContain("Stale");
    expect(table.querySelector('[aria-label="Live"]')).toBeNull();
    expect(table.textContent).toContain("Unjudged");
  });

  it("A-3: shows an excluded source apart, with nothing to open and System's own count", async () => {
    await render();
    const heading = [...host.querySelectorAll("th[scope=rowgroup]")].find(
      (cell) => cell.textContent === "Excluded",
    )!;
    const row = heading.closest("tr")!.nextElementSibling!;
    expect(row.textContent).toContain("Excluded");
    // System's counts as served: no retrievable records, 92 revisions kept.
    const cells = [...row.querySelectorAll("td")].map(
      (cell) => cell.textContent,
    );
    expect(cells).toContain("0");
    expect(cells).toContain("92");
    expect(row.querySelector("a")).toBeNull();
    expect(row.textContent).toContain("Withdrawn");
    expect(host.querySelector('a[href*="ani-health"]')).toBeNull();
  });

  it("A-3: names each status System serves, and Live only for current", async () => {
    const reader = createFixtureReader({
      status: {},
      records: [],
      sources: [
        source("ani-food-orders", { status: "current" }),
        source("manual", { status: "partial" }),
        source("ani-github-ledger", { status: "pending" }),
        source("photos-pro", { status: "unavailable" }),
        source("calendar-work", { status: "failed" }),
        source("meeting-notes", { status: "paused" }),
        source("ani-voice-memos", { status: "sometime-soon" }),
        source("ani-health", { status: "excluded", record_count: 0 }),
        discovered("gmail-work", { status: "discovered" }),
      ] as typeof sources,
    });
    await act(async () => root.render(<SourcesExplorer reader={reader} />));
    await settle();
    const table = host.querySelector('table[aria-label="Sources"]')!;
    expect(
      table.querySelectorAll('.workspace-state-quiet[aria-label="Live"]'),
    ).toHaveLength(1);
    expect(
      host
        .querySelector('a[aria-label="Food orders records"]')!
        .closest("tr")!
        .querySelector('[aria-label="Live"]'),
    ).not.toBeNull();
    for (const label of [
      "Syncing",
      "Unavailable",
      "Failed",
      "Paused",
      "Unjudged",
      "Excluded",
    ])
      expect(table.textContent).toContain(label);
    expect(table.querySelector('[aria-label="Connected"]')).not.toBeNull();
    // Only the status admin cannot read sits under Status not reported.
    const headings = [...host.querySelectorAll("th[scope=rowgroup]")].map(
      (cell) => cell.textContent,
    );
    expect(headings.slice(0, 3)).toEqual([
      "Connected",
      "Status not reported",
      "Excluded",
    ]);
    const unread = headings.indexOf("Status not reported");
    const group = [...host.querySelectorAll("th[scope=rowgroup]")][
      unread
    ]!.closest("tr")!.nextElementSibling!;
    expect(group.textContent).toContain("Unjudged");
  });

  // A-3: the newest record's observation is not a sync (Messages read
  // "Last sync 6d ago" while its intake passed 16m ago).
  it("A-3: heads the observation Last seen, and shows Last sync only from System's last_success_at", async () => {
    await render();
    const heads = () =>
      [...host.querySelectorAll('table[aria-label="Sources"] thead th')].map(
        (cell) => cell.textContent,
      );
    // The fixture's live sources carry last_success_at.
    expect(heads()).toContain("Last sync");
    expect(heads()).toContain("Last seen");
    // The live reader today: no source sends last_success_at.
    const reader = createFixtureReader({
      status: {},
      records: [],
      sources: sources.map((item) => {
        const { last_success_at: _gone, ...rest } = item as Record<
          string,
          unknown
        >;
        return rest;
      }) as typeof sources,
    });
    await act(async () => root.render(<SourcesExplorer reader={reader} />));
    await settle();
    expect(heads()).not.toContain("Last sync");
    expect(heads()).toContain("Last seen");
    const contacts = host
      .querySelector(
        'a[aria-label="Contacts records"], button[aria-label^="Contacts"]',
      )
      ?.closest("tr");
    expect(contacts?.textContent).toContain("30m ago");
  });

  it("opens Records filtered to a source from its row", async () => {
    await render();
    const link = host.querySelector<HTMLAnchorElement>(
      'a[aria-label="Browsing records"]',
    )!;
    expect(link.getAttribute("href")).toBe("/data/records?source=ani-browsing");
    expect(link.getAttribute("title")).toBe("ani-browsing");
  });

  it("folds a connector's accounts into one row that opens and closes", async () => {
    await render();
    await act(async () => button("Discovered, not connected")!.click());
    const gmail = button("Gmail, 3 accounts")!;
    expect(gmail.getAttribute("aria-expanded")).toBe("false");
    expect(gmail.closest("tr")!.textContent).toContain(
      "Personal, School, Work, 40 found",
    );
    expect(host.querySelector('a[aria-label="Gmail Work records"]')).toBeNull();
    await act(async () => gmail.click());
    expect(gmail.getAttribute("aria-expanded")).toBe("true");
    const work = host.querySelector<HTMLAnchorElement>(
      'a[aria-label="Gmail Work records"]',
    )!;
    expect(work.getAttribute("href")).toBe("/data/records?source=gmail-work");
    expect(work.closest(".sources-account")).not.toBeNull();
    await act(async () => gmail.click());
    expect(host.querySelector('a[aria-label="Gmail Work records"]')).toBeNull();
    // A discovered source is never drawn as broken.
    expect(host.textContent).not.toContain("Failed");
  });

  it("says a failed read plainly, naming the hop, and offers a retry", async () => {
    for (const [hop, title] of [
      [undefined, "Reader unavailable"],
      ["reader", "Reader unavailable"],
      ["unanswered", "No answer from ap-mini"],
      ["blocked", "Blocked by this browser"],
      ["offline", "Browser offline"],
      ["timeout", "ap-mini unreachable"],
    ] as const) {
      const reader = async () =>
        ({
          state: "unavailable",
          message: "",
          ...(hop ? { hop } : {}),
        }) as const;
      await act(async () => root.render(<SourcesExplorer reader={reader} />));
      await settle();
      expect(host.textContent).toContain(title);
      expect(button("Try again")).toBeTruthy();
      await act(async () => root.render(<></>));
    }
  });
});
