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
    const traces = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "traces",
    )!;
    act(() => traces.click());
    expect(host.textContent).toContain("No measured spans available");
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
});
