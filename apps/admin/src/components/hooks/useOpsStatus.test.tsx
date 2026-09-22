// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import sample from "../../fixtures/ops_v1.sample.json";
import { OPS_CREDENTIAL_ENDPOINT, OPS_POLL_MS } from "../../lib/ops-reader";
import { PRIVATE_SESSION_IDLE_MS } from "../../lib/private-session-store";
import { useOpsStatus } from "./useOpsStatus";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const realSetTimeout = globalThis.setTimeout;
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => new Promise((resolve) => realSetTimeout(resolve, 0)));
  }
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Probe({ enabled }: { enabled: boolean }) {
  const { state } = useOpsStatus({ enabled });
  return (
    <output>
      {state.connection}:{state.snapshot ? "snapshot" : "none"}
    </output>
  );
}

describe("the ops session binding", () => {
  it("creates nothing and reads nothing while ops reads are off", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe enabled={false} />));
    expect(host.textContent).toBe("off:none");
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("closes after 15 idle minutes like Data, and reopens on the next interaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T18:00:10Z"));
    const issued = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/editorial/csrf") return Response.json({ csrf: "t" });
        if (url === OPS_CREDENTIAL_ENDPOINT) {
          issued();
          return Response.json({
            credential: "cred",
            scope: ["ops:read"],
            expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
          });
        }
        return new Response(JSON.stringify(sample), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe enabled />));
    await settle();
    expect(host.textContent).toBe("connected:snapshot");
    expect(issued).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(PRIVATE_SESSION_IDLE_MS));
    await settle();
    // Nothing read survives the session.
    expect(host.textContent).toBe("ended:none");
    const reads = vi.mocked(fetch).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(OPS_POLL_MS * 2));
    expect(vi.mocked(fetch).mock.calls.length).toBe(reads);

    await act(async () => window.dispatchEvent(new Event("pointerdown")));
    await settle();
    expect(issued).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("connected:snapshot");
    await act(async () => root.unmount());
  });
});
