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
  expect(host.querySelector(".record-link")?.textContent).toContain(
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
  expect(host.querySelector(".record-link")?.textContent).toContain(
    "Saved title",
  );
});
