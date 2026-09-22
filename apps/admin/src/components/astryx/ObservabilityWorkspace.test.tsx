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
  opsEntryParam,
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
import { providedSearchEntries } from "../../lib/admin-search-index";
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
/** A cell by its column header, so optional columns never shift a test.
 * Pass a row to read one that has no entry anchor. */
const cell = (
  host: HTMLElement,
  id: string,
  header: string,
  row?: HTMLTableRowElement,
) => {
  const index = headers(host).indexOf(header);
  expect(index, header).toBeGreaterThan(-1);
  return (row ?? rowFor(host, id)!).cells[index]!;
};
/** The page's one status line under the title. */
const meta = (host: HTMLElement) =>
  host.querySelector(".workspace-page-title")?.lastElementChild?.textContent;

describe("Status view from System's fixture", () => {
  const host = render(sample);

  it("puts hosts in cards and every other entry in one table, a heading row per group", () => {
    const strip = host.querySelector('ul[aria-label="Hosts"]')!;
    expect(strip.querySelectorAll("li")).toHaveLength(1);
    expect(strip.textContent).toContain("ap-mini");
    // Disk from the detail, as a figure and a meter; the detail itself is
    // the card's tooltip.
    expect(strip.textContent).toContain("70%");
    expect(strip.querySelector(".ops-meter")).not.toBeNull();
    expect(strip.querySelector("a")?.getAttribute("title")).toContain(
      "disk 70% used",
    );
    // The host's device render leads its card.
    expect(strip.querySelector(".brand-tile")?.getAttribute("data-mark")).toBe(
      "ap-mini",
    );
    expect(rowFor(host, "host.ap-mini")).toBeNull();
    const table = host.querySelector('table[aria-label="Status entries"]');
    expect(table).not.toBeNull();
    expect(groupTitles(host)).toEqual([
      "Personal context",
      "Backups",
      "Health ingest",
      "Agent sessions",
      "Services",
    ]);
    const rows = [...table!.querySelectorAll("tbody tr:not([data-group-row])")];
    expect(rows).toHaveLength(sample.catalog.length - 1);
    expect(rows.at(-1)?.querySelector('[id="entry-imessage.agent"]')).not.toBe(
      null,
    );
    expect(host.querySelector("h1")?.nextElementSibling?.textContent).toBe(
      String(sample.catalog.length),
    );
  });

  it("leads each row with its brand or kind tile and a short name, the id in the tooltip", () => {
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
    expect(connect.querySelector(".workspace-row-title")?.textContent).not.toBe(
      "keepalive.onepassword-connect",
    );
    expect(
      connect.querySelector("a.workspace-row-link")?.getAttribute("title"),
    ).toBe("keepalive.onepassword-connect");
  });

  it("gives every state its own column, labelled, not colour alone", () => {
    const expected: Record<string, string> = {
      "health.api": "OK",
      "keepalive.onepassword-connect": "Degraded",
      "pc.inference": "Failing",
      "pc.snapshot": "Stale",
      "health.ingest": "Unknown",
    };
    for (const [id, label] of Object.entries(expected)) {
      const state = cell(host, id, "State");
      // OK is the default: a quiet dot named by its tooltip, no chip.
      if (label === "OK") {
        expect(state.querySelector(".workspace-state")).toBeNull();
        expect(
          state.querySelector(".workspace-state-quiet")?.getAttribute("title"),
        ).toBe("OK");
        continue;
      }
      expect(state.textContent).toContain(label);
      const dot = state.querySelector('[role="img"]');
      if (dot) expect(dot.getAttribute("aria-hidden")).toBe("true");
      else
        expect(
          state
            .querySelector("svg.workspace-state-mark")
            ?.getAttribute("aria-hidden"),
        ).toBe("true");
    }
    // The state column carries only states; details have their own.
    expect(cell(host, "pc.writer", "State").textContent).not.toContain(
      "last pass completed",
    );
    expect(cell(host, "pc.writer", "Detail").textContent).toBe(
      "last pass completed",
    );
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
    expect(cell(host, "pc.inference", "State").textContent).toBe("Failing");
    expect(
      cell(host, "pc.inference", "State")
        .querySelector("[data-variant]")
        ?.getAttribute("data-variant"),
    ).toBe("error");
    expect(cell(host, "pc.inference", "Detail").textContent).toBe(
      "inference not ok",
    );
    const exit = cell(host, "keepalive.onepassword-connect", "Detail");
    expect(exit.querySelector(".ops-exit")?.textContent).toBe("exit 1");
    expect(headers(host)).not.toContain("Last exit");
  });

  it("never gives unknown the ok treatment", () => {
    const unknown = cell(host, "health.ingest", "State");
    const ok = cell(host, "health.api", "State");
    // Unknown is its own dashed glyph on the neutral chip, never a dot.
    expect(unknown.querySelector("svg.workspace-state-mark")).not.toBeNull();
    expect(unknown.querySelector("[data-variant]")).toBeNull();
    expect(
      unknown.querySelector("[data-tone]")?.getAttribute("data-tone"),
    ).toBe("neutral");
    // OK is a quiet dot, never a chip, so nothing else can borrow its look.
    expect(ok.querySelector(".workspace-state")).toBeNull();
    expect(unknown.textContent).not.toContain("OK");
    for (const state of OPS_V1_STATES.filter((value) => value !== "ok")) {
      expect(badgeFor("ops", state).tone).not.toBe("positive");
      expect(badgeFor("ops", state).isDefault).toBeUndefined();
    }
  });

  it("judges last success against each entry's own budget, naming it only once it is over", () => {
    expect(cell(host, "pc.writer", "Last success").textContent).toBe("15m ago");
    expect(cell(host, "health.api", "Last success").textContent).toBe(
      "just now",
    );
    const over = cell(host, "pc.inference", "Last success");
    expect(over.textContent).toBe("2d ago");
    expect(over.querySelector(".ops-over")?.getAttribute("aria-label")).toBe(
      "Over its 26h budget",
    );
    expect(
      cell(host, "pc.writer", "Last success").querySelector(".ops-over"),
    ).toBeNull();
    // Never succeeded: nothing visible, and said for assistive technology.
    expect(
      cell(host, "health.ingest", "Last success").querySelector(".sr-only")
        ?.textContent,
    ).toBe("Never");
  });

  it("shows a null-budget job's age with no stale judgement", () => {
    const value = fresh();
    value.status.find(
      (row: Json) => row.id === "health.ingest",
    ).last_success_at = "2026-09-18T18:00:00Z";
    const age = cell(render(value), "health.ingest", "Last success");
    expect(age.textContent).toBe("3d ago");
    expect(age.querySelector(".ops-over")).toBeNull();
  });

  it("shows last run, duration, the next run, runs and the trigger", () => {
    expect(headers(host)).toEqual([
      "Service",
      "Device",
      "State",
      "Detail",
      "Last success",
      "Last run",
      "Took",
      "Next run",
      "Runs",
      "Trigger",
    ]);
    expect(cell(host, "pc.writer", "Last run").textContent).toBe("15m ago");
    expect(cell(host, "pc.writer", "Took").textContent).toBe("5.2s");
    // An interval job's next run is the last run plus the interval, so it
    // is marked approximate.
    const next = cell(host, "pc.writer", "Next run");
    // The tilde is for the eye; assistive technology hears "about".
    expect(next.textContent).toBe("~about in 55m");
    expect(next.querySelector(".ops-approx")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(next.querySelector(".ops-due")?.getAttribute("title")).toMatch(
      /^Approximate/,
    );
    expect(cell(host, "health.api", "Next run").textContent).toBe(
      "Not scheduled",
    );
    expect(cell(host, "agents.sync", "Runs").textContent).toBe("712");
    expect(
      cell(host, "pc.writer", "Trigger")
        .querySelector(".ops-trigger")
        ?.getAttribute("aria-label"),
    ).toBe("Interval, every hour");
    expect(
      cell(host, "health.api", "Trigger")
        .querySelector(".ops-trigger")
        ?.getAttribute("aria-label"),
    ).toBe("Keepalive, always running");
    // Numbers line up: figures are right-aligned in tabular numerals.
    expect(cell(host, "agents.sync", "Runs").hasAttribute("data-numeric")).toBe(
      true,
    );
  });

  it("opens each entry in admin, never its runbook, and draws no external squares", () => {
    const link = rowFor(host, "pc.writer")!.querySelector(
      "a.workspace-row-link",
    )!;
    expect(link.getAttribute("href")).toBe(
      "/observability/status?entry=pc.writer",
    );
    expect(link.getAttribute("target")).toBeNull();
    expect(host.innerHTML).not.toMatch(/ArrowSquareOut|workspace-row-reveal/);
  });

  it("lists every synced app with its tile and freshness against its own budget", () => {
    const syncs = host.querySelector('ul[aria-label="Syncs"]')!;
    // The sample carries one sync: Apple Health, with no budget.
    expect(syncs.querySelectorAll("li")).toHaveLength(1);
    expect(syncs.querySelector(".brand-tile")?.getAttribute("data-mark")).toBe(
      "applehealth",
    );
    expect(syncs.textContent).toContain("Apple Health");
    expect(syncs.textContent).toContain("No budget");
    expect(syncs.textContent).not.toMatch(/Fresh|Stale/);
    expect(syncs.querySelector("a")?.getAttribute("href")).toBe(
      "/observability/status?entry=health.ingest",
    );
  });

  it("labels the source as the fixture, never as live, and announces no age", () => {
    expect(meta(host)).toBe("Generated just now");
    expect(host.textContent).toContain("Sample data");
    expect(host.querySelector('.workspace-page-header [role="status"]')).toBe(
      null,
    );
    // Every field is known: no drift chip.
    expect(host.querySelector(".ops-drift")).toBeNull();
  });
});

describe("Status view edge cases", () => {
  it("renders a missing status row as unknown", () => {
    const value = fresh();
    value.status = value.status.filter((row: Json) => row.id !== "pc.writer");
    const host = render(value);
    const state = cell(host, "pc.writer", "State");
    expect(state.textContent).toBe("Unknown");
    expect(state.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe(
      "neutral",
    );
    expect(state.querySelector("svg.workspace-state-mark")).not.toBeNull();
    expect(cell(host, "pc.writer", "Detail").textContent).toBe(
      "No status row from System",
    );
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
        detail: "ap-pro offline",
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
    const over = cell(host, "web.site", "Last success");
    expect(over.textContent).toBe("5m ago");
    expect(over.querySelector(".ops-over")?.getAttribute("title")).toBe(
      "Over its 1m budget",
    );
    expect(groupTitles(host).at(-1)).toBe("A brand new group");
  });

  it("names System fields it does not read yet in one quiet chip", () => {
    const value = fresh();
    value.catalog[1].region = "east";
    value.status[1].tier = 2;
    const host = render(value);
    const chip = host.querySelector(".ops-drift")!;
    expect(chip.textContent).toContain("2 new System fields");
    expect(chip.getAttribute("title")).toBe("region\ntier");
    // The page keeps working.
    expect(host.querySelector('table[aria-label="Status entries"]')).not.toBe(
      null,
    );
  });

  it("reads a restore drill that never ran as Unverified, never ok", () => {
    const value = fresh();
    value.catalog.push({
      id: "backup.restore-drill",
      name: "restore drill",
      group: "recovery",
      kind: "job",
      host: "ap-mini",
      owner: "system",
      freshness_budget_s: null,
      runbook: "docs/runbooks/ops-mini.md",
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
    const host = render(value);
    const state = cell(host, "backup.restore-drill", "State");
    expect(state.textContent).toBe("Unverified");
    expect(state.querySelector(".workspace-state-quiet")).toBeNull();
    // Recovery sits right after backups.
    expect(groupTitles(host).slice(0, 3)).toEqual([
      "Personal context",
      "Backups",
      "Recovery",
    ]);
  });

  it("puts entries in the hosts group in the strip, not the table", () => {
    const value = fresh();
    value.catalog.find((item: Json) => item.id === "health.api").group =
      "hosts";
    const host = render(value);
    expect(host.querySelector('ul[aria-label="Hosts"]')?.textContent).toContain(
      "Health API",
    );
    expect(rowFor(host, "health.api")).toBeNull();
  });

  it("renders asleep calmly, apart from failing and from unknown", () => {
    const value = fresh();
    value.status.find((row: Json) => row.id === "health.api").state = "asleep";
    const host = render(value);
    const asleep = cell(host, "health.api", "State");
    const unknown = cell(host, "health.ingest", "State");
    const failing = cell(host, "pc.inference", "State");
    expect(asleep.textContent).toContain("Asleep");
    expect(asleep.querySelector("[data-variant]")).toBeNull();
    expect(asleep.querySelector("svg.workspace-state-mark")).not.toBeNull();
    // Asleep rests on blue, unknown on neutral, each with its own glyph.
    expect(asleep.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe(
      "rest",
    );
    expect(
      unknown.querySelector("[data-tone]")?.getAttribute("data-tone"),
    ).toBe("neutral");
    expect(unknown.querySelector("svg.workspace-state-mark")).not.toBeNull();
    expect(
      asleep.querySelector("svg.workspace-state-mark")?.innerHTML,
    ).not.toBe(unknown.querySelector("svg.workspace-state-mark")?.innerHTML);
    expect(
      failing.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("error");
  });

  it("shows every value as last known once the sampler stops for over 60 seconds", () => {
    const within = render(sample, NOW + 30_000);
    // The line changes at most once a minute.
    expect(meta(within)).toBe("Generated just now");
    expect(
      within.querySelector('tbody .workspace-state-quiet[title="OK"]'),
    ).not.toBeNull();

    const host = render(sample, NOW + 7 * 60_000);
    expect(meta(host)).toBe("Last known values");
    expect(host.textContent).toContain("Sampler stopped 7m ago");
    // One notice: the stopped sampler says it, so no summary repeats it.
    expect(host.querySelector('ul[aria-label="Not ok"]')).toBeNull();
    expect(host.textContent?.match(/Sampler stopped/g)).toHaveLength(1);
    // Nothing reads as ok: no success dot and no OK state anywhere.
    expect(host.querySelector('[data-variant="success"]')).toBeNull();
    expect(host.querySelector('.workspace-state-quiet[title="OK"]')).toBeNull();
    expect(cell(host, "health.api", "State").textContent).toBe("Unknown");
    expect(cell(host, "health.api", "Detail").textContent).toBe(
      "Last known ok: running",
    );
    expect(cell(host, "pc.inference", "Detail").textContent).toBe(
      "Last known failing: inference not ok",
    );
    expect(
      host.querySelector('ul[aria-label="Hosts"] a')?.getAttribute("title"),
    ).toContain("Last known ok: disk 70% used");
  });

  it("shows nothing from a fixture that breaks the contract", () => {
    const value = fresh();
    value.catalog[0].kind = "robot";
    const host = render(value);
    expect(host.querySelector("table")).toBeNull();
    expect(host.textContent).toContain("Fixture rejected");
  });
});

describe("an entry's panel", () => {
  const open = (id: string, now = NOW) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <ObservabilityWorkspace
        view="status"
        entry={id}
        enabled={false}
        fixture={sample}
        eventsFixture={events}
        now={now}
      />,
    );
    return host;
  };
  const facts = (panel: Element) =>
    Object.fromEntries(
      [...panel.querySelectorAll(".workspace-definition")].map((row) => [
        row.querySelector("dt")?.textContent,
        row.querySelector("dd")?.textContent,
      ]),
    );

  it("opens beside the list with the catalog facts, the runbook as an action and the next run", () => {
    const host = open("pc.writer");
    const panel = host.querySelector("#ops-entry-detail")!;
    expect(panel.querySelector("h2")?.textContent).toBe(
      "Personal context writer",
    );
    expect(
      host.querySelector(".admin-split-grid")?.getAttribute("data-panel-open"),
    ).toBe("true");
    expect(facts(panel)).toMatchObject({
      Detail: "last pass completed",
      "Last success": "15m ago",
      Took: "5.2s",
      "Next run": "~about in 55m",
      Schedule: "hourly",
      Trigger: "Interval, every hour",
      Runs: "115 runs",
      "Freshness budget": "1h 15m",
      Host: "ap-mini",
      Owner: "memory",
    });
    const runbook = [...panel.querySelectorAll("a")].find(
      (link) => link.textContent === "Runbook on GitHub",
    )!;
    expect(runbook.getAttribute("href")).toBe(
      "https://github.com/anipotts/system/blob/main/docs/runbooks/ops-mini.md",
    );
    expect(runbook.getAttribute("target")).toBe("_blank");
    expect(runbook.getAttribute("rel")).toContain("noreferrer");
    // The open row is pressed and controls the panel.
    expect(
      rowFor(host, "pc.writer")
        ?.querySelector("a.workspace-row-link")
        ?.getAttribute("aria-controls"),
    ).toBe("ops-entry-detail");
  });

  it("lists recent runs newest first with their result and duration", () => {
    const panel = open("pc.writer").querySelector("#ops-entry-detail")!;
    const runs = panel.querySelector('ol[aria-label$="runs"]')!;
    const items = [...runs.querySelectorAll("li")];
    expect(items).toHaveLength(2);
    expect(
      items.map((item) => item.querySelector("time")?.getAttribute("dateTime")),
    ).toEqual(["2026-09-21T17:55:05Z", "2026-09-21T16:55:05Z"]);
    expect(items[0]?.textContent).toContain("Exit 0");
    expect(items[0]?.textContent).toContain("4.8s");
    // A failed run is a critical chip.
    const failed = open("pc.inference")
      .querySelector('#ops-entry-detail ol[aria-label$="runs"]')!
      .querySelector("[data-variant]");
    expect(failed?.getAttribute("data-variant")).toBe("error");
  });

  it("merges one run System reported twice", () => {
    const panel = open("pc.snapshot").querySelector("#ops-entry-detail")!;
    const items = panel.querySelectorAll('ol[aria-label$="runs"] li');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("2 runs");
  });

  it("says a job faster than every 15 minutes runs every N min instead of an empty history", () => {
    const panel = open("agents.sync").querySelector("#ops-entry-detail")!;
    expect(panel.textContent).toContain("Runs every 10 min");
    expect(panel.querySelector('ol[aria-label$="runs"]')).toBeNull();
  });

  it("lists its changes of state as from and to chips", () => {
    const panel = open("pc.writer").querySelector("#ops-entry-detail")!;
    const changes = [...panel.querySelectorAll('ol[aria-label$="changes"] li')];
    expect(changes).toHaveLength(3);
    expect(changes[0]?.textContent).toContain("Degraded");
    expect(changes[0]?.textContent).toContain("OK");
    expect(changes[0]?.textContent).toContain("last pass completed");
    // A first sighting has no state to leave.
    expect(changes.at(-1)?.textContent).toContain("First seen");
  });

  it("offers the alert when the entry is firing", () => {
    const panel = open("pc.inference").querySelector("#ops-entry-detail")!;
    const alert = [...panel.querySelectorAll("a")].find(
      (link) => link.textContent === "Open alert",
    );
    expect(alert?.getAttribute("href")).toBe(
      "/observability/alerts?alert=pc.inference",
    );
    expect(
      [...open("pc.writer").querySelectorAll("#ops-entry-detail a")].some(
        (link) => link.textContent === "Open alert",
      ),
    ).toBe(false);
  });

  it("shows a host's disk and sampling, with no runs", () => {
    const panel = open("host.ap-mini").querySelector("#ops-entry-detail")!;
    expect(facts(panel)).toMatchObject({
      Disk: "70% used",
      Sampled: "just now",
    });
    // The detail only repeats the disk figure, so it is left out.
    expect(facts(panel).Detail).toBeUndefined();
    expect(panel.textContent).not.toContain("Runs every");
    expect(panel.querySelector('ol[aria-label$="runs"]')).toBeNull();
  });

  it("opens nothing for an id outside the catalog or a malformed one", () => {
    expect(open("no.such-entry").querySelector("#ops-entry-detail")).toBeNull();
    expect(opsEntryParam("?entry=pc.writer")).toBe("pc.writer");
    expect(opsEntryParam("?entry=%3Cscript%3E")).toBeNull();
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
  const view = (
    name: "activity" | "alerts",
    alert: string | null = null,
    eventsFixture: unknown = events,
  ) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <ObservabilityWorkspace
        view={name}
        alert={alert}
        enabled={false}
        fixture={sample}
        eventsFixture={eventsFixture}
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
  const access = (
    seq: number,
    minute: number,
    extra: Record<string, unknown> = {},
  ) => ({
    seq,
    at: `2026-09-21T17:${String(minute).padStart(2, "0")}:00Z`,
    kind: "access",
    subject: "data.search",
    from_state: null,
    to_state: null,
    status: 200,
    ms: 40 + seq,
    detail: null,
    device: null,
    ...extra,
  });
  const page = (items: unknown[]) => ({
    version: "ops_events_v1",
    items,
    next_after: null,
  });
  const plumbing = events.items.filter(
    (item) =>
      item.kind === "access" &&
      ["preflight", "probe", "ops.snapshot", "ops.events"].includes(
        item.subject,
      ) &&
      (item.status ?? 0) < 400,
  ).length;

  it("lists what happened newest first by day, with plumbing folded away", () => {
    const host = view("activity");
    expect(host.querySelector("h1")?.textContent).toBe("Activity");
    expect(plumbing).toBe(4);
    const lines = rows(host);
    // One run System reported twice is one row.
    expect(lines).toHaveLength(events.items.length - plumbing - 1);
    expect(host.querySelector("h1")?.nextElementSibling?.textContent).toBe(
      String(lines.length),
    );
    // The one chip that shows plumbing names how much it holds.
    const chip = host.querySelector(".ops-chip-toggle")!;
    expect(chip.textContent).toBe(`Polling${plumbing}`);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).not.toMatch(/Ops events|Ops snapshot|Preflight/);
    const title = (row: Element) =>
      row.querySelector(".workspace-row-title")?.textContent;
    const cells = bodyRows(host);
    expect(title(cells[0]!)).toBe("Data sources");
    expect(title(cells[1]!)).toBe("Data search");
    // A run's finish can arrive after later events; rows follow when it
    // happened.
    expect(title(cells[2]!)).toBe("Personal context writer");
    expect(lines.at(-1)).toContain("First seen");
    expect(lines.find((line) => line.includes("Nightly inference"))).toBe(
      lines.find((line) => line.includes("Exit 1")),
    );
    expect(
      lines.find(
        (line) => line.includes("Nightly inference") && line.includes("to"),
      ),
    ).toContain("OKtoFailing");
    // Days head the groups; times are clock times within them.
    expect(groupTitles(host)).toEqual(["Today", "Yesterday"]);
    expect(
      host.querySelector("tbody tr:not([data-group-row]) time")?.textContent,
    ).toMatch(/^\d{2}:\d{2}$/);
    expect(host.textContent).not.toMatch(/\bago\b/);
    // Access rows never carry query text or record ids.
    expect(host.textContent).not.toMatch(/rec-[0-9a-f]{32}|\?q=/);
  });

  it("gives reads a colour-coded status and latency, and runs their exit and duration", () => {
    const host = view("activity");
    const change = (index: number) =>
      cell(host, "", "Change", bodyRows(host)[index]);
    const sources = change(0);
    expect(sources.textContent).toBe("200");
    expect(
      sources.querySelector("[data-tone]")?.getAttribute("data-tone"),
    ).toBe("positive");
    expect(cell(host, "", "Took", bodyRows(host)[0]).textContent).toBe("33ms");
    const invalid = bodyRows(host).find((row) =>
      row.textContent?.includes("Invalid request"),
    )!;
    expect(
      cell(host, "", "Change", invalid)
        .querySelector("[data-tone]")
        ?.getAttribute("data-tone"),
    ).toBe("warning");
    // A clean run is a quiet dot; a failed one is a critical chip.
    const writer = bodyRows(host)[2]!;
    expect(
      cell(host, "", "Change", writer)
        .querySelector(".workspace-state-quiet")
        ?.getAttribute("title"),
    ).toBe("Exit 0");
    expect(cell(host, "", "Took", writer).textContent).toBe("4.8s");
    const failed = bodyRows(host).find((row) =>
      row.textContent?.includes("Exit 1"),
    )!;
    expect(
      failed.querySelector("[data-variant]")?.getAttribute("data-variant"),
    ).toBe("error");
    // Transitions show both states and the entity's own tile.
    const connect = bodyRows(host).find((row) =>
      row.textContent?.includes("Connect"),
    )!;
    expect(
      connect.querySelector(".brand-tile")?.getAttribute("data-mark"),
    ).toBe("1password");
    expect(cell(host, "", "Change", connect).textContent).toBe(
      "OKtoDegradedjob last exit non-zero",
    );
  });

  it("leads a read with its route and puts the device that read in its own column", () => {
    const host = view(
      "activity",
      null,
      page([
        access(1, 10, { device: "ap-phone" }),
        access(2, 20, { device: "ap-pro", subject: "data.sources" }),
        access(3, 30),
        access(4, 40, { subject: "health.health", status: 401 }),
      ]),
    );
    const found = bodyRows(host).map((row) => [
      row.querySelector(".workspace-row-title")?.textContent,
      row.querySelector(".workspace-row-mark")?.getAttribute("title"),
      cell(host, "", "Device", row)
        .querySelector(".brand-tile")
        ?.getAttribute("data-mark") ?? null,
    ]);
    expect(found).toEqual([
      ["Health daily", "Reader access", null],
      ["Data search", "Reader access", null],
      ["Data sources", "Reader access", "ap-pro"],
      ["Data search", "Reader access", "ap-phone"],
    ]);
    // Health reads lead with Apple Health; other routes with their glyph.
    expect(
      bodyRows(host)[0]!
        .querySelector(".brand-tile")
        ?.getAttribute("data-mark"),
    ).toBe("applehealth");
    // A read opens nothing; a run or a change opens its entry.
    expect(host.querySelector("a.workspace-row-link")).toBeNull();
    const withEntries = view("activity");
    const links = [
      ...withEntries.querySelectorAll<HTMLAnchorElement>(
        "a.workspace-row-link",
      ),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(link.getAttribute("href")).toMatch(
        /^\/observability\/status\?entry=/,
      );
  });

  it("folds a burst of one route from one device into one row with a count", () => {
    const host = view(
      "activity",
      null,
      page([
        access(1, 10, { device: "ap-pro", ms: 30 }),
        access(2, 11, { device: "ap-pro", ms: 50 }),
        access(3, 12, { device: "ap-pro", ms: 900 }),
        access(4, 12, { device: "ap-phone" }),
      ]),
    );
    const lines = bodyRows(host);
    expect(lines).toHaveLength(2);
    const burst = lines[1]!;
    const change = cell(host, "", "Change", burst);
    expect(change.querySelector(".ops-burst")?.getAttribute("title")).toBe(
      "3 reads",
    );
    expect(change.textContent).toBe("200×33 reads");
    // The burst's latency is its median, the spread its tooltip.
    const took = cell(host, "", "Took", burst);
    expect(took.textContent).toBe("50ms");
    expect(took.querySelector("[title]")?.getAttribute("title")).toBe(
      "Median of 3, 30ms to 900ms",
    );
  });

  it("caps a long feed and steps it with Show more", async () => {
    const items = Array.from({ length: 150 }, (_, index) => ({
      seq: index + 1,
      at: new Date(NOW - (150 - index) * 3 * 60_000)
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

  it("shows the plumbing behind its one chip", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          view="activity"
          enabled={false}
          fixture={sample}
          eventsFixture={events}
        />,
      ),
    );
    const before = bodyRows(host).length;
    const chip = host.querySelector<HTMLButtonElement>(".ops-chip-toggle")!;
    await act(async () => chip.click());
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(bodyRows(host).length).toBe(before + plumbing);
    expect(host.textContent).toContain("Preflight");
    await act(async () => root.unmount());
  });

  it("splits alerts into Firing and Resolved incidents, each row opening in admin", () => {
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
    const heads = (table: Element) =>
      [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    // One set of columns for both, so the two tables line up.
    const incidentColumns = [
      "Alert",
      "Device",
      "State",
      "Started",
      "Resolved",
      "Lasted",
      "Incidents",
      "Detail",
      "Runbook",
    ];
    expect(heads(firingTable)).toEqual(incidentColumns);
    expect(heads(resolvedTable)).toEqual(incidentColumns);
    const widths = (table: Element) =>
      [...table.querySelectorAll<HTMLElement>("thead th")].map(
        (th) => th.style.width,
      );
    expect(widths(firingTable)).toEqual(widths(resolvedTable));
    const firing = rows(host, firingTable);
    expect(firing).toHaveLength(3);
    expect(firing[0]).toContain("keepalive.onepassword-connect");
    expect(firing[0]).toContain("Degraded");
    // Since when, and for how long.
    expect(firing[0]).toContain("20m ago");
    expect(firing[0]).toContain("20m");
    expect(firing[1]).toContain("pc.inference");
    expect(firing[1]).toContain("Failing");
    expect(firing[2]).toContain("pc.snapshot");
    expect(firing[2]).toContain("Stale");
    const resolved = rows(host, resolvedTable);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toContain("agents.sync");
    expect(resolved[1]).toContain("pc.writer");
    // A resolved incident reads the state it was in, muted, never as a
    // current chip; then when it started, resolved and lasted. A firing one
    // has no resolved time yet.
    const [sync] = [
      ...resolvedTable.querySelectorAll("tbody tr:not([data-group-row])"),
    ] as HTMLTableRowElement[];
    const heading = heads(resolvedTable);
    const at = (name: string) => sync!.cells[heading.indexOf(name)]!;
    expect(at("State").textContent).toBe("was failing");
    expect(at("State").querySelector(".workspace-state")).toBeNull();
    expect(at("Lasted").textContent).toBe("25m");
    const [connect] = [
      ...firingTable.querySelectorAll("tbody tr:not([data-group-row])"),
    ] as HTMLTableRowElement[];
    expect(connect!.cells[heading.indexOf("Resolved")]!.textContent).toBe(
      "Still firing",
    );
    expect(resolvedTable.querySelector('[data-variant="error"]')).toBeNull();
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
    // Each row's one action is its runbook, on GitHub; nothing to
    // acknowledge.
    const runbooks = [
      ...host.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]'),
    ];
    expect(runbooks).toHaveLength(5);
    for (const link of runbooks)
      expect(link.getAttribute("href")).toMatch(
        /^https:\/\/github\.com\/anipotts\/system\/blob\/main\//,
      );
    expect(host.querySelectorAll("button")).toHaveLength(0);
    const variants = [...firingTable.querySelectorAll("[data-variant]")].map(
      (element) => element.getAttribute("data-variant"),
    );
    expect(variants).toContain("error");
    expect(variants).not.toContain("success");
  });

  it("opens an alert's incident in admin, with its runbook as an action", () => {
    const host = view("alerts", "pc.inference");
    const detail = host.querySelector("#ops-entry-detail")!;
    expect(detail.querySelector("h2")?.textContent).toBe("Nightly inference");
    expect(detail.textContent).toContain("Failing");
    const facts = Object.fromEntries(
      [...detail.querySelectorAll(".workspace-definition")].map((row) => [
        row.querySelector("dt")?.textContent,
        row.querySelector("dd")?.textContent,
      ]),
    );
    expect(facts).toMatchObject({ For: "48m", Detail: "inference not ok" });
    expect(facts.Started).toMatch(/^Sep 21, \d{2}:12$/);
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
      "/observability/status?entry=pc.inference",
    );
    expect(
      detail.querySelectorAll('ol[aria-label$="changes"] li'),
    ).toHaveLength(2);
    expect(
      host.querySelector(".admin-split-grid")?.getAttribute("data-panel-open"),
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
    expect(host.querySelector("#ops-entry-detail h2")?.textContent).toBe(
      "Nightly inference",
    );
    expect(document.activeElement?.id).toBe("ops-entry-detail");

    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.location.search).toBe("");
    expect(host.querySelector("#ops-entry-detail")).toBeNull();
    expect(document.activeElement).toBe(link);
  });

  it("replaces an open alert with the next one, so one close returns to the list", async () => {
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
    const click = async (href: string) => {
      const link = host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;
      await act(async () =>
        link.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        ),
      );
    };
    const hrefs = [
      ...host.querySelectorAll<HTMLAnchorElement>(
        'a[href^="/observability/alerts?alert="]',
      ),
    ].map((link) => link.getAttribute("href")!);
    const [first, second] = [...new Set(hrefs)];
    expect(second).toBeDefined();
    await click(first!);
    await click(second!);
    expect(window.location.search).toBe(second!.slice(second!.indexOf("?")));
    // Opening pushed one entry and the second alert replaced it, so one
    // close lands on the list.
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.location.pathname).toBe("/observability/alerts");
    expect(window.location.search).toBe("");
    expect(host.querySelector("#ops-entry-detail")).toBeNull();
    expect(
      host.querySelector(".admin-split-grid")?.getAttribute("data-panel-open"),
    ).toBe("false");
  });

  it("opens an entry beside Status with real history, and Escape closes it", async () => {
    window.history.replaceState(null, "", "/observability/status");
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          view="status"
          enabled={false}
          fixture={sample}
          eventsFixture={events}
        />,
      ),
    );
    const link = host.querySelector<HTMLAnchorElement>(
      'a[href="/observability/status?entry=pc.writer"].workspace-row-link',
    )!;
    await act(async () =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    );
    expect(window.location.search).toBe("?entry=pc.writer");
    expect(host.querySelector("#ops-entry-detail h2")?.textContent).toBe(
      "Personal context writer",
    );
    expect(link.getAttribute("aria-current")).toBe("true");
    // A host card opens its own panel in place of the open one.
    const card = host.querySelector<HTMLAnchorElement>(
      'ul[aria-label="Hosts"] a',
    )!;
    await act(async () =>
      card.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    );
    expect(window.location.search).toBe("?entry=host.ap-mini");
    expect(host.querySelector("#ops-entry-detail h2")?.textContent).toBe(
      "ap-mini",
    );
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.location.pathname).toBe("/observability/status");
    expect(window.location.search).toBe("");
    expect(host.querySelector("#ops-entry-detail")).toBeNull();
  });

  it("gives the palette one row per entry while the page is open", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          view="status"
          enabled={false}
          fixture={sample}
          eventsFixture={events}
        />,
      ),
    );
    const rows = providedSearchEntries().filter(
      (row) => row.domain === "system",
    );
    expect(rows.length).toBe(sample.catalog.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    // A firing entry opens its alert; the rest open their Status row.
    const connect = rows.find(
      (row) => row.id === "ops:keepalive.onepassword-connect",
    )!;
    expect(connect.label).toBe("Connect");
    expect(connect.href).toBe(
      "/observability/alerts?alert=keepalive.onepassword-connect",
    );
    expect(
      rows.some((row) => row.href.startsWith("/observability/status?entry=")),
    ).toBe(true);
    expect(rows.find((row) => row.id === "ops:pc.writer")?.href).toBe(
      "/observability/status?entry=pc.writer",
    );
    act(() => root.unmount());
    root = createRoot(host);
    expect(
      providedSearchEntries().filter((row) => row.domain === "system"),
    ).toEqual([]);
  });
});
