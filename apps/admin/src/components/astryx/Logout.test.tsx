// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Logout } from "./Logout";
import { recoveryKey } from "../../lib/draft-recovery";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const navigate = vi.fn();
const key = recoveryKey("test", { kind: "page", id: "test" });
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function render() {
  act(() => root.render(<Logout navigate={navigate} />));
}
async function click() {
  await act(async () => {
    host.querySelector("button")!.click();
  });
}
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  localStorage.clear();
  localStorage.setItem(key, "recoverable");
  navigate.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("requires confirmation and clears recovery only after successful revocation", async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ csrf: "test", destination: "/auth" }))
    .mockReturnValueOnce(pending);
  vi.stubGlobal("fetch", fetcher);
  render();
  expect(fetcher).not.toHaveBeenCalled();
  await click();
  await click();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenLastCalledWith("/api/admin/logout", {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: expect.any(AbortSignal),
    method: "POST",
    headers: { "x-admin-csrf": "test" },
  });
  expect(localStorage.getItem(key)).toBe("recoverable");
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => finish(json({ ok: true, destination: "/auth" })));
  expect(localStorage.getItem(key)).toBeNull();
  expect(navigate).toHaveBeenCalledWith("/auth");
});
it.each(["GET", "POST"])(
  "keeps recovery after %s failure and allows retry",
  async (failure) => {
    const fetcher = vi.fn();
    if (failure === "POST")
      fetcher.mockResolvedValueOnce(
        json({ csrf: "test", destination: "/auth" }),
      );
    fetcher.mockResolvedValueOnce(json({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetcher);
    render();
    await click();
    expect(localStorage.getItem(key)).toBe("recoverable");
    expect(navigate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Try again");
    fetcher
      .mockResolvedValueOnce(json({ csrf: "retry", destination: "/auth" }))
      .mockResolvedValueOnce(json({ ok: true, destination: "/auth" }));
    await click();
    expect(navigate).toHaveBeenCalledWith("/auth");
  },
);
it.each(["https://evil.example", "/auth?next=https://evil.example"])(
  "rejects an untrusted destination %s",
  async (destination) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ csrf: "test", destination: "/auth" }))
        .mockResolvedValueOnce(json({ ok: true, destination })),
    );
    render();
    await click();
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe("recoverable");
  },
);
it("completes sign out when browser storage is disabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        json({ csrf: "test", destination: "/cdn-cgi/access/logout" }),
      )
      .mockResolvedValueOnce(
        json({ ok: true, destination: "/cdn-cgi/access/logout" }),
      ),
  );
  render();
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("denied");
  });
  await click();
  expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
});

it("aborts on unmount and ignores a late revocation response", async () => {
  let finish!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ csrf: "test", destination: "/auth" }))
    .mockReturnValueOnce(response);
  vi.stubGlobal("fetch", fetcher);
  render();
  await click();
  act(() => root.render(null));
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => finish(json({ ok: true, destination: "/auth" })));
  expect(localStorage.getItem(key)).toBe("recoverable");
  expect(navigate).not.toHaveBeenCalled();
});
