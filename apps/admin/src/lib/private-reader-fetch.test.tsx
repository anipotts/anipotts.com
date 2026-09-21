// @vitest-environment jsdom
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRIVATE_READER_BOUNDS,
  PRIVATE_READER_ORIGIN,
  PRIVATE_READER_ROUTES,
  PrivateReaderError,
  createPrivateLifeReader,
  privateReaderPath,
  readerFetch,
} from "./private-reader-fetch";
import {
  createPrivateReaderSession,
  type PrivateReaderSession,
} from "./private-reader-client";
import { PRIVATE_READER_AUDIENCE } from "./private-reader-credential";
import { DataWorkspace, RecordDetail } from "../components/data/DataWorkspace";

// Synthetic fixtures only, shaped like the System adapter examples in the
// 2026-09-20 consolidation handoff. No reader network call is made: every
// request goes through the mocked fetch below.
const observed = "2026-09-21T08:15:35.829503Z";
const recordId = "rec-7204535d4b0280d748874808eb116f04";
const envelope = (data: unknown) => ({
  schema: "personal_context_data_v1",
  response_observed_at: observed,
  data,
});
const fixtureRecord = {
  record_id: recordId,
  revision_id: "rev-00b6c908ed927215220db4d0acff25d7",
  title: "Synthetic note",
  body: "Fixture text only.",
  source_id: "synthetic",
  status: "observed",
  tier: "open",
  observed_at: "2026-09-21T08:15:35.826796Z",
  provenance: { extractor: "test", source_uri: "fixture://one" },
  body_offset: 0,
  next_body_offset: null,
  history_limit: 100,
  revisions: [
    {
      revision_id: "rev-00b6c908ed927215220db4d0acff25d7",
      source_version: "v2",
      observed_at: "2026-09-21T08:15:35.826796Z",
      source_modified_at: null,
    },
    {
      revision_id: "rev-11111111111111111111111111111111",
      source_version: "v1",
      observed_at: "2026-09-20T08:00:00.000000Z",
      source_modified_at: null,
    },
  ],
};
const fixtures: Record<string, unknown> = {
  [PRIVATE_READER_ROUTES.status]: envelope({
    database: { exists: true, writer: false, principal: "owner" },
    counts: { records: 1, revisions: 2, sources: 1, changes: 1 },
    last_change_at: observed,
  }),
  [PRIVATE_READER_ROUTES.search]: envelope({
    items: [fixtureRecord],
    total: 1,
    next_offset: null,
  }),
  [`${PRIVATE_READER_ROUTES.record}${recordId}`]: envelope(fixtureRecord),
  [PRIVATE_READER_ROUTES.sources]: envelope({
    items: [
      {
        source_id: "Second source",
        first_observed_at: "2026-09-20T08:00:00Z",
        last_observed_at: observed,
        record_count: 1,
        revision_count: 2,
      },
    ],
    total: 1,
    next_offset: null,
  }),
  [PRIVATE_READER_ROUTES.activity]: {
    schema: "personal_context_observability_v1",
    response_observed_at: observed,
    data: { items: [], next_cursor: 0 },
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let issued = 0;
function credential(seconds = 60) {
  issued += 1;
  const now = Math.floor(Date.now() / 1000);
  return {
    credential: `synthetic.jws.${issued}`,
    tokenType: "Bearer",
    audience: PRIVATE_READER_AUDIENCE,
    scope: ["data:read", "activity:read"],
    issuedAt: now,
    expiresAt: now + seconds,
  };
}

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;
/** Routes issuance and reader calls; records every reader request. */
function network(reader: Route = (url) => json(fixtures[url.pathname])) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://admin.anipotts.com");
      if (url.pathname === "/api/private-reader/credential")
        return json(credential());
      calls.push({ url, init: init ?? {} });
      return reader(url, init ?? {});
    },
  );
  return { fetcher: fetcher as unknown as typeof fetch, calls, spy: fetcher };
}

function makeSession(
  fetcher: typeof fetch,
  extra: Partial<Parameters<typeof createPrivateReaderSession>[0]> = {},
) {
  return createPrivateReaderSession({
    fetch: fetcher,
    csrf: async () => "c".repeat(64),
    ...extra,
  });
}

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  issued = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
    media: "",
    onchange: null,
  });
  container = document.createElement("main");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLElement>("button, a")].find(
    (button) => button.textContent?.trim().startsWith(label),
  );
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => button!.click());
}
async function search(value: string) {
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe("private reader contract", () => {
  it("targets the verifier audience", () => {
    expect(PRIVATE_READER_ORIGIN).toBe(PRIVATE_READER_AUDIENCE);
  });

  it("maps reads onto the proposed v1 routes with bounded params", () => {
    expect(privateReaderPath({ method: "status" })).toBe("/v1/data/status");
    expect(privateReaderPath({ method: "sources" })).toBe(
      "/v1/data/sources?limit=30&offset=0",
    );
    expect(
      privateReaderPath({ method: "search", q: "Fixture", offset: 30 }),
    ).toBe("/v1/data/search?q=Fixture&limit=30&offset=30");
    expect(privateReaderPath({ method: "get", id: recordId })).toBe(
      `/v1/data/records/${recordId}?body_offset=0&body_limit=32000`,
    );
    expect(privateReaderPath({ method: "activity", after: 7 })).toBe(
      "/v1/observability/activity?after=7&limit=100",
    );
    expect(() => privateReaderPath({ method: "timeline" })).toThrow();
    expect(() => privateReaderPath({ method: "preview", q: "x" })).toThrow();
    expect(() => privateReaderPath({ method: "get", id: "../x" })).toThrow();
  });

  it("sends exactly one bearer header, cors, no credentials, no-store", async () => {
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await session.start();
    await readerFetch(session, "/v1/data/status", { fetch: fetcher });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url.href).toBe(`${PRIVATE_READER_ORIGIN}/v1/data/status`);
    expect(init.method).toBe("GET");
    expect(init.mode).toBe("cors");
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.body).toBeUndefined();
    // Origin is supplied by the browser. Nothing else is ever attached.
    expect(Object.keys(init.headers as Record<string, string>)).toEqual([
      "Authorization",
    ]);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer synthetic.jws.1",
    );
    const headers = new Headers(init.headers);
    for (const name of [
      "origin",
      "cookie",
      "x-editorial-csrf",
      "tailscale-user-login",
      "x-device",
      "x-principal",
      "x-scope",
    ])
      expect(headers.has(name)).toBe(false);
    session.logout();
  });

  it("refuses paths outside the reader routes without a request", async () => {
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await session.start();
    for (const path of [
      "//evil.example/v1/data/status",
      "https://evil.example/v1/data/status",
      "/api/status",
      "/v1/data/statusx",
      "/v1/data/records/",
      "/v1/data/records/a/b",
    ])
      await expect(
        readerFetch(session, path, { fetch: fetcher }),
      ).rejects.toMatchObject({ failure: "malformed" });
    expect(calls).toHaveLength(0);
    session.logout();
  });

  it("renews once on 401 and retries with the new bearer", async () => {
    const { fetcher, calls, spy } = network((url, init) =>
      (init.headers as Record<string, string>).Authorization ===
      "Bearer synthetic.jws.1"
        ? json({ error: "unauthorized" }, 401)
        : json(fixtures[url.pathname]),
    );
    const session = makeSession(fetcher);
    await session.start();
    const body = await readerFetch(session, "/v1/data/status", {
      fetch: fetcher,
    });
    expect(body).toEqual(fixtures[PRIVATE_READER_ROUTES.status]);
    expect(
      calls.map((call) => new Headers(call.init.headers).get("authorization")),
    ).toEqual(["Bearer synthetic.jws.1", "Bearer synthetic.jws.2"]);
    // start + one renewal
    expect(
      spy.mock.calls.filter(([input]) =>
        String(input).includes("/api/private-reader/credential"),
      ),
    ).toHaveLength(2);
    expect(session.getState().status).toBe("ready");
    session.logout();
  });

  it("clears the session after a second 401 and never renews twice", async () => {
    const { fetcher, calls, spy } = network(() =>
      json({ error: "unauthorized" }, 401),
    );
    const session = makeSession(fetcher);
    await session.start();
    await expect(
      readerFetch(session, "/v1/data/status", { fetch: fetcher }),
    ).rejects.toMatchObject({ status: 401, failure: "unauthorized" });
    expect(calls).toHaveLength(2);
    expect(
      spy.mock.calls.filter(([input]) =>
        String(input).includes("/api/private-reader/credential"),
      ),
    ).toHaveLength(2);
    expect(session.getState()).toEqual({ status: "cleared", reason: "denied" });
    expect(session.bearer()).toBeNull();
  });

  it("shares one renewal across parallel 401s", async () => {
    const { fetcher, spy } = network((url, init) =>
      (init.headers as Record<string, string>).Authorization ===
      "Bearer synthetic.jws.1"
        ? json({ error: "unauthorized" }, 401)
        : json(fixtures[url.pathname]),
    );
    const session = makeSession(fetcher);
    await session.start();
    await Promise.all([
      readerFetch(session, "/v1/data/status", { fetch: fetcher }),
      readerFetch(session, "/v1/data/status", { fetch: fetcher }),
    ]);
    expect(
      spy.mock.calls.filter(([input]) =>
        String(input).includes("/api/private-reader/credential"),
      ),
    ).toHaveLength(2);
    expect(session.getState().status).toBe("ready");
    session.logout();
  });

  it("discards a reply that lands after logout", async () => {
    let release: (response: Response) => void = () => {};
    const { fetcher } = network(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const session = makeSession(fetcher);
    await session.start();
    const pending = readerFetch(session, "/v1/data/status", {
      fetch: fetcher,
    });
    session.logout();
    release(json(fixtures[PRIVATE_READER_ROUTES.status]));
    await expect(pending).rejects.toMatchObject({ failure: "expired" });
  });

  it("maps verifier statuses onto Data read states", async () => {
    const cases: [
      number,
      string,
      Parameters<ReturnType<typeof createPrivateLifeReader>>[0],
    ][] = [
      [400, "invalid", { method: "status" }],
      [403, "denied", { method: "status" }],
      [404, "not_found", { method: "get", id: recordId }],
      [405, "unavailable", { method: "status" }],
      [503, "unavailable", { method: "status" }],
    ];
    for (const [status, state, request] of cases) {
      const { fetcher } = network(() =>
        json({ error: "personal_context_unavailable" }, status),
      );
      const session = makeSession(fetcher);
      await session.start();
      const result = await createPrivateLifeReader(session, {
        fetch: fetcher,
      })(request);
      expect(result.state, `HTTP ${status}`).toBe(state);
      // Provider error bodies never reach the UI message.
      expect(JSON.stringify(result)).not.toContain("personal_context");
      session.logout();
    }
  });

  it("exposes typed failures", () => {
    expect(new PrivateReaderError(403).failure).toBe("forbidden");
    expect(new PrivateReaderError(405).failure).toBe("method_not_allowed");
    expect(new PrivateReaderError(500).failure).toBe("unavailable");
  });
});

describe("System reader bounds", () => {
  const search = (q: string, extra: Record<string, unknown> = {}) =>
    ({ method: "search", q, ...extra }) as Parameters<
      typeof privateReaderPath
    >[0];

  it("always sends q, including an empty one, and caps it at 2048", () => {
    expect(privateReaderPath(search(""))).toBe(
      "/v1/data/search?q=&limit=30&offset=0",
    );
    expect(privateReaderPath(search("x".repeat(2048)))).toContain(
      `q=${"x".repeat(2048)}`,
    );
    expect(() => privateReaderPath(search("x".repeat(2049)))).toThrow();
    expect(() =>
      privateReaderPath({ method: "search" } as unknown as Parameters<
        typeof privateReaderPath
      >[0]),
    ).toThrow();
  });

  it("validates kind against [A-Za-z0-9_.-]{1,80}", () => {
    for (const kind of ["person", "a.b_c-1", "x".repeat(80)])
      expect(privateReaderPath(search("", { kind }))).toContain(
        `&kind=${kind}`,
      );
    for (const kind of ["", "bad kind", "a/b", "x".repeat(81), "caf\u00e9"])
      expect(
        () => privateReaderPath(search("", { kind })),
        JSON.stringify(kind),
      ).toThrow();
  });

  it("refuses record ids outside rec-[0-9a-f]{32} before any request", async () => {
    for (const id of [
      "rec-" + "A".repeat(32),
      "rec-" + "0".repeat(31),
      "rec-" + "0".repeat(33),
      "record-" + "0".repeat(32),
      "rec_fixture",
      "../" + recordId,
    ])
      expect(() => privateReaderPath({ method: "get", id }), id).toThrow();
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await session.start();
    const reader = createPrivateLifeReader(session, { fetch: fetcher });
    const result = await reader({ method: "get", id: "rec-fixture" });
    expect(result.state).toBe("invalid");
    await expect(
      readerFetch(
        session,
        "/v1/data/records/rec-xyz?body_offset=0&body_limit=32000",
        {
          fetch: fetcher,
        },
      ),
    ).rejects.toMatchObject({ failure: "malformed" });
    expect(calls).toHaveLength(0);
    session.logout();
  });

  it("keeps body_limit at 32000 and bounds body_offset", () => {
    expect(privateReaderPath({ method: "get", id: recordId })).toContain(
      "body_limit=32000",
    );
    expect(
      privateReaderPath({ method: "get", id: recordId, body_offset: 16777216 }),
    ).toContain("body_offset=16777216");
    for (const body_offset of [-1, 16777217, 1.5])
      expect(() =>
        privateReaderPath({ method: "get", id: recordId, body_offset }),
      ).toThrow();
  });

  it("uses limits inside data 1-200 and activity 1-500", () => {
    expect(PRIVATE_READER_BOUNDS.dataLimit).toEqual({ min: 1, max: 200 });
    expect(PRIVATE_READER_BOUNDS.activityLimit).toEqual({ min: 1, max: 500 });
    for (const request of [
      { method: "sources" },
      { method: "search", q: "" },
    ] as const) {
      const limit = Number(
        new URLSearchParams(privateReaderPath(request).split("?")[1]).get(
          "limit",
        ),
      );
      expect(limit).toBeGreaterThanOrEqual(1);
      expect(limit).toBeLessThanOrEqual(200);
    }
    const activity = Number(
      new URLSearchParams(
        privateReaderPath({ method: "activity" }).split("?")[1],
      ).get("limit"),
    );
    expect(activity).toBeGreaterThanOrEqual(1);
    expect(activity).toBeLessThanOrEqual(500);
    expect(() =>
      privateReaderPath({ method: "sources", offset: 10_000_001 }),
    ).toThrow();
  });

  it("sends only the documented params for each route", () => {
    const expected: [Parameters<typeof privateReaderPath>[0], string[]][] = [
      [{ method: "status" }, []],
      [{ method: "sources" }, ["limit", "offset"]],
      [{ method: "search", q: "" }, ["q", "limit", "offset"]],
      [
        { method: "search", q: "", kind: "person" },
        ["q", "limit", "offset", "kind"],
      ],
      [{ method: "get", id: recordId }, ["body_offset", "body_limit"]],
      [{ method: "activity" }, ["after", "limit"]],
    ];
    for (const [request, keys] of expected) {
      const query = privateReaderPath(request).split("?")[1] ?? "";
      expect([...new URLSearchParams(query).keys()]).toEqual(keys);
    }
  });

  it("refuses unknown, duplicate or missing params at the fetch boundary", async () => {
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await session.start();
    for (const path of [
      "/v1/data/status?x=1",
      "/v1/data/sources?limit=30&offset=0&principal=owner",
      "/v1/data/sources?limit=30&limit=31&offset=0",
      "/v1/data/search?limit=30&offset=0",
      "/v1/data/search?q=&limit=30&offset=0&scope=data:read",
      `/v1/data/records/${recordId}?body_offset=0`,
      "/v1/observability/activity?after=0&limit=100&device=pro",
      "/v1/data/status#x",
    ])
      await expect(
        readerFetch(session, path, { fetch: fetcher }),
        path,
      ).rejects.toMatchObject({ failure: "malformed" });
    expect(calls).toHaveLength(0);
    await readerFetch(session, "/v1/data/search?q=&limit=30&offset=0", {
      fetch: fetcher,
    });
    expect(calls).toHaveLength(1);
    session.logout();
  });
});

describe("revision history cap", () => {
  const revisions = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      revision_id: `rev-${String(index).padStart(32, "0")}`,
      source_version: `v${index}`,
      observed_at: observed,
      source_modified_at: null,
    }));
  const render = async (record: Record<string, unknown>) => {
    await act(async () =>
      root.render(
        <RecordDetail
          record={record}
          busy={false}
          error={null}
          onMore={() => {}}
          back={null}
        />,
      ),
    );
    return container.textContent ?? "";
  };

  it("says latest 100 when the reader cap is hit", async () => {
    const text = await render({
      ...fixtureRecord,
      history_limit: 100,
      revisions: revisions(100),
      origins: Array.from({ length: 100 }, () => ({ observed_at: observed })),
    });
    expect(text).toContain("Showing the latest 100 revisions");
    expect(text).toContain("Showing the latest 100 origins");
    const history = container.querySelector('[aria-label="Revision history"]')!;
    expect(history.querySelectorAll("tbody tr")).toHaveLength(100);
    // No paging control exists for history.
    expect(history.querySelector("button")).toBeNull();
  });

  it("shows no cap note below the limit", async () => {
    const text = await render({ ...fixtureRecord, history_limit: 100 });
    expect(text).not.toContain("latest 100");
  });

  it("shows times as people read them, never raw ISO text", async () => {
    const text = await render({ ...fixtureRecord, history_limit: 100 });
    expect(text).not.toContain(observed);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

describe("private Data workspace", () => {
  async function openWorkspace(
    session: PrivateReaderSession,
    fetcher: typeof fetch,
    props: Partial<React.ComponentProps<typeof DataWorkspace>> = {},
  ) {
    await act(async () =>
      root.render(
        <DataWorkspace
          view="records"
          enabled
          session={session}
          fetch={fetcher}
          {...props}
        />,
      ),
    );
    // The start state is the ordinary page with an inline session control.
    expect(container.querySelector("h1")?.textContent).toBe(
      props.view === "sources" ? "Sources" : "Records",
    );
    expect(container.textContent).toContain("Private session closed");
    await click("Open private session");
    await settle();
  }

  it("says not connected, with no session control, while the reader is off", async () => {
    const { fetcher, spy } = network();
    await act(async () =>
      root.render(
        <DataWorkspace
          view="records"
          enabled={false}
          session={makeSession(fetcher)}
          fetch={fetcher}
        />,
      ),
    );
    expect(container.textContent).toContain("Not connected");
    expect(container.textContent).not.toContain("Open private session");
    expect(spy).not.toHaveBeenCalled();
  });

  it("searches, opens a record in place and shows its history", async () => {
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    expect(container.textContent).toContain("Most recent first");
    await search("Fixture");
    await settle();
    expect(container.textContent).toContain("Synthetic note");
    await click("Synthetic note");
    await settle();
    expect(window.location.pathname).toBe(`/data/records/${recordId}`);
    const detail = container.querySelector(
      '[aria-label="Synthetic note details"]',
    )!;
    expect(detail.textContent).toContain("Fixture text only.");
    const history = container.querySelector('[aria-label="Revision history"]')!;
    expect(history.textContent).toContain(
      "rev-00b6c908ed927215220db4d0acff25d7",
    );
    expect(history.textContent).toContain(
      "rev-11111111111111111111111111111111",
    );
    expect(history.textContent).toContain("current");
    expect(calls.map((call) => call.url.pathname + call.url.search)).toEqual([
      `${PRIVATE_READER_ROUTES.search}?q=&limit=30&offset=0`,
      `${PRIVATE_READER_ROUTES.search}?q=Fixture&limit=30&offset=0`,
      `${PRIVATE_READER_ROUTES.record}${recordId}?body_offset=0&body_limit=32000`,
    ]);
    await click("Back to records");
    expect(window.location.pathname).toBe("/data/records");
    expect(
      container.querySelector('[aria-label="Synthetic note details"]'),
    ).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  it("opens a record from its URL once the session is open", async () => {
    const { fetcher, calls } = network();
    await openWorkspace(makeSession(fetcher), fetcher, { recordId });
    expect(container.textContent).toContain("Fixture text only.");
    expect(calls.map((call) => call.url.pathname)).toContain(
      `${PRIVATE_READER_ROUTES.record}${recordId}`,
    );
  });

  it("filters by kind with one search", async () => {
    const { fetcher, calls } = network();
    await openWorkspace(makeSession(fetcher), fetcher, { kind: "people" });
    expect(calls.map((call) => call.url.search)).toEqual([
      "?q=&limit=30&offset=0&kind=person",
    ]);
  });

  it("opens on recent records and allows an empty search", async () => {
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    expect(container.textContent).toContain("Synthetic note");
    await search("");
    await settle();
    const searches = calls.filter(
      (call) => call.url.pathname === PRIVATE_READER_ROUTES.search,
    );
    expect(searches.map((call) => call.url.search)).toEqual([
      "?q=&limit=30&offset=0",
      "?q=&limit=30&offset=0",
    ]);
  });

  it("lists sources on the same table", async () => {
    const { fetcher } = network();
    await openWorkspace(makeSession(fetcher), fetcher, { view: "sources" });
    expect(
      container.querySelector('table[aria-label="Sources"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Second source");
  });

  it("ending the session clears private data from the page", async () => {
    const { fetcher } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    await search("Fixture");
    await settle();
    expect(container.textContent).toContain("Synthetic note");
    await click("End session");
    expect(container.textContent).toContain("Private session ended");
    expect(container.textContent).not.toContain("Synthetic note");
    expect(session.bearer()).toBeNull();
  });

  it("page hide ends the session", async () => {
    const { fetcher } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(session.getState()).toEqual({ status: "cleared", reason: "logout" });
    expect(container.textContent).not.toContain("Synthetic note");
  });

  it("expiry clears the UI when renewal never lands", async () => {
    let clock = Date.now();
    const timers: { callback: () => void; ms: number }[] = [];
    const { fetcher } = network();
    let renewals = 0;
    const issuing: typeof fetch = async (input, init) => {
      if (String(input).includes("/api/private-reader/credential")) {
        renewals += 1;
        if (renewals > 1) return new Promise<Response>(() => {});
      }
      return fetcher(input, init);
    };
    const session = makeSession(issuing, {
      now: () => clock,
      setTimer: (callback, ms) => {
        timers.push({ callback, ms });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => {},
    });
    await openWorkspace(session, issuing);
    await search("Fixture");
    await settle();
    expect(container.textContent).toContain("Synthetic note");
    // Renewal fires first and hangs; then the credential expires.
    const byDelay = [...timers].sort((a, b) => a.ms - b.ms);
    await act(async () => byDelay[0]!.callback());
    clock += 60_000;
    await act(async () => byDelay[1]!.callback());
    expect(session.getState()).toEqual({
      status: "cleared",
      reason: "expired",
    });
    expect(container.textContent).toContain("Private session expired");
    expect(container.textContent).not.toContain("Synthetic note");
  });

  it("shows denied and unavailable issuance distinctly", async () => {
    for (const [status, title] of [
      [401, "Private access was refused"],
      [503, "The private reader is unavailable"],
    ] as const) {
      const fetcher = vi.fn(async () =>
        json({ error: "fixture" }, status),
      ) as unknown as typeof fetch;
      const session = makeSession(fetcher);
      await act(async () =>
        root.render(
          <DataWorkspace
            key={status}
            view="records"
            enabled
            session={session}
            fetch={fetcher}
          />,
        ),
      );
      await click("Open private session");
      await settle();
      expect(container.textContent).toContain(title);
      expect(container.textContent).toContain("Open private session");
    }
  });

  it("shows an unavailable source instead of an empty store", async () => {
    const { fetcher } = network(() =>
      json({ error: "personal_context_unavailable" }, 503),
    );
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    expect(container.textContent).toContain("Records could not be loaded");
    expect(container.textContent).not.toContain("No matching records");
  });

  it("touches no persistence API across a full session", async () => {
    const storage = [
      vi.spyOn(Storage.prototype, "setItem"),
      vi.spyOn(Storage.prototype, "getItem"),
    ];
    const idb = vi.fn();
    vi.stubGlobal("indexedDB", { open: idb });
    const cacheOpen = vi.fn();
    vi.stubGlobal("caches", { open: cacheOpen, match: cacheOpen });
    const register = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    const { fetcher } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    await search("Fixture");
    await settle();
    await click("Synthetic note");
    await settle();
    await click("End session");
    for (const spy of [...storage, idb, cacheOpen, register])
      expect(spy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    window.history.replaceState(null, "", "/");
  });

  it("private reader sources name no persistence API", () => {
    for (const file of [
      "./private-reader-fetch.ts",
      "./private-reader-client.ts",
      "../components/data/DataWorkspace.tsx",
      "../components/data/useDataSession.ts",
    ]) {
      const source = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      for (const api of [
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "caches",
        "serviceWorker",
        "document.cookie",
      ])
        expect(source, `${file} ${api}`).not.toContain(api);
    }
  });
});
