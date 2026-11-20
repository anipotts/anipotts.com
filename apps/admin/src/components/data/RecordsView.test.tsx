// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DataResult } from "../../data/personal-context";
import type { DataReader } from "../../lib/data-read-session";
import { RecordsExplorer } from "./RecordsView";

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("main");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function ready(
  items: unknown[],
  next_offset: number | null,
  source?: string,
): DataResult {
  return {
    state: "ready",
    scope: "owner",
    observedAt: "2026-11-19",
    data: { items, next_offset, total: 7, ...(source ? { source } : {}) },
  };
}

const legacyFilter = {
  state: "invalid",
  message: "The source rejected this read request.",
  unsupported: "source-filter",
} as const;

function record(id: number, source_id = "contacts") {
  return {
    record_id: `rec-${id.toString(16).padStart(32, "0")}`,
    kind: "person",
    title: `Fixture person ${id}`,
    source_id,
    status: "current",
    tier: "open",
  };
}

async function show(reader: DataReader, source = "contacts") {
  await act(async () =>
    root.render(
      <RecordsExplorer
        route={{ view: "records", kind: "all", id: null, source }}
        reader={reader}
        navigate={vi.fn()}
        split={false}
      />,
    ),
  );
}
function action(label: string) {
  return [...host.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.trim() === label ||
      button.getAttribute("aria-label") === label,
  );
}

it("makes the first source match after the scan budget reachable", async () => {
  const offsets: number[] = [];
  const reader: DataReader = async (request) => {
    if (request.method !== "search") return ready([], null);
    if (request.source !== undefined) return legacyFilter;
    const offset = request.offset ?? 0;
    offsets.push(offset);
    return offset < 5
      ? ready([record(offset, "other")], offset + 1)
      : ready([record(6)], null);
  };
  await show(reader);
  expect(offsets).toEqual([0, 1, 2, 3, 4]);
  expect(host.textContent).toContain("More records to search");
  expect(host.textContent).not.toContain("No matching records");
  await act(async () => action("Load more")!.click());
  expect(offsets).toEqual([0, 1, 2, 3, 4, 5]);
  expect(host.textContent).toContain("Fixture person 6");
  expect(action("Load more")).toBeUndefined();
});

it("retries the failed continuation and keeps matching rows already read", async () => {
  const offsets: number[] = [];
  let interrupted = true;
  const reader: DataReader = async (request) => {
    if (request.method !== "search") return ready([], null);
    if (request.source !== undefined) return legacyFilter;
    const offset = request.offset ?? 0;
    offsets.push(offset);
    if (offset === 0) return ready([record(0)], 1);
    if (interrupted) {
      interrupted = false;
      return { state: "unavailable", message: "" };
    }
    return ready([record(0), record(1)], null);
  };
  await show(reader);
  expect(host.textContent).toContain("Fixture person 0");
  expect(host.textContent).toContain("More records unreadable");
  await act(async () => action("Retry more records")!.click());
  expect(offsets).toEqual([0, 1, 1]);
  expect(host.textContent?.match(/Fixture person 0/gu)).toHaveLength(1);
  expect(host.textContent).toContain("Fixture person 1");
});

it("discards an old continuation when the source changes", async () => {
  let resolveOld: (result: DataResult) => void = () => {};
  let searchCount = 0;
  const reader: DataReader = async (request) => {
    if (request.method !== "search") return ready([], null);
    searchCount++;
    if (searchCount === 1)
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    return ready([record(2, "different")], null, "different");
  };
  await show(reader);
  await show(reader, "different");
  await act(async () => resolveOld(ready([record(1)], 1, "contacts")));
  expect(searchCount).toBe(2);
  expect(host.textContent).toContain("Fixture person 2");
  expect(host.textContent).not.toContain("Fixture person 1");
});

it("uses the server's exact source and offset with a compatible reader", async () => {
  const requests: Array<{ source?: string; offset?: number }> = [];
  const reader: DataReader = async (request) => {
    if (request.method !== "search") return ready([], null);
    requests.push({ source: request.source, offset: request.offset });
    return request.offset === 0
      ? ready([record(1)], 1, "contacts")
      : ready([record(2)], null, "contacts");
  };
  await show(reader);
  expect(requests).toEqual([{ source: "contacts", offset: 0 }]);
  await act(async () => action("Load more")!.click());
  expect(requests).toEqual([
    { source: "contacts", offset: 0 },
    { source: "contacts", offset: 1 },
  ]);
  expect(host.textContent).toContain("Fixture person 2");
});
