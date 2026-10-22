// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordPanel } from "../astryx/RecordPanel";
import { AdminPortalScope, AdminUIProvider } from "./AdminUI";
import { Selector } from "../astryx/WritingControls";

let host: HTMLDivElement;
let unrelated: HTMLDivElement;
let root: Root;
const close = vi.fn();
const change = vi.fn();

function Choice() {
  const [value, setValue] = useState("repository");
  return (
    <Selector
      label="Link type"
      value={value}
      onChange={(next) => {
        change(next);
        setValue(String(next));
      }}
      options={[
        { value: "repository", label: "Repository" },
        { value: "demo", label: "Demo" },
      ]}
    />
  );
}
function show(children: React.ReactNode) {
  act(() =>
    root.render(
      <AdminUIProvider enabled mode="dark">
        {children}
      </AdminUIProvider>,
    ),
  );
}
function sheet(width = 390) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  show(
    <RecordPanel title="Properties" onClose={close}>
      <input aria-label="Link label" />
      <Choice />
    </RecordPanel>,
  );
}
async function open() {
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[role="combobox"]',
  )!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  const menu = document.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(menu).not.toBeNull();
  return { trigger, menu };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  );
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  close.mockClear();
  change.mockClear();
  host = document.createElement("div");
  unrelated = document.createElement("div");
  unrelated.textContent = "Unrelated portal";
  document.body.append(host, unrelated);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  unrelated.remove();
  vi.unstubAllGlobals();
});

describe("Core selectors in native modal owners", () => {
  it.each([390, 900])(
    "keeps keyboard focus and selection inside Properties at %ipx",
    async (width) => {
      sheet(width);
      const { trigger, menu } = await open();
      const dialog = host.querySelector("dialog")!;
      expect(menu.closest("dialog")).toBe(dialog);
      expect(menu.closest('[data-theme="dark"]')).not.toBeNull();
      expect(menu.contains(document.activeElement)).toBe(true);
      const demo = [
        ...menu.querySelectorAll<HTMLElement>('[role="option"]'),
      ].find((item) => item.textContent === "Demo")!;
      await act(async () => demo.click());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(change).toHaveBeenCalledWith("demo");
      expect(trigger.textContent).toBe("Demo");
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(close).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);
      expect(unrelated.parentElement).toBe(document.body);
      expect(unrelated.dataset.adminUi).toBeUndefined();
    },
  );

  it.each([390, 900])(
    "closes only the menu on Escape and returns focus at %ipx",
    async (width) => {
      sheet(width);
      const { trigger, menu } = await open();
      await act(async () =>
        menu.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(close).not.toHaveBeenCalled();
      expect(host.querySelector("dialog")?.open).toBe(true);
      expect(document.activeElement).toBe(trigger);
    },
  );

  it.each([390, 900])(
    "preserves outside-pointer dismissal without closing Properties at %ipx",
    async (width) => {
      sheet(width);
      await open();
      // Allow the opened layer to install its outside-pointer dismissal.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      await act(async () =>
        host
          .querySelector("input")!
          .dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
          ),
      );
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(close).not.toHaveBeenCalled();
    },
  );

  it("uses the nearest owning dialog and restores roots before complete unmount", async () => {
    show(
      <dialog open aria-label="Outer">
        <AdminPortalScope>
          <dialog open aria-label="Inner">
            <AdminPortalScope>
              <Choice />
            </AdminPortalScope>
          </dialog>
        </AdminPortalScope>
      </dialog>,
    );
    const { menu } = await open();
    expect(menu.closest("dialog")?.getAttribute("aria-label")).toBe("Inner");
    // Removing the whole owner models an auth lock, not just a menu selection.
    expect(() => act(() => root.render(null))).not.toThrow();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(unrelated.isConnected).toBe(true);
    expect(document.body.querySelector('[data-admin-ui="core"]')).toBeNull();
  });

  it("leaves nonmodal body portals outside unrelated dialogs", async () => {
    show(
      <>
        <dialog open aria-label="Unrelated" />
        <Choice />
      </>,
    );
    const { menu } = await open();
    expect(menu.closest("dialog")).toBeNull();
    expect(unrelated.isConnected).toBe(true);
  });

  it("restores an owned portal to its original sibling position on scope removal", () => {
    const owned = document.createElement("div");
    document.body.insertBefore(owned, unrelated);
    const view = (visible: boolean) => (
      <dialog open>
        <AdminPortalScope>
          {visible &&
            createPortal(
              <AdminPortalScope portalContent>
                <span>Owned menu</span>
              </AdminPortalScope>,
              owned,
            )}
        </AdminPortalScope>
      </dialog>
    );
    show(view(false));
    show(view(true));
    expect(owned.closest("dialog")).not.toBeNull();
    act(() => root.render(null));
    expect(owned.parentElement).toBe(document.body);
    expect(owned.nextSibling).toBe(unrelated);
    expect(owned.childNodes).toHaveLength(0);
    owned.remove();
  });
});
