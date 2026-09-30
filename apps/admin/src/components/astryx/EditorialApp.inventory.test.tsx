// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
let EditorialApp: typeof import("./EditorialApp").EditorialApp;
import {
  dispatchEditorialRecordSaved,
  RECORD_SAVED_EVENT,
} from "../../lib/editorial-inventory-events";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.resetModules();
  ({ EditorialApp } = await import("./EditorialApp"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("refreshes mounted library only from newer acknowledged metadata", () => {
  act(() =>
    root.render(
      <EditorialApp
        title="Content"
        area="content"
        selectedGroup="writing"
        localPreview
        siteUrl="https://anipotts.com"
        groups={[
          {
            name: "writing",
            href: "/content?group=writing",
            records: [
              {
                title: "Original",
                summary: "Before",
                href: "/content/writing/post",
                status: "published",
                privateRevision: 3,
              },
            ],
          },
        ]}
      />,
    ),
  );
  const event = {
    record: { kind: "writing" as const, id: "post" },
    title: "Saved title",
    summary: "Saved summary",
    revision: 4,
    updatedAt: "2026-09-12T01:00:00Z",
    changesPending: true,
  };
  act(() => {
    dispatchEditorialRecordSaved(event);
  });
  expect(host.querySelector(".workspace-row-link")?.textContent).toContain(
    "Saved title",
  );
  expect(host.textContent).toContain("Saved summary");
  expect(host.textContent).toContain("Published");
  act(() => {
    dispatchEditorialRecordSaved({ ...event, title: "Older", revision: 3 });
    window.dispatchEvent(
      new CustomEvent(RECORD_SAVED_EVENT, { detail: { source: "secret" } }),
    );
  });
  expect(host.querySelector(".workspace-row-link")?.textContent).toContain(
    "Saved title",
  );
});

it("follows a save and a create made in another open tab", async () => {
  class MemoryChannel {
    static open = new Set<MemoryChannel>();
    private listeners = new Set<(event: MessageEvent) => void>();
    constructor(readonly name: string) {
      MemoryChannel.open.add(this);
    }
    postMessage(data: unknown) {
      for (const peer of MemoryChannel.open)
        if (peer !== this && peer.name === this.name)
          for (const listener of peer.listeners)
            listener(
              new MessageEvent("message", { data: structuredClone(data) }),
            );
    }
    addEventListener(_: string, listener: (event: MessageEvent) => void) {
      this.listeners.add(listener);
    }
    removeEventListener(_: string, listener: (event: MessageEvent) => void) {
      this.listeners.delete(listener);
    }
    close() {
      MemoryChannel.open.delete(this);
    }
  }
  vi.stubGlobal("BroadcastChannel", MemoryChannel);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  vi.stubGlobal("scrollTo", () => {});
  const post = {
    title: "Original",
    summary: "Before",
    href: "/content/writing/post",
    status: "published",
    collection: "writing",
    id: "post",
    privateRevision: 3,
  };
  const search = {
    id: "content:writing:post",
    label: "Original",
    domain: "content" as const,
    kind: "writing",
    currentFact: "published",
    source: "content inventory",
    freshness: "current",
    href: post.href,
    keywords: ["post"],
  };
  await act(async () =>
    root.render(
      <EditorialApp
        title="Content"
        area="content"
        selectedGroup="writing"
        localPreview
        siteUrl="https://anipotts.com"
        selectedGroup="writing"
        searchEntries={[search]}
        groups={[
          { name: "pages", href: "/content?group=pages", records: [post] },
          { name: "writing", href: "/content?group=writing", records: [post] },
        ]}
      />,
    ),
  );
  const { startEditorialInventoryRelay } =
    await import("../../lib/editorial-inventory-relay");
  const { RECORD_CREATED_EVENT } =
    await import("../../lib/editorial-inventory-events");
  // The other tab: its own window-like target on the same channel name.
  const otherTab = new EventTarget() as Window;
  const stopOther = startEditorialInventoryRelay(otherTab);
  const writingCount = () =>
    [...host.querySelectorAll(".editorial-nav-count")]
      .map((node) => node.getAttribute("aria-label"))
      .join(" ");
  expect(writingCount()).toContain("1 record");
  await act(async () => {
    otherTab.dispatchEvent(
      new CustomEvent(RECORD_SAVED_EVENT, {
        detail: {
          record: { kind: "writing", id: "post" },
          title: "Saved in the other tab",
          summary: "After",
          revision: 4,
          updatedAt: "2026-09-12T01:00:00Z",
          changesPending: true,
        },
      }),
    );
  });
  expect(host.textContent).toContain("Saved in the other tab");
  await act(async () => {
    otherTab.dispatchEvent(
      new CustomEvent(RECORD_CREATED_EVENT, {
        detail: {
          record: { kind: "writing", id: "made-elsewhere" },
          title: "Made in the other tab",
          summary: "",
          revision: 1,
          updatedAt: "2026-09-12T02:00:00Z",
        },
      }),
    );
  });
  expect(host.textContent).toContain("Made in the other tab");
  expect(writingCount()).toContain("2 records");
  await act(async () =>
    document.dispatchEvent(new CustomEvent("admin:search")),
  );
  const input = document.querySelector<HTMLInputElement>("dialog input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Made in the other");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector("dialog")?.textContent).toContain(
        "Made in the other tab",
      ),
    );
  });
  stopOther();
});

it("moves between libraries in place and back again with history", () => {
  window.history.replaceState(null, "", "/content/pages");
  const push = vi.spyOn(window.history, "pushState");
  const record = (title: string, href: string) => ({
    title,
    href,
    status: "published",
  });
  act(() =>
    root.render(
      <EditorialApp
        title="Pages"
        area="content"
        selectedGroup="writing"
        localPreview
        siteUrl="https://anipotts.com"
        selectedGroup="website"
        groups={[
          {
            name: "website",
            href: "/content/pages",
            records: [record("Home", "/content/home/home")],
          },
          {
            name: "writing",
            href: "/content/writing",
            records: [record("First post", "/content/writing/first-post")],
          },
          {
            name: "newsletter",
            href: "/content/newsletter",
            records: [record("Issue one", "/newsletter/issue-one")],
          },
        ]}
      />,
    ),
  );
  const heading = () => host.querySelector("h1")?.textContent ?? "";
  const rows = () =>
    [...host.querySelectorAll(".workspace-row-link")].map(
      (link) => link.textContent,
    );
  const sidebarLink = (href: string) =>
    [...host.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
      (link) =>
        new URL(link.href).pathname === href &&
        link.closest('nav[aria-label="Admin"]'),
    );
  expect(heading()).toContain("Pages");
  expect(rows().join()).toContain("Home");

  const writing = sidebarLink("/content/writing");
  expect(writing).toBeDefined();
  act(() => {
    writing!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  expect(push).toHaveBeenCalledWith(null, "", "/content/writing");
  expect(window.location.pathname).toBe("/content/writing");
  expect(heading()).toContain("Writing");
  expect(rows().join()).toContain("First post");
  expect(rows().join()).not.toContain("Home");
  expect(document.title).toBe("Writing | Admin");
  expect(host.querySelector('a[aria-label="New article"]')).not.toBeNull();

  act(() => {
    sidebarLink("/content/newsletter")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  expect(heading()).toContain("Newsletter");
  expect(rows().join()).toContain("Issue one");
  expect(host.querySelector('a[aria-label="New article"]')).toBeNull();

  act(() => {
    window.history.replaceState(null, "", "/content/pages");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(heading()).toContain("Pages");
  expect(rows().join()).toContain("Home");
  push.mockRestore();
});

it.each(["logout", "bfcache"])(
  "clears private library and open palette after %s, stopping late inventory and routes",
  async (reason) => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    vi.stubGlobal("scrollTo", () => {});
    const title = "Synthetic private draft title";
    await act(async () =>
      root.render(
        <EditorialApp
          title="Writing"
          area="content"
          localPreview
          siteUrl="https://anipotts.com"
          selectedGroup="writing"
          groups={[
            {
              name: "writing",
              href: "/content/writing",
              records: [
                {
                  title,
                  summary: "Private summary",
                  href: "/content/writing/private",
                  status: "draft",
                  privateRevision: 1,
                },
              ],
            },
          ]}
          searchEntries={[
            {
              id: "content:writing:private",
              label: title,
              domain: "content",
              kind: "writing",
              currentFact: "draft",
              source: "content inventory",
              freshness: "current",
              href: "/content/writing/private",
              keywords: ["private"],
            },
          ]}
        />,
      ),
    );
    expect(host.textContent).toContain(title);
    await act(async () =>
      document.dispatchEvent(new CustomEvent("admin:search")),
    );
    const input = document.querySelector("dialog input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "Synthetic private");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector("dialog")?.textContent).toContain(title),
      );
    });
    const { recoveryLogoutGenerationKey } =
      await import("../../lib/browser-recovery");
    await act(async () => {
      window.dispatchEvent(
        reason === "logout"
          ? new StorageEvent("storage", { key: recoveryLogoutGenerationKey })
          : new Event("pagehide"),
      );
    });
    expect(host.textContent).not.toContain(title);
    expect(host.textContent).not.toContain("Private summary");
    expect(document.querySelector("dialog")).toBeNull();
    expect(host.textContent).toContain("Session ended");
    const { clientNavigate } = await import("../../lib/client-routes");
    expect(clientNavigate("/content/pages")).toBe(false);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(RECORD_SAVED_EVENT, {
          detail: {
            record: { kind: "writing", id: "private" },
            title: "Late private metadata",
            summary: "",
            revision: 2,
            updatedAt: "2026-09-28T00:00:00Z",
          },
        }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    expect(host.textContent).not.toContain("Late private metadata");
    expect(host.textContent).toContain("Session ended");
  },
);

it("keeps Writing's SDK boundary inside main, away from the shared navigation", () => {
  const html = renderToStaticMarkup(
    <EditorialApp
      title="Writing"
      area="content"
      selectedGroup="writing"
      localPreview
      siteUrl="https://anipotts.com"
      groups={[
        {
          name: "writing",
          href: "/content/writing",
          records: [
            {
              title: "Synthetic",
              status: "draft",
              href: "/content/writing/synthetic",
            },
          ],
        },
      ]}
    />,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  const boundary = host.querySelector('[data-admin-ui="openai"]');
  const main = host.querySelector("#astryx-app-shell-main");
  const nav = host.querySelector("nav");
  expect(boundary).not.toBeNull();
  expect(main?.contains(boundary)).toBe(true);
  expect(boundary?.contains(nav)).toBe(false);
  expect(nav?.closest('[data-admin-ui="openai"]')).toBeNull();
});
