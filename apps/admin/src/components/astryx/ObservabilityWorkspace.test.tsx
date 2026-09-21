// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../fixtures/ops_v1.sample.json";
import events from "../../fixtures/ops_events_v1.synthetic.json";
import {
  ObservabilityWorkspace,
  STATE_PRESENTATION,
} from "./ObservabilityWorkspace";
import { createPrivateReaderSession } from "../../lib/private-reader-client";
import {
  OPS_CREDENTIAL_ENDPOINT,
  OPS_POLL_MS,
  createOpsStatusController,
} from "../../lib/ops-reader";
import { OPS_V1_STATES } from "../../lib/ops-v1";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Json = Record<string, any>;
const NOW = Date.parse("2026-09-21T18:00:00Z");
const fresh = (): Json => structuredClone(sample) as Json;

function render(fixture: unknown) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <ObservabilityWorkspace enabled={false} fixture={fixture} now={NOW} />,
  );
  return host;
}
const rowFor = (host: HTMLElement, id: string) =>
  [...host.querySelectorAll("tbody tr")].find((row) =>
    row.textContent?.includes(id),
  ) as HTMLTableRowElement | undefined;
/** Column headers of the first table; every group table shares them. */
const headers = (host: HTMLElement) =>
  [...(host.querySelector("table")?.querySelectorAll("thead th") ?? [])].map(
    (th) => th.textContent,
  );
/** Group sections, in order, as their headings read. */
const groupTitles = (host: HTMLElement) =>
  [...host.querySelectorAll("section h2")].map(
    (heading) => heading.textContent,
  );
/** A cell by its column header, so optional columns never shift a test. */
const cell = (host: HTMLElement, id: string, header: string) => {
  const index = headers(host).indexOf(header);
  expect(index, header).toBeGreaterThan(-1);
  return rowFor(host, id)!.cells[index]!;
};
const stateCell = (row: HTMLTableRowElement) => row.cells[1]!;

describe("Status view from System's fixture", () => {
  const host = render(sample);

  it("puts hosts in a strip and every other entry in one table per group", () => {
    const strip = host.querySelector('ul[aria-label="Hosts"]')!;
    expect(strip.querySelectorAll("li")).toHaveLength(1);
    expect(strip.textContent).toContain("ap-mini");
    expect(strip.textContent).toContain("disk 70% used");
    expect(rowFor(host, "host.ap-mini")).toBeUndefined();
    expect(groupTitles(host)).toEqual([
      "Personal context",
      "Backups",
      "Health ingest",
      "Agent sessions",
      "Services",
    ]);
    const tables = [...host.querySelectorAll("table")];
    expect(tables).toHaveLength(5);
    expect(tables.map((table) => table.getAttribute("aria-label"))).toEqual([
      "personal context services",
      "backups services",
      "health ingest services",
      "agent sessions services",
      "services services",
    ]);
    const bodyRows = [...host.querySelectorAll("tbody tr")];
    expect(bodyRows).toHaveLength(sample.catalog.length - 1);
    expect(bodyRows.at(-1)?.textContent).toContain("imessage.agent");
  });

  it("renders every fixture state with a text label, not colour alone", () => {
    const expected: Record<string, string> = {
      "health.api": "OK",
      "keepalive.onepassword-connect": "Degraded",
      "pc.inference": "Failing",
      "pc.snapshot": "Stale",
      "health.ingest": "Unknown",
    };
    for (const [id, label] of Object.entries(expected)) {
      const state = stateCell(rowFor(host, id)!);
      expect(state.textContent).toContain(label);
      const dot = state.querySelector('[role="img"]')!;
      expect(dot.getAttribute("aria-hidden")).toBe("true");
    }
    expect(host.querySelector(".ops-summary")?.textContent).toBe(
      "14 entries: 10 ok, 1 degraded, 1 failing, 1 stale, 1 unknown",
    );
  });

  it("shows failing with exit 0 as System reports it, never inferring from the exit", () => {
    expect(cell(host, "pc.inference", "State").textContent).toBe(
      "Failinginference not ok",
    );
    expect(cell(host, "pc.inference", "Last exit").textContent).toBe("0");
    expect(
      cell(host, "pc.inference", "State")
        .querySelector("[data-variant]")
        ?.getAttribute("data-variant"),
    ).toBe("error");
  });

  it("never gives unknown the ok treatment", () => {
    const unknown = stateCell(rowFor(host, "health.ingest")!);
    const ok = stateCell(rowFor(host, "health.api")!);
    expect(
      unknown.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("neutral");
    expect(
      ok.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("success");
    expect(unknown.textContent).not.toContain("OK");
    for (const state of OPS_V1_STATES.filter((value) => value !== "ok"))
      expect(STATE_PRESENTATION[state].variant).not.toBe("success");
  });

  it("measures last success against each entry's own budget", () => {
    expect(cell(host, "pc.writer", "Last success").textContent).toBe(
      "15m agoWithin its 1h 15m budget",
    );
    expect(cell(host, "health.api", "Last success").textContent).toBe(
      "just nowLiveness only",
    );
    expect(cell(host, "health.ingest", "Last success").textContent).toBe(
      "No success recorded",
    );
  });

  it("shows a null-budget job's age with no stale judgement", () => {
    const value = fresh();
    value.status.find(
      (row: Json) => row.id === "health.ingest",
    ).last_success_at = "2026-09-18T18:00:00Z";
    const aged = render(value);
    expect(cell(aged, "health.ingest", "Last success").textContent).toBe(
      "3d agoNo freshness budget",
    );
    expect(cell(aged, "health.ingest", "Last success").textContent).not.toMatch(
      /Over|budget [0-9]/,
    );
  });

  it("shows schedule, exit, owner and a runbook link into System", () => {
    expect(headers(host)).toEqual([
      "Service",
      "State",
      "Last success",
      "Schedule",
      "Last exit",
      "Owner",
      "Runbook",
    ]);
    expect(cell(host, "pc.writer", "Schedule").textContent).toBe("hourly");
    expect(cell(host, "health.ingest", "Schedule").textContent).toBe(
      "when the phone pushes",
    );
    expect(cell(host, "pc.writer", "Last exit").textContent).toBe("0");
    expect(cell(host, "pc.writer", "Owner").textContent).toBe("memory");
    const link = cell(host, "pc.writer", "Runbook").querySelector("a")!;
    expect(link.getAttribute("href")).toBe(
      "https://github.com/anipotts/system/blob/main/docs/runbooks/ops-mini.md",
    );
    expect(link.getAttribute("aria-label")).toBe(
      "Runbook for personal context writer",
    );
    expect(cell(host, "health.api", "Last exit").textContent).toBe("None");
  });

  it("labels the source as the fixture, never as live", () => {
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "System sample fixture, generated just now",
    );
  });
});

describe("Status view edge cases", () => {
  it("renders a missing status row as unknown", () => {
    const value = fresh();
    value.status = value.status.filter((row: Json) => row.id !== "pc.writer");
    const state = stateCell(rowFor(render(value), "pc.writer")!);
    expect(state.textContent).toBe("UnknownNo status row from System");
    expect(
      state.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("neutral");
  });

  it("renders asleep, unknown groups and over-budget entries", () => {
    const value = fresh();
    value.catalog.push(
      {
        id: "host.ap-pro",
        name: "ap-pro",
        group: "hosts",
        kind: "host",
        host: "ap-pro",
        owner: "system",
        freshness_budget_s: 300,
        runbook: "docs/runbooks/ops-host.md",
        schedule: null,
      },
      {
        id: "web.site",
        name: "public site",
        group: "a brand new group",
        kind: "web",
        host: "cloudflare",
        owner: "site",
        freshness_budget_s: 60,
        runbook: "https://example.com/runbook",
        schedule: null,
      },
    );
    value.status.push(
      {
        id: "host.ap-pro",
        state: "asleep",
        detail: "host asleep",
        last_success_at: null,
        last_run_at: null,
        last_exit: null,
      },
      {
        id: "web.site",
        state: "ok",
        detail: "probe 200",
        last_success_at: "2026-09-21T17:55:00Z",
        last_run_at: null,
        last_exit: null,
      },
    );
    const host = render(value);
    const strip = host.querySelector('ul[aria-label="Hosts"]')!;
    expect(strip.textContent).toContain("Asleep");
    expect(cell(host, "web.site", "Last success").textContent).toBe(
      "5m agoOver its 1m budget",
    );
    expect(cell(host, "web.site", "Schedule").textContent).toBe("Not set");
    expect(
      cell(host, "web.site", "Runbook")
        .querySelector("a")
        ?.getAttribute("href"),
    ).toBe("https://example.com/runbook");
    expect(groupTitles(host).at(-1)).toBe("A brand new group");
  });

  it("shows the Schedule column only when an entry has a schedule", () => {
    expect(headers(render(sample))).toContain("Schedule");
    const value = fresh();
    for (const item of value.catalog) item.schedule = null;
    expect(headers(render(value))).not.toContain("Schedule");
  });

  it("puts entries in the hosts group in the strip, not the table", () => {
    const value = fresh();
    value.catalog.find((item: Json) => item.id === "health.api").group =
      "hosts";
    const host = render(value);
    expect(host.querySelector('ul[aria-label="Hosts"]')?.textContent).toContain(
      "health api",
    );
    expect(rowFor(host, "health.api")).toBeUndefined();
  });

  it("renders asleep calmly, apart from failing and from unknown", () => {
    const value = fresh();
    value.status.find((row: Json) => row.id === "health.api").state = "asleep";
    const host = render(value);
    const asleep = stateCell(rowFor(host, "health.api")!);
    const unknown = stateCell(rowFor(host, "health.ingest")!);
    const failing = stateCell(rowFor(host, "pc.inference")!);
    expect(asleep.textContent).toContain("Asleep");
    expect(asleep.querySelector("[data-variant]")).toBeNull();
    expect(asleep.querySelector("svg.ops-asleep-mark")).not.toBeNull();
    expect(
      unknown.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("neutral");
    expect(unknown.querySelector("svg.ops-asleep-mark")).toBeNull();
    expect(
      failing.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("error");
  });

  it("shows every value as last known once the sampler stops for over 3 minutes", () => {
    const at = (minutes: number) =>
      renderToStaticMarkup(
        <ObservabilityWorkspace
          enabled={false}
          fixture={sample}
          now={NOW + minutes * 60_000}
        />,
      );
    const within = document.createElement("div");
    within.innerHTML = at(3);
    expect(within.querySelector('[role="status"]')?.textContent).toBe(
      "System sample fixture, generated 3m ago",
    );
    expect(
      within.querySelector('tbody [data-variant="success"]'),
    ).not.toBeNull();

    const host = document.createElement("div");
    host.innerHTML = at(7);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Sampler stopped 7m ago; last known values",
    );
    expect(host.textContent).toContain("none of it is current");
    expect(host.querySelector(".ops-summary")?.textContent).toBe(
      "14 entries, none current until the sampler resumes",
    );
    // Nothing reads as ok: no success dot and no OK state label anywhere.
    expect(host.querySelector('[data-variant="success"]')).toBeNull();
    for (const label of host.querySelectorAll(".ops-state"))
      expect(label.textContent).toBe("Unknown");
    expect(stateCell(rowFor(host, "health.api")!).textContent).toBe(
      "UnknownLast known ok: running",
    );
    expect(stateCell(rowFor(host, "pc.inference")!).textContent).toBe(
      "UnknownLast known failing: inference not ok",
    );
    expect(host.querySelector('ul[aria-label="Hosts"]')?.textContent).toContain(
      "Last known ok: disk 70% used",
    );
  });

  it("shows nothing from a fixture that breaks the contract", () => {
    const value = fresh();
    value.catalog[0].extra = true;
    const host = render(value);
    expect(host.querySelector("table")).toBeNull();
  });
});

describe("Status connection states", () => {
  let host: HTMLDivElement;
  let root: Root;
  let hidden = false;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T18:01:00Z"));
    hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    vi.stubGlobal("fetch", vi.fn());
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("says not connected, and reads nothing, while the reader is off", async () => {
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled={false} />),
    );
    expect(host.textContent).toContain("Not connected");
    expect(host.textContent).toContain("switched off");
    expect(host.querySelector("table")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(OPS_POLL_MS * 2));
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  function live(reply: () => Response | Promise<Response>) {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === OPS_CREDENTIAL_ENDPOINT
        ? Response.json({
            credential: "cred",
            scope: ["ops:read"],
            expiresAt: Math.floor(Date.now() / 1000) + 60,
          })
        : reply(),
    ) as unknown as typeof fetch;
    const session = createPrivateReaderSession({
      fetch: fetcher,
      csrf: async () => "csrf",
      endpoint: OPS_CREDENTIAL_ENDPOINT,
    });
    return createOpsStatusController({
      session,
      fetch: fetcher,
      isHidden: () => hidden,
    });
  }

  it("renders a live snapshot, then marks it not current when the reader drops", async () => {
    let up = true;
    const controller = live(() => {
      if (!up) throw new TypeError("offline");
      return new Response(JSON.stringify(sample), {
        headers: { "content-type": "application/json", etag: '"a"' },
      });
    });
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Live, generated 1m ago",
    );
    expect(host.querySelector("table")).not.toBeNull();

    up = false;
    await act(() => vi.advanceTimersByTimeAsync(OPS_POLL_MS));
    expect(host.textContent).toContain("Reader unreachable");
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(
      /^Not current, generated/,
    );
    expect(host.querySelector("table")).not.toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("offers a retry when the reader cannot be reached at all", async () => {
    const controller = live(() => {
      throw new TypeError("offline");
    });
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.textContent).toContain("Not connected");
    expect(host.textContent).toContain("could not be reached");
    const retry = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();
  });

  const snapshotReply = () =>
    new Response(JSON.stringify(sample), {
      headers: { "content-type": "application/json", etag: '"a"' },
    });

  it("turns a live view into last known values when the sampler stops", async () => {
    let first = true;
    const controller = live(() => {
      if (first) {
        first = false;
        return snapshotReply();
      }
      return new Response(null, { status: 304 });
    });
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Live, generated 1m ago",
    );
    // The reader keeps answering 304 while generated_at stays 18:00.
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000 + 15_000));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Sampler stopped 3m ago; last known values",
    );
    expect(host.querySelector('[data-variant="success"]')).toBeNull();
    expect(host.textContent).not.toMatch(/Live,/);
  });

  it("says the reader has no valid snapshot on 503", async () => {
    const controller = live(() => new Response(null, { status: 503 }));
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.textContent).toContain("No snapshot yet");
    expect(host.textContent).toContain("no valid ops_v1 snapshot");
    expect(host.querySelector("table")).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent === "Try again",
      ),
    ).toBe(true);
  });

  it("says access was refused on 403 and reads nothing more", async () => {
    const reply = vi.fn(() => new Response(null, { status: 403 }));
    const controller = live(reply);
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.textContent).toContain("Access refused");
    expect(host.textContent).toContain("lacks ops:read");
    expect(host.querySelector("table")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(OPS_POLL_MS * 3));
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("clears the snapshot when the page is hidden for good (pagehide)", async () => {
    const controller = live(
      () =>
        new Response(JSON.stringify(sample), {
          headers: { "content-type": "application/json" },
        }),
    );
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.querySelector("table")).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(host.querySelector("table")).toBeNull();
    expect(host.textContent).toContain("Session ended");
  });
});

describe("Activity and Alerts from the synthetic events fixture", () => {
  const view = (name: "activity" | "alerts") => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <ObservabilityWorkspace
        view={name}
        enabled={false}
        fixture={sample}
        eventsFixture={events}
        now={NOW}
      />,
    );
    return host;
  };
  const rows = (host: HTMLElement) =>
    [...host.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");

  it("lists every event newest first, with access rows as route, status and latency", () => {
    const host = view("activity");
    expect(host.querySelector("h1")?.textContent).toBe("Activity");
    const lines = rows(host);
    expect(lines).toHaveLength(events.items.length);
    expect(lines[0]).toContain("Data sources, 200, 33 ms");
    expect(lines[1]).toContain("Data search, 200, 91 ms");
    expect(lines.at(-1)).toContain("first seen ok");
    const older = lines.findIndex((line) =>
      line.includes("Data search, 200, 84 ms"),
    );
    expect(older).toBeGreaterThan(1);
    expect(
      lines.find((line) => line.includes("nightly inference: ok to failing")),
    ).toBeDefined();
    // Access rows never carry query text or record ids.
    expect(host.textContent).not.toMatch(/rec-[0-9a-f]{32}|\?q=/);
  });

  it("names each event's source: catalog groups and reader access", () => {
    const host = view("activity");
    const index = headers(host).indexOf("Source");
    expect(index).toBeGreaterThan(-1);
    const sources = new Set(
      [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")].map(
        (row) => row.cells[index]?.textContent,
      ),
    );
    for (const label of [
      "Reader access",
      "Personal context",
      "Backups",
      "Agent sessions",
      "Services",
      "Health ingest",
      "Hosts",
    ])
      expect(sources.has(label), label).toBe(true);
  });

  it("lists firing alerts first, then resolved, each with a runbook", () => {
    const host = view("alerts");
    expect(host.querySelector("h1")?.textContent).toBe("Alerts");
    const lines = rows(host);
    expect(lines).toHaveLength(5);
    const firing = lines.slice(0, 3);
    expect(firing[0]).toContain("keepalive.onepassword-connect");
    expect(firing[0]).toContain("Degraded");
    expect(firing[1]).toContain("pc.inference");
    expect(firing[1]).toContain("Failing");
    expect(firing[2]).toContain("pc.snapshot");
    expect(firing[2]).toContain("Stale");
    for (const line of firing) expect(line).not.toContain("Resolved");
    expect(lines[3]).toContain("agents.sync");
    expect(lines[4]).toContain("pc.writer");
    for (const line of lines.slice(3)) expect(line).toContain("Resolved");
    // Unknown neither fires nor resolves.
    expect(host.textContent).not.toContain("health.ingest");
    const links = [
      ...host.querySelectorAll<HTMLAnchorElement>(
        'a[aria-label^="Runbook for"]',
      ),
    ];
    expect(links).toHaveLength(5);
    for (const link of links)
      expect(link.getAttribute("href")).toMatch(
        /^https:\/\/github\.com\/anipotts\/system\/blob\/main\//,
      );
    // Read only: nothing to acknowledge.
    expect(host.querySelectorAll("button")).toHaveLength(0);
    // Every chip keeps its text label; the dot variant only adds colour.
    const variants = [...host.querySelectorAll("tbody [data-variant]")].map(
      (element) => element.getAttribute("data-variant"),
    );
    expect(variants).toContain("error");
    expect(variants).toContain("success");
  });

  it("shows only a notice while ops reads are off", () => {
    for (const name of ["activity", "alerts"] as const) {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(
        <ObservabilityWorkspace view={name} enabled={false} now={NOW} />,
      );
      expect(host.textContent).toContain("Not connected");
      expect(host.querySelector("table")).toBeNull();
    }
  });
});
