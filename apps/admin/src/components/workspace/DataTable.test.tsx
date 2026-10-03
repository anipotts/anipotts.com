// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable, type Column } from "./Workspace";
import { groupTableRows, tableCountText } from "./OpenAIDataTable";
import { tableReflowWidth } from "./table-layout";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
type RecordRow = { id: string; title: string; group: string };
const rows = [
  { id: "a", title: "First", group: "live" },
  { id: "b", title: "Second", group: "idle" },
  { id: "c", title: "Third", group: "live" },
];
const columns: Column<RecordRow>[] = [
  {
    key: "title",
    header: "Title",
    sortable: true,
    room: 300,
    render: (row) => <a href={`/${row.id}`}>{row.title}</a>,
  },
  {
    key: "status",
    header: "Status",
    width: 160,
    hideBelow: "wide",
    priority: 1,
    render: (row) => row.group,
  },
  {
    key: "action",
    header: "Actions",
    width: 100,
    render: () => <button type="button">Inspect</button>,
  },
];
const props = {
  rows,
  columns,
  rowKey: "id" as const,
  label: "Synthetic records",
  tableId: "synthetic-records",
  noun: ["record", "records"] as [string, string],
};
let host: HTMLDivElement, root: Root;
let resize: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  resize = undefined;
});
const draw = (
  extra: Partial<React.ComponentProps<typeof DataTable<RecordRow>>> = {},
) => act(() => root.render(<DataTable {...props} {...extra} />));
describe("global table interactions", () => {
  it("gathers stable groups without changing member order", () => {
    expect(
      [...groupTableRows(rows, (row) => row.group, "live")].map(
        ([key, value]) => [key, value.map((row) => row.id)],
      ),
    ).toEqual([
      ["idle", ["b"]],
      ["live", ["a", "c"]],
    ]);
  });
  it("persists any group's collapse only for its table and keeps known totals explicit", () => {
    draw({
      groupBy: (row) => row.group,
      groupTotals: { live: 12 },
      totalCount: 15,
    });
    const toggle = host.querySelector<HTMLButtonElement>(
      ".admin-table-group-toggle",
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".admin-table-count")?.textContent).toBe(
      "2 / 12",
    );
    act(() => toggle.click());
    expect(host.querySelector('[data-record-id="a"]')).toBeNull();
    expect(
      JSON.parse(
        localStorage.getItem("admin:table-groups:v1:synthetic-records")!,
      ),
    ).toEqual({ live: true });
    draw({ tableId: "another-table", groupBy: (row) => row.group });
    expect(host.querySelector('[data-record-id="a"]')).not.toBeNull();
    draw({ groupBy: (row) => row.group });
    expect(host.querySelector('[data-record-id="a"]')).toBeNull();
    expect(
      document.getElementById(toggle.getAttribute("aria-controls")!),
    ).not.toBeNull();
  });
  it("uses logical aggregate counts and never persists ungrouped private record identity", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    draw({ tableId: "private-history-id" });
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
    draw({
      groupBy: (row) => row.group,
      loadedCount: 9,
      groupCounts: { live: 7, idle: 2 },
      groupTotals: { live: 8 },
      totalCount: 10,
    });
    expect(host.querySelector(".admin-table-count")?.textContent).toBe("7 / 8");
    expect(host.querySelector(".workspace-table-count")?.textContent).toBe(
      "9 loaded of 10 total",
    );
  });
  it("selects visible records without deleting another page's selection", () => {
    const change = vi.fn();
    draw({ selectedKeys: new Set(["remote"]), onSelectionChange: change });
    act(() => host.querySelector<HTMLInputElement>("thead input")!.click());
    expect(change).toHaveBeenLastCalledWith(new Set(["remote", "a", "b", "c"]));
  });
  it("delegates sorting and pagination without changing server-owned rows", () => {
    const onSortChange = vi.fn(),
      onPageChange = vi.fn();
    draw({
      sort: { key: "title", direction: "asc" },
      onSortChange,
      pagination: { page: 1, pageSize: 3, total: 10, onPageChange },
    });
    act(() => host.querySelector<HTMLButtonElement>("thead button")!.click());
    expect(onSortChange).toHaveBeenCalledWith({
      key: "title",
      direction: "desc",
    });
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>("nav button")]
        .find((button) => button.textContent === "Next")!
        .click(),
    );
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(
      [...host.querySelectorAll("[data-record-id]")].map((row) =>
        row.getAttribute("data-record-id"),
      ),
    ).toEqual(["a", "b", "c"]);
  });
  it("reflows all secondary metadata from container size, with separate link and action controls", () => {
    draw();
    const frame = host.querySelector<HTMLDivElement>(".openai-table-frame")!;
    Object.defineProperty(frame, "clientWidth", {
      configurable: true,
      value: 390,
    });
    act(() => resize?.());
    expect(
      host.querySelector(".admin-data-table")?.getAttribute("data-narrow"),
    ).toBe("true");
    expect(host.querySelectorAll('[data-record-id="a"] td')).toHaveLength(3);
    expect(
      host.querySelector(
        '[data-record-id="a"] [data-column="status"] .openai-mobile-label',
      )?.textContent,
    ).toBe("Status");
    expect(
      host.querySelector('[data-record-id="a"] a')?.getAttribute("href"),
    ).toBe("/a");
    expect(host.querySelector('[data-record-id="a"] button')?.textContent).toBe(
      "Inspect",
    );
    draw({ responsive: "scroll" });
    expect(
      host.querySelector(".admin-table-scroll")?.getAttribute("tabindex"),
    ).toBe("0");
    expect(tableReflowWidth(columns)).toBeGreaterThanOrEqual(560);
  });
  it("distinguishes states and counts without inventing an inventory total", () => {
    expect(tableCountText(20)).toBe("20 loaded");
    expect(tableCountText(7, 7)).toBe("7 records");
    expect(tableCountText(0, 7, 0)).toBe("0 matching of 7");
    expect(tableCountText(3, 7, 3)).toBe("3 matching of 7");
    expect(tableCountText(20, 150, 41)).toBe("20 loaded, 41 matching of 150");
    draw({ rows: [], searchActive: true });
    expect(host.textContent).toContain("No matching records");
    draw({ rows: [], loading: true });
    expect(host.querySelector("table")?.getAttribute("aria-busy")).toBe("true");
    const retry = vi.fn();
    draw({ rows: [], error: "Reader unavailable", onRetry: retry });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Reader unavailable",
    );
    act(() =>
      host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(),
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
