// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateShell, shellRoute } from "./PrivateShell";
import { readFileSync } from "node:fs";
import {
  PRIVATE_READER_AUDIENCE,
  privateShellFlags,
} from "../../lib/private-reader-credential";
import { clientNavigate } from "../../lib/client-routes";
import { PRIVATE_READER_ROUTES } from "../../lib/private-reader-fetch";
import {
  PRIVATE_SESSION_IDLE_MS,
  trackPrivateSession,
} from "../../lib/private-session-store";
import { createPrivateReaderSession } from "../../lib/private-reader-client";
import { providedSearchEntries } from "../../lib/admin-search-index";
import { HEALTH_CREDENTIAL_ENDPOINT } from "../../lib/private-reader-health";
import dataFixture from "../../fixtures/data_v1.synthetic.json";
import opsSample from "../../fixtures/ops_v1.sample.json";
import type { DataFixture } from "../../lib/data-fixture-reader";

// Synthetic records only; every request goes through the mocked fetch.
const recordId = "rec-0123456789abcdef0123456789abcdef";
const record = {
  record_id: recordId,
  revision_id: "rev-0123456789abcdef0123456789abcdef",
  title: "Synthetic note",
  body: "Fixture text only.",
  source_id: "synthetic",
  status: "observed",
  tier: "open",
  observed_at: "2026-09-21T08:15:35Z",
  body_offset: 0,
  next_body_offset: null,
};
const envelope = (data: unknown) => ({
  schema: "personal_context_data_v1",
  response_observed_at: "2026-09-21T08:15:35Z",
  data,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let issued = 0;
function network() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://admin.anipotts.com");
    if (url.pathname === "/api/editorial/csrf")
      return json({ csrf: "c".repeat(64) });
    if (url.pathname === "/api/private-reader/credential") {
      issued += 1;
      const now = Math.floor(Date.now() / 1000);
      return json({
        credential: `synthetic.jws.${issued}`,
        tokenType: "Bearer",
        audience: PRIVATE_READER_AUDIENCE,
        scope: ["data:read", "activity:read"],
        issuedAt: now,
        expiresAt: now + 60,
      });
    }
    if (url.pathname === PRIVATE_READER_ROUTES.search)
      return json(envelope({ items: [record], total: 1, next_offset: null }));
    if (url.pathname === `${PRIVATE_READER_ROUTES.record}${recordId}`)
      return json(envelope(record));
    return json({ error: "fixture" }, 404);
  });
}

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
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  host = document.createElement("main");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the overview and Data shell", () => {
  it("draws only the routes it can without a document load", () => {
    const url = (path: string) => new URL(path, "https://admin.invalid");
    const route = (path: string, overview = true) =>
      shellRoute(url(path), { overview });
    expect(route("/")).toEqual({ view: "overview" });
    expect(route("/", false)).toBeNull();
    expect(route(`/data/records/${recordId}?kind=people`, false)).toEqual({
      view: "records",
      id: recordId,
      kind: "people",
      source: null,
    });
    expect(route("/data/records/not-an-id")).toBeNull();
    expect(route("/data/sources?view=health")).toEqual({ view: "sources" });
    // Every Data view reads in the browser, so each is drawn in place.
    expect(route("/data/health")).toEqual({ view: "health" });
    expect(route("/data/knowledge?kind=place")).toEqual({
      view: "knowledge",
      id: null,
      kind: "place",
    });
    expect(route("/data/knowledge/ent-robin")).toEqual({
      view: "knowledge",
      id: "ent-robin",
      kind: null,
    });
    expect(route("/content/pages")).toBeNull();
  });

  it("opens a record from the overview without opening the session again", async () => {
    vi.stubGlobal("fetch", network());
    await act(async () =>
      root.render(
        <PrivateShell
          initialPath="/"
          content={[]}
          dataEnabled
          enabled={false}
        />,
      ),
    );
    await settle();
    expect(issued).toBe(1);
    const link = host.querySelector<HTMLAnchorElement>(
      `a[href="/data/records/${recordId}"]`,
    )!;
    expect(link.textContent).toBe("Synthetic note");
    // The row leads with the kind tile alone and names its source on line 2.
    const row = link.closest("tr")!;
    expect(row.querySelectorAll(".workspace-kind")).toHaveLength(0);
    expect(row.querySelector('.data-source[title="synthetic"]')).not.toBeNull();
    // Nothing on the overview ends the session; Records and Sources do.
    expect(host.querySelector('[aria-label="Lock session"]')).toBeNull();
    await act(async () => link.click());
    await settle();
    expect(window.location.pathname).toBe(`/data/records/${recordId}`);
    expect(
      host.querySelector('[aria-label="Synthetic note details"] h1')
        ?.textContent,
    ).toBe("Synthetic note");
    expect(host.textContent).toContain("Fixture text only.");
    expect(document.title).toBe("Records | Admin");
    expect(issued).toBe(1);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("private session idle rule", () => {
  it("closes after 15 idle minutes and opens again on the next interaction", async () => {
    const timers: Array<{ callback: () => void; ms: number }> = [];
    const fetcher = network();
    const session = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
    });
    const policy = trackPrivateSession(session, {
      setTimer: (callback, ms) => {
        timers.push({ callback, ms });
        return timers.length;
      },
      clearTimer: () => {},
    });
    await session.start();
    expect(session.getState().status).toBe("ready");
    const idle = timers.find((timer) => timer.ms === PRIVATE_SESSION_IDLE_MS)!;
    idle.callback();
    expect(session.getState()).toEqual({ status: "cleared", reason: "logout" });
    expect(policy.idle).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(session.getState().status).toBe("ready");
    expect(policy.idle).toBe(false);
  });

  it("stays closed after the owner ends it", async () => {
    const session = createPrivateReaderSession({
      fetch: network() as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
    });
    const policy = trackPrivateSession(session, {
      setTimer: () => 0,
      clearTimer: () => {},
    });
    await session.start();
    policy.endedByOwner = true;
    session.logout();
    window.dispatchEvent(new Event("keydown"));
    await settle();
    expect(session.getState().status).toBe("cleared");
  });
});

describe("Health and Knowledge", () => {
  const healthDay = (date: string, steps: number | null, rest?: number) => ({
    date,
    sleep_h: null,
    steps,
    resting_hr_bpm: rest ?? null,
    hrv_avg_ms: null,
    weight_lbs: null,
  });
  const healthReply = (items: unknown[], days = 30) =>
    envelope({ items, days });

  /** The shell's network with a health reader behind its own issuance. */
  function healthNetwork(reply: unknown, scope: string[] = ["health:read"]) {
    const base = network();
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://admin.anipotts.com");
      if (url.pathname === HEALTH_CREDENTIAL_ENDPOINT) {
        const now = Math.floor(Date.now() / 1000);
        return json({
          credential: "synthetic.health.jws",
          tokenType: "Bearer",
          audience: PRIVATE_READER_AUDIENCE,
          scope,
          issuedAt: now,
          expiresAt: now + 60,
        });
      }
      if (url.pathname === PRIVATE_READER_ROUTES.health) return json(reply);
      void init;
      return base(input);
    });
  }

  const render = async (
    path: string,
    props: Partial<React.ComponentProps<typeof PrivateShell>> = {},
  ) => {
    await act(async () =>
      root.render(
        <PrivateShell
          initialPath={path}
          dataEnabled
          enabled={false}
          {...props}
        />,
      ),
    );
    await settle();
  };

  it("says No vitals collected and makes no request while its flag is off", async () => {
    const fetcher = network();
    vi.stubGlobal("fetch", fetcher);
    await render("/data/health");
    expect(host.querySelector("h1")?.textContent).toBe("Health");
    expect(host.textContent).toContain("No vitals collected");
    expect(host.textContent).not.toContain("not connected");
    // The phone sync is withheld (A-38), and there is never a number.
    expect(host.querySelector(".health-meta")?.textContent).toBe(
      "Last phone syncNot recorded",
    );
    const view = host.querySelector(".health-view")!.cloneNode(true) as Element;
    view.querySelector(".workspace-clock")?.remove();
    expect(view.textContent).not.toMatch(/\d/);
    expect(host.querySelector("table")).toBeNull();
    expect(host.querySelector('[aria-label="Lock session"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("withholds the last phone sync even when ops has a health.ingest success (A-38)", async () => {
    // health.ingest's success is the export file's modification time, not
    // a phone's arrival (System S-14).
    const snapshot = {
      ...opsSample,
      status: opsSample.status.map((row) =>
        row.id === "health.ingest"
          ? { ...row, state: "ok", last_success_at: "2026-09-21T17:40:00Z" }
          : row,
      ),
    };
    await render("/data/health", { fixture: snapshot });
    expect(host.textContent).toContain("No vitals collected");
    const meta = host.querySelector(".health-meta")!;
    expect(meta.textContent).toContain("Last phone syncNot recorded");
    expect(meta.textContent).not.toContain("ago");
    expect(meta.textContent).not.toMatch(/\b(?:OK|Live|Connected)\b/);
    expect(meta.querySelector(".workspace-state")).toBeNull();
    expect(host.querySelector("table")).toBeNull();
  });

  it("reads Health through its own health:read credential only", async () => {
    const fetcher = healthNetwork(
      healthReply([
        healthDay("2026-09-21", 8412),
        healthDay("2026-09-20", null),
        healthDay("2026-09-19", 5120),
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    const healthSession = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
    await render("/data/health", { healthEnabled: true, healthSession });
    const urls = fetcher.mock.calls.map(([input]) => String(input));
    expect(
      urls.some((url) => url.includes("/api/private-reader/credential")),
    ).toBe(false);
    const read = fetcher.mock.calls.find(([input]) =>
      String(input).includes(PRIVATE_READER_ROUTES.health),
    )!;
    expect(new URL(String(read[0])).search).toBe("?days=30");
    expect((read[1]?.headers as Record<string, string>).Authorization).toBe(
      "Bearer synthetic.health.jws",
    );
    const table = host.querySelector('table[aria-label="Health by day"]')!;
    // Every day of the range is a row; a day with nothing says so, and no
    // vital column is drawn.
    expect(table.querySelectorAll("tbody tr")).toHaveLength(30);
    expect(table.textContent).toContain("8,412");
    expect(table.textContent).toContain("Nothing arrived");
    expect(table.textContent).not.toContain("Resting HR");
    expect(host.textContent).toContain("No vitals collected");
    expect(host.textContent).toContain("2 of 30 days");
    expect(host.querySelector('[aria-label="Lock session"]')).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("never draws a vital, whatever the feed carries", async () => {
    // Heart rate, sleep and HRV have no collector: a number here was seeded.
    const fetcher = healthNetwork(
      healthReply([
        healthDay("2026-09-21", null, 54.3),
        healthDay("2026-09-20", null),
        healthDay("2026-09-19", null, 55),
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    const healthSession = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
    await render("/data/health", { healthEnabled: true, healthSession });
    const table = host.querySelector('table[aria-label="Health by day"]')!;
    expect(table.textContent).not.toContain("Resting HR");
    expect(host.textContent).not.toMatch(/54\.3|bpm|\b55\b/);
    expect(host.textContent).toContain("No vitals collected");
    expect(host.textContent).toContain("0 of 30 days");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(30);
  });

  it("refuses a health credential that carries any other scope", async () => {
    const fetcher = healthNetwork(healthReply([]), ["data:read"]);
    vi.stubGlobal("fetch", fetcher);
    const healthSession = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
    await render("/data/health", { healthEnabled: true, healthSession });
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes(PRIVATE_READER_ROUTES.health),
      ),
    ).toBe(false);
    expect(healthSession.getState()).toEqual({
      status: "cleared",
      reason: "denied",
    });
    expect(host.textContent).toContain("Access refused");
  });

  it("rejects a Health reply with any other field", async () => {
    const fetcher = healthNetwork(
      healthReply([{ ...healthDay("2026-09-21", 10), spo2_avg_pct: 97 }]),
    );
    vi.stubGlobal("fetch", fetcher);
    const healthSession = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
    await render("/data/health", { healthEnabled: true, healthSession });
    expect(host.textContent).toContain("Unreadable response");
    expect(host.querySelector("table")).toBeNull();
    expect(host.textContent).not.toContain("97");
  });

  describe("the health.metrics check (A-9)", () => {
    const metrics = (
      row: Record<string, unknown>,
      generatedAt = opsSample.generated_at,
    ) => {
      const ingest = opsSample.catalog.find(
        (entry) => entry.id === "health.ingest",
      )!;
      const status = opsSample.status.find(
        (entry) => entry.id === "health.ingest",
      )!;
      return {
        ...opsSample,
        generated_at: generatedAt,
        catalog: [
          ...opsSample.catalog,
          {
            ...ingest,
            id: "health.metrics",
            name: "health metrics",
            freshness_budget_s: 7200,
          },
        ],
        status: [
          ...opsSample.status,
          { ...status, id: "health.metrics", state: "ok", ...row },
        ],
      };
    };

    it("names each metric a current check says has not arrived", async () => {
      await render("/data/health", {
        dataFixture: dataFixture as unknown as DataFixture,
        fixture: metrics({ detail: "missing:steps" }),
      });
      expect(host.textContent).toContain("Last phone syncNot recorded");
      expect(host.textContent).toContain("Steps not arrived in the last 24h");
      expect(host.textContent).not.toContain("Not checked");
      expect(host.textContent).toContain("No vitals collected");
    });

    it.each([
      ["stale", { state: "stale", detail: "ok" }],
      ["failing", { state: "failing", detail: "missing:steps" }],
      ["unknown", { state: "unknown", detail: "ok" }],
    ])("reads a %s row as Not checked, flag off or on", async (_state, row) => {
      await render("/data/health", { fixture: metrics(row) });
      expect(host.textContent).toContain("Metric arrivalsNot checked");
      expect(host.textContent).not.toContain("not arrived");
      await render("/data/health", {
        dataFixture: dataFixture as unknown as DataFixture,
        fixture: metrics(row),
      });
      expect(host.textContent).toContain("Metric arrivalsNot checked");
      expect(host.textContent).not.toContain("not arrived");
    });

    it("reads a stopped sampler's ok as Not checked", async () => {
      // Read five minutes after the snapshot was generated: the sampler
      // stopped, so its last ok is only last known.
      await render("/data/health", {
        fixture: metrics({ detail: "ok" }),
        now: Date.parse(opsSample.generated_at) + 5 * 60_000,
      });
      expect(host.textContent).toContain("Metric arrivalsNot checked");
    });

    it("says nothing more when every metric arrived", async () => {
      await render("/data/health", { fixture: metrics({ detail: "ok" }) });
      expect(host.querySelector(".health-meta")?.textContent).toBe(
        "Last phone syncNot recorded",
      );
    });
  });

  it("hands the overview and Data pages the same reader switches", () => {
    for (const page of [
      "../../pages/index.astro",
      "../../pages/data/[...path].astro",
    ])
      expect(
        readFileSync(new URL(page, import.meta.url), "utf8"),
        page,
      ).toContain("{...privateShellFlags(env)}");
    expect(
      privateShellFlags({
        PRIVATE_READER_ENABLED: "true",
        PRIVATE_READER_HEALTH_ENABLED: "true",
        PRIVATE_READER_KNOWLEDGE_ENABLED: "true",
      }),
    ).toEqual({
      dataEnabled: true,
      healthEnabled: true,
      knowledgeEnabled: true,
      enabled: false,
    });
    expect(
      privateShellFlags({ PRIVATE_READER_KNOWLEDGE_ENABLED: "true" }),
    ).toMatchObject({ dataEnabled: false, knowledgeEnabled: false });
  });

  it("reads Health after a client navigation from the overview", async () => {
    const fetcher = healthNetwork(healthReply([healthDay("2026-09-21", 8412)]));
    vi.stubGlobal("fetch", fetcher);
    const healthSession = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
    // Exactly the index page's props, with the Health flags on.
    await render("/", {
      content: [],
      healthSession,
      ...privateShellFlags({
        PRIVATE_READER_ENABLED: "true",
        PRIVATE_READER_HEALTH_ENABLED: "true",
      }),
    });
    let handled = false;
    await act(async () => {
      handled = clientNavigate("/data/health");
    });
    await settle();
    expect(handled).toBe(true);
    expect(host.querySelector("h1")?.textContent).toBe("Health");
    expect(host.textContent).not.toContain("Health not connected");
    expect(host.textContent).toContain("8,412");
  });

  it("keeps Knowledge to one notice and no request while its flag is off", async () => {
    const fetcher = network();
    vi.stubGlobal("fetch", fetcher);
    await render("/data/knowledge");
    expect(host.querySelector("h1")?.textContent).toBe("Knowledge");
    expect(host.textContent).toContain("Not built yet");
    // No count beside the title: nothing was measured.
    expect(host.querySelector(".workspace-page-header .workspace-count")).toBe(
      null,
    );
    expect(host.textContent).not.toContain("No knowledge cards");
    expect(host.querySelector("table")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lists the wiki by kind and opens an entity whose facts open records", async () => {
    const fetcher = network();
    vi.stubGlobal("fetch", fetcher);
    await render("/data/knowledge", {
      dataFixture: {
        status: {},
        records: [],
        sources: [],
        knowledge: dataFixture.knowledge,
      },
    });
    expect(host.querySelector(".workspace-count")?.textContent).toBe("8");
    const table = () => host.querySelector('table[aria-label="Entities"]')!;
    expect(table().textContent).toContain("Robin Example");
    const places = [...host.querySelectorAll("button")].find(
      (button) =>
        button.textContent?.trim() === "Places" ||
        button.getAttribute("aria-label") === "Places",
    )!;
    await act(async () => places.click());
    await settle();
    expect(window.location.search).toBe("?kind=place");
    expect(table().querySelectorAll("tbody tr")).toHaveLength(2);
    window.history.replaceState(null, "", "/data/knowledge");
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    await settle();
    const robin = host.querySelector<HTMLAnchorElement>(
      'a[href="/data/knowledge/ent-robin-example"]',
    )!;
    await act(async () => robin.click());
    await settle();
    expect(window.location.pathname).toBe("/data/knowledge/ent-robin-example");
    const panel = host.querySelector('[aria-label="Robin Example details"]')!;
    expect(panel.querySelector("h1")?.textContent).toBe("Robin Example");
    const fact = panel.querySelector<HTMLAnchorElement>(
      ".workspace-definitions a",
    )!;
    expect(fact.getAttribute("href")).toMatch(
      /^\/data\/records\/rec-[0-9a-f]{32}$/,
    );
    expect(panel.textContent).toContain("Timeline");
    expect(panel.textContent).toContain("Coffee at the corner cafe");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Records paging and the split", () => {
  const many = Array.from({ length: 25 }, (_, index) => ({
    record_id: `rec-${String(index).padStart(32, "0")}`,
    revision_id: `rev-${String(index).padStart(32, "0")}`,
    kind: index % 2 ? "note" : "event",
    title: `Synthetic record ${index}`,
    body: "Fixture text only.",
    source_id: "synthetic-notes",
    status: "observed",
    tier: "open",
    observed_at: new Date(Date.UTC(2026, 8, 21, 0, 60 - index)).toISOString(),
  }));
  const fixture = {
    status: { database: { exists: true } },
    records: many,
    sources: [],
  };

  it("loads more rows in place and moves focus to the first new one", async () => {
    await act(async () =>
      root.render(
        <PrivateShell
          initialPath="/data/records"
          dataEnabled
          dataFixture={fixture}
          enabled={false}
        />,
      ),
    );
    await settle();
    const rows = () => host.querySelectorAll("tbody tr");
    expect(rows()).toHaveLength(20);
    expect(host.querySelector(".workspace-count")?.textContent).toBe("25");
    // The listed records are what the palette finds under Data.
    const found = () =>
      providedSearchEntries().filter((row) => row.domain === "data");
    expect(found()).toHaveLength(20);
    expect(found()[0]).toMatchObject({
      label: "Synthetic record 0",
      href: `/data/records/${many[0]!.record_id}`,
    });
    const more = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Load more",
    )!;
    await act(async () => {
      more.focus();
      more.click();
    });
    await settle();
    expect(rows()).toHaveLength(25);
    expect(found()).toHaveLength(25);
    expect(document.activeElement?.textContent).toBe("Synthetic record 20");
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent === "Load more",
      ),
    ).toBe(false);
  });

  it("opens a record beside its list once the content area holds both", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1100,
    } as DOMRect);
    const id = many[3]!.record_id;
    await act(async () =>
      root.render(
        <PrivateShell
          initialPath={`/data/records/${id}`}
          dataEnabled
          dataFixture={fixture}
          enabled={false}
        />,
      ),
    );
    await settle();
    // The list is read too, and the page keeps its H1; the record is an H2
    // with a close icon.
    expect(host.querySelector("h1")?.textContent).toBe("Records");
    const detail = host.querySelector(
      '[aria-label="Synthetic record 3 details"]',
    )!;
    expect(detail.querySelector("h2")?.textContent).toBe("Synthetic record 3");
    expect(detail.querySelector('[aria-label="Close record"]')).not.toBeNull();
    expect(host.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
