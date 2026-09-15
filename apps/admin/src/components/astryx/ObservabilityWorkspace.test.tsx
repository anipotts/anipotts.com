// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityWorkspace } from "./ObservabilityWorkspace";
import { createUnconfiguredSnapshot } from "../../lib/observability-model";
import type { ObservabilityReadResult } from "../../lib/observability-reader";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const unconfigured = (): ObservabilityReadResult => ({
  status: "unconfigured",
  snapshot: createUnconfiguredSnapshot(),
});
const connected = (): ObservabilityReadResult => {
  const snapshot = createUnconfiguredSnapshot();
  snapshot.source = "live";
  Object.assign(snapshot.services[0]!, {
    instrumentation: "checkpoint",
    connection: "connected",
    outcome: "success",
    lastObservedAt: new Date().toISOString(),
  });
  return { status: "connected", snapshot };
};
const response = (result = connected()) => new Response(JSON.stringify(result));

describe("optional observability workspace", () => {
  let host: HTMLDivElement;
  let root: Root;
  let hidden: boolean;
  let visibilityDescriptor: PropertyDescriptor | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    hidden = false;
    visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
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
    history.replaceState(null, "", "/operations/observability");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (visibilityDescriptor)
      Object.defineProperty(document, "hidden", visibilityDescriptor);
    else Reflect.deleteProperty(document, "hidden");
  });
  const mount = async (initial = unconfigured(), initialView = "machines") => {
    await act(async () =>
      root.render(
        <ObservabilityWorkspace initial={initial} initialView={initialView} />,
      ),
    );
  };
  const button = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) =>
        item.textContent === name || item.getAttribute("aria-label") === name,
    )!;
  const click = async (name: string) => {
    await act(async () => button(name).click());
  };
  const advance = async (ms: number) => {
    await act(async () => vi.advanceTimersByTimeAsync(ms));
  };
  const visibility = async (value: boolean) => {
    hidden = value;
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
  };
  const search = (query: string) =>
    act(() => {
      const input = host.querySelector("input")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const navigate = async (view: string) => {
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) =>
          [
            "Machines",
            "Loops",
            "Activity",
            "Coverage",
            "Traces",
            "Metrics",
            "Incidents",
          ].includes(button.textContent?.trim() ?? ""),
        )!
        .click(),
    );
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ].find((node) => node.textContent === view)!;
    await act(async () => item.click());
  };

  it("shows one Overview heading and two actual rows without invented telemetry or automatic reads", async () => {
    await mount();
    expect(
      [...host.querySelectorAll("h1")].map((node) => node.textContent),
    ).toEqual(["Overview"]);
    expect(host.querySelector("h2")).toBeNull();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(
      [...host.querySelectorAll("th")].map((node) => node.textContent),
    ).toEqual(["Machine", "Observed state", "Last observation"]);
    expect(host.textContent).toContain("Live telemetry is not connected");
    expect(host.textContent).toContain("Mac mini");
    expect(host.textContent).not.toMatch(/Last contact|Running|Healthy/);
    expect(
      host.querySelectorAll("[data-service-id] svg[aria-hidden=true]"),
    ).toHaveLength(2);
    await advance(600000);
    await visibility(true);
    await visibility(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("selects a service from its real button or row, moves focus to details and returns it on close", async () => {
    await mount();
    const mini = button("Mac mini");
    act(() => mini.focus());
    await click("Mac mini");
    expect(mini.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("operations-detail-title");
    const detail = host.querySelector("#operations-service-detail")!;
    expect(detail.textContent).toContain("InstrumentationNot verified");
    expect(detail.textContent).toContain("Observed connectionUnknown");
    expect(detail.textContent).toContain("Freshness window300 seconds");
    expect(detail.textContent).not.toContain("Last contact");
    expect(location.search).toBe("");
    act(() =>
      detail.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await advance(20);
    expect(host.querySelector("#operations-service-detail")).toBeNull();
    expect(document.activeElement).toBe(mini);
    act(() =>
      host
        .querySelector<HTMLTableCellElement>("tbody tr td:last-child")!
        .click(),
    );
    expect(host.querySelector("#operations-detail-title")?.textContent).toBe(
      "Local Mac",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the selected service while filtering and gives focus back to search if its row is hidden", async () => {
    await mount();
    await click("Mac mini");
    search("no-such-service");
    expect(host.textContent).toContain("No matching results");
    expect(host.querySelector("#operations-detail-title")?.textContent).toBe(
      "Mac mini",
    );
    await click("Close details");
    await advance(20);
    expect(document.activeElement).toBe(host.querySelector("input"));
    await click("Clear search");
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(location.search).toBe("");
  });

  it("announces the filtered record count as a polite status", async () => {
    await mount();
    const count = () => host.querySelector(".operations-count")!;
    expect(count().getAttribute("role")).toBe("status");
    expect(count().getAttribute("aria-live")).toBe("polite");
    expect(count().textContent).toBe("2 records");
    search("mini");
    expect(count().textContent).toBe("1 record");
    // Clear search renders only for an empty result, so clear the field itself.
    search("");
    expect(count().textContent).toBe("2 records");
  });

  it("names each observed state once, through its visible text", async () => {
    const initial = unconfigured();
    initial.snapshot.events = [
      {
        serviceId: "mac-mini",
        at: new Date().toISOString(),
        kind: "failure",
        evidenceId: "a".repeat(32),
      },
    ];
    // A StatusDot is role=img with its own name; beside matching text it is
    // read twice unless it is hidden from assistive technology.
    const namedDots = () =>
      [...host.querySelectorAll('[role="img"][aria-label]')]
        .filter((node) => node.getAttribute("aria-hidden") !== "true")
        .map((node) => node.getAttribute("aria-label"));
    await mount(initial);
    await click("Mac mini");
    expect(host.querySelector(".operations-source-status")?.textContent).toBe(
      "Live telemetry is not connected",
    );
    expect(host.querySelector("tbody")?.textContent).toContain("Not observed");
    expect(
      host.querySelector("#operations-service-detail")?.textContent,
    ).toContain("Not observed");
    expect(namedDots()).toEqual([]);
    await navigate("Activity");
    expect(host.querySelector("tbody")?.textContent).toContain("Failure");
    expect(namedDots()).toEqual([]);
  });

  it("gives every inventory row exactly one keyboard-operable name button", async () => {
    // The row click is a pointer shortcut for this button, so rows need no
    // tab stop of their own. Relative timestamps may add focusable cells.
    await mount();
    for (const [view, length] of [
      ["Machines", 2],
      ["Coverage", 11],
    ] as const) {
      if (view !== "Machines") await navigate(view);
      const rows = [...host.querySelectorAll("tbody tr")];
      expect(rows).toHaveLength(length);
      for (const row of rows) {
        const toggles = row.querySelectorAll("button[aria-expanded]");
        expect(toggles).toHaveLength(1);
        expect(toggles[0]!.hasAttribute("data-service-id")).toBe(true);
      }
    }
  });

  it("provides all six unknown loops and diagnostic navigation without a duplicate tab bar", async () => {
    await mount(unconfigured(), "loops");
    expect(host.querySelector("h1")?.textContent).toBe("Loops");
    expect(host.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(host.querySelectorAll("[data-tab-value]")).toHaveLength(0);
    expect(host.textContent).not.toContain("Running");
    await navigate("Activity");
    expect(host.querySelector("h1")?.textContent).toBe("Activity");
    expect(host.textContent).toContain("Evidence unavailable");
    await navigate("Coverage");
    expect(host.querySelectorAll("tbody tr")).toHaveLength(11);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["activity", "traces", "metrics", "incidents"])(
    "retains the %s diagnostic deep link",
    async (view) => {
      await mount(unconfigured(), view);
      expect(host.querySelector("h1")?.textContent?.toLowerCase()).toBe(view);
      expect(
        host.querySelector("input")?.getAttribute("placeholder"),
      ).toContain("evidence ID");
      expect(host.textContent).toContain("Evidence unavailable");
    },
  );

  it("preserves unrelated URL parameters and synchronizes Back/Forward without persisting selection or searches", async () => {
    history.replaceState(
      null,
      "",
      "/operations/observability?view=loops&panel=traces",
    );
    await mount(unconfigured(), "loops");
    const navigation = vi.fn();
    window.addEventListener("admin:workspace-navigation", navigation);
    await navigate("Machines");
    expect(new URL(location.href).searchParams.get("view")).toBe("machines");
    expect(new URL(location.href).searchParams.get("panel")).toBe("traces");
    expect(navigation).toHaveBeenCalledOnce();
    await click("Mac mini");
    act(() => {
      history.replaceState(
        null,
        "",
        "/operations/observability?view=loops&panel=traces",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector("h1")?.textContent).toBe("Loops");
    expect(host.querySelector("#operations-service-detail")).toBeNull();
    act(() => {
      history.replaceState(null, "", "/operations/observability?view=invalid");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector("h1")?.textContent).toBe("Overview");
    window.removeEventListener("admin:workspace-navigation", navigation);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains observed freshness and outcome when the source read fails", async () => {
    const initial = connected();
    initial.snapshot.services[0]!.lastObservedAt = new Date(
      Date.now() - 301000,
    ).toISOString();
    vi.mocked(fetch).mockRejectedValue(new Error("private provider failure"));
    await mount(initial);
    expect(fetch).not.toHaveBeenCalled();
    await advance(60000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(host.textContent).toContain(
      "Latest read unavailable; showing last-known observations",
    );
    expect(host.textContent).toContain("Last known: Stale");
    expect(host.textContent).not.toContain("private provider failure");
    expect(host.textContent).not.toContain("Disconnected");
    await click("Local Mac");
    expect(
      host.querySelector("#operations-service-detail")?.textContent,
    ).toContain("Last outcomeSuccess");
    expect(
      host.querySelector("#operations-service-detail")?.textContent,
    ).toContain("Observed connectionConnected");
  });

  it("coalesces manual refresh and keeps a failed unconfigured read from starting a background consumer", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await mount();
    const retry = button("Retry connection");
    act(() => {
      retry.click();
      retry.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(retry.disabled).toBe(true);
    act(() => retry.click());
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("unavailable")));
    expect(retry.disabled).toBe(false);
    expect(host.textContent).toContain("Last known: Not observed");
    await advance(600000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes connected sources at sixty seconds, not every second, and manual refresh resets the deadline", async () => {
    vi.mocked(fetch).mockImplementation(async () => response());
    await mount(connected());
    // The server rendered this snapshot, so mounting repeats no read.
    expect(fetch).not.toHaveBeenCalled();
    await advance(59999);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(59000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await click("Refresh");
    expect(fetch).toHaveBeenCalledTimes(2);
    await advance(59000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await advance(1000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("pauses hidden polling, respects an unexpired deadline, and performs one overdue refresh on return", async () => {
    vi.mocked(fetch).mockImplementation(async () => response());
    await mount(connected());
    await advance(10000);
    await visibility(true);
    await advance(10000);
    await visibility(false);
    await advance(39999);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await visibility(true);
    await advance(600000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await visibility(false);
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not start a source read while initially hidden", async () => {
    hidden = true;
    vi.mocked(fetch).mockImplementation(async () => response());
    await mount(connected());
    await advance(600000);
    expect(fetch).not.toHaveBeenCalled();
    await visibility(false);
    await advance(1);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("aborts hidden requests and prevents a late response from replacing newer evidence", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await mount(connected());
    await advance(60000);
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    await visibility(true);
    expect(signal.aborted).toBe(true);
    vi.mocked(fetch).mockImplementation(async () => response());
    await visibility(false);
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Source connected");
    await act(async () => resolve(response(unconfigured())));
    expect(host.textContent).toContain("Source connected");
    expect(host.textContent).not.toContain("Live telemetry is not connected");
  });

  it("backs off failed connected reads to five minutes and resets after recovery", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("unavailable"));
    await mount(connected());
    await advance(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const [delay, count] of [
      [60000, 2],
      [120000, 3],
      [240000, 4],
      [300000, 5],
      [300000, 6],
    ]) {
      await advance(delay! - 1);
      expect(fetch).toHaveBeenCalledTimes(count! - 1);
      await advance(1);
      expect(fetch).toHaveBeenCalledTimes(count!);
    }
    vi.mocked(fetch).mockImplementation(async () => response());
    await click("Retry connection");
    expect(fetch).toHaveBeenCalledTimes(7);
    await advance(60000);
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it("keeps an automatic refresh quiet and shows loading only once the owner asks", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await mount(connected());
    await advance(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const refresh = button("Refresh");
    expect(refresh.disabled).toBe(false);
    expect(refresh.getAttribute("aria-busy")).not.toBe("true");
    // Asking during an automatic read joins it instead of starting another.
    await act(async () => refresh.click());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refresh.disabled).toBe(true);
    await act(async () => resolve(response()));
    expect(refresh.disabled).toBe(false);
  });

  it("releases an unread error body instead of holding the request open", async () => {
    const cancel = vi.fn(async () => undefined);
    vi.mocked(fetch).mockImplementation(async () => {
      const failed = new Response("unavailable", { status: 503 });
      Object.defineProperty(failed, "body", { value: { cancel } });
      return failed;
    });
    await mount(connected());
    await advance(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(host.textContent).toContain(
      "Latest read unavailable; showing last-known observations",
    );
  });

  it("stops polling when the source reports unconfigured and preserves selection across a successful refresh", async () => {
    vi.mocked(fetch).mockImplementation(async () => response());
    await mount(connected());
    await click("Local Mac");
    await advance(60000);
    expect(host.querySelector("#operations-detail-title")?.textContent).toBe(
      "Local Mac",
    );
    vi.mocked(fetch).mockImplementation(async () => response(unconfigured()));
    await click("Refresh");
    expect(host.textContent).toContain("Live telemetry is not connected");
    const calls = vi.mocked(fetch).mock.calls.length;
    await advance(600000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("aborts on unmount and leaves no refresh scheduled", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
    await mount(connected());
    await advance(60000);
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await advance(600000);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
