import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../fixtures/ops_v1.sample.json";
import {
  createPrivateReaderSession,
  type PrivateReaderSession,
} from "./private-reader-client";
import {
  PRIVATE_READER_AUDIENCE,
  PRIVATE_READER_HEALTH_PATH,
  PRIVATE_READER_ISSUER,
  PRIVATE_READER_MODES,
  PRIVATE_READER_OPS_PATH,
  PRIVATE_READER_PATH,
} from "./private-reader-credential";
import {
  PRIVATE_READER_ORIGIN,
  PRIVATE_READER_ROUTES,
  PrivateReaderError,
  createPrivateDataReader,
  readerFetch,
} from "./private-reader-fetch";
import {
  HEALTH_CREDENTIAL_ENDPOINT,
  HEALTH_SCOPE,
  readHealthDaily,
} from "./private-reader-health";
import { createPrivateKnowledgeReader } from "./private-reader-knowledge";
import {
  OPS_CREDENTIAL_ENDPOINT,
  OPS_SCOPE,
  OPS_SNAPSHOT_PATH,
  readOpsEvents,
  readOpsSnapshot,
} from "./ops-reader";
import { OPS_EVENTS_BOUNDS, OPS_EVENTS_PATH } from "./ops-events";
import { OPS_V1_BOUNDS } from "./ops-v1";

/**
 * The private reader's wire table: every request each reader mode sends,
 * and what it does with each answer. System's reader contract sees exactly
 * this traffic, so a transport refactor must leave this file passing
 * unchanged. Synthetic fixtures only; every request goes to the recording
 * fetch below.
 *
 * Issuance is matched against the server's own path constants, never a
 * literal, so a client mirror that drifts from the server fails here.
 */

type Mode = "data" | "ops" | "health";
type Grant = readonly string[] | "fail";
type Reply = (session: PrivateReaderSession) => Response | Promise<Response>;

const SCOPES: Record<Mode, readonly string[]> = {
  data: ["data:read", "activity:read"],
  ops: ["ops:read"],
  health: ["health:read"],
};
const ISSUANCE = new Map<string, Mode>([
  [PRIVATE_READER_PATH, "data"],
  [PRIVATE_READER_OPS_PATH, "ops"],
  [PRIVATE_READER_HEALTH_PATH, "health"],
]);

function harness(mode: Mode, grants: Grant[] = [SCOPES[mode]]) {
  const issuance: Mode[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const replies: Reply[] = [];
  let session: PrivateReaderSession | null = null;
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const issuer = ISSUANCE.get(url);
    if (issuer !== undefined) {
      issuance.push(issuer);
      const grant = grants[Math.min(issuance.length, grants.length) - 1]!;
      if (grant === "fail")
        return Response.json({ error: "reader_unavailable" }, { status: 503 });
      return Response.json({
        credential: `cred-${issuance.length}`,
        scope: grant,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      });
    }
    requests.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new Error("no reply queued");
    return reply(session!);
  }) as typeof globalThis.fetch;
  session = createPrivateReaderSession({
    fetch,
    csrf: async () => "csrf-token",
    // Data passes no endpoint, as the Data session does: the default is live.
    ...(mode === "ops" ? { endpoint: OPS_CREDENTIAL_ENDPOINT } : {}),
    ...(mode === "health" ? { endpoint: HEALTH_CREDENTIAL_ENDPOINT } : {}),
  });
  return { session, fetch, replies, requests, issuance };
}
type Harness = ReturnType<typeof harness>;

function describeError(error: unknown) {
  if (error instanceof PrivateReaderError)
    return { name: error.name, status: error.status, failure: error.failure };
  if (error instanceof Error)
    return { name: error.name, message: error.message };
  return { thrown: String(error) };
}

function sessionState(session: PrivateReaderSession): string {
  const state = session.getState();
  return state.status === "cleared" ? `cleared:${state.reason}` : state.status;
}

/** Runs one read and returns its row: outcome, session after, issuance
 * calls, and every reader request as sent. */
async function trace<T>(
  h: Harness,
  work: () => Promise<T>,
  view: (value: T) => unknown = () => "ok",
) {
  let result: unknown;
  try {
    result = { ok: view(await work()) };
  } catch (error) {
    result = { error: describeError(error) };
  }
  const row = {
    result,
    session: sessionState(h.session),
    issuance: [...h.issuance],
    requests: h.requests.map(({ url, init }) => ({
      url,
      keys: Object.keys(init).sort(),
      method: init.method,
      mode: init.mode,
      credentials: init.credentials,
      cache: init.cache,
      redirect: init.redirect,
      referrerPolicy: init.referrerPolicy,
      headers: Object.entries(init.headers as Record<string, string>),
      signal: init.signal instanceof AbortSignal,
      body: init.body,
    })),
  };
  h.session.logout();
  return row;
}

const INIT_KEYS = [
  "cache",
  "credentials",
  "headers",
  "method",
  "mode",
  "redirect",
  "referrerPolicy",
];
/** One expected reader request. */
function wire(
  path: string,
  {
    bearer = "cred-1",
    extra = [],
    signal = true,
  }: { bearer?: string; extra?: [string, string][]; signal?: boolean } = {},
) {
  return {
    url: `${PRIVATE_READER_ORIGIN}${path}`,
    keys: signal ? [...INIT_KEYS, "signal"].sort() : INIT_KEYS,
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: [["Authorization", `Bearer ${bearer}`], ...extra],
    signal,
    body: undefined,
  };
}

const observed = "2026-09-21T18:05:00Z";
const recordId = "rec-7204535d4b0280d748874808eb116f04";
const envelope = (data: unknown) => ({
  schema: "personal_context_data_v1",
  response_observed_at: observed,
  data,
});
const json =
  (body: unknown, status = 200, headers: Record<string, string> = {}): Reply =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
const text =
  (body: string, headers: Record<string, string> = {}): Reply =>
  () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
const status =
  (code: number): Reply =>
  () =>
    new Response(null, { status: code });
/** A 200 whose body is read only on demand; reading it logs out. */
const logoutWhileReading =
  (body: unknown): Reply =>
  (session) =>
    new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            session.logout();
            controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
            controller.close();
          },
        },
        { highWaterMark: 0 },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
/** The reply arrives after a logout. */
const logoutInFlight =
  (reply: Reply): Reply =>
  (session) => {
    session.logout();
    return reply(session);
  };

const STATUS = envelope({
  database: { exists: true, writer: false, principal: "owner" },
  counts: { records: 1, revisions: 2, sources: 1, changes: 1 },
  last_change_at: observed,
});
const LIST = envelope({ items: [], total: 0, next_offset: null });
const RECORD = envelope({
  record_id: recordId,
  revision_id: "rev-00b6c908ed927215220db4d0acff25d7",
  body: "Fixture text only.",
  body_offset: 0,
  next_body_offset: null,
});
const ACTIVITY = {
  schema: "personal_context_observability_v1",
  response_observed_at: observed,
  data: { items: [], next_cursor: 7 },
};
const HEALTH = envelope({ days: 7, items: [] });
const ENTITY = envelope({
  id: "ent-sample",
  kind: "person",
  name: "Sample Person",
  summary: "",
  facts: [],
  timeline: [],
  backlinks: [],
});
const EVENTS = { version: "ops_events_v1", items: [], next_after: null };
const SNAPSHOT = JSON.stringify(sample);
const snapshot = (etag: string | null = '"v1"') =>
  text(SNAPSHOT, etag ? { etag } : {});
const unauthorized = json({ error: "unauthorized" }, 401);

/** One read of each mode, the way its caller makes it. */
type Read = { mode: Mode; path: string; ok: Reply; signal: boolean };
const READS: Record<string, Read & { run: (h: Harness) => Promise<unknown> }> =
  {
    json: {
      mode: "data",
      path: PRIVATE_READER_ROUTES.status,
      ok: json(STATUS),
      signal: false,
      run: (h) =>
        readerFetch(h.session, PRIVATE_READER_ROUTES.status, {
          fetch: h.fetch,
        }),
    },
    health: {
      mode: "health",
      path: "/v1/health/daily?days=7",
      ok: json(HEALTH),
      signal: true,
      run: (h) =>
        readHealthDaily(h.session, 7, {
          fetch: h.fetch,
          signal: new AbortController().signal,
        }),
    },
    knowledge: {
      mode: "data",
      path: "/v1/data/entities/ent-sample",
      ok: json(ENTITY),
      signal: true,
      run: (h) =>
        createPrivateKnowledgeReader(h.session, { fetch: h.fetch }).get(
          "ent-sample",
          new AbortController().signal,
        ),
    },
    snapshot: {
      mode: "ops",
      path: OPS_SNAPSHOT_PATH,
      ok: snapshot(),
      signal: true,
      run: (h) =>
        readOpsSnapshot(h.session, null, {
          fetch: h.fetch,
          signal: new AbortController().signal,
        }),
    },
    events: {
      mode: "ops",
      path: "/v1/ops/events?after=0&limit=500&wait=25",
      ok: json(EVENTS),
      signal: true,
      run: (h) =>
        readOpsEvents(h.session, 0, {
          fetch: h.fetch,
          signal: new AbortController().signal,
          wait: 25,
        }),
    },
  };

// Fake timers keep credential expiry, renewal and read deadlines still.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(observed));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("reader wire table", () => {
  it("data: status, sources, search, get and activity through the Data reader", async () => {
    const cases: [
      Parameters<ReturnType<typeof createPrivateDataReader>>[0],
      Reply,
      string,
    ][] = [
      [{ method: "status" }, json(STATUS), "/v1/data/status"],
      [
        { method: "sources" },
        json(LIST),
        "/v1/data/sources?limit=200&offset=0",
      ],
      [
        { method: "search", q: "note", kind: "contact", offset: 30 },
        json(LIST),
        "/v1/data/search?q=note&limit=30&offset=30&kind=contact",
      ],
      [
        { method: "get", id: recordId },
        json(RECORD),
        `/v1/data/records/${recordId}?body_offset=0&body_limit=32000`,
      ],
      [
        { method: "activity", after: 7 },
        json(ACTIVITY),
        "/v1/observability/activity?after=7&limit=100",
      ],
    ];
    for (const [request, reply, path] of cases) {
      const h = harness("data");
      await h.session.start();
      h.replies.push(reply);
      const reader = createPrivateDataReader(h.session, { fetch: h.fetch });
      expect(
        await trace(
          h,
          () => reader(request, new AbortController().signal),
          (result) => result.state,
        ),
        path,
      ).toEqual({
        result: { ok: "ready" },
        session: "ready",
        issuance: ["data"],
        requests: [wire(path)],
      });
    }
  });

  it("health: one days= read under its own issuance", async () => {
    for (const signal of [false, true]) {
      const h = harness("health");
      await h.session.start();
      h.replies.push(json(HEALTH));
      expect(
        await trace(
          h,
          () =>
            readHealthDaily(h.session, 7, {
              fetch: h.fetch,
              ...(signal ? { signal: new AbortController().signal } : {}),
            }),
          (read) => read.days,
        ),
      ).toEqual({
        result: { ok: 7 },
        session: "ready",
        issuance: ["health"],
        requests: [wire("/v1/health/daily?days=7", { signal })],
      });
    }
  });

  it("knowledge: list and get on the Data session, a 404 reads as null", async () => {
    const list = harness("data");
    await list.session.start();
    list.replies.push(json(envelope([])));
    expect(
      await trace(
        list,
        () =>
          createPrivateKnowledgeReader(list.session, {
            fetch: list.fetch,
          }).list(
            { kind: "person", q: "sam", offset: 50 },
            new AbortController().signal,
          ),
        (page) => page.total,
      ),
    ).toEqual({
      result: { ok: 50 },
      session: "ready",
      issuance: ["data"],
      requests: [
        wire("/v1/data/entities?q=sam&kind=person&limit=50&offset=50"),
      ],
    });

    const unfiltered = harness("data");
    await unfiltered.session.start();
    unfiltered.replies.push(json(envelope([])));
    expect(
      await trace(unfiltered, () =>
        createPrivateKnowledgeReader(unfiltered.session, {
          fetch: unfiltered.fetch,
        }).list({ kind: null, q: "" }),
      ),
    ).toMatchObject({
      requests: [
        wire("/v1/data/entities?limit=50&offset=0", { signal: false }),
      ],
    });

    for (const [reply, expected] of [
      [json(ENTITY), "ent-sample"],
      [json({ error: "not_found" }, 404), null],
    ] as const) {
      const h = harness("data");
      await h.session.start();
      h.replies.push(reply);
      expect(
        await trace(
          h,
          () =>
            createPrivateKnowledgeReader(h.session, { fetch: h.fetch }).get(
              "ent-sample",
              new AbortController().signal,
            ),
          (entity) => entity?.id ?? null,
        ),
      ).toEqual({
        result: { ok: expected },
        session: "ready",
        issuance: ["data"],
        requests: [wire("/v1/data/entities/ent-sample")],
      });
    }
  });

  it("ops snapshot: unconditional, conditional, and a malformed tag never sent", async () => {
    const rows = [];
    for (const [etag, reply] of [
      [null, snapshot()],
      ['"v1"', status(304)],
      ['W/"v2"', snapshot('W/"v3"')],
      ["v1\r\nX: y", snapshot(null)],
    ] as const) {
      const h = harness("ops");
      await h.session.start();
      h.replies.push(reply);
      rows.push(
        await trace(
          h,
          () =>
            readOpsSnapshot(h.session, etag, {
              fetch: h.fetch,
              signal: new AbortController().signal,
            }),
          (read) =>
            read.kind === "snapshot" ? ["snapshot", read.etag] : [read.kind],
        ),
      );
    }
    const row = (ok: unknown, extra: [string, string][] = []) => ({
      result: { ok },
      session: "ready",
      issuance: ["ops"],
      requests: [wire("/v1/ops/snapshot", { extra })],
    });
    expect(rows).toEqual([
      row(["snapshot", '"v1"']),
      row(["not-modified"], [["If-None-Match", '"v1"']]),
      row(["snapshot", 'W/"v3"'], [["If-None-Match", 'W/"v2"']]),
      row(["snapshot", null]),
    ]);
  });

  it("ops events: after and limit always, wait only when asked", async () => {
    const rows = [];
    for (const [after, wait] of [
      [0, undefined],
      [0, null],
      [12, 0],
      [12, 25],
    ] as const) {
      const h = harness("ops");
      await h.session.start();
      h.replies.push(json(EVENTS));
      rows.push(
        await trace(
          h,
          () =>
            readOpsEvents(h.session, after, {
              fetch: h.fetch,
              signal: new AbortController().signal,
              ...(wait === undefined ? {} : { wait }),
            }),
          (page) => page.nextAfter,
        ),
      );
    }
    const row = (path: string) => ({
      result: { ok: null },
      session: "ready",
      issuance: ["ops"],
      requests: [wire(path)],
    });
    expect(rows).toEqual([
      row("/v1/ops/events?after=0&limit=500"),
      row("/v1/ops/events?after=0&limit=500"),
      row("/v1/ops/events?after=12&limit=500&wait=0"),
      row("/v1/ops/events?after=12&limit=500&wait=25"),
    ]);
  });

  it("the json transport refuses the ops routes, with no request", async () => {
    for (const path of [
      OPS_SNAPSHOT_PATH,
      "/v1/ops/events?after=0&limit=500",
      "/v1/ops/events?after=0&limit=500&wait=25",
    ]) {
      const h = harness("data");
      await h.session.start();
      expect(
        await trace(h, () => readerFetch(h.session, path, { fetch: h.fetch })),
        path,
      ).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 400,
            failure: "malformed",
          },
        },
        session: "ready",
        issuance: ["data"],
        requests: [],
      });
    }
  });
});

describe("renewal and session rules, per mode", () => {
  const modes = Object.keys(READS);

  it("a 401 renews once and the retry carries the new bearer", async () => {
    for (const name of modes) {
      const read = READS[name]!;
      const h = harness(read.mode);
      await h.session.start();
      h.replies.push(unauthorized, read.ok);
      const row = await trace(h, () => read.run(h));
      expect(row, name).toEqual({
        result: { ok: "ok" },
        session: "ready",
        issuance: [read.mode, read.mode],
        requests: [
          wire(read.path, { signal: read.signal }),
          wire(read.path, { bearer: "cred-2", signal: read.signal }),
        ],
      });
    }
  });

  it("a second 401 clears the session as denied, with no second renewal", async () => {
    for (const name of modes) {
      const read = READS[name]!;
      const h = harness(read.mode);
      await h.session.start();
      h.replies.push(unauthorized, unauthorized);
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 401,
            failure: "unauthorized",
          },
        },
        session: "cleared:denied",
        issuance: [read.mode, read.mode],
        requests: [
          wire(read.path, { signal: read.signal }),
          wire(read.path, { bearer: "cred-2", signal: read.signal }),
        ],
      });
    }
  });

  it("a failed renewal answers 401 and sends nothing more", async () => {
    for (const name of modes) {
      const read = READS[name]!;
      const h = harness(read.mode, [SCOPES[read.mode], "fail"]);
      await h.session.start();
      h.replies.push(unauthorized);
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 401,
            failure: "unauthorized",
          },
        },
        session: "cleared:unavailable",
        issuance: [read.mode, read.mode],
        requests: [wire(read.path, { signal: read.signal })],
      });
    }
  });

  it("no bearer is expired, with no request", async () => {
    for (const name of modes) {
      const read = READS[name]!;
      const h = harness(read.mode);
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 401,
            failure: "expired",
          },
        },
        session: "idle",
        issuance: [],
        requests: [],
      });
    }
  });

  it("a reply that lands after logout is discarded as expired", async () => {
    for (const name of modes) {
      const read = READS[name]!;
      const h = harness(read.mode);
      await h.session.start();
      h.replies.push(logoutInFlight(read.ok));
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 401,
            failure: "expired",
          },
        },
        session: "cleared:logout",
        issuance: [read.mode],
        requests: [wire(read.path, { signal: read.signal })],
      });
    }
  });

  it("a logout while the body is read is expired", async () => {
    const bodies: Record<string, unknown> = {
      json: STATUS,
      snapshot: sample,
      events: EVENTS,
    };
    for (const [name, body] of Object.entries(bodies)) {
      const read = READS[name]!;
      const h = harness(read.mode);
      await h.session.start();
      h.replies.push(logoutWhileReading(body));
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 401,
            failure: "expired",
          },
        },
        session: "cleared:logout",
        issuance: [read.mode],
        requests: [wire(read.path, { signal: read.signal })],
      });
    }
  });

  it("503 is unavailable", async () => {
    for (const name of modes) {
      const read = READS[name]!;
      const h = harness(read.mode);
      await h.session.start();
      h.replies.push(json({ error: "reader_unavailable" }, 503));
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 503,
            failure: "unavailable",
          },
        },
        session: "ready",
        issuance: [read.mode],
        requests: [wire(read.path, { signal: read.signal })],
      });
    }
  });

  it("a renewing hold runs exactly the one renewal, for Data and the snapshot", async () => {
    let holds = 0;
    async function hold<T>(work: () => Promise<T>): Promise<T> {
      holds += 1;
      return work();
    }
    const runs: [Mode, string, Reply, (h: Harness) => Promise<unknown>][] = [
      [
        "data",
        PRIVATE_READER_ROUTES.status,
        json(STATUS),
        (h) =>
          readerFetch(h.session, PRIVATE_READER_ROUTES.status, {
            fetch: h.fetch,
            renewing: hold,
          }),
      ],
      [
        "ops",
        OPS_SNAPSHOT_PATH,
        snapshot(),
        (h) =>
          readOpsSnapshot(h.session, null, { fetch: h.fetch, renewing: hold }),
      ],
    ];
    for (const [mode, path, ok, run] of runs) {
      for (const replies of [[ok], [unauthorized, ok]]) {
        holds = 0;
        const h = harness(mode);
        await h.session.start();
        h.replies.push(...replies);
        const row = await trace(h, () => run(h));
        expect({
          holds,
          result: row.result,
          sent: row.requests.length,
        }).toEqual({
          holds: replies.length - 1,
          result: { ok: "ok" },
          sent: replies.length,
        });
        expect(row.requests.map((request) => request.url)).toEqual(
          replies.map(() => `${PRIVATE_READER_ORIGIN}${path}`),
        );
      }
    }
  });
});

describe("scope gates", () => {
  it("health and ops refuse any credential but their exact scope, before sending", async () => {
    for (const [name, mode] of [
      ["health", "health"],
      ["snapshot", "ops"],
      ["events", "ops"],
    ] as const) {
      for (const scope of [
        ["data:read", "activity:read"],
        [SCOPES[mode][0]!, "data:read"],
        [],
      ]) {
        const read = READS[name]!;
        const h = harness(mode, [scope]);
        await h.session.start();
        expect(await trace(h, () => read.run(h)), `${name} ${scope}`).toEqual({
          result: {
            error: {
              name: "PrivateReaderError",
              status: 403,
              failure: "forbidden",
            },
          },
          session: "cleared:denied",
          issuance: [mode],
          requests: [],
        });
      }
    }
  });

  it("health and ops check the scope again before the renewed send", async () => {
    for (const [name, mode] of [
      ["health", "health"],
      ["snapshot", "ops"],
      ["events", "ops"],
    ] as const) {
      const read = READS[name]!;
      const h = harness(mode, [SCOPES[mode], ["data:read", "activity:read"]]);
      await h.session.start();
      h.replies.push(unauthorized);
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: {
          error: {
            name: "PrivateReaderError",
            status: 403,
            failure: "forbidden",
          },
        },
        session: "cleared:denied",
        issuance: [mode, mode],
        requests: [wire(read.path, { signal: read.signal })],
      });
    }
  });

  it("Data and knowledge reads carry no client scope gate", async () => {
    for (const name of ["json", "knowledge"]) {
      const read = READS[name]!;
      const h = harness("data", [["ops:read"]]);
      await h.session.start();
      h.replies.push(read.ok);
      expect(await trace(h, () => read.run(h)), name).toEqual({
        result: { ok: "ok" },
        session: "ready",
        issuance: ["data"],
        requests: [wire(read.path, { signal: read.signal })],
      });
    }
  });
});

describe("304 and body caps", () => {
  const error = (name: string, message: string) => ({
    result: { error: { name, message } },
  });
  const readerError = (status: number, failure: string) => ({
    result: { error: { name: "PrivateReaderError", status, failure } },
  });

  async function once(
    name: string,
    reply: Reply,
    run?: (h: Harness) => Promise<unknown>,
  ) {
    const read = READS[name]!;
    const h = harness(read.mode);
    await h.session.start();
    h.replies.push(reply);
    const row = await trace(h, () => (run ?? read.run)(h));
    expect(row.requests).toEqual([wire(read.path, { signal: read.signal })]);
    return { result: row.result };
  }

  it("304: not-modified only for a conditional snapshot", async () => {
    expect(await once("json", status(304))).toEqual(
      readerError(304, "unavailable"),
    );
    expect(await once("snapshot", status(304))).toEqual(
      readerError(502, "unavailable"),
    );
    expect(await once("events", status(304))).toEqual(
      readerError(502, "unavailable"),
    );
  });

  it("json mode: 1 MiB of application/json, nothing else", async () => {
    const MiB = 1024 * 1024;
    expect(
      await once("json", text(JSON.stringify("x".repeat(MiB - 2)))),
    ).toEqual({
      result: { ok: "ok" },
    });
    expect(
      await once("json", text(JSON.stringify("x".repeat(MiB - 1)))),
    ).toEqual(error("Error", "Reader response exceeds limit"));
    expect(
      await once(
        "json",
        () =>
          new Response(JSON.stringify(STATUS), {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
      ),
    ).toEqual(error("Error", "Unsupported reader response"));
  });

  it("snapshot: OPS_V1_BOUNDS.maxBytes, declared or streamed", async () => {
    const max = OPS_V1_BOUNDS.maxBytes;
    expect(max).toBe(64 * 1024);
    const padded = (size: number) =>
      SNAPSHOT + " ".repeat(size - SNAPSHOT.length);
    expect(await once("snapshot", text(padded(max)))).toEqual({
      result: { ok: "ok" },
    });
    expect(await once("snapshot", text(padded(max + 1)))).toEqual(
      error("OpsSnapshotError", "Invalid ops_v1 snapshot"),
    );
    expect(
      await once(
        "snapshot",
        text(SNAPSHOT, { "content-length": String(max + 1) }),
      ),
    ).toEqual(error("OpsSnapshotError", "Invalid ops_v1 snapshot"));
    expect(
      await once(
        "snapshot",
        () =>
          new Response(SNAPSHOT, {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
      ),
    ).toEqual(error("OpsSnapshotError", "Invalid ops_v1 snapshot"));
  });

  it("events: OPS_EVENTS_BOUNDS.maxBytes", async () => {
    const max = OPS_EVENTS_BOUNDS.maxBytes;
    expect(max).toBe(512 * 1024);
    const page = JSON.stringify(EVENTS);
    const padded = (size: number) => page + " ".repeat(size - page.length);
    expect(await once("events", text(padded(max)))).toEqual({
      result: { ok: "ok" },
    });
    expect(await once("events", text(padded(max + 1)))).toEqual(
      error("OpsSnapshotError", "Invalid ops_v1 snapshot"),
    );
  });
});

describe("constants shared by the server and the clients", () => {
  it("each client mirror equals the server value", () => {
    expect(PRIVATE_READER_MODES.data.path).toBe(PRIVATE_READER_PATH);
    expect(PRIVATE_READER_MODES.ops.path).toBe(PRIVATE_READER_OPS_PATH);
    expect(PRIVATE_READER_MODES.health.path).toBe(PRIVATE_READER_HEALTH_PATH);
    expect(OPS_CREDENTIAL_ENDPOINT).toBe(PRIVATE_READER_OPS_PATH);
    expect(HEALTH_CREDENTIAL_ENDPOINT).toBe(PRIVATE_READER_HEALTH_PATH);
    expect(PRIVATE_READER_ORIGIN).toBe(PRIVATE_READER_AUDIENCE);
    expect([OPS_SCOPE]).toEqual([...PRIVATE_READER_MODES.ops.scope]);
    expect([HEALTH_SCOPE]).toEqual([...PRIVATE_READER_MODES.health.scope]);
    expect(OPS_SNAPSHOT_PATH).toBe("/v1/ops/snapshot");
    expect(OPS_EVENTS_PATH).toBe("/v1/ops/events");
  });

  it("issued paths, scopes, flags, audience and issuer are byte-identical", () => {
    const canonical = JSON.stringify({
      modes: (["data", "ops", "health"] as const).map((mode) => {
        const selected = PRIVATE_READER_MODES[mode];
        return [
          mode,
          selected.path,
          [...selected.scope],
          "flag" in selected ? selected.flag : null,
        ];
      }),
      audience: PRIVATE_READER_AUDIENCE,
      issuer: PRIVATE_READER_ISSUER,
      origin: PRIVATE_READER_ORIGIN,
    });
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      "be743677f371cdc6882cac8d6e181c9798abd33896b40cfd946fea8f128d7fba",
    );
  });
});
