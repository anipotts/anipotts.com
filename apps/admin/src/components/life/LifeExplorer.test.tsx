// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeExplorer } from "./LifeWorkspace";
import { LifeActivityView } from "./LifeActivityView";
import type { LifeRead, LifeResult } from "../../data/personal-context";
const ready = (data: Record<string, unknown>): LifeResult => ({
  state: "ready",
  scope: "agent",
  observedAt: "2026-01-01",
  data,
});
const record = {
  record_id: "rec-fixture",
  revision_id: "rev-one",
  title: "Fixture record",
  body: "First",
  body_offset: 0,
  next_body_offset: 5,
  source_id: "fixture",
  status: "provisional",
};
let root: Root;
let container: HTMLElement;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
    media: "",
    onchange: null,
  });
  container = document.createElement("main");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.trim().startsWith(label) ||
      button.getAttribute("aria-label") === label ||
      button
        .getAttribute("aria-labelledby")
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent)
        .join(" ")
        .trim() === label,
  );
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => button!.click());
}
describe("Life reader interactions", () => {
  it.each([-1, 1.5, 10_000_001])(
    "recovers from invalid continuation %s without dispatching it",
    async (next_offset) => {
      const requests: LifeRead[] = [];
      const reader = async (request: LifeRead) => {
        requests.push(request);
        return ready({ items: [record], total: 1, next_offset: null });
      };
      await act(async () =>
        root.render(
          <LifeExplorer
            section="people"
            initial={ready({ items: [record], total: 1, next_offset })}
            reader={reader}
          />,
        ),
      );
      expect(container.textContent).toContain("could not be continued");
      expect(container.textContent).toContain("Fixture record");
      expect(requests).toHaveLength(0);
      await click("Try again");
      expect(requests).toEqual([
        { method: "search", kind: "person", q: "", offset: 0 },
      ]);
    },
  );
  it("keeps rows while refreshing, deduplicates submission and recovers from failure", async () => {
    let finish!: (value: LifeResult) => void;
    const reader = vi.fn(
      () =>
        new Promise<LifeResult>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      root.render(
        <LifeExplorer
          section="people"
          initial={ready({ items: [record], total: 1, next_offset: null })}
          reader={reader}
        />,
      ),
    );
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Fixture record");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () =>
      finish({
        state: "unavailable",
        message: "private exception must not render",
      }),
    );
    expect(container.textContent).toContain("Fixture record");
    expect(container.textContent).toContain("could not be refreshed");
    expect(container.textContent).not.toContain("private exception");
  });
  it("uses source pagination cursors and reads a selected revision contiguously", async () => {
    const requests: LifeRead[] = [];
    const reader = async (request: LifeRead) => {
      requests.push(request);
      if (request.method === "get")
        return ready(
          request.body_offset
            ? {
                ...record,
                body: " second",
                body_offset: 5,
                next_body_offset: null,
              }
            : record,
        );
      return ready({ items: [record], total: 18, next_offset: null });
    };
    await act(async () =>
      root.render(
        <LifeExplorer
          section="people"
          initial={ready({ items: [record], total: 18, next_offset: 17 })}
          reader={reader}
        />,
      ),
    );
    await click("Next");
    expect(requests[0]).toEqual({
      method: "search",
      kind: "person",
      q: "",
      offset: 17,
    });
    await click("Fixture record");
    await click("Read more");
    expect(requests.at(-1)).toEqual({
      method: "get",
      id: "rec-fixture",
      body_offset: 5,
    });
    expect(container.textContent).toContain("First second");
  });
  it("does not reopen a record when a closed request finishes", async () => {
    let finish!: (result: LifeResult) => void;
    const reader = () =>
      new Promise<LifeResult>((resolve) => {
        finish = resolve;
      });
    await act(async () =>
      root.render(
        <LifeExplorer
          section="people"
          initial={ready({ items: [record], total: 1, next_offset: null })}
          reader={reader}
        />,
      ),
    );
    await click("Fixture record");
    await click("Close details");
    await act(async () => finish(ready(record)));
    expect(container.querySelector('[aria-label="Record details"]')).toBeNull();
  });
  it("reconnects activity from the retained cursor and stops polling on unmount", async () => {
    vi.useFakeTimers();
    const requests: LifeRead[] = [];
    const reader = async (request: LifeRead): Promise<LifeResult> => {
      requests.push(request);
      if (requests.length === 2)
        return { state: "unavailable", message: "fixture" };
      return ready({
        items:
          requests.length === 1
            ? [
                {
                  change_id: 8,
                  trace_id: "1".repeat(32),
                  stage: "indexed",
                  state: "succeeded",
                  record_count: 1,
                  observed_at: "2026-01-01T00:00:00Z",
                },
              ]
            : [],
        next_cursor: 8,
      });
    };
    await act(async () => root.render(<LifeActivityView reader={reader} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(container.textContent).toContain("unavailable");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(requests.at(-1)).toEqual({ method: "activity", after: 8 });
    await act(async () => root.unmount());
    const count = requests.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(requests).toHaveLength(count);
  });
});
