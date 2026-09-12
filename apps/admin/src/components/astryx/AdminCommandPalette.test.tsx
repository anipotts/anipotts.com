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

it("does not run delayed opening autofocus after a rapid dismissal", async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const dialog = await open();
  expect(document.activeElement).toBe(dialog.querySelector("input"));
  await act(async () => {
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    outside.focus();
  });
  // Opening frames may run after the close commit while the exit animation
  // keeps the input mounted. They must not reclaim keyboard focus.
  await act(async () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(performance.now()));
  });
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(outside);
});

it("clears a query in one click and returns focus to search", async () => {
  const dialog = await open();
  const input = dialog.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "no matching record");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const clear = [...dialog.querySelectorAll("button")].find(
    (button) => button.textContent === "Clear",
  )!;
  expect(clear).toBeTruthy();
  await act(async () => clear.click());
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
  expect(dialog.querySelector(".astryx-command-palette-footer")).not.toBeNull();
});

it("keeps source failure concise, accessible and retryable", async () => {
  await act(async () =>
    root.render(
      <AdminCommandPalette
        navItems={[]}
        showTrigger={false}
        loadEntries={async () => {
          throw new Error("private failure");
        }}
      />,
    ),
  );
  const dialog = await open();
  expect(
    dialog.querySelector('.admin-palette-error [role="status"]')?.textContent,
  ).toBe("Search unavailable");
  expect(dialog.textContent).not.toContain("private failure");
  expect(
    [...dialog.querySelectorAll("button")].some(
      (button) => button.textContent === "Retry search",
    ),
  ).toBe(true);
  expect(dialog.querySelector(".astryx-command-palette-footer")).not.toBeNull();
});
