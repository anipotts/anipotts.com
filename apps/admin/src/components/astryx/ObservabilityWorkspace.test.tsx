// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../fixtures/ops_v1.sample.json";
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
const stateCell = (row: HTMLTableRowElement) => row.cells[1]!;

describe("Status view from System's fixture", () => {
  const host = render(sample);

  it("puts hosts in a strip and every other entry in one grouped table", () => {
    const strip = host.querySelector('ul[aria-label="Hosts"]')!;
    expect(strip.querySelectorAll("li")).toHaveLength(1);
    expect(strip.textContent).toContain("ap-mini");
    expect(strip.textContent).toContain("disk 70% used");
    expect(host.querySelectorAll("table")).toHaveLength(1);
    expect(rowFor(host, "host.ap-mini")).toBeUndefined();
    const groups = [...host.querySelectorAll("tbody tr[aria-expanded]")].map(
      (row) => row.textContent,
    );
    // Owner priority: Personal Context and its backups, then services
    // (health), then agent sessions with the iMessage agent last.
    expect(groups.map((text) => text?.replace(/\d+ entr(y|ies)$/, ""))).toEqual(
      ["personal context", "backups", "services", "agents"],
    );
    const bodyRows = [
      ...host.querySelectorAll("tbody tr:not([aria-expanded])"),
    ];
    expect(bodyRows.at(-1)?.textContent).toContain("imessage.agent");
  });

  it("renders every fixture state with a text label, not colour alone", () => {
    const expected: Record<string, string> = {
      "health.api": "OK",
      "keepalive.onepassword-connect": "Degraded",
      "pc.inference": "Failing",
      "pc.snapshot": "Stale",
      "agents.sync": "Unknown",
    };
    for (const [id, label] of Object.entries(expected)) {
      const cell = stateCell(rowFor(host, id)!);
      expect(cell.textContent).toContain(label);
      const dot = cell.querySelector('[role="img"]')!;
      expect(dot.getAttribute("aria-hidden")).toBe("true");
    }
    expect(host.querySelector(".ops-summary")?.textContent).toBe(
      "12 entries: 8 ok, 1 degraded, 1 failing, 1 stale, 1 unknown",
    );
  });

  it("never gives unknown the ok treatment", () => {
    const unknown = stateCell(rowFor(host, "agents.sync")!);
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
    const writer = rowFor(host, "pc.writer")!;
    expect(writer.cells[2]!.textContent).toBe("5m agoWithin its 1h 15m budget");
    expect(rowFor(host, "health.api")!.cells[2]!.textContent).toBe(
      "5m agoLiveness only",
    );
    expect(rowFor(host, "agents.sync")!.cells[2]!.textContent).toBe(
      "No success recorded",
    );
  });

  it("shows exit, owner and a runbook link into System", () => {
    const row = rowFor(host, "pc.writer")!;
    expect(row.cells[3]!.textContent).toBe("0");
    expect(row.cells[4]!.textContent).toBe("memory");
    const link = row.cells[5]!.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(
      "https://github.com/anipotts/system/blob/main/docs/runbooks/ops-mini.md",
    );
    expect(link.getAttribute("aria-label")).toBe(
      "Runbook for personal context writer",
    );
    expect(rowFor(host, "health.api")!.cells[3]!.textContent).toBe("None");
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
    const cell = stateCell(rowFor(render(value), "pc.writer")!);
    expect(cell.textContent).toBe("UnknownNo status row from System");
    expect(
      cell.querySelector("[data-variant]")?.getAttribute("data-variant"),
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
    const web = rowFor(host, "web.site")!;
    expect(web.cells[2]!.textContent).toBe("5m agoOver its 1m budget");
    expect(web.cells[5]!.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/runbook",
    );
    expect(host.textContent).toContain("a brand new group");
  });

  it("renders asleep calmly, apart from failing and from unknown", () => {
    const value = fresh();
    value.status.find((row: Json) => row.id === "health.api").state = "asleep";
    const host = render(value);
    const asleep = stateCell(rowFor(host, "health.api")!);
    const unknown = stateCell(rowFor(host, "agents.sync")!);
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
      "12 entries, none current until the sampler resumes",
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
