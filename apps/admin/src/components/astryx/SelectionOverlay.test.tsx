// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { SelectionOverlay } from "./SelectionOverlay";
vi.mock("@astryxdesign/core/Popover", () => ({
  usePopover: () => ({
    contentRef: { current: null },
    triggerRef: () => {},
    show: () => {},
    render: (children: React.ReactNode) => children,
  }),
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
