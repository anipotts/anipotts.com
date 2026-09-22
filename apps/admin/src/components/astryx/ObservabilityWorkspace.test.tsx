// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../fixtures/ops_v1.sample.json";
import events from "../../fixtures/ops_events_v1.synthetic.json";
import {
  ObservabilityWorkspace,
  opsAlertHref,
  opsAlertParam,
} from "./ObservabilityWorkspace";
import { badgeFor } from "../workspace/Workspace";
import { createPrivateReaderSession } from "../../lib/private-reader-client";
import {
  OPS_CREDENTIAL_ENDPOINT,
  OPS_POLL_MS,
  createOpsStatusController,
} from "../../lib/ops-reader";
import { sharedLiveClock } from "../../lib/live-clock";
import { OPS_V1_STATES } from "../../lib/ops-v1";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Json = Record<string, any>;
const NOW = Date.parse("2026-09-21T18:00:00Z");
const fresh = (): Json => structuredClone(sample) as Json;

function render(fixture: unknown, now = NOW) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <ObservabilityWorkspace enabled={false} fixture={fixture} now={now} />,
  );
  return host;
}
/** A Status row by its catalog id, from the row's anchor. */
const rowFor = (host: HTMLElement, id: string) =>
  host.querySelector(`[id="entry-${id}"]`)?.closest("tr") as
    HTMLTableRowElement | null | undefined;
const bodyRows = (host: HTMLElement) =>
  [
    ...host.querySelectorAll("tbody tr:not([data-group-row])"),
  ] as HTMLTableRowElement[];
const headers = (host: HTMLElement) =>
  [...(host.querySelector("table")?.querySelectorAll("thead th") ?? [])].map(
    (th) => th.textContent,
  );
const groupTitles = (host: HTMLElement) =>
  [...host.querySelectorAll('tbody th[scope="rowgroup"]')].map(
    (heading) => heading.textContent,
  );
/** A cell by its column header, so optional columns never shift a test. */
const cell = (host: HTMLElement, id: string, header: string) => {
  const index = headers(host).indexOf(header);
  expect(index, header).toBeGreaterThan(-1);
  return rowFor(host, id)!.cells[index]!;
};
const stateCell = (row: HTMLTableRowElement) => row.cells[1]!;
/** The page's one status line under the title. */
const meta = (host: HTMLElement) =>
  host.querySelector(".workspace-page-title")?.lastElementChild?.textContent;

describe("Status view from System's fixture", () => {
  const host = render(sample);

  it("puts hosts in a strip and every other entry in one table, a heading row per group", () => {
    const strip = host.querySelector('ul[aria-label="Hosts"]')!;
    expect(strip.querySelectorAll("li")).toHaveLength(1);
    expect(strip.textContent).toContain("ap-mini");
    expect(strip.textContent).toContain("disk 70% used");
    // The host's device render leads its line.
    expect(strip.querySelector(".brand-tile")?.getAttribute("data-mark")).toBe(
      "ap-mini",
    );
    expect(rowFor(host, "host.ap-mini")).toBeNull();
    expect(host.querySelectorAll("table")).toHaveLength(1);
    expect(host.querySelector("table")?.getAttribute("aria-label")).toBe(
      "Status entries",
    );
    expect(groupTitles(host)).toEqual([
      "Personal context",
      "Backups",
      "Health ingest",
      "Agent sessions",
      "Services",
    ]);
    const rows = bodyRows(host);
    expect(rows).toHaveLength(sample.catalog.length - 1);
    expect(rows.at(-1)?.querySelector('[id="entry-imessage.agent"]')).not.toBe(
      null,
    );
    expect(host.querySelector("h1")?.nextElementSibling?.textContent).toBe(
      String(sample.catalog.length),
    );
  });

  it("leads each row with its brand or kind tile and drops the brand word", () => {
    const connect = rowFor(host, "keepalive.onepassword-connect")!;
    expect(
      connect.querySelector(".brand-tile")?.getAttribute("data-mark"),
    ).toBe("1password");
    expect(connect.querySelector(".workspace-row-title")?.textContent).toBe(
      "Connect",
    );
    expect(
      rowFor(host, "keepalive.chatgpt")!.querySelector(".workspace-row-title")
        ?.textContent,
    ).toBe("Session");
    expect(
      rowFor(host, "pc.writer")!.querySelector(".workspace-row-title")
        ?.textContent,
    ).toBe("Personal context writer");
    // The mono id is never row text; it rides in the tooltip.
    expect(host.querySelector(".ops-id")).toBeNull();
    expect(connect.textContent).not.toContain("keepalive.onepassword-connect");
    expect(
      connect.querySelector("a.workspace-row-link")?.getAttribute("title"),
    ).toBe("Runbook on GitHub\nkeepalive.onepassword-connect");
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
      // OK is the default: its name is spoken, and no chip is drawn.
      if (label === "OK") {
        expect(state.querySelector(".workspace-state")).toBeNull();
        continue;
      }
      const dot = state.querySelector('[role="img"]');
      if (dot) expect(dot.getAttribute("aria-hidden")).toBe("true");
      else
        expect(
          state
            .querySelector("svg.workspace-state-mark")
            ?.getAttribute("aria-hidden"),
        ).toBe("true");
    }
  });

  it("sums only the exceptions, most severe first, as count chips", () => {
    const counts = host.querySelector('ul[aria-label="Not ok"]')!;
    expect(
      [...counts.querySelectorAll("li")].map((item) => item.textContent),
    ).toEqual(["1 Failing", "1 Degraded", "1 Stale", "1 Unknown"]);
    const clear = fresh();
    for (const row of clear.status) row.state = "ok";
    expect(render(clear).querySelector('ul[aria-label="Not ok"]')).toBeNull();
  });

  it("shows failing with exit 0 as System reports it, and a non-zero exit as a critical figure", () => {
    expect(cell(host, "pc.inference", "State").textContent).toBe(
      "Failinginference not ok",
    );
    expect(
      cell(host, "pc.inference", "State")
        .querySelector("[data-variant]")
        ?.getAttribute("data-variant"),
    ).toBe("error");
    const exit = cell(host, "keepalive.onepassword-connect", "State");
    expect(exit.querySelector(".ops-exit")?.textContent).toBe("exit 1");
    expect(headers(host)).not.toContain("Last exit");
  });

  it("never gives unknown the ok treatment", () => {
    const unknown = stateCell(rowFor(host, "health.ingest")!);
    const ok = stateCell(rowFor(host, "health.api")!);
    expect(
      unknown.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("neutral");
    // OK draws no chip at all, so nothing else can borrow its look.
    expect(ok.querySelector("[data-variant]")).toBeNull();
    expect(ok.textContent).toContain("OK");
    expect(unknown.textContent).not.toContain("OK");
    for (const state of OPS_V1_STATES.filter((value) => value !== "ok")) {
      expect(badgeFor("ops", state).tone).not.toBe("positive");
      expect(badgeFor("ops", state).isDefault).toBeUndefined();
    }
  });

  it("reads last success in the one age format, naming a budget only once it is over", () => {
    expect(cell(host, "pc.writer", "Last success").textContent).toBe("15m ago");
    expect(cell(host, "health.api", "Last success").textContent).toBe(
      "just now",
    );
    expect(cell(host, "pc.inference", "Last success").textContent).toBe(
      "2d agoover 26h",
    );
    // Never succeeded: left blank.
    expect(cell(host, "health.ingest", "Last success").textContent).toBe("");
  });

  it("shows a null-budget job's age with no stale judgement", () => {
    const value = fresh();
    value.status.find(
      (row: Json) => row.id === "health.ingest",
    ).last_success_at = "2026-09-18T18:00:00Z";
    expect(
      cell(render(value), "health.ingest", "Last success").textContent,
    ).toBe("3d ago");
  });

  it("shows schedule and owner, and the whole row opens the runbook on GitHub", () => {
    expect(headers(host)).toEqual([
      "Service",
      "State",
      "Last success",
      "Schedule",
      "Owner",
    ]);
    expect(cell(host, "pc.writer", "Schedule").textContent).toBe("hourly");
    expect(cell(host, "health.ingest", "Schedule").textContent).toBe(
      "when the phone pushes",
    );
    expect(cell(host, "pc.writer", "Owner").textContent).toBe("memory");
    const link = rowFor(host, "pc.writer")!.querySelector(
      "a.workspace-row-link",
    )!;
    expect(link.getAttribute("href")).toBe(
      "https://github.com/anipotts/system/blob/main/docs/runbooks/ops-mini.md",
    );
    expect(link.getAttribute("aria-label")).toBe(
      "Personal context writer, runbook on GitHub",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    // No trailing external-link squares anywhere.
    expect(host.innerHTML).not.toMatch(/ArrowSquareOut|workspace-row-reveal/);
  });

  it("labels the source as the fixture, never as live, and announces no age", () => {
    expect(meta(host)).toBe("Generated just now");
    expect(host.textContent).toContain("Sample data");
    expect(host.querySelector('.workspace-page-header [role="status"]')).toBe(
      null,
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

  it("renders asleep hosts, unknown groups and over-budget entries", () => {
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
    expect(
      [...strip.querySelectorAll(".brand-tile")].map((tile) =>
        tile.getAttribute("data-mark"),
      ),
    ).toEqual(["ap-mini", "ap-pro"]);
    expect(cell(host, "web.site", "Last success").textContent).toBe(
      "5m agoover 1m",
    );
    // An empty value is left blank.
    expect(cell(host, "web.site", "Schedule").textContent).toBe("");
    const link = rowFor(host, "web.site")!.querySelector(
      "a.workspace-row-link",
    )!;
    expect(link.getAttribute("href")).toBe("https://example.com/runbook");
    expect(link.getAttribute("title")).toBe("Runbook\nweb.site");
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
    expect(rowFor(host, "health.api")).toBeNull();
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
    expect(asleep.querySelector("svg.workspace-state-mark")).not.toBeNull();
    expect(
      unknown.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("neutral");
    expect(unknown.querySelector("svg.workspace-state-mark")).toBeNull();
    expect(
      failing.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("error");
  });

  it("shows every value as last known once the sampler stops for over 60 seconds", () => {
    const within = render(sample, NOW + 30_000);
    // The line changes at most once a minute.
    expect(meta(within)).toBe("Generated just now");
    expect(
      [...within.querySelectorAll("tbody .ops-state")].some(
        (label) => label.textContent === "OK",
      ),
    ).toBe(true);

    const host = render(sample, NOW + 7 * 60_000);
    expect(meta(host)).toBe("Last known values");
    expect(host.textContent).toContain("Sampler stopped 7m ago");
    // One notice: the stopped sampler says it, so no summary repeats it.
    expect(host.querySelector('ul[aria-label="Not ok"]')).toBeNull();
    expect(host.textContent?.match(/Sampler stopped/g)).toHaveLength(1);
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
    expect(host.textContent).toContain("Fixture rejected");
  });
});

describe("Status connection states", () => {
  let host: HTMLDivElement;
  let root: Root;
  let hidden = false;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T18:00:30Z"));
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

  it("says the reader is off, and reads nothing", async () => {
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled={false} />),
    );
    expect(host.textContent).toContain("Reader off");
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

  it("draws a skeleton shaped like the page while it connects", async () => {
    const controller = live(() => new Promise<Response>(() => {}));
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled controller={controller} />),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(host.querySelector('[aria-label="Loading status"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/Connecting/);
  });

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
    expect(meta(host)).toBe("Live, generated just now");
    expect(host.querySelector("table")).not.toBeNull();

    up = false;
    await act(() => vi.advanceTimersByTimeAsync(OPS_POLL_MS));
    expect(host.textContent).toContain("ap-mini unreachable");
    expect(meta(host)).toMatch(/^Not current, generated/);
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
    expect(host.textContent).toContain("ap-mini unreachable");
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
    expect(meta(host)).toBe("Live, generated just now");
    // The reader keeps answering 304 while generated_at stays 18:00.
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000 + 15_000));
    expect(meta(host)).toBe("Last known values");
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

describe("a fixture reads a fixed clock", () => {
  it("runs no timer, so nothing re-renders every second", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    for (const view of ["status", "activity", "alerts"] as const) {
      await act(async () =>
        root.render(
          <ObservabilityWorkspace
            view={view}
            enabled={false}
            fixture={sample}
            eventsFixture={events}
          />,
        ),
      );
      expect(host.querySelector("table")).not.toBeNull();
      expect(sharedLiveClock().running()).toBe(false);
    }
    await act(async () => root.unmount());
  });
});

describe("Activity and Alerts from the synthetic events fixture", () => {
  const view = (name: "activity" | "alerts", alert: string | null = null) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <ObservabilityWorkspace
        view={name}
        alert={alert}
        enabled={false}
        fixture={sample}
        eventsFixture={events}
        now={NOW}
      />,
    );
    return host;
  };
  // Row text plus the title's tooltip, which carries the id and detail.
  const rows = (host: HTMLElement, scope: ParentNode = host) =>
    [...scope.querySelectorAll("tbody tr:not([data-group-row])")].map(
      (row) =>
        `${row.textContent ?? ""} ${row.querySelector(".workspace-row-link, .workspace-row-text")?.getAttribute("title") ?? ""}`,
    );

  it("lists every event newest first by day, with access rows as route and latency", () => {
    const host = view("activity");
    expect(host.querySelector("h1")?.textContent).toBe("Activity");
    const lines = rows(host);
    // Admin's own ops polling (ops.snapshot, ops.events) is left out by
    // default; the source menu lists it with its count.
    const polling = events.items.filter(
      (item) =>
        item.subject === "ops.snapshot" || item.subject === "ops.events",
    ).length;
    expect(polling).toBeGreaterThan(0);
    expect(lines).toHaveLength(events.items.length - polling);
    expect(host.querySelector("h1")?.nextElementSibling?.textContent).toBe(
      String(lines.length),
    );
    expect(host.textContent).not.toContain("Ops events");
    const line = (row: Element) =>
      [".workspace-row-title", ".workspace-row-secondary"]
        .map((part) => row.querySelector(part)?.textContent)
        .join(", ");
    expect(line(bodyRows(host)[0]!)).toBe("Data sources, 33 ms");
    expect(line(bodyRows(host)[1]!)).toBe("Data search, 91 ms");
    expect(lines.at(-1)).toContain("First seen ok");
    expect(lines.find((line) => line.includes("Nightly inference"))).toContain(
      "OK to failing",
    );
    // Days head the groups; times are clock times within them.
    expect(groupTitles(host)).toEqual(["Today", "Yesterday"]);
    expect(host.querySelector("tbody time")?.textContent).toMatch(
      /^\d{1,2}:\d{2}\s?[AP]M$/,
    );
    expect(host.textContent).not.toMatch(/\bago\b/);
    // Access rows never carry query text or record ids.
    expect(host.textContent).not.toMatch(/rec-[0-9a-f]{32}|\?q=/);
  });

  it("draws a chip only for a non-ok new state or an access failure", () => {
    const host = view("activity");
    const chips = [...host.querySelectorAll("tbody .workspace-state")].map(
      (chip) => chip.textContent,
    );
    expect(chips).toContain("400");
    expect(chips).toContain("Failing");
    expect(chips).not.toContain("200");
    expect(chips).not.toContain("OK");
    // The reader's route rows lead with the tailnet when System names no
    // device.
    const access = bodyRows(host)[0]!;
    expect(access.querySelector(".brand-tile")?.getAttribute("data-mark")).toBe(
      "tailscale",
    );
  });

  it("leads a reader access with the device that made it", () => {
    const access = (seq: number, device: string | null) => ({
      seq,
      at: `2026-09-21T17:${String(10 + seq).padStart(2, "0")}:00Z`,
      kind: "access",
      subject: "data.search",
      from_state: null,
      to_state: null,
      status: 200,
      ms: 40 + seq,
      detail: null,
      device,
    });
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <ObservabilityWorkspace
        view="activity"
        enabled={false}
        fixture={sample}
        eventsFixture={{
          version: "ops_events_v1",
          items: [access(1, "ap-phone"), access(2, "ap-pro"), access(3, null)],
          next_after: null,
        }}
        now={NOW}
      />,
    );
    const marks = bodyRows(host).map((row) => [
      row.querySelector(".brand-tile")?.getAttribute("data-mark"),
      row.querySelector(".workspace-row-mark")?.getAttribute("title"),
    ]);
    expect(marks).toEqual([
      ["tailscale", "Reader access"],
      ["ap-pro", "Reader access from ap-pro"],
      ["ap-phone", "Reader access from ap-phone"],
    ]);
  });

  it("caps a long feed and steps it with Show more", async () => {
    const items = Array.from({ length: 150 }, (_, index) => ({
      seq: index + 1,
      at: new Date(NOW - (150 - index) * 60_000)
        .toISOString()
        .replace(".000Z", "Z"),
      kind: "access",
      subject: "data.search",
      from_state: null,
      to_state: null,
      status: 200,
      ms: 20,
      detail: null,
    }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          view="activity"
          enabled={false}
          fixture={sample}
          eventsFixture={{ version: "ops_events_v1", items, next_after: null }}
        />,
      ),
    );
    expect(bodyRows(host)).toHaveLength(100);
    expect(host.querySelector("h1")?.nextElementSibling?.textContent).toBe(
      "150",
    );
    const more = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Show more",
    )!;
    await act(async () => more.click());
    expect(bodyRows(host)).toHaveLength(150);
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent === "Show more",
      ),
    ).toBe(false);
    await act(async () => root.unmount());
  });

  it("names each event's source: catalog groups and reader access", () => {
    const host = view("activity");
    const index = headers(host).indexOf("Source");
    expect(index).toBeGreaterThan(-1);
    const sources = new Set(
      bodyRows(host).map((row) => row.cells[index]?.textContent),
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

  it("splits alerts into Firing and Resolved, each row opening in admin", () => {
    const host = view("alerts");
    expect(host.querySelector("h1")?.textContent).toBe("Alerts");
    expect(
      [...host.querySelectorAll("section h2")].map((h) => h.textContent),
    ).toEqual(["Firing", "Resolved"]);
    const firingTable = host.querySelector(
      'table[aria-label="Firing alerts"]',
    )!;
    const resolvedTable = host.querySelector(
      'table[aria-label="Resolved alerts"]',
    )!;
    const firing = rows(host, firingTable);
    expect(firing).toHaveLength(3);
    expect(firing[0]).toContain("keepalive.onepassword-connect");
    expect(firing[0]).toContain("Degraded");
    expect(firing[1]).toContain("pc.inference");
    expect(firing[1]).toContain("Failing");
    expect(firing[2]).toContain("pc.snapshot");
    expect(firing[2]).toContain("Stale");
    const resolved = rows(host, resolvedTable);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toContain("agents.sync");
    expect(resolved[1]).toContain("pc.writer");
    // Resolved rows say what they were, with no chip: not an exception.
    expect(resolvedTable.querySelector("[data-variant]")).toBeNull();
    expect(
      [...resolvedTable.querySelectorAll("thead th")].map(
        (th) => th.textContent,
      ),
    ).toEqual(["Alert", "State", "Resolved"]);
    // Unknown neither fires nor resolves.
    expect(host.textContent).not.toContain("health.ingest");
    const links = [
      ...host.querySelectorAll<HTMLAnchorElement>("a.workspace-row-link"),
    ];
    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        /^\/observability\/alerts\?alert=/,
      );
      expect(link.getAttribute("target")).toBeNull();
    }
    // Read only: nothing to acknowledge.
    expect(host.querySelectorAll("button")).toHaveLength(0);
    const variants = [...firingTable.querySelectorAll("[data-variant]")].map(
      (element) => element.getAttribute("data-variant"),
    );
    expect(variants).toContain("error");
    expect(variants).not.toContain("success");
  });

  it("opens an alert's detail in admin, with its runbook as an action", () => {
    const host = view("alerts", "pc.inference");
    const detail = host.querySelector("#ops-alert-detail")!;
    expect(detail.querySelector("h2")?.textContent).toBe("Nightly inference");
    expect(detail.textContent).toContain("Failing");
    const runbook = [...detail.querySelectorAll("a")].find(
      (link) => link.textContent === "Runbook on GitHub",
    )!;
    expect(runbook.getAttribute("href")).toMatch(
      /^https:\/\/github\.com\/anipotts\/system\/blob\/main\//,
    );
    expect(runbook.getAttribute("target")).toBe("_blank");
    const status = [...detail.querySelectorAll("a")].find(
      (link) => link.textContent === "Open in Status",
    )!;
    expect(status.getAttribute("href")).toBe(
      "/observability/status#entry-pc.inference",
    );
    expect(rows(host, detail)).toHaveLength(2);
    expect(
      host.querySelector(".workspace-split")?.getAttribute("data-detail-open"),
    ).toBe("true");
  });

  it("reads only a well-formed id from the URL", () => {
    expect(opsAlertParam("?alert=pc.inference")).toBe("pc.inference");
    expect(opsAlertParam("?alert=%3Cscript%3E")).toBeNull();
    expect(opsAlertParam("")).toBeNull();
    expect(opsAlertHref("pc.inference")).toBe(
      "/observability/alerts?alert=pc.inference",
    );
  });

  it("shows only a notice while ops reads are off", () => {
    for (const name of ["activity", "alerts"] as const) {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(
        <ObservabilityWorkspace view={name} enabled={false} now={NOW} />,
      );
      expect(host.textContent).toContain("Reader off");
      expect(host.querySelector("table")).toBeNull();
    }
  });
});

describe("the open alert in the browser", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    window.history.replaceState(null, "", "/observability/alerts");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("opens in place with real history, and Escape returns to the row", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          view="alerts"
          enabled={false}
          fixture={sample}
          eventsFixture={events}
        />,
      ),
    );
    const link = host.querySelector<HTMLAnchorElement>(
      'a[href="/observability/alerts?alert=pc.inference"]',
    )!;
    await act(async () =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    );
    expect(window.location.search).toBe("?alert=pc.inference");
    expect(host.querySelector("#ops-alert-detail h2")?.textContent).toBe(
      "Nightly inference",
    );
    expect(document.activeElement?.id).toBe("ops-alert-detail");

    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.location.search).toBe("");
    expect(host.querySelector("#ops-alert-detail")).toBeNull();
    expect(document.activeElement).toBe(link);
  });
});
