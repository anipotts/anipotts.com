// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DevProjectWorkspace } from "./dev-project-workspace";
import { AdminUIProvider } from "./AdminUI";

it("keeps project catalog edits unacknowledged until explicit simulated save and preserves them on failure without API calls", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  const fetch = vi.fn(() => {
    throw new Error("catalog_must_not_call_api");
  });
  vi.stubGlobal("fetch", fetch);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = (label: string) => {
    const control = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (item) =>
        item.textContent === label || item.getAttribute("aria-label") === label,
    )!;
    expect(control, label).toBeDefined();
    act(() => control.click());
  };
  try {
    act(() =>
      root.render(
        <AdminUIProvider enabled>
          <DevProjectWorkspace />
        </AdminUIProvider>,
      ),
    );
    const label = [...host.querySelectorAll("label")].find(
      (item) => item.textContent === "Role",
    )!;
    const input = host.querySelector<HTMLInputElement>(
      `[id="${label.htmlFor}"]`,
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "Engineering");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "not acknowledged",
    );
    click("Simulate project save");
    expect(input.disabled).toBe(true);
    click("Fail project save");
    expect(input.value).toBe("Engineering");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Edits kept",
    );
    expect(host.querySelector('[role="status"]')?.textContent).not.toContain(
      "revision 2",
    );
    click("Simulate project save");
    click("Acknowledge project save");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "revision 2",
    );
    expect(fetch).not.toHaveBeenCalled();
    for (const upload of host.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    ))
      expect(upload.disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
