// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { AdminCommandPalette } from "./AdminCommandPalette";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let opener: HTMLButtonElement;
let outside: HTMLInputElement;
let root: Root;
beforeEach(async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
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
  vi.stubGlobal("scrollTo", () => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  host = document.createElement("div");
  opener = document.createElement("button");
  outside = document.createElement("input");
  document.body.append(opener, outside, host);
  root = createRoot(host);
  await act(async () =>
    root.render(<AdminCommandPalette navItems={[]} showTrigger={false} />),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  outside.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  opener.focus();
  await act(async () =>
    document.dispatchEvent(new CustomEvent("admin:search")),
  );
  const dialog = document.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  return dialog;
}
it("restores the keyboard opener after Escape using the mounted Astryx dialog", async () => {
  const dialog = await open();
  const input = dialog.querySelector("input")!;
  input.focus();
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(opener);
});
it("keeps deliberately moved outside focus when a backdrop dismissal closes the dialog", async () => {
  const dialog = await open();
  outside.focus();
  await act(async () =>
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(outside);
});
it("keeps outside focus on native cancel and ignores composing Escape", async () => {
  const dialog = await open();
  const input = dialog.querySelector("input")!;
  input.focus();
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(dialog.open).toBe(true);
  outside.focus();
  await act(async () =>
    dialog.dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(outside);
});

it("does not replace a newer outside focus target during the close commit", async () => {
  const dialog = await open();
  const newer = document.createElement("input");
  document.body.append(newer);
  outside.focus();
  await act(async () => {
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    newer.focus();
  });
  expect(document.activeElement).toBe(newer);
  newer.remove();
});
