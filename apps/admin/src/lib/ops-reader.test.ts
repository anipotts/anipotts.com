import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  OPS_POLL_MS,
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
    extra.catalog[0].note = "unexpected";
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

    h.replies.push(status(503));
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS);
    expect(controller.getState().connection).toBe("unreachable");
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

  it("reports unreachable when issuance is unavailable", async () => {
    const h = harness();
    vi.mocked(h.fetch).mockImplementationOnce(
      async () => new Response(null, { status: 503 }),
    );
    const controller = controllerFor(h);
    controller.start();
    await flush();
    expect(controller.getState().connection).toBe("unreachable");
    expect(h.snapshotRequests).toHaveLength(0);
    controller.dispose();
  });
});
