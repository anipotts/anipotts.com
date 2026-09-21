// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPrivateReaderSession,
  usePrivateReaderState,
  type PrivateReaderSession,
} from "./private-reader-client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Synthetic fixtures only. No reader network call is made.
const start = Date.UTC(2026, 8, 21, 12, 0, 0);

function fixture(seconds = 60, credential = "synthetic.credential.one") {
  return {
    credential,
    tokenType: "Bearer",
    audience: "https://ap-mini.tail060490.ts.net",
    scope: ["data:read", "activity:read"],
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + seconds,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function session(fetcher: typeof fetch) {
  return createPrivateReaderSession({
    fetch: fetcher,
    csrf: async () => "c".repeat(64),
    renewLeadMs: 10_000,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("private reader client session", () => {
  it("posts same-origin with CSRF and no client scopes, keeping state in memory", async () => {
    const fetcher = vi.fn(async () => json(fixture()));
    const reader = session(fetcher as unknown as typeof fetch);
    await reader.start();
    expect(reader.getState().status).toBe("ready");
    expect(reader.bearer()).toBe("synthetic.credential.one");
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(endpoint).toBe("/api/private-reader/credential");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe("{}");
    expect(
      (init.headers as Record<string, string>)["X-Editorial-CSRF"],
    ).toHaveLength(64);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    reader.logout();
  });

  it("renews before expiry", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => json(fixture(60, "first")))
      .mockImplementationOnce(async () => json(fixture(60, "second")));
    const reader = session(fetcher as unknown as typeof fetch);
    await reader.start();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(reader.bearer()).toBe("second");
    reader.logout();
  });

  it("logout clears state, stops renewal and ignores a late reply", async () => {
    let resolveLate: (response: Response) => void = () => {};
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => json(fixture()))
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (resolveLate = resolve)),
      );
    const reader = session(fetcher as unknown as typeof fetch);
    await reader.start();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    reader.logout();
    resolveLate(json(fixture(60, "late")));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reader.getState()).toEqual({ status: "cleared", reason: "logout" });
    expect(reader.bearer()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears on denied renewal", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => json(fixture()))
      .mockImplementationOnce(async () =>
        json({ error: "owner_required" }, 401),
      );
    const reader = session(fetcher as unknown as typeof fetch);
    await reader.start();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(reader.getState()).toEqual({ status: "cleared", reason: "denied" });
    expect(reader.bearer()).toBeNull();
  });

  it("clears on an unavailable reader without retrying", async () => {
    const fetcher = vi.fn(async () =>
      json({ error: "reader_unavailable" }, 503),
    );
    const reader = session(fetcher as unknown as typeof fetch);
    await reader.start();
    expect(reader.getState()).toEqual({
      status: "cleared",
      reason: "unavailable",
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("expiry clears bound UI when renewal never lands", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => json(fixture(30)))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const reader = session(fetcher as unknown as typeof fetch);

    function Panel({ reader }: { reader: PrivateReaderSession }) {
      const state = usePrivateReaderState(reader);
      return state.status === "ready" ? (
        <p data-testid="private">synthetic private view</p>
      ) : (
        <p data-testid="locked">{state.status}</p>
      );
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<Panel reader={reader} />);
    });
    await act(async () => {
      await reader.start();
    });
    expect(container.textContent).toBe("synthetic private view");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(container.textContent).toBe("cleared");
    expect(reader.getState()).toEqual({ status: "cleared", reason: "expired" });
    act(() => root.unmount());
  });

  it("rejects an already expired credential fixture", async () => {
    const fetcher = vi.fn(async () => json(fixture(0)));
    const reader = session(fetcher as unknown as typeof fetch);
    await reader.start();
    expect(reader.getState().status).toBe("cleared");
  });
});
