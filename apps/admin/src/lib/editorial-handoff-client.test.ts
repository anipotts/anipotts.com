// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:4311"}
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  startEditorialHandoff,
  stableHandoffOperationId,
  HANDOFF_PRODUCTION,
  handoffExecutionDeadline,
  HANDOFF_ACK_RESERVE_MS,
  HANDOFF_TIMEOUT_MS,
  validateHandoffReceipt,
} from "./editorial-handoff-client";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const payload = {
  record: { kind: "writing", id: "essay" } as const,
  source: "body",
  localRevision: 7,
  baseSha256: "a".repeat(64),
  operationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};
const digest = createHash("sha256").update(payload.source).digest("hex");
const intent = {
  record: payload.record,
  operationId: payload.operationId,
  sourceSha256: digest,
};
const savedReceipt = {
  ...intent,
  revision: 99,
  expectedPublicationId: null,
};
const publishedReceipt = {
  ...savedReceipt,
  directPublication: {
    publicationId: payload.operationId,
    record: payload.record,
    revision: savedReceipt.revision,
    sourceSha256: digest,
    publishedAt: "2026-09-13T00:00:00.000Z",
  },
};
it("opens before payload resolves and only sends to the exact origin, window and nonce", async () => {
  let release!: (value: typeof payload) => void;
  const data = new Promise<typeof payload>((r) => (release = r));
  const popup = { closed: false, postMessage: vi.fn() } as unknown as Window;
  const open = vi.spyOn(window, "open").mockReturnValue(popup);
  const result = startEditorialHandoff(data);
  expect(open).toHaveBeenCalledOnce();
  const nonce = new URL(open.mock.calls[0]![0] as string).hash.slice(1);
  const send = (origin: string, source: Window | null, detail: object) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source,
        data: { nonce, ...detail },
      }),
    );
  send("https://evil.example", popup, { type: "editorial-handoff-ready" });
  send(HANDOFF_PRODUCTION, null, { type: "editorial-handoff-ready" });
  expect(popup.postMessage).not.toHaveBeenCalled();
  send(HANDOFF_PRODUCTION, popup, { type: "editorial-handoff-ready" });
  release(payload);
  await new Promise((r) => setTimeout(r, 0));
  expect(popup.postMessage).toHaveBeenCalledWith(
    {
      type: "editorial-handoff-data",
      nonce,
      deadline: expect.any(Number),
      payload: { ...payload, media: [] },
    },
    HANDOFF_PRODUCTION,
  );
  const receipt = savedReceipt;
  send(HANDOFF_PRODUCTION, popup, { type: "editorial-handoff-done", receipt });
  expect(await result).toEqual({ popup, receipt });
});
it("fails recoverably when popup is blocked", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  await expect(startEditorialHandoff(payload)).rejects.toThrow(
    "Allow the production editor",
  );
});
it("rejects after popup close without focusing or changing its location", async () => {
  vi.useFakeTimers();
  const popup = { closed: true, postMessage: vi.fn() } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  const result = startEditorialHandoff(payload);
  const check = expect(result).rejects.toThrow("closed");
  await vi.advanceTimersByTimeAsync(500);
  await check;
});

it("retains stable operation identity across retries, modes and source changes", () => {
  localStorage.clear();
  const hash = "b".repeat(64),
    base = "c".repeat(64);
  const first = stableHandoffOperationId(payload.record, hash, base, false);
  expect(stableHandoffOperationId(payload.record, hash, base, false)).toBe(
    first,
  );
  expect(stableHandoffOperationId(payload.record, hash, base, true)).not.toBe(
    first,
  );
  expect(
    stableHandoffOperationId(payload.record, "d".repeat(64), base, false),
  ).not.toBe(first);
  expect(stableHandoffOperationId(payload.record, hash, base, false)).toBe(
    first,
  );
  expect(
    Object.values(localStorage).every((value) => /^[a-f0-9-]{36}$/.test(value)),
  ).toBe(true);
});

it("observes asynchronous preparation failures even when the popup is blocked", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  let reject!: (error: Error) => void;
  const preparing = new Promise<typeof payload>((_resolve, failure) => {
    reject = failure;
  });
  await expect(startEditorialHandoff(preparing)).rejects.toThrow(
    "Allow the production editor",
  );
  reject(new Error("late preparation failure"));
  await new Promise((resolve) => setTimeout(resolve, 0));
});
it("reserves bounded acknowledgment time and rejects expired or fabricated deadlines", () => {
  const now = 1000000;
  expect(handoffExecutionDeadline(now + HANDOFF_TIMEOUT_MS, now)).toBe(
    now + HANDOFF_TIMEOUT_MS - HANDOFF_ACK_RESERVE_MS,
  );
  for (const deadline of [
    undefined,
    "future",
    now,
    now + HANDOFF_ACK_RESERVE_MS,
    now + HANDOFF_TIMEOUT_MS + 1,
  ])
    expect(() => handoffExecutionDeadline(deadline, now)).toThrow("expired");
});
it("acknowledges the exact originating local revision, not the production revision", async () => {
  const popup = { closed: false, postMessage: vi.fn() } as unknown as Window;
  const open = vi.spyOn(window, "open").mockReturnValue(popup);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrf: "fixture" })))
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  const result = startEditorialHandoff({ ...payload, publish: true });
  const nonce = new URL(open.mock.calls[0]![0] as string).hash.slice(1);
  const receipt = publishedReceipt;
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: HANDOFF_PRODUCTION,
      source: popup,
      data: { type: "editorial-handoff-ready", nonce },
    }),
  );
  await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce());
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: HANDOFF_PRODUCTION,
      source: popup,
      data: { type: "editorial-handoff-done", nonce, receipt },
    }),
  );
  await result;
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({
    localRevision: 7,
    source: "body",
    publicationId: payload.operationId,
  });
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).record).toEqual(
    payload.record,
  );
});

it.each([
  ["missing publication", savedReceipt],
  [
    "another record",
    { ...publishedReceipt, record: { kind: "writing", id: "other" } },
  ],
  ["another source", { ...publishedReceipt, sourceSha256: "b".repeat(64) }],
  [
    "another operation",
    {
      ...publishedReceipt,
      operationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    },
  ],
  ["invalid revision", { ...publishedReceipt, revision: 0 }],
  ["invalid pointer", { ...publishedReceipt, expectedPublicationId: {} }],
  [
    "missing pointer",
    { ...publishedReceipt, expectedPublicationId: undefined },
  ],
  [
    "another publication",
    {
      ...publishedReceipt,
      directPublication: {
        ...publishedReceipt.directPublication,
        publicationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
    },
  ],
  [
    "another published record",
    {
      ...publishedReceipt,
      directPublication: {
        ...publishedReceipt.directPublication,
        record: { kind: "writing", id: "other" },
      },
    },
  ],
  [
    "another published source",
    {
      ...publishedReceipt,
      directPublication: {
        ...publishedReceipt.directPublication,
        sourceSha256: "b".repeat(64),
      },
    },
  ],
  [
    "another production revision",
    {
      ...publishedReceipt,
      directPublication: {
        ...publishedReceipt.directPublication,
        revision: 100,
      },
    },
  ],
  [
    "missing publication time",
    {
      ...publishedReceipt,
      directPublication: {
        ...publishedReceipt.directPublication,
        publishedAt: undefined,
      },
    },
  ],
  [
    "invalid publication time",
    {
      ...publishedReceipt,
      directPublication: {
        ...publishedReceipt.directPublication,
        publishedAt: "not a time",
      },
    },
  ],
])(
  "rejects %s without acknowledging or changing the local published base",
  async (_name, receipt) => {
    const popup = { closed: false, postMessage: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = startEditorialHandoff({ ...payload, publish: true });
    const rejected = expect(result).rejects.toThrow(
      "confirmation did not match",
    );
    const nonce = new URL(open.mock.calls[0]![0] as string).hash.slice(1);
    const send = (type: string) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: HANDOFF_PRODUCTION,
          source: popup,
          data: { type, nonce, receipt },
        }),
      );
    send("editorial-handoff-ready");
    await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce());
    send("editorial-handoff-done");
    await rejected;
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("validates the private import before publishing and accepts its unchanged replay identity", () => {
  expect(validateHandoffReceipt(savedReceipt, intent)).toEqual(savedReceipt);
  expect(() =>
    validateHandoffReceipt(
      { ...savedReceipt, sourceSha256: "c".repeat(64) },
      intent,
    ),
  ).toThrow("confirmation did not match");
  expect(validateHandoffReceipt(publishedReceipt, intent, true)).toEqual(
    publishedReceipt,
  );
  expect(validateHandoffReceipt(publishedReceipt, intent, true)).toEqual(
    publishedReceipt,
  );
  expect(() => validateHandoffReceipt(publishedReceipt, intent)).toThrow(
    "confirmation did not match",
  );
});

it("ignores a premature completion before the prepared payload is delivered", async () => {
  const popup = { closed: false, postMessage: vi.fn() } as unknown as Window;
  const open = vi.spyOn(window, "open").mockReturnValue(popup);
  const result = startEditorialHandoff(payload);
  const resolved = vi.fn();
  void result.then(resolved);
  const nonce = new URL(open.mock.calls[0]![0] as string).hash.slice(1);
  const send = (type: string) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: HANDOFF_PRODUCTION,
        source: popup,
        data: { type, nonce, receipt: savedReceipt },
      }),
    );
  send("editorial-handoff-done");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(resolved).not.toHaveBeenCalled();
  send("editorial-handoff-ready");
  await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce());
  send("editorial-handoff-done");
  await result;
  expect(resolved).toHaveBeenCalledOnce();
});
