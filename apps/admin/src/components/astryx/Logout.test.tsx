import { jsonResponse } from "../../lib/test-json-response";
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
  jsonResponse(JSON.stringify(value), { status });
function render() {
  act(() => root.render(<Logout navigate={navigate} />));
}
async function click() {
  await act(async () => {
    host.querySelector("button")!.click();
  });
}
beforeEach(() => {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, _options: unknown, task: () => unknown) =>
        task(),
    },
  });
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
it("clears plaintext before cookie cleanup and navigates only to fixed Access logout", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json({ csrf: "test", destination: "/cdn-cgi/access/logout" }),
    )
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  render();
  expect(fetcher).not.toHaveBeenCalled();
  await click();
  await click();
  expect(localStorage.getItem(key)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const init = fetcher.mock.calls[1][1] as RequestInit;
  expect(init).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    method: "POST",
  });
  expect(new Headers(init.headers).get("x-admin-csrf")).toBe("test");
  expect(new Headers(init.headers).get("X-Requested-With")).toBe(
    "XMLHttpRequest",
  );
  expect(navigate).not.toHaveBeenCalled();
  await act(async () =>
    finish(json({ ok: true, destination: "/cdn-cgi/access/logout" })),
  );
  expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
});
it.each(["GET", "POST"])(
  "continues to Access logout after %s cookie cleanup failure",
  async (failure) => {
    const fetcher = vi.fn();
    if (failure === "POST")
      fetcher.mockResolvedValueOnce(
        json({ csrf: "test", destination: "/cdn-cgi/access/logout" }),
      );
    fetcher.mockResolvedValueOnce(json({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetcher);
    render();
    await click();
    expect(localStorage.getItem(key)).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
  },
);
it.each(["https://evil.example", "/auth", "/auth?next=https://evil.example"])(
  "ignores untrusted server destination %s",
  async (destination) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(json({ csrf: "test", destination })),
    );
    render();
    await click();
    expect(localStorage.getItem(key)).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
  },
);
it("does not claim completion or navigate when browser cleanup cannot finish", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render();
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("denied");
  });
  await click();
  expect(navigate).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Sign out is incomplete");
});
it("aborts on unmount and ignores a late cookie response after local cleanup", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json({ csrf: "test", destination: "/cdn-cgi/access/logout" }),
    )
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  render();
  await click();
  act(() => root.render(null));
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () =>
    finish(json({ ok: true, destination: "/cdn-cgi/access/logout" })),
  );
  expect(localStorage.getItem(key)).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
});
