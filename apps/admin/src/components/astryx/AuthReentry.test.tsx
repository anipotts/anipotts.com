// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthReentry } from "./AuthReentry";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
let auth: typeof import("../../lib/protected-admin-json");
let recoveryKey: (typeof import("../../lib/draft-recovery"))["recoveryKey"];
let Logout: (typeof import("./Logout"))["Logout"];
let stopDocumentListeners: () => void;
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  const listeners: [
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined,
  ][] = [];
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  const registration = vi
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (listener) listeners.push([type, listener, options]);
      add(type, listener, options);
    });
  stopDocumentListeners = () => {
    for (const [type, listener, options] of listeners)
      remove(type, listener, options);
    registration.mockRestore();
  };
  [auth, { recoveryKey }, { Logout }] = await Promise.all([
    import("../../lib/protected-admin-json"),
    import("../../lib/draft-recovery"),
    import("./Logout"),
  ]);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (
        _name: string,
        _options: unknown,
        callback: () => unknown,
      ) => callback(),
    },
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  stopDocumentListeners();
  vi.unstubAllGlobals();
});
it.each([
  "https://outside.invalid/",
  "//outside.invalid",
  "/auth?next=private",
  "/api/private-reader/credential",
  "/content/ writing",
])(
  "never uses unsafe reentry %s or attaches a return URL to logout",
  (href) => {
    host.innerHTML = renderToStaticMarkup(<AuthReentry href={href} />);
    const links = host.querySelectorAll("a");
    expect(links[0]?.getAttribute("href")).toBe("/");
    expect(links[1]?.getAttribute("href")).toBe("/auth/logout");
  },
);
it.each(["expired", "denied"] as const)(
  "preserves %s recovery until deliberate sign-out confirmation, then follows fixed Access logout",
  async (reason) => {
    const key = recoveryKey("synthetic-owner", {
      kind: "writing",
      id: "synthetic",
    });
    localStorage.setItem(key, "synthetic unsaved recovery");
    auth.lockProtectedSession(reason);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "owner_required" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetcher);
    await act(async () =>
      root.render(
        <AuthReentry href="/content/writing/synthetic?panel=history" />,
      ),
    );
    expect(localStorage.getItem(key)).toBe("synthetic unsaved recovery");
    expect(fetcher).not.toHaveBeenCalled();
    const escape = host.querySelector<HTMLAnchorElement>(
      'a[href="/auth/logout"]',
    )!;
    expect(escape.textContent).toBe("Sign out to change account");
    const router = vi.fn();
    document.addEventListener("click", router);
    escape.addEventListener("click", (event) => event.preventDefault());
    await act(async () => escape.click());
    document.removeEventListener("click", router);
    expect(router).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe("synthetic unsaved recovery");
    const navigate = vi.fn();
    await act(async () => root.render(<Logout navigate={navigate} />));
    expect(localStorage.getItem(key)).toBe("synthetic unsaved recovery");
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(localStorage.getItem(key)).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
