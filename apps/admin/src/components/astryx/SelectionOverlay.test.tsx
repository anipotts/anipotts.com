// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { SelectionOverlay } from "./SelectionOverlay";
const popoverMock = vi.hoisted(() => ({
  onHide: () => {},
  contentRef: { current: null as HTMLElement | null },
}));
vi.mock("@astryxdesign/core/Popover", () => ({
  usePopover: (options: { onHide: () => void }) => {
    popoverMock.onHide = options.onHide;
    return {
      contentRef: popoverMock.contentRef,
      triggerRef: () => {},
      show: () => {},
      render: (children: React.ReactNode) => children,
    };
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("does not apply a link during IME composition, and submits once after composition ends", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const apply = vi.fn();
  const editor = {
    isDestroyed: false,
    view: { coordsAtPos: () => ({ left: 20, bottom: 20 }) },
    state: { selection: { from: 1 } },
  } as unknown as Editor;
  act(() =>
    root.render(
      <SelectionOverlay
        editor={editor}
        enabled
        onClose={() => {}}
        onApply={apply}
      >
        <input />
      </SelectionOverlay>,
    ),
  );
  const input = host.querySelector("input")!;
  const form = host.querySelector("form")!;
  act(() => {
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(apply).not.toHaveBeenCalled();
  act(() => {
    input.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(apply).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  host.remove();
});

it.each(["inside", "outside", "destroyed"] as const)(
  "dismissal respects %s focus ownership",
  (target) => {
    const host = document.createElement("div");
    const outside = document.createElement("button");
    document.body.append(host, outside);
    const root = createRoot(host);
    const focus = vi.fn();
    const close = vi.fn();
    const editor = {
      isDestroyed: false,
      commands: { focus },
      view: { coordsAtPos: () => ({ left: 20, bottom: 20 }) },
      state: { selection: { from: 1 } },
    } as unknown as Editor;
    act(() =>
      root.render(
        <SelectionOverlay
          editor={editor}
          enabled
          onClose={close}
          onApply={() => {}}
        >
          <input />
        </SelectionOverlay>,
      ),
    );
    popoverMock.contentRef.current = host;
    if (target === "outside") outside.focus();
    else host.querySelector("input")!.focus();
    if (target === "destroyed")
      Object.defineProperty(editor, "isDestroyed", { value: true });
    act(() => popoverMock.onHide());
    expect(close).toHaveBeenCalledOnce();
    if (target === "inside")
      expect(focus).toHaveBeenCalledExactlyOnceWith(undefined, {
        scrollIntoView: false,
      });
    else expect(focus).not.toHaveBeenCalled();
    if (target === "outside") expect(document.activeElement).toBe(outside);
    act(() => root.unmount());
    popoverMock.contentRef.current = null;
    host.remove();
    outside.remove();
  },
);
