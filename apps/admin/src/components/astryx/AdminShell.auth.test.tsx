// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminSearchResult } from "../../data/admin-search";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let auth: typeof import("../../lib/protected-admin-json");
let AdminShell: (typeof import("./AdminShell"))["AdminShell"];
let root: Root;
let host: HTMLDivElement;
const searchEntries: AdminSearchResult[] = [
  {
    id: "content:private",
    label: "Synthetic private palette sentinel",
    domain: "content",
    kind: "writing",
    currentFact: "draft",
    source: "content inventory",
    freshness: "current",
    href: "/content/writing/private",
    keywords: ["private"],
  },
];
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  auth = await import("../../lib/protected-admin-json");
  ({ AdminShell } = await import("./AdminShell"));
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
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
const mount = async (path: string) => {
  history.replaceState(null, "", path);
  await act(async () =>
    root.render(
      <AdminShell
        currentRoute={path}
        searchEntries={searchEntries}
        localPreview
      >
        <div>Synthetic private child sentinel</div>
      </AdminShell>,
    ),
  );
};
it.each(["logout", "bfcache", "expired"])(
  "withdraws actual open palette and private children after %s",
  async (reason) => {
    await mount("/observability/status?entry=private&q=private&sort=name");
    expect(host.textContent).toContain("Synthetic private child sentinel");
    await act(async () =>
      document.dispatchEvent(new CustomEvent("admin:search")),
    );
    const input = document.querySelector<HTMLInputElement>("dialog input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "Synthetic private palette");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector("dialog")?.textContent).toContain(
          searchEntries[0]!.label,
        ),
      );
    });
    const remove = vi.spyOn(window, "removeEventListener");
    await act(async () => {
      if (reason === "logout") {
        const { recoveryLogoutGenerationKey } =
          await import("../../lib/browser-recovery");
        window.dispatchEvent(
          new StorageEvent("storage", { key: recoveryLogoutGenerationKey }),
        );
      } else if (reason === "bfcache")
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        );
      else auth.lockProtectedSession("expired");
      expect(
        remove.mock.calls.some(
          ([event]) => event === "admin:workspace-navigation",
        ),
      ).toBe(true);
    });
    remove.mockRestore();
    expect(host.textContent).toContain("Session ended");
    expect(host.textContent).not.toContain("Synthetic private child sentinel");
    expect(host.textContent).not.toContain(searchEntries[0]!.label);
    expect(document.querySelector("dialog")).toBeNull();
    expect(
      host.querySelector('a[href="/observability/status?sort=name"]')
        ?.textContent,
    ).toBe("Sign in again");
    history.replaceState(null, "", "/data/records?kind=note&q=private");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.dispatchEvent(new CustomEvent("admin:workspace-navigation"));
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      document.dispatchEvent(new CustomEvent("admin:search"));
    });
    expect(document.querySelector("dialog")).toBeNull();
    expect(host.textContent).not.toContain("Synthetic private child sentinel");
  },
);
it("initially locked overview never exposes supplied search records or children", async () => {
  auth.lockProtectedSession("expired");
  await mount("/?q=private");
  expect(host.querySelector('a[href="/"]')?.textContent).toBe("Sign in again");
  expect(host.textContent).not.toContain(searchEntries[0]!.label);
  expect(host.textContent).not.toContain("Synthetic private child sentinel");
  expect(document.querySelector("dialog")).toBeNull();
});
