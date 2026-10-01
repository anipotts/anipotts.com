// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveStatus, type SaveStatusState } from "./SaveStatus";

describe("draft save status", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("section");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(state: SaveStatusState, describedBy?: string) {
    act(() =>
      root.render(<SaveStatus state={state} describedBy={describedBy} />),
    );
    return container.querySelector<HTMLElement>('[role="status"]')!;
  }

  it.each<[SaveStatusState, string]>([
    ["unchanged", "No changes"],
    ["changed", "Unsaved changes"],
    ["saving", "Saving…"],
    ["saved-locally", "Saved locally"],
    ["saved-privately", "Saved privately"],
    ["save-failed", "Save failed"],
    ["conflict", "Resolve conflict"],
    ["session-expired", "Session expired"],
    ["discarded", "Draft discarded"],
  ])("announces %s in visible words alongside the dot", (state, label) => {
    const status = render(state);
    expect(status.textContent).toBe(label);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    // Persistence evidence stays readable without hovering.
    expect(status.querySelector(".sr-only")).toBeNull();
    const dot = status.querySelector('[role="img"]');
    if (state === "unchanged") expect(dot).toBeNull();
    else expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("button, a")).toBeNull();
  });

  it("shows readable evidence by default and permits an explicitly compact caller", () => {
    act(() => root.render(<SaveStatus state="saved-privately" showLabel />));
    expect(container.querySelector(".sr-only")).toBeNull();
    expect(container.textContent).toBe("Saved privately");
    act(() =>
      root.render(<SaveStatus state="saved-privately" showLabel={false} />),
    );
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      "Saved privately",
    );
  });

  it("replaces an acknowledged save immediately when current contents change or saving fails", () => {
    const original = render("saved-privately");
    expect(original.textContent).toBe("Saved privately");
    const shape = original.getAttribute("style");

    for (const state of [
      "changed",
      "saving",
      "conflict",
      "save-failed",
    ] as const) {
      const current = render(state);
      expect(current).toBe(original);
      expect(current.textContent).not.toMatch(/Saved locally|Saved privately/);
      expect(current.getAttribute("style")).toBe(shape);
    }
  });

  it("never equates local persistence or an unchanged base with a private save or publication", () => {
    for (const state of [
      "unchanged",
      "saved-locally",
      "saved-privately",
    ] as const) {
      const status = render(state);
      expect(status.textContent).not.toMatch(/published|live/i);
      if (state !== "saved-privately")
        expect(status.textContent).not.toContain("privately");
    }
  });

  it("connects a failure to the caller's actual recovery explanation", () => {
    const status = render("session-expired", "session-recovery");
    expect(status.getAttribute("aria-describedby")).toBe("session-recovery");
    expect(render("saved-privately").hasAttribute("aria-describedby")).toBe(
      false,
    );
  });
});
