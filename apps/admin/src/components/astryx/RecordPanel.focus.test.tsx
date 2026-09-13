// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordPanel } from "./RecordPanel";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("nonmodal record panel focus", () => {
  let host: HTMLDivElement;
  let opener: HTMLButtonElement;
  let outside: HTMLInputElement;
  let root: Root;
  const close = vi.fn();
  function render(title = "Properties") {
    act(() =>
      root.render(
        <RecordPanel title={title} onClose={close}>
          <input aria-label="Tags" />
        </RecordPanel>,
      ),
    );
  }
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    opener = document.createElement("button");
    opener.textContent = "Properties";
    outside = document.createElement("input");
    host = document.createElement("div");
    host.dataset.recordWorkspace = "";
    Object.defineProperty(host, "clientWidth", { value: 1100 });
    document.body.append(opener, outside, host);
    opener.focus();
    root = createRoot(host);
  });
  afterEach(async () => {
    act(() => root.unmount());
    await Promise.resolve();
    host.remove();
    opener.remove();
    outside.remove();
    vi.unstubAllGlobals();
  });
  it("focuses the panel heading and the newly selected panel title", () => {
    render();
    expect(document.activeElement).toBe(host.querySelector("h2"));
    const input = host.querySelector("input")!;
    input.focus();
    render("History");
    expect(document.activeElement).toBe(host.querySelector("h2"));
    expect(document.activeElement?.textContent).toBe("History");
  });
  it("restores the opener after focused content is removed", async () => {
    render();
    host.querySelector("input")!.focus();
    act(() => root.render(null));
    await Promise.resolve();
    expect(document.activeElement).toBe(opener);
  });
  it("does not steal focus from another editor when closed", async () => {
    render();
    outside.focus();
    act(() => root.render(null));
    await Promise.resolve();
    expect(document.activeElement).toBe(outside);
  });
  it("does not override a newer focus target during queued restoration", async () => {
    render();
    act(() => root.render(null));
    outside.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(outside);
  });
  it("ignores composing Escape and respects nested control dismissal", () => {
    render();
    const input = host.querySelector("input")!;
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          isComposing: true,
        }),
      ),
    );
    expect(close).not.toHaveBeenCalled();
    const prevent = (event: Event) => event.preventDefault();
    input.addEventListener("keydown", prevent);
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(close).not.toHaveBeenCalled();
    input.removeEventListener("keydown", prevent);
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
