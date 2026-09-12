// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { HoverCard } from "@astryxdesign/core/HoverCard";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const nativePopover = Object.fromEntries(
  ["showPopover", "hidePopover"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
  ]),
);
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers();
  const open = new WeakSet<HTMLElement>();
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (
    this: HTMLElement,
    selector,
  ) {
    return selector === ":popover-open"
      ? open.has(this)
      : matches.call(this, selector);
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      configurable: true,
      value: function (this: HTMLElement) {
        open.add(this);
      },
    },
    hidePopover: {
      configurable: true,
      value: function (this: HTMLElement) {
        open.delete(this);
      },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  for (const [key, descriptor] of Object.entries(nativePopover)) {
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const hoverFactories = [
  {
    name: "Tooltip",
    render: (onOpenChange: (open: boolean) => void) =>
      React.createElement(Tooltip, {
        content: "Details",
        onOpenChange,
        children: React.createElement("button", {}, "Inspect"),
      }),
  },
  {
    name: "HoverCard",
    render: (onOpenChange: (open: boolean) => void) =>
      React.createElement(HoverCard, {
        content: "Details",
        onOpenChange,
        children: React.createElement("button", {}, "Inspect"),
      }),
  },
];
it.each(hoverFactories)(
  "$name hover entry and exit have no dwell delay",
  ({ render }) => {
    const changed = vi.fn();
    act(() => root.render(render(changed)));
    const button = host.querySelector("button")!;
    act(() => {
      button.dispatchEvent(new MouseEvent("mouseenter"));
      vi.advanceTimersByTime(0);
    });
    expect(changed).toHaveBeenLastCalledWith(true);
    act(() => {
      button.dispatchEvent(new MouseEvent("mouseleave"));
      vi.advanceTimersByTime(0);
    });
    expect(changed).toHaveBeenLastCalledWith(false);
  },
);

it("keeps a tooltip open when the pointer moves directly onto its surface", () => {
  const changed = vi.fn();
  act(() =>
    root.render(
      React.createElement(Tooltip, {
        content: "Details",
        onOpenChange: changed,
        children: React.createElement("button", {}, "Inspect"),
      }),
    ),
  );
  const button = host.querySelector("button")!;
  act(() => {
    button.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(0);
  });
  const layer = document.querySelector('[role="tooltip"]')!;
  act(() => {
    button.dispatchEvent(
      new MouseEvent("mouseleave", { relatedTarget: layer }),
    );
    layer.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, relatedTarget: button }),
    );
    vi.advanceTimersByTime(0);
  });
  expect(changed).toHaveBeenLastCalledWith(true);
  act(() => {
    layer.dispatchEvent(
      new MouseEvent("mouseout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
    vi.advanceTimersByTime(0);
  });
  expect(changed).toHaveBeenLastCalledWith(false);
});

it("preserves an explicitly requested tooltip dwell delay", () => {
  const changed = vi.fn();
  act(() =>
    root.render(
      React.createElement(Tooltip, {
        content: "Details",
        delay: 50,
        onOpenChange: changed,
        children: React.createElement("button", {}, "Inspect"),
      }),
    ),
  );
  act(() => {
    host.querySelector("button")!.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(49);
  });
  expect(changed).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(changed).toHaveBeenLastCalledWith(true);
});
