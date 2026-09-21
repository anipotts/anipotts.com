// @vitest-environment jsdom
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
import { PrivateDataWorkspace } from "../components/life/PrivateDataWorkspace";

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
  const button = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith(label),
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

describe("private Data workspace", () => {
  async function openWorkspace(
    session: PrivateReaderSession,
    fetcher: typeof fetch,
  ) {
    await act(async () =>
      root.render(<PrivateDataWorkspace session={session} fetch={fetcher} />),
    );
    expect(container.textContent).toContain("Open the private reader");
    await click("Open reader");
    await settle();
  }

  it("searches, opens a record and shows its history", async () => {
    const { fetcher, calls } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    expect(container.textContent).toContain(observed);
    await search("Fixture");
    await settle();
    expect(container.textContent).toContain("Synthetic note");
    await click("Synthetic note");
    await settle();
    const detail = container.querySelector('[aria-label="Record details"]')!;
    expect(detail.textContent).toContain("Fixture text only.");
    const history = container.querySelector('[aria-label="Revision history"]')!;
    expect(history.textContent).toContain(
      "rev-00b6c908ed927215220db4d0acff25d7",
    );
    expect(history.textContent).toContain(
      "rev-11111111111111111111111111111111",
    );
    expect(history.textContent).toContain("Current");
    expect(calls.map((call) => call.url.pathname)).toEqual([
      PRIVATE_READER_ROUTES.status,
      PRIVATE_READER_ROUTES.search,
      `${PRIVATE_READER_ROUTES.record}${recordId}`,
    ]);
  });

  it("logout clears private data from the page", async () => {
    const { fetcher } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    await search("Fixture");
    await settle();
    expect(container.textContent).toContain("Synthetic note");
    await click("End private session");
    expect(container.textContent).toContain("Private session ended");
    expect(container.textContent).not.toContain("Synthetic note");
    expect(container.textContent).not.toContain(observed);
    expect(session.bearer()).toBeNull();
  });

  it("page hide ends the session", async () => {
    const { fetcher } = network();
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(session.getState()).toEqual({ status: "cleared", reason: "logout" });
    expect(container.textContent).not.toContain(observed);
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
    expect(container.textContent).toContain("Private access expired");
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
          <PrivateDataWorkspace
            key={status}
            session={session}
            fetch={fetcher}
          />,
        ),
      );
      await click("Open reader");
      await settle();
      expect(container.textContent).toContain(title);
      expect(container.textContent).toContain("Open again");
    }
  });

  it("shows an unavailable source instead of an empty store", async () => {
    const { fetcher } = network(() =>
      json({ error: "personal_context_unavailable" }, 503),
    );
    const session = makeSession(fetcher);
    await openWorkspace(session, fetcher);
    expect(container.textContent).toContain("Records could not be loaded");
    expect(container.textContent).not.toContain("No permitted records");
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
    await click("End private session");
    for (const spy of [...storage, idb, cacheOpen, register])
      expect(spy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it("private reader sources name no persistence API", () => {
    for (const file of [
      "./private-reader-fetch.ts",
      "./private-reader-client.ts",
      "../components/life/PrivateDataWorkspace.tsx",
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
