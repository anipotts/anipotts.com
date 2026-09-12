// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityWorkspace } from "./ObservabilityWorkspace";
import { createUnconfiguredSnapshot } from "../../lib/observability-model";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("optional observability workspace", () => {
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
    }));
    vi.stubGlobal("fetch", vi.fn());
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  it("shows unknown coverage and makes no background read before configuration", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    expect(host.textContent).toContain("Live telemetry is not connected");
    expect(host.textContent).toContain("Mac mini");
    expect(host.textContent).not.toContain("healthy");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("changes evidence views without fetching or imposing workflow", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    const traces = host.querySelector<HTMLButtonElement>(
      '[data-tab-value="activity"]',
    )!;
    act(() => traces.click());
    expect(host.textContent).toContain("Evidence unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps failed reconnect visible without crashing the view", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private provider failure"));
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Reconnect")!
        .click(),
    );
    expect(host.textContent).toContain("Telemetry connection lost");
    expect(host.textContent).not.toContain("private provider failure");
  });
  it("uses row coverage and linked selected tabs with arrow-key focus", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    const coverage = host.querySelector<HTMLButtonElement>(
      '[data-tab-value][aria-current="page"]',
    )!;
    expect(coverage.getAttribute("data-tab-value")).toBe("machines");
    act(() => {
      coverage.focus();
      coverage.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(document.activeElement?.getAttribute("data-tab-value")).toBe(
      "loops",
    );
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(
      host
        .querySelector('[data-tab-value][aria-current="page"]')
        ?.getAttribute("data-tab-value"),
    ).toBe("loops");
    expect(
      host.querySelector('[role="region"]')?.getAttribute("aria-label"),
    ).toBe("Loops");
  });
  it("disables reconnect and deduplicates rapid clicks until the request settles", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    const reconnect = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Reconnect",
    )!;
    act(() => {
      reconnect.click();
      reconnect.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reconnect.disabled).toBe(true);
    act(() => reconnect.click());
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("unavailable")));
    expect(reconnect.disabled).toBe(false);
  });
  it("distinguishes filtered coverage from unavailable evidence and clears search", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    const input = host.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "no-such-service");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("No matching results");
    act(() =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Clear search")!
        .click(),
    );
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  });
  it("keeps loops unknown and diagnostics behind More", async () => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace
          initial={{
            status: "unconfigured",
            snapshot: createUnconfiguredSnapshot(),
          }}
        />,
      ),
    );
    expect(host.querySelectorAll("[data-tab-value]")).toHaveLength(3);
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-tab-value="loops"]')!
        .click(),
    );
    expect(host.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(host.textContent).toContain("Not observed");
    expect(host.textContent).not.toContain("Running");
    expect(host.textContent).toContain("More");
  });
});
