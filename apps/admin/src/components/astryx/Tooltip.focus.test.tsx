// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTooltip } from "@astryxdesign/core/Tooltip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function FocusTooltip() {
  const tooltip = useTooltip();
  return (
    <>
      <button ref={tooltip.ref}>Workspace</button>
      {tooltip.renderTooltip("Switch workspace")}
    </>
  );
}
describe("tooltip focus during native popover dismissal", () => {
  let host: HTMLDivElement;
  let root: Root;
  let inNativeDismissal: boolean;
  let shows: ReturnType<typeof vi.fn>;
  let mounted: boolean;
  beforeEach(() => {
    vi.useFakeTimers();
    inNativeDismissal = false;
    shows = vi.fn(() => {
      if (inNativeDismissal)
        throw new DOMException("Nested popover operation", "InvalidStateError");
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: shows,
    });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: vi.fn(),
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    mounted = true;
    act(() => root.render(<FocusTooltip />));
    const button = host.querySelector("button")!;
    const matches = button.matches.bind(button);
    vi.spyOn(button, "matches").mockImplementation(
      (selector) => selector === ":focus-visible" || matches(selector),
    );
  });
  afterEach(() => {
    if (mounted) act(() => root.unmount());
    host.remove();
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  function restoreFocus() {
    inNativeDismissal = true;
    act(() => host.querySelector("button")!.focus());
    expect(shows).not.toHaveBeenCalled();
    inNativeDismissal = false;
  }
  it("waits until the native dismissal finishes and retains restored focus", () => {
    restoreFocus();
    expect(document.activeElement).toBe(host.querySelector("button"));
    act(() => vi.runOnlyPendingTimers());
    expect(shows).toHaveBeenCalledTimes(1);
  });
  it("cancels a pending focus tooltip when focus leaves", () => {
    restoreFocus();
    act(() => host.querySelector("button")!.blur());
    act(() => vi.runOnlyPendingTimers());
    expect(shows).not.toHaveBeenCalled();
  });
  it("cancels a pending focus tooltip on disposal", () => {
    restoreFocus();
    act(() => root.unmount());
    mounted = false;
    act(() => vi.runOnlyPendingTimers());
    expect(shows).not.toHaveBeenCalled();
  });
  it("does not reopen a queued tooltip after Escape", () => {
    restoreFocus();
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    act(() => vi.runOnlyPendingTimers());
    expect(shows).not.toHaveBeenCalled();
  });
});
