// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../fixtures/data_v1.synthetic.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let auth: typeof import("../../lib/protected-admin-json");
let routes: typeof import("../../lib/client-routes");
let PrivateShell: (typeof import("./PrivateShell"))["PrivateShell"];
let host: HTMLDivElement;
let root: Root;
const content = [
  {
    title: "Synthetic unpublished private sentinel",
    href: "/content/writing/synthetic-private",
    collection: "writing",
    status: "draft",
  },
];
beforeEach(async () => {
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
  auth = await import("../../lib/protected-admin-json");
  routes = await import("../../lib/client-routes");
  ({ PrivateShell } = await import("./PrivateShell"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
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
