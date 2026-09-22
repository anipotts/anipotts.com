import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const realSetTimeout = globalThis.setTimeout;
import sample from "../fixtures/ops_v1.sample.json";
import { createPrivateReaderSession } from "./private-reader-client";
import {
  PRIVATE_READER_ORIGIN,
  PrivateReaderError,
} from "./private-reader-fetch";
import { PRIVATE_READER_OPS_PATH } from "./private-reader-credential";
import { OPS_V1_BOUNDS, OpsSnapshotError } from "./ops-v1";
import {
  OPS_CREDENTIAL_ENDPOINT,
  OPS_EVENTS_POLL_MS,
  OPS_EVENTS_SHORT_HOLD_MS,
  OPS_EVENTS_WAIT_S,
  OPS_POLL_MS,
  OPS_READ_TIMEOUT_MS,
  OPS_SNAPSHOT_PATH,
  createOpsStatusController,
  readOpsSnapshot,
} from "./ops-reader";

// Synthetic fixtures only. No reader is contacted: every request goes through
// the mocked fetch below.
const SNAPSHOT_URL = `${PRIVATE_READER_ORIGIN}${OPS_SNAPSHOT_PATH}`;
const body = JSON.stringify(sample);

type Reply = (init: RequestInit) => Response | Promise<Response>;

function harness({ scope = ["ops:read"] }: { scope?: string[] } = {}) {
  let issued = 0;
  const replies: Reply[] = [];
  const snapshotRequests: RequestInit[] = [];
  const fetch = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url === OPS_CREDENTIAL_ENDPOINT) {
        issued++;
        return Response.json({
          credential: `cred-${issued}`,
          scope,
          expiresAt: Math.floor(Date.now() / 1000) + 60,
        });
      }
      expect(url).toBe(SNAPSHOT_URL);
      snapshotRequests.push(init);
      const reply = replies.shift();
      if (!reply) throw new TypeError("network down");
      return reply(init);
    },
  ) as unknown as typeof globalThis.fetch;
  const session = createPrivateReaderSession({
    fetch,
    csrf: async () => "csrf-token",
    endpoint: OPS_CREDENTIAL_ENDPOINT,
  });
  return {
    fetch,
    session,
    replies,
    snapshotRequests,
    issued: () => issued,
  };
}

const ok =
  (etag: string | null = '"v1"', text = body): Reply =>
  () =>
    new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...(etag ? { etag } : {}),
      },
    });
const status =
  (code: number): Reply =>
  () =>
    new Response(null, { status: code });
const header = (init: RequestInit, name: string) =>
  (init.headers as Record<string, string>)[name];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T18:05:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ops snapshot read", () => {
  it("uses the ops issuance route, which the server serves", () => {
    expect(OPS_CREDENTIAL_ENDPOINT).toBe(PRIVATE_READER_OPS_PATH);
  });

  it("sends one bearer GET, memory only, and returns the parsed snapshot and ETag", async () => {
    const h = harness();
    await h.session.start();
    h.replies.push(ok());
    const read = await readOpsSnapshot(h.session, null, { fetch: h.fetch });
    expect(read.kind).toBe("snapshot");
    if (read.kind !== "snapshot") return;
    expect(read.etag).toBe('"v1"');
    expect(read.snapshot.catalog).toHaveLength(sample.catalog.length);
    const [init] = h.snapshotRequests;
    expect(init).toMatchObject({
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(init!.headers).toEqual({ Authorization: "Bearer cred-1" });
  });

  it("sends If-None-Match and accepts 304 only for a conditional request", async () => {
    const h = harness();
    await h.session.start();
    h.replies.push(status(304));
    expect(
      await readOpsSnapshot(h.session, '"v1"', { fetch: h.fetch }),
    ).toEqual({ kind: "not-modified" });
    expect(header(h.snapshotRequests[0]!, "If-None-Match")).toBe('"v1"');

    h.replies.push(status(304));
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toBeInstanceOf(PrivateReaderError);
    // A malformed stored tag is never sent.
    h.replies.push(ok());
    await readOpsSnapshot(h.session, "v1\r\nX: y", { fetch: h.fetch });
    expect(header(h.snapshotRequests[2]!, "If-None-Match")).toBeUndefined();
  });

  it("refuses a credential that carries anything but ops:read, before sending", async () => {
    const h = harness({ scope: ["data:read", "activity:read"] });
    await h.session.start();
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toMatchObject({ failure: "forbidden" });
    expect(h.snapshotRequests).toHaveLength(0);
    expect(h.session.getState()).toEqual({
      status: "cleared",
      reason: "denied",
    });
    const both = harness({ scope: ["ops:read", "data:read"] });
    await both.session.start();
    await expect(
      readOpsSnapshot(both.session, null, { fetch: both.fetch }),
    ).rejects.toMatchObject({ failure: "forbidden" });
  });

  it("renews once on 401, then clears the session on a second 401", async () => {
    const h = harness();
    await h.session.start();
    h.replies.push(status(401), ok());
    const read = await readOpsSnapshot(h.session, null, { fetch: h.fetch });
    expect(read.kind).toBe("snapshot");
    expect(h.issued()).toBe(2);
    expect(header(h.snapshotRequests[1]!, "Authorization")).toBe(
      "Bearer cred-2",
    );

    h.replies.push(status(401), status(401));
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toMatchObject({ failure: "unauthorized" });
    expect(h.session.getState()).toMatchObject({ reason: "denied" });
  });

  it("enforces the 64 KB cap and the contract", async () => {
    const h = harness();
    await h.session.start();
    const oversized = `${body}${" ".repeat(OPS_V1_BOUNDS.maxBytes)}`;
    h.replies.push(ok(null, oversized));
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toBeInstanceOf(OpsSnapshotError);
    h.replies.push(
      () =>
        new Response(body, {
          headers: {
            "content-type": "application/json",
            "content-length": String(OPS_V1_BOUNDS.maxBytes + 1),
          },
        }),
    );
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toBeInstanceOf(OpsSnapshotError);
    const extra = structuredClone(sample) as Record<string, any>;
    extra.catalog[0].freshness_budget_s = "unexpected";
    h.replies.push(ok(null, JSON.stringify(extra)));
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toBeInstanceOf(OpsSnapshotError);
    h.replies.push(() => new Response(body, { status: 200 }));
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toBeInstanceOf(OpsSnapshotError);
  });

  it("discards a reply that lands after logout", async () => {
    const h = harness();
    await h.session.start();
    h.replies.push(() => {
      h.session.logout();
      return ok()({});
    });
    await expect(
      readOpsSnapshot(h.session, null, { fetch: h.fetch }),
    ).rejects.toMatchObject({ failure: "expired" });
  });
});

describe("ops status polling", () => {
  let hidden = false;
  beforeEach(() => {
    hidden = false;
  });
  const controllerFor = (h: ReturnType<typeof harness>) =>
    createOpsStatusController({
      session: h.session,
      fetch: h.fetch,
      isHidden: () => hidden,
    });
  const flush = () => vi.advanceTimersByTimeAsync(0);

  it("reads at start, then every 30 seconds with If-None-Match, handling 304", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(ok('"v1"'), status(304), ok('"v2"'));
    controller.start();
    await flush();
    expect(controller.getState().connection).toBe("connected");
    expect(controller.getState().snapshot?.catalog).toHaveLength(
      sample.catalog.length,
    );
    const first = controller.getState().snapshot;

    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(h.snapshotRequests).toHaveLength(2);
    expect(header(h.snapshotRequests[1]!, "If-None-Match")).toBe('"v1"');
    expect(controller.getState().snapshot).toBe(first);
    expect(controller.getState().checkedAt).toBe(Date.now());

    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(h.snapshotRequests).toHaveLength(3);
    expect(header(h.snapshotRequests[2]!, "If-None-Match")).toBe('"v1"');
    h.replies.push(status(304));
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(header(h.snapshotRequests[3]!, "If-None-Match")).toBe('"v2"');
    controller.dispose();
  });

  it("polls only while the tab is visible", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(ok());
    controller.start();
    await flush();
    expect(h.snapshotRequests).toHaveLength(1);

    hidden = true;
    controller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS * 4);
    expect(h.snapshotRequests).toHaveLength(1);

    // Shown again after the interval passed: read now, not a full wait later.
    hidden = false;
    h.replies.push(status(304));
    controller.visibilityChanged();
    await flush();
    expect(h.snapshotRequests).toHaveLength(2);

    // Shown again before the next read is due: wait for the remainder.
    hidden = true;
    controller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(10_000);
    hidden = false;
    controller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.snapshotRequests).toHaveLength(2);
    h.replies.push(status(304));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.snapshotRequests).toHaveLength(3);
    controller.dispose();
  });

  it("does not start a read while hidden", async () => {
    hidden = true;
    const h = harness();
    const controller = controllerFor(h);
    controller.start();
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS * 2);
    expect(h.fetch).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("clears the snapshot on logout and on credential expiry", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(ok());
    controller.start();
    await flush();
    expect(controller.getState().snapshot).not.toBeNull();
    controller.end();
    expect(controller.getState()).toEqual({
      connection: "ended",
      snapshot: null,
      checkedAt: null,
      events: null,
      eventsStale: false,
    });
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS * 2);
    expect(h.snapshotRequests).toHaveLength(1);

    const e = harness();
    const expiring = controllerFor(e);
    e.replies.push(ok());
    expiring.start();
    await flush();
    // The renewal never answers, so the credential reaches its expiry.
    vi.mocked(e.fetch).mockImplementationOnce(() => new Promise(() => {}));
    hidden = true;
    expiring.visibilityChanged();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(expiring.getState().snapshot).toBeNull();
    expiring.dispose();
  });

  it("keeps the last snapshot, marked unreachable, when a read fails", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(ok());
    controller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState().connection).toBe("unreachable");
    expect(controller.getState().snapshot).not.toBeNull();

    // The reader answered, with a server error: its own hop.
    h.replies.push(status(500));
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState()).toMatchObject({
      connection: "unreachable",
      hop: "reader",
    });
    controller.dispose();
  });

  it("names the hop for a read with no reply: at once, or past the deadline (A-26)", async () => {
    const h = harness();
    const controller = controllerFor(h);
    // No reply queued: the fetch fails at once, as a block would.
    controller.start();
    await flush();
    expect(controller.getState()).toMatchObject({
      connection: "unreachable",
      hop: "unanswered",
    });
    // A request that goes out and hangs until the deadline aborts it.
    h.replies.push(
      (init) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    await vi.advanceTimersByTimeAsync(OPS_READ_TIMEOUT_MS);
    expect(controller.getState()).toMatchObject({
      connection: "unreachable",
      hop: "timeout",
    });
    h.replies.push(ok());
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState().connection).toBe("connected");
    expect(controller.getState().hop).toBeUndefined();
    controller.dispose();
  });

  it("reports 503 as no valid snapshot, keeping the last one and polling on", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(status(503));
    controller.start();
    await flush();
    expect(controller.getState()).toMatchObject({
      connection: "unavailable",
      snapshot: null,
    });
    h.replies.push(ok(), status(503));
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState().connection).toBe("connected");
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState().connection).toBe("unavailable");
    expect(controller.getState().snapshot).not.toBeNull();
    // The session survives a 503: the next read reuses the credential.
    expect(h.session.getState().status).toBe("ready");
    controller.dispose();
  });

  it("drops a snapshot that breaks the contract", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(ok(), ok('"v2"', JSON.stringify({ ...sample, extra: 1 })));
    controller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState()).toMatchObject({
      connection: "rejected",
      snapshot: null,
    });
    controller.dispose();
  });

  it("stops and clears when the reader refuses the credential", async () => {
    const h = harness();
    const controller = controllerFor(h);
    h.replies.push(status(403));
    controller.start();
    await flush();
    expect(controller.getState()).toMatchObject({
      connection: "denied",
      snapshot: null,
    });
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS * 2);
    expect(h.snapshotRequests).toHaveLength(1);
    controller.dispose();
  });

  it("names admin's issuance, never ap-mini, when no credential is issued (A-26)", async () => {
    const h = harness();
    vi.mocked(h.fetch).mockImplementationOnce(
      async () => new Response(null, { status: 503 }),
    );
    const controller = controllerFor(h);
    controller.start();
    await flush();
    expect(controller.getState().connection).toBe("unissued");
    expect(h.snapshotRequests).toHaveLength(0);
    controller.dispose();
  });
});

describe("ops events polling", () => {
  let hidden = false;
  const item = (seq: number) => ({
    seq,
    at: "2026-09-21T17:00:00Z",
    kind: "access",
    subject: "data.search",
    from_state: null,
    to_state: null,
    status: 200,
    ms: 10 + seq,
    detail: null,
  });
  const page = (items: unknown[], nextAfter: number | null) =>
    new Response(
      JSON.stringify({
        version: "ops_events_v1",
        items,
        next_after: nextAfter,
      }),
      { headers: { "content-type": "application/json" } },
    );
  function eventsHarness(
    pages: Record<number, () => Response | Promise<Response>>,
    extra: { eventsWaitS?: number | null } = { eventsWaitS: null },
  ) {
    const afters: number[] = [];
    const waits: Array<string | null> = [];
    const signals: AbortSignal[] = [];
    const snapshots: Array<string | undefined> = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "https://admin.invalid");
        if (init?.signal && url.pathname === "/v1/ops/events")
          signals.push(init.signal);
        if (String(input) === OPS_CREDENTIAL_ENDPOINT)
          return Response.json({
            credential: "cred",
            scope: ["ops:read"],
            expiresAt: Math.floor(Date.now() / 1000) + 60,
          });
        if (url.pathname === OPS_SNAPSHOT_PATH) {
          const tag = init ? header(init, "If-None-Match") : undefined;
          snapshots.push(tag);
          return tag === '"v1"'
            ? new Response(null, { status: 304 })
            : new Response(body, {
                headers: { "content-type": "application/json", etag: '"v1"' },
              });
        }
        expect(url.origin).toBe(PRIVATE_READER_ORIGIN);
        expect(url.pathname).toBe("/v1/ops/events");
        expect(
          [...url.searchParams.keys()].filter((key) => key !== "wait"),
        ).toEqual(["after", "limit"]);
        const after = Number(url.searchParams.get("after"));
        afters.push(after);
        waits.push(url.searchParams.get("wait"));
        const reply = pages[after];
        if (!reply) throw new TypeError("network down");
        return reply();
      },
    ) as unknown as typeof globalThis.fetch;
    const session = createPrivateReaderSession({
      fetch,
      csrf: async () => "csrf-token",
      endpoint: OPS_CREDENTIAL_ENDPOINT,
    });
    const controller = createOpsStatusController({
      session,
      fetch,
      isHidden: () => hidden,
      events: true,
      ...extra,
    });
    return { controller, afters, waits, signals, snapshots };
  }
  // The snapshot read, then the events loop it starts.
  // Response bodies resolve on real macrotasks, so each round lets one run
  // before the fake clock moves again.
  const flush = async () => {
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(0);
      await new Promise((resolve) => realSetTimeout(resolve, 0));
    }
  };
  beforeEach(() => {
    hidden = false;
  });

  it("pages the feed with the after cursor until next_after is null", async () => {
    const { controller, afters } = eventsHarness({
      0: () => page([item(1), item(2)], 2),
      2: () => page([item(3)], null),
      3: () => page([], null),
    });
    expect(controller.getState().events?.cursor).toBe(0);
    controller.start();
    await flush();
    expect(afters).toEqual([0, 2]);
    const events = controller.getState().events!;
    expect(events.cursor).toBe(3);
    expect(events.recent.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(controller.getState().eventsStale).toBe(false);
    // The next poll, 5 s later, continues from the last seq held.
    await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS - 1);
    expect(afters).toEqual([0, 2]);
    await vi.advanceTimersByTimeAsync(1);
    expect(afters).toEqual([0, 2, 3]);
    controller.dispose();
  });

  it("polls events every 5 s while visible, pauses hidden, reads at once on show", async () => {
    const { controller, afters } = eventsHarness({
      0: () => page([item(1)], null),
      1: () => page([], null),
    });
    controller.start();
    await flush();
    expect(afters).toEqual([0]);
    await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS * 2);
    expect(afters).toEqual([0, 1, 1]);
    hidden = true;
    controller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS * 4);
    expect(afters).toEqual([0, 1, 1]);
    hidden = false;
    controller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(afters).toEqual([0, 1, 1, 1]);
    controller.dispose();
  });

  it("applies a new transition on the next 5 s poll with no reload", async () => {
    const transition = (seq: number, to: string) => ({
      seq,
      at: "2026-09-21T17:59:00Z",
      kind: "transition",
      subject: "pc.writer",
      from_state: "ok",
      to_state: to,
      status: null,
      ms: null,
      detail: "last pass failed",
    });
    let later: unknown[] = [];
    const { controller } = eventsHarness({
      0: () => page([item(1)], null),
      1: () => page(later, null),
      2: () => page([], null),
    });
    controller.start();
    await flush();
    expect(controller.getState().events?.transitions).toHaveLength(0);
    later = [transition(2, "failing")];
    await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS);
    const transitions = controller.getState().events!.transitions;
    expect(transitions.map((event) => [event.subject, event.to])).toEqual([
      ["pc.writer", "failing"],
    ]);
    controller.dispose();
  });

  it("reads the snapshot at once when a transition or a run arrives", async () => {
    const change = (seq: number, kind: "transition" | "run") => ({
      seq,
      at: "2026-09-21T17:59:00Z",
      kind,
      subject: "pc.writer",
      from_state: kind === "transition" ? "ok" : null,
      to_state: kind === "transition" ? "failing" : null,
      status: kind === "run" ? 0 : null,
      ms: kind === "run" ? 5200 : null,
      detail: null,
    });
    // A zero delay set inside a fake-timer tick lands 1 ms later.
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flush();
    };
    for (const kind of ["transition", "run"] as const) {
      const { controller, snapshots } = eventsHarness({
        // The first read's backlog is history the snapshot already shows.
        0: () => page([item(1), change(2, kind)], null),
        // Access rows leave the snapshot to its 30 s poll.
        2: () => page([item(3)], null),
        3: () => page([change(4, kind)], null),
        4: () => page([], null),
      });
      controller.start();
      await flush();
      await settle();
      expect(snapshots).toEqual([undefined]);
      await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS);
      await settle();
      expect(snapshots).toEqual([undefined]);
      // The change reads it now, conditionally, well inside the 30 s.
      await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS);
      await settle();
      expect(snapshots, kind).toEqual([undefined, '"v1"']);
      expect(controller.getState().connection).toBe("connected");
      // The next poll is 30 s after that read, not after the first one.
      await vi.advanceTimersByTimeAsync(OPS_POLL_MS - 1_000);
      await flush();
      expect(snapshots).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1_000);
      await flush();
      expect(snapshots).toHaveLength(3);
      controller.dispose();
    }
  });

  it("keeps what was read when a later page fails and marks events stale", async () => {
    const { controller, afters } = eventsHarness({
      0: () => page([item(1), item(2)], 2),
      2: () => new Response(null, { status: 503 }),
    });
    controller.start();
    await flush();
    expect(afters).toEqual([0, 2]);
    const state = controller.getState();
    expect(state.events?.cursor).toBe(2);
    expect(state.events?.recent).toHaveLength(2);
    expect(state.eventsStale).toBe(true);
    // The snapshot is unaffected by an events failure.
    expect(state.connection).toBe("connected");
    expect(state.snapshot).not.toBeNull();
    controller.dispose();
  });

  it("drops a page that breaks the contract and starts over", async () => {
    const { controller } = eventsHarness({
      0: () => page([{ ...item(1), seq: "1" }], null),
    });
    controller.start();
    await flush();
    expect(controller.getState().events).toEqual({
      cursor: 0,
      transitions: [],
      runs: [],
      recent: [],
      unknownFields: [],
      skipped: 0,
    });
    expect(controller.getState().eventsStale).toBe(true);
    controller.dispose();
  });

  it("marks events not current when most of a page is unreadable, and moves on", async () => {
    const bad = (seq: number) => ({ ...item(seq), at: "2026-09-22 10:00:00" });
    const { controller } = eventsHarness({
      0: () => page([bad(1), bad(2), bad(3)], null),
    });
    controller.start();
    await flush();
    // Past the drift, so the next poll never reads it again, but not
    // current: Activity cannot read as a quiet, complete page.
    expect(controller.getState().events).toMatchObject({
      cursor: 3,
      skipped: 3,
    });
    expect(controller.getState().eventsStale).toBe(true);
    controller.dispose();
  });

  it("keeps a lone unreadable item's count in the log", async () => {
    const { controller } = eventsHarness({
      0: () => page([item(1), { ...item(2), at: "yesterday" }], null),
    });
    controller.start();
    await flush();
    expect(controller.getState().events).toMatchObject({
      cursor: 2,
      skipped: 1,
    });
    expect(controller.getState().eventsStale).toBe(false);
    controller.dispose();
  });

  it("names the item fields System sent that it does not read yet", async () => {
    const { controller } = eventsHarness({
      0: () => page([{ ...item(1), region: "x" }], null),
      1: () => page([{ ...item(2), region: "y", tier: 2 }], null),
      2: () => page([], null),
    });
    controller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS);
    await flush();
    const events = controller.getState().events!;
    expect(events.recent).toHaveLength(2);
    expect(events.unknownFields).toEqual(["region", "tier"]);
    controller.dispose();
  });

  it("clears the events on logout", async () => {
    const { controller } = eventsHarness({
      0: () => page([item(1)], null),
      1: () => page([], null),
    });
    controller.start();
    await flush();
    expect(controller.getState().events?.recent).toHaveLength(1);
    controller.end();
    expect(controller.getState()).toMatchObject({
      connection: "ended",
      snapshot: null,
      events: {
        cursor: 0,
        transitions: [],
        runs: [],
        recent: [],
        unknownFields: [],
      },
      eventsStale: false,
    });
  });

  describe("long-poll", () => {
    const held = (items: unknown[], ms: number) => () =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(page(items, null)), ms),
      );

    it("asks the reader to hold for 25 s and re-issues as soon as it answers", async () => {
      let seq = 1;
      const replies: Record<number, () => Response | Promise<Response>> = {
        0: () => page([item(1)], null),
      };
      // Each held request answers after 3 s with one new event.
      for (let n = 1; n < 6; n++)
        replies[n] = () => {
          seq += 1;
          return held([item(seq)], 3_000)();
        };
      const { controller, afters, waits } = eventsHarness(replies, {
        eventsWaitS: OPS_EVENTS_WAIT_S,
      });
      controller.start();
      await flush();
      expect(waits[0]).toBe(String(OPS_EVENTS_WAIT_S));
      expect(OPS_EVENTS_WAIT_S).toBe(25);
      await vi.advanceTimersByTimeAsync(3_000);
      await flush();
      await vi.advanceTimersByTimeAsync(3_000);
      await flush();
      // No 5 s gap: each answer is followed at once by the next hold.
      expect(afters.slice(0, 3)).toEqual([0, 1, 2]);
      expect(controller.getState().events?.cursor).toBeGreaterThanOrEqual(2);
      controller.dispose();
    });

    it("backs off 1 s after an immediate empty answer, then 5 s after repeats", async () => {
      const replies: Record<number, () => Response> = {
        0: () => page([], null),
      };
      const { controller, afters } = eventsHarness(replies, {
        eventsWaitS: OPS_EVENTS_WAIT_S,
      });
      controller.start();
      await flush();
      expect(afters).toHaveLength(1);
      // Not spinning: nothing more until the 1 s back-off passes.
      await vi.advanceTimersByTimeAsync(OPS_EVENTS_SHORT_HOLD_MS - 1);
      expect(afters).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(afters).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(OPS_EVENTS_SHORT_HOLD_MS);
      await flush();
      expect(afters).toHaveLength(3);
      // Three short holds in a row fall back to the 5 s interval.
      await vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS - 1);
      expect(afters).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(afters).toHaveLength(4);
      controller.dispose();
    });

    it("aborts the held request when the tab hides and again on logout", async () => {
      const { controller, signals } = eventsHarness(
        {
          0: () => page([item(1)], null),
          1: held([], 25_000),
        },
        { eventsWaitS: OPS_EVENTS_WAIT_S },
      );
      controller.start();
      await flush();
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(signals).toHaveLength(2);
      const holding = signals.at(-1)!;
      expect(holding.aborted).toBe(false);
      hidden = true;
      controller.visibilityChanged();
      expect(holding.aborted).toBe(true);
      hidden = false;
      controller.visibilityChanged();
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      const again = signals.at(-1)!;
      expect(again).not.toBe(holding);
      controller.end();
      expect(again.aborted).toBe(true);
    });
  });

  it("reads no events for a view that did not ask for them", async () => {
    const h = harness();
    const controller = createOpsStatusController({
      session: h.session,
      fetch: h.fetch,
      isHidden: () => hidden,
    });
    h.replies.push(ok());
    controller.start();
    await flush();
    expect(controller.getState().events).toBeNull();
    expect(h.snapshotRequests).toHaveLength(1);
    controller.dispose();
  });
});
