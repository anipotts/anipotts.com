// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { EditorialApp } from "./EditorialApp";
import {
  dispatchEditorialRecordSaved,
  RECORD_SAVED_EVENT,
} from "../../lib/editorial-inventory-events";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
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
