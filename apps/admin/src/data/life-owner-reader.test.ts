import { afterEach, describe, expect, it, vi } from "vitest";
import { createLifeOwnerReader } from "./life-owner-reader";
const endpoint = "https://synthetic.invalid/life/v1/read";
const response = () =>
  new Response(JSON.stringify({ items: [], total: 0, next_offset: null }), {
    headers: { "content-type": "application/json" },
  });
afterEach(() => vi.useRealTimers());
describe("owner read proposal adapter", () => {
  it("sends bounded search only in a POST body with no cookies or redirects", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(response());
    const client = createLifeOwnerReader({
      endpoint,
      ticket: "synthetic",
      expiresAt: Date.now() + 60_000,
      fetch: send,
      onLock: vi.fn(),
    });
    try {
      expect(
        (
          await client.read({
            method: "search",
            q: "synthetic private query",
            kind: "person",
          })
        ).state,
      ).toBe("ready");
      expect(send.mock.calls[0][0]).toBe(endpoint);
      expect(send.mock.calls[0][1]).toMatchObject({
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual({
        method: "search",
        args: {
          q: "synthetic private query",
          kind: "person",
          limit: 30,
          offset: 0,
        },
      });
    } finally {
      client.lock();
    }
  });
  it("denies later-stage methods and rejects malformed requests before sending", async () => {
    const send = vi.fn<typeof fetch>();
    const client = createLifeOwnerReader({
      endpoint,
      ticket: "synthetic",
      expiresAt: Date.now() + 60_000,
      fetch: send,
      onLock: vi.fn(),
    });
    try {
      expect(
        (await client.read({ method: "preview", q: "fixture" })).state,
      ).toBe("denied");
      expect(
        (await client.read({ method: "search", q: "x".repeat(2049) })).state,
      ).toBe("invalid");
      expect(send).not.toHaveBeenCalled();
    } finally {
      client.lock();
    }
  });
  it("locks on denial and never forwards provider body text", async () => {
    const onLock = vi.fn();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private failure", { status: 403 }));
    const client = createLifeOwnerReader({
      endpoint,
      ticket: "synthetic",
      expiresAt: Date.now() + 60_000,
      fetch: send,
      onLock,
    });
    expect((await client.read({ method: "sources" })).state).toBe("denied");
    expect(onLock).toHaveBeenCalledTimes(1);
    await client.read({ method: "sources" });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("expires an in-flight transport even when it ignores abort", async () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => {}));
    const client = createLifeOwnerReader({
      endpoint,
      ticket: "synthetic",
      expiresAt: Date.now() + 1000,
      fetch: send,
      onLock,
    });
    const read = client.read({ method: "sources" });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await read).state).toBe("denied");
    expect(onLock).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized streamed bodies without trusting content length", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("x".repeat(1024 * 1024 + 1), {
        headers: {
          "content-type": "application/json",
          "content-length": "1",
        },
      }),
    );
    const client = createLifeOwnerReader({
      endpoint,
      ticket: "synthetic",
      expiresAt: Date.now() + 60_000,
      fetch: send,
      onLock: vi.fn(),
    });
    try {
      expect((await client.read({ method: "sources" })).state).toBe(
        "unavailable",
      );
    } finally {
      client.lock();
    }
  });
  it("rejects insecure or query-bearing endpoints before construction", () => {
    for (const url of [
      "http://synthetic.invalid/life/v1/read",
      endpoint + "?q=private",
    ]) {
      expect(() =>
        createLifeOwnerReader({
          endpoint: url,
          ticket: "synthetic",
          expiresAt: Date.now() + 60_000,
          fetch: vi.fn(),
          onLock: vi.fn(),
        }),
      ).toThrow("Unsupported Life endpoint");
    }
  });
  it("never returns data from a transport resolving after lock", async () => {
    let resolve!: (value: Response) => void;
    const send = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const client = createLifeOwnerReader({
      endpoint,
      ticket: "synthetic",
      expiresAt: Date.now() + 60_000,
      fetch: send,
      onLock: vi.fn(),
    });
    const result = client.read({ method: "sources" });
    client.lock();
    resolve(response());
    const settled = await result;
    expect(settled.state).toBe("denied");
    expect(settled).not.toHaveProperty("data");
    expect((await client.read({ method: "sources" })).state).toBe("denied");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(["lock", "timeout"] as const)(
    "cancels a stalled body on %s",
    async (reason) => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, {
            headers: { "content-type": "application/json" },
          }),
        );
      const client = createLifeOwnerReader({
        endpoint,
        ticket: "synthetic",
        expiresAt: Date.now() + 60_000,
        fetch: send,
        onLock: vi.fn(),
      });
      try {
        const result = client.read({ method: "sources" });
        await vi.advanceTimersByTimeAsync(0);
        expect(body.locked).toBe(true);
        if (reason === "lock") client.lock();
        else await vi.advanceTimersByTimeAsync(5000);
        const settled = await result;
        expect(settled.state).toBe(
          reason === "lock" ? "denied" : "unavailable",
        );
        expect(settled).not.toHaveProperty("data");
        expect(cancel).toHaveBeenCalledTimes(1);
      } finally {
        client.lock();
      }
    },
  );
});
