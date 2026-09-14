// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeExplorer, LifeReadView } from "./LifeWorkspace";
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
function type(value: string) {
  act(() => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
const count = () =>
  container.querySelector('.life-record-library [role="status"]')?.textContent;
describe("Life reader interactions", () => {
  it.each([30, -1, undefined])(
    "keeps Sources unpaged when response includes cursor %s",
    async (next_offset) => {
      const data = {
        items: [{ source_id: "Fixture source", coverage: "available" }],
        total: 1,
        next_offset,
      };
      const reader = vi.fn(async (_request: LifeRead) => ready(data));
      await act(async () =>
        root.render(
          <LifeExplorer
            section="sources"
            initial={ready(data)}
            reader={reader}
          />,
        ),
      );
      expect(container.textContent).toContain("Fixture source");
      expect(container.textContent).not.toContain("could not be continued");
      expect(
        [...container.querySelectorAll("button")].some((button) =>
          /^(Next|Previous)$/.test(button.textContent?.trim() ?? ""),
        ),
      ).toBe(false);
      expect(reader).not.toHaveBeenCalled();
      await click("Refresh");
      expect(reader).toHaveBeenCalledTimes(1);
      expect(reader.mock.calls[0]?.[0]).toEqual({ method: "sources" });
      expect(container.textContent).toContain("Fixture source");
    },
  );
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
  it("retries an invalid continuation with the submitted query, not the typed text", async () => {
    const requests: LifeRead[] = [];
    const reader = async (request: LifeRead) => {
      requests.push(request);
      return ready({
        items: [record],
        total: 18,
        next_offset: requests.length === 1 ? -1 : null,
      });
    };
    await act(async () =>
      root.render(
        <LifeExplorer
          section="people"
          initial={ready({ items: [record], total: 1, next_offset: null })}
          reader={reader}
        />,
      ),
    );
    type("alice");
    await submit();
    expect(container.textContent).toContain("could not be continued");
    // Typing without submitting changes the field, not the read on screen.
    type("bob");
    await click("Try again");
    expect(requests).toEqual([
      { method: "search", kind: "person", q: "alice", offset: 0 },
      { method: "search", kind: "person", q: "alice", offset: 0 },
    ]);
    expect(container.textContent).not.toContain("could not be continued");
  });
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
  it("marks retained rows as not current after a failed read until a later result", async () => {
    const outcomes: LifeResult[] = [
      { state: "unavailable", message: "fixture" },
      { state: "invalid", message: "fixture" },
      ready({
        items: [record, { ...record, record_id: "rec-two", title: "Second" }],
        total: 2,
        next_offset: null,
      }),
      { state: "unavailable", message: "fixture" },
      { state: "disconnected", message: "fixture" },
    ];
    const reader = vi.fn(async (_request: LifeRead) => outcomes.shift()!);
    await act(async () =>
      root.render(
        <LifeExplorer
          section="people"
          initial={ready({ items: [record], total: 1, next_offset: null })}
          reader={reader}
        />,
      ),
    );
    expect(count()).toBe("1 record shown of 1");
    expect(container.textContent).not.toContain("Not current");
    await submit();
    expect(container.textContent).toContain("Fixture record");
    expect(container.textContent).toContain("could not be refreshed");
    // The polite count stops presenting the retained figure as current.
    expect(count()).toBe("1 record shown of 1 from the last successful read");
    expect(container.textContent).toContain("Not current");
    await submit();
    expect(count()).toBe("1 record shown of 1 from the last successful read");
    await submit();
    expect(count()).toBe("2 records shown of 2");
    expect(container.textContent).not.toContain("Not current");
    expect(container.textContent).not.toContain("could not be refreshed");
    await submit();
    expect(container.textContent).toContain("Not current");
    await submit();
    expect(container.textContent).toContain("Life is not connected yet");
    expect(container.textContent).not.toContain("Not current");
    expect(count()).toBeUndefined();
  });
  it.each(["unavailable", "invalid"] as const)(
    "marks retained rows as not current when the first failed refresh is %s",
    async (state) => {
      const reader = vi.fn(async (_request: LifeRead): Promise<LifeResult> => ({
        state,
        message: "fixture",
      }));
      await act(async () =>
        root.render(
          <LifeExplorer
            section="people"
            initial={ready({ items: [record], total: 1, next_offset: null })}
            reader={reader}
          />,
        ),
      );
      await submit();
      expect(reader).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Fixture record");
      expect(container.textContent).toContain("could not be refreshed");
      expect(count()).toBe("1 record shown of 1 from the last successful read");
      expect(container.textContent).toContain("Not current");
    },
  );
  it("names the stale state once, through the visible status text", async () => {
    await act(async () =>
      root.render(
        <LifeReadView
          section="people"
          result={ready({ items: [record], total: 1, next_offset: null })}
          isStale
        />,
      ),
    );
    const library = container.querySelector(".life-record-library")!;
    expect(library.textContent).toContain("Not current");
    // The warning StatusDot is role=img named "Not current"; beside the Token
    // label it would be read twice unless hidden from assistive technology.
    const dot = library.querySelector('[role="img"][aria-label="Not current"]');
    expect(dot, "Not current StatusDot").not.toBeNull();
    expect(
      [...library.querySelectorAll('[role="img"][aria-label]')]
        .filter((node) => node.getAttribute("aria-hidden") !== "true")
        .map((node) => node.getAttribute("aria-label")),
    ).toEqual([]);
  });
  it("retries the read that failed, not the typed query or the first page", async () => {
    const requests: LifeRead[] = [];
    const reader = async (request: LifeRead): Promise<LifeResult> => {
      requests.push(request);
      return requests.length < 4
        ? { state: "unavailable", message: "fixture" }
        : ready({ items: [record], total: 18, next_offset: null });
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
    type("alice");
    await submit();
    type("bob");
    await click("Try again");
    expect(requests).toEqual([
      { method: "search", kind: "person", q: "alice", offset: 0 },
      { method: "search", kind: "person", q: "alice", offset: 0 },
    ]);
    // A failed search never becomes the submitted query, so paging continues
    // from the last successful read, and its retry keeps the requested page.
    await click("Next");
    await click("Try again");
    expect(requests.slice(2)).toEqual([
      { method: "search", kind: "person", q: "", offset: 17 },
      { method: "search", kind: "person", q: "", offset: 17 },
    ]);
    expect(container.textContent).not.toContain("could not be refreshed");
    expect(container.textContent).toContain("Previous");
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
    expect(container.textContent).toContain("1 record · 2026-01-01T00:00:00Z");
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
