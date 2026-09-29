// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../fixtures/data_v1.synthetic.json";

// Compile the finite real component graph at collection, before each synthetic
// document's bounded setup. Module resets below still give every document fresh
// session and route authority rather than reusing the preloaded instances.
await Promise.all([
  import("../../lib/protected-admin-json"),
  import("../../lib/client-routes"),
  import("./PrivateShell"),
]);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let auth: typeof import("../../lib/protected-admin-json");
let routes: typeof import("../../lib/client-routes");
let PrivateShell: (typeof import("./PrivateShell"))["PrivateShell"];
let host: HTMLDivElement;
let root: Root;
let viewCreated = false;
let stopDocumentListeners: (() => void) | undefined;
const content = [
  {
    title: "Synthetic unpublished private sentinel",
    href: "/content/writing/synthetic-private",
    collection: "writing",
    status: "draft",
  },
];
beforeEach(async () => {
  viewCreated = false;
  stopDocumentListeners = undefined;
  vi.resetModules();
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  history.replaceState(null, "", "/");
  // Discard listeners with the synthetic document, including module-owned
  // lifecycle listeners that React unmount alone does not retire.
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
  [auth, routes, { PrivateShell }] = await Promise.all([
    import("../../lib/protected-admin-json"),
    import("../../lib/client-routes"),
    import("./PrivateShell"),
  ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  viewCreated = true;
});
afterEach(async () => {
  try {
    if (viewCreated) await act(async () => root.unmount());
  } finally {
    if (viewCreated) host.remove();
    stopDocumentListeners?.();
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
  }
});

it.each(["expired", "denied", "logout"] as const)(
  "withdraws overview draft records and immediately unregisters routes after %s",
  async (reason) => {
    await act(async () =>
      root.render(
        <PrivateShell
          initialPath="/"
          content={content}
          dataEnabled={false}
          enabled={false}
        />,
      ),
    );
    expect(host.textContent).toContain(content[0]!.title);
    await act(async () => {
      auth.lockProtectedSession(reason);
      // Route authority ends synchronously, before React commits its inert tree.
      expect(routes.clientNavigate("/data/records")).toBe(false);
    });
    expect(host.textContent).not.toContain(content[0]!.title);
    expect(host.textContent).toContain("Session ended");
    expect(host.querySelector('a[href="/"]')?.textContent).toBe(
      "Sign in again",
    );
    history.replaceState(null, "", "/data/health");
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(host.textContent).not.toContain("Health");
    expect(host.textContent).not.toContain(content[0]!.title);
  },
);

it("pagehide and BFCache withdraw Data records and block reopening", async () => {
  history.replaceState(null, "", "/data/records?kind=note&q=private");
  await act(async () =>
    root.render(
      <PrivateShell
        initialPath="/data/records?kind=note"
        dataEnabled
        dataFixture={fixture}
        enabled={false}
      />,
    ),
  );
  const table = host.querySelector("table");
  expect(table).not.toBeNull();
  const privateText = table!.querySelector("tbody a")!.textContent;
  expect(privateText).toBeTruthy();
  await act(async () =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  expect(host.querySelector("table")).toBeNull();
  expect(host.textContent).not.toContain(privateText);
  expect(
    host.querySelector('a[href="/data/records?kind=note"]')?.textContent,
  ).toBe("Sign in again");
  await act(async () =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  expect(routes.clientNavigate("/data/records")).toBe(false);
  expect(host.querySelector("table")).toBeNull();
});

it("an already locked shell never mounts server-loaded private children or routes", async () => {
  auth.lockProtectedSession("expired");
  await act(async () =>
    root.render(
      <PrivateShell
        initialPath="/"
        content={content}
        dataEnabled={false}
        enabled={false}
      />,
    ),
  );
  expect(host.textContent).not.toContain(content[0]!.title);
  expect(host.textContent).toContain("Session ended");
  expect(routes.clientNavigate("/data/records")).toBe(false);
});
